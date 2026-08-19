# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


def _current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


STORE_KINDS = ["avatar", "banner", "title", "badge", "background", "aura", "pet"]
STORE_PRICE_USD = 1


class StoreItemIn(BaseModel):
    kind: str
    name: str
    description: str = ""
    rarity: str = "legendary"          # legendary | mythic | exalted | eternal
    drop_month: Optional[str] = None    # "YYYY-MM"; defaults to current month
    active: bool = True
    # code-drawn visual spec (gradient / glow / motion) — no image files needed
    colors: List[str] = []
    glow: str = ""
    motion: str = "pulse"               # pulse | shimmer | orbit | flame | none
    icon: str = "★"
    rc_product_id: Optional[str] = None


def _item_public(it: dict, owned: bool) -> dict:
    return {
        "item_id": it["item_id"],
        "kind": it["kind"],
        "name": it["name"],
        "description": it.get("description", ""),
        "rarity": it.get("rarity", "legendary"),
        "drop_month": it.get("drop_month"),
        "price_usd": STORE_PRICE_USD,
        "colors": it.get("colors", []),
        "glow": it.get("glow", ""),
        "motion": it.get("motion", "pulse"),
        "icon": it.get("icon", "★"),
        "owned": owned,
    }


@api_router.get("/store")
async def store_list(user=Depends(get_current_user)):
    """This month's live drop + the member's owned collection + current equips."""
    owned = set(user.get("owned_store_items", []) or [])
    month = _current_month()
    live = await db.store_items.find({"active": True, "drop_month": month}, {"_id": 0}).sort("kind", 1).to_list(200)
    owned_docs = []
    if owned:
        owned_docs = await db.store_items.find({"item_id": {"$in": list(owned)}}, {"_id": 0}).to_list(500)
    return {
        "month": month,
        "kinds": STORE_KINDS,
        "live": [_item_public(it, it["item_id"] in owned) for it in live],
        "collection": [_item_public(it, True) for it in owned_docs],
        "equips": user.get("store_equips", {}) or {},
    }


@api_router.post("/store/purchase")
async def store_purchase(payload: dict, user=Depends(get_current_user)):
    """Grant a store item to the member. On native the client completes the $1
    RevenueCat purchase first; the granted receipt id (optional) is recorded."""
    item_id = payload.get("item_id")
    it = await db.store_items.find_one({"item_id": item_id})
    if not it:
        raise HTTPException(status_code=404, detail="Item not found")
    if item_id in (user.get("owned_store_items", []) or []):
        return {"ok": True, "already_owned": True}
    if not (it.get("active") and it.get("drop_month") == _current_month()):
        raise HTTPException(status_code=410, detail="This drop is no longer available.")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$addToSet": {"owned_store_items": item_id}},
    )
    await db.store_purchases.insert_one({
        "id": new_id("stp"), "user_id": user["user_id"], "item_id": item_id,
        "kind": it["kind"], "receipt": payload.get("receipt"),
        "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True, "item_id": item_id}


@api_router.post("/store/equip")
async def store_equip(payload: dict, user=Depends(get_current_user)):
    kind = payload.get("kind")
    item_id = payload.get("item_id")  # null to unequip
    if kind not in STORE_KINDS:
        raise HTTPException(status_code=400, detail="Invalid kind")
    if item_id and item_id not in (user.get("owned_store_items", []) or []):
        raise HTTPException(status_code=403, detail="You don't own this item")
    equips = user.get("store_equips", {}) or {}
    if item_id:
        equips[kind] = item_id
    else:
        equips.pop(kind, None)
    update = {"store_equips": equips}
    # Snapshot the pet's visuals so the avatar + map can render it without extra lookups.
    if kind == "pet":
        if item_id:
            it = await db.store_items.find_one({"item_id": item_id}, {"_id": 0})
            update["equipped_pet"] = {
                "item_id": item_id, "name": it.get("name"), "icon": it.get("icon", "🐾"),
                "colors": it.get("colors", []), "glow": it.get("glow", ""), "motion": it.get("motion", "pulse"),
            }
        else:
            update["equipped_pet"] = None
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return {"equips": equips, "equipped_pet": update.get("equipped_pet", user.get("equipped_pet"))}


# ---------- Admin: create / schedule / remove monthly drops ----------
@api_router.get("/admin/store")
async def admin_store_list(user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    items = await db.store_items.find({}, {"_id": 0}).sort("drop_month", -1).to_list(500)
    return {"items": items, "kinds": STORE_KINDS, "current_month": _current_month()}


@api_router.post("/admin/store")
async def admin_store_create(inp: StoreItemIn, user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    if inp.kind not in STORE_KINDS:
        raise HTTPException(status_code=400, detail="Invalid kind")
    doc = inp.dict()
    doc["item_id"] = new_id("sti")
    doc["drop_month"] = (inp.drop_month or _current_month()).strip()
    doc["created_at"] = datetime.now(timezone.utc)
    await db.store_items.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("created_at", None)
    return doc


@api_router.delete("/admin/store/{item_id}")
async def admin_store_delete(item_id: str, user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    await db.store_items.delete_one({"item_id": item_id})
    return {"ok": True}
