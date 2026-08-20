"""
Iteration 33 — Nutrition new endpoints:
 - GET/POST /api/nutrition/goals (per-user)
 - GET/POST/DELETE /api/nutrition/foods (per-user custom foods)
Focus: validation, persistence, per-user isolation.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")

OWNER = {"email": "the9hutch@gmail.com", "password": "Hutch-TWVmifIRhU6u8bBl"}
MEMBER = {"email": "Test@Test.com", "password": "test"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER)


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER)


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ============ Goals ============
class TestNutritionGoals:
    def test_owner_get_goals(self, owner_token):
        r = requests.get(f"{BASE_URL}/api/nutrition/goals", headers=_h(owner_token), timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "calories" in d and "protein" in d
        assert isinstance(d["calories"], int)

    def test_member_set_and_persist_goals(self, member_token):
        payload = {"calories": 2500, "protein": 180}
        r = requests.post(f"{BASE_URL}/api/nutrition/goals", headers=_h(member_token), json=payload, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["calories"] == 2500
        assert d["protein"] == 180
        # GET verifies persistence
        g = requests.get(f"{BASE_URL}/api/nutrition/goals", headers=_h(member_token), timeout=10).json()
        assert g["calories"] == 2500
        assert g["protein"] == 180

    def test_goals_per_user_isolation(self, owner_token, member_token):
        # Owner's goals should NOT be affected by member's write
        o = requests.get(f"{BASE_URL}/api/nutrition/goals", headers=_h(owner_token), timeout=10).json()
        m = requests.get(f"{BASE_URL}/api/nutrition/goals", headers=_h(member_token), timeout=10).json()
        # We just set member to 2500/180; owner is expected 3000/220 per main agent note
        assert (o["calories"], o["protein"]) != (m["calories"], m["protein"]) or (o["calories"] == 3000 and m["calories"] == 2500)
        assert m["calories"] == 2500 and m["protein"] == 180

    def test_goals_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/nutrition/goals", timeout=10)
        assert r.status_code in (401, 403)


# ============ Custom Foods ============
class TestCustomFoods:
    created_owner_id = None
    created_member_id = None

    def test_owner_create_custom_food(self, owner_token):
        payload = {"name": "TEST_OwnerFood", "grams": 100, "calories": 200, "protein": 20, "carbs": 10, "fats": 5}
        r = requests.post(f"{BASE_URL}/api/nutrition/foods", headers=_h(owner_token), json=payload, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_OwnerFood"
        assert d["calories"] == 200
        assert d["grams"] == 100
        assert "id" in d
        TestCustomFoods.created_owner_id = d["id"]

    def test_member_create_custom_food(self, member_token):
        payload = {"name": "TEST_MemberFood", "grams": 50, "calories": 100, "protein": 12, "carbs": 4, "fats": 2}
        r = requests.post(f"{BASE_URL}/api/nutrition/foods", headers=_h(member_token), json=payload, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "TEST_MemberFood"
        TestCustomFoods.created_member_id = d["id"]

    def test_empty_name_rejected(self, owner_token):
        r = requests.post(f"{BASE_URL}/api/nutrition/foods", headers=_h(owner_token), json={"name": "   "}, timeout=10)
        assert r.status_code == 400

    def test_list_shows_own_only(self, owner_token, member_token):
        # Owner list contains owner food, NOT member's food
        o = requests.get(f"{BASE_URL}/api/nutrition/foods", headers=_h(owner_token), timeout=10).json()
        m = requests.get(f"{BASE_URL}/api/nutrition/foods", headers=_h(member_token), timeout=10).json()
        o_ids = {f["id"] for f in o.get("foods", [])}
        m_ids = {f["id"] for f in m.get("foods", [])}
        assert TestCustomFoods.created_owner_id in o_ids
        assert TestCustomFoods.created_member_id in m_ids
        assert TestCustomFoods.created_member_id not in o_ids, "Owner saw member's food!"
        assert TestCustomFoods.created_owner_id not in m_ids, "Member saw owner's food!"

    def test_cross_user_delete_isolation(self, owner_token, member_token):
        # Owner attempts to delete member's food — should silently no-op (delete scoped by user_id).
        # The member's food should still exist.
        target = TestCustomFoods.created_member_id
        r = requests.delete(f"{BASE_URL}/api/nutrition/foods/{target}", headers=_h(owner_token), timeout=10)
        assert r.status_code == 200
        # verify member's food still present
        m = requests.get(f"{BASE_URL}/api/nutrition/foods", headers=_h(member_token), timeout=10).json()
        m_ids = {f["id"] for f in m.get("foods", [])}
        assert target in m_ids, "Cross-user delete leaked — member's food was deleted by owner!"

    def test_self_delete_works(self, owner_token, member_token):
        # Cleanup
        r1 = requests.delete(f"{BASE_URL}/api/nutrition/foods/{TestCustomFoods.created_owner_id}", headers=_h(owner_token), timeout=10)
        r2 = requests.delete(f"{BASE_URL}/api/nutrition/foods/{TestCustomFoods.created_member_id}", headers=_h(member_token), timeout=10)
        assert r1.status_code == 200
        assert r2.status_code == 200
        # verify gone
        o_ids = {f["id"] for f in requests.get(f"{BASE_URL}/api/nutrition/foods", headers=_h(owner_token), timeout=10).json().get("foods", [])}
        m_ids = {f["id"] for f in requests.get(f"{BASE_URL}/api/nutrition/foods", headers=_h(member_token), timeout=10).json().get("foods", [])}
        assert TestCustomFoods.created_owner_id not in o_ids
        assert TestCustomFoods.created_member_id not in m_ids

    def test_foods_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/nutrition/foods", timeout=10)
        assert r.status_code in (401, 403)
