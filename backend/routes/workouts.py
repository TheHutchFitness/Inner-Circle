# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.post("/workouts/log")
async def log_workout(inp: WorkoutLog, user=Depends(get_current_user)):
    workout_id = new_id("wk")
    doc = {
        "workout_id": workout_id,
        "user_id": user["user_id"],
        **inp.dict(),
        "logged_at": datetime.now(timezone.utc),
    }

    # Update PRs from main lifts (accepts library aliases)
    lift_map = {
        "Bench Press": "bench", "Barbell Bench Press": "bench",
        "Back Squat": "squat", "Deadlift": "deadlift",
        "Overhead Press": "ohp",
    }
    prs = user.get("prs", {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0})
    new_badges = set(user.get("badges", []))
    pr_hit = False
    pr_details = []
    for ex in inp.exercises:
        lift_key = lift_map.get(ex.name)
        if not lift_key:
            continue
        top = max((s.weight_lb for s in ex.sets), default=0)
        if top > prs.get(lift_key, 0):
            prev = prs.get(lift_key, 0)
            prs[lift_key] = top
            pr_hit = True
            pr_details.append({"lift": lift_key, "name": ex.name, "weight": top, "previous": prev})
            for m in milestones_for(top):
                new_badges.add(f"{lift_key}_{m}")

    xp_gain = 50 + (10 * len(inp.exercises))
    if pr_hit:
        xp_gain += 100
        new_badges.add("pr_hunter")

    doc["xp_gained"] = xp_gain
    doc["pr_details"] = pr_details
    await db.workouts.insert_one(doc)

    # Tick off the day in the active monthly program
    if inp.source == "monthly" and inp.monthly_day:
        await db.monthly_programs.update_one(
            {"user_id": user["user_id"], "active": True},
            {"$addToSet": {"completed_days": inp.monthly_day}},
        )

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {"prs": prs, "badges": list(new_badges), "last_workout_date": datetime.now(timezone.utc).isoformat()},
            "$inc": {"xp": xp_gain, "workouts_logged": 1},
        },
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["level"] = level_from_xp(fresh["xp"])
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"level": fresh["level"]}})
    fresh["rank"] = rank_from_xp(fresh["xp"])

    # Contribute this workout's XP to any clans/groups the athlete belongs to
    await award_group_xp(user["user_id"], xp_gain)

    # Rank Perk: auto-equip a fresh background the instant the athlete ranks up
    prev_rank = rank_from_xp(user.get("xp", 0))
    ranked_up = fresh["rank"] != prev_rank
    unlocked_background = None
    if ranked_up:
        perk = RANK_PERK_BG.get(fresh["rank"])
        if perk:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"active_background": perk}})
            fresh["active_background"] = perk
            bg_meta = next((b for b in BACKGROUNDS if b["id"] == perk), None)
            unlocked_background = {"id": perk, "name": bg_meta["name"] if bg_meta else perk}

    doc.pop("_id", None)
    doc["logged_at"] = doc["logged_at"].isoformat()
    return {
        "workout": doc, "user": fresh, "xp_gained": xp_gain,
        "pr_hit": pr_hit, "pr_details": pr_details,
        "ranked_up": ranked_up, "prev_rank": prev_rank, "unlocked_background": unlocked_background,
    }


@api_router.get("/workouts/history")
async def workout_history(user=Depends(get_current_user)):
    rows = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).limit(50).to_list(50)
    for r in rows:
        if isinstance(r.get("logged_at"), datetime):
            r["logged_at"] = r["logged_at"].isoformat()
    return rows


@api_router.get("/recap/weekly")
async def weekly_recap(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    rows = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).to_list(500)
    week_workouts = []
    for r in rows:
        ts = r.get("logged_at")
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts)
            except Exception:
                ts = None
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= week_ago:
                week_workouts.append(r)

    xp_week = sum(w.get("xp_gained", 50 + 10 * len(w.get("exercises", []))) for w in week_workouts)
    prs_week = []
    total_volume = 0
    for w in week_workouts:
        prs_week.extend(w.get("pr_details", []))
        for ex in w.get("exercises", []):
            for s in ex.get("sets", []):
                total_volume += s.get("reps", 0) * s.get("weight_lb", 0)

    current_xp = user.get("xp", 0)
    rank_now = rank_from_xp(current_xp)
    rank_start = rank_from_xp(max(0, current_xp - xp_week))
    promoted = rank_now != rank_start

    return {
        "display_name": user.get("display_name"),
        "avatar_id": user.get("avatar_id"),
        "week_start": week_ago.date().isoformat(),
        "week_end": now.date().isoformat(),
        "xp_gained": xp_week,
        "workouts": len(week_workouts),
        "total_volume_lb": int(total_volume),
        "prs": prs_week,
        "pr_count": len(prs_week),
        "rank_now": rank_now,
        "rank_start": rank_start,
        "promoted": promoted,
        "level": level_from_xp(current_xp),
    }


@api_router.get("/workouts/next-suggestion")
async def next_suggestion(user=Depends(get_current_user)):
    rank = rank_from_xp(user["xp"])
    # Pick program appropriate to rank
    idx = RANK_ORDER.index(rank)
    if idx >= 2:
        program = next(p for p in DEFAULT_PROGRAMS if p["program_id"] == "prog_ppl_advanced")
    elif idx == 1:
        program = next(p for p in DEFAULT_PROGRAMS if p["program_id"] == "prog_ppl_intermediate")
    else:
        program = next(p for p in DEFAULT_PROGRAMS if p["program_id"] == "prog_upper_lower")

    seq = [w["key"] for w in program["workouts"]]
    # Find last workout for this program's split to rotate to the next one
    recent = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).limit(5).to_list(5)
    next_key = seq[0]
    for r in recent:
        st = r.get("split_type", "")
        last_key = st.split("_")[-1] if st else None
        if last_key in seq:
            idx = seq.index(last_key)
            next_key = seq[(idx + 1) % len(seq)]
            break
    workout = next(w for w in program["workouts"] if w["key"] == next_key)

    # Adaptive focus: weakest of the big 4 relative to typical ratios
    prs = user.get("prs", {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0})
    targets = {"bench": 1.0, "squat": 1.3, "deadlift": 1.5, "ohp": 0.6}  # relative to bench baseline
    base = max(prs.get("bench", 0), 1)
    ratios = {k: (prs.get(k, 0) / base) / targets[k] if targets[k] else 1 for k in targets}
    weakest = min(ratios, key=ratios.get)
    focus_names = {"bench": "Bench Press", "squat": "Back Squat", "deadlift": "Deadlift", "ohp": "Overhead Press"}
    focus = focus_names[weakest]

    return {
        "program_id": program["program_id"],
        "program_name": program["name"],
        "split": program["split"],
        "workout": workout,
        "focus_lift": focus,
        "focus_note": f"Your {focus} is lagging behind your other lifts — attack it with intent today.",
        "based_on": rank,
    }


@api_router.get("/progress/chart")
async def progress_chart(user=Depends(get_current_user)):
    rows = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", 1).to_list(500)
    series = {"bench": [], "squat": [], "deadlift": [], "ohp": []}
    lift_map = {"Bench Press": "bench", "Back Squat": "squat", "Deadlift": "deadlift", "Overhead Press": "ohp"}
    for r in rows:
        ts = r.get("logged_at")
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        for ex in r.get("exercises", []):
            k = lift_map.get(ex.get("name"))
            if k:
                top = max((s.get("weight_lb", 0) for s in ex.get("sets", [])), default=0)
                if top > 0:
                    series[k].append({"date": ts, "weight": top})
    return series
