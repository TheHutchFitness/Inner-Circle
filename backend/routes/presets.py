# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/presets")
async def get_presets(user=Depends(get_current_user)):
    rows = await db.set_presets.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/presets")
async def add_preset(inp: PresetIn, user=Depends(get_current_user)):
    reps = max(1, int(inp.reps))
    weight = max(0, round(float(inp.weight_lb), 1))
    rpe = max(1, min(10, round(float(inp.rpe), 1)))
    label = (inp.label or "").strip()[:40] or f"{int(weight)}lb × {reps}"
    doc = {
        "preset_id": new_id("pre"), "user_id": user["user_id"],
        "reps": reps, "weight_lb": weight, "rpe": rpe, "label": label,
        "created_at": datetime.now(timezone.utc),
    }
    await db.set_presets.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str, user=Depends(get_current_user)):
    await db.set_presets.delete_one({"preset_id": preset_id, "user_id": user["user_id"]})
    return {"ok": True}
