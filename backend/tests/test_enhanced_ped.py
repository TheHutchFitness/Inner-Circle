"""
Backend tests for The Enhanced room + PED tracker (iteration 16).
Covers:
 - Auth login for enhanced user (athlete@test.com)
 - GET /api/enhanced/peds (non-empty list, disclaimer)
 - GET /api/enhanced/status
 - GET /api/enhanced/regimen shape { active, history }
 - POST /api/enhanced/regimen for enhanced user -> 200 and becomes active
 - POST /api/enhanced/regimen replaces previous, archives to history
 - POST /api/enhanced/regimen with a fresh (non-enhanced, non-consented) user -> 403
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ATHLETE_EMAIL = "athlete@test.com"
ATHLETE_PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def athlete_token():
    r = requests.post(f"{API}/auth/login", json={"email": ATHLETE_EMAIL, "password": ATHLETE_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("session_token"), "no session_token"
    return data["session_token"]


@pytest.fixture(scope="module")
def fresh_user_token():
    # Register a brand-new (non-enhanced, no subscription) user
    suffix = uuid.uuid4().hex[:10]
    email = f"TEST_enh_{suffix}@example.com"
    payload = {"email": email, "password": "TestPass123!", "display_name": f"TEST_{suffix}"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("session_token")
    assert tok
    return tok


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Enhanced PED library ----------
def test_enhanced_peds_non_empty(athlete_token):
    r = requests.get(f"{API}/enhanced/peds", headers=_auth(athlete_token), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    peds = data.get("peds") or []
    assert isinstance(peds, list) and len(peds) > 0, "peds list empty"
    sample = peds[0]
    for k in ("name", "class", "desc"):
        assert k in sample and sample[k], f"missing field {k} in {sample}"
    assert data.get("disclaimer"), "disclaimer missing"


def test_enhanced_status(athlete_token):
    r = requests.get(f"{API}/enhanced/status", headers=_auth(athlete_token), timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    # athlete@test.com is seeded as enhanced=true
    assert j.get("enhanced") is True, f"expected enhanced=true for athlete, got {j}"
    assert "disclaimer" in j


def test_enhanced_regimen_shape(athlete_token):
    r = requests.get(f"{API}/enhanced/regimen", headers=_auth(athlete_token), timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "active" in j and "history" in j
    assert isinstance(j["history"], list)


# ---------- POST regimen: enhanced user ----------
def test_post_regimen_activates_and_replaces(athlete_token):
    peds = requests.get(f"{API}/enhanced/peds", headers=_auth(athlete_token), timeout=20).json()["peds"]
    name1 = peds[0]["name"]
    name2 = peds[1]["name"] if len(peds) > 1 else peds[0]["name"]

    # First regimen
    body1 = {"items": [{"name": name1, "dosage": "TEST_250mg", "schedule": "Mon/Thu"}]}
    r1 = requests.post(f"{API}/enhanced/regimen", headers=_auth(athlete_token), json=body1, timeout=20)
    assert r1.status_code == 200, r1.text

    g1 = requests.get(f"{API}/enhanced/regimen", headers=_auth(athlete_token), timeout=20).json()
    assert g1.get("active"), "no active regimen after POST"
    active_items = g1["active"]["items"]
    assert any(it.get("name") == name1 and it.get("dosage") == "TEST_250mg" for it in active_items), \
        f"active regimen doesn't contain posted item: {active_items}"

    # Second regimen — previous should be archived to history
    body2 = {"items": [{"name": name2, "dosage": "TEST_500mg", "schedule": "Sun"}]}
    r2 = requests.post(f"{API}/enhanced/regimen", headers=_auth(athlete_token), json=body2, timeout=20)
    assert r2.status_code == 200, r2.text

    g2 = requests.get(f"{API}/enhanced/regimen", headers=_auth(athlete_token), timeout=20).json()
    assert g2.get("active"), "no active after 2nd POST"
    active_items2 = g2["active"]["items"]
    assert any(it.get("dosage") == "TEST_500mg" for it in active_items2), \
        "new regimen not active"
    # History should contain the old TEST_250mg
    hist = g2.get("history") or []
    flat_dosages = [it.get("dosage") for h in hist for it in (h.get("items") or [])]
    assert "TEST_250mg" in flat_dosages, f"previous regimen not archived to history: {flat_dosages}"


# ---------- POST regimen: non-enhanced user -> 403 ----------
def test_post_regimen_non_enhanced_forbidden(fresh_user_token):
    body = {"items": [{"name": "Testosterone Enanthate", "dosage": "250mg", "schedule": "Mon/Thu"}]}
    r = requests.post(f"{API}/enhanced/regimen", headers=_auth(fresh_user_token), json=body, timeout=20)
    assert r.status_code == 403, f"expected 403 for non-enhanced user, got {r.status_code} {r.text}"


def test_fresh_user_status_not_enhanced(fresh_user_token):
    r = requests.get(f"{API}/enhanced/status", headers=_auth(fresh_user_token), timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("enhanced") in (False, None), f"fresh user should not be enhanced: {j}"
