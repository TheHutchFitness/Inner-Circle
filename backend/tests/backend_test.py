"""Backend tests for Hutch's Inner Circle."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://a70a5bac-72b5-4fcc-aab5-732095e525cd.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ATHLETE = {"email": "athlete@test.com", "password": "TestPass123!"}
ELITE = {"email": "elite@test.com", "password": "TestPass123!"}
FREAK = {"email": "freak@test.com", "password": "TestPass123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def athlete_token():
    return _login(ATHLETE)


@pytest.fixture(scope="module")
def elite_token():
    return _login(ELITE)


def auth_h(tok):
    return {"Authorization": f"Bearer {tok}"}


# Auth
class TestAuth:
    def test_register_and_login(self):
        import uuid
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "display_name": "T"}, timeout=15)
        assert r.status_code == 200, r.text
        tok = r.json()["session_token"]
        assert tok
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Passw0rd!"}, timeout=15)
        assert r2.status_code == 200

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ATHLETE["email"], "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_returns_rank(self, athlete_token):
        r = requests.get(f"{API}/auth/me", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "rank" in data
        assert data["rank"] == "Intermediate"


# Programs
class TestPrograms:
    def test_list_programs(self, athlete_token):
        r = requests.get(f"{API}/programs", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        progs = r.json()
        splits = {p["split"] for p in progs}
        assert "ppl" in splits and "upper_lower" in splits


# Workouts
class TestWorkouts:
    def test_log_workout_awards_milestone_and_xp(self, athlete_token):
        # Get pre-state
        pre = requests.get(f"{API}/auth/me", headers=auth_h(athlete_token), timeout=15).json()
        pre_xp = pre["xp"]
        pre_workouts = pre["workouts_logged"]

        payload = {
            "workout_name": "Push Day",
            "split_type": "ppl_push",
            "exercises": [
                {"name": "Bench Press", "sets": [
                    {"reps": 5, "weight_lb": 225, "rpe": 8.0},
                    {"reps": 3, "weight_lb": 235, "rpe": 9.0}
                ]}
            ],
            "rating": 5,
        }
        r = requests.post(f"{API}/workouts/log", json=payload, headers=auth_h(athlete_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["xp_gained"] > 0
        assert body["user"]["workouts_logged"] == pre_workouts + 1
        assert body["user"]["xp"] == pre_xp + body["xp_gained"]
        badges = body["user"]["badges"]
        assert "bench_225" in badges
        # bench PR should be >=235 now
        assert body["user"]["prs"]["bench"] >= 235

    def test_history_contains_log(self, athlete_token):
        r = requests.get(f"{API}/workouts/history", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert any(x["workout_name"] == "Push Day" for x in rows)

    def test_progress_chart(self, athlete_token):
        r = requests.get(f"{API}/progress/chart", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "bench" in data
        assert len(data["bench"]) >= 1


# Leaderboards
class TestLeaderboards:
    @pytest.mark.parametrize("board", ["xp", "strength", "ratio"])
    def test_boards(self, athlete_token, board):
        r = requests.get(f"{API}/leaderboard/{board}", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 3
        assert len(rows) <= 50
        assert "metric" in rows[0] and "metric_label" in rows[0]
        # verify sorted desc
        metrics = [row["metric"] for row in rows]
        assert metrics == sorted(metrics, reverse=True)


# Profile
class TestProfile:
    def test_skool_verify_wrong(self, athlete_token):
        r = requests.post(f"{API}/profile/skool-verify", json={"code": "WRONG"}, headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 400

    def test_skool_verify_correct(self, athlete_token):
        r = requests.post(f"{API}/profile/skool-verify", json={"code": "HUTCH-INNER-CIRCLE-2026"}, headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["skool_verified"] is True

    def test_update_profile(self, athlete_token):
        r = requests.patch(f"{API}/profile/update", json={"avatar_id": "avatar_kaido", "bodyweight_lb": 185, "age": 28, "sex": "male"}, headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["avatar_id"] == "avatar_kaido"
        assert d["bodyweight_lb"] == 185
        assert d["age"] == 28


# Chat
class TestChat:
    def test_main_room_seeded(self, athlete_token):
        r = requests.get(f"{API}/chat/main/messages", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_post_main(self, athlete_token):
        r = requests.post(f"{API}/chat/main/messages", json={"text": "TEST_msg hello"}, headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["text"] == "TEST_msg hello"

    def test_the_room_denied_for_intermediate(self, athlete_token):
        r = requests.post(f"{API}/chat/the_room/messages", json={"text": "in"}, headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 403

    def test_the_room_allowed_for_elite(self, elite_token):
        r = requests.post(f"{API}/chat/the_room/messages", json={"text": "TEST_elite in"}, headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200


# AI
class TestAI:
    def test_ai_denied_for_intermediate(self, athlete_token):
        payload = {"goal": "strength", "split": "ppl", "days_per_week": 5, "experience": "intermediate", "notes": ""}
        r = requests.post(f"{API}/ai/build-workout", json=payload, headers=auth_h(athlete_token), timeout=60)
        assert r.status_code == 403

    def test_ai_allowed_for_elite(self, elite_token):
        # Ensure skool-verified for elite
        requests.post(f"{API}/profile/skool-verify", json={"code": "HUTCH-INNER-CIRCLE-2026"}, headers=auth_h(elite_token), timeout=15)
        payload = {"goal": "strength", "split": "ppl", "days_per_week": 5, "experience": "elite", "notes": "short"}
        r = requests.post(f"{API}/ai/build-workout", json=payload, headers=auth_h(elite_token), timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "program_text" in body
        assert len(body["program_text"]) > 50
        assert "program_id" in body


# Program History (new feature)
class TestProgramHistory:
    def test_ai_programs_list_reflects_new_program(self, elite_token):
        # Ensure skool-verified
        requests.post(f"{API}/profile/skool-verify", json={"code": "HUTCH-INNER-CIRCLE-2026"}, headers=auth_h(elite_token), timeout=15)

        # Snapshot current list
        pre = requests.get(f"{API}/ai/programs", headers=auth_h(elite_token), timeout=15)
        assert pre.status_code == 200
        pre_rows = pre.json()
        assert isinstance(pre_rows, list)
        pre_len = len(pre_rows)

        # Create a new program
        payload = {"goal": "hypertrophy", "split": "upper_lower", "days_per_week": 4, "experience": "elite", "notes": "TEST_history"}
        r = requests.post(f"{API}/ai/build-workout", json=payload, headers=auth_h(elite_token), timeout=120)
        assert r.status_code == 200, r.text
        pid = r.json()["program_id"]

        # Verify persistence
        post = requests.get(f"{API}/ai/programs", headers=auth_h(elite_token), timeout=15)
        assert post.status_code == 200
        post_rows = post.json()
        # Note: other tests may also create programs in parallel, so use >= pre_len+1
        assert len(post_rows) >= pre_len + 1
        assert any(p.get("program_id") == pid for p in post_rows)
        # Fields
        top = post_rows[0]
        for key in ("program_id", "program_text", "created_at"):
            assert key in top
        # No mongo _id leaking
        assert "_id" not in top


# Weekly Recap (new feature)
class TestWeeklyRecap:
    def test_recap_shape(self, athlete_token):
        r = requests.get(f"{API}/recap/weekly", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("display_name", "avatar_id", "xp_gained", "workouts", "total_volume_lb", "prs", "pr_count", "rank_now", "rank_start", "promoted", "level"):
            assert key in d, f"missing {key}"
        assert isinstance(d["prs"], list)
        assert isinstance(d["xp_gained"], int)
        assert isinstance(d["workouts"], int)
        assert isinstance(d["total_volume_lb"], int)

    def test_recap_reflects_new_workout(self, athlete_token):
        pre = requests.get(f"{API}/recap/weekly", headers=auth_h(athlete_token), timeout=15).json()
        payload = {
            "workout_name": "TEST_Recap Push",
            "split_type": "ppl_push",
            "exercises": [
                {"name": "Bench Press", "sets": [
                    {"reps": 5, "weight_lb": 245, "rpe": 8.5},
                    {"reps": 3, "weight_lb": 255, "rpe": 9.5}
                ]}
            ],
            "rating": 5,
        }
        r = requests.post(f"{API}/workouts/log", json=payload, headers=auth_h(athlete_token), timeout=20)
        assert r.status_code == 200, r.text
        gain = r.json()["xp_gained"]
        post = requests.get(f"{API}/recap/weekly", headers=auth_h(athlete_token), timeout=15).json()
        assert post["workouts"] == pre["workouts"] + 1
        assert post["xp_gained"] == pre["xp_gained"] + gain
        # 5*245 + 3*255 = 1225 + 765 = 1990
        assert post["total_volume_lb"] >= pre["total_volume_lb"] + 1990
        # PR was hit (bench went 225 or higher -> 255)
        assert post["pr_count"] >= pre["pr_count"] + 1

    def test_recap_requires_auth(self):
        r = requests.get(f"{API}/recap/weekly", timeout=15)
        assert r.status_code in (401, 403)
