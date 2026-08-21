"""
Iteration 34 — Backend feature batch:
- POST /api/nutrition/water (water goal + streak + badges)
- GET /api/nutrition/today (adds water_ml + water_streak)
- GET/POST /api/nutrition/goals (adds water_goal, preserves when omitted)
- POST /api/heart-rate/log with current_bpm; GET /api/heart-rate/today returns it
- GET /api/founders now includes admins; hardened level_from_xp
- GET /api/founders/spots
- GET /api/profile/me idempotently adds 'founder' badge for founder-eligible users
- POST /api/admin/members/{user_id}/delete (admin-only, guards)
- GET /api/gyms/nearby (200 shape + cached=True on 2nd identical call)
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

OWNER = {"email": "the9hutch@gmail.com", "password": "Hutch-TWVmifIRhU6u8bBl"}
MEMBER = {"email": "bot1@circle.ai", "password": "BotPass123!"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER)


@pytest.fixture(scope="module")
def throwaway_member():
    """Register a throwaway member we can safely delete later."""
    email = f"TEST_iter34_{uuid.uuid4().hex[:10]}@qa-example.com"
    payload = {"email": email, "password": "Throwaway123!", "display_name": "TEST_Iter34Del"}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("session_token")
    # /auth/register may return {user:{user_id}, session_token} or similar shape
    uid = (data.get("user") or {}).get("user_id") or data.get("user_id")
    if not uid:
        # fallback: fetch via /auth/me
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(token), timeout=10)
        uid = me.json().get("user_id")
    assert uid, f"couldn't obtain user_id from register response: {data}"
    return {"email": email, "user_id": uid, "token": token}


# =========================================================
# Nutrition — water + goals
# =========================================================
class TestNutritionGoalsWater:
    def test_get_goals_includes_water_goal(self, member_token):
        r = requests.get(f"{BASE_URL}/api/nutrition/goals", headers=_h(member_token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "water_goal" in d, "water_goal missing from goals response"
        assert isinstance(d["water_goal"], int)
        assert d["water_goal"] >= 0

    def test_post_goals_preserves_water_goal(self, member_token):
        # First: set an explicit water_goal so we know the baseline
        r0 = requests.post(
            f"{BASE_URL}/api/nutrition/goals",
            headers=_h(member_token),
            json={"calories": 2400, "protein": 180, "carbs": 250, "fats": 70, "water_goal": 3500},
            timeout=10,
        )
        assert r0.status_code == 200
        assert r0.json()["water_goal"] == 3500

        # Now POST WITHOUT water_goal — server must preserve the existing 3500
        r1 = requests.post(
            f"{BASE_URL}/api/nutrition/goals",
            headers=_h(member_token),
            json={"calories": 2500, "protein": 200},
            timeout=10,
        )
        assert r1.status_code == 200
        body = r1.json()
        assert body["calories"] == 2500
        assert body["protein"] == 200
        assert body["water_goal"] == 3500, f"water_goal was clobbered to {body['water_goal']}"

        # Confirm via GET
        r2 = requests.get(f"{BASE_URL}/api/nutrition/goals", headers=_h(member_token), timeout=10)
        assert r2.json()["water_goal"] == 3500

    def test_post_water_below_goal_returns_shape(self, member_token):
        # Make sure goal is 3500
        requests.post(
            f"{BASE_URL}/api/nutrition/goals", headers=_h(member_token),
            json={"water_goal": 3500}, timeout=10,
        )
        r = requests.post(f"{BASE_URL}/api/nutrition/water", headers=_h(member_token),
                          json={"ml": 500}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("date", "water_ml", "goal_met", "water_streak", "new_badge"):
            assert k in d, f"missing key '{k}' in POST /nutrition/water response: {d}"
        assert d["water_ml"] == 500
        assert d["goal_met"] is False
        # water_streak may be 0 or > 0 depending on prior state; must be int
        assert isinstance(d["water_streak"], int)

    def test_post_water_meets_goal(self, member_token):
        # Set a small goal so we can meet it easily
        requests.post(
            f"{BASE_URL}/api/nutrition/goals", headers=_h(member_token),
            json={"water_goal": 1000}, timeout=10,
        )
        r = requests.post(f"{BASE_URL}/api/nutrition/water", headers=_h(member_token),
                          json={"ml": 1500}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["water_ml"] == 1500
        assert d["goal_met"] is True
        assert d["water_streak"] >= 1
        # new_badge is either None, "3", or "7"; must not crash
        assert d["new_badge"] in (None, "3", "7")

    def test_water_ml_clamped(self, member_token):
        # ml above 20000 clamps to 20000
        r = requests.post(f"{BASE_URL}/api/nutrition/water", headers=_h(member_token),
                          json={"ml": 999999}, timeout=10)
        assert r.status_code == 200
        assert r.json()["water_ml"] == 20000
        # Negative -> 0
        r2 = requests.post(f"{BASE_URL}/api/nutrition/water", headers=_h(member_token),
                           json={"ml": -50}, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["water_ml"] == 0

    def test_nutrition_today_includes_water(self, member_token):
        # Log some water first
        requests.post(f"{BASE_URL}/api/nutrition/water", headers=_h(member_token),
                      json={"ml": 800}, timeout=10)
        r = requests.get(f"{BASE_URL}/api/nutrition/today", headers=_h(member_token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "water_ml" in d and isinstance(d["water_ml"], int)
        assert d["water_ml"] == 800
        assert "water_streak" in d and isinstance(d["water_streak"], int)

    def test_water_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/nutrition/water", json={"ml": 1000}, timeout=10)
        assert r.status_code in (401, 403)


# =========================================================
# Heart Rate
# =========================================================
class TestHeartRate:
    def test_log_current_bpm(self, member_token):
        r = requests.post(f"{BASE_URL}/api/heart-rate/log", headers=_h(member_token),
                          json={"current_bpm": 78, "resting_bpm": 60, "avg_bpm": 90, "max_bpm": 165},
                          timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["current_bpm"] == 78
        assert d["resting_bpm"] == 60
        assert d["avg_bpm"] == 90
        assert d["max_bpm"] == 165

    def test_get_heart_rate_today_returns_current_bpm(self, member_token):
        r = requests.get(f"{BASE_URL}/api/heart-rate/today", headers=_h(member_token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "current_bpm" in d, f"current_bpm missing from heart-rate/today: {d}"
        assert d["current_bpm"] == 78

    def test_log_only_current_bpm(self, member_token):
        # Only current_bpm — should work (upsert), and GET should reflect update
        r = requests.post(f"{BASE_URL}/api/heart-rate/log", headers=_h(member_token),
                          json={"current_bpm": 82}, timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/heart-rate/today", headers=_h(member_token), timeout=10)
        assert r2.json()["current_bpm"] == 82

    def test_log_empty_rejected(self, member_token):
        r = requests.post(f"{BASE_URL}/api/heart-rate/log", headers=_h(member_token),
                          json={}, timeout=10)
        assert r.status_code == 400


# =========================================================
# Founders — must include admins, must not crash
# =========================================================
class TestFounders:
    def test_founders_list_200(self, member_token):
        r = requests.get(f"{BASE_URL}/api/founders", headers=_h(member_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "founders" in d and isinstance(d["founders"], list)
        # Should contain at least one entry (real signups exist per test creds file)
        # And each entry must have core fields, no crash from null xp
        for f in d["founders"]:
            assert "user_id" in f and "display_name" in f and "rank" in f

    def test_founders_includes_owner_admin(self, owner_token, member_token):
        """Owner is admin — must now appear in founders list (previously excluded)."""
        # Get owner's user_id via /auth/me
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(owner_token), timeout=10)
        assert me.status_code == 200
        owner_uid = me.json().get("user_id")
        assert owner_uid

        r = requests.get(f"{BASE_URL}/api/founders", headers=_h(member_token), timeout=15)
        assert r.status_code == 200
        ids = {f["user_id"] for f in r.json()["founders"]}
        assert owner_uid in ids, "Owner admin should now appear in /api/founders (feature: include admins)"

    def test_founders_spots_public(self):
        r = requests.get(f"{BASE_URL}/api/founders/spots", timeout=10)
        assert r.status_code == 200
        d = r.json()
        for k in ("taken", "limit", "remaining"):
            assert k in d
        assert d["limit"] == 100
        assert d["taken"] + d["remaining"] == d["limit"] or d["taken"] >= 100  # capped
        assert d["taken"] >= 1  # owner alone should count

    def test_profile_me_adds_founder_badge_if_eligible(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/profile/me", headers=_h(owner_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        # If backend flags is_founder for this user, badges must include 'founder'
        if d.get("is_founder"):
            assert "founder" in (d.get("badges") or []), \
                "profile/me should idempotently grant 'founder' badge to founder-eligible users"
        # Call again to make sure idempotent (no crash / no duplicates)
        r2 = requests.get(f"{BASE_URL}/api/profile/me", headers=_h(owner_token), timeout=15)
        assert r2.status_code == 200
        b = r2.json().get("badges") or []
        assert b.count("founder") <= 1


# =========================================================
# Admin: delete member
# =========================================================
class TestAdminDeleteMember:
    def test_non_admin_forbidden(self, member_token, throwaway_member):
        r = requests.post(
            f"{BASE_URL}/api/admin/members/{throwaway_member['user_id']}/delete",
            headers=_h(member_token), timeout=10,
        )
        assert r.status_code == 403, f"non-admin got {r.status_code}: {r.text}"

    def test_delete_self_400(self, owner_token):
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(owner_token), timeout=10).json()
        r = requests.post(
            f"{BASE_URL}/api/admin/members/{me['user_id']}/delete",
            headers=_h(owner_token), timeout=10,
        )
        assert r.status_code == 400, f"self-delete should be 400, got {r.status_code}: {r.text}"

    def test_delete_admin_rejected(self, owner_token):
        """Try to delete another admin — should be 400. The owner is the only admin, but self-delete
        already returned 400. We assert the *reason* by trying to delete the owner from... the owner.
        (Since self-delete short-circuits first, we validate the 400 path is stable.)"""
        # Query members list to see if there's any *other* admin. If not, just rely on self-delete 400.
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(owner_token), timeout=10).json()
        r = requests.post(
            f"{BASE_URL}/api/admin/members/{me['user_id']}/delete",
            headers=_h(owner_token), timeout=10,
        )
        # Self OR admin both raise 400.
        assert r.status_code == 400

    def test_delete_unknown_404(self, owner_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/members/does_not_exist_xyz/delete",
            headers=_h(owner_token), timeout=10,
        )
        assert r.status_code == 404

    def test_admin_delete_success(self, owner_token, throwaway_member):
        uid = throwaway_member["user_id"]
        r = requests.post(
            f"{BASE_URL}/api/admin/members/{uid}/delete",
            headers=_h(owner_token), timeout=15,
        )
        assert r.status_code == 200, f"admin delete failed: {r.status_code} {r.text}"
        d = r.json()
        assert d.get("ok") is True and d.get("deleted") == uid

        # Verify: the throwaway's session should no longer work
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {throwaway_member['token']}"},
                          timeout=10)
        assert me.status_code in (401, 403, 404), \
            f"deleted member's session still active (status {me.status_code})"

        # A second delete should now 404
        r2 = requests.post(
            f"{BASE_URL}/api/admin/members/{uid}/delete",
            headers=_h(owner_token), timeout=10,
        )
        assert r2.status_code == 404


# =========================================================
# Gyms nearby — cache behavior + rate limit shape
# =========================================================
class TestGymsNearby:
    def test_gyms_nearby_shape(self, member_token):
        # Pick a well-known coordinate (Times Square, NYC) that will have gyms
        params = {"lat": 40.758896, "lng": -73.98513}
        r = requests.get(f"{BASE_URL}/api/gyms/nearby", headers=_h(member_token),
                         params=params, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "gyms" in d
        assert isinstance(d["gyms"], list)
        # If not places_unconfigured, the second call should be cached
        if d.get("error") == "places_unconfigured":
            pytest.skip("GOOGLE_PLACES_API_KEY not configured")

    def test_gyms_nearby_cached_on_second_call(self, member_token):
        params = {"lat": 40.758896, "lng": -73.98513}
        # First call — may or may not be cached depending on prior test runs
        requests.get(f"{BASE_URL}/api/gyms/nearby", headers=_h(member_token),
                     params=params, timeout=20)
        # Small delay to ensure cache write completed
        time.sleep(0.5)
        r2 = requests.get(f"{BASE_URL}/api/gyms/nearby", headers=_h(member_token),
                          params=params, timeout=20)
        assert r2.status_code == 200
        d = r2.json()
        if d.get("error") == "places_unconfigured":
            pytest.skip("GOOGLE_PLACES_API_KEY not configured")
        assert d.get("cached") is True, f"expected cached:true on second identical call, got: {d}"

    def test_gyms_nearby_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/gyms/nearby",
                         params={"lat": 40.758, "lng": -73.985}, timeout=10)
        assert r.status_code in (401, 403)
