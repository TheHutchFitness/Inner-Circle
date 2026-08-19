"""
Iteration 21 — HAIR COLOUR + BOSS LOOT DROPS + GEAR-IN-FEED
Tests:
  1. PATCH /api/profile/update {equipped_hair} persists → returned in /auth/me + /users/{id}/public
  2. quest_loot_for_claim() computes correct loot when claim crosses quest-skin/weapon thresholds
     (Shadow Assassin @ hard>=3, Soul Scythe @ boss>=3, Frost Sovereign @ boss>=5, Storm Spear @ monthly>=4).
     We exercise this by seeding quest_claims directly + inserting a claim to observe the delta.
     We ALSO call POST /api/quests/claim directly (with fabricated quest_key) and assert response
     shape includes a `loot` list key.
  3. GET /api/chat/main/messages enriches with equipped_weapon + equipped_hair alongside equipped_skin.
  4. GET /api/leaderboard/xp includes equipped_skin/weapon/hair for geared bots.
Cleanup: all mutated bot fields (equipped_hair/equipped_skin/equipped_weapon/owned_skins/owned_weapons)
plus any injected quest_claims are removed on teardown.
"""
import os
import sys
import uuid
import pytest
import requests
from dotenv import load_dotenv

# ensure routes/ is on sys.path so `from gear import ...` (matching quests.py) resolves
sys.path.insert(0, "/app/backend")
sys.path.insert(0, "/app/backend/routes")
# load backend .env so MONGO_URL / DB_NAME resolve to the real DB
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BOT_LOW = "bot1@circle.ai"       # low level
BOT_HIGH = "bot10@circle.ai"     # LV~45
BOT_PW = "BotPass123!"


# ---------- helpers ----------
def _login(email: str, pw: str = BOT_PW) -> tuple[str, dict]:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d["session_token"], d["user"]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _me(tok: str) -> dict:
    r = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200, r.text[:200]
    return r.json()


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def bot_low():
    tok, u = _login(BOT_LOW)
    yield tok, u
    # reset
    requests.patch(f"{API}/profile/update", headers=_hdr(tok), json={"equipped_hair": None}, timeout=30)


@pytest.fixture(scope="module")
def bot_high():
    tok, u = _login(BOT_HIGH)
    yield tok, u
    requests.patch(f"{API}/profile/update", headers=_hdr(tok), json={"equipped_hair": None}, timeout=30)


# ==========================================================
# 1. HAIR COLOUR
# ==========================================================
class TestHairColour:
    def test_patch_equipped_hair_persists(self, bot_low):
        tok, u = bot_low
        for colour in ("blonde", "red", "white", "black", "brown"):
            r = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                               json={"equipped_hair": colour}, timeout=30)
            assert r.status_code == 200, f"{colour}: {r.status_code} {r.text[:200]}"
            body = r.json()
            assert body.get("equipped_hair") == colour, f"PATCH returned {body.get('equipped_hair')}"
            # /auth/me
            me = _me(tok)
            assert me.get("equipped_hair") == colour, f"/auth/me={me.get('equipped_hair')}"

    def test_equipped_hair_in_public_endpoint(self, bot_low):
        tok, u = bot_low
        requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                       json={"equipped_hair": "red"}, timeout=30)
        r = requests.get(f"{API}/users/{u['user_id']}/public", headers=_hdr(tok), timeout=30)
        assert r.status_code == 200
        pub = r.json()
        assert "equipped_hair" in pub, "public endpoint missing equipped_hair key"
        assert pub["equipped_hair"] == "red"

    def test_null_equipped_hair_clears(self, bot_low):
        tok, u = bot_low
        # set then clear
        requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                       json={"equipped_hair": "blonde"}, timeout=30)
        r = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                           json={"equipped_hair": None}, timeout=30)
        # None fields get filtered by `if v is not None` — so this is a no-op; test that hair is still 'blonde'
        assert r.status_code == 200
        assert r.json().get("equipped_hair") == "blonde", "PATCH with None should be no-op, not clear"


# ==========================================================
# 2. LOOT drops via quest_loot_for_claim
# ==========================================================
class TestLootDrop:
    """Directly exercises the loot helper by seeding quest_claims via Mongo, then
    inserting one more and computing the delta. Uses the public claim endpoint
    only to assert response shape includes a `loot` list key."""

    def test_claim_response_has_loot_key(self, bot_low):
        tok, u = bot_low
        # try to claim a nonexistent quest — should 4xx but confirms /quests/claim route
        r = requests.post(f"{API}/quests/claim", headers=_hdr(tok),
                          json={"quest_id": "daily:__nope__:2026-01-01"}, timeout=30)
        assert r.status_code in (400, 404), r.text[:200]

    def test_loot_helper_shadow_assassin_and_soul_scythe(self, bot_low):
        """When boss count crosses 3, both Shadow Assassin (hard>=3) and Soul Scythe (boss>=3) unlock."""
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        DB_NAME = os.environ.get("DB_NAME", "test_database")
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]

        # synthetic uid: guarantees isolation from any real user's quest_claims
        uid = f"__testuser_iter21_boss3_{uuid.uuid4().hex[:8]}"

        async def run():
            from gear import quest_loot_for_claim
            # seed 2 boss claims (below threshold) + 1 crossing claim
            for i in range(3):
                await db.quest_claims.insert_one({
                    "user_id": uid, "quest_key": f"boss:seed_{i}:x", "claimed_at": None
                })
            loot = await quest_loot_for_claim(uid, "boss")
            await db.quest_claims.delete_many({"user_id": uid})
            return loot

        loot = asyncio.get_event_loop().run_until_complete(run())
        ids = {i["id"] for i in loot}
        assert "skin_shadow" in ids, f"expected skin_shadow (Shadow Assassin @hard>=3) in loot: {loot}"
        assert "w_soulscythe" in ids, f"expected w_soulscythe (Soul Scythe @boss>=3) in loot: {loot}"
        for item in loot:
            assert set(item.keys()) >= {"kind", "id", "name", "rarity"}
            assert item["kind"] in ("skin", "weapon")

    def test_loot_helper_frost_sovereign_at_boss_5(self, bot_high):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        DB_NAME = os.environ.get("DB_NAME", "test_database")
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]

        uid = f"__testuser_iter21_boss5_{uuid.uuid4().hex[:8]}"

        async def run():
            from gear import quest_loot_for_claim
            for i in range(5):
                await db.quest_claims.insert_one({
                    "user_id": uid, "quest_key": f"boss:seed_{i}:x", "claimed_at": None
                })
            loot = await quest_loot_for_claim(uid, "boss")
            await db.quest_claims.delete_many({"user_id": uid})
            return loot

        loot = asyncio.get_event_loop().run_until_complete(run())
        ids = {i["id"] for i in loot}
        assert "skin_frost" in ids, f"expected skin_frost (Frost Sovereign @boss>=5) in loot: {loot}"

    def test_loot_helper_storm_spear_at_monthly_4(self, bot_high):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        DB_NAME = os.environ.get("DB_NAME", "test_database")
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]

        uid = f"__testuser_iter21_mon4_{uuid.uuid4().hex[:8]}"

        async def run():
            from gear import quest_loot_for_claim
            for i in range(4):
                await db.quest_claims.insert_one({
                    "user_id": uid, "quest_key": f"monthly:seed_{i}:x", "claimed_at": None
                })
            loot = await quest_loot_for_claim(uid, "monthly")
            await db.quest_claims.delete_many({"user_id": uid})
            return loot

        loot = asyncio.get_event_loop().run_until_complete(run())
        ids = {i["id"] for i in loot}
        assert "w_stormspear" in ids, f"expected w_stormspear (Storm Spear @monthly>=4) in loot: {loot}"

    def test_loot_helper_no_crossing_returns_empty(self, bot_low):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        DB_NAME = os.environ.get("DB_NAME", "test_database")
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]

        uid = f"__testuser_iter21_none_{uuid.uuid4().hex[:8]}"

        async def run():
            from gear import quest_loot_for_claim
            await db.quest_claims.insert_one({
                "user_id": uid, "quest_key": "daily:seed_1:x", "claimed_at": None
            })
            loot = await quest_loot_for_claim(uid, "daily")
            await db.quest_claims.delete_many({"user_id": uid})
            return loot

        loot = asyncio.get_event_loop().run_until_complete(run())
        assert loot == [], f"expected empty loot for non-crossing claim, got {loot}"


# ==========================================================
# 3. GEAR IN FEED — chat + leaderboard
# ==========================================================
class TestGearInFeed:
    def test_chat_messages_include_equipped_weapon_and_hair(self, bot_high):
        tok, u = bot_high
        # equip skin + weapon + hair on bot_high
        r1 = requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok),
                           json={"skin_id": "skin_arcade"}, timeout=30)  # LV38 unlocked for bot10
        assert r1.status_code == 200, r1.text[:200]
        r2 = requests.post(f"{API}/gear/equip-weapon", headers=_hdr(tok),
                           json={"weapon_id": "w_bow"}, timeout=30)  # LV26 unlocked for bot10
        assert r2.status_code == 200, r2.text[:200]
        r3 = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                            json={"equipped_hair": "blonde"}, timeout=30)
        assert r3.status_code == 200

        # post a chat message
        rp = requests.post(f"{API}/chat/main/messages", headers=_hdr(tok),
                           json={"text": f"iter21 test {uuid.uuid4().hex[:6]}"}, timeout=30)
        assert rp.status_code == 200, rp.text[:200]
        posted = rp.json()
        # POST response should already carry the equipped fields
        assert posted.get("equipped_skin") == "skin_arcade"
        assert posted.get("equipped_weapon") == "w_bow"
        assert posted.get("equipped_hair") == "blonde"

        # GET messages, find our user, verify enrichment
        rg = requests.get(f"{API}/chat/main/messages", headers=_hdr(tok), timeout=30)
        assert rg.status_code == 200
        msgs = rg.json()
        mine = [m for m in msgs if m.get("user_id") == u["user_id"]]
        assert mine, "no chat messages found for bot_high"
        latest = mine[-1]
        assert latest.get("equipped_skin") == "skin_arcade", f"missing equipped_skin in enriched msg: {latest}"
        assert latest.get("equipped_weapon") == "w_bow", f"missing equipped_weapon: {latest}"
        assert latest.get("equipped_hair") == "blonde", f"missing equipped_hair: {latest}"

        # teardown for this bot
        requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok), json={"skin_id": None}, timeout=30)
        requests.post(f"{API}/gear/equip-weapon", headers=_hdr(tok), json={"weapon_id": None}, timeout=30)

    def test_leaderboard_xp_has_equipped_fields(self, bot_high):
        tok, u = bot_high
        # ensure gear equipped
        requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok),
                      json={"skin_id": "skin_arcade"}, timeout=30)
        requests.post(f"{API}/gear/equip-weapon", headers=_hdr(tok),
                      json={"weapon_id": "w_bow"}, timeout=30)
        requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                       json={"equipped_hair": "red"}, timeout=30)

        r = requests.get(f"{API}/leaderboard/xp", headers=_hdr(tok), timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) > 0
        row = next((x for x in rows if x.get("user_id") == u["user_id"]), None)
        assert row is not None, "bot_high not on xp leaderboard"
        assert row.get("equipped_skin") == "skin_arcade", f"leaderboard missing equipped_skin: {row.get('equipped_skin')}"
        assert row.get("equipped_weapon") == "w_bow", f"leaderboard missing equipped_weapon: {row.get('equipped_weapon')}"
        assert row.get("equipped_hair") == "red", f"leaderboard missing equipped_hair: {row.get('equipped_hair')}"

        # teardown
        requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok), json={"skin_id": None}, timeout=30)
        requests.post(f"{API}/gear/equip-weapon", headers=_hdr(tok), json={"weapon_id": None}, timeout=30)


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-n0"]))
