# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


def _require_admin(user):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")


async def _member_brief(u: dict) -> dict:
    b = ban_state(u)
    return {
        "user_id": u.get("user_id"),
        "display_name": u.get("display_name", "Athlete"),
        "avatar_id": u.get("avatar_id", "avatar_white"),
        "sex": u.get("sex", "male"),
        "xp": u.get("xp", 0),
        "rank": rank_from_xp(u.get("xp", 0)),
        "level": level_from_xp(u.get("xp", 0)),
        "skool_verified": bool(u.get("skool_verified")),
        "founder_backer": bool(u.get("founder_backer")),
        "founder_grant": bool(u.get("founder_grant")),
        "badges": u.get("badges", []) or [],
        "ban_active": bool(b),
        "ban_scope": b["scope"] if b else None,
        "ban_until": b["until"].isoformat() if b else None,
        "inperson_client": bool(u.get("inperson_client")),
        "inperson_gym": u.get("inperson_gym", "") or "",
        "inperson_request": bool(u.get("inperson_request")),
    }


@api_router.post("/admin/inperson")
async def admin_inperson(payload: dict, user=Depends(get_current_user)):
    """Mark a member as an in-person client and/or set the gym they train at."""
    _require_admin(user)
    uid = payload.get("user_id")
    target = await db.users.find_one({"user_id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    updates: dict = {}
    if "on" in payload:
        updates["inperson_client"] = bool(payload.get("on"))
        if payload.get("on"):
            updates["inperson_request"] = False
    if "gym" in payload:
        updates["inperson_gym"] = (payload.get("gym") or "").strip()[:60]
    if updates:
        await db.users.update_one({"user_id": uid}, {"$set": updates})
    updated = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    return await _member_brief(updated)


@api_router.get("/admin/members")
async def admin_members(q: str = "", user=Depends(get_current_user)):
    _require_admin(user)
    query = {"is_bot": {"$ne": True}, "is_admin": {"$ne": True}}
    if q.strip():
        query["display_name"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    rows = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(100)
    return {"members": [await _member_brief(r) for r in rows], "badge_options": ADMIN_BADGE_OPTIONS}


@api_router.post("/admin/grant-badge")
async def admin_grant_badge(payload: dict, user=Depends(get_current_user)):
    _require_admin(user)
    uid = payload.get("user_id"); badge = (payload.get("badge") or "").strip()[:40]
    on = payload.get("on", True)
    if not uid or not badge:
        raise HTTPException(status_code=400, detail="user_id and badge required")
    op = {"$addToSet": {"badges": badge}} if on else {"$pull": {"badges": badge}}
    r = await db.users.update_one({"user_id": uid}, op)
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Member not found")
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    return await _member_brief(fresh)


@api_router.post("/admin/verify-member")
async def admin_verify_member(payload: dict, user=Depends(get_current_user)):
    _require_admin(user)
    uid = payload.get("user_id")
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    updates = {}
    for k in ("skool_verified", "email_verified", "phone_verified"):
        if k in payload:
            updates[k] = bool(payload[k])
    if updates:
        await db.users.update_one({"user_id": uid}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    if not fresh:
        raise HTTPException(status_code=404, detail="Member not found")
    return await _member_brief(fresh)


@api_router.post("/admin/founder")
async def admin_set_founder(payload: dict, user=Depends(get_current_user)):
    _require_admin(user)
    uid = payload.get("user_id"); on = bool(payload.get("on", True))
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    await db.users.update_one({"user_id": uid}, {"$set": {"founder_grant": on}})
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    if not fresh:
        raise HTTPException(status_code=404, detail="Member not found")
    return await _member_brief(fresh)


@api_router.post("/admin/enhanced-theme")
async def admin_enhanced_theme(payload: dict, user=Depends(get_current_user)):
    """Admin flips the global RED Enhanced theme on/off for their own account at will."""
    _require_admin(user)
    on = bool(payload.get("on", True))
    upd = {"enhanced": on}
    if on:
        upd["enhanced_since"] = datetime.now(timezone.utc)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
    return {"enhanced": on}


# ---------- Rank control + temporary bans ----------
@api_router.post("/admin/set-rank")
async def admin_set_rank(payload: dict, user=Depends(get_current_user)):
    """Up-rank or de-rank a member by one tier (snaps XP to that rank's floor)."""
    _require_admin(user)
    uid = payload.get("user_id"); direction = payload.get("direction", "up")
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    target = await db.users.find_one({"user_id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    cur_idx = RANK_ORDER.index(rank_from_xp(target.get("xp", 0)))
    if direction == "up":
        new_idx = min(cur_idx + 1, len(RANK_ORDER) - 1)
    elif direction == "down":
        new_idx = max(cur_idx - 1, 0)
    else:
        new_idx = cur_idx
    new_xp = new_idx * LEVELS_PER_RANK * 250
    await db.users.update_one({"user_id": uid}, {"$set": {"xp": new_xp, "level": level_from_xp(new_xp)}})
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    return await _member_brief(fresh)


@api_router.post("/admin/ban")
async def admin_ban(payload: dict, user=Depends(get_current_user)):
    """Temporarily suspend a member. scope: login | chat | all. duration in minutes."""
    _require_admin(user)
    uid = payload.get("user_id")
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    target = await db.users.find_one({"user_id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.get("is_admin"):
        raise HTTPException(status_code=400, detail="Cannot ban an admin")
    scope = payload.get("scope", "all")
    if scope not in ("login", "chat", "all"):
        scope = "all"
    minutes = max(1, int(payload.get("minutes", 60)))
    until = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    await db.users.update_one({"user_id": uid}, {"$set": {
        "banned_until": until, "ban_scope": scope, "ban_reason": (payload.get("reason") or "")[:200],
    }})
    if scope in ("login", "all"):
        await db.user_sessions.delete_many({"user_id": uid})  # force logout
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    return await _member_brief(fresh)


@api_router.post("/admin/unban")
async def admin_unban(payload: dict, user=Depends(get_current_user)):
    _require_admin(user)
    uid = payload.get("user_id")
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    await db.users.update_one({"user_id": uid}, {"$unset": {"banned_until": "", "ban_scope": "", "ban_reason": ""}})
    fresh = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    if not fresh:
        raise HTTPException(status_code=404, detail="Member not found")
    return await _member_brief(fresh)


# ---------- Featured / Spotlight members on Home ----------
@api_router.get("/admin/sms-status")
async def admin_sms_status(user=Depends(get_current_user)):
    _require_admin(user)
    reach = await db.users.count_documents({"is_bot": {"$ne": True}, "phone_verified": True, "phone": {"$nin": [None, ""]}})
    return {"configured": twilio_configured(), "from_number": TWILIO_PHONE_NUMBER if twilio_configured() else "", "reachable": reach}


@api_router.post("/admin/announce")
async def admin_announce(payload: dict, user=Depends(get_current_user)):
    """Broadcast an SMS announcement to every phone-verified member."""
    _require_admin(user)
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message required")
    if len(message) > 1200:
        raise HTTPException(status_code=400, detail="Message too long (max 1200 chars)")
    if not twilio_configured():
        raise HTTPException(status_code=400, detail="Twilio SMS is not configured")
    recips = await db.users.find(
        {"is_bot": {"$ne": True}, "phone_verified": True, "phone": {"$nin": [None, ""]}},
        {"_id": 0, "user_id": 1, "phone": 1},
    ).to_list(5000)
    body = f"{message}\n\n— Hutch's Inner Circle"
    sent, failed = 0, 0
    for r in recips:
        try:
            await send_sms(r["phone"], body)
            sent += 1
        except Exception as e:
            failed += 1
            logger.warning(f"announce SMS failed for {r.get('user_id')}: {e}")
    await db.announcements.insert_one({
        "id": new_id("ann"), "message": message, "sent_by": user["user_id"],
        "sent": sent, "failed": failed, "recipients": len(recips),
        "created_at": datetime.now(timezone.utc),
    })
    return {"sent": sent, "failed": failed, "recipients": len(recips)}


# ---------- Featured / Spotlight members on Home ----------
@api_router.get("/featured")
async def featured_members(user=Depends(get_current_user)):
    rows = await db.featured_members.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    out = []
    for f in rows:
        u = await db.users.find_one({"user_id": f["user_id"]}, {"_id": 0, "password_hash": 0})
        if not u:
            continue
        out.append({
            "user_id": u["user_id"],
            "display_name": u.get("display_name", "Athlete"),
            "avatar_id": u.get("avatar_id", "avatar_white"),
            "sex": u.get("sex", "male"),
            "rank": rank_from_xp(u.get("xp", 0)),
            "level": level_from_xp(u.get("xp", 0)),
            "use_photo": bool(u.get("use_photo")),
            "photo_media_id": u.get("photo_media_id"),
            "reason": f.get("reason", ""),
        })
    return {"featured": out}


@api_router.post("/admin/featured")
async def admin_add_featured(payload: dict, user=Depends(get_current_user)):
    _require_admin(user)
    uid = payload.get("user_id"); reason = (payload.get("reason") or "").strip()[:200]
    if not uid:
        raise HTTPException(status_code=400, detail="user_id required")
    target = await db.users.find_one({"user_id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.featured_members.update_one(
        {"user_id": uid},
        {"$set": {"reason": reason, "added_by": user["user_id"]},
         "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True}


@api_router.delete("/admin/featured/{user_id}")
async def admin_remove_featured(user_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    await db.featured_members.delete_one({"user_id": user_id})
    return {"ok": True}


# ---------- Gym directory management (moderation) ----------
@api_router.get("/admin/gyms")
async def admin_list_gyms(user=Depends(get_current_user)):
    _require_admin(user)
    rows = await db.gyms.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    for r in rows:
        r["members"] = await db.users.count_documents(
            {"inperson_gym": {"$regex": f"^{re.escape(r['name'])}$", "$options": "i"}})
    return {"gyms": rows}


@api_router.post("/admin/gyms")
async def admin_add_gym(payload: dict = Body(default={}), user=Depends(get_current_user)):
    _require_admin(user)
    name = (str((payload or {}).get("name", "")) or "").strip()[:60]
    if not name:
        raise HTTPException(status_code=400, detail="Gym name required")
    await ensure_gym(name)
    return {"ok": True}


@api_router.patch("/admin/gyms/{gym_id}")
async def admin_rename_gym(gym_id: str, payload: dict = Body(default={}), user=Depends(get_current_user)):
    _require_admin(user)
    g = await db.gyms.find_one({"id": gym_id})
    if not g:
        raise HTTPException(status_code=404, detail="Gym not found")
    new_name = (str((payload or {}).get("name", "")) or "").strip()[:60]
    if not new_name:
        raise HTTPException(status_code=400, detail="Gym name required")
    await db.gyms.update_one({"id": gym_id}, {"$set": {"name": new_name, "name_lower": new_name.lower()}})
    # Re-point every member on the old name to the corrected name
    await db.users.update_many(
        {"inperson_gym": {"$regex": f"^{re.escape(g['name'])}$", "$options": "i"}},
        {"$set": {"inperson_gym": new_name}})
    return {"ok": True}


@api_router.delete("/admin/gyms/{gym_id}")
async def admin_delete_gym(gym_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    g = await db.gyms.find_one({"id": gym_id})
    if not g:
        raise HTTPException(status_code=404, detail="Gym not found")
    await db.gyms.delete_one({"id": gym_id})
    # Clear the (fake) gym from any members who selected it
    await db.users.update_many(
        {"inperson_gym": {"$regex": f"^{re.escape(g['name'])}$", "$options": "i"}},
        {"$set": {"inperson_gym": "", "inperson_request": False}})
    return {"ok": True}
