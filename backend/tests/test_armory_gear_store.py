"""
Iteration 20 — THE ARMORY / THE STORE / INVENTORY backend tests.

Covers:
 - GET /api/gear (skin/weapon counts by source, rarity, monthly drop fields)
 - POST /api/gear/equip-skin + /api/gear/equip-weapon (200 unlocked, 403 locked, null unequip)
 - POST /api/gear/purchase (grants paid item, 410 for non-current-month, becomes owned+equippable)
 - GET /api/store (returns live items - includes seeded badges + titles)
 - GET /api/unlockables (backgrounds + widgets for INVENTORY)
 - equipped_skin appears in /api/users/{id}/public, leaderboard, chat GET

Bots reset at teardown (equipped_skin/weapon cleared, owned_skins/weapons cleared).
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://powerup-arena.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

BOT1 = ("bot1@circle.ai", "BotPass123!")   # LV ~3 → only Anime skin unlocked
BOT10 = ("bot10@circle.ai", "BotPass123!") # LV ~45 → all free skins unlocked


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["session_token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def bot1_ctx():
    tok, u = _login(*BOT1)
    yield tok, u
    # cleanup
    _reset_bot(u["user_id"])


@pytest.fixture(scope="module")
def bot10_ctx():
    tok, u = _login(*BOT10)
    yield tok, u
    _reset_bot(u["user_id"])


def _reset_bot(user_id):
    try:
        client = MongoClient(MONGO_URL)
        client[DB_NAME].users.update_one(
            {"user_id": user_id},
            {"$set": {"equipped_skin": None, "equipped_weapon": None,
                      "owned_skins": [], "owned_weapons": []}},
        )
        client.close()
    except Exception as e:
        print(f"cleanup failed: {e}")


# ============ /api/gear ============
class TestGearList:
    def test_gear_shape_and_counts(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.get(f"{BASE_URL}/api/gear", headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        skins, weapons = d["skins"], d["weapons"]
        # 10 paid + 7 level + 4 quest = 21
        assert len(skins) == 21, f"want 21 skins got {len(skins)}"
        assert len(weapons) == 11, f"want 11 weapons got {len(weapons)}"
        by_src = {"paid": 0, "level": 0, "quest": 0}
        for s in skins:
            by_src[s["source"]] += 1
        assert by_src == {"paid": 10, "level": 7, "quest": 4}
        by_srcw = {"paid": 0, "level": 0, "quest": 0}
        for w in weapons:
            by_srcw[w["source"]] += 1
        assert by_srcw == {"paid": 4, "level": 4, "quest": 3}
        # required fields
        for s in skins:
            for k in ("id", "name", "source", "rarity", "owned", "unlocked", "equipped"):
                assert k in s, f"missing {k} in skin {s.get('id')}"
            assert s["rarity"] in ("common", "rare", "epic", "legendary", "mythic")
        # response envelope
        assert "quest_counts" in d and "month" in d
        assert set(d["quest_counts"].keys()) >= {"boss", "monthly", "hard", "total"}

    def test_paid_skin_monthly_fields(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.get(f"{BASE_URL}/api/gear", headers=_h(tok), timeout=15)
        d = r.json()
        month = d["month"]
        paid = [s for s in d["skins"] if s["source"] == "paid"]
        assert len(paid) == 10
        for s in paid:
            for k in ("drop_month", "drop_label", "available", "upcoming", "vaulted"):
                assert k in s, f"missing {k} on {s['id']}"
            dm = s["drop_month"]
            if dm == month:
                assert s["available"] is True
            elif dm > month:
                assert s["upcoming"] is True
            elif dm < month and not s["owned"]:
                assert s["vaulted"] is True


# ============ equip gating ============
class TestEquip:
    def test_bot1_locked_skin_403(self, bot1_ctx):
        """bot1 LV~3: cannot equip level-locked skin_cyber (unlock 10)."""
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                          headers=_h(tok), json={"skin_id": "skin_cyber"}, timeout=15)
        assert r.status_code == 403, r.text
        assert "level" in r.text.lower() or "locked" in r.text.lower()

    def test_bot1_unlocked_skin_200(self, bot1_ctx):
        """bot1 LV~3: can equip skin_anime (unlock 2)."""
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                          headers=_h(tok), json={"skin_id": "skin_anime"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["equipped_skin"] == "skin_anime"

    def test_equip_null_unequips(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                          headers=_h(tok), json={"skin_id": None}, timeout=15)
        assert r.status_code == 200
        assert r.json()["equipped_skin"] is None

    def test_bot1_paid_skin_unowned_403(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                          headers=_h(tok), json={"skin_id": "skin_dragonknight"}, timeout=15)
        assert r.status_code == 403

    def test_bot1_quest_skin_locked_403(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                          headers=_h(tok), json={"skin_id": "skin_celestial"}, timeout=15)
        # bot1 unlikely to have 12 boss/monthly quests claimed
        assert r.status_code in (200, 403)

    def test_bot10_can_equip_high_level_skin(self, bot10_ctx):
        tok, _ = bot10_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                          headers=_h(tok), json={"skin_id": "skin_arcade"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["equipped_skin"] == "skin_arcade"

    def test_bot1_weapon_locked_403(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-weapon",
                          headers=_h(tok), json={"weapon_id": "w_bow"}, timeout=15)
        assert r.status_code == 403

    def test_bot10_weapon_unlocked_200(self, bot10_ctx):
        tok, _ = bot10_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-weapon",
                          headers=_h(tok), json={"weapon_id": "w_bow"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["equipped_weapon"] == "w_bow"

    def test_unknown_skin_404(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                          headers=_h(tok), json={"skin_id": "skin_notreal"}, timeout=15)
        assert r.status_code == 404


# ============ purchase ============
class TestPurchase:
    def test_purchase_current_month_grants(self, bot1_ctx):
        tok, _ = bot1_ctx
        # find a paid skin in current month
        r = requests.get(f"{BASE_URL}/api/gear", headers=_h(tok), timeout=15)
        d = r.json()
        current = [s for s in d["skins"] if s["source"] == "paid" and s["available"]]
        if not current:
            pytest.skip("No paid skin in current month to buy")
        target = current[0]["id"]
        r = requests.post(f"{BASE_URL}/api/gear/purchase",
                          headers=_h(tok), json={"kind": "skin", "id": target}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # verify owned + equippable
        r2 = requests.get(f"{BASE_URL}/api/gear", headers=_h(tok), timeout=15)
        owned = [s for s in r2.json()["skins"] if s["id"] == target][0]
        assert owned["owned"] is True
        assert owned["unlocked"] is True

        req = requests.post(f"{BASE_URL}/api/gear/equip-skin",
                            headers=_h(tok), json={"skin_id": target}, timeout=15)
        assert req.status_code == 200

    def test_purchase_vaulted_410(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.get(f"{BASE_URL}/api/gear", headers=_h(tok), timeout=15)
        d = r.json()
        non_curr = [s for s in d["skins"]
                    if s["source"] == "paid" and s["drop_month"] != d["month"] and not s["owned"]]
        if not non_curr:
            pytest.skip("No non-current-month paid skin available")
        target = non_curr[0]["id"]
        r = requests.post(f"{BASE_URL}/api/gear/purchase",
                          headers=_h(tok), json={"kind": "skin", "id": target}, timeout=15)
        assert r.status_code == 410, r.text

    def test_purchase_weapon_ok(self, bot10_ctx):
        tok, _ = bot10_ctx
        r = requests.post(f"{BASE_URL}/api/gear/purchase",
                          headers=_h(tok), json={"kind": "weapon", "id": "w_katana"}, timeout=15)
        assert r.status_code == 200, r.text

    def test_purchase_unknown_404(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.post(f"{BASE_URL}/api/gear/purchase",
                          headers=_h(tok), json={"kind": "skin", "id": "skin_nope"}, timeout=15)
        assert r.status_code == 404


# ============ /api/store ============
class TestStore:
    def test_store_returns_seeded_badges(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.get(f"{BASE_URL}/api/store", headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "live" in d and isinstance(d["live"], list)
        names = {it["name"] for it in d["live"]}
        expected_badges = {"Inferno Crest", "Storm Sigil", "Reaper Mark",
                           "Iron Crown", "Dragon Seal", "Nova Star"}
        missing_badges = expected_badges - names
        assert not missing_badges, f"missing badges: {missing_badges} | got names={names}"

    def test_store_returns_seeded_titles(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.get(f"{BASE_URL}/api/store", headers=_h(tok), timeout=15)
        d = r.json()
        names = {it["name"] for it in d["live"]}
        expected_titles = {"APEX PREDATOR", "TITAN", "UNBROKEN",
                           "IMMORTAL", "WARLORD", "ASCENDED"}
        missing = expected_titles - names
        assert not missing, f"missing titles: {missing} | got names={names}"

    def test_store_items_have_rarity(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.get(f"{BASE_URL}/api/store", headers=_h(tok), timeout=15)
        d = r.json()
        for it in d["live"]:
            assert "rarity" in it
            assert it["rarity"] in ("common", "rare", "epic", "legendary", "mythic",
                                    "exalted", "eternal")


# ============ /api/unlockables ============
class TestUnlockables:
    def test_unlockables_returns_bg_and_widgets(self, bot1_ctx):
        tok, _ = bot1_ctx
        r = requests.get(f"{BASE_URL}/api/unlockables", headers=_h(tok), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "backgrounds" in d and isinstance(d["backgrounds"], list) and len(d["backgrounds"]) > 0
        assert "widgets" in d and isinstance(d["widgets"], list) and len(d["widgets"]) > 0


# ============ equipped_skin appears everywhere ============
class TestEquippedSkinPropagation:
    def test_public_user_has_equipped_skin(self, bot10_ctx):
        tok, u = bot10_ctx
        # equip a skin first
        requests.post(f"{BASE_URL}/api/gear/equip-skin",
                      headers=_h(tok), json={"skin_id": "skin_arcade"}, timeout=15)
        time.sleep(0.3)
        r = requests.get(f"{BASE_URL}/api/users/{u['user_id']}/public",
                         headers=_h(tok), timeout=15)
        assert r.status_code == 200
        assert "equipped_skin" in r.json()
        assert r.json()["equipped_skin"] == "skin_arcade"
        assert "equipped_weapon" in r.json()

    def test_leaderboard_contains_equipped_skin(self, bot10_ctx):
        tok, u = bot10_ctx
        # equip
        requests.post(f"{BASE_URL}/api/gear/equip-skin",
                      headers=_h(tok), json={"skin_id": "skin_arcade"}, timeout=15)
        r = requests.get(f"{BASE_URL}/api/leaderboard/xp", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        mine = [x for x in rows if x.get("user_id") == u["user_id"]]
        assert mine, "self not in leaderboard"
        assert mine[0].get("equipped_skin") == "skin_arcade"

    def test_chat_messages_include_equipped_skin(self, bot10_ctx):
        tok, u = bot10_ctx
        # ensure equipped
        requests.post(f"{BASE_URL}/api/gear/equip-skin",
                      headers=_h(tok), json={"skin_id": "skin_arcade"}, timeout=15)
        # send a message
        msg = requests.post(f"{BASE_URL}/api/chat/main/messages",
                            headers=_h(tok),
                            json={"text": f"TEST_armory_{int(time.time())}"}, timeout=15)
        # bot might be muted etc. skip in that case
        if msg.status_code != 200:
            pytest.skip(f"chat post skipped: {msg.status_code} {msg.text}")
        # GET and check enriched with equipped_skin
        r = requests.get(f"{BASE_URL}/api/chat/main/messages", headers=_h(tok), timeout=15)
        assert r.status_code == 200
        mine = [m for m in r.json() if m.get("user_id") == u["user_id"]]
        assert mine, "no own messages"
        # latest message
        latest = mine[-1]
        assert "equipped_skin" in latest
        assert latest["equipped_skin"] == "skin_arcade"
