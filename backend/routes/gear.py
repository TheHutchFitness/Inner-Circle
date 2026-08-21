# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403

SKIN_PRICE_USD = 1


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _month_label(m: str) -> str:
    try:
        from datetime import datetime as _dt
        return _dt.strptime(m + "-01", "%Y-%m-%d").strftime("%b %Y")
    except Exception:
        return m

# ---- Paid full-body skins (bought in The Vault, $1 each) ----
PAID_SKINS = [
    {"id": "skin_dragonknight", "name": "Dragon Knight", "rarity": "mythic", "drop_month": "2026-08"},
    {"id": "skin_dbz", "name": "Super Saiyan", "rarity": "mythic", "drop_month": "2026-08"},
    {"id": "skin_mercy", "name": "Battle Valkyrie", "rarity": "mythic", "drop_month": "2026-08"},
    {"id": "skin_mecha", "name": "Mecha Pilot", "rarity": "legendary", "drop_month": "2026-09"},
    {"id": "skin_halo", "name": "Space Warrior", "rarity": "legendary", "drop_month": "2026-09"},
    {"id": "skin_mk", "name": "Kombat Ninja", "rarity": "legendary", "drop_month": "2026-09"},
    {"id": "skin_cod", "name": "Spec-Ops Operator", "rarity": "epic", "drop_month": "2026-10"},
    {"id": "skin_viking", "name": "Viking Berserker", "rarity": "epic", "drop_month": "2026-10"},
    {"id": "skin_wsm", "name": "World's Strongest", "rarity": "epic", "drop_month": "2026-10"},
    {"id": "skin_aot", "name": "Scout Regiment", "rarity": "legendary", "drop_month": "2026-11"},
]

# ---- Free full-body skins unlocked by level (progression / quests feed XP) ----
FREE_SKINS = [
    {"id": "skin_anime", "name": "Anime Hero", "unlock_level": 2, "rarity": "common"},
    {"id": "skin_knight", "name": "Steel Knight", "unlock_level": 6, "rarity": "common"},
    {"id": "skin_cyber", "name": "Cyber Runner", "unlock_level": 10, "rarity": "rare"},
    {"id": "skin_space", "name": "Astronaut", "unlock_level": 16, "rarity": "rare"},
    {"id": "skin_ancient", "name": "Gladiator", "unlock_level": 22, "rarity": "epic"},
    {"id": "skin_monk", "name": "Iron Monk", "unlock_level": 30, "rarity": "epic"},
    {"id": "skin_arcade", "name": "Arcade Hero", "unlock_level": 38, "rarity": "legendary"},
]

# ---- Weapons (side prop). Free unlock by level, or paid in The Store. ----
FREE_WEAPONS = [
    {"id": "w_sword", "name": "Iron Sword", "unlock_level": 4, "rarity": "common"},
    {"id": "w_bo", "name": "Bo Staff", "unlock_level": 12, "rarity": "rare"},
    {"id": "w_daggers", "name": "Twin Daggers", "unlock_level": 18, "rarity": "epic"},
    {"id": "w_bow", "name": "War Bow", "unlock_level": 26, "rarity": "epic"},
]
PAID_WEAPONS = [
    {"id": "w_katana", "name": "Plasma Katana", "rarity": "mythic"},
    {"id": "w_plasma", "name": "Plasma Rifle", "rarity": "legendary"},
    {"id": "w_axe", "name": "Rune War Axe", "rarity": "epic"},
    {"id": "w_glaive", "name": "Dragon Glaive", "rarity": "mythic"},
]

# ---- Quest-exclusive gear: unlocked ONLY by clearing special/harder quests.
# metric: "boss" = boss quests claimed, "monthly" = monthly quests claimed,
# "hard" = boss + monthly claimed, "total" = any quest claimed. ----
QUEST_SKINS = [
    {"id": "skin_shadow", "name": "Shadow Assassin", "rarity": "epic", "metric": "hard", "count": 3,
     "quest_label": "Clear 3 Boss or Monthly quests"},
    {"id": "skin_flame", "name": "Flame Berserker", "rarity": "legendary", "metric": "hard", "count": 6,
     "quest_label": "Clear 6 Boss or Monthly quests"},
    {"id": "skin_frost", "name": "Frost Sovereign", "rarity": "legendary", "metric": "boss", "count": 5,
     "quest_label": "Defeat 5 Bosses"},
    {"id": "skin_celestial", "name": "Celestial Ascended", "rarity": "mythic", "metric": "hard", "count": 12,
     "quest_label": "Clear 12 Boss or Monthly quests"},
    {"id": "skin_venom", "name": "Venom Warden", "rarity": "epic", "metric": "hard", "count": 9,
     "quest_label": "Clear 9 Boss or Monthly quests"},
    {"id": "skin_storm", "name": "Storm Reaver", "rarity": "legendary", "metric": "boss", "count": 8,
     "quest_label": "Defeat 8 Bosses"},
    {"id": "skin_abyss", "name": "Abyss Leviathan", "rarity": "legendary", "metric": "monthly", "count": 6,
     "quest_label": "Clear 6 Monthly quests"},
]
QUEST_WEAPONS = [
    {"id": "w_shadowblade", "name": "Shadow Blade", "rarity": "epic", "metric": "total", "count": 15,
     "quest_label": "Claim 15 quests"},
    {"id": "w_soulscythe", "name": "Soul Scythe", "rarity": "legendary", "metric": "boss", "count": 3,
     "quest_label": "Defeat 3 Bosses"},
    {"id": "w_stormspear", "name": "Storm Spear", "rarity": "mythic", "metric": "monthly", "count": 4,
     "quest_label": "Clear 4 Monthly quests"},
]

_PAID_SKIN_IDS = {s["id"] for s in PAID_SKINS}
_FREE_SKIN = {s["id"]: s for s in FREE_SKINS}
_QUEST_SKIN = {s["id"]: s for s in QUEST_SKINS}

# ---- Seasonal boss skin: unlock by defeating bosses DURING the active season; vaults after ----
def _current_season() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year}-S{(now.month - 1) // 3 + 1}"

SEASON_SKINS = [
    {"id": "skin_season1", "name": "Void Overlord", "rarity": "mythic", "season": "2026-S3",
     "boss_count": 6, "quest_label": "Defeat 6 Bosses this season"},
]
_SEASON_SKIN = {s["id"]: s for s in SEASON_SKINS}

_PAID_WEAP_IDS = {w["id"] for w in PAID_WEAPONS}
_FREE_WEAP = {w["id"]: w for w in FREE_WEAPONS}
_QUEST_WEAP = {w["id"]: w for w in QUEST_WEAPONS}
_ALL_SKIN_IDS = _PAID_SKIN_IDS | set(_FREE_SKIN) | set(_QUEST_SKIN) | set(_SEASON_SKIN)
_ALL_WEAP_IDS = _PAID_WEAP_IDS | set(_FREE_WEAP) | set(_QUEST_WEAP)


async def _quest_counts(user_id: str) -> dict:
    """Count claimed quests by scope from quest_claims (quest_key = 'scope:...')."""
    boss = monthly = total = 0
    async for c in db.quest_claims.find({"user_id": user_id}, {"_id": 0, "quest_key": 1}):
        total += 1
        key = c.get("quest_key", "")
        if key.startswith("boss:"):
            boss += 1
        elif key.startswith("monthly:"):
            monthly += 1
    return {"boss": boss, "monthly": monthly, "hard": boss + monthly, "total": total}


def _quest_met(item: dict, counts: dict) -> bool:
    return counts.get(item["metric"], 0) >= item["count"]


def _skin_row(s: dict, source: str, user: dict, level: int, counts: dict, month: str) -> dict:
    owned = s["id"] in (user.get("owned_skins", []) or [])
    row = {
        "id": s["id"], "name": s["name"], "source": source, "paid": source == "paid",
        "rarity": s.get("rarity", "rare"),
        "price_usd": SKIN_PRICE_USD if source == "paid" else 0,
        "unlock_level": s.get("unlock_level", 0),
        "quest_label": s.get("quest_label", ""),
        "owned": owned,
        "equipped": user.get("equipped_skin") == s["id"],
    }
    if source == "paid":
        dm = s.get("drop_month", month)
        row["drop_month"] = dm
        row["drop_label"] = _month_label(dm)
        row["available"] = dm == month          # buyable this month
        row["upcoming"] = dm > month            # future drop
        row["vaulted"] = dm < month and not owned  # gone — missed it
        row["unlocked"] = owned
    elif source == "quest":
        row["unlocked"] = _quest_met(s, counts)
    else:
        row["unlocked"] = level >= s["unlock_level"]
    return row


def _weap_row(w: dict, source: str, user: dict, level: int, counts: dict) -> dict:
    owned = w["id"] in (user.get("owned_weapons", []) or [])
    if source == "paid":
        unlocked = owned
    elif source == "quest":
        unlocked = _quest_met(w, counts)
    else:
        unlocked = level >= w["unlock_level"]
    return {
        "id": w["id"], "name": w["name"], "source": source, "paid": source == "paid",
        "rarity": w.get("rarity", "rare"),
        "price_usd": SKIN_PRICE_USD if source == "paid" else 0,
        "unlock_level": w.get("unlock_level", 0),
        "quest_label": w.get("quest_label", ""),
        "owned": owned, "unlocked": unlocked,
        "equipped": user.get("equipped_weapon") == w["id"],
    }


def _season_row(s: dict, user: dict, counts: dict) -> dict:
    owned = s["id"] in (user.get("owned_skins", []) or [])
    active = s["season"] == _current_season()
    met = counts.get("boss", 0) >= s["boss_count"]
    return {
        "id": s["id"], "name": s["name"], "source": "season", "paid": False,
        "rarity": s.get("rarity", "mythic"), "price_usd": 0, "unlock_level": 0,
        "quest_label": s["quest_label"], "season": s["season"], "active": active,
        "vaulted": (not active and not owned),
        "owned": owned, "unlocked": owned or (active and met),
        "equipped": user.get("equipped_skin") == s["id"],
    }



@api_router.get("/gear")
async def gear_list(user=Depends(get_current_user)):
    level = level_from_xp(user.get("xp", 0))
    counts = await _quest_counts(user["user_id"])
    month = _current_month()
    skins = [_skin_row(s, "paid", user, level, counts, month) for s in PAID_SKINS] + \
            [_skin_row(s, "level", user, level, counts, month) for s in FREE_SKINS] + \
            [_skin_row(s, "quest", user, level, counts, month) for s in QUEST_SKINS] + \
            [_season_row(s, user, counts) for s in SEASON_SKINS]
    weapons = [_weap_row(w, "paid", user, level, counts) for w in PAID_WEAPONS] + \
              [_weap_row(w, "level", user, level, counts) for w in FREE_WEAPONS] + \
              [_weap_row(w, "quest", user, level, counts) for w in QUEST_WEAPONS]
    return {
        "level": level,
        "month": month,
        "quest_counts": counts,
        "equipped_skin": user.get("equipped_skin"),
        "equipped_weapon": user.get("equipped_weapon"),
        "skins": skins,
        "weapons": weapons,
    }


@api_router.post("/gear/equip-skin")
async def equip_skin(payload: dict, user=Depends(get_current_user)):
    skin_id = payload.get("skin_id") or None
    if skin_id:
        if skin_id not in _ALL_SKIN_IDS:
            raise HTTPException(status_code=404, detail="Unknown skin")
        level = level_from_xp(user.get("xp", 0))
        if skin_id in _PAID_SKIN_IDS:
            if skin_id not in (user.get("owned_skins", []) or []):
                raise HTTPException(status_code=403, detail="You don't own this skin")
        elif skin_id in _QUEST_SKIN:
            counts = await _quest_counts(user["user_id"])
            if not _quest_met(_QUEST_SKIN[skin_id], counts):
                raise HTTPException(status_code=403, detail="Locked — clear the quest to unlock")
        elif skin_id in _SEASON_SKIN:
            s = _SEASON_SKIN[skin_id]
            if skin_id not in (user.get("owned_skins", []) or []):
                counts = await _quest_counts(user["user_id"])
                if s["season"] != _current_season() or counts.get("boss", 0) < s["boss_count"]:
                    raise HTTPException(status_code=403, detail="Locked — earn it this season")
                await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"owned_skins": skin_id}})
        elif level < _FREE_SKIN[skin_id]["unlock_level"]:
            raise HTTPException(status_code=403, detail="Locked — level up to unlock")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"equipped_skin": skin_id}})
    return {"equipped_skin": skin_id}


@api_router.post("/gear/equip-weapon")
async def equip_weapon(payload: dict, user=Depends(get_current_user)):
    weapon_id = payload.get("weapon_id") or None
    if weapon_id:
        if weapon_id not in _ALL_WEAP_IDS:
            raise HTTPException(status_code=404, detail="Unknown weapon")
        level = level_from_xp(user.get("xp", 0))
        if weapon_id in _PAID_WEAP_IDS:
            if weapon_id not in (user.get("owned_weapons", []) or []):
                raise HTTPException(status_code=403, detail="You don't own this weapon")
        elif weapon_id in _QUEST_WEAP:
            counts = await _quest_counts(user["user_id"])
            if not _quest_met(_QUEST_WEAP[weapon_id], counts):
                raise HTTPException(status_code=403, detail="Locked — clear the quest to unlock")
        elif level < _FREE_WEAP[weapon_id]["unlock_level"]:
            raise HTTPException(status_code=403, detail="Locked — level up to unlock")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"equipped_weapon": weapon_id}})
    return {"equipped_weapon": weapon_id}


@api_router.post("/gear/purchase")
async def gear_purchase(payload: dict, user=Depends(get_current_user)):
    """Grant a paid skin/weapon. On native the client completes the $1 RevenueCat
    purchase first; preview/web grants directly for testing."""
    kind = payload.get("kind")
    item_id = payload.get("id")
    if kind == "skin" and item_id in _PAID_SKIN_IDS:
        field, coll = "owned_skins", "skin"
        s = next(x for x in PAID_SKINS if x["id"] == item_id)
        if s.get("drop_month", _current_month()) != _current_month():
            raise HTTPException(status_code=410, detail="This skin isn't in this month's drop.")
    elif kind == "weapon" and item_id in _PAID_WEAP_IDS:
        field, coll = "owned_weapons", "weapon"
    else:
        raise HTTPException(status_code=404, detail="Item not found")
    if item_id in (user.get(field, []) or []):
        return {"ok": True, "already_owned": True}
    await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {field: item_id}})
    await db.store_purchases.insert_one({
        "id": new_id("stp"), "user_id": user["user_id"], "item_id": item_id,
        "kind": coll, "receipt": payload.get("receipt"),
        "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True, "id": item_id}


async def quest_loot_for_claim(user_id: str, scope: str) -> list:
    """After a quest claim was recorded, return any quest-exclusive skins/weapons
    that JUST became unlocked by this claim (for the Boss victory loot reveal)."""
    after = await _quest_counts(user_id)
    prev = dict(after)
    prev["total"] = max(0, prev["total"] - 1)
    if scope == "boss":
        prev["boss"] = max(0, prev["boss"] - 1)
        prev["hard"] = max(0, prev["hard"] - 1)
    elif scope == "monthly":
        prev["monthly"] = max(0, prev["monthly"] - 1)
        prev["hard"] = max(0, prev["hard"] - 1)
    loot = []
    for it in QUEST_SKINS:
        if _quest_met(it, after) and not _quest_met(it, prev):
            loot.append({"kind": "skin", "id": it["id"], "name": it["name"], "rarity": it["rarity"]})
    for it in QUEST_WEAPONS:
        if _quest_met(it, after) and not _quest_met(it, prev):
            loot.append({"kind": "weapon", "id": it["id"], "name": it["name"], "rarity": it["rarity"]})
    # Seasonal boss skin drops on the boss claim that crosses the threshold, during the active season
    if scope == "boss":
        for it in SEASON_SKINS:
            if it["season"] == _current_season() and after["boss"] >= it["boss_count"] > prev["boss"]:
                await db.users.update_one({"user_id": user_id}, {"$addToSet": {"owned_skins": it["id"]}})
                loot.append({"kind": "skin", "id": it["id"], "name": it["name"], "rarity": it["rarity"], "seasonal": True})
    return loot
