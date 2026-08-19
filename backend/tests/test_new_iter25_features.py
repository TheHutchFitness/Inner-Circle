"""Iteration 25 backend tests — 4 new features:
   1) Compound-lift leaderboards (squat/bench/deadlift)
   2) Gym group chat (room=gym) — scoping and gating
   3) In-person session reschedule
   4) In-person admin unread + clients pending_requests counts
   Plus regression checks for existing leaderboards, chat rooms, and booking
   request/approve flows."""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "the9hutch@gmail.com", "password": "Hutch-TWVmifIRhU6u8bBl"}
CLIENT_WITH_GYM = {"email": "bot2@circle.ai", "password": "BotPass123!"}
CLIENT_NO_GYM = {"email": "bot4@circle.ai", "password": "BotPass123!"}


def _login(payload):
    r = requests.post(f"{API}/auth/login", json=payload, timeout=30)
    assert r.status_code == 200, f"Login failed for {payload['email']}: {r.status_code} {r.text[:200]}"
    return r.json()["session_token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def client_gym_token():
    return _login(CLIENT_WITH_GYM)


@pytest.fixture(scope="module")
def client_nogym_token():
    return _login(CLIENT_NO_GYM)


# ---------------- LEADERBOARDS ----------------
class TestCompoundLeaderboards:
    @pytest.mark.parametrize("board", ["squat", "bench", "deadlift"])
    def test_board_ok_sorted_and_label(self, admin_token, board):
        r = requests.get(f"{API}/leaderboard/{board}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:200]
        rows = r.json()
        assert isinstance(rows, list)
        # label
        for u in rows:
            assert u["metric_label"] == f"{board.upper()} (lb)"
            assert u["metric"] > 0  # only members with PR > 0
        # sorted desc
        metrics = [u["metric"] for u in rows]
        assert metrics == sorted(metrics, reverse=True)

    def test_regression_xp_strength_ratio_season(self, admin_token):
        for b in ("xp", "strength", "ratio", "season"):
            r = requests.get(f"{API}/leaderboard/{b}", headers=_hdr(admin_token), timeout=30)
            assert r.status_code == 200, f"{b}: {r.text[:200]}"
            assert isinstance(r.json(), list)


# ---------------- GYM GROUP CHAT ----------------
class TestGymGroupChat:
    def test_get_gym_without_gym_403(self, client_nogym_token):
        r = requests.get(f"{API}/chat/gym/messages", headers=_hdr(client_nogym_token), timeout=30)
        assert r.status_code == 403
        assert "gym" in r.text.lower()

    def test_post_gym_without_gym_403(self, client_nogym_token):
        r = requests.post(f"{API}/chat/gym/messages", headers=_hdr(client_nogym_token),
                          json={"text": "hello"}, timeout=30)
        assert r.status_code == 403

    def test_post_and_get_gym_with_gym_ok(self, client_gym_token):
        stamp = f"TEST_gymchat_{int(time.time())}"
        r = requests.post(f"{API}/chat/gym/messages", headers=_hdr(client_gym_token),
                          json={"text": stamp}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        msg = r.json()
        assert msg["text"] == stamp
        # Get should include it
        r2 = requests.get(f"{API}/chat/gym/messages", headers=_hdr(client_gym_token), timeout=30)
        assert r2.status_code == 200
        texts = [m["text"] for m in r2.json()]
        assert stamp in texts

    def test_gym_scoped_isolation(self, admin_token, client_gym_token):
        """Admin (owner) with no inperson_gym set should NOT see bot2's gym messages
        even if they set a different gym. We approximate by: after admin sets a
        different gym via PATCH profile, admin's /chat/gym returns 200 with no
        message equal to the bot2 stamp. Then reset."""
        # Save current admin gym
        me = requests.get(f"{API}/auth/me", headers=_hdr(admin_token), timeout=30).json()
        original_gym = me.get("inperson_gym") or ""
        stamp = f"TEST_gymiso_{int(time.time())}"
        # bot2 posts to their gym (Iron Church)
        requests.post(f"{API}/chat/gym/messages", headers=_hdr(client_gym_token),
                      json={"text": stamp}, timeout=30)
        # admin sets a different gym
        requests.patch(f"{API}/profile/update", headers=_hdr(admin_token),
                       json={"gym": "TEST_Other_Gym_9x"}, timeout=30)
        try:
            r = requests.get(f"{API}/chat/gym/messages", headers=_hdr(admin_token), timeout=30)
            assert r.status_code == 200
            texts = [m["text"] for m in r.json()]
            assert stamp not in texts, "Cross-gym isolation FAILED - admin sees bot2's Iron Church message"
        finally:
            requests.patch(f"{API}/profile/update", headers=_hdr(admin_token),
                           json={"gym": original_gym}, timeout=30)

    def test_regression_main_and_the_room(self, admin_token):
        # main chat should be accessible to admin
        r = requests.get(f"{API}/chat/main/messages", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        # the_room accessible for admin (all_rooms_access)
        r2 = requests.get(f"{API}/chat/the_room/messages", headers=_hdr(admin_token), timeout=30)
        assert r2.status_code == 200


# ---------------- RESCHEDULE + PENDING_REQUESTS ----------------
class TestReschedule:
    @pytest.fixture(scope="class")
    def approved_booking(self, admin_token, client_gym_token):
        """Create a new booking as client, approve as admin -> returns booking id."""
        payload = {"date": "2026-11-20", "time": "10:00", "note": "TEST_reschedule",
                   "tz_offset_minutes": 0}
        r = requests.post(f"{API}/inperson/booking/request",
                          headers=_hdr(client_gym_token), json=payload, timeout=30)
        assert r.status_code == 200, r.text[:200]
        bid = r.json()["id"]
        r2 = requests.post(f"{API}/inperson/booking/{bid}/approve",
                           headers=_hdr(admin_token), timeout=30)
        assert r2.status_code == 200, r2.text[:200]
        assert r2.json()["status"] == "approved"
        return bid

    def test_reschedule_flips_to_pending(self, client_gym_token, approved_booking):
        bid = approved_booking
        r = requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                          headers=_hdr(client_gym_token),
                          json={"date": "2026-11-25", "time": "14:30",
                                "note": "later", "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body["status"] == "pending"
        assert body["date"] == "2026-11-25"
        assert body["time"] == "14:30"

    def test_reschedule_invalid_date(self, client_gym_token, approved_booking):
        r = requests.post(f"{API}/inperson/booking/{approved_booking}/reschedule",
                          headers=_hdr(client_gym_token),
                          json={"date": "bad", "time": "10:00", "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 400

    def test_reschedule_invalid_time(self, client_gym_token, approved_booking):
        r = requests.post(f"{API}/inperson/booking/{approved_booking}/reschedule",
                          headers=_hdr(client_gym_token),
                          json={"date": "2026-12-10", "time": "25:99", "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 400

    def test_reschedule_by_non_owner_forbidden(self, client_nogym_token, approved_booking):
        r = requests.post(f"{API}/inperson/booking/{approved_booking}/reschedule",
                          headers=_hdr(client_nogym_token),
                          json={"date": "2026-12-10", "time": "10:00", "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 403

    def test_admin_can_reschedule(self, admin_token, approved_booking):
        r = requests.post(f"{API}/inperson/booking/{approved_booking}/reschedule",
                          headers=_hdr(admin_token),
                          json={"date": "2026-12-01", "time": "09:00", "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"


class TestAdminUnreadAndClients:
    def test_unread_includes_pending_requests(self, admin_token, client_gym_token):
        # Ensure at least one pending exists
        requests.post(f"{API}/inperson/booking/request",
                      headers=_hdr(client_gym_token),
                      json={"date": "2026-11-30", "time": "11:00",
                            "note": "TEST_pending", "tz_offset_minutes": 0}, timeout=30)
        r = requests.get(f"{API}/inperson/unread", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "admin"
        assert "pending_requests" in body
        assert isinstance(body["pending_requests"], int)
        assert body["pending_requests"] >= 1

    def test_clients_list_has_pending_requests_per_client(self, admin_token):
        r = requests.get(f"{API}/inperson/clients", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        for c in rows:
            assert "pending_requests" in c, f"missing pending_requests on client {c.get('user_id')}"
        # bot2 should have >=1 pending given prior tests
        bot2 = next((c for c in rows if c.get("display_name")), None)
        # Just ensure at least one client has pending_requests>=1
        assert any(c.get("pending_requests", 0) >= 1 for c in rows)

    def test_client_unread_no_pending_field_but_present(self, client_gym_token):
        r = requests.get(f"{API}/inperson/unread", headers=_hdr(client_gym_token), timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "client"
        assert body.get("pending_requests") == 0
