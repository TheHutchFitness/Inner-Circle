"""Backend tests for the In-Person Session Booking feature.

Covers:
  - POST /api/inperson/booking/request (client happy path, 403 non-client, 400 invalid date/time)
  - GET  /api/inperson/bookings (client vs admin, ?client_id= filter)
  - POST /api/inperson/booking/{id}/approve  (admin only; sets inperson_next_session)
  - POST /api/inperson/booking/{id}/decline  (admin only)
  - POST /api/inperson/booking/{id}/cancel   (owner client or admin)
  - Existence of POST /api/register-push (500 expected in preview = wired)
  - Regression: /api/inperson/clients, /api/inperson/thread/{cid}, POST /message
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")
            or "https://powerup-arena.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "the9hutch@gmail.com"
ADMIN_PASS = "Hutch-TWVmifIRhU6u8bBl"
CLIENT_EMAIL = "bot2@circle.ai"
CLIENT_PASS = "BotPass123!"
NONCLIENT_EMAIL = "bot3@circle.ai"
NONCLIENT_PASS = "BotPass123!"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("session_token") or r.json().get("token")
    assert tok, f"no token in login resp: {r.json()}"
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(ADMIN_EMAIL, ADMIN_PASS),
        "client": _login(CLIENT_EMAIL, CLIENT_PASS),
        "nonclient": _login(NONCLIENT_EMAIL, NONCLIENT_PASS),
    }


@pytest.fixture(scope="module")
def client_uid(tokens):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tokens["client"]), timeout=30)
    assert r.status_code == 200
    return r.json()["user_id"]


class TestBookingRequest:
    def test_client_can_request(self, tokens):
        payload = {"date": "2026-12-15", "time": "07:30", "note": "TEST_booking", "tz_offset_minutes": 0}
        r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                          headers=_h(tokens["client"]), json=payload, timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        b = r.json()
        assert b["status"] == "pending"
        assert b["date"] == "2026-12-15"
        assert b["time"] == "07:30"
        assert b["id"].startswith("ipbk_")
        pytest.booking_id = b["id"]

    def test_nonclient_forbidden(self, tokens):
        r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                          headers=_h(tokens["nonclient"]),
                          json={"date": "2026-12-16", "time": "08:00", "tz_offset_minutes": 0},
                          timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"

    def test_invalid_date(self, tokens):
        r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                          headers=_h(tokens["client"]),
                          json={"date": "not-a-date", "time": "07:30", "tz_offset_minutes": 0},
                          timeout=30)
        assert r.status_code == 400

    def test_invalid_time(self, tokens):
        r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                          headers=_h(tokens["client"]),
                          json={"date": "2026-12-15", "time": "25xx", "tz_offset_minutes": 0},
                          timeout=30)
        assert r.status_code == 400


class TestBookingsList:
    def test_client_sees_own(self, tokens, client_uid):
        r = requests.get(f"{BASE_URL}/api/inperson/bookings", headers=_h(tokens["client"]), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "bookings" in data
        # every returned row belongs to caller
        for b in data["bookings"]:
            assert b["client_id"] == client_uid

    def test_admin_sees_all(self, tokens):
        r = requests.get(f"{BASE_URL}/api/inperson/bookings", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json().get("bookings"), list)

    def test_admin_filter_by_client(self, tokens, client_uid):
        r = requests.get(f"{BASE_URL}/api/inperson/bookings?client_id={client_uid}",
                         headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        for b in r.json()["bookings"]:
            assert b["client_id"] == client_uid


def _mk_booking(tok, date, time):
    r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                      headers=_h(tok),
                      json={"date": date, "time": time, "tz_offset_minutes": 0}, timeout=30)
    assert r.status_code == 200, r.text[:300]
    return r.json()["id"]


class TestApproveDeclineCancel:
    def test_nonadmin_cannot_approve(self, tokens):
        bid = _mk_booking(tokens["client"], "2026-12-20", "07:30")
        r = requests.post(f"{BASE_URL}/api/inperson/booking/{bid}/approve",
                          headers=_h(tokens["client"]), timeout=30)
        assert r.status_code == 403

    def test_admin_approve_sets_next_session(self, tokens, client_uid):
        bid = _mk_booking(tokens["client"], "2026-12-21", "08:00")
        r = requests.post(f"{BASE_URL}/api/inperson/booking/{bid}/approve",
                          headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200, r.text[:300]
        b = r.json()
        assert b["status"] == "approved"
        # verify persistence via GET
        r2 = requests.get(f"{BASE_URL}/api/inperson/bookings?client_id={client_uid}",
                          headers=_h(tokens["admin"]), timeout=30)
        assert r2.status_code == 200
        match = [x for x in r2.json()["bookings"] if x["id"] == bid]
        assert match and match[0]["status"] == "approved"
        # inperson_next_session should now be set on the user
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tokens["client"]), timeout=30).json()
        assert me.get("inperson_next_session"), "inperson_next_session should be set after approve"

    def test_admin_decline(self, tokens):
        # create another booking to decline
        r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                          headers=_h(tokens["client"]),
                          json={"date": "2026-12-17", "time": "09:00", "tz_offset_minutes": 0},
                          timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        r2 = requests.post(f"{BASE_URL}/api/inperson/booking/{bid}/decline",
                           headers=_h(tokens["admin"]), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "declined"

    def test_cancel_by_client(self, tokens):
        r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                          headers=_h(tokens["client"]),
                          json={"date": "2026-12-18", "time": "10:30", "tz_offset_minutes": 0},
                          timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        rc = requests.post(f"{BASE_URL}/api/inperson/booking/{bid}/cancel",
                           headers=_h(tokens["client"]), timeout=30)
        assert rc.status_code == 200
        assert rc.json()["status"] == "cancelled"

    def test_cancel_by_admin(self, tokens):
        r = requests.post(f"{BASE_URL}/api/inperson/booking/request",
                          headers=_h(tokens["client"]),
                          json={"date": "2026-12-19", "time": "11:00", "tz_offset_minutes": 0},
                          timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        rc = requests.post(f"{BASE_URL}/api/inperson/booking/{bid}/cancel",
                           headers=_h(tokens["admin"]), timeout=30)
        assert rc.status_code == 200
        assert rc.json()["status"] == "cancelled"


class TestRegisterPushWired:
    def test_route_exists(self, tokens):
        """In preview EMERGENT_PUSH_KEY is a placeholder → expect 500/502, NOT 404."""
        r = requests.post(f"{BASE_URL}/api/register-push",
                          headers=_h(tokens["client"]),
                          json={"user_id": "u", "platform": "ios", "device_token": "xxx"},
                          timeout=30)
        assert r.status_code != 404, "route not wired"
        # 500 (missing key) or 502 (provider) are the expected preview responses
        assert r.status_code in (200, 201, 500, 502), f"unexpected {r.status_code}: {r.text[:200]}"


class TestInPersonRegression:
    def test_admin_list_clients(self, tokens):
        r = requests.get(f"{BASE_URL}/api/inperson/clients", headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_thread_open(self, tokens, client_uid):
        r = requests.get(f"{BASE_URL}/api/inperson/thread/{client_uid}",
                         headers=_h(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "messages" in d and "client" in d

    def test_send_message(self, tokens, client_uid):
        r = requests.post(f"{BASE_URL}/api/inperson/thread/{client_uid}/message",
                          headers=_h(tokens["admin"]),
                          json={"text": "TEST_regression_msg"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("text") == "TEST_regression_msg"
