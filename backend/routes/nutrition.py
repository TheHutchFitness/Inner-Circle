# ruff: noqa: F403, F405
from datetime import timedelta

from shared import *  # noqa: F401,F403


@api_router.get("/nutrition/today")
async def nutrition_today(user=Depends(get_current_user)):
    d = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = await db.nutrition_logs.find_one({"user_id": user["user_id"], "date": d}, {"_id": 0, "user_id": 0, "updated_at": 0})
    row = row or {"date": d, "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "water_ml": 0}
    # Water goal streak only counts if the last goal-met day is today or yesterday.
    streak = int(user.get("water_streak", 0) or 0)
    sdate = user.get("water_streak_date")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    if sdate not in (d, yesterday):
        streak = 0
    row["water_streak"] = streak
    return row


@api_router.post("/nutrition/water")
async def nutrition_water(payload: dict = Body(default={}), user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    d = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    ml = max(0, min(20000, int((payload or {}).get("ml", 0) or 0)))
    await db.nutrition_logs.update_one(
        {"user_id": user["user_id"], "date": d},
        {"$set": {"water_ml": ml, "updated_at": now},
         "$setOnInsert": {"user_id": user["user_id"], "date": d}},
        upsert=True,
    )
    # Streak: award the day once intake reaches the goal.
    goal = int((user.get("macro_goals") or {}).get("water_goal", 3000) or 0)
    goal_met = goal > 0 and ml >= goal
    streak = int(user.get("water_streak", 0) or 0)
    sdate = user.get("water_streak_date")
    new_badge = None
    if goal_met and sdate != d:  # first time today crossing the goal
        streak = streak + 1 if sdate == yesterday else 1
        updates = {"water_streak": streak, "water_streak_date": d}
        badges = set(user.get("badges", []) or [])
        if streak >= 3 and "water_streak_3" not in badges:
            new_badge = "3"
            await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"badges": "water_streak_3"}})
        if streak >= 7 and "water_streak_7" not in badges:
            new_badge = "7"
            await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"badges": "water_streak_7"}})
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    elif not sdate or sdate not in (d, yesterday):
        streak = 0
    return {"date": d, "water_ml": ml, "goal_met": goal_met, "water_streak": streak, "new_badge": new_badge}


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


@api_router.get("/nutrition/meals")
async def list_meals(user=Depends(get_current_user)):
    rows = await db.saved_meals.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", 1).to_list(200)
    return {"meals": rows}


@api_router.post("/nutrition/meals")
async def save_meal(payload: dict = Body(default={}), user=Depends(get_current_user)):
    name = str((payload or {}).get("name", "")).strip()[:40]
    if not name:
        raise HTTPException(status_code=400, detail="Meal name required")
    doc = {
        "id": new_id("meal"), "user_id": user["user_id"], "name": name,
        "calories": max(0, int((payload or {}).get("calories", 0) or 0)),
        "protein": max(0, int((payload or {}).get("protein", 0) or 0)),
        "carbs": max(0, int((payload or {}).get("carbs", 0) or 0)),
        "fats": max(0, int((payload or {}).get("fats", 0) or 0)),
        "created_at": datetime.now(timezone.utc),
    }
    await db.saved_meals.insert_one(dict(doc))
    doc.pop("created_at", None)
    doc.pop("user_id", None)
    return doc


@api_router.delete("/nutrition/meals/{meal_id}")
async def delete_meal(meal_id: str, user=Depends(get_current_user)):
    await db.saved_meals.delete_one({"id": meal_id, "user_id": user["user_id"]})
    return {"ok": True}


@api_router.get("/nutrition/foods")
async def list_custom_foods(user=Depends(get_current_user)):
    rows = await db.custom_foods.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}).sort("created_at", 1).to_list(300)
    return {"foods": rows}


@api_router.post("/nutrition/foods")
async def add_custom_food(payload: dict = Body(default={}), user=Depends(get_current_user)):
    name = str((payload or {}).get("name", "")).strip()[:40]
    if not name:
        raise HTTPException(status_code=400, detail="Food name required")
    doc = {
        "id": new_id("food"), "user_id": user["user_id"], "name": name,
        "grams": max(1, int((payload or {}).get("grams", 100) or 100)),
        "calories": max(0, int((payload or {}).get("calories", 0) or 0)),
        "protein": max(0, int((payload or {}).get("protein", 0) or 0)),
        "carbs": max(0, int((payload or {}).get("carbs", 0) or 0)),
        "fats": max(0, int((payload or {}).get("fats", 0) or 0)),
        "created_at": datetime.now(timezone.utc),
    }
    await db.custom_foods.insert_one(dict(doc))
    doc.pop("created_at", None)
    doc.pop("user_id", None)
    return doc


@api_router.delete("/nutrition/foods/{food_id}")
async def delete_custom_food(food_id: str, user=Depends(get_current_user)):
    await db.custom_foods.delete_one({"id": food_id, "user_id": user["user_id"]})
    return {"ok": True}


@api_router.get("/nutrition/goals")
async def get_goals(user=Depends(get_current_user)):
    g = user.get("macro_goals") or {}
    return {"calories": int(g.get("calories", 0) or 0), "protein": int(g.get("protein", 0) or 0),
            "carbs": int(g.get("carbs", 0) or 0), "fats": int(g.get("fats", 0) or 0),
            "water_goal": int(g.get("water_goal", 3000) or 3000)}


@api_router.post("/nutrition/goals")
async def set_goals(payload: dict = Body(default={}), user=Depends(get_current_user)):
    existing = user.get("macro_goals") or {}
    p = payload or {}
    goals = {
        "calories": max(0, int(p.get("calories", 0) or 0)),
        "protein": max(0, int(p.get("protein", 0) or 0)),
        "carbs": max(0, int(p.get("carbs", 0) or 0)),
        "fats": max(0, int(p.get("fats", 0) or 0)),
        "water_goal": max(0, min(20000, int(p.get("water_goal", existing.get("water_goal", 3000)) or 0))),
    }
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"macro_goals": goals}})
    return goals
