"""Iteration 38 backend tests — baseline stats onboarding + regression."""
import os
import time
import uuid
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _rand_email():
    return f"TEST_iter38_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


@pytest.fixture(scope="module")
def new_user(s):
    """Register a fresh account for baseline testing. Returns (token, email, uid)."""
    # Ensure the auth_limits are clear for shared preview IP.
    async def clear():
        db = AsyncIOMotorClient("mongodb://localhost:27017")["hutchs_inner_circle"]
        await db.auth_limits.delete_many({})
    asyncio.get_event_loop().run_until_complete(clear())

    email = _rand_email()
    payload = {"email": email, "password": "TestPass123!", "display_name": "iter38", "full_name": "Iter38 Tester"}
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    d = r.json()
    tok = d.get("session_token") or d.get("token")
    assert tok, f"no session_token: {d}"
    uid = d.get("user", {}).get("user_id") or d.get("user_id")
    yield tok, email, uid
    # Cleanup: delete throwaway user.
    async def cleanup():
        db = AsyncIOMotorClient("mongodb://localhost:27017")["hutchs_inner_circle"]
        await db.users.delete_many({"email": {"$in": [email, email.lower()]}})
        await db.cardio.delete_many({"user_id": uid})
        await db.auth_limits.delete_many({})
    asyncio.get_event_loop().run_until_complete(cleanup())


# ---------- default_user_doc ----------
class TestDefaultUserDoc:
    def test_new_user_baseline_not_set(self, s):
        # Uses a dedicated fresh user (module-scoped fixture is mutated by baseline test in parallel).
        async def clear():
            db = AsyncIOMotorClient("mongodb://localhost:27017")["hutchs_inner_circle"]
            await db.auth_limits.delete_many({})
        asyncio.get_event_loop().run_until_complete(clear())

        email = _rand_email()
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "display_name": "iter38def", "full_name": "Default Tester"
        }, timeout=15)
        assert r.status_code == 200, r.text
        tok = r.json().get("session_token")
        uid = r.json().get("user", {}).get("user_id")

        me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
        try:
            assert me.get("baseline_set", False) is False, f"expected baseline_set False, got {me.get('baseline_set')}"
            prs = me.get("prs") or {}
            for k in ("bench", "squat", "deadlift", "ohp"):
                assert int(prs.get(k, 0) or 0) == 0, f"expected 0 for pr {k}, got {prs.get(k)}"
        finally:
            async def cleanup():
                db = AsyncIOMotorClient("mongodb://localhost:27017")["hutchs_inner_circle"]
                await db.users.delete_many({"email": {"$in": [email, email.lower()]}})
                await db.cardio.delete_many({"user_id": uid})
            asyncio.get_event_loop().run_until_complete(cleanup())


# ---------- POST /api/onboarding/baseline ----------
class TestBaselineEndpoint:
    def test_baseline_with_real_values(self, s, new_user):
        tok, _email, uid = new_user
        h = {"Authorization": f"Bearer {tok}"}
        payload = {"bench": 225, "squat": 315, "deadlift": 405, "ohp": 135,
                   "t_5k": 22 * 60 + 30, "t_10k": 48 * 60, "t_100m": 12.4}
        r = s.post(f"{API}/onboarding/baseline", json=payload, headers=h, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        d = r.json()
        assert d.get("ok") is True

        # Verify persistence via /auth/me
        me = s.get(f"{API}/auth/me", headers=h, timeout=15).json()
        assert me.get("baseline_set") is True
        prs = me.get("prs") or {}
        assert prs.get("bench") == 225 and prs.get("squat") == 315
        assert prs.get("deadlift") == 405 and prs.get("ohp") == 135
        sprints = me.get("sprints") or {}
        assert abs(float(sprints.get("100m", 0)) - 12.4) < 0.01

        # Verify cardio 5k/10k baseline documents created.
        async def check_cardio():
            db = AsyncIOMotorClient("mongodb://localhost:27017")["hutchs_inner_circle"]
            return await db.cardio.find({"user_id": uid, "baseline": True}).to_list(10)
        cardio_rows = asyncio.get_event_loop().run_until_complete(check_cardio())
        distances = sorted({round(r.get("distance_km", 0)) for r in cardio_rows})
        assert 5 in distances and 10 in distances, f"expected 5k+10k cardio docs, got {distances}"

        # Milestone badges awarded
        badges = me.get("badges") or []
        assert any(b.startswith("bench_") for b in badges), f"expected bench_ milestone badge, got {badges}"
        assert any(b.startswith("squat_") for b in badges), badges

    def test_attributes_differentiated_after_baseline(self, s, new_user):
        tok, _email, _uid = new_user
        h = {"Authorization": f"Bearer {tok}"}
        r = s.get(f"{API}/profile/attributes", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        stats = d.get("stats") or {}
        for k in ("strength", "power", "speed", "endurance"):
            assert k in stats, f"missing attribute {k} in {d}"
        assert int(stats.get("strength", 0)) > 0, f"expected strength > 0, got {stats}"
        vals = [int(stats.get(k, 0)) for k in ("strength", "power", "speed", "endurance")]
        assert len(set(vals)) > 1, f"expected differentiated stats, got {vals}"
        assert d.get("class_tier") in ("D", "C", "B", "A", "S", "S+"), f"unexpected class_tier: {d.get('class_tier')}"

    def test_baseline_skip_path(self, s):
        # Fresh user for skip flow.
        async def clear():
            db = AsyncIOMotorClient("mongodb://localhost:27017")["hutchs_inner_circle"]
            await db.auth_limits.delete_many({})
        asyncio.get_event_loop().run_until_complete(clear())

        email = _rand_email()
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "TestPass123!", "display_name": "iter38skip", "full_name": "Skip Tester"
        }, timeout=15)
        assert r.status_code == 200, r.text
        tok = r.json().get("session_token")
        uid = r.json().get("user", {}).get("user_id")

        h = {"Authorization": f"Bearer {tok}"}
        rr = s.post(f"{API}/onboarding/baseline", json={"skip": True}, headers=h, timeout=15)
        assert rr.status_code == 200, rr.text
        d = rr.json()
        assert d.get("ok") is True and d.get("skipped") is True

        me = s.get(f"{API}/auth/me", headers=h, timeout=15).json()
        assert me.get("baseline_set") is True
        prs = me.get("prs") or {}
        # Skip must NOT touch prs.
        for k in ("bench", "squat", "deadlift", "ohp"):
            assert int(prs.get(k, 0) or 0) == 0, f"skip should not set PR {k}, got {prs.get(k)}"

        # Cleanup
        async def cleanup():
            db = AsyncIOMotorClient("mongodb://localhost:27017")["hutchs_inner_circle"]
            await db.users.delete_many({"email": {"$in": [email, email.lower()]}})
            await db.cardio.delete_many({"user_id": uid})
        asyncio.get_event_loop().run_until_complete(cleanup())


# ---------- Regression: core endpoints ----------
class TestRegression:
    """Regression on core endpoints — auth, journey, leaderboard, revenuecat webhook."""

    def test_login_owner(self, s):
        r = s.post(f"{API}/auth/login",
                   json={"email": "the9hutch@gmail.com", "password": "Hutch-TWVmifIRhU6u8bBl"},
                   timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        tok = d.get("session_token")
        assert tok
        # Save token on class for reuse via env var (simpler than another fixture)
        os.environ["_OWNER_TOK"] = tok

    def test_auth_me(self, s):
        tok = os.environ.get("_OWNER_TOK")
        assert tok, "login must run first"
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me.get("email") == "the9hutch@gmail.com"
        assert me.get("is_admin") is True

    def test_journey(self, s):
        tok = os.environ.get("_OWNER_TOK")
        r = s.get(f"{API}/journey", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "nodes" in d
        assert isinstance(d.get("rivals", []), list)

    def test_journey_challenge(self, s):
        tok = os.environ.get("_OWNER_TOK")
        # Fetch a rival first.
        j = s.get(f"{API}/journey", headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
        rivals = j.get("rivals") or []
        if not rivals:
            pytest.skip("no rivals available")
        target = rivals[0].get("user_id") or rivals[0].get("id")
        r = s.post(f"{API}/journey/challenge",
                   json={"opponent_id": target, "target_id": target},
                   headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        # Endpoint should exist and not 500. Acceptable outcomes: 200 ok, 400 already-challenged.
        assert r.status_code in (200, 400), f"unexpected {r.status_code}: {r.text}"

    def test_leaderboard_level(self, s):
        tok = os.environ.get("_OWNER_TOK")
        # /api/leaderboard/xp is the level board (metric = level from xp).
        r = s.get(f"{API}/leaderboard/xp", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        d = r.json()
        entries = d if isinstance(d, list) else d.get("entries") or d.get("rows") or d.get("leaderboard") or d.get("users")
        assert entries is not None, f"unexpected shape: {list(d)[:5] if isinstance(d, dict) else type(d)}"

    def test_revenuecat_webhook_bad_auth(self, s):
        r = s.post(f"{API}/revenuecat/webhook",
                   json={"event": {"type": "TEST"}},
                   headers={"Authorization": "wrong-secret"}, timeout=15)
        assert r.status_code == 401, f"expected 401 on bad auth, got {r.status_code}"
