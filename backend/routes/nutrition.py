# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/nutrition/today")
async def nutrition_today(user=Depends(get_current_user)):
    d = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = await db.nutrition_logs.find_one({"user_id": user["user_id"], "date": d}, {"_id": 0, "user_id": 0, "updated_at": 0})
    return row or {"date": d, "calories": 0, "protein": 0, "carbs": 0, "fats": 0}


@api_router.post("/nutrition/today")
async def nutrition_save(inp: NutritionIn, user=Depends(get_current_user)):
    d = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = {
        "user_id": user["user_id"], "date": d,
        "calories": max(0, round(inp.calories)), "protein": max(0, round(inp.protein)),
        "carbs": max(0, round(inp.carbs)), "fats": max(0, round(inp.fats)),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.nutrition_logs.update_one({"user_id": user["user_id"], "date": d}, {"$set": doc}, upsert=True)
    return {"date": d, "calories": doc["calories"], "protein": doc["protein"], "carbs": doc["carbs"], "fats": doc["fats"]}


@api_router.get("/supplements")
async def get_supplements(user=Depends(get_current_user)):
    return {"supplements": user.get("supplements", []) or []}


@api_router.post("/supplements")
async def toggle_supplement(inp: SupplementIn, user=Depends(get_current_user)):
    name = (inp.name or "").strip()[:60]
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    op = {"$addToSet": {"supplements": name}} if inp.on else {"$pull": {"supplements": name}}
    await db.users.update_one({"user_id": user["user_id"]}, op)
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "supplements": 1})
    return {"supplements": fresh.get("supplements", []) or []}
