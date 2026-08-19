"""
Tests for iteration_18 new features:
- Referral Perks (POST /auth/register with referral_code, GET /referral)
- Founder Spotlight (GET /users/{id}/public, GET /founders, GET /founders/spots)
- Creator badge (PATCH /profile/update social_tiktok, /founders creators[], public is_creator)
- Regression: bot login, /auth/me, /leaderboard/xp, /founders
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"


def _fresh_email(prefix: str = "inviter") -> str:
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@circle.ai"


def _register(email: str, display: str, referral_code: str | None = None):
    payload = {"email": email, "password": "TestPass123!", "display_name": display}
    if referral_code is not None:
        payload["referral_code"] = referral_code
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    return r


def _hdr(tok: str):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def inviter():
    r = _register(_fresh_email("inviter"), "TEST Inviter")
    assert r.status_code == 200, f"register inviter failed: {r.status_code} {r.text}"
    data = r.json()
    return {"token": data["session_token"], "user": data["user"]}


class TestReferralFlow:
    def test_1_register_inviter_ok(self, inviter):
        assert inviter["user"]["xp"] == 0
        assert inviter["user"].get("referral_code", "").startswith("HIC")

    def test_2_referral_info_initial(self, inviter):
        r = requests.get(f"{API}/referral", headers=_hdr(inviter["token"]), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["code"].startswith("HIC")
        assert d["count"] == 0
        assert d["referrer_xp"] == 100
        assert d["referred_xp"] == 50
        assert d["badge_at"] == 3
        assert d["to_badge"] == 3
        assert d["has_badge"] is False

    def test_3_three_referred_signups_get_50xp(self, inviter):
        code = inviter["user"]["referral_code"]
        tokens = []
        for i in range(3):
            r = _register(_fresh_email(f"friend{i}"), f"TEST Friend {i}", referral_code=code)
            assert r.status_code == 200, r.text
            d = r.json()
            # The user object returned in /register comes BEFORE apply_referral? Let's re-check via /auth/me
            tokens.append(d["session_token"])
        # Verify each got 50 XP
        for tok in tokens:
            me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
            assert me.status_code == 200
            assert me.json()["xp"] == 50, f"friend xp not 50: {me.json().get('xp')}"

    def test_4_inviter_count_and_badge(self, inviter):
        r = requests.get(f"{API}/referral", headers=_hdr(inviter["token"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["count"] == 3, f"count should be 3, got {d['count']}"
        assert d["has_badge"] is True
        assert len(d["recruits"]) == 3

    def test_5_inviter_me_xp_and_recruiter_badge(self, inviter):
        r = requests.get(f"{API}/auth/me", headers=_hdr(inviter["token"]), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["xp"] == 300, f"inviter xp should be 300, got {d['xp']}"
        assert "recruiter" in (d.get("badges") or [])

    def test_6_invalid_code_signup(self, inviter):
        r = _register(_fresh_email("baduser"), "TEST BadCode", referral_code="INVALIDXXX")
        assert r.status_code == 200
        tok = r.json()["session_token"]
        me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
        assert me.status_code == 200
        assert me.json()["xp"] == 0
        # Inviter count unchanged
        info = requests.get(f"{API}/referral", headers=_hdr(inviter["token"]), timeout=15).json()
        assert info["count"] == 3

    def test_7_self_referral_no_effect(self):
        # Register a fresh user, note their referral_code, try to register another user
        # with that code (fine) and confirm self-refer doesn't apply if same account somehow.
        # Since self-refer requires being the same user_id, we simulate: apply_referral
        # bails on referrer.user_id == new_user.user_id. Test: register user2 with user1's code
        # then verify user1 cannot re-trigger by re-hitting register with own code (same email fails).
        e = _fresh_email("solo")
        r1 = _register(e, "TEST Solo")
        assert r1.status_code == 200
        code = r1.json()["user"]["referral_code"]
        # Trying to register again with same email fails
        r2 = _register(e, "TEST Solo Again", referral_code=code)
        assert r2.status_code == 400  # dup email
        # confirm count still 0 for user1
        tok = r1.json()["session_token"]
        d = requests.get(f"{API}/referral", headers=_hdr(tok), timeout=15).json()
        assert d["count"] == 0


class TestFounderSpotlight:
    def test_public_founder_flag(self):
        r = _register(_fresh_email("founder"), "TEST Founder Spot")
        assert r.status_code == 200
        data = r.json()
        uid = data["user"]["user_id"]
        tok = data["session_token"]
        pub = requests.get(f"{API}/users/{uid}/public", headers=_hdr(tok), timeout=15)
        assert pub.status_code == 200
        j = pub.json()
        assert j["is_founder"] is True
        assert isinstance(j["founder_number"], int)
        assert j["founder_number"] >= 1

    def test_founders_endpoint_me_and_creators_key(self):
        r = _register(_fresh_email("founder2"), "TEST Founder2")
        tok = r.json()["session_token"]
        f = requests.get(f"{API}/founders", headers=_hdr(tok), timeout=15)
        assert f.status_code == 200
        d = f.json()
        assert d["me"]["is_founder"] is True
        assert isinstance(d["me"]["number"], int)
        # founders rows include is_creator boolean
        assert len(d["founders"]) >= 1
        assert "is_creator" in d["founders"][0]
        assert isinstance(d["founders"][0]["is_creator"], bool)


class TestCreatorBadge:
    def test_creator_flow(self):
        r = _register(_fresh_email("creator"), "TEST Creator")
        tok = r.json()["session_token"]
        uid = r.json()["user"]["user_id"]
        # Initially not a creator
        pub = requests.get(f"{API}/users/{uid}/public", headers=_hdr(tok), timeout=15).json()
        assert pub["is_creator"] is False
        # Attach TikTok handle
        upd = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                             json={"social_tiktok": "iron_creator"}, timeout=15)
        assert upd.status_code == 200
        assert upd.json().get("social_tiktok") == "iron_creator"
        # Now public shows is_creator=true
        pub2 = requests.get(f"{API}/users/{uid}/public", headers=_hdr(tok), timeout=15).json()
        assert pub2["is_creator"] is True
        assert pub2["social_tiktok"] == "iron_creator"
        # /founders creators[] contains this user
        f = requests.get(f"{API}/founders", headers=_hdr(tok), timeout=15).json()
        creator_ids = [c["user_id"] for c in f.get("creators", [])]
        assert uid in creator_ids
        # A newly registered user with NO socials must NOT appear in creators[]
        nr = _register(_fresh_email("nocsoc"), "TEST NoSoc")
        nid = nr.json()["user"]["user_id"]
        ntok = nr.json()["session_token"]
        f2 = requests.get(f"{API}/founders", headers=_hdr(ntok), timeout=15).json()
        creator_ids2 = [c["user_id"] for c in f2.get("creators", [])]
        assert nid not in creator_ids2
        pub3 = requests.get(f"{API}/users/{nid}/public", headers=_hdr(ntok), timeout=15).json()
        assert pub3["is_creator"] is False


class TestFoundersSpotsPublic:
    def test_no_auth(self):
        r = requests.get(f"{API}/founders/spots", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 100
        assert isinstance(d["taken"], int)
        assert isinstance(d["remaining"], int)
        assert d["taken"] + d["remaining"] == 100


class TestRegression:
    def test_bot_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": "bot1@circle.ai", "password": "BotPass123!"}, timeout=15)
        assert r.status_code == 200, r.text
        tok = r.json()["session_token"]
        me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
        assert me.status_code == 200

    def test_leaderboard_and_founders(self):
        r = requests.post(f"{API}/auth/login", json={"email": "bot1@circle.ai", "password": "BotPass123!"}, timeout=15)
        tok = r.json()["session_token"]
        lb = requests.get(f"{API}/leaderboard/xp", headers=_hdr(tok), timeout=15)
        assert lb.status_code == 200
        f = requests.get(f"{API}/founders", headers=_hdr(tok), timeout=15)
        assert f.status_code == 200
