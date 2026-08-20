"""Iteration 31 tests:
- GET /api/gyms/nearby (Google Places, real-world gyms)
- Chat pin (GET/POST /api/chat/{room}/pin) — admin only, empty text unpins
- Chat clear (POST /api/chat/{room}/clear) — admin only, wipes messages
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")

OWNER_EMAIL = "the9hutch@gmail.com"
OWNER_PASS = "Hutch-TWVmifIRhU6u8bBl"
MEMBER_EMAIL = "Test@Test.com"
MEMBER_PASS = "test"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password},
                      timeout=15)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok, f"No session_token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def owner_token():
    return _login(OWNER_EMAIL, OWNER_PASS)


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER_EMAIL, MEMBER_PASS)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Gyms Nearby (Google Places) ----------
class TestGymsNearby:
    def test_gyms_nearby_public_returns_real_gyms(self):
        # LA coords — dense in gyms
        r = requests.get(f"{BASE_URL}/api/gyms/nearby",
                         params={"lat": 34.05, "lng": -118.24},
                         timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert "gyms" in data, f"missing gyms key: {data}"
        gyms = data["gyms"]
        # If key mis-configured backend returns error field — surface that
        if not gyms:
            assert data.get("error") is None, f"Places error: {data.get('error')}"
        assert len(gyms) > 0, "Expected at least one gym near LA"
        g = gyms[0]
        for k in ("place_id", "name", "lat", "lng", "source"):
            assert k in g, f"missing key {k} in gym {g}"
        assert g["source"] == "google"
        assert isinstance(g["lat"], (int, float))
        assert isinstance(g["lng"], (int, float))
        assert g["name"]

    def test_gyms_nearby_public_no_auth_needed(self):
        # explicitly ensure no auth header still works (public route)
        r = requests.get(f"{BASE_URL}/api/gyms/nearby?lat=40.7128&lng=-74.0060",
                         timeout=20)
        assert r.status_code == 200


# ---------- Chat pin ----------
class TestChatPin:
    def test_get_pin_initial(self, owner_token):
        # Clear any pre-existing pin first (idempotent) then read
        requests.post(f"{BASE_URL}/api/chat/main/pin",
                      headers=_h(owner_token), json={"text": ""}, timeout=15)
        r = requests.get(f"{BASE_URL}/api/chat/main/pin",
                         headers=_h(owner_token), timeout=15)
        assert r.status_code == 200
        assert r.json() == {"pin": None}

    def test_set_pin_admin(self, owner_token):
        r = requests.post(f"{BASE_URL}/api/chat/main/pin",
                          headers=_h(owner_token),
                          json={"text": "TEST_Welcome rules"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("pin", {}).get("text") == "TEST_Welcome rules"

        # GET returns the pinned text
        g = requests.get(f"{BASE_URL}/api/chat/main/pin",
                         headers=_h(owner_token), timeout=15)
        assert g.status_code == 200
        pin = g.json().get("pin")
        assert pin and pin.get("text") == "TEST_Welcome rules"
        assert "at" in pin

    def test_non_admin_cannot_pin(self, member_token):
        r = requests.post(f"{BASE_URL}/api/chat/main/pin",
                          headers=_h(member_token),
                          json={"text": "should fail"}, timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_empty_text_unpins(self, owner_token):
        # first re-pin
        requests.post(f"{BASE_URL}/api/chat/main/pin",
                      headers=_h(owner_token),
                      json={"text": "TEST_temp"}, timeout=15)
        # now empty text -> unpin
        r = requests.post(f"{BASE_URL}/api/chat/main/pin",
                          headers=_h(owner_token),
                          json={"text": ""}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"pin": None}

        g = requests.get(f"{BASE_URL}/api/chat/main/pin",
                         headers=_h(owner_token), timeout=15)
        assert g.json() == {"pin": None}


# ---------- Chat clear ----------
class TestChatClear:
    def test_non_admin_cannot_clear(self, member_token):
        r = requests.post(f"{BASE_URL}/api/chat/main/clear",
                          headers=_h(member_token), timeout=15)
        assert r.status_code == 403

    def test_admin_clear_wipes_messages(self, owner_token, member_token):
        # Post a message from owner to guarantee at least one
        p = requests.post(f"{BASE_URL}/api/chat/main/messages",
                          headers=_h(owner_token),
                          json={"text": "TEST_iter31 message"}, timeout=15)
        assert p.status_code == 200, p.text

        # Confirm >=1 msg exists
        m = requests.get(f"{BASE_URL}/api/chat/main/messages",
                         headers=_h(owner_token), timeout=15)
        assert m.status_code == 200
        pre_count = len(m.json())
        assert pre_count >= 1

        # Admin clear
        r = requests.post(f"{BASE_URL}/api/chat/main/clear",
                          headers=_h(owner_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "deleted" in body
        assert isinstance(body["deleted"], int)
        assert body["deleted"] >= 1

        # Post-clear: 0 messages
        m2 = requests.get(f"{BASE_URL}/api/chat/main/messages",
                          headers=_h(owner_token), timeout=15)
        assert m2.status_code == 200
        assert len(m2.json()) == 0
