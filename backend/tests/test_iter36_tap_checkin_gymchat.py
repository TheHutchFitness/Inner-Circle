"""Iteration 36 backend tests — simple tap check-in + per-gym chat rooms.

Covers:
- POST /api/gyms/check-in (no lat/lng): first tap gives +150 base and streak bonus.
- Duplicate same-day same-gym returns {already:true, xp_awarded:0}.
- GET /api/gyms/checkins returns streak/best_streak/total/today_gym_ids.
- GET /api/gyms/mine returns id + checked_in_today per gym.
- Per-gym chat: GET/POST /api/chat/gym/messages?gym=<name> for a member's gym.
- Non-member gym chat post returns 403.
- Pin (GET/POST /api/chat/gym/pin?gym=) and clear (POST /api/chat/gym/clear?gym=) accept ?gym.
- Existing rooms main/the_room/group:<id> still work.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "the9hutch@gmail.com"
OWNER_PASSWORD = "Hutch-TWVmifIRhU6u8bBl"


def _login(email: str, password: str):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text[:200]}"
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok, f"no token in login for {email}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER_EMAIL, OWNER_PASSWORD)


@pytest.fixture(scope="module")
def bot_token():
    # bot2 has an inperson_gym (via seed) — use it as member
    return _login("bot2@circle.ai", "BotPass123!")


@pytest.fixture(scope="module")
def bot_other():
    return _login("bot3@circle.ai", "BotPass123!")


# -----------------------------------------------------------------------------
# Simple tap check-in
# -----------------------------------------------------------------------------
class TestTapCheckIn:
    def test_check_in_no_location_awards_xp(self, bot_token):
        # Pick a temp gym name so we don't collide with real data. Add it first.
        gym = f"TEST_TapGym_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/gyms/mine", headers=_h(bot_token), json={"name": gym}, timeout=15)
        assert r.status_code == 200, r.text[:200]

        # First check-in — no lat/lng
        r = requests.post(f"{API}/gyms/check-in", headers=_h(bot_token), json={"gym": gym}, timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data.get("ok") is True
        assert data.get("already") in (None, False)
        assert data.get("xp_awarded", 0) >= 150, f"xp_awarded should be >=150, got {data}"
        assert data.get("base_xp") == 150
        assert data.get("streak", 0) >= 1
        first_streak = data["streak"]

        # Duplicate same-day same-gym → already
        r2 = requests.post(f"{API}/gyms/check-in", headers=_h(bot_token), json={"gym": gym}, timeout=15)
        assert r2.status_code == 200, r2.text[:200]
        d2 = r2.json()
        assert d2.get("already") is True
        assert d2.get("xp_awarded", 999) == 0
        assert d2.get("streak") == first_streak

        # Cleanup: remove gym membership
        requests.delete(f"{API}/gyms/mine", headers=_h(bot_token), params={"name": gym}, timeout=15)

    def test_checkins_status_shape(self, bot_token):
        r = requests.get(f"{API}/gyms/checkins", headers=_h(bot_token), timeout=15)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in ("today_gym_ids", "total", "streak", "best_streak"):
            assert k in d, f"missing key {k} in {d}"
        assert isinstance(d["today_gym_ids"], list)
        assert isinstance(d["total"], int)
        assert isinstance(d["streak"], int)
        assert isinstance(d["best_streak"], int)

    def test_check_in_missing_gym_returns_400(self, bot_token):
        r = requests.post(f"{API}/gyms/check-in", headers=_h(bot_token), json={}, timeout=15)
        assert r.status_code == 400, r.text[:200]


# -----------------------------------------------------------------------------
# /api/gyms/mine returns id + checked_in_today
# -----------------------------------------------------------------------------
class TestGymsMinePayload:
    def test_mine_has_id_and_checked_flag(self, bot_token):
        gym = f"TEST_MineGym_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/gyms/mine", headers=_h(bot_token), json={"name": gym}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "gyms" in data and isinstance(data["gyms"], list)
        row = next((g for g in data["gyms"] if g["name"].lower() == gym.lower()), None)
        assert row is not None, f"added gym not present: {data}"
        assert "id" in row and row["id"], "gym row missing id"
        assert "checked_in_today" in row and row["checked_in_today"] is False

        # After check-in, flag flips true
        requests.post(f"{API}/gyms/check-in", headers=_h(bot_token), json={"gym": gym}, timeout=15)
        r2 = requests.get(f"{API}/gyms/mine", headers=_h(bot_token), timeout=15)
        d2 = r2.json()
        row2 = next((g for g in d2["gyms"] if g["name"].lower() == gym.lower()), None)
        assert row2 is not None
        assert row2["checked_in_today"] is True

        # Cleanup
        requests.delete(f"{API}/gyms/mine", headers=_h(bot_token), params={"name": gym}, timeout=15)


# -----------------------------------------------------------------------------
# Per-gym chat rooms
# -----------------------------------------------------------------------------
class TestPerGymChat:
    def test_post_and_get_specific_gym(self, bot_token):
        gym = f"TEST_ChatGym_{uuid.uuid4().hex[:6]}"
        requests.post(f"{API}/gyms/mine", headers=_h(bot_token), json={"name": gym}, timeout=15)

        marker = f"iter36-chat-{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{API}/chat/gym/messages",
            headers=_h(bot_token),
            params={"gym": gym},
            json={"text": marker},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        posted = r.json()
        assert posted.get("text") == marker
        assert posted.get("room", "").startswith("gym:"), f"room key wrong: {posted.get('room')}"
        assert posted["room"].split(":", 1)[1] == gym.lower()

        # GET the room
        r2 = requests.get(f"{API}/chat/gym/messages", headers=_h(bot_token), params={"gym": gym}, timeout=15)
        assert r2.status_code == 200
        msgs = r2.json()
        assert any(m.get("text") == marker for m in msgs), "posted message not visible in GET"

        # Cleanup: admin clear
        requests.delete(f"{API}/gyms/mine", headers=_h(bot_token), params={"name": gym}, timeout=15)

    def test_non_member_post_forbidden(self, bot_token, bot_other):
        gym = f"TEST_ChatBlock_{uuid.uuid4().hex[:6]}"
        # bot_token is a member; bot_other is NOT.
        requests.post(f"{API}/gyms/mine", headers=_h(bot_token), json={"name": gym}, timeout=15)

        # bot_other tries to post to that gym's room
        r = requests.post(
            f"{API}/chat/gym/messages",
            headers=_h(bot_other),
            params={"gym": gym},
            json={"text": "should be blocked"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

        # Cleanup
        requests.delete(f"{API}/gyms/mine", headers=_h(bot_token), params={"name": gym}, timeout=15)

    def test_pin_and_clear_accept_gym_param(self, owner_token):
        # Owner is admin. Owner must be a member of the gym to resolve the room.
        gym = f"TEST_PinClear_{uuid.uuid4().hex[:6]}"
        requests.post(f"{API}/gyms/mine", headers=_h(owner_token), json={"name": gym}, timeout=15)

        # Post a message to have something to clear
        requests.post(
            f"{API}/chat/gym/messages",
            headers=_h(owner_token),
            params={"gym": gym},
            json={"text": "pin me"},
            timeout=15,
        )

        # Set pin
        r = requests.post(
            f"{API}/chat/gym/pin",
            headers=_h(owner_token),
            params={"gym": gym},
            json={"text": "PINNED_IT36"},
            timeout=15,
        )
        assert r.status_code == 200, r.text[:200]
        assert (r.json().get("pin") or {}).get("text") == "PINNED_IT36"

        # Get pin
        r2 = requests.get(f"{API}/chat/gym/pin", headers=_h(owner_token), params={"gym": gym}, timeout=15)
        assert r2.status_code == 200
        assert (r2.json().get("pin") or {}).get("text") == "PINNED_IT36"

        # Clear room (admin only)
        r3 = requests.post(f"{API}/chat/gym/clear", headers=_h(owner_token), params={"gym": gym}, timeout=15)
        assert r3.status_code == 200, r3.text[:200]
        assert "deleted" in r3.json()

        # Unpin (empty text)
        requests.post(f"{API}/chat/gym/pin", headers=_h(owner_token), params={"gym": gym},
                      json={"text": ""}, timeout=15)

        # Cleanup
        requests.delete(f"{API}/gyms/mine", headers=_h(owner_token), params={"name": gym}, timeout=15)

    def test_default_gym_when_no_param(self, bot_token):
        # Should default to member's primary/first gym if ?gym is omitted.
        # Ensure a gym exists first (bot state may have been cleaned).
        gym = f"TEST_DefGym_{uuid.uuid4().hex[:6]}"
        requests.post(f"{API}/gyms/mine", headers=_h(bot_token), json={"name": gym}, timeout=15)
        try:
            r = requests.get(f"{API}/chat/gym/messages", headers=_h(bot_token), timeout=15)
            assert r.status_code == 200, r.text[:200]
        finally:
            requests.delete(f"{API}/gyms/mine", headers=_h(bot_token), params={"name": gym}, timeout=15)


# -----------------------------------------------------------------------------
# Existing rooms still work
# -----------------------------------------------------------------------------
class TestExistingRoomsUnchanged:
    def test_main_room_still_works(self, bot_token):
        r = requests.get(f"{API}/chat/main/messages", headers=_h(bot_token), timeout=15)
        assert r.status_code == 200, r.text[:200]
        assert isinstance(r.json(), list)

    def test_the_room_gate_owner(self, owner_token):
        # Owner has all_rooms_access → 200
        r = requests.get(f"{API}/chat/the_room/messages", headers=_h(owner_token), timeout=15)
        assert r.status_code == 200, r.text[:200]
