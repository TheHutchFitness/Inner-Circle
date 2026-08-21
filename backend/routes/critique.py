# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403

# The PR Room and Form Lab are structurally identical "critique rooms": members
# upload a photo/video of a lift (+ exercise/weight/reps/bodyweight), an AI coach
# critiques it, and other members like & comment. One collection, keyed by `room`.

CRITIQUE_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
CRITIQUE_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
_C_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
          "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"}
MAX_CRITIQUE_IMG = 15 * 1024 * 1024
MAX_CRITIQUE_VID = 80 * 1024 * 1024

_PR_SYSTEM = (
    "You are 'Coach', a savage-but-fair world-class powerlifting and strength coach. A lifter is "
    "sharing a personal record (PR). Give an honest coaching critique. Return ONLY a single valid "
    "JSON object, no markdown, with EXACTLY these keys: "
    '{"call": string, "form": string, "programming": string, "level": string}. '
    '"call" is a punchy one-line verdict on the lift (mention relative strength vs bodyweight when '
    'numbers are given). "form" is 2-4 sentences on technique — if a PHOTO is provided, critique '
    "what you can see (bar path, positions, bracing); if only lift details are provided (video), give "
    "the key technique cues for this exact lift. "
    '"programming" is 2-3 sentences on how to keep progressing this lift. '
    '"level" is one short label like "Novice", "Intermediate", "Advanced", or "Elite" based on the '
    "numbers relative to bodyweight. Be specific, use real coaching language, never generic."
)

_FORM_SYSTEM = (
    "You are 'Coach', a world-class strength & technique coach running a form-check lab. A lifter is "
    "asking for a critique of their technique. Return ONLY a single valid JSON object, no markdown, "
    'with EXACTLY these keys: {"call": string, "form": string, "programming": string, "level": string}. '
    '"call" is a punchy one-line overall verdict on their form. "form" is 3-5 sentences breaking down '
    "technique faults and exactly how to fix them — if a PHOTO is provided, critique the positions you "
    "can see; if only details are provided (video), give the highest-value cues and common faults for "
    'this lift. "programming" is 2-3 sentences of drills/cues to groove the fix. "level" is one short '
    'label like "Needs work", "Solid", or "Dialed in". Be specific and actionable, never generic.'
)

_ROOMS = {
    "pr": {"system": _PR_SYSTEM, "prefix": "pr"},
    "form": {"system": _FORM_SYSTEM, "prefix": "form"},
}


def _room_or_404(room: str):
    cfg = _ROOMS.get(room)
    if not cfg:
        raise HTTPException(status_code=404, detail="Unknown room")
    return cfg


def _parse_critique_json(text: str):
    import json as _json, re as _re
    m = _re.search(r"\{.*\}", text or "", _re.DOTALL)
    if not m:
        return None
    try:
        d = _json.loads(m.group(0))
    except Exception:
        return None
    return {
        "call": str(d.get("call", ""))[:200],
        "form": str(d.get("form", ""))[:900],
        "programming": str(d.get("programming", ""))[:600],
        "level": str(d.get("level", ""))[:40],
    }


class CritiqueComment(BaseModel):
    text: str


@api_router.post("/rooms/{room}/submit")
async def critique_submit(
    room: str,
    file: UploadFile = File(...),
    exercise: str = Form(""),
    weight: str = Form(""),
    reps: str = Form(""),
    bodyweight: str = Form(""),
    caption: Optional[str] = Form(None),
    user=Depends(get_current_user),
):
    import base64
    cfg = _room_or_404(room)
    if not (user.get("email_verified") or user.get("phone_verified")):
        raise HTTPException(status_code=403, detail="Verify your email or phone to post")
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct in CRITIQUE_IMAGE_TYPES:
        media_type, cap = "image", MAX_CRITIQUE_IMG
    elif ct in CRITIQUE_VIDEO_TYPES:
        media_type, cap = "video", MAX_CRITIQUE_VID
    else:
        raise HTTPException(status_code=400, detail="Upload a JPG/PNG/WEBP photo or MP4/MOV/WEBM video")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > cap:
        raise HTTPException(status_code=400, detail=f"File too large (max {cap // (1024 * 1024)}MB)")
    ext = _C_EXT.get(ct, "bin")
    path = f"{STORAGE_APP_NAME}/{cfg['prefix']}/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        logger.error(f"Critique storage upload failed: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("med")
    await db.chat_media.insert_one({
        "media_id": media_id, "user_id": user["user_id"], "storage_path": path,
        "content_type": ct, "media_type": media_type, "size": len(data),
        "original_name": file.filename, "created_at": datetime.now(timezone.utc),
    })

    # Build the lift details block for the AI.
    lift_bits = []
    if exercise.strip():
        lift_bits.append(f"Lift: {exercise.strip()[:60]}")
    if weight.strip():
        lift_bits.append(f"Weight: {weight.strip()[:30]}")
    if reps.strip():
        lift_bits.append(f"Reps: {reps.strip()[:20]}")
    if bodyweight.strip():
        lift_bits.append(f"Bodyweight: {bodyweight.strip()[:30]}")
    if (caption or "").strip():
        lift_bits.append(f"Note: {caption.strip()[:200]}")
    details = "\n".join(lift_bits) or "No details provided."

    critique = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{cfg['prefix']}_{user['user_id']}_{uuid.uuid4().hex[:6]}",
            system_message=cfg["system"],
        ).with_model("openai", "gpt-5.6-terra")
        if media_type == "image":
            img = ImageContent(image_base64=base64.b64encode(data).decode())
            msg = UserMessage(
                text=f"Critique this lift. Here are the details:\n{details}\n\nReturn only the JSON object.",
                file_contents=[img],
            )
        else:
            msg = UserMessage(
                text=("A video was submitted (you cannot watch it). Coach from these details and give the "
                      f"most important technique cues for this lift:\n{details}\n\nReturn only the JSON object."),
            )
        resp = await chat.send_message(msg)
        critique = _parse_critique_json(resp)
    except Exception:
        logger.exception("Critique AI failed")
        critique = None

    post_id = new_id(cfg["prefix"])
    doc = {
        "post_id": post_id,
        "room": room,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_white"),
        "rank": rank_from_xp(user["xp"]),
        "media_id": media_id,
        "media_type": media_type,
        "exercise": exercise.strip()[:60],
        "weight": weight.strip()[:30],
        "reps": reps.strip()[:20],
        "bodyweight": bodyweight.strip()[:30],
        "caption": (caption or "")[:300],
        "critique": critique,
        "like_count": 0,
        "likes": [],
        "comment_count": 0,
        "founder_backer": user.get("founder_backer", False),
        "created_at": datetime.now(timezone.utc),
    }
    await db.critique_posts.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    doc["liked"] = False
    return doc


@api_router.get("/rooms/{room}/leaderboard")
async def critique_leaderboard(room: str, user=Depends(get_current_user)):
    """Weekly board: most-liked posts in this room over the last 7 days."""
    _room_or_404(room)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    rows = await db.critique_posts.find(
        {"room": room, "created_at": {"$gte": week_ago}}, {"_id": 0, "likes": 0}
    ).sort("like_count", -1).limit(20).to_list(20)
    out = []
    for i, r in enumerate(rows):
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        r["rank_pos"] = i + 1
        out.append(r)
    return out


@api_router.get("/rooms/{room}/feed")
async def critique_feed(room: str, user=Depends(get_current_user)):
    _room_or_404(room)
    rows = await db.critique_posts.find({"room": room}, {"_id": 0}).sort("created_at", -1).limit(60).to_list(60)
    uid = user["user_id"]
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        r["liked"] = uid in (r.get("likes") or [])
        r.pop("likes", None)
    return rows


@api_router.post("/rooms/{room}/{post_id}/like")
async def critique_like(room: str, post_id: str, user=Depends(get_current_user)):
    _room_or_404(room)
    post = await db.critique_posts.find_one({"post_id": post_id, "room": room}, {"_id": 0, "likes": 1})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    uid = user["user_id"]
    liked = uid in (post.get("likes") or [])
    if liked:
        await db.critique_posts.update_one({"post_id": post_id}, {"$pull": {"likes": uid}, "$inc": {"like_count": -1}})
    else:
        await db.critique_posts.update_one({"post_id": post_id}, {"$addToSet": {"likes": uid}, "$inc": {"like_count": 1}})
    fresh = await db.critique_posts.find_one({"post_id": post_id}, {"_id": 0, "like_count": 1})
    return {"liked": not liked, "like_count": max(0, (fresh or {}).get("like_count", 0))}


@api_router.get("/rooms/{room}/{post_id}/comments")
async def critique_comments(room: str, post_id: str, user=Depends(get_current_user)):
    _room_or_404(room)
    rows = await db.critique_comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1).to_list(400)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/rooms/{room}/{post_id}/comments")
async def critique_comment_add(room: str, post_id: str, inp: CritiqueComment, user=Depends(get_current_user)):
    _room_or_404(room)
    post = await db.critique_posts.find_one({"post_id": post_id, "room": room}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment is empty")
    doc = {
        "comment_id": new_id("cc"),
        "post_id": post_id,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_white"),
        "rank": rank_from_xp(user["xp"]),
        "text": text[:500],
        "founder_backer": user.get("founder_backer", False),
        "created_at": datetime.now(timezone.utc),
    }
    await db.critique_comments.insert_one(doc)
    await db.critique_posts.update_one({"post_id": post_id}, {"$inc": {"comment_count": 1}})
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.delete("/rooms/{room}/{post_id}/comments/{comment_id}")
async def critique_comment_delete(room: str, post_id: str, comment_id: str, user=Depends(get_current_user)):
    _room_or_404(room)
    c = await db.critique_comments.find_one({"comment_id": comment_id, "post_id": post_id})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not user.get("is_admin") and c.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.critique_comments.delete_one({"comment_id": comment_id})
    await db.critique_posts.update_one(
        {"post_id": post_id, "comment_count": {"$gt": 0}}, {"$inc": {"comment_count": -1}}
    )
    return {"ok": True}


@api_router.delete("/rooms/{room}/{post_id}")
async def critique_post_delete(room: str, post_id: str, user=Depends(get_current_user)):
    _room_or_404(room)
    post = await db.critique_posts.find_one({"post_id": post_id, "room": room})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not user.get("is_admin") and post.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.critique_posts.delete_one({"post_id": post_id})
    await db.critique_comments.delete_many({"post_id": post_id})
    return {"ok": True}
