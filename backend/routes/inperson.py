# ruff: noqa: F403, F405
"""In-Person Clients room — private 1-on-1 admin↔client chat, file sharing
(PDF/images/docs), and admin-assigned workouts that load into the client's logger."""
from shared import *  # noqa: F401,F403


def _is_admin(user) -> bool:
    return bool(user.get("is_admin"))


async def _person_brief(uid: str) -> dict:
    u = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        return {"user_id": uid, "display_name": "Athlete", "avatar_id": "avatar_white"}
    return {
        "user_id": u["user_id"],
        "display_name": u.get("display_name", "Athlete"),
        "avatar_id": u.get("avatar_id", "avatar_white"),
        "sex": u.get("sex", "male"),
        "equipped_skin": u.get("equipped_skin"),
        "equipped_weapon": u.get("equipped_weapon"),
        "equipped_hair": u.get("equipped_hair"),
        "equipped_beard": u.get("equipped_beard"),
        "rank": rank_from_xp(u.get("xp", 0)),
        "level": level_from_xp(u.get("xp", 0)),
        "inperson_gym": u.get("inperson_gym", "") or "",
        "next_session": u.get("inperson_next_session", "") or "",
    }


async def _client_stats(cid: str) -> dict:
    """Recent workouts + PRs for coaching context (admin peek)."""
    u = await db.users.find_one({"user_id": cid}, {"_id": 0, "prs": 1, "workouts_logged": 1, "streak_days": 1})
    rows = await db.workouts.find({"user_id": cid}, {"_id": 0}).sort("logged_at", -1).limit(6).to_list(6)
    recent = []
    for w in rows:
        sets = 0
        volume = 0
        for ex in (w.get("exercises") or []):
            for s in (ex.get("sets") or []):
                sets += 1
                volume += (s.get("reps", 0) or 0) * (s.get("weight_lb", 0) or 0)
        recent.append({
            "name": w.get("workout_name", "Workout"),
            "date": w["logged_at"].isoformat() if hasattr(w.get("logged_at"), "isoformat") else w.get("logged_at"),
            "sets": sets,
            "volume": int(volume),
            "pr": bool(w.get("pr_details")),
        })
    return {
        "prs": (u or {}).get("prs", {}) or {},
        "workouts_logged": (u or {}).get("workouts_logged", 0),
        "streak_days": (u or {}).get("streak_days", 0),
        "recent": recent,
    }


def _msg_public(m: dict) -> dict:
    return {
        "id": m["id"],
        "client_id": m["client_id"],
        "sender_id": m["sender_id"],
        "sender_role": m["sender_role"],
        "kind": m.get("kind", "msg"),
        "text": m.get("text", ""),
        "media_id": m.get("media_id"),
        "media_type": m.get("media_type"),
        "file_name": m.get("file_name"),
        "program_id": m.get("program_id"),
        "created_at": m["created_at"].isoformat() if hasattr(m.get("created_at"), "isoformat") else m.get("created_at"),
    }


async def _resolve_thread(client_id: str, user) -> str:
    """Return the client_id whose thread the caller may access (admin: any existing
    in-person client; client: only their own)."""
    if _is_admin(user):
        target = await db.users.find_one({"user_id": client_id})
        if not target or not target.get("inperson_client"):
            raise HTTPException(status_code=404, detail="Not an in-person client")
        return client_id
    # Non-admin: can only ever open their own thread, and only if enrolled
    if client_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    if not user.get("inperson_client"):
        raise HTTPException(status_code=403, detail="You are not enrolled as an in-person client")
    return user["user_id"]


@api_router.get("/inperson/clients")
async def inperson_clients(user=Depends(get_current_user)):
    """Admin: list of in-person clients with last message + unread count."""
    _require_admin_ip(user)
    rows = await db.users.find(
        {"inperson_client": True, "is_admin": {"$ne": True}}, {"_id": 0, "password_hash": 0}
    ).to_list(500)
    out = []
    for u in rows:
        cid = u["user_id"]
        last = await db.inperson_messages.find({"client_id": cid}).sort("created_at", -1).limit(1).to_list(1)
        unread = await db.inperson_messages.count_documents(
            {"client_id": cid, "sender_role": "client", "read_by_admin": {"$ne": True}}
        )
        brief = await _person_brief(cid)
        brief["last_message"] = (_msg_public(last[0]) if last else None)
        brief["unread"] = unread
        brief["checkin_due"] = await _checkin_due(cid)
        brief["checkin_streak"] = await _checkin_streak(cid)
        brief["sessions_this_month"] = await _sessions_this_month(cid)
        brief["pending_requests"] = await db.inperson_bookings.count_documents({"client_id": cid, "status": "pending"})
        out.append(brief)
    # Most recent activity first, then float overdue check-ins to the very top
    out.sort(key=lambda x: (x["last_message"]["created_at"] if x["last_message"] else ""), reverse=True)
    out.sort(key=lambda x: 0 if x["checkin_due"] else 1)
    out.sort(key=lambda x: 0 if x.get("pending_requests") else 1)
    return out


def _require_admin_ip(user):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")


async def _checkin_due(cid: str) -> bool:
    last = await db.inperson_messages.find_one({"client_id": cid, "kind": "checkin"}, sort=[("created_at", -1)])
    if not last or not last.get("created_at"):
        return True
    lc = last["created_at"]
    if getattr(lc, "tzinfo", None) is None:
        lc = lc.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - lc).days >= 7


async def _sessions_this_month(cid: str) -> int:
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    return await db.inperson_attendance.count_documents({"client_id": cid, "date": {"$gte": start}})


async def _checkin_streak(cid: str) -> int:
    """Consecutive ISO-week streak of weekly check-ins (alive this or last week)."""
    rows = await db.inperson_messages.find({"client_id": cid, "kind": "checkin"}, {"_id": 0, "created_at": 1}).to_list(500)
    weekset = set()
    for r in rows:
        d = r.get("created_at")
        if not d:
            continue
        if getattr(d, "tzinfo", None) is None:
            d = d.replace(tzinfo=timezone.utc)
        c = d.isocalendar()
        weekset.add((c[0], c[1]))
    if not weekset:
        return 0
    now = datetime.now(timezone.utc)

    def wk(dt):
        c = dt.isocalendar()
        return (c[0], c[1])
    anchor = now
    if wk(now) in weekset:
        anchor = now
    elif wk(now - timedelta(weeks=1)) in weekset:
        anchor = now - timedelta(weeks=1)
    else:
        return 0
    streak = 0
    cur = anchor
    while wk(cur) in weekset:
        streak += 1
        cur = cur - timedelta(weeks=1)
    return streak


def _clean_metrics(m) -> dict:
    """Keep only sane optional numeric body metrics from a check-in."""
    if not isinstance(m, dict):
        return {}
    out = {}
    for k in ("weight", "waist", "arms"):
        v = m.get(k)
        try:
            if v is None or v == "":
                continue
            f = round(float(v), 1)
            if 0 < f < 2000:
                out[k] = f
        except (TypeError, ValueError):
            continue
    return out


@api_router.get("/inperson/thread/{client_id}")
async def inperson_thread(client_id: str, user=Depends(get_current_user)):
    cid = await _resolve_thread(client_id, user)
    msgs = await db.inperson_messages.find({"client_id": cid}).sort("created_at", 1).to_list(1000)
    # Mark read for the reader's side
    if _is_admin(user):
        await db.inperson_messages.update_many(
            {"client_id": cid, "sender_role": "client", "read_by_admin": {"$ne": True}},
            {"$set": {"read_by_admin": True}})
    else:
        await db.inperson_messages.update_many(
            {"client_id": cid, "sender_role": "admin", "read_by_client": {"$ne": True}},
            {"$set": {"read_by_client": True}})
    programs = await db.inperson_programs.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for p in programs:
        if hasattr(p.get("created_at"), "isoformat"):
            p["created_at"] = p["created_at"].isoformat()
    # Attendance history + weekly check-in status
    att_rows = await db.inperson_attendance.find({"client_id": cid}, {"_id": 0}).sort("date", -1).limit(30).to_list(30)
    attendance = [{"date": a["date"].isoformat() if hasattr(a.get("date"), "isoformat") else a.get("date"), "note": a.get("note", "")} for a in att_rows]
    checkin_due = await _checkin_due(cid)
    # Progress-photo timeline (chronological) from check-in messages with an image
    checkin_photos = [
        {"media_id": m["media_id"], "date": m["created_at"].isoformat() if hasattr(m.get("created_at"), "isoformat") else m.get("created_at")}
        for m in msgs if m.get("kind") == "checkin" and m.get("media_id") and m.get("media_type") == "image"
    ]
    # Body-metrics timeline (chronological) from check-ins that logged metrics
    metrics_timeline = [
        {"date": m["created_at"].isoformat() if hasattr(m.get("created_at"), "isoformat") else m.get("created_at"), **(m.get("metrics") or {})}
        for m in msgs if m.get("kind") == "checkin" and m.get("metrics")
    ]
    cdoc = await db.users.find_one({"user_id": cid}, {"_id": 0, "inperson_notes": 1, "inperson_goal": 1, "inperson_goal_progress": 1, "inperson_milestone_seen": 1})
    streak_val = await _checkin_streak(cid)
    seen_ms = int((cdoc or {}).get("inperson_milestone_seen", 0) or 0)
    milestone_celebrate = streak_val if (not _is_admin(user) and streak_val % 4 == 0 and streak_val > seen_ms) else 0
    return {
        "client": await _person_brief(cid),
        "messages": [_msg_public(m) for m in msgs],
        "programs": programs,
        "is_admin": _is_admin(user),
        "client_stats": (await _client_stats(cid)) if _is_admin(user) else None,
        "attendance": attendance,
        "attendance_count": len(attendance),
        "attendance_total": await db.inperson_attendance.count_documents({"client_id": cid}),
        "sessions_this_month": await _sessions_this_month(cid),
        "checkin_due": checkin_due,
        "checkin_streak": streak_val,
        "milestone_celebrate": milestone_celebrate,
        "checkin_photos": checkin_photos,
        "metrics_timeline": metrics_timeline,
        "goal": (cdoc or {}).get("inperson_goal", "") or "",
        "goal_progress": int((cdoc or {}).get("inperson_goal_progress", 0) or 0),
        "coach_notes": ((cdoc or {}).get("inperson_notes", "") or "") if _is_admin(user) else None,
    }


@api_router.post("/inperson/thread/{client_id}/notes")
async def inperson_notes(client_id: str, payload: dict, user=Depends(get_current_user)):
    """Private coach-only notes + a shared goal & goal progress per client. Admin only."""
    _require_admin_ip(user)
    cid = await _resolve_thread(client_id, user)
    updates: dict = {}
    if payload.get("notes") is not None:
        updates["inperson_notes"] = (payload.get("notes") or "").strip()[:2000]
    if payload.get("goal") is not None:
        updates["inperson_goal"] = (payload.get("goal") or "").strip()[:120]
    if payload.get("goal_progress") is not None:
        try:
            updates["inperson_goal_progress"] = max(0, min(100, int(payload.get("goal_progress"))))
        except (TypeError, ValueError):
            pass
    if updates:
        await db.users.update_one({"user_id": cid}, {"$set": updates})
    return {"ok": True, "coach_notes": updates.get("inperson_notes"),
            "goal": updates.get("inperson_goal"), "goal_progress": updates.get("inperson_goal_progress")}


@api_router.post("/inperson/milestone-seen")
async def inperson_milestone_seen(user=Depends(get_current_user)):
    """Client acknowledges their current streak milestone (stops confetti replay)."""
    streak = await _checkin_streak(user["user_id"])
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"inperson_milestone_seen": streak}})
    return {"ok": True, "milestone_seen": streak}


@api_router.post("/inperson/nudge")
async def inperson_nudge(payload: dict, user=Depends(get_current_user)):
    """One-tap reminder to every client overdue on their weekly check-in."""
    _require_admin_ip(user)
    text = (payload.get("text") or "👋 Coach here — time for your weekly check-in! How's training, diet & recovery going?").strip()[:500]
    rows = await db.users.find({"inperson_client": True, "is_admin": {"$ne": True}}).to_list(500)
    now = datetime.now(timezone.utc)
    nudged = 0
    for u in rows:
        cid = u["user_id"]
        if await _checkin_due(cid):
            await db.inperson_messages.insert_one({
                "id": new_id("ipm"), "client_id": cid, "sender_id": user["user_id"], "sender_role": "admin",
                "kind": "msg", "text": text, "created_at": now, "read_by_admin": True, "read_by_client": False,
            })
            nudged += 1
    return {"nudged": nudged}


@api_router.post("/inperson/thread/{client_id}/checkin")
async def inperson_checkin(client_id: str, payload: dict, user=Depends(get_current_user)):
    """Client logs a weekly progress check-in (note + optional photo)."""
    cid = await _resolve_thread(client_id, user)
    text = (payload.get("text") or "").strip()[:2000]
    media_id = payload.get("media_id")
    media_type = None
    file_name = None
    if media_id:
        rec = await db.chat_media.find_one({"media_id": media_id}, {"_id": 0})
        if not rec:
            raise HTTPException(status_code=400, detail="Invalid attachment")
        media_type = rec.get("media_type")
        file_name = rec.get("original_name")
    if not text and not media_id:
        raise HTTPException(status_code=400, detail="Add a note or a photo")
    metrics = _clean_metrics(payload.get("metrics"))
    role = "admin" if _is_admin(user) else "client"
    doc = {
        "id": new_id("ipm"),
        "client_id": cid,
        "sender_id": user["user_id"],
        "sender_role": role,
        "kind": "checkin",
        "text": text,
        "media_id": media_id,
        "media_type": media_type,
        "file_name": file_name,
        "metrics": metrics,
        "created_at": datetime.now(timezone.utc),
        "read_by_admin": role == "admin",
        "read_by_client": role == "client",
    }
    await db.inperson_messages.insert_one(doc)
    # Celebrate consecutive-week streak milestones (4 / 8 / 12 ...)
    streak = await _checkin_streak(cid)
    if streak and streak % 4 == 0:
        exists = await db.inperson_messages.find_one({"client_id": cid, "kind": "system", "milestone": streak})
        if not exists:
            tier = "🏆 LEGEND" if streak >= 12 else "🥈 ELITE" if streak >= 8 else "🥉 LOCKED IN"
            await db.inperson_messages.insert_one({
                "id": new_id("ipm"), "client_id": cid, "sender_id": user["user_id"], "sender_role": role,
                "kind": "system", "milestone": streak,
                "text": f"🎉 {streak}-WEEK CHECK-IN STREAK! {tier} — consistency is paying off.",
                "created_at": datetime.now(timezone.utc), "read_by_admin": False, "read_by_client": False,
            })
    return _msg_public(doc)


@api_router.post("/inperson/thread/{client_id}/attendance")
async def inperson_attendance(client_id: str, payload: dict, user=Depends(get_current_user)):
    """Admin marks an in-person session completed (builds attendance history)."""
    _require_admin_ip(user)
    cid = await _resolve_thread(client_id, user)
    note = (payload.get("note") or "").strip()[:200]
    now = datetime.now(timezone.utc)
    await db.inperson_attendance.insert_one({
        "id": new_id("ipa"), "client_id": cid, "marked_by": user["user_id"], "date": now, "note": note,
    })
    await db.inperson_messages.insert_one({
        "id": new_id("ipm"), "client_id": cid, "sender_id": user["user_id"], "sender_role": "admin",
        "kind": "system", "text": f"✅ Session completed{(' · ' + note) if note else ''}",
        "created_at": now, "read_by_admin": True, "read_by_client": False,
    })
    count = await db.inperson_attendance.count_documents({"client_id": cid})
    return {"ok": True, "count": count}


@api_router.post("/inperson/thread/{client_id}/schedule")
async def inperson_schedule(client_id: str, payload: dict, user=Depends(get_current_user)):
    """Admin sets the client's next in-person session (free-text date/time)."""
    _require_admin_ip(user)
    cid = await _resolve_thread(client_id, user)
    when = (payload.get("next_session") or "").strip()[:80]
    await db.users.update_one({"user_id": cid}, {"$set": {"inperson_next_session": when}})
    if when:
        await db.inperson_messages.insert_one({
            "id": new_id("ipm"),
            "client_id": cid,
            "sender_id": user["user_id"],
            "sender_role": "admin",
            "kind": "system",
            "text": f"📅 Next session set: {when}",
            "created_at": datetime.now(timezone.utc),
            "read_by_admin": True,
            "read_by_client": False,
        })
    return {"ok": True, "next_session": when}


@api_router.post("/inperson/thread/{client_id}/message")
async def inperson_send(client_id: str, payload: dict, user=Depends(get_current_user)):
    cid = await _resolve_thread(client_id, user)
    text = (payload.get("text") or "").strip()[:4000]
    media_id = payload.get("media_id")
    media_type = None
    file_name = None
    if media_id:
        rec = await db.chat_media.find_one({"media_id": media_id}, {"_id": 0})
        if not rec:
            raise HTTPException(status_code=400, detail="Invalid attachment")
        media_type = rec.get("media_type")
        file_name = rec.get("original_name")
    if not text and not media_id:
        raise HTTPException(status_code=400, detail="Empty message")
    role = "admin" if _is_admin(user) else "client"
    doc = {
        "id": new_id("ipm"),
        "client_id": cid,
        "sender_id": user["user_id"],
        "sender_role": role,
        "kind": "msg",
        "text": text,
        "media_id": media_id,
        "media_type": media_type,
        "file_name": file_name,
        "created_at": datetime.now(timezone.utc),
        "read_by_admin": role == "admin",
        "read_by_client": role == "client",
    }
    await db.inperson_messages.insert_one(doc)
    return _msg_public(doc)


@api_router.post("/inperson/upload")
async def inperson_upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Upload an image OR document (PDF/doc/xls/txt) for the in-person room."""
    if not (user.get("is_admin") or user.get("inperson_client")):
        raise HTTPException(status_code=403, detail="In-person clients only")
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct in ALLOWED_IMAGE_TYPES:
        media_type, cap = "image", MAX_IMAGE_BYTES
    elif ct in ALLOWED_DOC_TYPES:
        media_type, cap = "document", MAX_DOC_BYTES
    else:
        raise HTTPException(status_code=400, detail="Only images, PDFs and documents are allowed")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > cap:
        raise HTTPException(status_code=400, detail=f"File too large (max {cap // (1024 * 1024)}MB)")
    ext = _EXT_MAP.get(ct, "bin")
    path = f"{STORAGE_APP_NAME}/inperson/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        logger.error(f"In-person upload failed: {e.response.status_code} {e.response.text[:200]}")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("med")
    await db.chat_media.insert_one({
        "media_id": media_id,
        "user_id": user["user_id"],
        "storage_path": path,
        "content_type": ct,
        "media_type": media_type,
        "size": len(data),
        "original_name": file.filename,
        "created_at": datetime.now(timezone.utc),
    })
    return {"media_id": media_id, "media_type": media_type, "file_name": file.filename}


def _parse_program(plan_text: str) -> list:
    """Parse 'Exercise Name SxR [@weight]' lines into exercises with explicit sets."""
    exercises = []
    for raw in (plan_text or "").split("\n"):
        line = raw.strip().lstrip("-•*").strip()
        if not line:
            continue
        m = re.search(r"(.+?)\s+(\d+)\s*[xX]\s*(\d+)(?:\s*@\s*(\d+(?:\.\d+)?))?", line)
        if not m:
            continue
        name = m.group(1).strip().rstrip(":-–").strip()[:44] or "Exercise"
        n_sets = max(1, min(12, int(m.group(2))))
        reps = max(1, min(100, int(m.group(3))))
        weight = float(m.group(4)) if m.group(4) else 0.0
        sets = [{"reps": reps, "weight_lb": weight, "rpe": 7} for _ in range(n_sets)]
        exercises.append({"name": name, "sets": sets})
    return exercises


@api_router.post("/inperson/thread/{client_id}/assign")
async def inperson_assign(client_id: str, payload: dict, user=Depends(get_current_user)):
    """Admin assigns a workout to a client; it appears in their room + logs a message."""
    _require_admin_ip(user)
    cid = await _resolve_thread(client_id, user)
    name = (payload.get("name") or "Custom Workout").strip()[:60]
    note = (payload.get("note") or "").strip()[:500]
    exercises = payload.get("exercises")
    if not exercises:
        exercises = _parse_program(payload.get("plan_text", ""))
    if not exercises:
        raise HTTPException(status_code=400, detail="Add at least one exercise line (e.g. 'Bench Press 3x8 @135')")
    prog = {
        "id": new_id("ipp"),
        "client_id": cid,
        "assigned_by": user["user_id"],
        "name": name,
        "note": note,
        "exercises": exercises,
        "started": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.inperson_programs.insert_one(prog)
    await db.inperson_messages.insert_one({
        "id": new_id("ipm"),
        "client_id": cid,
        "sender_id": user["user_id"],
        "sender_role": "admin",
        "kind": "program",
        "text": f"Assigned workout: {name}",
        "program_id": prog["id"],
        "created_at": datetime.now(timezone.utc),
        "read_by_admin": True,
        "read_by_client": False,
    })
    prog.pop("_id", None)
    prog["created_at"] = prog["created_at"].isoformat()
    if payload.get("save_as_template"):
        await db.inperson_templates.insert_one({
            "id": new_id("ipt"), "owner_id": user["user_id"], "name": name,
            "note": note, "exercises": exercises, "created_at": datetime.now(timezone.utc),
        })
    return prog


@api_router.get("/inperson/templates")
async def inperson_templates(user=Depends(get_current_user)):
    """Admin's saved workout templates for quick re-assignment."""
    _require_admin_ip(user)
    rows = await db.inperson_templates.find({"owner_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for r in rows:
        if hasattr(r.get("created_at"), "isoformat"):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/inperson/templates")
async def inperson_template_create(payload: dict, user=Depends(get_current_user)):
    _require_admin_ip(user)
    name = (payload.get("name") or "Template").strip()[:60]
    note = (payload.get("note") or "").strip()[:500]
    exercises = payload.get("exercises") or _parse_program(payload.get("plan_text", ""))
    if not exercises:
        raise HTTPException(status_code=400, detail="Add at least one exercise line")
    tpl = {"id": new_id("ipt"), "owner_id": user["user_id"], "name": name, "note": note,
           "exercises": exercises, "created_at": datetime.now(timezone.utc)}
    await db.inperson_templates.insert_one(tpl)
    tpl.pop("_id", None)
    tpl["created_at"] = tpl["created_at"].isoformat()
    return tpl


@api_router.delete("/inperson/templates/{template_id}")
async def inperson_template_delete(template_id: str, user=Depends(get_current_user)):
    _require_admin_ip(user)
    await db.inperson_templates.delete_one({"id": template_id, "owner_id": user["user_id"]})
    return {"ok": True}


@api_router.post("/inperson/programs/{program_id}/started")
async def inperson_program_started(program_id: str, user=Depends(get_current_user)):
    prog = await db.inperson_programs.find_one({"id": program_id})
    if not prog:
        raise HTTPException(status_code=404, detail="Program not found")
    if not (_is_admin(user) or prog["client_id"] == user["user_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.inperson_programs.update_one({"id": program_id}, {"$set": {"started": True}})
    return {"ok": True}


@api_router.get("/inperson/unread")
async def inperson_unread(user=Depends(get_current_user)):
    """Badge counter for the Home CTA."""
    if _is_admin(user):
        n = await db.inperson_messages.count_documents(
            {"sender_role": "client", "read_by_admin": {"$ne": True}})
        reqs = await db.inperson_bookings.count_documents({"status": "pending"})
        return {"unread": n, "pending_requests": reqs, "role": "admin"}
    if user.get("inperson_client"):
        n = await db.inperson_messages.count_documents(
            {"client_id": user["user_id"], "sender_role": "admin", "read_by_client": {"$ne": True}})
        return {"unread": n, "pending_requests": 0, "role": "client"}
    return {"unread": 0, "pending_requests": 0, "role": "none"}


# ---------- Session bookings (client requests a date/time, coach approves) ----------
def _booking_public(b: dict) -> dict:
    return {
        "id": b["id"],
        "client_id": b["client_id"],
        "client_name": b.get("client_name", "Athlete"),
        "coach_id": b.get("coach_id"),
        "date": b.get("date"),
        "time": b.get("time"),
        "note": b.get("note", ""),
        "status": b.get("status", "pending"),
        "proposed_by": b.get("proposed_by", "client"),
        "created_at": b["created_at"].isoformat() if hasattr(b.get("created_at"), "isoformat") else b.get("created_at"),
    }


def _compute_appt_at(date: str, time: str, tz_offset_minutes: int) -> datetime:
    """Build the appointment instant in UTC from a local date/time + the client's
    JS getTimezoneOffset() (minutes to ADD to local to reach UTC)."""
    y, m, d = [int(x) for x in date.split("-")]
    hh, mm = [int(x) for x in time.split(":")]
    local = datetime(y, m, d, hh, mm)
    return (local + timedelta(minutes=int(tz_offset_minutes or 0))).replace(tzinfo=timezone.utc)


@api_router.post("/inperson/booking/request")
async def inperson_booking_request(inp: SessionRequestIn, user=Depends(get_current_user)):
    """An approved in-person client requests a session at a chosen date + time."""
    if not user.get("inperson_client"):
        raise HTTPException(status_code=403, detail="Only in-person clients can request sessions")
    date = (inp.date or "").strip()[:10]
    time = (inp.time or "").strip()[:5]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise HTTPException(status_code=400, detail="Pick a valid date")
    if not re.match(r"^\d{2}:\d{2}$", time):
        raise HTTPException(status_code=400, detail="Pick a time slot")
    try:
        appt_at = _compute_appt_at(date, time, inp.tz_offset_minutes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date or time")
    cid = user["user_id"]
    now = datetime.now(timezone.utc)
    doc = {
        "id": new_id("ipbk"), "client_id": cid, "client_name": user.get("display_name", "Athlete"),
        "coach_id": None, "date": date, "time": time, "appt_at": appt_at,
        "note": (inp.note or "").strip()[:200], "status": "pending",
        "reminder_24_sent": False, "reminder_1_sent": False, "created_at": now,
    }
    await db.inperson_bookings.insert_one(doc)
    await db.inperson_messages.insert_one({
        "id": new_id("ipm"), "client_id": cid, "sender_id": cid, "sender_role": "client",
        "kind": "booking", "text": f"📅 Requested a session · {date} at {time}" + (f" · {doc['note']}" if doc['note'] else ""),
        "booking_id": doc["id"], "created_at": now, "read_by_admin": False, "read_by_client": True,
    })
    return _booking_public(doc)


@api_router.get("/inperson/bookings")
async def inperson_bookings(client_id: Optional[str] = None, user=Depends(get_current_user)):
    """Admin: all bookings (optionally for one client). Client: their own."""
    if _is_admin(user):
        query: dict = {}
        if client_id:
            query["client_id"] = client_id
    else:
        query = {"client_id": user["user_id"]}
    rows = await db.inperson_bookings.find(query, {"_id": 0}).sort("appt_at", 1).to_list(500)
    return {"bookings": [_booking_public(b) for b in rows]}


async def _set_booking_status(booking_id: str, status: str, user, system_text: str):
    b = await db.inperson_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    updates = {"status": status}
    if status == "approved":
        updates["coach_id"] = user["user_id"]
        updates["approved_at"] = datetime.now(timezone.utc)
        await db.users.update_one({"user_id": b["client_id"]}, {"$set": {"inperson_next_session": f"{b['date']} at {b['time']}"}})
    await db.inperson_bookings.update_one({"id": booking_id}, {"$set": updates})
    await db.inperson_messages.insert_one({
        "id": new_id("ipm"), "client_id": b["client_id"], "sender_id": user["user_id"], "sender_role": "admin",
        "kind": "system", "text": system_text, "booking_id": booking_id,
        "created_at": datetime.now(timezone.utc), "read_by_admin": True, "read_by_client": False,
    })
    fresh = await db.inperson_bookings.find_one({"id": booking_id}, {"_id": 0})
    return _booking_public(fresh)


@api_router.post("/inperson/booking/{booking_id}/approve")
async def inperson_booking_approve(booking_id: str, user=Depends(get_current_user)):
    _require_admin_ip(user)
    b = await db.inperson_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return await _set_booking_status(booking_id, "approved", user, f"✅ Session confirmed · {b['date']} at {b['time']}")


@api_router.post("/inperson/booking/{booking_id}/decline")
async def inperson_booking_decline(booking_id: str, user=Depends(get_current_user)):
    _require_admin_ip(user)
    b = await db.inperson_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return await _set_booking_status(booking_id, "declined", user, f"❌ Session request declined · {b['date']} at {b['time']}")


@api_router.post("/inperson/booking/{booking_id}/cancel")
async def inperson_booking_cancel(booking_id: str, user=Depends(get_current_user)):
    b = await db.inperson_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not (_is_admin(user) or b["client_id"] == user["user_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    who = "Coach" if _is_admin(user) else "Client"
    return await _set_booking_status(booking_id, "cancelled", user, f"🚫 Session cancelled by {who} · {b['date']} at {b['time']}")


@api_router.post("/inperson/booking/{booking_id}/reschedule")
async def inperson_booking_reschedule(booking_id: str, inp: SessionRequestIn, user=Depends(get_current_user)):
    """Client (or admin) proposes a new date/time — resets the booking to pending."""
    b = await db.inperson_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not (_is_admin(user) or b["client_id"] == user["user_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    date = (inp.date or "").strip()[:10]
    time = (inp.time or "").strip()[:5]
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        raise HTTPException(status_code=400, detail="Pick a valid date")
    if not re.match(r"^\d{2}:\d{2}$", time):
        raise HTTPException(status_code=400, detail="Pick a time slot")
    try:
        appt_at = _compute_appt_at(date, time, inp.tz_offset_minutes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date or time")
    await db.inperson_bookings.update_one({"id": booking_id}, {"$set": {
        "date": date, "time": time, "appt_at": appt_at, "status": "pending",
        "proposed_by": "coach" if _is_admin(user) else "client",
        "reminder_24_sent": False, "reminder_1_sent": False,
    }})
    who = "Coach" if _is_admin(user) else "Client"
    role = "admin" if _is_admin(user) else "client"
    await db.inperson_messages.insert_one({
        "id": new_id("ipm"), "client_id": b["client_id"], "sender_id": user["user_id"], "sender_role": role,
        "kind": "booking", "text": f"🔄 {who} proposed a new time · {date} at {time}", "booking_id": booking_id,
        "created_at": datetime.now(timezone.utc), "read_by_admin": role == "admin", "read_by_client": role == "client",
    })
    fresh = await db.inperson_bookings.find_one({"id": booking_id}, {"_id": 0})
    return _booking_public(fresh)


@api_router.post("/inperson/booking/{booking_id}/accept")
async def inperson_booking_accept(booking_id: str, user=Depends(get_current_user)):
    """Client accepts a time the coach proposed — confirms the session."""
    b = await db.inperson_bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b["client_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.users.update_one({"user_id": b["client_id"]}, {"$set": {"inperson_next_session": f"{b['date']} at {b['time']}"}})
    await db.inperson_bookings.update_one({"id": booking_id}, {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc)}})
    await db.inperson_messages.insert_one({
        "id": new_id("ipm"), "client_id": b["client_id"], "sender_id": user["user_id"], "sender_role": "client",
        "kind": "system", "text": f"✅ Client accepted the new time · {b['date']} at {b['time']}", "booking_id": booking_id,
        "created_at": datetime.now(timezone.utc), "read_by_admin": False, "read_by_client": True,
    })
    fresh = await db.inperson_bookings.find_one({"id": booking_id}, {"_id": 0})
    return _booking_public(fresh)

