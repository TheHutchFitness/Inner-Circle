# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/enhanced/status")
async def enhanced_status(user=Depends(get_current_user)):
    return {
        "age_verified": bool(user.get("age_verified")),
        "enhanced": bool(user.get("enhanced")),
        "enhanced_access": bool(user.get("enhanced") or user.get("enhanced_access")),
        "disclaimer": PED_DISCLAIMER,
    }


@api_router.post("/enhanced/verify-age")
async def enhanced_verify_age(inp: AgeIn, user=Depends(get_current_user)):
    age = _age_from_dob(inp.dob)
    if age < 20:
        raise HTTPException(status_code=403, detail="You must be 20 or older to access The Enhanced.")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"dob": inp.dob, "age_verified": True}})
    return {"ok": True, "age": age}


@api_router.post("/enhanced/consent")
async def enhanced_consent(inp: ConsentIn, user=Depends(get_current_user)):
    if not user.get("age_verified"):
        raise HTTPException(status_code=403, detail="Verify your age first.")
    if inp.accept:
        await db.users.update_one({"user_id": user["user_id"]},
            {"$set": {"enhanced": True, "enhanced_since": datetime.now(timezone.utc)}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


@api_router.get("/enhanced/peds")
async def enhanced_peds(user=Depends(get_current_user)):
    return {"peds": PED_LIBRARY, "disclaimer": PED_DISCLAIMER}


@api_router.get("/enhanced/regimen")
async def get_regimen(user=Depends(get_current_user)):
    active = await db.ped_regimens.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0}, sort=[("created_at", -1)])
    history = await db.ped_regimens.find({"user_id": user["user_id"], "active": False}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in [active, *history]:
        if r and isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if r and isinstance(r.get("archived_at"), datetime):
            r["archived_at"] = r["archived_at"].isoformat()
    return {"active": active, "history": history}


@api_router.post("/enhanced/regimen")
async def set_regimen(inp: RegimenIn, user=Depends(get_current_user)):
    if not (user.get("enhanced") or user.get("enhanced_access")):
        raise HTTPException(status_code=403, detail="Enhanced access required.")
    if not inp.items:
        raise HTTPException(status_code=400, detail="Add at least one item.")
    now = datetime.now(timezone.utc)
    await db.ped_regimens.update_many(
        {"user_id": user["user_id"], "active": True},
        {"$set": {"active": False, "archived_at": now}},
    )
    doc = {
        "regimen_id": new_id("reg"), "user_id": user["user_id"], "active": True,
        "items": [i.model_dump() for i in inp.items], "created_at": now,
    }
    await db.ped_regimens.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = now.isoformat()
    return doc


@api_router.post("/enhanced/regimen/note")
async def update_regimen_note(inp: RegimenNoteIn, user=Depends(get_current_user)):
    if not (user.get("enhanced") or user.get("enhanced_access")):
        raise HTTPException(status_code=403, detail="Enhanced access required.")
    active = await db.ped_regimens.find_one({"user_id": user["user_id"], "active": True}, sort=[("created_at", -1)])
    if not active:
        raise HTTPException(status_code=404, detail="No active regimen.")
    items = active.get("items", [])
    if inp.index < 0 or inp.index >= len(items):
        raise HTTPException(status_code=400, detail="Invalid item.")
    items[inp.index]["notes"] = inp.notes[:1000]
    await db.ped_regimens.update_one({"_id": active["_id"]}, {"$set": {"items": items}})
    return {"ok": True}


@api_router.get("/enhanced/next-dose")
async def enhanced_next_dose(user=Depends(get_current_user)):
    if not (user.get("enhanced") or user.get("enhanced_access")):
        return {"enhanced": False, "active": False, "items": [], "due_count": 0}
    active = await db.ped_regimens.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0}, sort=[("created_at", -1)])
    if not active:
        return {"enhanced": True, "active": False, "items": [], "due_count": 0}
    items = []
    for it in active.get("items", []):
        due = _dose_due_today(it.get("schedule", ""))
        items.append({"name": it.get("name"), "dosage": it.get("dosage"), "schedule": it.get("schedule"), "due_today": due})
    return {
        "enhanced": True, "active": True, "items": items,
        "due_count": sum(1 for i in items if i["due_today"]),
        "today": _WEEKDAYS[datetime.now(timezone.utc).weekday()].upper(),
    }
