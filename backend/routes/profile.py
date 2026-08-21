# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403
from datetime import timedelta

from auth_throttle import consume_bucket


# ---------- Profile ----------
@api_router.get("/profile/me")
async def profile_me(user=Depends(get_current_user)):
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    user["is_creator"] = bool(user.get("social_tiktok") or user.get("social_instagram") or user.get("social_youtube"))
    # Founders carry a permanent "founder" badge (granted once, idempotent).
    if user.get("is_founder") and "founder" not in (user.get("badges") or []):
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"badges": "founder"}})
        user.setdefault("badges", []).append("founder")
    # Coaching is only requestable if the member's chosen gym is a coaching-enabled gym.
    gym = (user.get("inperson_gym") or "").strip()
    user["coaching_available"] = False
    if gym:
        cg = await db.gyms.find_one({"name_lower": gym.lower(), "coaching_enabled": True}, {"_id": 1})
        user["coaching_available"] = bool(cg)
    return user


@api_router.get("/profile/attributes")
async def profile_attributes(user=Depends(get_current_user)):
    return await _compute_attributes(user)


class BaselineInput(BaseModel):
    bench: float = 0
    squat: float = 0
    deadlift: float = 0
    ohp: float = 0
    t_5k: float = 0    # seconds
    t_10k: float = 0   # seconds
    t_100m: float = 0  # seconds
    skip: bool = False


@api_router.post("/onboarding/baseline")
async def onboarding_baseline(inp: BaselineInput, user=Depends(get_current_user)):
    """One-time signup capture of starting lifts + run times so every member
    begins with different base STR/PWR/SPD/END stats. Skippable. Logging real
    baseline lifts (not skip) grants a one-time XP + 'calibrated' badge bonus."""
    uid = user["user_id"]
    already = bool(user.get("baseline_set"))
    if inp.skip:
        await db.users.update_one({"user_id": uid}, {"$set": {"baseline_set": True}})
        return {"ok": True, "skipped": True, "reward_xp": 0}

    prs = {
        "bench": max(0, int(inp.bench or 0)),
        "squat": max(0, int(inp.squat or 0)),
        "deadlift": max(0, int(inp.deadlift or 0)),
        "ohp": max(0, int(inp.ohp or 0)),
    }
    # A blank/0 field keeps the existing PR (so a retest never zeroes a lift you skip).
    old_prs = user.get("prs", {}) or {}
    for k in prs:
        if prs[k] <= 0:
            prs[k] = int(old_prs.get(k, 0) or 0)
    badges = set(user.get("badges", []) or [])
    for lk, w in prs.items():
        for m in milestones_for(w):
            badges.add(f"{lk}_{m}")
    provided = any(v > 0 for v in [inp.bench or 0, inp.squat or 0, inp.deadlift or 0, inp.ohp or 0, inp.t_5k or 0, inp.t_10k or 0, inp.t_100m or 0])
    logged_anything = provided
    # One-time calibration bonus for logging real baseline stats.
    reward_xp = BASELINE_REWARD_XP if (logged_anything and not already) else 0
    if reward_xp:
        badges.add("calibrated")
    setdoc = {"prs": prs, "baseline_set": True, "badges": list(badges)}

    sprints = dict(user.get("sprints", {}) or {})
    if inp.t_100m and inp.t_100m > 0:
        sprints["100m"] = round(float(inp.t_100m), 2)
        setdoc["sprints"] = sprints
    await db.users.update_one({"user_id": uid}, {"$set": setdoc})
    if reward_xp:
        await award_xp(uid, reward_xp)

    # Seed cardio bests (feed the ENDURANCE attribute) for 5k / 10k.
    await db.cardio.delete_many({"user_id": uid, "baseline": True})
    for km, secs in [(5.0, inp.t_5k), (10.0, inp.t_10k)]:
        if secs and secs > 0:
            await db.cardio.insert_one({
                "cardio_id": new_id("cardio"), "user_id": uid, "activity_type": "run",
                "distance_km": km, "duration_s": int(secs), "elevation_gain_m": 0,
                "temperature_c": None,
                "avg_pace_min_km": round((secs / 60) / km, 2) if km else 0,
                "avg_speed_kmh": round(km / (secs / 3600), 2) if secs else 0,
                "route": [], "logged_at": datetime.now(timezone.utc), "baseline": True,
            })
    # Recap: where this member's starting Big-4 total ranks vs the pack + trend vs last test.
    recap = None
    if logged_anything:
        my_total = sum(prs.values())
        totals = []
        async for u in db.users.find({"is_admin": {"$ne": True}}, {"_id": 0, "prs": 1}):
            p = u.get("prs", {}) or {}
            totals.append(sum(v for v in p.values() if isinstance(v, (int, float))))
        n = len(totals) or 1
        below = sum(1 for t in totals if t <= my_total)
        percentile = round(below / n * 100)
        position = sum(1 for t in totals if t > my_total) + 1
        old_pct = user.get("baseline_percentile")
        old_big4 = user.get("baseline_big4")
        if old_pct is not None:
            trend = {"first": False, "percentile_delta": percentile - int(old_pct),
                     "big4_delta": my_total - int(old_big4 or 0)}
        else:
            trend = {"first": True}
        recap = {"percentile": percentile, "position": position, "total_members": n,
                 "big4": my_total, "trend": trend}
        await db.users.update_one(
            {"user_id": uid},
            {
                "$set": {"baseline_percentile": percentile, "baseline_big4": my_total},
                "$push": {"percentile_history": {
                    "$each": [{"p": percentile, "big4": my_total,
                               "at": datetime.now(timezone.utc).isoformat()}],
                    "$slice": -12,
                }},
            },
        )
    return {"ok": True, "reward_xp": reward_xp, "recap": recap}


async def _compute_gym_rank(target: dict) -> dict:
    """Rank a member (by Big-4 total) among the athletes at their own gym."""
    gym = (target.get("inperson_gym", "") or "").strip()
    if not gym:
        return {"gym": "", "rank": 0, "members": 0, "big4": 0, "gym_logo": None, "gym_verified": False}
    gl = gym.lower()
    rows = await db.users.find(
        {"is_admin": {"$ne": True}}, {"_id": 0, "prs": 1, "inperson_gym": 1, "user_id": 1}
    ).to_list(3000)
    members = [m for m in rows if ((m.get("inperson_gym", "") or "").strip().lower() == gl)]

    def tot(m):
        return sum((m.get("prs", {}) or {}).values())

    members.sort(key=tot, reverse=True)
    rank = next((i + 1 for i, m in enumerate(members) if m["user_id"] == target["user_id"]), 0)
    meta = await gym_meta(gym)
    return {"gym": gym, "rank": rank, "members": len(members), "big4": tot(target),
            "gym_logo": meta["logo_media_id"], "gym_verified": meta["verified"]}


@api_router.get("/profile/gym-rank")
async def gym_rank(user=Depends(get_current_user)):
    """The caller's rank (by Big-4 total) among athletes at their own gym."""
    return await _compute_gym_rank(user)


@api_router.get("/profile/gym-digest")
async def gym_digest(user=Depends(get_current_user)):
    """Weekly note on how the member's gym rank moved since last week.
    Rolls a per-ISO-week snapshot forward and reports the delta once per new week."""
    cur = await _compute_gym_rank(user)
    if not cur["gym"] or cur["rank"] == 0:
        return {**cur, "delta": None, "week": None}
    now = datetime.now(timezone.utc)
    cur_week = f"{now.isocalendar().year}-W{now.isocalendar().week:02d}"
    snap = user.get("gym_rank_snap") or {}
    delta = None
    if snap.get("week") and snap["week"] != cur_week and snap.get("rank"):
        delta = int(snap["rank"]) - int(cur["rank"])  # +ve = moved up
    if snap.get("week") != cur_week:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"gym_rank_snap": {"week": cur_week, "rank": cur["rank"]}}},
        )
        if delta is not None:
            try:
                arrow = "climbed" if delta > 0 else ("dropped" if delta < 0 else "held")
                msg = (f"You {arrow} {abs(delta)} spot{'s' if abs(delta) != 1 else ''} at {cur['gym']} — now #{cur['rank']}."
                       if delta != 0 else f"You held #{cur['rank']} at {cur['gym']} this week.")
                await send_push([user["user_id"]], {"title": "Your weekly gym rank", "message": msg, "action_url": "/(tabs)/leaderboard"},
                                idempotency_key=f"gymdigest:{user['user_id']}:{cur_week}")
            except Exception:
                pass
    return {**cur, "delta": delta, "week": cur_week}


@api_router.get("/digest/weekly")
async def weekly_digest(user=Depends(get_current_user)):
    """A short weekly recap: XP/rank moves, races won/lost, strength trend + shields.
    Rolls a per-ISO-week XP snapshot forward so xp_gained reflects gains this week."""
    uid = user["user_id"]
    now = datetime.now(timezone.utc)
    week = f"{now.isocalendar().year}-W{now.isocalendar().week:02d}"
    since = now - timedelta(days=7)
    xp_now = int(user.get("xp", 0))
    level = level_from_xp(xp_now)
    rank = rank_from_xp(xp_now)

    snap = user.get("weekly_snap") or {}
    xp_gained = None
    level_up = 0
    if snap.get("week") and snap["week"] != week:
        xp_gained = xp_now - int(snap.get("xp", 0))
        level_up = level - int(snap.get("level", level))
    is_new_week = bool(snap.get("week")) and snap.get("week") != week
    if snap.get("week") != week:
        await db.users.update_one(
            {"user_id": uid},
            {"$set": {"weekly_snap": {"week": week, "xp": xp_now, "level": level}}},
        )

    workouts = await db.workouts.count_documents({"user_id": uid, "logged_at": {"$gte": since}})
    cardio_km = 0.0
    async for c in db.cardio.find({"user_id": uid, "logged_at": {"$gte": since}}, {"_id": 0, "distance_km": 1}):
        cardio_km += float(c.get("distance_km", 0) or 0)

    won = await db.rival_challenges.count_documents(
        {"status": "complete", "winner_id": uid, "completed_at": {"$gte": since}})
    total_done = await db.rival_challenges.count_documents(
        {"status": "complete", "completed_at": {"$gte": since},
         "$or": [{"from_user_id": uid}, {"to_user_id": uid}]})
    lost = max(0, total_done - won)

    hist = user.get("percentile_history") or []
    trend = {"percentile_delta": int(hist[-1]["p"]) - int(hist[-2]["p"])} if len(hist) >= 2 else None
    shield_count = int(user.get("shield_count", 0) or 0)

    return {
        "week": week, "is_new_week": is_new_week,
        "level": level, "rank": rank, "xp": xp_now,
        "xp_gained": xp_gained, "level_up": level_up,
        "workouts": workouts, "cardio_km": round(cardio_km, 1),
        "races": {"won": won, "lost": lost},
        "trend": trend,
        "shield_tier": shield_tier_for(shield_count), "shield_count": shield_count,
    }



@api_router.get("/profile/prs")
async def profile_prs(user_id: Optional[str] = None, user=Depends(get_current_user)):
    """Current lift bests + a recent PR feed (from logged workouts). Own by default."""
    uid = user_id or user["user_id"]
    udoc = await db.users.find_one({"user_id": uid}, {"_id": 0, "prs": 1}) if user_id else user
    prs = (udoc or {}).get("prs", {}) or {}
    bests = {k: int(prs.get(k, 0) or 0) for k in ("squat", "bench", "deadlift", "ohp")}
    bests["total"] = sum(bests.values())
    # Recent PR events from workout logs (each pr_details entry is one new PR)
    rows = await db.workouts.find(
        {"user_id": uid, "pr_details": {"$exists": True, "$ne": []}}, {"_id": 0, "pr_details": 1, "logged_at": 1}
    ).sort("logged_at", -1).limit(20).to_list(20)
    recent = []
    for r in rows:
        when = r.get("logged_at")
        when = when.isoformat() if hasattr(when, "isoformat") else when
        for d in (r.get("pr_details") or []):
            recent.append({
                "lift": d.get("lift"), "name": d.get("name"),
                "weight": int(d.get("weight", 0) or 0), "previous": int(d.get("previous", 0) or 0),
                "date": when,
            })
    return {"bests": bests, "recent": recent[:12]}


@api_router.patch("/profile/update")
async def update_profile(inp: ProfileUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in inp.dict().items() if v is not None}
    if "gym" in update:
        update["inperson_gym"] = (update.pop("gym") or "").strip()[:60]
        await ensure_gym(update["inperson_gym"])
    if "social_tiktok" in update:
        update["social_tiktok"] = social_handle(update["social_tiktok"])
    if "social_instagram" in update:
        update["social_instagram"] = social_handle(update["social_instagram"])
    if "social_youtube" in update:
        update["social_youtube"] = social_handle(update["social_youtube"])
    # Lite/Full app mode — picking a mode marks the first-login choice as made.
    if "lite_mode" in update:
        update["mode_selected"] = True
    # In-Person coaching request — must have a gym selected first.
    want_request = update.pop("inperson_request", None)
    if want_request is not None:
        if want_request:
            gym_now = update.get("inperson_gym") or user.get("inperson_gym")
            if not (gym_now and str(gym_now).strip()):
                raise HTTPException(status_code=400, detail="Select your gym before requesting in-person coaching")
            update["inperson_request"] = True
        else:
            update["inperson_request"] = False
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


@api_router.post("/profile/skool-verify")
async def skool_verify(inp: SkoolVerifyIn, user=Depends(get_current_user)):
    # Throttle guessing: the shared code is short, so cap attempts per member.
    await consume_bucket(kind="skool_verify", raw_key=user["user_id"], limit=10, window=timedelta(hours=1))
    if inp.code.strip().upper() != SKOOL_CODE.upper():
        raise HTTPException(status_code=400, detail="Invalid Skool verification code")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"skool_verified": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


@api_router.post("/profile/full-name")
async def set_full_name(inp: dict = Body(...), user=Depends(get_current_user)):
    """Legacy members backfill their full legal name (prompted on login)."""
    name = (inp.get("full_name") or "").strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Please enter your full legal name")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"full_name": name[:80]}})
    return {"ok": True, "full_name": name[:80]}



@api_router.post("/profile/set-background")
async def set_background(inp: BackgroundSet, user=Depends(get_current_user)):
    bg = next((b for b in BACKGROUNDS if b["id"] == inp.background_id), None)
    if not bg:
        raise HTTPException(status_code=400, detail="Unknown background")
    rank = rank_from_xp(user.get("xp", 0))
    rank_order = RANK_ORDER
    earned_perks = {RANK_PERK_BG[r] for r in rank_order[: rank_order.index(rank) + 1] if r in RANK_PERK_BG}
    if user.get("level", 1) < bg["level"] and bg["id"] not in earned_perks:
        raise HTTPException(status_code=403, detail=f"Unlocks at level {bg['level']}")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"active_background": inp.background_id}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


@api_router.get("/gyms")
async def list_gyms():
    """Curated gym directory for the signup/profile dropdown. Public (no auth)."""
    rows = await db.gyms.find({}, {"_id": 0, "name": 1, "verified": 1, "logo_media_id": 1, "coaching_enabled": 1}).sort("name", 1).to_list(1000)
    if not rows:
        await list_gym_names()  # backfill
        rows = await db.gyms.find({}, {"_id": 0, "name": 1, "verified": 1, "logo_media_id": 1, "coaching_enabled": 1}).sort("name", 1).to_list(1000)
    # The private "test" gym is not shown in the public directory.
    rows = [r for r in rows if (r.get("name", "").strip().lower() != "test")]
    return {
        "gyms": [r["name"] for r in rows],
        "directory": [{"name": r["name"], "verified": bool(r.get("verified")), "logo_media_id": r.get("logo_media_id")} for r in rows],
    }


GOOGLE_PLACES_API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()


@api_router.get("/gyms/nearby")
async def gyms_nearby(lat: float, lng: float, radius: int = 5000, user=Depends(get_current_user)):
    """Real-world gyms near a coordinate, via Google Places API (New). Auth required
    so the paid Places quota can't be drained by anonymous callers."""
    if not GOOGLE_PLACES_API_KEY:
        return {"gyms": [], "error": "places_unconfigured"}
    radius = max(200, min(int(radius or 5000), 50000))
    # Serve repeated/nearby lookups from a short-lived cache (rounded ~110m grid)
    # to keep billable Places calls down.
    cache_key = f"{round(lat, 3)}:{round(lng, 3)}:{radius}"
    cached = await db.gym_places_cache.find_one({"_id": cache_key}, {"_id": 0, "gyms": 1})
    if cached:
        return {"gyms": cached.get("gyms", []), "cached": True}
    # Per-user quota so a single account can't loop and drain Google billing.
    await consume_bucket(kind="gyms_nearby", raw_key=user["user_id"], limit=40, window=timedelta(hours=1))
    body = {
        "includedTypes": ["gym"],
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius}
        },
        "rankPreference": "DISTANCE",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating",
    }
    try:
        async with httpx.AsyncClient(timeout=8) as hc:
            r = await hc.post("https://places.googleapis.com/v1/places:searchNearby", json=body, headers=headers)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Gym search unavailable — try again")
    if r.status_code != 200:
        logger.error(f"Places nearby failed: {r.status_code} {r.text[:200]}")
        return {"gyms": [], "error": "places_error"}
    out = []
    for p in (r.json().get("places") or []):
        loc = p.get("location") or {}
        if "latitude" not in loc or "longitude" not in loc or not p.get("id"):
            continue
        out.append({
            "place_id": p["id"],
            "name": (p.get("displayName") or {}).get("text", "Gym"),
            "address": p.get("formattedAddress", ""),
            "lat": loc["latitude"],
            "lng": loc["longitude"],
            "rating": p.get("rating"),
            "source": "google",
        })
    try:
        await db.gym_places_cache.update_one(
            {"_id": cache_key},
            {"$set": {"gyms": out, "expires_at": datetime.now(timezone.utc) + timedelta(hours=6)}},
            upsert=True,
        )
    except Exception:
        pass
    return {"gyms": out}


@api_router.get("/gyms/map")
async def gyms_map():
    """Public: every gym that has a map location set, for the Gyms Map screen."""
    rows = await db.gyms.find(
        {"lat": {"$ne": None}, "lng": {"$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "verified": 1, "logo_media_id": 1, "lat": 1, "lng": 1, "address": 1},
    ).sort("name", 1).to_list(1000)
    out = []
    for r in rows:
        if (r.get("name", "").strip().lower() == "test"):
            continue
        if r.get("lat") is None or r.get("lng") is None:
            continue
        members = await db.users.count_documents(
            {"inperson_gym": {"$regex": f"^{re.escape(r['name'])}$", "$options": "i"}})
        out.append({
            "id": r.get("id"), "name": r["name"], "verified": bool(r.get("verified")),
            "logo_media_id": r.get("logo_media_id"),
            "lat": r["lat"], "lng": r["lng"], "address": r.get("address", ""),
            "members": members,
        })
    return {"gyms": out}


CHECKIN_XP = 150            # base XP for checking in at a gym you're physically at
CHECKIN_RADIUS_KM = 0.5     # must be within 500 m of the gym's pin
STREAK_STEP_XP = 25         # bonus XP per consecutive day, capped
STREAK_CAP_DAYS = 7         # streak bonus stops growing after 7 days


def _haversine_km(lat1, lng1, lat2, lng2):
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@api_router.get("/gyms/checkins")
async def gym_checkins_status(user=Depends(get_current_user)):
    """The caller's gym check-in status: today's gyms, lifetime total, and current streak."""
    uid = user["user_id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    todays = await db.gym_checkins.find({"user_id": uid, "day": today}, {"_id": 0, "gym_id": 1}).to_list(50)
    total = await db.gym_checkins.count_documents({"user_id": uid})
    # A streak only counts if it's current (checked in today or yesterday).
    yday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    streak = int(user.get("checkin_streak", 0) or 0) if user.get("checkin_last_day") in (today, yday) else 0
    return {"today_gym_ids": [t["gym_id"] for t in todays], "total": total,
            "streak": streak, "best_streak": int(user.get("checkin_best_streak", 0) or 0)}


@api_router.post("/gyms/check-in")
async def gym_check_in(payload: dict = Body(default={}), user=Depends(get_current_user)):
    """Check in at a gym you're physically at (within 500 m of its map pin) to earn XP.
    Once per gym per day. First check-in of each day extends a consecutive-day streak."""
    uid = user["user_id"]
    gym_id = str((payload or {}).get("gym_id", "") or "").strip()
    gym_name = str((payload or {}).get("gym") or (payload or {}).get("gym_name") or "").strip()
    lat = (payload or {}).get("lat")
    lng = (payload or {}).get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Your location is required to check in")
    # Resolve the gym (by id, else by name) — it must exist and have a map pin.
    g = None
    if gym_id and not gym_id.startswith("name:"):
        g = await db.gyms.find_one({"id": gym_id})
    if not g and gym_name:
        g = await db.gyms.find_one({"name_lower": gym_name.lower()})
    if not g:
        raise HTTPException(status_code=404, detail="Gym not found")
    if g.get("lat") is None or g.get("lng") is None:
        raise HTTPException(status_code=400, detail="This gym has no map location yet — ask an admin to pin it")
    dist = _haversine_km(float(lat), float(lng), float(g["lat"]), float(g["lng"]))
    if dist > CHECKIN_RADIUS_KM:
        away = f"{int(dist * 1000)} m" if dist < 1 else f"{dist:.1f} km"
        raise HTTPException(status_code=400, detail=f"You're {away} from {g['name']} — get within 500 m to check in")
    key = g["id"]
    name = g["name"]
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    yday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    if await db.gym_checkins.find_one({"user_id": uid, "gym_id": key, "day": today}):
        total = await db.gym_checkins.count_documents({"user_id": uid})
        return {"ok": True, "already": True, "xp_awarded": 0, "total": total, "gym": name,
                "streak": int(user.get("checkin_streak", 0) or 0)}
    await db.gym_checkins.insert_one({
        "user_id": uid, "gym_id": key, "gym_name": name, "day": today,
        "at": now, "lat": float(lat), "lng": float(lng),
    })
    # Streak: only the first check-in of a NEW day extends it (and earns the bonus).
    last_day = user.get("checkin_last_day")
    is_new_day = last_day != today
    streak_bonus = 0
    if is_new_day:
        prev = int(user.get("checkin_streak", 0) or 0)
        streak = prev + 1 if last_day == yday else 1
        best = max(int(user.get("checkin_best_streak", 0) or 0), streak)
        await db.users.update_one({"user_id": uid}, {"$set": {"checkin_streak": streak, "checkin_last_day": today, "checkin_best_streak": best}})
        streak_bonus = min(streak, STREAK_CAP_DAYS) * STREAK_STEP_XP
    else:
        streak = int(user.get("checkin_streak", 0) or 0)
    xp = CHECKIN_XP + streak_bonus
    await award_xp(uid, xp)
    await award_group_xp(uid, CHECKIN_XP)
    total = await db.gym_checkins.count_documents({"user_id": uid})
    return {"ok": True, "xp_awarded": xp, "base_xp": CHECKIN_XP, "streak_bonus": streak_bonus,
            "streak": streak, "total": total, "gym": name}


@api_router.get("/gyms/leaderboard")
async def gyms_leaderboard():
    """Public: gyms ranked by total member check-ins logged this calendar month."""
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    pipeline = [
        {"$match": {"day": {"$regex": f"^{month}"}}},
        {"$group": {"_id": "$gym_id", "checkins": {"$sum": 1}, "members": {"$addToSet": "$user_id"}, "name": {"$last": "$gym_name"}}},
        {"$sort": {"checkins": -1}},
        {"$limit": 100},
    ]
    rows = await db.gym_checkins.aggregate(pipeline).to_list(100)
    out = []
    for r in rows:
        name = (r.get("name") or "").strip()
        if name.lower() == "test":
            continue
        g = await db.gyms.find_one({"id": r["_id"]}, {"_id": 0, "verified": 1, "logo_media_id": 1, "name": 1})
        out.append({
            "gym_id": r["_id"], "name": (g or {}).get("name", name) or name,
            "checkins": r["checkins"], "members": len(r.get("members", [])),
            "verified": bool((g or {}).get("verified")), "logo_media_id": (g or {}).get("logo_media_id"),
        })
    return {"month": month, "gyms": out}




@api_router.get("/profile/frames")
async def profile_frames(user=Depends(get_current_user)):
    return {"unlocked": unlocked_frames_for(user), "active": user.get("active_frame")}


@api_router.post("/profile/set-frame")
async def set_frame(payload: dict, user=Depends(get_current_user)):
    frame = payload.get("frame", "")
    if frame not in unlocked_frames_for(user):
        raise HTTPException(status_code=403, detail="Frame not unlocked")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"active_frame": frame}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


@api_router.post("/profile/loadout")
async def set_loadout(inp: LoadoutIn, user=Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    updates = {}
    lo = _clean_loadout(fresh)
    for slot in ("emblem", "aura", "title"):
        val = getattr(inp, slot)
        if val is None:
            continue
        entry = _COSMETIC_BY_ID.get(val)
        if not entry or entry[0] != slot:
            raise HTTPException(status_code=400, detail="Invalid item for slot")
        if not _cosmetic_owned(fresh, entry[1]):
            raise HTTPException(status_code=403, detail="Item not unlocked")
        lo[slot] = val
    updates["loadout"] = lo
    if inp.use_photo is not None:
        if inp.use_photo and not fresh.get("photo_media_id"):
            raise HTTPException(status_code=400, detail="Upload a photo first")
        updates["use_photo"] = bool(inp.use_photo)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    result = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    result["rank"] = rank_from_xp(result["xp"])
    return result


@api_router.post("/profile/photo")
async def upload_photo(file: UploadFile = File(...), user=Depends(get_current_user)):
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Use a JPG, PNG or WEBP image")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 12MB)")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[ct]
    path = f"{STORAGE_APP_NAME}/pfp/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("pfp")
    await db.chat_media.insert_one({
        "media_id": media_id, "user_id": user["user_id"], "storage_path": path,
        "content_type": ct, "media_type": "image", "size": len(data),
        "original_name": file.filename, "created_at": datetime.now(timezone.utc),
    })
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"photo_media_id": media_id, "use_photo": True}})
    result = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    result["rank"] = rank_from_xp(result["xp"])
    return result


@api_router.get("/users/{user_id}/public")
async def public_user(user_id: str, user=Depends(get_current_user)):
    u = await db.users.find_one(
        {"user_id": user_id}, {"_id": 0, "password_hash": 0, "email": 0, "phone": 0}
    )
    if not u:
        raise HTTPException(status_code=404, detail="Member not found")
    prs = u.get("prs", {}) or {}
    fs = await founder_status(u)
    tt = u.get("social_tiktok", "") or ""
    ig = u.get("social_instagram", "") or ""
    yt = u.get("social_youtube", "") or ""
    gr = await _compute_gym_rank(u)
    return {
        "user_id": u["user_id"],
        "display_name": u.get("display_name", "Athlete"),
        "full_name": u.get("full_name", "") or "",
        "avatar_id": u.get("avatar_id", "avatar_white"),
        "sex": u.get("sex", "male"),
        "rank": rank_from_xp(u.get("xp", 0)),
        "level": level_from_xp(u.get("xp", 0)),
        "xp": u.get("xp", 0),
        "founder_backer": bool(u.get("founder_backer")),
        "skool_verified": bool(u.get("skool_verified")),
        "is_founder": fs["is_founder"],
        "founder_number": fs["founder_number"],
        "prs": prs,
        "total_lift": sum(prs.values()),
        "gym": gr["gym"],
        "gym_rank": gr["rank"],
        "gym_members": gr["members"],
        "workouts_logged": u.get("workouts_logged", 0),
        "badges_count": len(u.get("badges", []) or []),
        "loadout": _clean_loadout(u),
        "photo_media_id": u.get("photo_media_id"),
        "use_photo": bool(u.get("use_photo")),
        "active_frame": u.get("active_frame"),
        "social_tiktok": tt,
        "social_instagram": ig,
        "social_youtube": yt,
        "is_creator": bool(tt or ig or yt),
        "equipped_pet": u.get("equipped_pet"),
        "equipped_skin": u.get("equipped_skin"),
        "equipped_weapon": u.get("equipped_weapon"),
        "equipped_hair": u.get("equipped_hair"),
        "equipped_beard": u.get("equipped_beard"),
        "season_champ_titles": await season_titles_for(u["user_id"]),
    }
