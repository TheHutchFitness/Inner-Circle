# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


# ---------- Profile ----------
@api_router.get("/profile/me")
async def profile_me(user=Depends(get_current_user)):
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    return user


@api_router.get("/profile/attributes")
async def profile_attributes(user=Depends(get_current_user)):
    return await _compute_attributes(user)


@api_router.get("/profile/gym-rank")
async def gym_rank(user=Depends(get_current_user)):
    """The caller's rank (by Big-4 total) among athletes at their own gym."""
    gym = (user.get("inperson_gym", "") or "").strip()
    if not gym:
        return {"gym": "", "rank": 0, "members": 0, "big4": 0}
    gl = gym.lower()
    rows = await db.users.find(
        {"is_admin": {"$ne": True}}, {"_id": 0, "prs": 1, "inperson_gym": 1, "user_id": 1}
    ).to_list(3000)
    members = [m for m in rows if ((m.get("inperson_gym", "") or "").strip().lower() == gl)]

    def tot(m):
        return sum((m.get("prs", {}) or {}).values())

    members.sort(key=tot, reverse=True)
    rank = next((i + 1 for i, m in enumerate(members) if m["user_id"] == user["user_id"]), 0)
    return {"gym": gym, "rank": rank, "members": len(members), "big4": tot(user)}


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
    if "social_tiktok" in update:
        update["social_tiktok"] = social_handle(update["social_tiktok"])
    if "social_instagram" in update:
        update["social_instagram"] = social_handle(update["social_instagram"])
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
    if inp.code.strip().upper() != SKOOL_CODE.upper():
        raise HTTPException(status_code=400, detail="Invalid Skool verification code")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"skool_verified": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


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
    """Distinct gym names members have entered, for the signup/profile dropdown.
    Public (no auth) so the signup screen can populate it before login."""
    names = await db.users.distinct("inperson_gym")
    return {"gyms": sorted([n for n in names if n and n.strip()])}


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
    return {
        "user_id": u["user_id"],
        "display_name": u.get("display_name", "Athlete"),
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
        "workouts_logged": u.get("workouts_logged", 0),
        "badges_count": len(u.get("badges", []) or []),
        "loadout": _clean_loadout(u),
        "photo_media_id": u.get("photo_media_id"),
        "use_photo": bool(u.get("use_photo")),
        "active_frame": u.get("active_frame"),
        "social_tiktok": tt,
        "social_instagram": ig,
        "is_creator": bool(tt or ig),
        "equipped_pet": u.get("equipped_pet"),
        "equipped_skin": u.get("equipped_skin"),
        "equipped_weapon": u.get("equipped_weapon"),
        "equipped_hair": u.get("equipped_hair"),
        "equipped_beard": u.get("equipped_beard"),
        "season_champ_titles": await season_titles_for(u["user_id"]),
    }
