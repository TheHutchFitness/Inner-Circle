# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/workout/templates")
async def workout_templates(user=Depends(get_current_user)):
    return WORKOUT_TEMPLATES


@api_router.get("/exercises")
async def list_exercises(user=Depends(get_current_user)):
    custom = user.get("custom_exercises", []) or []
    favourites = user.get("favourite_exercises", []) or []
    # Recent & favourites: most-used exercises from the athlete's recent logs
    recent_counts: dict[str, int] = {}
    async for w in db.workouts.find({"user_id": user["user_id"]}, {"_id": 0, "exercises": 1}).sort("logged_at", -1).limit(60):
        for ex in w.get("exercises", []) or []:
            n = ex.get("name")
            if n:
                recent_counts[n] = recent_counts.get(n, 0) + 1
    recent = [{"name": n, "count": c} for n, c in sorted(recent_counts.items(), key=lambda x: -x[1])][:6]
    return {"library": EXERCISE_LIBRARY, "custom": custom, "recent": recent, "favourites": favourites}


@api_router.post("/exercises/favourite")
async def toggle_favourite(inp: FavouriteIn, user=Depends(get_current_user)):
    name = (inp.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    op = {"$addToSet": {"favourite_exercises": name}} if inp.on else {"$pull": {"favourite_exercises": name}}
    await db.users.update_one({"user_id": user["user_id"]}, op)
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "favourite_exercises": 1})
    return {"favourites": fresh.get("favourite_exercises", []) or []}


@api_router.post("/exercises/custom")
async def add_custom_exercise(inp: CustomExerciseIn, user=Depends(get_current_user)):
    name = inp.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    entry = {"name": name, "category": (inp.category or "Custom").strip() or "Custom", "desc": (inp.desc or "").strip()[:300]}
    await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"custom_exercises": entry}})
    custom = (await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "custom_exercises": 1})).get("custom_exercises", [])
    return {"custom": custom, "added": entry}


@api_router.get("/exercises/demo")
async def exercise_demo(name: str, force: bool = False, user=Depends(get_current_user)):
    key = (name or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="name required")
    if force:
        await db.exercise_demos.delete_one({"name": key})
    cached = await db.exercise_demos.find_one({"name": key}, {"_id": 0})
    if cached and cached.get("media_id"):
        return {"name": key, "media_id": cached["media_id"]}
    desc = next((e.get("desc", "") for e in EXERCISE_LIBRARY if e["name"] == key), "")
    try:
        import base64 as _b64
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"exdemo-{uuid.uuid4().hex[:8]}",
                       system_message="You are an expert fitness form illustrator.")
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        import random as _rnd
        variant = _rnd.choice([
            "dramatic low-angle view", "clean side profile", "dynamic three-quarter angle",
            "high-contrast spotlight", "neon-blue studio lighting", "moody gym backdrop",
        ])
        prompt = (
            f"Clean instructional side-view illustration of a single muscular athlete performing the '{key}' exercise "
            f"with correct form, captured mid-repetition. {desc} "
            f"Cyberpunk-anime gym aesthetic, {variant}, subtle cyan rim lighting, plain dark background, full body clearly visible. "
            "No text, no labels, no watermark."
        )
        text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        if not images:
            raise RuntimeError(f"no image (text={text[:60]})")
        raw = _b64.b64decode(images[0]["data"])
        path = f"{STORAGE_APP_NAME}/exercise_demos/{uuid.uuid4().hex}.png"
        await storage_put(path, raw, "image/png")
        media_id = new_id("med")
        now = datetime.now(timezone.utc)
        await db.chat_media.insert_one({
            "media_id": media_id, "user_id": "system", "storage_path": path,
            "content_type": "image/png", "media_type": "image", "size": len(raw),
            "original_name": f"{key}.png", "created_at": now,
        })
        await db.exercise_demos.update_one({"name": key},
            {"$set": {"name": key, "media_id": media_id, "storage_path": path, "created_at": now}}, upsert=True)
        return {"name": key, "media_id": media_id}
    except Exception as e:
        logger.error(f"Exercise demo gen failed for '{key}': {e}")
        raise HTTPException(status_code=502, detail="Could not generate a demo right now — try again")


@api_router.get("/exercise/stats")
async def exercise_stats(name: str, rng: str = "1m", user=Depends(get_current_user)):
    sessions = await _exercise_sessions(user["user_id"], name, rng)
    total_sets = total_reps = 0
    total_weight = total_volume = 0.0
    max_weight = max_reps = max_volume = 0.0
    max_weight_date = max_reps_date = max_volume_date = None
    wmaxes_w = []; wmaxes_r = []; wmaxes_v = []
    for s in sessions:
        sw = sr = sv = 0.0
        for st in s["sets"]:
            w = st["weight_lb"]; reps = st["reps"]; vol = w * reps
            total_sets += 1; total_reps += reps
            total_weight += w; total_volume += vol
            if w > max_weight: max_weight, max_weight_date = w, s["date"]
            if reps > max_reps: max_reps, max_reps_date = reps, s["date"]
            if vol > max_volume: max_volume, max_volume_date = vol, s["date"]
            sw = max(sw, w); sr = max(sr, reps); sv = max(sv, vol)
        if s["sets"]:
            wmaxes_w.append(sw); wmaxes_r.append(sr); wmaxes_v.append(sv)
    n = max(1, total_sets)
    nw = max(1, len(wmaxes_w))
    return {
        "name": name,
        "range": rng,
        "total_sets": total_sets,
        "total_workouts": len(sessions),
        "total_weight": round(total_weight, 1),
        "total_reps": total_reps,
        "total_volume": round(total_volume, 1),
        "avg_weight": round(total_weight / n, 1),
        "avg_reps": round(total_reps / n, 1),
        "avg_volume": round(total_volume / n, 1),
        "max_weight": round(max_weight, 1), "max_weight_date": max_weight_date,
        "max_reps": int(max_reps), "max_reps_date": max_reps_date,
        "max_volume": round(max_volume, 1), "max_volume_date": max_volume_date,
        "avg_max_weight": round(sum(wmaxes_w) / nw, 1),
        "avg_max_reps": round(sum(wmaxes_r) / nw, 1),
        "avg_max_volume": round(sum(wmaxes_v) / nw, 1),
    }


@api_router.get("/exercise/log")
async def exercise_log(name: str, rng: str = "all", user=Depends(get_current_user)):
    return {"name": name, "sessions": await _exercise_sessions(user["user_id"], name, rng)}


@api_router.get("/exercise/graph")
async def exercise_graph(name: str, rng: str = "3m", user=Depends(get_current_user)):
    sessions = await _exercise_sessions(user["user_id"], name, rng)
    points = []
    for s in reversed(sessions):  # oldest first
        if not s["sets"]:
            continue
        top_w = max(st["weight_lb"] for st in s["sets"])
        vol = sum(st["weight_lb"] * st["reps"] for st in s["sets"])
        points.append({"date": s["date"], "weight": round(top_w, 1), "volume": round(vol, 1)})
    return {"name": name, "points": points}
