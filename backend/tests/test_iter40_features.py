"""iteration 40: pre-publish regression + baseline (Settings partial save) + weekly digest."""
import os, re, uuid, time, asyncio
import pytest, requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
MONGO = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DBN = os.environ.get("DB_NAME", "hutchs_inner_circle")

OWNER = ("the9hutch@gmail.com", "Hutch-TWVmifIRhU6u8bBl")

# --- helpers ---
def _uniq():
    return f"iter40_{uuid.uuid4().hex[:10]}"

def _reg(email=None, password="testpass123!"):
    email = email or f"{_uniq()}@test.com"
    r = requests.post(f"{BASE}/api/auth/register", json={
        "email": email, "password": password,
        "display_name": email.split("@")[0][:12],
        "full_name": "Iter40 Tester",
    }, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return email, password, d["session_token"], d["user"]["user_id"]

def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]

def _me(tok):
    r = requests.get(f"{BASE}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    return r

def _cleanup_ip():
    asyncio.run(_clear_auth_limits())

async def _clear_auth_limits():
    db = AsyncIOMotorClient(MONGO)[DBN]
    await db.auth_limits.delete_many({})

async def _delete_user(uid):
    db = AsyncIOMotorClient(MONGO)[DBN]
    await db.users.delete_one({"user_id": uid})
    for c in ("cardio","workouts","rival_challenges","rival_races","xp_events","chat_messages","gym_checkins"):
        try: await db[c].delete_many({"user_id": uid})
        except Exception: pass

created_users = []
@pytest.fixture(scope="module", autouse=True)
def _module_teardown():
    _cleanup_ip()
    yield
    for uid in created_users:
        try: asyncio.run(_delete_user(uid))
        except Exception: pass
    _cleanup_ip()

# --- BACKEND REGRESSION ---
class TestAuthRegression:
    def test_register_login_me(self):
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        # login
        tok2 = _login(email, pw)
        assert tok2
        # me
        r = _me(tok2)
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == email
        assert me.get("baseline_set") in (False, None)
        assert not (me.get("prs") or {}).get("bench")

class TestFoundersSpots:
    def test_spots_no_test_leak(self):
        r = requests.get(f"{BASE}/api/founders/spots", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 100
        assert d["remaining"] == 100 - d["taken"]
        # Test emails should NOT count as founders — verify by registering a test account and confirming taken doesn't increment.
        before = d["taken"]
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        after = requests.get(f"{BASE}/api/founders/spots", timeout=15).json()["taken"]
        assert after == before, f"@test.com signup leaked into founders count: {before} -> {after}"

class TestLeaderboards:
    def test_xp_leaderboard_no_bots_no_test(self):
        # unauth — but leaderboard requires auth
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        r = requests.get(f"{BASE}/api/leaderboard/xp",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        board = r.json()
        rows = board if isinstance(board, list) else board.get("entries") or board.get("rows") or []
        for row in rows:
            e = (row.get("email") or "").lower()
            assert not e.endswith("@circle.ai"), f"bot leaked: {row}"
            assert "@test." not in e and "@qa." not in e, f"test-email leaked: {row}"
            # SEC-001: safe fields only
            assert "phone" not in row
            assert "apple_sub" not in row

    def test_defender_leaderboard(self):
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        r = requests.get(f"{BASE}/api/leaderboard/defender",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        board = r.json()
        rows = board if isinstance(board, list) else board.get("entries") or board.get("rows") or []
        for row in rows:
            e = (row.get("email") or "").lower()
            assert not e.endswith("@circle.ai"), f"bot leaked in defenders: {row}"
            assert "@test." not in e and "@qa." not in e, row

class TestDigestWeekly:
    def test_weekly_shape(self):
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        r = requests.get(f"{BASE}/api/digest/weekly",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Loose shape check — key fields exist
        for k in ("workouts",):
            assert k in d, f"missing key {k} in weekly digest: {list(d.keys())}"
        # No 500 is the primary assert. Fields not always populated.


# --- BASELINE (Settings partial save + first-time reward) ---
class TestBaselineFlows:
    def test_first_time_reward_150_and_calibrated_badge(self):
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        r = requests.post(f"{BASE}/api/onboarding/baseline",
                          json={"bench": 200, "squat": 300, "deadlift": 400, "ohp": 130},
                          headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["reward_xp"] == 150, d
        assert d["recap"] is not None
        assert d["recap"]["trend"]["first"] is True
        # verify badges + baseline_set + PRs
        me = _me(tok).json()
        assert me["baseline_set"] is True
        assert "calibrated" in (me.get("badges") or [])
        prs = me["prs"]
        assert prs["bench"] == 200 and prs["squat"] == 300 and prs["deadlift"] == 400 and prs["ohp"] == 130

    def test_partial_save_from_settings_keeps_other_prs(self):
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        # Seed baseline first
        r1 = requests.post(f"{BASE}/api/onboarding/baseline",
                           json={"bench": 200, "squat": 300, "deadlift": 400, "ohp": 130},
                           headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r1.status_code == 200
        assert r1.json()["reward_xp"] == 150
        # Now Settings partial save: only bench provided (bumped). Others blank/0 keep values.
        r2 = requests.post(f"{BASE}/api/onboarding/baseline",
                           json={"bench": 250, "squat": 0, "deadlift": 0, "ohp": 0},
                           headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        # Already logged, so reward_xp must be 0 the second time
        assert d2["reward_xp"] == 0, d2
        me = _me(tok).json()
        prs = me["prs"]
        assert prs["bench"] == 250, prs
        # keep-existing behavior for blanks
        assert prs["squat"] == 300 and prs["deadlift"] == 400 and prs["ohp"] == 130, prs

    def test_settings_blank_all_keeps_everything(self):
        """POST with all zeros after baseline: no PRs change, still reward=0."""
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        requests.post(f"{BASE}/api/onboarding/baseline",
                      json={"bench": 210, "squat": 310, "deadlift": 410, "ohp": 140},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        r = requests.post(f"{BASE}/api/onboarding/baseline",
                          json={"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0},
                          headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["reward_xp"] == 0
        me = _me(tok).json()
        prs = me["prs"]
        assert prs == {"bench": 210, "squat": 310, "deadlift": 410, "ohp": 140}, prs

    def test_recap_trend_first_false_on_retest(self):
        _cleanup_ip()
        email, pw, tok, uid = _reg()
        created_users.append(uid)
        requests.post(f"{BASE}/api/onboarding/baseline",
                      json={"bench": 200, "squat": 300, "deadlift": 400, "ohp": 130},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        r = requests.post(f"{BASE}/api/onboarding/baseline",
                          json={"bench": 260, "squat": 315, "deadlift": 410, "ohp": 140},
                          headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["recap"]["trend"]["first"] is False
        assert "big4_delta" in d["recap"]["trend"]
