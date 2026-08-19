"""Iteration 17 regression tests — verifies the server.py -> shared.py + routes/*.py split
did not break any endpoints, and the new features (bots, founders, social links, supplements)
all work end-to-end.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_BACKEND_URL', 'https://powerup-arena.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def bot_token(api_client):
    r = api_client.post(f"{API}/auth/login", json={"email": "bot1@circle.ai", "password": "BotPass123!"})
    assert r.status_code == 200, f"bot1 login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data
    return data["session_token"]


@pytest.fixture(scope="module")
def fresh_user(api_client):
    """Register a fresh account for founder + social tests."""
    email = f"TEST_iter17_{uuid.uuid4().hex[:10]}@example.com"
    payload = {"email": email, "password": "TestPass123!", "display_name": "TestIter17", "sex": "male"}
    r = api_client.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data
    assert "user" in data
    return {"email": email, "token": data["session_token"], "user": data["user"], "register_resp": data}


# ---------- REFACTOR REGRESSION: core endpoint smoke ----------
class TestRefactorRegression:
    def test_founders_spots_public(self, api_client):
        r = api_client.get(f"{API}/founders/spots")
        assert r.status_code == 200
        d = r.json()
        assert "taken" in d and "limit" in d and "remaining" in d
        assert d["limit"] == 100
        assert isinstance(d["taken"], int)
        assert isinstance(d["remaining"], int)

    def test_active_count_min_10(self, api_client, bot_token):
        r = api_client.get(f"{API}/active-count", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200
        d = r.json()
        assert "active" in d
        assert d["active"] >= 10, f"active must be >=10, got {d['active']}"

    def test_auth_login_bot(self, bot_token):
        assert bot_token.startswith("tok_")

    def test_auth_me(self, api_client, bot_token):
        r = api_client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200
        u = r.json()
        assert u.get("email") == "bot1@circle.ai"
        assert u.get("is_bot") is True

    def test_leaderboard_xp_returns_bots(self, api_client, bot_token):
        r = api_client.get(f"{API}/leaderboard/xp", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200
        d = r.json()
        # response may be list or dict
        rows = d if isinstance(d, list) else d.get("leaderboard") or d.get("rows") or d.get("data") or []
        assert isinstance(rows, list) and len(rows) >= 10, f"expected >=10 rows, got {len(rows)}"
        # No demo test.com leftover users
        emails = [str(r.get("email", "")).lower() for r in rows if isinstance(r, dict)]
        assert not any(e.endswith("@test.com") for e in emails), f"found leftover @test.com in leaderboard: {emails}"
        # Confirm at least one known bot display name is present
        names = " ".join(str(r.get("display_name", "")) for r in rows if isinstance(r, dict)).lower()
        assert any(n in names for n in ["plate prophet", "iron sentinel", "apex prime"]), \
            f"expected bot display names in leaderboard, got {names[:200]}"

    def test_leaderboard_strength(self, api_client, bot_token):
        r = api_client.get(f"{API}/leaderboard/strength", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_leaderboard_ratio(self, api_client, bot_token):
        r = api_client.get(f"{API}/leaderboard/ratio", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_exercises_list(self, api_client, bot_token):
        r = api_client.get(f"{API}/exercises", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200
        d = r.json()
        rows = d.get("library") if isinstance(d, dict) else (d if isinstance(d, list) else [])
        assert len(rows) > 30, f"expected exercise library, got {len(rows)}"

    def test_nutrition_today_get(self, api_client, bot_token):
        r = api_client.get(f"{API}/nutrition/today", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_nutrition_today_post(self, api_client, bot_token):
        payload = {"calories": 100, "protein": 10, "carbs": 20, "fats": 5}
        r = api_client.post(f"{API}/nutrition/today", json=payload,
                            headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_workouts_log(self, api_client, bot_token):
        payload = {
            "workout_name": "TEST Push",
            "split_type": "ppl_push",
            "exercises": [{"name": "Barbell Bench Press",
                          "sets": [{"reps": 5, "weight_lb": 135, "rpe": 7}]}],
            "duration_min": 30,
        }
        r = api_client.post(f"{API}/workouts/log", json=payload,
                            headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200, f"workouts/log failed: {r.status_code} {r.text}"

    def test_journey(self, api_client, bot_token):
        r = api_client.get(f"{API}/journey", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_quests(self, api_client, bot_token):
        r = api_client.get(f"{API}/quests", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_enhanced_status(self, api_client, bot_token):
        r = api_client.get(f"{API}/enhanced/status", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_founders_list(self, api_client, bot_token):
        r = api_client.get(f"{API}/founders", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200

    def test_cardio_leaderboard(self, api_client, bot_token):
        r = api_client.get(f"{API}/cardio/leaderboard", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200


# ---------- FOUNDER FREE ACCESS ----------
class TestFounderFreeAccess:
    def test_register_marks_founder(self, fresh_user):
        u = fresh_user["register_resp"]["user"]
        assert u.get("is_founder") is True, f"is_founder must be True on register: {u}"
        assert isinstance(u.get("founder_number"), int)
        assert 1 <= u["founder_number"] <= 100, f"founder_number out of range: {u['founder_number']}"

    def test_auth_me_still_founder(self, api_client, fresh_user):
        r = api_client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {fresh_user['token']}"})
        assert r.status_code == 200
        u = r.json()
        assert u.get("is_founder") is True
        assert isinstance(u.get("founder_number"), int)


# ---------- SOCIAL LINKS ----------
class TestSocialLinks:
    def test_patch_social_sanitizes(self, api_client, fresh_user):
        payload = {
            "social_tiktok": "https://www.tiktok.com/@hutch.lifts?lang=en",
            "social_instagram": "@the_hutch",
        }
        r = api_client.patch(f"{API}/profile/update", json=payload,
                             headers={"Authorization": f"Bearer {fresh_user['token']}"})
        assert r.status_code == 200, f"profile/update failed: {r.status_code} {r.text}"
        # Re-read via /auth/me
        me = api_client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {fresh_user['token']}"})
        assert me.status_code == 200
        m = me.json()
        assert m.get("social_tiktok") == "hutch.lifts", f"expected 'hutch.lifts', got {m.get('social_tiktok')}"
        assert m.get("social_instagram") == "the_hutch", f"expected 'the_hutch', got {m.get('social_instagram')}"

    def test_users_public_returns_social(self, api_client, fresh_user, bot_token):
        uid = fresh_user["user"]["user_id"]
        r = api_client.get(f"{API}/users/{uid}/public", headers={"Authorization": f"Bearer {bot_token}"})
        assert r.status_code == 200, f"public endpoint failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("social_tiktok") == "hutch.lifts"
        assert d.get("social_instagram") == "the_hutch"


# ---------- SUPPLEMENTS ----------
class TestSupplements:
    def test_add_get_remove_supplement(self, api_client, fresh_user):
        h = {"Authorization": f"Bearer {fresh_user['token']}"}
        # add
        r = api_client.post(f"{API}/supplements", json={"name": "TEST_Creatine", "on": True}, headers=h)
        assert r.status_code == 200, f"add failed: {r.status_code} {r.text}"
        # get
        r = api_client.get(f"{API}/supplements", headers=h)
        assert r.status_code == 200
        d = r.json()
        rows = d if isinstance(d, list) else d.get("supplements") or d.get("items") or []
        names = [x.get("name") if isinstance(x, dict) else x for x in rows]
        assert "TEST_Creatine" in names, f"expected TEST_Creatine in {names}"
        # remove
        r = api_client.post(f"{API}/supplements", json={"name": "TEST_Creatine", "on": False}, headers=h)
        assert r.status_code == 200
        r = api_client.get(f"{API}/supplements", headers=h)
        d = r.json()
        rows = d if isinstance(d, list) else d.get("supplements") or d.get("items") or []
        names = [x.get("name") if isinstance(x, dict) else x for x in rows]
        assert "TEST_Creatine" not in names, f"remove failed, still in {names}"


# ---------- BOTS BROAD LOGIN ----------
class TestAllBotsLogin:
    @pytest.mark.parametrize("n", list(range(1, 11)))
    def test_bot_n_login(self, api_client, n):
        r = api_client.post(f"{API}/auth/login", json={"email": f"bot{n}@circle.ai", "password": "BotPass123!"})
        assert r.status_code == 200, f"bot{n} login failed: {r.status_code} {r.text}"
        assert "session_token" in r.json()
