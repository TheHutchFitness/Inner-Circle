# ruff: noqa: F403, F405
import hashlib
import hmac
import secrets
import time

from shared import *  # noqa: F401,F403


# ---------- Chat ----------
@api_router.get("/chat/{room}/messages")
async def get_messages(room: str, user=Depends(get_current_user)):
    if room not in ("main", "the_room", "gym") and not room.startswith("group:"):
        raise HTTPException(status_code=400, detail="Invalid room")
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak") and not user.get("all_rooms_access"):
        raise HTTPException(status_code=403, detail="The Room requires Elite rank")
    store_room = room
    if room == "gym":
        gym = (user.get("inperson_gym") or "").strip()
        if not gym:
            raise HTTPException(status_code=403, detail="Set your gym in Profile to join its chat")
        store_room = f"gym:{gym.lower()}"
    if room.startswith("group:"):
        g = await db.groups.find_one({"id": room.split(":", 1)[1]})
        if not g or user["user_id"] not in g.get("members", []):
            raise HTTPException(status_code=403, detail="Members only")
    rows = await db.chat_messages.find({"room": store_room}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    rows.reverse()
    # Backer status can change after a message is posted — reflect current status on read
    sender_ids = list({r.get("user_id") for r in rows if r.get("user_id")})
    backers = set()
    profiles = {}
    if sender_ids:
        async for u in db.users.find(
            {"user_id": {"$in": sender_ids}},
            {"user_id": 1, "founder_backer": 1, "photo_media_id": 1, "use_photo": 1, "loadout": 1, "avatar_id": 1, "equipped_skin": 1, "equipped_weapon": 1, "equipped_hair": 1, "equipped_beard": 1, "sex": 1, "xp": 1, "created_at": 1, "is_bot": 1, "is_admin": 1, "email": 1},
        ):
            if u.get("founder_backer"):
                backers.add(u["user_id"])
            fs = await founder_status(u)
            profiles[u["user_id"]] = {
                "photo_media_id": u.get("photo_media_id"),
                "use_photo": bool(u.get("use_photo")),
                "loadout": _clean_loadout(u),
                "avatar_id": u.get("avatar_id"),
                "equipped_skin": u.get("equipped_skin"),
                "equipped_weapon": u.get("equipped_weapon"),
                "equipped_hair": u.get("equipped_hair"),
                "equipped_beard": u.get("equipped_beard"),
                "sex": u.get("sex"),
                "level": level_from_xp(u.get("xp", 0)),
                "founder_number": fs.get("founder_number") if fs.get("is_founder") else None,
            }
    # In a clan (group) room, tag each sender with their role + the clan's colour.
    clan_creator = None
    clan_color = None
    clan_officers = set()
    if room.startswith("group:"):
        gc = await db.groups.find_one({"id": room.split(":", 1)[1]}, {"_id": 0, "creator_id": 1, "color": 1, "officers": 1})
        if gc:
            clan_creator = gc.get("creator_id")
            clan_color = gc.get("color")
            clan_officers = set(gc.get("officers", []) or [])
    for r in rows:
        r["founder_backer"] = r.get("user_id") in backers
        p = profiles.get(r.get("user_id"))
        if p:
            r["photo_media_id"] = p["photo_media_id"]
            r["use_photo"] = p["use_photo"]
            r["loadout"] = p["loadout"]
            r["equipped_skin"] = p.get("equipped_skin")
            r["equipped_weapon"] = p.get("equipped_weapon")
            r["equipped_hair"] = p.get("equipped_hair")
            r["equipped_beard"] = p.get("equipped_beard")
            r["level"] = p.get("level", 1)
            r["founder_number"] = p.get("founder_number")
            if p.get("sex"):
                r["sex"] = p["sex"]
            if p.get("avatar_id"):
                r["avatar_id"] = p["avatar_id"]
        if clan_creator is not None:
            r["clan_role"] = "leader" if r.get("user_id") == clan_creator else ("officer" if r.get("user_id") in clan_officers else "member")
            r["clan_color"] = clan_color
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/chat/{room}/messages")
async def post_message(room: str, inp: ChatMessageIn, user=Depends(get_current_user)):
    if room not in ("main", "the_room", "gym") and not room.startswith("group:"):
        raise HTTPException(status_code=400, detail="Invalid room")
    b = ban_state(user)
    if b and b["scope"] in ("chat", "all"):
        until = b["until"].strftime("%b %d, %H:%M UTC")
        raise HTTPException(status_code=403, detail=f"You're muted in chat until {until}." + (f" Reason: {b['reason']}" if b['reason'] else ""))
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak") and not user.get("all_rooms_access"):
        raise HTTPException(status_code=403, detail="The Room requires Elite rank")
    store_room = room
    if room == "gym":
        gym = (user.get("inperson_gym") or "").strip()
        if not gym:
            raise HTTPException(status_code=403, detail="Set your gym in Profile to join its chat")
        store_room = f"gym:{gym.lower()}"
    if room.startswith("group:"):
        g = await db.groups.find_one({"id": room.split(":", 1)[1]})
        if not g or user["user_id"] not in g.get("members", []):
            raise HTTPException(status_code=403, detail="Members only")
    text = (inp.text or "").strip()
    media = None
    if inp.media_id:
        media = await db.chat_media.find_one({"media_id": inp.media_id, "user_id": user["user_id"]}, {"_id": 0})
        if not media:
            raise HTTPException(status_code=400, detail="Invalid media attachment")
    if not text and not media:
        raise HTTPException(status_code=400, detail="Message is empty")
    _fs = await founder_status(user)
    msg = {
        "message_id": new_id("msg"),
        "room": store_room,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_white"),
        "equipped_skin": user.get("equipped_skin"),
        "equipped_weapon": user.get("equipped_weapon"),
        "equipped_hair": user.get("equipped_hair"),
        "equipped_beard": user.get("equipped_beard"),
        "sex": user.get("sex", "male"),
        "rank": rank_from_xp(user["xp"]),
        "level": level_from_xp(user.get("xp", 0)),
        "founder_number": _fs.get("founder_number") if _fs.get("is_founder") else None,
        "skool_verified": user.get("skool_verified", False),
        "founder_backer": user.get("founder_backer", False),        "text": text[:500],
        "media_id": media["media_id"] if media else None,
        "media_type": media["media_type"] if media else None,
        "created_at": datetime.now(timezone.utc),
    }
    if room.startswith("group:"):
        gc = await db.groups.find_one({"id": room.split(":", 1)[1]}, {"_id": 0, "creator_id": 1, "color": 1, "officers": 1})
        if gc:
            msg["clan_role"] = ("leader" if user["user_id"] == gc.get("creator_id")
                                else "officer" if user["user_id"] in (gc.get("officers", []) or [])
                                else "member")
            msg["clan_color"] = gc.get("color")
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    msg["created_at"] = msg["created_at"].isoformat()
    return msg


async def _resolve_store_room(room: str, user):
    """Map a public room id to its stored room key, enforcing access."""
    if room not in ("main", "the_room", "gym") and not room.startswith("group:"):
        raise HTTPException(status_code=400, detail="Invalid room")
    store_room = room
    if room == "gym":
        gym = (user.get("inperson_gym") or "").strip()
        if not gym:
            raise HTTPException(status_code=403, detail="Set your gym in Profile to join its chat")
        store_room = f"gym:{gym.lower()}"
    if room.startswith("group:"):
        g = await db.groups.find_one({"id": room.split(":", 1)[1]})
        if not g or user["user_id"] not in g.get("members", []):
            raise HTTPException(status_code=403, detail="Members only")
    return store_room


@api_router.get("/chat/{room}/pin")
async def get_pin(room: str, user=Depends(get_current_user)):
    """The pinned welcome/rules message for a room (or null)."""
    store_room = await _resolve_store_room(room, user)
    p = await db.chat_pins.find_one({"room": store_room}, {"_id": 0})
    if not p or not (p.get("text") or "").strip():
        return {"pin": None}
    return {"pin": {"text": p["text"], "at": p.get("at").isoformat() if isinstance(p.get("at"), datetime) else p.get("at")}}


@api_router.post("/chat/{room}/pin")
async def set_pin(room: str, inp: ChatMessageIn, user=Depends(get_current_user)):
    """Admin: pin (or, with empty text, unpin) a message to the top of a room."""
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admins only")
    store_room = await _resolve_store_room(room, user)
    text = (inp.text or "").strip()[:500]
    if not text:
        await db.chat_pins.delete_one({"room": store_room})
        return {"pin": None}
    await db.chat_pins.update_one(
        {"room": store_room},
        {"$set": {"room": store_room, "text": text, "at": datetime.now(timezone.utc), "by": user["user_id"]}},
        upsert=True,
    )
    return {"pin": {"text": text}}


@api_router.post("/chat/{room}/clear")
async def clear_room(room: str, user=Depends(get_current_user)):
    """Admin: wipe every message in a room."""
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admins only")
    store_room = await _resolve_store_room(room, user)
    res = await db.chat_messages.delete_many({"room": store_room})
    return {"deleted": res.deleted_count}


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


# Media stored under these path segments is shown broadly across the app
# (profile photos, gym logos, exercise demos, legal docs) and is safe for any
# authenticated member to fetch. Everything else is access-controlled.
PUBLIC_MEDIA_SEGMENTS = ("/pfp/", "/gym-logo/", "/exercise_demos/", "/legal/")


def _store_room_ok(store_room: str, u: dict) -> bool:
    """Whether user u may read messages (and thus media) in a stored room key."""
    if not store_room:
        return False
    if store_room == "main":
        return True
    if store_room == "the_room":
        return rank_from_xp(u.get("xp", 0)) in ("Elite", "Freak") or bool(u.get("all_rooms_access"))
    if store_room.startswith("gym:"):
        return (u.get("inperson_gym") or "").strip().lower() == store_room.split(":", 1)[1]
    return False  # group:* handled separately (needs a DB lookup)


async def _authorize_media(rec: dict, u: dict) -> bool:
    path = rec.get("storage_path", "") or ""
    if any(seg in path for seg in PUBLIC_MEDIA_SEGMENTS):
        return True
    if rec.get("user_id") == u["user_id"]:  # uploader / owner (incl. own program & check-ins)
        return True
    if u.get("is_admin"):  # coach/admin delivers & reviews private files
        return True
    media_id = rec["media_id"]
    # Referenced in a chat message in a room this user can access?
    msg = await db.chat_messages.find_one({"media_id": media_id}, {"_id": 0, "room": 1})
    if msg:
        room = msg.get("room", "")
        if room.startswith("group:"):
            g = await db.groups.find_one({"id": room.split(":", 1)[1]}, {"_id": 0, "members": 1})
            if g and u["user_id"] in g.get("members", []):
                return True
        elif _store_room_ok(room, u):
            return True
    # Referenced in a 1-on-1 in-person thread this user owns?
    im = await db.inperson_messages.find_one({"media_id": media_id}, {"_id": 0, "client_id": 1})
    if im and im.get("client_id") == u["user_id"]:
        return True
    return False


@api_router.get("/chat/media/{media_id}")
async def chat_media_get(media_id: str, token: Optional[str] = None, t: Optional[str] = None,
                         authorization: Optional[str] = Header(None)):
    rec = await db.chat_media.find_one({"media_id": media_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    # Preferred path: short-lived signed ticket (keeps long-lived session tokens out of URLs).
    if t:
        if not _verify_media_ticket(media_id, t):
            raise HTTPException(status_code=401, detail="Invalid or expired link")
    else:
        # Fallback: Bearer header (native) or ?token= query, then per-request authorization.
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
        u = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
        if not u:
            raise HTTPException(status_code=401, detail="Invalid session")
        if not await _authorize_media(rec, u):
            raise HTTPException(status_code=403, detail="Not authorized to view this file")
    try:
        content = await storage_get(rec["storage_path"])
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Media unavailable")
    return Response(content=content, media_type=rec["content_type"],
                    headers={"Cache-Control": "private, max-age=86400"})


# ---- Short-lived signed media tickets (for browser <a>/download links) ----
# A stable secret must come from the environment. If it is somehow unset we fall
# back to a per-process random key (never a source-code literal), so tickets can
# never be forged with a known constant — worst case they simply stop validating
# after a restart, which is safe for 120s tickets.
_MEDIA_TICKET_SECRET = (
    os.environ.get("MEDIA_TICKET_SECRET")
    or os.environ.get("AUTH_THROTTLE_SECRET")
    or secrets.token_urlsafe(48)
).encode()


def _sign_media_ticket(media_id: str, exp: int) -> str:
    mac = hmac.new(_MEDIA_TICKET_SECRET, f"{media_id}:{exp}".encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{mac}"


def _verify_media_ticket(media_id: str, ticket: str) -> bool:
    try:
        exp_str, mac = ticket.split(".", 1)
        exp = int(exp_str)
    except (ValueError, AttributeError):
        return False
    if exp < int(time.time()):
        return False
    expected = hmac.new(_MEDIA_TICKET_SECRET, f"{media_id}:{exp}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, mac)


@api_router.post("/chat/media-ticket")
async def chat_media_ticket(inp: ChatMessageIn, user=Depends(get_current_user)):
    """Issue a ~2-minute signed URL for a media file the caller is authorized to view.
    Used for browser download links so the long-lived session token never enters a URL."""
    media_id = (inp.media_id or "").strip()
    if not media_id:
        raise HTTPException(status_code=400, detail="media_id required")
    rec = await db.chat_media.find_one({"media_id": media_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    if not await _authorize_media(rec, user):
        raise HTTPException(status_code=403, detail="Not authorized to view this file")
    exp = int(time.time()) + 120
    return {"media_id": media_id, "ticket": _sign_media_ticket(media_id, exp), "expires_in": 120}
