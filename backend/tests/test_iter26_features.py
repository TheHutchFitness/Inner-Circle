"""Iteration 26 backend tests — 3 new features:
   1) Coach ↔ Client reschedule with proposed_by tracking
   2) Client accept endpoint for coach-proposed times
   3) attendance_total on /thread/{cid} + proposed_by on /bookings
   4) GET /api/profile/prs returns bests + recent PR feed
   Plus regression checks for existing booking request/approve/decline/cancel."""
import os
import time
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "the9hutch@gmail.com", "password": "Hutch-TWVmifIRhU6u8bBl"}
CLIENT = {"email": "bot2@circle.ai", "password": "BotPass123!"}
OTHER = {"email": "bot4@circle.ai", "password": "BotPass123!"}


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
def client_token():
    return _login(CLIENT)


@pytest.fixture(scope="module")
def other_token():
    return _login(OTHER)


@pytest.fixture(scope="module")
def client_user_id(client_token):
    r = requests.get(f"{API}/auth/me", headers=_hdr(client_token), timeout=30)
    assert r.status_code == 200, r.text[:200]
    return r.json()["user_id"]


def _fresh_approved_booking(admin_token, client_token, date="2026-11-20", time_="10:00"):
    r = requests.post(f"{API}/inperson/booking/request", headers=_hdr(client_token),
                      json={"date": date, "time": time_, "note": "TEST_iter26",
                            "tz_offset_minutes": 0}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    bid = r.json()["id"]
    r2 = requests.post(f"{API}/inperson/booking/{bid}/approve",
                       headers=_hdr(admin_token), timeout=30)
    assert r2.status_code == 200
    assert r2.json()["status"] == "approved"
    return bid


# --------- Reschedule proposed_by + accept ---------
class TestRescheduleProposedBy:
    def test_coach_reschedule_sets_proposed_by_coach_and_pending(self, admin_token, client_token):
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-21", "10:00")
        r = requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                          headers=_hdr(admin_token),
                          json={"date": "2026-11-28", "time": "09:00",
                                "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body["status"] == "pending"
        assert body["proposed_by"] == "coach"
        assert body["date"] == "2026-11-28"
        assert body["time"] == "09:00"

    def test_client_reschedule_sets_proposed_by_client(self, admin_token, client_token):
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-22", "11:00")
        r = requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                          headers=_hdr(client_token),
                          json={"date": "2026-11-29", "time": "12:00",
                                "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 200
        assert r.json()["proposed_by"] == "client"
        assert r.json()["status"] == "pending"

    def test_reschedule_non_owner_non_admin_403(self, admin_token, client_token, other_token):
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-23", "10:00")
        r = requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                          headers=_hdr(other_token),
                          json={"date": "2026-12-01", "time": "10:00",
                                "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 403

    def test_reschedule_bad_date(self, admin_token, client_token):
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-24", "10:00")
        r = requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                          headers=_hdr(client_token),
                          json={"date": "bad", "time": "10:00", "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 400

    def test_reschedule_bad_time(self, admin_token, client_token):
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-25", "10:00")
        r = requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                          headers=_hdr(client_token),
                          json={"date": "2026-12-05", "time": "9999", "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 400


class TestBookingAccept:
    def test_client_accept_flips_pending_to_approved_and_sets_next_session(
        self, admin_token, client_token, client_user_id
    ):
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-26", "10:00")
        # Coach proposes new time
        r = requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                          headers=_hdr(admin_token),
                          json={"date": "2026-12-08", "time": "15:30",
                                "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 200
        assert r.json()["proposed_by"] == "coach"
        assert r.json()["status"] == "pending"

        # Client accepts
        r2 = requests.post(f"{API}/inperson/booking/{bid}/accept",
                           headers=_hdr(client_token), timeout=30)
        assert r2.status_code == 200, r2.text[:200]
        assert r2.json()["status"] == "approved"

        # Verify inperson_next_session is set on client
        me = requests.get(f"{API}/auth/me", headers=_hdr(client_token), timeout=30).json()
        assert me.get("inperson_next_session") == "2026-12-08 at 15:30"

    def test_accept_by_non_owner_403(self, admin_token, client_token, other_token):
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-27", "10:00")
        # Coach proposes new time
        requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                      headers=_hdr(admin_token),
                      json={"date": "2026-12-09", "time": "14:00",
                            "tz_offset_minutes": 0}, timeout=30)
        # Other bot tries to accept
        r = requests.post(f"{API}/inperson/booking/{bid}/accept",
                          headers=_hdr(other_token), timeout=30)
        assert r.status_code == 403

    def test_accept_missing_booking_404(self, client_token):
        r = requests.post(f"{API}/inperson/booking/ipbk_missing_xyz/accept",
                          headers=_hdr(client_token), timeout=30)
        assert r.status_code == 404


class TestThreadAttendanceAndProposedBy:
    def test_thread_returns_attendance_total_admin(self, admin_token, client_user_id):
        r = requests.get(f"{API}/inperson/thread/{client_user_id}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "attendance_total" in body
        assert isinstance(body["attendance_total"], int)
        assert body["attendance_total"] >= 0

    def test_thread_returns_attendance_total_client(self, client_token, client_user_id):
        r = requests.get(f"{API}/inperson/thread/{client_user_id}", headers=_hdr(client_token), timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "attendance_total" in body
        assert isinstance(body["attendance_total"], int)

    def test_attendance_total_equals_real_count(self, admin_token, client_user_id):
        # Mark a new attendance and confirm attendance_total increments by 1
        pre = requests.get(f"{API}/inperson/thread/{client_user_id}", headers=_hdr(admin_token), timeout=30).json()
        pre_total = pre["attendance_total"]
        r = requests.post(f"{API}/inperson/thread/{client_user_id}/attendance",
                          headers=_hdr(admin_token),
                          json={"note": f"TEST_iter26_att_{int(time.time())}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["count"] == pre_total + 1
        post = requests.get(f"{API}/inperson/thread/{client_user_id}", headers=_hdr(admin_token), timeout=30).json()
        assert post["attendance_total"] == pre_total + 1

    def test_bookings_include_proposed_by(self, admin_token, client_token, client_user_id):
        # Ensure at least one booking with proposed_by exists
        bid = _fresh_approved_booking(admin_token, client_token, "2026-11-30", "10:00")
        requests.post(f"{API}/inperson/booking/{bid}/reschedule",
                      headers=_hdr(admin_token),
                      json={"date": "2026-12-12", "time": "10:00",
                            "tz_offset_minutes": 0}, timeout=30)
        r = requests.get(f"{API}/inperson/bookings?client_id={client_user_id}",
                         headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        rows = r.json()["bookings"]
        assert len(rows) >= 1
        for b in rows:
            assert "proposed_by" in b, f"missing proposed_by on {b.get('id')}"
        # our fresh coach-rescheduled booking should be proposed_by=coach
        target = next((b for b in rows if b["id"] == bid), None)
        assert target and target["proposed_by"] == "coach"


# --------- Profile PRs ---------
class TestProfilePRs:
    def test_prs_endpoint_shape(self, client_token):
        r = requests.get(f"{API}/profile/prs", headers=_hdr(client_token), timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "bests" in body and "recent" in body
        bests = body["bests"]
        for k in ("squat", "bench", "deadlift", "ohp", "total"):
            assert k in bests, f"missing best key {k}"
            assert isinstance(bests[k], int)
        # total should equal sum of the four
        assert bests["total"] == bests["squat"] + bests["bench"] + bests["deadlift"] + bests["ohp"]
        assert isinstance(body["recent"], list)

    def test_prs_recent_has_pr_events(self, client_token):
        """Per fixture context, bot2 has recent PRs (Bench 235, Deadlift 425)."""
        body = requests.get(f"{API}/profile/prs", headers=_hdr(client_token), timeout=30).json()
        assert len(body["recent"]) >= 1
        for r in body["recent"]:
            for f in ("lift", "name", "weight", "previous", "date"):
                assert f in r, f"missing field {f}"

    def test_new_workout_pr_creates_new_recent_entry(self, client_token):
        """Log a workout that beats the current bench PR -> recent[] gets a new entry."""
        pre = requests.get(f"{API}/profile/prs", headers=_hdr(client_token), timeout=30).json()
        cur_bench = int(pre["bests"].get("bench", 0) or 0)
        heavier = max(cur_bench + 5, 245)
        payload = {
            "workout_name": f"TEST_iter26_bench_{int(time.time())}",
            "split_type": "ppl_push",
            "exercises": [
                {"name": "Bench Press",
                 "sets": [{"reps": 3, "weight_lb": heavier, "rpe": 9}]}
            ],
        }
        r = requests.post(f"{API}/workouts/log", headers=_hdr(client_token),
                          json=payload, timeout=30)
        # Accept 200 (log ok) — endpoint should exist
        assert r.status_code == 200, r.text[:300]
        # Poll PRs
        post = requests.get(f"{API}/profile/prs", headers=_hdr(client_token), timeout=30).json()
        assert post["bests"]["bench"] >= heavier
        # Recent should have a Bench Press entry with weight >= heavier
        matches = [x for x in post["recent"] if x.get("lift") == "bench" and int(x.get("weight", 0)) >= heavier]
        assert len(matches) >= 1, f"no matching new PR entry: recent={post['recent'][:3]}"


# --------- Regression ---------
class TestBookingRegression:
    def test_request_and_decline(self, admin_token, client_token):
        r = requests.post(f"{API}/inperson/booking/request", headers=_hdr(client_token),
                          json={"date": "2026-12-15", "time": "10:00", "note": "TEST_regress",
                                "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        r2 = requests.post(f"{API}/inperson/booking/{bid}/decline",
                           headers=_hdr(admin_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "declined"

    def test_request_and_cancel_by_owner(self, client_token):
        r = requests.post(f"{API}/inperson/booking/request", headers=_hdr(client_token),
                          json={"date": "2026-12-16", "time": "11:00", "note": "TEST_regress2",
                                "tz_offset_minutes": 0}, timeout=30)
        assert r.status_code == 200
        bid = r.json()["id"]
        r2 = requests.post(f"{API}/inperson/booking/{bid}/cancel",
                           headers=_hdr(client_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == "cancelled"
