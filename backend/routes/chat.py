# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


# ---------- Chat ----------
@api_router.get("/chat/{room}/messages")
async def get_messages(room: str, user=Depends(get_current_user)):
    if room not in ("main", "the_room"):
        raise HTTPException(status_code=400, detail="Invalid room")
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak") and not user.get("all_rooms_access"):
        raise HTTPException(status_code=403, detail="The Room requires Elite rank")
    rows = await db.chat_messages.find({"room": room}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    rows.reverse()
    # Backer status can change after a message is posted — reflect current status on read
    sender_ids = list({r.get("user_id") for r in rows if r.get("user_id")})
    backers = set()
    profiles = {}
    if sender_ids:
        async for u in db.users.find(
            {"user_id": {"$in": sender_ids}},
            {"user_id": 1, "founder_backer": 1, "photo_media_id": 1, "use_photo": 1, "loadout": 1, "avatar_id": 1},
        ):
            if u.get("founder_backer"):
                backers.add(u["user_id"])
            profiles[u["user_id"]] = {
                "photo_media_id": u.get("photo_media_id"),
                "use_photo": bool(u.get("use_photo")),
                "loadout": _clean_loadout(u),
                "avatar_id": u.get("avatar_id"),
            }
    for r in rows:
        r["founder_backer"] = r.get("user_id") in backers
        p = profiles.get(r.get("user_id"))
        if p:
            r["photo_media_id"] = p["photo_media_id"]
            r["use_photo"] = p["use_photo"]
            r["loadout"] = p["loadout"]
            if p.get("avatar_id"):
                r["avatar_id"] = p["avatar_id"]
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/chat/{room}/messages")
async def post_message(room: str, inp: ChatMessageIn, user=Depends(get_current_user)):
    if room not in ("main", "the_room"):
        raise HTTPException(status_code=400, detail="Invalid room")
    b = ban_state(user)
    if b and b["scope"] in ("chat", "all"):
        until = b["until"].strftime("%b %d, %H:%M UTC")
        raise HTTPException(status_code=403, detail=f"You're muted in chat until {until}." + (f" Reason: {b['reason']}" if b['reason'] else ""))
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak") and not user.get("all_rooms_access"):
        raise HTTPException(status_code=403, detail="The Room requires Elite rank")
    text = (inp.text or "").strip()
    media = None
    if inp.media_id:
        media = await db.chat_media.find_one({"media_id": inp.media_id, "user_id": user["user_id"]}, {"_id": 0})
        if not media:
            raise HTTPException(status_code=400, detail="Invalid media attachment")
    if not text and not media:
        raise HTTPException(status_code=400, detail="Message is empty")
    msg = {
        "message_id": new_id("msg"),
        "room": room,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_ronin"),
        "rank": rank_from_xp(user["xp"]),
        "skool_verified": user.get("skool_verified", False),
        "founder_backer": user.get("founder_backer", False),
        "text": text[:500],
        "media_id": media["media_id"] if media else None,
        "media_type": media["media_type"] if media else None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    msg["created_at"] = msg["created_at"].isoformat()
    return msg


@api_router.post("/chat/upload")
async def chat_upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    if not (user.get("email_verified") or user.get("phone_verified")):
        raise HTTPException(status_code=403, detail="Verify your email or phone to share media")
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct in ALLOWED_IMAGE_TYPES:
        media_type, cap = "image", MAX_IMAGE_BYTES
    elif ct in ALLOWED_VIDEO_TYPES:
        media_type, cap = "video", MAX_VIDEO_BYTES
    else:
        raise HTTPException(status_code=400, detail="Only photos and videos are allowed")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > cap:
        limit_mb = cap // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File too large (max {limit_mb}MB). Videos are capped at 1 minute.")
    ext = _EXT_MAP.get(ct, "bin")
    path = f"{STORAGE_APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        logger.error(f"Storage upload failed: {e.response.status_code} {e.response.text[:200]}")
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
    return {"media_id": media_id, "media_type": media_type}


@api_router.get("/chat/media/{media_id}")
async def chat_media_get(media_id: str, token: Optional[str] = None,
                         authorization: Optional[str] = Header(None)):
    # Auth via Bearer header (native) or ?token= query (web <img>/<video> tags)
    tok = None
    if authorization and authorization.startswith("Bearer "):
        tok = authorization.split(" ", 1)[1]
    elif token:
        tok = token
    if not tok:
        raise HTTPException(status_code=401, detail="Missing token")
    session = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    rec = await db.chat_media.find_one({"media_id": media_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        content = await storage_get(rec["storage_path"])
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Media unavailable")
    return Response(content=content, media_type=rec["content_type"],
                    headers={"Cache-Control": "private, max-age=86400"})
