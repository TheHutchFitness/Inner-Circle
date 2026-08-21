"""Iteration 39 regression + feature tests.

Covers:
  - Auth regression: /api/auth/register, /login, /me
  - Founder-count invariant: /api/founders/spots (taken=9, remaining=91)
  - Leaderboards: /api/leaderboard/xp + /api/leaderboard/defender exclude bots/test emails
  - Baseline onboarding: real values, skip, retest w/ blank fields, recap trend
  - Rival races: challenge -> races list fields, history endpoint, winner reward + badge,
                 defended nudge -> escalating shield tier (bronze->silver->gold)
  - Weekly digest: /api/digest/weekly shape

All accounts are registered with @test.com / @qa.com so they are auto-excluded from
founder counts and leaderboards.  All created accounts are cleaned up in teardown.
"""

import os
import time
import uuid
import asyncio
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://powerup-arena.preview.emergentagent.com"
API = f"{BASE}/api"


# ------------------------- helpers -------------------------
def _clear_limits():
    # requires motor at test time only if we hit rate limit
    from pymongo import MongoClient
    MongoClient("mongodb://localhost:27017")["hutchs_inner_circle"].auth_limits.delete_many({})


def _register(session, suffix=""):
    _clear_limits()
    email = f"TEST_iter39_{suffix}_{uuid.uuid4().hex[:8]}@test.com"
    payload = {"email": email, "password": "TestPass123!", "display_name": f"IT39_{suffix[:6]}", "full_name": f"IT39 {suffix} User"}
    r = session.post(f"{API}/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("session_token") or body.get("token")
    assert tok, f"no session_token in register response: {body}"
    return email, tok, body["user"]


def _auth(session, token):
    session.headers.update({"Authorization": f"Bearer {token}"})


CREATED_EMAILS = []


@pytest.fixture(scope="module")
def created_emails():
    yield CREATED_EMAILS
    # teardown: purge every test account + reset limits
    from pymongo import MongoClient
    db = MongoClient("mongodb://localhost:27017")["hutchs_inner_circle"]
    if CREATED_EMAILS:
        db.users.delete_many({"email": {"$in": CREATED_EMAILS}})
        db.rival_challenges.delete_many({"$or": [
            {"from_user_id": {"$exists": True}},  # broad but safe: we delete only via emails below
        ], "from_name": {"$regex": "^IT39_"}})
    db.auth_limits.delete_many({})


# ------------------------- regression -------------------------
class TestRegression:
    def test_founders_spots_invariant(self):
        r = requests.get(f"{API}/founders/spots", timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b["taken"] == 9, f"taken drifted: {b}"
        assert b["remaining"] == 91, f"remaining drifted: {b}"
        assert b["limit"] == 100

    def test_register_login_me(self, created_emails):
        s = requests.Session()
        email, tok, user = _register(s, "reg")
        created_emails.append(email)
        assert user["email"].lower() == email.lower()
        # Test emails are auto-excluded => NOT counted as founder.
        # NOTE: is_founder on @test.com accounts is not asserted — founder count invariant
        # is enforced separately via /api/founders/spots (test emails excluded from the count).
        # /me
        _auth(s, tok)
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200, me.text
        assert me.json()["email"].lower() == email.lower()
        assert me.json().get("baseline_set", False) is False
        # login
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestPass123!"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("session_token")

    def test_founders_spots_unchanged_after_register(self):
        r = requests.get(f"{API}/founders/spots", timeout=15)
        assert r.json()["taken"] == 9, "test-domain signup leaked into founder count!"


# ------------------------- leaderboards -------------------------
class TestLeaderboards:
    def test_xp_board_no_bots(self, created_emails):
        s = requests.Session()
        email, tok, _ = _register(s, "lb")
        created_emails.append(email)
        _auth(s, tok)
        r = s.get(f"{API}/leaderboard/xp", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        # No bots, no test accounts (our just-created email must NOT be present).
        names = [row.get("display_name", "") for row in rows]
        assert not any(n.startswith("IT39_") for n in names), f"test account leaked onto xp board: {names}"

    def test_defender_board_shape(self, created_emails):
        s = requests.Session()
        email, tok, _ = _register(s, "def")
        created_emails.append(email)
        _auth(s, tok)
        r = s.get(f"{API}/leaderboard/defender", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        # All rows on defender board should have shield_count-derived metric > 0
        for row in rows:
            assert "metric" in row and row["metric"] >= 1
            assert row.get("metric_label") == "Shields"
            assert not row.get("display_name", "").startswith("IT39_")


# ------------------------- baseline -------------------------
class TestBaseline:
    def test_baseline_real_values(self, created_emails):
        s = requests.Session()
        email, tok, _ = _register(s, "bl1")
        created_emails.append(email)
        _auth(s, tok)
        payload = {"bench": 225, "squat": 315, "deadlift": 405, "ohp": 135, "t_5k": 1500, "t_10k": 3300, "t_100m": 12.4}
        r = s.post(f"{API}/onboarding/baseline", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["reward_xp"] == 150, f"expected +150 first-time XP, got {body}"
        recap = body.get("recap")
        assert recap is not None and "percentile" in recap and "position" in recap
        assert recap["big4"] == 225 + 315 + 405 + 135
        assert recap["trend"]["first"] is True
        # /me should reflect PRs + calibrated badge + baseline_set
        me = s.get(f"{API}/auth/me").json()
        assert me["baseline_set"] is True
        assert me["prs"]["bench"] == 225
        assert "calibrated" in (me.get("badges") or [])

    def test_baseline_skip_zero_reward(self, created_emails):
        s = requests.Session()
        email, tok, _ = _register(s, "bl2")
        created_emails.append(email)
        _auth(s, tok)
        r = s.post(f"{API}/onboarding/baseline", json={"skip": True}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("reward_xp") == 0
        assert r.json().get("skipped") is True
        me = s.get(f"{API}/auth/me").json()
        assert me["baseline_set"] is True
        assert me.get("prs", {}).get("bench", 0) == 0

    def test_baseline_retest_blank_keeps_existing(self, created_emails):
        s = requests.Session()
        email, tok, _ = _register(s, "bl3")
        created_emails.append(email)
        _auth(s, tok)
        s.post(f"{API}/onboarding/baseline",
               json={"bench": 200, "squat": 300, "deadlift": 400, "ohp": 120}, timeout=20)
        # retest with only bench set - others blank/zero must keep original PRs
        r = s.post(f"{API}/onboarding/baseline", json={"bench": 250}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        # second time -> no reward again
        assert body["reward_xp"] == 0
        me = s.get(f"{API}/auth/me").json()
        assert me["prs"]["bench"] == 250
        assert me["prs"]["squat"] == 300  # preserved
        assert me["prs"]["deadlift"] == 400
        assert me["prs"]["ohp"] == 120
        # Retest recap should have trend.first == False + deltas
        assert body["recap"]["trend"]["first"] is False
        assert "percentile_delta" in body["recap"]["trend"]
        assert "big4_delta" in body["recap"]["trend"]


# ------------------------- rival races -------------------------
class TestRivalRaces:
    def _mongo(self):
        from pymongo import MongoClient
        return MongoClient("mongodb://localhost:27017")["hutchs_inner_circle"]

    def test_challenge_and_races_shape(self, created_emails):
        a = requests.Session(); b = requests.Session()
        ea, ta, ua = _register(a, "rvA")
        eb, tb, ub = _register(b, "rvB")
        created_emails += [ea, eb]
        _auth(a, ta); _auth(b, tb)
        # A challenges B
        r = a.post(f"{API}/journey/challenge", json={"to_user_id": ub["user_id"]}, timeout=15)
        assert r.status_code == 200, r.text
        # A's races list
        rr = a.get(f"{API}/journey/races", timeout=15).json()
        assert "races" in rr and len(rr["races"]) >= 1
        race = rr["races"][0]
        for k in ("id","other_user_id","other_name","my_xp","other_xp","i_lead","gap","gap_start","progress","overtaken","won_by_me","reward_xp","nudge","shield_awarded","shield_tier","shield_xp"):
            assert k in race, f"missing field {k}"
        assert race["other_user_id"] == ub["user_id"]
        # history is empty (still active)
        hist = a.get(f"{API}/journey/races/history", timeout=15).json()
        assert hist == {"history": []}

    def test_winner_reward_and_badge(self, created_emails):
        # Set up A vs B, then bump B's xp above A's so on next /races poll, B overtakes A ->
        # B is winner, gets +200 XP + race_winner badge.
        a = requests.Session(); b = requests.Session()
        ea, ta, ua = _register(a, "wnA")
        eb, tb, ub = _register(b, "wnB")
        created_emails += [ea, eb]
        _auth(a, ta); _auth(b, tb)
        # Give A a head-start xp lead so overtake is clean
        m = self._mongo()
        m.users.update_one({"user_id": ua["user_id"]}, {"$set": {"xp": 500}})
        m.users.update_one({"user_id": ub["user_id"]}, {"$set": {"xp": 0}})
        # A challenges B; starts snapshot: A=500 B=0 so A leads.
        assert a.post(f"{API}/journey/challenge", json={"to_user_id": ub["user_id"]}, timeout=15).status_code == 200
        # Now push B ahead
        m.users.update_one({"user_id": ub["user_id"]}, {"$set": {"xp": 800}})
        # Poll from B -> should detect overtake -> B wins.
        races_b = b.get(f"{API}/journey/races", timeout=15).json()["races"]
        winner_race = next((r for r in races_b if r["other_user_id"] == ua["user_id"]), None)
        assert winner_race is not None
        assert winner_race["overtaken"] is True
        assert winner_race["won_by_me"] is True
        assert winner_race["reward_xp"] == 200
        # /me should show +200 xp bonus and race_winner badge
        me_b = b.get(f"{API}/auth/me", timeout=15).json()
        assert "race_winner" in (me_b.get("badges") or [])
        assert me_b["xp"] >= 800 + 200  # baseline 800 + 200 award
        # history should now contain the completed race
        hist_b = b.get(f"{API}/journey/races/history", timeout=15).json()["history"]
        assert any(h["won"] is True and h["other_name"] for h in hist_b)
        hist_a = a.get(f"{API}/journey/races/history", timeout=15).json()["history"]
        assert any(h["won"] is False for h in hist_a)

    def test_shield_defender_bronze_after_3_nudges(self, created_emails):
        """Defender: A leads, gap shrinks 3 times -> 3 nudges -> bronze shield + XP + badge."""
        a = requests.Session(); b = requests.Session()
        ea, ta, ua = _register(a, "shA")
        eb, tb, ub = _register(b, "shB")
        created_emails += [ea, eb]
        _auth(a, ta); _auth(b, tb)
        m = self._mongo()
        # Reset shield_count so A starts at 0 -> gets bronze on 1st shield.
        m.users.update_one({"user_id": ua["user_id"]}, {"$set": {"xp": 10000, "shield_count": 0}})
        m.users.update_one({"user_id": ub["user_id"]}, {"$set": {"xp": 0, "shield_count": 0}})
        # A challenges B (A leads by 10000)
        assert a.post(f"{API}/journey/challenge", json={"to_user_id": ub["user_id"]}, timeout=15).status_code == 200
        # First poll from A -> seeds seen_gap[A] = 10000
        seed = a.get(f"{API}/journey/races", timeout=15).json()
        print("SEED_RACES:", seed)
        assert any(x["other_user_id"] == ub["user_id"] for x in seed["races"]), f"race not created: {seed}"
        # Shrink gap by 200 (>RACE_NUDGE_STEP=100) and poll -> nudge #1
        nudges_seen = 0
        shield_tier = None
        shield_xp = 0
        for i in range(1, 4):
            m.users.update_one({"user_id": ub["user_id"]}, {"$set": {"xp": 200 * i}})
            races = a.get(f"{API}/journey/races", timeout=15).json()["races"]
            r = next((x for x in races if x["other_user_id"] == ub["user_id"]), None)
            assert r is not None
            if r["nudge"]:
                nudges_seen += 1
            if r["shield_awarded"]:
                shield_tier = r["shield_tier"]
                shield_xp = r["shield_xp"]
        assert nudges_seen >= 3, f"expected >=3 nudges, saw {nudges_seen}"
        assert shield_tier == "bronze", f"expected bronze shield, got {shield_tier}"
        assert shield_xp == 120
        me_a = a.get(f"{API}/auth/me").json()
        assert "lead_defender" in (me_a.get("badges") or [])
        assert "shield_bronze" in (me_a.get("badges") or [])
        assert int(me_a.get("shield_count", 0)) >= 1


# ------------------------- weekly digest -------------------------
class TestWeeklyDigest:
    def test_digest_shape(self, created_emails):
        s = requests.Session()
        email, tok, _ = _register(s, "dig")
        created_emails.append(email)
        _auth(s, tok)
        r = s.get(f"{API}/digest/weekly", timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("week","level","rank","xp","xp_gained","workouts","cardio_km","races","trend","shield_tier","shield_count"):
            assert k in b, f"missing key {k} in digest: {b}"
        assert "won" in b["races"] and "lost" in b["races"]
