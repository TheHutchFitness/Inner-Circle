"""Backend tests for Saved Meals CRUD (iteration_32).

Covers:
- Auth required for all endpoints
- GET /api/nutrition/meals returns list
- POST creates a meal with id and macros
- POST with empty name -> 400
- DELETE removes and it disappears from GET
- Meals are per-user isolated
"""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

OWNER = {"email": "the9hutch@gmail.com", "password": "Hutch-TWVmifIRhU6u8bBl"}
MEMBER = {"email": "Test@Test.com", "password": "test"}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("session_token") or j.get("token")
    assert tok, f"no token in login response: {j}"
    return tok


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER["email"], OWNER["password"])


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER["email"], MEMBER["password"])


def _auth(token: str):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth-required ----------

class TestAuthRequired:
    def test_get_meals_unauth(self):
        r = requests.get(f"{BASE_URL}/api/nutrition/meals", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_post_meal_unauth(self):
        r = requests.post(f"{BASE_URL}/api/nutrition/meals", json={"name": "Test", "calories": 100}, timeout=15)
        assert r.status_code in (401, 403)

    def test_delete_meal_unauth(self):
        r = requests.delete(f"{BASE_URL}/api/nutrition/meals/meal_fake", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Validation ----------

class TestValidation:
    def test_empty_name_returns_400(self, owner_token):
        r = requests.post(f"{BASE_URL}/api/nutrition/meals",
                          json={"name": "", "calories": 100, "protein": 10, "carbs": 5, "fats": 3},
                          headers=_auth(owner_token), timeout=15)
        assert r.status_code == 400, f"expected 400 on empty name, got {r.status_code} {r.text}"

    def test_whitespace_name_returns_400(self, owner_token):
        r = requests.post(f"{BASE_URL}/api/nutrition/meals",
                          json={"name": "    ", "calories": 100},
                          headers=_auth(owner_token), timeout=15)
        assert r.status_code == 400


# ---------- CRUD lifecycle ----------

class TestSavedMealsCRUD:
    _created_ids: list = []

    def test_get_returns_meals_key(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/nutrition/meals", headers=_auth(owner_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "meals" in body and isinstance(body["meals"], list)

    def test_create_meal_persists(self, owner_token):
        payload = {"name": "TEST_ownerMeal", "calories": 550, "protein": 45, "carbs": 60, "fats": 15}
        r = requests.post(f"{BASE_URL}/api/nutrition/meals", json=payload,
                          headers=_auth(owner_token), timeout=15)
        assert r.status_code == 200, r.text
        meal = r.json()
        assert meal["name"] == "TEST_ownerMeal"
        assert meal["calories"] == 550
        assert meal["protein"] == 45
        assert meal["carbs"] == 60
        assert meal["fats"] == 15
        assert isinstance(meal.get("id"), str) and meal["id"]
        TestSavedMealsCRUD._created_ids.append(meal["id"])

        # Verify it shows up in GET
        r2 = requests.get(f"{BASE_URL}/api/nutrition/meals", headers=_auth(owner_token), timeout=15)
        assert r2.status_code == 200
        ids = [m["id"] for m in r2.json().get("meals", [])]
        assert meal["id"] in ids

    def test_delete_meal(self, owner_token):
        # Create a meal to delete
        r = requests.post(f"{BASE_URL}/api/nutrition/meals",
                          json={"name": "TEST_toDelete", "calories": 100, "protein": 5, "carbs": 10, "fats": 2},
                          headers=_auth(owner_token), timeout=15)
        assert r.status_code == 200
        mid = r.json()["id"]

        d = requests.delete(f"{BASE_URL}/api/nutrition/meals/{mid}",
                            headers=_auth(owner_token), timeout=15)
        assert d.status_code == 200, d.text
        assert d.json() == {"ok": True}

        # Verify absence
        r2 = requests.get(f"{BASE_URL}/api/nutrition/meals", headers=_auth(owner_token), timeout=15)
        ids = [m["id"] for m in r2.json().get("meals", [])]
        assert mid not in ids

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup for any leftovers
        try:
            tok = _login(OWNER["email"], OWNER["password"])
            for mid in cls._created_ids:
                requests.delete(f"{BASE_URL}/api/nutrition/meals/{mid}",
                                headers={"Authorization": f"Bearer {tok}"}, timeout=10)
            # Cleanup any TEST_ prefixed lingering
            r = requests.get(f"{BASE_URL}/api/nutrition/meals",
                             headers={"Authorization": f"Bearer {tok}"}, timeout=10)
            for m in r.json().get("meals", []):
                if str(m.get("name", "")).startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/nutrition/meals/{m['id']}",
                                    headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        except Exception:
            pass


# ---------- Per-user isolation ----------

class TestPerUserIsolation:
    _owner_meal_id = None
    _member_meal_id = None

    def test_meals_isolated_between_users(self, owner_token, member_token):
        # Owner creates a meal
        ro = requests.post(f"{BASE_URL}/api/nutrition/meals",
                           json={"name": "TEST_owner_only", "calories": 700, "protein": 60, "carbs": 40, "fats": 20},
                           headers=_auth(owner_token), timeout=15)
        assert ro.status_code == 200, ro.text
        TestPerUserIsolation._owner_meal_id = ro.json()["id"]

        # Member creates a meal
        rm = requests.post(f"{BASE_URL}/api/nutrition/meals",
                           json={"name": "TEST_member_only", "calories": 300, "protein": 20, "carbs": 30, "fats": 8},
                           headers=_auth(member_token), timeout=15)
        assert rm.status_code == 200, rm.text
        TestPerUserIsolation._member_meal_id = rm.json()["id"]

        # Owner's list should NOT contain member's meal
        lo = requests.get(f"{BASE_URL}/api/nutrition/meals", headers=_auth(owner_token), timeout=15).json()
        owner_ids = [m["id"] for m in lo.get("meals", [])]
        assert TestPerUserIsolation._owner_meal_id in owner_ids
        assert TestPerUserIsolation._member_meal_id not in owner_ids

        # Member's list should NOT contain owner's meal
        lm = requests.get(f"{BASE_URL}/api/nutrition/meals", headers=_auth(member_token), timeout=15).json()
        member_ids = [m["id"] for m in lm.get("meals", [])]
        assert TestPerUserIsolation._member_meal_id in member_ids
        assert TestPerUserIsolation._owner_meal_id not in member_ids

    def test_delete_other_users_meal_is_noop(self, owner_token, member_token):
        # Owner tries to delete member's meal id — should not affect it
        assert TestPerUserIsolation._member_meal_id, "member meal missing"
        d = requests.delete(f"{BASE_URL}/api/nutrition/meals/{TestPerUserIsolation._member_meal_id}",
                            headers=_auth(owner_token), timeout=15)
        # Backend returns ok:true regardless (delete_one no-match), but the meal must remain for the member
        assert d.status_code == 200
        lm = requests.get(f"{BASE_URL}/api/nutrition/meals", headers=_auth(member_token), timeout=15).json()
        member_ids = [m["id"] for m in lm.get("meals", [])]
        assert TestPerUserIsolation._member_meal_id in member_ids, "another user was able to delete this meal!"

    @classmethod
    def teardown_class(cls):
        try:
            ot = _login(OWNER["email"], OWNER["password"])
            mt = _login(MEMBER["email"], MEMBER["password"])
            if cls._owner_meal_id:
                requests.delete(f"{BASE_URL}/api/nutrition/meals/{cls._owner_meal_id}",
                                headers={"Authorization": f"Bearer {ot}"}, timeout=10)
            if cls._member_meal_id:
                requests.delete(f"{BASE_URL}/api/nutrition/meals/{cls._member_meal_id}",
                                headers={"Authorization": f"Bearer {mt}"}, timeout=10)
        except Exception:
            pass
