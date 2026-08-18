"""Backend tests for QUESTS + profile/attributes (new features)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def auth_h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register_fresh():
    email = f"quest_{uuid.uuid4().hex[:10]}@test.com"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "Passw0rd!", "display_name": "QuestUser"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def freak_token():
    r = requests.post(f"{API}/auth/login", json={"email": "freak@test.com", "password": "TestPass123!"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


# ---------- GET /api/quests ----------
class TestQuestsList:
    @pytest.mark.parametrize("scope", ["daily", "weekly", "monthly"])
    def test_scope_returns_expected_shape(self, freak_token, scope):
        r = requests.get(f"{API}/quests?scope={scope}", headers=auth_h(freak_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert scope in data, f"key {scope} missing: {data}"
        quests = data[scope]
        assert isinstance(quests, list) and len(quests) >= 1
        q = quests[0]
        for key in (
            "id", "scope", "title", "flavor", "objectives", "complete",
            "claimed", "reward_label", "global_completions", "global_percent",
        ):
            assert key in q, f"missing {key} in quest: {q}"
        # objective shape
        ob = q["objectives"][0]
        for k in ("label", "current", "target"):
            assert k in ob
        assert q["scope"] == scope

    def test_scope_all_returns_three_buckets(self, freak_token):
        r = requests.get(f"{API}/quests?scope=all", headers=auth_h(freak_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        for scope in ("daily", "weekly", "monthly"):
            assert scope in data
            assert isinstance(data[scope], list) and len(data[scope]) >= 1

    def test_scope_invalid(self, freak_token):
        r = requests.get(f"{API}/quests?scope=bogus", headers=auth_h(freak_token), timeout=15)
        assert r.status_code == 400

    def test_requires_auth(self):
        r = requests.get(f"{API}/quests?scope=daily", timeout=15)
        assert r.status_code in (401, 403)


# ---------- POST /api/quests/claim ----------
class TestQuestClaim:
    def test_fresh_user_daily_incomplete_then_complete_and_claim(self):
        tok = _register_fresh()

        # Get pre-XP
        me_pre = requests.get(f"{API}/auth/me", headers=auth_h(tok), timeout=15).json()
        pre_xp = me_pre["xp"]

        # Daily quest 'Answer the Call' (d_train) starts incomplete
        d = requests.get(f"{API}/quests?scope=daily", headers=auth_h(tok), timeout=15).json()
        atc = next((q for q in d["daily"] if q["id"].split(":")[1] == "d_train"), None)
        assert atc is not None, f"Answer the Call missing: {d}"
        assert atc["complete"] is False
        assert atc["claimed"] is False

        # Claim while incomplete -> 400
        r_bad = requests.post(
            f"{API}/quests/claim",
            json={"quest_id": atc["id"]},
            headers=auth_h(tok),
            timeout=15,
        )
        assert r_bad.status_code == 400

        # Log a workout to satisfy 1-workout objective
        payload = {
            "workout_name": "TEST_Quest",
            "split_type": "ppl_push",
            "exercises": [
                {"name": "Bench Press", "sets": [{"reps": 5, "weight_lb": 135, "rpe": 7.0}]}
            ],
            "rating": 5,
        }
        w = requests.post(f"{API}/workouts/log", json=payload, headers=auth_h(tok), timeout=20)
        assert w.status_code == 200, w.text
        workout_xp = w.json()["xp_gained"]

        # Quest now complete
        d2 = requests.get(f"{API}/quests?scope=daily", headers=auth_h(tok), timeout=15).json()
        atc2 = next(q for q in d2["daily"] if q["id"] == atc["id"])
        assert atc2["complete"] is True
        assert atc2["claimed"] is False
        # objective current should reflect 1 workout logged
        assert atc2["objectives"][0]["current"] == 1
        assert atc2["objectives"][0]["target"] == 1

        # Claim -> 200, +60 XP, claimed=true
        c = requests.post(
            f"{API}/quests/claim",
            json={"quest_id": atc["id"]},
            headers=auth_h(tok),
            timeout=15,
        )
        assert c.status_code == 200, c.text
        body = c.json()
        assert body["ok"] is True
        # +60 daily reward
        assert body["user"]["xp"] == pre_xp + workout_xp + 60
        assert "60" in body["reward"] or "XP" in body["reward"].upper()

        # Verify via GET
        d3 = requests.get(f"{API}/quests?scope=daily", headers=auth_h(tok), timeout=15).json()
        atc3 = next(q for q in d3["daily"] if q["id"] == atc["id"])
        assert atc3["claimed"] is True

        # Second claim -> 400 Already claimed
        c2 = requests.post(
            f"{API}/quests/claim",
            json={"quest_id": atc["id"]},
            headers=auth_h(tok),
            timeout=15,
        )
        assert c2.status_code == 400
        assert "claim" in c2.text.lower()

    def test_claim_unknown_quest_id(self, freak_token):
        r = requests.post(
            f"{API}/quests/claim",
            json={"quest_id": "daily:d_bogus:2026-01-01"},
            headers=auth_h(freak_token),
            timeout=15,
        )
        assert r.status_code in (400, 404)

    def test_global_stats_increment_after_claim(self):
        """Claiming a quest should bump global_completions and global_percent."""
        # Two fresh users to isolate the global counter
        tok_a = _register_fresh()
        tok_b = _register_fresh()

        # Pre-snapshot from B
        d_pre = requests.get(f"{API}/quests?scope=daily", headers=auth_h(tok_b), timeout=15).json()
        atc_pre = next(q for q in d_pre["daily"] if q["id"].split(":")[1] == "d_train")
        pre_completions = atc_pre["global_completions"]

        # A logs a workout and claims
        payload = {
            "workout_name": "TEST_Global",
            "split_type": "ppl_push",
            "exercises": [{"name": "Bench Press", "sets": [{"reps": 5, "weight_lb": 135, "rpe": 7.0}]}],
            "rating": 5,
        }
        w = requests.post(f"{API}/workouts/log", json=payload, headers=auth_h(tok_a), timeout=20)
        assert w.status_code == 200
        d_a = requests.get(f"{API}/quests?scope=daily", headers=auth_h(tok_a), timeout=15).json()
        atc_a = next(q for q in d_a["daily"] if q["id"].split(":")[1] == "d_train")
        assert atc_a["complete"] is True
        c = requests.post(
            f"{API}/quests/claim",
            json={"quest_id": atc_a["id"]},
            headers=auth_h(tok_a),
            timeout=15,
        )
        assert c.status_code == 200, c.text

        # B re-fetches; completions should have gone up by exactly 1
        d_post = requests.get(f"{API}/quests?scope=daily", headers=auth_h(tok_b), timeout=15).json()
        atc_post = next(q for q in d_post["daily"] if q["id"] == atc_pre["id"])
        assert atc_post["global_completions"] == pre_completions + 1
        # percent should be reasonable
        assert 0 <= atc_post["global_percent"] <= 100


# ---------- Profile attributes / radar / class ----------
class TestProfileAttributes:
    def test_attributes_shape_for_freak(self, freak_token):
        r = requests.get(f"{API}/profile/attributes", headers=auth_h(freak_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # Required keys
        for k in ("stats", "overall", "class_title", "class_tier", "app_percentile"):
            assert k in data, f"missing {k}: {data}"
        stats = data["stats"]
        for axis in ("strength", "power", "speed", "endurance", "grit"):
            assert axis in stats, f"missing axis {axis}"
            assert 5 <= stats[axis] <= 100
        assert data["class_tier"] in ("S", "A", "B", "C", "D", "E")
        assert isinstance(data["class_title"], str) and len(data["class_title"]) > 0
        assert 0 <= data["app_percentile"] <= 100

    def test_attributes_requires_auth(self):
        r = requests.get(f"{API}/profile/attributes", timeout=15)
        assert r.status_code in (401, 403)
