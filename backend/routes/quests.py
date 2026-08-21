# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/quests/personal")
async def personal_quests(user=Depends(get_current_user)):
    rows = await db.personal_quests.find(
        {"user_id": user["user_id"], "status": {"$in": ["active", "completed"]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("completed_at"), datetime):
            r["completed_at"] = r["completed_at"].isoformat()
    return {"needs_setup": not user.get("goals_set"), "goals": user.get("goals", ""), "quests": rows}


@api_router.post("/quests/goals")
async def set_goals(inp: GoalsIn, user=Depends(get_current_user)):
    goals = inp.goals.strip()
    if len(goals) < 3:
        raise HTTPException(status_code=400, detail="Tell Coach what you're chasing first")

    quests = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        import json as _json
        system_msg = (
            "You are Coach Hutch, an elite strength coach in a hardcore powerlifting app. "
            "The athlete tells you their real-life goals. Curate 4-6 concrete, REAL-LIFE quests they can complete "
            "outside the app — e.g. 'Lose 5 lb', 'Sign up for a powerlifting meet', 'Hit 10k steps daily for a week', "
            "'Add 25 lb to your deadlift'. Each quest must be specific, measurable and tied to their stated goals. "
            "Return ONLY a JSON array, no markdown fences, of objects with keys: "
            "title (short, punchy), description (1-2 sentences, direct coach tone), "
            "xp (integer 100-500, harder = more), timeframe (e.g. 'This week', 'This month', '90 days')."
        )
        athlete_ctx = (
            f"Athlete stats: rank {rank_from_xp(user.get('xp', 0))}, bodyweight {user.get('bodyweight_lb', 180)} lb, "
            f"age {user.get('age', 25)}, sex {user.get('sex', 'male')}, PRs {user.get('prs', {})}. "
            f"Goals: {goals}"
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"goals_{user['user_id']}_{uuid.uuid4().hex[:6]}",
            system_message=system_msg,
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=athlete_ctx))
        raw = str(resp).strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(json)?\s*|\s*```$", "", raw, flags=re.S)
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1:
            parsed = _json.loads(raw[start:end + 1])
            quests = [
                {"title": str(q.get("title", "Quest"))[:80],
                 "description": str(q.get("description", ""))[:300],
                 "xp": max(50, min(500, int(q.get("xp", 150)))),
                 "timeframe": str(q.get("timeframe", "This month"))[:40]}
                for q in parsed if isinstance(q, dict)
            ][:6] or None
    except Exception as e:
        logger.warning(f"AI goal quest generation failed, using fallback: {e}")

    if not quests:
        quests = _fallback_personal_quests(goals)

    # Archive previous active personal quests, insert the new batch
    await db.personal_quests.update_many(
        {"user_id": user["user_id"], "status": "active"}, {"$set": {"status": "archived"}}
    )
    now = datetime.now(timezone.utc)
    docs = [{
        "quest_id": new_id("pq"),
        "user_id": user["user_id"],
        "status": "active",
        "created_at": now,
        **q,
    } for q in quests]
    if docs:
        await db.personal_quests.insert_many(docs)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"goals_set": True, "goals": goals}})
    for d in docs:
        d.pop("_id", None)
        d["created_at"] = d["created_at"].isoformat()
    return {"goals": goals, "quests": docs}


@api_router.post("/quests/personal/complete")
async def complete_personal_quest(inp: PersonalCompleteIn, user=Depends(get_current_user)):
    q = await db.personal_quests.find_one(
        {"quest_id": inp.quest_id, "user_id": user["user_id"], "status": "active"}, {"_id": 0}
    )
    if not q:
        raise HTTPException(status_code=404, detail="Quest not found or already completed")
    await db.personal_quests.update_one(
        {"quest_id": inp.quest_id}, {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc)}}
    )
    await award_xp(user["user_id"], q["xp"])
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return {"xp_gained": q["xp"], "quest_id": inp.quest_id, "user": fresh}


@api_router.get("/quests")
async def get_quests(scope: str = "daily", user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    if scope == "all":
        data = {}
        for sc in ("daily", "weekly", "monthly", "boss"):
            data[sc] = await _build_quests(user, sc, now)
        return data
    if scope not in QUEST_TEMPLATES:
        raise HTTPException(status_code=400, detail="Invalid scope")
    return {scope: await _build_quests(user, scope, now)}


def _atrophy(user: dict) -> dict:
    """The Atrophy — an existential decay that grows the longer a member goes without training.
    Level 0 (dormant) -> 4 (critical), based on days since the last workout / check-in."""
    now = datetime.now(timezone.utc)
    times = []
    def _add(v):
        if not v:
            return
        try:
            dt = datetime.fromisoformat(v) if isinstance(v, str) else v
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            times.append(dt)
        except Exception:
            pass
    _add(user.get("last_workout_date"))
    cld = user.get("checkin_last_day")
    if cld:
        try:
            times.append(datetime.strptime(cld, "%Y-%m-%d").replace(tzinfo=timezone.utc))
        except Exception:
            pass
    # Floor at account creation so brand-new members don't start maxed out.
    _add(user.get("created_at"))
    last = max(times) if times else now
    days = max(0, (now - last).days)
    if days <= 1:
        level, note = 0, "The Circle is recording you. Keep training."
    elif days <= 3:
        level, note = 1, "Regression stirs — a couple days unrecorded."
    elif days <= 6:
        level, note = 2, "Your edge is fading. Train to be re-recorded."
    elif days <= 13:
        level, note = 3, "Sliding toward Zero — a week without training."
    else:
        level, note = 4, "The Circle is un-writing you. Break free — train today."
    return {"days_idle": days, "level": level, "note": note}


@api_router.get("/journey")
async def journey(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    attrs = await _compute_attributes(user)
    nodes = []
    for sc in ("daily", "weekly", "monthly", "boss"):
        for q in await _build_quests(user, sc, now):
            nodes.append({
                "id": q["id"], "scope": sc, "title": q["title"],
                "complete": q["complete"], "claimed": q["claimed"],
                "reward_xp": q["reward_xp"], "reward_label": q["reward_label"],
                "objectives": q.get("objectives", []),
                "flavor": q.get("flavor", ""),
                "global_percent": q.get("global_percent", 0),
                "boss": sc == "boss",
            })
    # Admin-authored custom quests targeted at everyone or this specific user
    cqs = await db.custom_quests.find({"$or": [{"target": "all"}, {"target": user["user_id"]}]}).sort("created_at", -1).to_list(50)
    for cq in cqs:
        st = await db.custom_quest_state.find_one({"custom_id": cq["id"], "user_id": user["user_id"]}) or {}
        complete = bool(st.get("complete"))
        nodes.append({
            "id": f"custom:{cq['id']}", "scope": "custom", "title": cq["title"],
            "complete": complete, "claimed": bool(st.get("claimed")),
            "reward_xp": cq.get("reward_xp", 0), "reward_label": f"{cq.get('reward_xp', 0)} XP",
            "objectives": [{"label": cq.get("objective_label", "Complete the quest"), "current": 1 if complete else 0, "target": 1}],
            "flavor": cq.get("flavor", ""), "global_percent": 0, "boss": False, "custom": True,
        })
    all_users = await db.users.find(
        {}, {"_id": 0, "user_id": 1, "display_name": 1, "xp": 1, "enhanced": 1, "founder_backer": 1, "sex": 1}
    ).sort("xp", -1).to_list(3000)
    idx = next((i for i, u in enumerate(all_users) if u["user_id"] == user["user_id"]), 0)
    total = len(all_users)
    lo = max(0, idx - 5)
    hi = min(total, idx + 6)
    my_xp = user.get("xp", 0) or 0
    neighbors = []
    for i in range(lo, hi):
        u = all_users[i]
        uxp = u.get("xp", 0) or 0
        neighbors.append({
            "user_id": u["user_id"],
            "name": u.get("display_name") or "Athlete",
            "xp": uxp,
            "level": level_from_xp(uxp),
            "rank_position": i + 1,
            "is_me": u["user_id"] == user["user_id"],
            "ahead": uxp > my_xp,
            "enhanced": bool(u.get("enhanced")),
            "founder": bool(u.get("founder_backer")),
            "sex": u.get("sex", "male"),
        })
    inc = await db.rival_challenges.find({"to_user_id": user["user_id"], "seen": False}).sort("created_at", -1).to_list(20)
    challenges = [{"from_name": c.get("from_name", "A rival")} for c in inc]
    if inc:
        await db.rival_challenges.update_many({"to_user_id": user["user_id"], "seen": False}, {"$set": {"seen": True}})
    return {
        "me": {
            "name": user.get("display_name") or "You",
            "xp": my_xp,
            "level": level_from_xp(my_xp),
            "rank_position": idx + 1,
            "total_players": total,
            "stats": attrs["stats"],
            "overall": attrs["overall"],
            "class_title": attrs["class_title"],
            "class_tier": attrs["class_tier"],
            "sex": user.get("sex", "male"),
        },
        "zone": _zone_for_tier(attrs["class_tier"]),
        "atrophy": _atrophy(user),
        "nodes": nodes,
        "neighbors": neighbors,
        "challenges": challenges,
    }


@api_router.get("/journey/clans")
async def journey_clans(user=Depends(get_current_user)):
    """Shared Circle ranking: clans ranked by combined XP earned from members' training."""
    clans = await db.groups.find({}, {"_id": 0, "id": 1, "name": 1, "xp": 1, "members": 1}).to_list(1000)
    clans = [c for c in clans if c.get("name")]
    clans.sort(key=lambda c: int(c.get("xp", 0) or 0), reverse=True)
    ranked = [{"id": c["id"], "name": c["name"], "xp": int(c.get("xp", 0) or 0), "members": len(c.get("members", []) or []), "rank": i + 1} for i, c in enumerate(clans)]
    mine_ids = {c["id"] for c in await db.groups.find({"members": user["user_id"]}, {"_id": 0, "id": 1}).to_list(20)}
    mine = [c for c in ranked if c["id"] in mine_ids][:3]
    return {"total": len(ranked), "top": ranked[:5], "mine": mine}



@api_router.get("/journey/similar")
async def journey_similar(lift: str, value: float, user=Depends(get_current_user)):
    if lift not in ("bench", "squat", "deadlift", "ohp"):
        raise HTTPException(status_code=400, detail="Invalid lift")
    rows = await db.users.find(
        {"user_id": {"$ne": user["user_id"]}, f"prs.{lift}": {"$gte": value}},
        {"_id": 0, "display_name": 1, "prs": 1, "sex": 1, "enhanced": 1},
    ).to_list(500)
    rows.sort(key=lambda u: (u.get("prs", {}) or {}).get(lift, 0))
    members = [{
        "name": u.get("display_name") or "Athlete",
        "value": (u.get("prs", {}) or {}).get(lift, 0),
        "sex": u.get("sex", "male"),
        "enhanced": bool(u.get("enhanced")),
    } for u in rows[:8]]
    return {"lift": lift, "value": value, "count": len(rows), "members": members}


@api_router.post("/journey/challenge")
async def journey_challenge(inp: ChallengeIn, user=Depends(get_current_user)):
    if inp.to_user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Can't challenge yourself")
    target = await db.users.find_one({"user_id": inp.to_user_id}, {"_id": 0, "display_name": 1, "xp": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Rival not found")
    uid = user["user_id"]
    pair = sorted([uid, inp.to_user_id])
    now = datetime.now(timezone.utc)
    # Upsert a single ACTIVE race per pair. Start-XP snapshot (keyed by user id) is
    # set only on first insert so the "catch me" gap has a stable origin.
    await db.rival_challenges.update_one(
        {"pair": pair, "status": "active"},
        {
            "$set": {
                "from_user_id": uid, "from_name": user.get("display_name") or "A rival",
                "to_user_id": inp.to_user_id, "to_name": target.get("display_name") or "Rival",
                "seen": False, "created_at": now,
            },
            "$setOnInsert": {
                "pair": pair, "status": "active",
                "starts": {uid: int(user.get("xp", 0)), inp.to_user_id: int(target.get("xp", 0))},
            },
        },
        upsert=True,
    )
    return {"ok": True, "to_name": target.get("display_name") or "Rival"}


@api_router.get("/journey/races")
async def journey_races(user=Depends(get_current_user)):
    """Active 'catch me' races for the caller — a live gap bar both racers can watch."""
    uid = user["user_id"]
    my_xp = int(user.get("xp", 0))
    races = await db.rival_challenges.find(
        {"status": "active", "$or": [{"from_user_id": uid}, {"to_user_id": uid}]}
    ).sort("created_at", -1).to_list(8)
    out = []
    for r in races:
        other_id = r["to_user_id"] if r["from_user_id"] == uid else r["from_user_id"]
        other = await db.users.find_one(
            {"user_id": other_id},
            {"_id": 0, "display_name": 1, "xp": 1, "sex": 1, "avatar_id": 1,
             "equipped_skin": 1, "equipped_hair": 1, "equipped_beard": 1, "enhanced": 1},
        )
        if not other:
            continue
        starts = r.get("starts", {}) or {}
        my_start = int(starts.get(uid, my_xp))
        other_start = int(starts.get(other_id, other.get("xp", 0)))
        other_xp = int(other.get("xp", 0))
        gap_start = abs(my_start - other_start) or 1
        gap_now = abs(my_xp - other_xp)
        led_start = my_start >= other_start
        led_now = my_xp >= other_xp
        overtaken = led_start != led_now
        progress = 1.0 if overtaken else max(0.0, min(1.0, (gap_start - gap_now) / gap_start))
        won_by_me = False
        nudge = False
        if overtaken:
            winner_id = uid if led_now else other_id
            # Guarded single-writer completion so the winner is rewarded exactly once.
            res = await db.rival_challenges.update_one(
                {"_id": r["_id"], "status": "active"},
                {"$set": {"status": "complete", "winner_id": winner_id,
                          "rewarded": True, "completed_at": datetime.now(timezone.utc)}},
            )
            if res.modified_count == 1:
                await award_xp(winner_id, RACE_WINNER_XP)
                await db.users.update_one({"user_id": winner_id}, {"$addToSet": {"badges": "race_winner"}})
            won_by_me = led_now
        else:
            # "Rival closing in" nudge: fires when YOUR lead shrank since you last looked.
            seen = r.get("seen_gap", {}) or {}
            last = seen.get(uid)
            if led_now and last is not None and gap_now <= last - RACE_NUDGE_STEP:
                nudge = True
            await db.rival_challenges.update_one({"_id": r["_id"]}, {"$set": {f"seen_gap.{uid}": gap_now}})
        out.append({
            "id": str(r.get("_id")),
            "other_user_id": other_id,
            "other_name": other.get("display_name") or "Rival",
            "other_enhanced": bool(other.get("enhanced")),
            "other_xp": other_xp,
            "my_xp": my_xp,
            "i_lead": led_now,
            "gap": gap_now,
            "gap_start": gap_start,
            "progress": round(progress, 3),
            "overtaken": overtaken,
            "won_by_me": won_by_me,
            "reward_xp": RACE_WINNER_XP if won_by_me else 0,
            "nudge": nudge,
        })
    return {"races": out}


@api_router.post("/quests/claim")
async def claim_quest(payload: dict, user=Depends(get_current_user)):
    quest_id = payload.get("quest_id", "")
    # Admin-authored custom quest claim
    if quest_id.startswith("custom:"):
        cid = quest_id.split(":", 1)[1]
        cq = await db.custom_quests.find_one({"id": cid})
        if not cq:
            raise HTTPException(status_code=404, detail="Quest not found")
        st = await db.custom_quest_state.find_one({"custom_id": cid, "user_id": user["user_id"]}) or {}
        if not st.get("complete"):
            raise HTTPException(status_code=400, detail="Objectives not met")
        if st.get("claimed"):
            raise HTTPException(status_code=400, detail="Already claimed")
        now = datetime.now(timezone.utc)
        await db.custom_quest_state.update_one(
            {"custom_id": cid, "user_id": user["user_id"]},
            {"$set": {"complete": True, "claimed": True, "claimed_at": now}}, upsert=True)
        gained = int(cq.get("reward_xp", 0) or 0)
        if gained:
            await award_xp(user["user_id"], gained)
            await award_group_xp(user["user_id"], gained)
        fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
        fresh["rank"] = rank_from_xp(fresh["xp"])
        return {"ok": True, "reward": (f"+{gained} XP" if gained else "Reward claimed"), "loot": [], "user": fresh}
    parts = quest_id.split(":")
    if len(parts) < 3:
        raise HTTPException(status_code=400, detail="Bad quest id")
    scope, tmpl_id = parts[0], parts[1]
    tmpl = next((t for t in QUEST_TEMPLATES.get(scope, []) if t["id"] == tmpl_id), None)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Quest not found")
    now = datetime.now(timezone.utc)
    quests = await _build_quests(user, scope, now)
    q = next((x for x in quests if x["id"] == quest_id), None)
    if not q:
        raise HTTPException(status_code=404, detail="Quest not active")
    if not q["complete"]:
        raise HTTPException(status_code=400, detail="Objectives not met")
    if q["claimed"]:
        raise HTTPException(status_code=400, detail="Already claimed")

    await db.quest_claims.insert_one({"user_id": user["user_id"], "quest_key": quest_id, "claimed_at": now})
    reward_msg = ""
    rtype = tmpl.get("reward_type", "xp")
    parts_msg = []
    # High-reward quests may grant XP alongside a typed reward
    gained = tmpl.get("reward_xp", 0)
    if gained and (rtype == "xp" or scope in ("daily", "weekly", "boss")):
        await award_xp(user["user_id"], gained)
        parts_msg.append(f"+{gained} XP")
    if rtype in ("badge", "card"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"badges": tmpl["reward_value"]}})
        parts_msg.append(tmpl.get("reward_label", "New badge"))
    elif rtype == "background":
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"extra_unlocks": tmpl["reward_value"]}})
        parts_msg.append(tmpl.get("reward_label", "New background"))
    elif rtype == "frame":
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"extra_unlocks": f"frame_{tmpl['reward_value']}"}})
        parts_msg.append(tmpl.get("reward_label", "New frame"))
    reward_msg = " · ".join(parts_msg) if parts_msg else tmpl.get("reward_label", "Reward claimed")

    # Boss loot: quest-exclusive skins/weapons that just unlocked from this claim
    loot = []
    try:
        from gear import quest_loot_for_claim
        loot = await quest_loot_for_claim(user["user_id"], scope)
    except Exception:
        loot = []

    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return {"ok": True, "reward": reward_msg, "loot": loot, "user": fresh}


@api_router.get("/unlockables")
async def get_unlockables(user=Depends(get_current_user)):
    lvl = user.get("level", 1)
    active = user.get("active_background", "bg_default")
    rank = rank_from_xp(user.get("xp", 0))
    rank_order = RANK_ORDER
    earned_perks = set()
    for r in rank_order[: rank_order.index(rank) + 1]:
        if r in RANK_PERK_BG:
            earned_perks.add(RANK_PERK_BG[r])
    extra = set(user.get("extra_unlocks", []) or [])
    backgrounds = [{
        **b,
        "unlocked": lvl >= b["level"] or b["id"] in earned_perks or b["id"] == active or b["id"] in extra,
        "active": active == b["id"],
        "perk_rank": next((r for r, bid in RANK_PERK_BG.items() if bid == b["id"]), None),
    } for b in BACKGROUNDS]
    widgets = [{**w, "unlocked": lvl >= w["level"]} for w in WIDGETS]
    return {"level": lvl, "backgrounds": backgrounds, "widgets": widgets}
