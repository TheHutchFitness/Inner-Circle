# Backend tests for Lite/Full mode + Gym association features (iteration_22)
# Covers:
#  - Public GET /api/gyms
#  - PATCH /api/profile/update {lite_mode} (also sets mode_selected)
#  - PATCH /api/profile/update {gym} -> saves as inperson_gym
#  - PATCH /api/profile/update {inperson_request:true} requires gym (400 without)
#  - POST /api/auth/register with gym + inperson_request persists both
#  - Regression: /auth/login, /auth/me, /profile/me, /quests, /leaderboard still work
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://powerup-arena.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def _register(sess, prefix="litegym"):
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": email,
        "password": "Passw0rd!TEST",
        "display_name": f"TEST {prefix}",
    }
    r = sess.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    body = r.json()
    return body["session_token"], body["user"], email


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ------------------------- GYMS (public) -------------------------
class TestGymsPublic:
    def test_gyms_public_no_auth(self, s):
        r = s.get(f"{API}/gyms")
        assert r.status_code == 200, f"GET /api/gyms failed: {r.status_code} {r.text}"
        body = r.json()
        assert "gyms" in body and isinstance(body["gyms"], list)


# --------------------- ProfileUpdate: lite_mode ------------------
class TestLiteModeToggle:
    def test_lite_true_sets_mode_selected(self, s):
        token, user, _ = _register(s, "lite1")
        r = s.patch(f"{API}/profile/update", json={"lite_mode": True}, headers=_auth(token))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("lite_mode") is True
        assert u.get("mode_selected") is True

        # persistence via /auth/me
        me = s.get(f"{API}/auth/me", headers=_auth(token))
        assert me.status_code == 200
        m = me.json()
        assert m.get("lite_mode") is True
        assert m.get("mode_selected") is True

    def test_flip_back_to_full(self, s):
        token, _, _ = _register(s, "lite2")
        # go lite, then back to full
        s.patch(f"{API}/profile/update", json={"lite_mode": True}, headers=_auth(token))
        r = s.patch(f"{API}/profile/update", json={"lite_mode": False}, headers=_auth(token))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("lite_mode") is False
        # mode_selected should remain True (a choice was made)
        assert u.get("mode_selected") is True


# --------------------- ProfileUpdate: gym ------------------------
class TestGymField:
    def test_gym_saves_to_inperson_gym(self, s):
        token, _, _ = _register(s, "gymA")
        gym_name = "TEST Iron Temple"
        r = s.patch(f"{API}/profile/update", json={"gym": gym_name}, headers=_auth(token))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("inperson_gym") == gym_name
        # verify via /auth/me
        me = s.get(f"{API}/auth/me", headers=_auth(token)).json()
        assert me.get("inperson_gym") == gym_name

    def test_gym_now_appears_in_public_gyms_list(self, s):
        token, _, _ = _register(s, "gymB")
        gym_name = f"TEST Gym {uuid.uuid4().hex[:6]}"
        s.patch(f"{API}/profile/update", json={"gym": gym_name}, headers=_auth(token))
        r = s.get(f"{API}/gyms")
        assert r.status_code == 200
        assert gym_name in r.json().get("gyms", [])


# ------------- ProfileUpdate: inperson_request -------------------
class TestInPersonRequest:
    def test_request_without_gym_400(self, s):
        token, _, _ = _register(s, "req1")
        r = s.patch(f"{API}/profile/update", json={"inperson_request": True}, headers=_auth(token))
        assert r.status_code == 400, f"expected 400, got {r.status_code} body={r.text}"

    def test_request_succeeds_after_gym(self, s):
        token, _, _ = _register(s, "req2")
        # set gym
        s.patch(f"{API}/profile/update", json={"gym": "TEST Coach Gym"}, headers=_auth(token))
        # request
        r = s.patch(f"{API}/profile/update", json={"inperson_request": True}, headers=_auth(token))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("inperson_request") is True
        assert u.get("inperson_gym") == "TEST Coach Gym"

    def test_request_and_gym_in_same_patch(self, s):
        token, _, _ = _register(s, "req3")
        r = s.patch(f"{API}/profile/update",
                    json={"gym": "TEST Combo Gym", "inperson_request": True},
                    headers=_auth(token))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("inperson_gym") == "TEST Combo Gym"
        assert u.get("inperson_request") is True


# ---------------- Register with gym + request --------------------
class TestRegisterWithGym:
    def test_register_persists_gym_and_request(self, s):
        email = f"TEST_reggym_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "email": email,
            "password": "Passw0rd!TEST",
            "display_name": "TEST reggym",
            "gym": "TEST Register Gym",
            "inperson_request": True,
        }
        r = s.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        u = body["user"]
        assert u.get("inperson_gym") == "TEST Register Gym"
        assert u.get("inperson_request") is True
        # verify via /auth/me
        token = body["session_token"]
        me = s.get(f"{API}/auth/me", headers=_auth(token)).json()
        assert me.get("inperson_gym") == "TEST Register Gym"
        assert me.get("inperson_request") is True


# --------------------- Regression checks -------------------------
class TestRegression:
    def test_login_bot(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "bot1@circle.ai", "password": "BotPass123!"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "session_token" in body and "user" in body

    def test_auth_me(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "bot2@circle.ai", "password": "BotPass123!"})
        assert r.status_code == 200
        token = r.json()["session_token"]
        me = s.get(f"{API}/auth/me", headers=_auth(token))
        assert me.status_code == 200
        u = me.json()
        assert "user_id" in u and "email" in u
        # lite_mode/mode_selected keys should be present (or absent) but not break
        # rank should be computed
        assert "rank" in u

    def test_profile_me(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "bot3@circle.ai", "password": "BotPass123!"})
        token = r.json()["session_token"]
        p = s.get(f"{API}/profile/me", headers=_auth(token))
        assert p.status_code == 200
        assert "user_id" in p.json()

    def test_quests_endpoint(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "bot4@circle.ai", "password": "BotPass123!"})
        token = r.json()["session_token"]
        q = s.get(f"{API}/quests", headers=_auth(token))
        assert q.status_code == 200, q.text

    def test_leaderboard_endpoint(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "bot5@circle.ai", "password": "BotPass123!"})
        token = r.json()["session_token"]
        lb = s.get(f"{API}/leaderboard/xp", headers=_auth(token))
        assert lb.status_code == 200, lb.text
