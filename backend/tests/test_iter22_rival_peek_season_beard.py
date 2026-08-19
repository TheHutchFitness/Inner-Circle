"""
Iteration 22 — RIVAL LOADOUT PEEK + SEASONAL BOSS SKIN (Void Overlord) + FACIAL HAIR (Beard)

Tests:
  A. SEASON SKIN — GET /api/gear
     - Row `skin_season1` exists with source='season', has active/vaulted/unlocked/quest_label.
     - For bot10 (with 0 bosses this season) → active=True, unlocked=False, owned=False.

  B. SEASON SKIN — POST /api/gear/equip-skin skin_season1
     - 403 when not owned and boss count < 6 in active season.
     - When boss>=6 in active season → owned_skins gets skin_season1 AND equipped_skin=skin_season1.

  C. SEASON SKIN — quest_loot_for_claim / claim path
     - The helper returns skin_season1 (kind=skin, seasonal=True) when crossing boss>=6 in active season
       AND grants owned_skins.

  D. BEARD — PATCH /api/profile/update {equipped_beard:'beard'} persists
     - Returned from /auth/me and /api/users/{id}/public.
     - Setting {equipped_beard:'none'} switches back to clean look (persists as 'none').

  E. Public endpoint (rival peek) — /api/users/{id}/public exposes
     equipped_skin/equipped_weapon/equipped_hair/equipped_beard.

  F. Chat feed — GET /api/chat/main/messages enrichment includes equipped_beard alongside skin/weapon/hair.

Cleanup: every mutated bot has equipped_beard/equipped_hair/equipped_skin/equipped_weapon $unset,
owned_skins/owned_weapons reset to [], and synthetic quest_claims removed.

Run: pytest /app/backend/tests/test_iter22_rival_peek_season_beard.py -v -n0
"""
import asyncio
import os
import sys
import uuid

import pytest
import requests
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
sys.path.insert(0, "/app/backend/routes")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

BOT_LOW = "bot1@circle.ai"
BOT_HIGH = "bot10@circle.ai"
BOT_PW = "BotPass123!"


def _login(email: str) -> tuple[str, dict]:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": BOT_PW}, timeout=30)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    d = r.json()
    return d["session_token"], d["user"]


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _me(tok: str) -> dict:
    r = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200
    return r.json()


def _mongo():
    """Return a fresh motor db instance bound to the CURRENT running event loop.
    Call this INSIDE an async fn so motor picks up the correct loop."""
    from motor.motor_asyncio import AsyncIOMotorClient
    MONGO_URL = os.environ["MONGO_URL"]
    DB_NAME = os.environ["DB_NAME"]
    cli = AsyncIOMotorClient(MONGO_URL)
    return cli[DB_NAME]


_SHARED_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_SHARED_LOOP)


def _run(coro):
    """Run coro on a single shared event loop so motor connections are stable."""
    return _SHARED_LOOP.run_until_complete(coro)


async def _hard_reset(uid: str):
    db = _mongo()
    await db.users.update_one(
        {"user_id": uid},
        {
            "$unset": {
                "equipped_skin": "",
                "equipped_weapon": "",
                "equipped_hair": "",
                "equipped_beard": "",
            },
            "$set": {"owned_skins": [], "owned_weapons": []},
        },
    )
    await db.quest_claims.delete_many({"user_id": uid, "quest_key": {"$regex": "^(boss|monthly):seed_"}})


@pytest.fixture(scope="module")
def bot_low():
    tok, u = _login(BOT_LOW)
    yield tok, u
    _run(_hard_reset(u["user_id"]))


@pytest.fixture(scope="module")
def bot_high():
    tok, u = _login(BOT_HIGH)
    yield tok, u
    _run(_hard_reset(u["user_id"]))


# ==========================================================
# A. SEASON SKIN row in /api/gear
# ==========================================================
class TestSeasonSkinRow:
    def test_gear_has_season_skin_row(self, bot_high):
        tok, u = bot_high
        # ensure bot has 0 bosses this season
        _run(_hard_reset(u["user_id"]))

        r = requests.get(f"{API}/gear", headers=_hdr(tok), timeout=30)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        season_rows = [s for s in data["skins"] if s.get("source") == "season"]
        assert season_rows, f"no season skin row found in /api/gear (found sources={{s.get('source') for s in data['skins']}})"
        row = next((s for s in season_rows if s["id"] == "skin_season1"), None)
        assert row is not None, f"skin_season1 missing among season rows: {season_rows}"
        # required fields
        for k in ("active", "vaulted", "unlocked", "quest_label", "name", "rarity", "season"):
            assert k in row, f"missing {k} in season row: {row}"
        assert row["name"] == "Void Overlord"
        # bot10 has 0 bosses this season → active True, unlocked False, owned False
        assert row["active"] is True, f"expected active=True for 2026-S3, got {row['active']} (season={row['season']})"
        assert row["unlocked"] is False, f"expected unlocked=False for bot10 with 0 bosses, got row={row}"
        assert row["owned"] is False
        assert row["quest_label"], "quest_label should be non-empty"


# ==========================================================
# B. equip-skin gating for season skin
# ==========================================================
class TestSeasonSkinEquipGating:
    def test_equip_season_skin_forbidden_when_not_earned(self, bot_low):
        tok, u = bot_low
        # ensure not owned & 0 boss claims
        _run(_hard_reset(u["user_id"]))
        r = requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok),
                          json={"skin_id": "skin_season1"}, timeout=30)
        assert r.status_code == 403, f"expected 403 for locked season skin, got {r.status_code} {r.text[:200]}"

    def test_equip_season_skin_grants_and_equips_when_boss_ge_6(self, bot_low):
        tok, u = bot_low
        uid = u["user_id"]

        async def seed_and_verify():
            db = _mongo()
            # start clean
            await db.users.update_one(
                {"user_id": uid},
                {"$unset": {"equipped_skin": ""}, "$set": {"owned_skins": []}},
            )
            await db.quest_claims.delete_many({"user_id": uid, "quest_key": {"$regex": "^boss:seed_"}})
            for i in range(6):
                await db.quest_claims.insert_one({
                    "user_id": uid,
                    "quest_key": f"boss:seed_iter22_{i}:x",
                    "claimed_at": None,
                })

        _run(seed_and_verify())

        # NOW equip should succeed AND grant owned_skins
        r = requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok),
                          json={"skin_id": "skin_season1"}, timeout=30)
        assert r.status_code == 200, f"expected 200 with boss>=6 in season, got {r.status_code} {r.text[:200]}"
        assert r.json().get("equipped_skin") == "skin_season1"

        # verify grant to owned_skins
        me = _me(tok)
        assert "skin_season1" in (me.get("owned_skins") or []), \
            f"skin_season1 not added to owned_skins after equip: owned={me.get('owned_skins')}"
        assert me.get("equipped_skin") == "skin_season1"

        # cleanup: unequip + clear seed + wipe owned
        requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok),
                      json={"skin_id": None}, timeout=30)

        async def cleanup():
            db = _mongo()
            await db.quest_claims.delete_many({"user_id": uid, "quest_key": {"$regex": "^boss:seed_iter22_"}})
            await db.users.update_one({"user_id": uid}, {"$set": {"owned_skins": []}})
        _run(cleanup())


# ==========================================================
# C. quest_loot_for_claim drops skin_season1 at boss crossing 6
# ==========================================================
class TestSeasonSkinLootDrop:
    def test_loot_helper_drops_skin_season1_and_grants(self, bot_high):
        """Directly invoke gear.quest_loot_for_claim to observe the seasonal drop
        when boss count crosses 6 in the active season."""
        uid = f"__testuser_iter22_season_{uuid.uuid4().hex[:8]}"

        async def run():
            db = _mongo()
            from gear import quest_loot_for_claim
            # stub user so $addToSet in the helper can write owned_skins
            await db.users.insert_one({"user_id": uid, "owned_skins": []})
            # seed 6 boss claims (the 6th being the crossing one)
            for i in range(6):
                await db.quest_claims.insert_one({
                    "user_id": uid, "quest_key": f"boss:seed_iter22c_{i}:x", "claimed_at": None
                })
            loot = await quest_loot_for_claim(uid, "boss")
            usr = await db.users.find_one({"user_id": uid}, {"_id": 0, "owned_skins": 1})
            # cleanup
            await db.quest_claims.delete_many({"user_id": uid})
            await db.users.delete_one({"user_id": uid})
            return loot, usr

        loot, usr = _run(run())
        ids = {i["id"] for i in loot}
        assert "skin_season1" in ids, \
            f"expected skin_season1 in loot when boss crossed 6 (current season active), got {loot}"
        # verify seasonal flag on the entry
        season_entry = next(i for i in loot if i["id"] == "skin_season1")
        assert season_entry.get("seasonal") is True, f"seasonal flag missing: {season_entry}"
        assert season_entry.get("kind") == "skin"
        # verify the helper granted owned_skins
        assert usr is not None, "user should be upserted / found after grant"
        assert "skin_season1" in (usr.get("owned_skins") or []), \
            f"owned_skins should contain skin_season1 after loot drop, got {usr}"

    def test_loot_helper_no_season_drop_before_threshold(self, bot_high):
        """Boss=5 shouldn't drop the seasonal skin."""
        uid = f"__testuser_iter22_no_{uuid.uuid4().hex[:8]}"

        async def run():
            db = _mongo()
            from gear import quest_loot_for_claim
            for i in range(5):
                await db.quest_claims.insert_one({
                    "user_id": uid, "quest_key": f"boss:seed_iter22d_{i}:x", "claimed_at": None
                })
            loot = await quest_loot_for_claim(uid, "boss")
            await db.quest_claims.delete_many({"user_id": uid})
            await db.users.delete_one({"user_id": uid})
            return loot

        loot = _run(run())
        ids = {i["id"] for i in loot}
        assert "skin_season1" not in ids, f"season skin should NOT drop at boss=5, got {loot}"


# ==========================================================
# D. BEARD toggle persists
# ==========================================================
class TestBeardToggle:
    def test_patch_equipped_beard_beard_persists(self, bot_high):
        tok, u = bot_high
        r = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                           json={"equipped_beard": "beard"}, timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("equipped_beard") == "beard"
        me = _me(tok)
        assert me.get("equipped_beard") == "beard"

    def test_patch_equipped_beard_none_persists(self, bot_high):
        tok, u = bot_high
        # ensure set first
        requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                       json={"equipped_beard": "beard"}, timeout=30)
        # switch to none
        r = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                           json={"equipped_beard": "none"}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("equipped_beard") == "none"
        me = _me(tok)
        assert me.get("equipped_beard") == "none", f"expected 'none', got {me.get('equipped_beard')}"

    def test_public_endpoint_returns_equipped_beard(self, bot_high):
        tok, u = bot_high
        # set beard
        requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                       json={"equipped_beard": "beard"}, timeout=30)
        r = requests.get(f"{API}/users/{u['user_id']}/public", headers=_hdr(tok), timeout=30)
        assert r.status_code == 200
        pub = r.json()
        assert "equipped_beard" in pub, f"public endpoint missing equipped_beard: keys={list(pub.keys())}"
        assert pub["equipped_beard"] == "beard"


# ==========================================================
# E. Public endpoint exposes all four equipped fields (for Rival Peek)
# ==========================================================
class TestPublicEndpointForRivalPeek:
    def test_public_has_all_equipped_fields(self, bot_high):
        tok, u = bot_high
        # equip a skin + weapon that bot10 (LV45) has unlocked, plus hair + beard
        r1 = requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok),
                           json={"skin_id": "skin_arcade"}, timeout=30)
        assert r1.status_code == 200, r1.text[:200]
        r2 = requests.post(f"{API}/gear/equip-weapon", headers=_hdr(tok),
                           json={"weapon_id": "w_bow"}, timeout=30)
        assert r2.status_code == 200, r2.text[:200]
        r3 = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                            json={"equipped_hair": "blonde", "equipped_beard": "beard"}, timeout=30)
        assert r3.status_code == 200, r3.text[:200]

        r = requests.get(f"{API}/users/{u['user_id']}/public", headers=_hdr(tok), timeout=30)
        assert r.status_code == 200
        pub = r.json()
        for k, expected in (
            ("equipped_skin", "skin_arcade"),
            ("equipped_weapon", "w_bow"),
            ("equipped_hair", "blonde"),
            ("equipped_beard", "beard"),
        ):
            assert k in pub, f"public missing {k}"
            assert pub[k] == expected, f"{k}={pub[k]} expected {expected}"

        # cleanup
        requests.post(f"{API}/gear/equip-skin", headers=_hdr(tok), json={"skin_id": None}, timeout=30)
        requests.post(f"{API}/gear/equip-weapon", headers=_hdr(tok), json={"weapon_id": None}, timeout=30)


# ==========================================================
# F. Chat enrichment includes equipped_beard
# ==========================================================
class TestChatEnrichmentBeard:
    def test_chat_message_has_equipped_beard(self, bot_low):
        tok, u = bot_low
        # set beard
        r0 = requests.patch(f"{API}/profile/update", headers=_hdr(tok),
                            json={"equipped_beard": "beard"}, timeout=30)
        assert r0.status_code == 200

        # post a message
        rp = requests.post(f"{API}/chat/main/messages", headers=_hdr(tok),
                           json={"text": f"iter22 beard {uuid.uuid4().hex[:6]}"}, timeout=30)
        assert rp.status_code == 200, rp.text[:200]
        posted = rp.json()
        assert posted.get("equipped_beard") == "beard", f"POST reply missing equipped_beard: {posted}"

        # verify GET messages includes it too
        rg = requests.get(f"{API}/chat/main/messages", headers=_hdr(tok), timeout=30)
        assert rg.status_code == 200
        msgs = rg.json()
        mine = [m for m in msgs if m.get("user_id") == u["user_id"]]
        assert mine, "no chat msgs found for bot_low"
        latest = mine[-1]
        assert latest.get("equipped_beard") == "beard", f"chat enrichment missing equipped_beard: {latest}"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-n0"]))
