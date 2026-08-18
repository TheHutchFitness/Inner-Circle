"""Backend tests for Hutch's Inner Circle."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
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


@pytest.fixture(scope="module")
def fresh_token():
    # Isolated brand-new user for workout-mutating tests so shared seed
    # accounts don't drift in XP/rank across the suite.
    import uuid as _uuid
    email = f"fresh_{_uuid.uuid4().hex[:10]}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "display_name": "Fresh"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


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
    def test_log_workout_awards_milestone_and_xp(self, fresh_token):
        # Get pre-state
        pre = requests.get(f"{API}/auth/me", headers=auth_h(fresh_token), timeout=15).json()
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
        r = requests.post(f"{API}/workouts/log", json=payload, headers=auth_h(fresh_token), timeout=20)
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
        r = requests.post(f"{API}/profile/skool-verify", json={"code": "4882"}, headers=auth_h(athlete_token), timeout=15)
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
        requests.post(f"{API}/profile/skool-verify", json={"code": "4882"}, headers=auth_h(elite_token), timeout=15)
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
        requests.post(f"{API}/profile/skool-verify", json={"code": "4882"}, headers=auth_h(elite_token), timeout=15)

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
        # Note: /api/ai/programs is capped at 20; verify the newly-created program is present at top instead
        assert any(p.get("program_id") == pid for p in post_rows), f"new program {pid} missing from list"
        # If we weren't already at cap, verify the list grew
        if pre_len < 20:
            assert len(post_rows) >= pre_len + 1
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

    def test_recap_reflects_new_workout(self, fresh_token):
        pre = requests.get(f"{API}/recap/weekly", headers=auth_h(fresh_token), timeout=15).json()
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
        r = requests.post(f"{API}/workouts/log", json=payload, headers=auth_h(fresh_token), timeout=20)
        assert r.status_code == 200, r.text
        gain = r.json()["xp_gained"]
        post = requests.get(f"{API}/recap/weekly", headers=auth_h(fresh_token), timeout=15).json()
        assert post["workouts"] == pre["workouts"] + 1
        assert post["xp_gained"] == pre["xp_gained"] + gain
        # 5*245 + 3*255 = 1225 + 765 = 1990
        assert post["total_volume_lb"] >= pre["total_volume_lb"] + 1990
        # PR was hit (bench went 225 or higher -> 255)
        assert post["pr_count"] >= pre["pr_count"] + 1

    def test_recap_requires_auth(self):
        r = requests.get(f"{API}/recap/weekly", timeout=15)
        assert r.status_code in (401, 403)


# NEW: AI sessions payload for Program-to-Logger
class TestAISessions:
    def test_build_workout_returns_clean_program_text_and_sessions(self, elite_token):
        # Ensure elite is skool-verified
        requests.post(f"{API}/profile/skool-verify", json={"code": "4882"},
                      headers=auth_h(elite_token), timeout=15)
        payload = {"goal": "strength", "split": "ppl", "days_per_week": 5, "experience": "elite", "notes": "TEST_sessions"}
        r = requests.post(f"{API}/ai/build-workout", json=payload, headers=auth_h(elite_token), timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        # program_text must NOT contain the delimiter
        assert "===SESSIONS_JSON===" not in body["program_text"], "delimiter leaked into program_text"
        # sessions array present and non-empty
        assert "sessions" in body
        sessions = body["sessions"]
        assert isinstance(sessions, list) and len(sessions) >= 1, f"sessions missing/empty: {sessions}"
        s0 = sessions[0]
        assert "name" in s0 and isinstance(s0["name"], str)
        assert "split_key" in s0
        assert "exercises" in s0 and isinstance(s0["exercises"], list) and len(s0["exercises"]) >= 1
        ex = s0["exercises"][0]
        for key in ("name", "sets", "reps", "rpe", "weight_lb"):
            assert key in ex, f"exercise missing {key}: {ex}"

    def test_programs_list_includes_sessions_field(self, elite_token):
        r = requests.get(f"{API}/ai/programs", headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        top = rows[0]
        assert "sessions" in top, f"sessions missing from list item keys={list(top.keys())}"
        assert isinstance(top["sessions"], list)


# NEW: Rank-up on workout log
class TestRankUp:
    def test_finish_workout_returns_rank_and_promotion(self):
        # Fresh user starts as Beginner (0 XP). Threshold Intermediate = 500 XP.
        import uuid as _uuid
        email = f"rankup_{_uuid.uuid4().hex[:8]}@test.com"
        reg = requests.post(f"{API}/auth/register",
                            json={"email": email, "password": "Passw0rd!", "display_name": "RankUp"}, timeout=15)
        assert reg.status_code == 200, reg.text
        tok = reg.json()["session_token"]
        me = requests.get(f"{API}/auth/me", headers=auth_h(tok), timeout=15).json()
        assert me["rank"] == "Beginner", f"fresh user rank not Beginner: {me['rank']}"

        # Heavy sessions ~ each awards good XP; log until we cross 500
        heavy = {
            "workout_name": "TEST_RankUp",
            "split_type": "ppl_push",
            "exercises": [
                {"name": "Bench Press", "sets": [
                    {"reps": 5, "weight_lb": 225, "rpe": 8.0},
                    {"reps": 5, "weight_lb": 235, "rpe": 8.5},
                    {"reps": 5, "weight_lb": 245, "rpe": 9.0},
                ]},
                {"name": "Overhead Press", "sets": [
                    {"reps": 5, "weight_lb": 135, "rpe": 8.0},
                ]},
            ],
            "rating": 5,
        }
        prev_rank = "Beginner"
        rank_after = None
        for _ in range(12):
            r = requests.post(f"{API}/workouts/log", json=heavy, headers=auth_h(tok), timeout=20)
            assert r.status_code == 200, r.text
            body = r.json()
            # Response must include updated user w/ rank + xp
            assert "user" in body and "rank" in body["user"] and "xp" in body["user"]
            rank_after = body["user"]["rank"]
            if body["user"]["xp"] >= 500:
                break
        assert rank_after == "Intermediate", f"user should have crossed to Intermediate, got {rank_after}"


# NEW: Rank Perk background + LEVEL leaderboard label
class TestRankPerkBackground:
    def test_xp_leaderboard_metric_label_is_level(self, athlete_token):
        r = requests.get(f"{API}/leaderboard/xp", headers=auth_h(athlete_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert rows[0]["metric_label"] == "LEVEL", f"expected LEVEL, got {rows[0]['metric_label']}"
        # metric should be integer-ish (level)
        assert isinstance(rows[0]["metric"], int)

    def test_rank_up_unlocks_and_equips_perk_background(self):
        import uuid as _uuid
        email = f"perk_{_uuid.uuid4().hex[:8]}@test.com"
        reg = requests.post(f"{API}/auth/register",
                            json={"email": email, "password": "Passw0rd!", "display_name": "Perk"}, timeout=15)
        assert reg.status_code == 200, reg.text
        tok = reg.json()["session_token"]

        # Confirm initial bg = default and rank = Beginner
        me = requests.get(f"{API}/auth/me", headers=auth_h(tok), timeout=15).json()
        assert me["rank"] == "Beginner"
        assert me.get("active_background") == "bg_default"

        heavy = {
            "workout_name": "TEST_Perk",
            "split_type": "ppl_push",
            "exercises": [
                {"name": "Bench Press", "sets": [
                    {"reps": 5, "weight_lb": 225, "rpe": 8.0},
                    {"reps": 5, "weight_lb": 235, "rpe": 8.5},
                    {"reps": 5, "weight_lb": 245, "rpe": 9.0},
                ]},
                {"name": "Overhead Press", "sets": [
                    {"reps": 5, "weight_lb": 135, "rpe": 8.0},
                ]},
            ],
            "rating": 5,
        }
        ranked_up_body = None
        for _ in range(12):
            r = requests.post(f"{API}/workouts/log", json=heavy, headers=auth_h(tok), timeout=20)
            assert r.status_code == 200, r.text
            body = r.json()
            # Every response must carry the new keys
            for key in ("ranked_up", "prev_rank", "unlocked_background"):
                assert key in body, f"missing {key} in workouts/log response"
            if body["ranked_up"]:
                ranked_up_body = body
                break
        assert ranked_up_body is not None, "did not rank up within 12 workouts"
        assert ranked_up_body["prev_rank"] == "Beginner"
        assert ranked_up_body["user"]["rank"] == "Intermediate"
        unlocked = ranked_up_body["unlocked_background"]
        assert unlocked is not None and unlocked["id"] == "bg_cyber", f"expected bg_cyber, got {unlocked}"
        # active_background auto-equipped on user
        assert ranked_up_body["user"]["active_background"] == "bg_cyber"

        # /unlockables reflects the perk as unlocked + active
        u = requests.get(f"{API}/unlockables", headers=auth_h(tok), timeout=15)
        assert u.status_code == 200
        bgs = {b["id"]: b for b in u.json()["backgrounds"]}
        assert bgs["bg_cyber"]["unlocked"] is True
        assert bgs["bg_cyber"]["active"] is True
        assert bgs["bg_cyber"].get("perk_rank") == "Intermediate"
