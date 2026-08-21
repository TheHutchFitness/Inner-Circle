# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


# ---------- Cardio (Strava-style) ----------
@api_router.post("/cardio/log")
async def log_cardio(inp: CardioLog, user=Depends(get_current_user)):
    speed_kmh = (inp.distance_km / (inp.duration_s / 3600)) if inp.duration_s > 0 else 0
    doc = {
        "cardio_id": new_id("cardio"),
        "user_id": user["user_id"],
        "activity_type": inp.activity_type,
        "distance_km": round(inp.distance_km, 3),
        "duration_s": inp.duration_s,
        "elevation_gain_m": round(inp.elevation_gain_m or 0, 1),
        "temperature_c": inp.temperature_c,
        "avg_pace_min_km": inp.avg_pace_min_km,
        "avg_speed_kmh": round(speed_kmh, 2),
        "route": (inp.route or [])[:2000],
        "logged_at": datetime.now(timezone.utc),
    }
    await db.cardio.insert_one(doc)
    # Personal records: best (average-pace) time to cover standard distances (run only).
    new_prs = []
    if inp.activity_type == "run" and inp.duration_s > 0 and inp.distance_km > 0:
        prs = dict(user.get("cardio_prs") or {})
        for label, d in (("1K", 1.0), ("5K", 5.0), ("10K", 10.0), ("HALF", 21.0975)):
            if inp.distance_km + 1e-6 >= d:
                est = round(inp.duration_s * (d / inp.distance_km))
                if prs.get(label) is None or est < prs[label]:
                    prs[label] = est
                    new_prs.append({"label": label, "seconds": est})
        if new_prs:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"cardio_prs": prs}})
    xp_gain = int(30 + inp.distance_km * 10)
    await award_xp(user["user_id"], xp_gain)
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    doc.pop("_id", None)
    doc["logged_at"] = doc["logged_at"].isoformat()
    return {"cardio": doc, "user": fresh, "xp_gained": xp_gain, "new_prs": new_prs}


@api_router.get("/cardio/prs")
async def cardio_prs(user=Depends(get_current_user)):
    return {"prs": user.get("cardio_prs") or {}}


@api_router.get("/cardio/history")
async def cardio_history(user=Depends(get_current_user)):
    rows = await db.cardio.find({"user_id": user["user_id"]}, {"_id": 0, "route": 0}).sort("logged_at", -1).limit(50).to_list(50)
    for r in rows:
        if isinstance(r.get("logged_at"), datetime):
            r["logged_at"] = r["logged_at"].isoformat()
    return rows


@api_router.get("/cardio/leaderboard")
async def cardio_leaderboard(board: str = "overall", activity: str = "run", dist: float = 5, user=Depends(get_current_user)):
    q = {"activity_type": activity}
    rows = await db.cardio.find(q, {"_id": 0, "route": 0}).to_list(5000)
    # group by user
    by_user: dict = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r)
    users = {u["user_id"]: u for u in await db.users.find({"is_bot": {"$ne": True}, "is_admin": {"$ne": True}, "leaderboard_hidden": {"$ne": True}}, {"_id": 0, "password_hash": 0}).to_list(2000)}
    entries = []
    for uid, sessions in by_user.items():
        u = users.get(uid)
        if not u:
            continue
        if board == "single":
            metric = max(s["distance_km"] for s in sessions)
            label = "KM (single)"
        elif board == "overall":
            metric = round(sum(s["distance_km"] for s in sessions), 1)
            label = "KM total"
        else:  # speed at distance category
            qualifying = [s for s in sessions if s["distance_km"] >= dist]
            if not qualifying:
                continue
            metric = max(s["avg_speed_kmh"] for s in qualifying)
            label = f"km/h @ {int(dist)}k+"
        entries.append({
            "user_id": uid,
            "display_name": u.get("display_name"),
            "avatar_id": u.get("avatar_id"),
            "rank": rank_from_xp(u.get("xp", 0)),
            "founder_backer": bool(u.get("founder_backer")),
            "loadout": _clean_loadout(u),
            "photo_media_id": u.get("photo_media_id"),
            "use_photo": bool(u.get("use_photo")),
            "metric": round(metric, 2),
            "metric_label": label,
        })
    entries.sort(key=lambda x: x["metric"], reverse=True)
    return entries[:50]


@api_router.post("/sprint/log")
async def log_sprint(inp: SprintLog, user=Depends(get_current_user)):
    sprints = user.get("sprints", {}) or {}
    prev = sprints.get(inp.sprint_type)
    is_best = prev is None or inp.seconds < prev
    if is_best:
        sprints[inp.sprint_type] = round(inp.seconds, 2)
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"sprints": sprints}})
        await award_xp(user["user_id"], 40)
    await db.sprints.insert_one({"user_id": user["user_id"], "sprint_type": inp.sprint_type, "seconds": inp.seconds, "logged_at": datetime.now(timezone.utc)})
    return {"best": sprints.get(inp.sprint_type), "is_best": is_best}


@api_router.get("/sprint/me")
async def my_sprints(user=Depends(get_current_user)):
    return {"sprints": user.get("sprints", {}) or {}}


@api_router.post("/steps/log")
async def log_steps(inp: StepsLog, user=Depends(get_current_user)):
    day = inp.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.steps.update_one(
        {"user_id": user["user_id"], "date": day},
        {"$set": {"steps": inp.steps, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"date": day, "steps": inp.steps}


@api_router.get("/steps/today")
async def steps_today(user=Depends(get_current_user)):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = await db.steps.find_one({"user_id": user["user_id"], "date": day}, {"_id": 0})
    return {"date": day, "steps": (row or {}).get("steps", 0), "goal": 10000}


@api_router.post("/heart-rate/log")
async def log_heart_rate(inp: HeartRateLog, user=Depends(get_current_user)):
    day = inp.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fields = {k: v for k, v in {"current_bpm": inp.current_bpm, "resting_bpm": inp.resting_bpm, "avg_bpm": inp.avg_bpm, "max_bpm": inp.max_bpm}.items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No heart-rate values provided")
    fields["updated_at"] = datetime.now(timezone.utc)
    await db.heart_rate.update_one({"user_id": user["user_id"], "date": day}, {"$set": fields}, upsert=True)
    return {"date": day, "current_bpm": inp.current_bpm, "resting_bpm": inp.resting_bpm, "avg_bpm": inp.avg_bpm, "max_bpm": inp.max_bpm}


@api_router.get("/heart-rate/today")
async def heart_rate_today(user=Depends(get_current_user)):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = await db.heart_rate.find_one({"user_id": user["user_id"], "date": day}, {"_id": 0, "updated_at": 0})
    return row or {"date": day, "current_bpm": None, "resting_bpm": None, "avg_bpm": None, "max_bpm": None}


@api_router.get("/active-count")
async def active_count(user=Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(minutes=30)
    try:
        real = await db.user_sessions.count_documents({"created_at": {"$gte": since}})
    except Exception:
        real = 0
    return {"active": max(10, real)}
