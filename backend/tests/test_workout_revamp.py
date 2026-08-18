"""Backend tests for the WORKOUT REVAMP iteration:
- GET /api/workout/templates (8 templates)
- GET /api/exercises (library=73 + custom)
- POST /api/exercises/custom
- GET /api/exercise/stats?name=&rng=
- GET /api/exercise/log?name=
- GET /api/exercise/graph?name=
- POST /api/workouts/log with split_type='push' + Barbell Bench Press => bench PR
- POST /api/profile/skool-verify with '4882' => 200; wrong => 400
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def auth_h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def athlete_token():
    # athlete@ has 'Bench Press' history
    return _login("athlete@test.com", "TestPass123!")


@pytest.fixture(scope="module")
def fresh_token():
    email = f"revamp_{uuid.uuid4().hex[:10]}@test.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "Passw0rd!", "display_name": "Revamp"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


# ---- Workout templates ----
class TestWorkoutTemplates:
    def test_returns_8_named_templates(self, athlete_token):
        r = requests.get(f"{API}/workout/templates", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 8, f"expected 8 templates, got {len(data)}"
        ids = [t["id"] for t in data]
        for expected in ["push", "pull", "legs", "upper", "lower", "arnold", "fullbody", "custom"]:
            assert expected in ids, f"missing template id={expected}"
        push = next(t for t in data if t["id"] == "push")
        assert "Barbell Bench Press" in push["exercises"]


# ---- Exercise library ----
class TestExerciseLibrary:
    def test_returns_library_and_custom(self, athlete_token):
        r = requests.get(f"{API}/exercises", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "library" in data and "custom" in data
        assert len(data["library"]) == 73, f"expected 73 library items, got {len(data['library'])}"
        assert all("name" in x and "category" in x for x in data["library"])
        cats = {x["category"] for x in data["library"]}
        # spot check categories
        for c in ("Chest", "Back", "Shoulders", "Legs", "Arms", "Core"):
            assert c in cats, f"missing category {c}"

    def test_add_custom_exercise(self, fresh_token):
        name = f"TEST_Custom_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/exercises/custom",
                          json={"name": name, "category": "Custom"},
                          headers=auth_h(fresh_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "custom" in body and "added" in body
        assert body["added"]["name"] == name
        assert any(c["name"] == name for c in body["custom"])

        # GET verify persistence
        r2 = requests.get(f"{API}/exercises", headers=auth_h(fresh_token), timeout=15)
        assert r2.status_code == 200
        assert any(c["name"] == name for c in r2.json()["custom"])

    def test_add_custom_rejects_empty(self, fresh_token):
        r = requests.post(f"{API}/exercises/custom", json={"name": "   "},
                          headers=auth_h(fresh_token), timeout=15)
        assert r.status_code == 400


# ---- Exercise stats / log / graph ----
class TestExerciseStats:
    def test_stats_bench_all_populated(self, athlete_token):
        r = requests.get(f"{API}/exercise/stats",
                         params={"name": "Bench Press", "rng": "all"},
                         headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_sets", "total_workouts", "total_weight", "total_reps",
                  "total_volume", "avg_weight", "avg_reps", "avg_volume",
                  "max_weight", "max_weight_date", "max_reps", "max_reps_date",
                  "max_volume", "max_volume_date",
                  "avg_max_weight", "avg_max_reps", "avg_max_volume"):
            assert k in d, f"missing key {k}"
        assert d["range"] == "all"
        # athlete has Bench Press history — expect non-zero
        assert d["total_sets"] > 0, "athlete@ should have Bench Press history"
        assert d["total_workouts"] > 0
        assert d["max_weight"] > 0
        assert d["max_weight_date"] is not None

    @pytest.mark.parametrize("rng", ["1w", "1m", "3m", "all"])
    def test_stats_ranges_all_return_200(self, athlete_token, rng):
        r = requests.get(f"{API}/exercise/stats",
                         params={"name": "Bench Press", "rng": rng},
                         headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["range"] == rng

    def test_stats_unknown_exercise_returns_zeros(self, athlete_token):
        r = requests.get(f"{API}/exercise/stats",
                         params={"name": "Nonexistent Lift", "rng": "all"},
                         headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["total_sets"] == 0
        assert d["max_weight"] == 0

    def test_log_returns_sessions_with_sets(self, athlete_token):
        r = requests.get(f"{API}/exercise/log",
                         params={"name": "Bench Press"},
                         headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Bench Press"
        assert isinstance(d["sessions"], list)
        assert len(d["sessions"]) > 0
        s0 = d["sessions"][0]
        assert "date" in s0 and "sets" in s0 and "workout_name" in s0
        assert isinstance(s0["sets"], list) and len(s0["sets"]) > 0
        for st in s0["sets"]:
            for k in ("reps", "weight_lb", "rpe"):
                assert k in st

    def test_graph_returns_points(self, athlete_token):
        r = requests.get(f"{API}/exercise/graph",
                         params={"name": "Bench Press"},
                         headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Bench Press"
        assert isinstance(d["points"], list)
        assert len(d["points"]) > 0
        for p in d["points"]:
            for k in ("date", "weight", "volume"):
                assert k in p


# ---- Workout log with split_type='push' + Barbell Bench Press PR ----
class TestPushSplitLog:
    def test_push_split_logs_and_bench_pr(self, fresh_token):
        pre = requests.get(f"{API}/auth/me", headers=auth_h(fresh_token), timeout=15).json()
        pre_xp = pre["xp"]
        payload = {
            "workout_name": "Push",
            "split_type": "push",
            "exercises": [
                {"name": "Barbell Bench Press", "sets": [
                    {"reps": 5, "weight_lb": 205, "rpe": 8.0},
                    {"reps": 3, "weight_lb": 225, "rpe": 9.0},
                ]},
                {"name": "Overhead Press", "sets": [
                    {"reps": 5, "weight_lb": 115, "rpe": 8.0},
                ]},
            ],
            "rating": 5,
        }
        r = requests.post(f"{API}/workouts/log", json=payload,
                          headers=auth_h(fresh_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["xp_gained"] > 0
        assert body["user"]["xp"] == pre_xp + body["xp_gained"]
        # Barbell Bench Press should still count as bench PR (via alias)
        assert body["user"]["prs"].get("bench", 0) >= 225, f"bench PR not set: {body['user']['prs']}"


# ---- Skool verify with new 4-digit code ----
class TestSkool4882:
    def test_correct_code(self, athlete_token):
        r = requests.post(f"{API}/profile/skool-verify",
                          json={"code": "4882"},
                          headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["skool_verified"] is True

    def test_wrong_code_returns_400(self, athlete_token):
        r = requests.post(f"{API}/profile/skool-verify",
                          json={"code": "0000"},
                          headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 400

    def test_old_long_code_rejected(self, athlete_token):
        r = requests.post(f"{API}/profile/skool-verify",
                          json={"code": "HUTCH-INNER-CIRCLE-2026"},
                          headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 400
