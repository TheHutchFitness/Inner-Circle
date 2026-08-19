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
        out.append(brief)
    out.sort(key=lambda x: (x["last_message"]["created_at"] if x["last_message"] else ""), reverse=True)
    return out


def _require_admin_ip(user):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")


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
    return {
        "client": await _person_brief(cid),
        "messages": [_msg_public(m) for m in msgs],
        "programs": programs,
        "is_admin": _is_admin(user),
    }


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
    return prog


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
        return {"unread": n, "role": "admin"}
    if user.get("inperson_client"):
        n = await db.inperson_messages.count_documents(
            {"client_id": user["user_id"], "sender_role": "admin", "read_by_client": {"$ne": True}})
        return {"unread": n, "role": "client"}
    return {"unread": 0, "role": "none"}
