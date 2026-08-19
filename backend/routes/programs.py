# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/programs")
async def list_programs(user=Depends(get_current_user)):
    return DEFAULT_PROGRAMS


@api_router.post("/programs/monthly/generate")
async def monthly_generate(inp: MonthlyGenIn, user=Depends(get_current_user)):
    split = MONTHLY_SPLITS.get(inp.split)
    if not split:
        raise HTTPException(status_code=400, detail="Unknown split")
    today = datetime.now(timezone.utc).date()
    days = []
    for i in range(28):
        tid = split["pattern"][i % 7]
        tpl = _template_by_id(tid) if tid != "rest" else None
        days.append({
            "day": i + 1,
            "date": (today + timedelta(days=i)).isoformat(),
            "template_id": tid,
            "name": tpl["name"] if tpl else "Rest",
        })
    # one active program at a time
    await db.monthly_programs.update_many({"user_id": user["user_id"], "active": True}, {"$set": {"active": False}})
    doc = {
        "monthly_id": new_id("mp"),
        "user_id": user["user_id"],
        "split": inp.split,
        "split_name": split["name"],
        "start_date": today.isoformat(),
        "days": days,
        "completed_days": [],
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.monthly_programs.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.get("/programs/monthly/current")
async def monthly_current(user=Depends(get_current_user)):
    prog = await db.monthly_programs.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0})
    if not prog:
        return {"active": False}
    if isinstance(prog.get("created_at"), datetime):
        prog["created_at"] = prog["created_at"].isoformat()
    today = datetime.now(timezone.utc).date()
    start = datetime.fromisoformat(prog["start_date"]).date()
    idx = (today - start).days
    prog["active"] = True
    prog["finished"] = idx >= 28
    prog["today_index"] = min(max(idx, 0), 27)
    if 0 <= idx < 28:
        entry = prog["days"][idx]
        tpl = _template_by_id(entry["template_id"]) if entry["template_id"] != "rest" else None
        prog["today"] = {**entry, "exercises": tpl["exercises"] if tpl else []}
    else:
        prog["today"] = None
    return prog


@api_router.delete("/programs/monthly/current")
async def monthly_cancel(user=Depends(get_current_user)):
    await db.monthly_programs.update_many({"user_id": user["user_id"], "active": True}, {"$set": {"active": False}})
    return {"active": False}
