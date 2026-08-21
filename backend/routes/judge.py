# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.post("/judge/submit")
async def judge_submit(file: UploadFile = File(...), caption: Optional[str] = Form(None),
                       user=Depends(get_current_user)):
    import base64
    if not (user.get("email_verified") or user.get("phone_verified")):
        raise HTTPException(status_code=403, detail="Verify your email or phone to submit to The Judge")
    await ai_daily_cap(user, "judge_submit")
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct not in JUDGE_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPEG, PNG, or WEBP photo")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_JUDGE_BYTES:
        raise HTTPException(status_code=400, detail="Photo too large (max 15MB)")
    ext = _EXT_MAP.get(ct, "jpg")
    path = f"{STORAGE_APP_NAME}/judge/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        logger.error(f"Judge storage upload failed: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("med")
    await db.chat_media.insert_one({
        "media_id": media_id, "user_id": user["user_id"], "storage_path": path,
        "content_type": ct, "media_type": "image", "size": len(data),
        "original_name": file.filename, "created_at": datetime.now(timezone.utc),
    })

    critique = None
    ai_allowed = user.get("is_admin") or await ai_globally_enabled()
    if ai_allowed:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"judge_{user['user_id']}_{uuid.uuid4().hex[:6]}",
                system_message=JUDGE_SYSTEM,
            ).with_model("openai", "gpt-5.6-terra")
            img = ImageContent(image_base64=base64.b64encode(data).decode())
            resp = await chat.send_message(UserMessage(
                text="Judge this physique. Return only the JSON object.",
                file_contents=[img],
            ))
            critique = _parse_judge_json(resp)
            await mark_ai_ok()
        except Exception:
            logger.exception("Judge AI critique failed")
            critique = None
            await mark_ai_outage("judge")

    sub_id = new_id("judge")
    doc = {
        "submission_id": sub_id,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_white"),
        "rank": rank_from_xp(user["xp"]),
        "media_id": media_id,
        "caption": (caption or "")[:300],
        "critique": critique,
        "comment_count": 0,
        "founder_backer": user.get("founder_backer", False),
        "created_at": datetime.now(timezone.utc),
    }
    await db.judge_submissions.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.get("/judge/feed")
async def judge_feed(user=Depends(get_current_user)):
    rows = await db.judge_submissions.find({}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.get("/judge/my-history")
async def judge_my_history(user=Depends(get_current_user)):
    rows = await db.judge_submissions.find(
        {"user_id": user["user_id"], "critique.overall": {"$gt": 0}}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    out = []
    for r in rows:
        c = r.get("critique") or {}
        ts = r.get("created_at")
        out.append({
            "submission_id": r["submission_id"],
            "media_id": r.get("media_id"),
            "overall": c.get("overall", 0),
            "symmetry": c.get("symmetry", 0),
            "conditioning": c.get("conditioning", 0),
            "size": c.get("size", 0),
            "posing": c.get("posing", 0),
            "created_at": ts.isoformat() if isinstance(ts, datetime) else ts,
        })
    best = max((r["overall"] for r in out), default=0)
    return {"history": out, "best": best, "count": len(out)}


@api_router.get("/judge/leaderboard")
async def judge_leaderboard(user=Depends(get_current_user)):
    """Top-scored physiques from the last 7 days."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    rows = await db.judge_submissions.find(
        {"created_at": {"$gte": week_ago}, "critique.overall": {"$gt": 0}}, {"_id": 0}
    ).to_list(500)
    rows.sort(key=lambda r: (r.get("critique") or {}).get("overall", 0), reverse=True)
    top = []
    for i, r in enumerate(rows[:20]):
        c = r.get("critique") or {}
        top.append({
            "rank_pos": i + 1,
            "submission_id": r["submission_id"],
            "display_name": r.get("display_name", "Athlete"),
            "avatar_id": r.get("avatar_id", "avatar_white"),
            "rank": r.get("rank", "Beginner"),
            "media_id": r.get("media_id"),
            "overall": c.get("overall", 0),
            "founder_backer": r.get("founder_backer", False),
            "user_id": r.get("user_id"),
        })
    return top


@api_router.get("/judge/{submission_id}/comments")
async def judge_comments(submission_id: str, user=Depends(get_current_user)):
    uid = user["user_id"]
    rows = await db.judge_comments.find({"submission_id": submission_id}, {"_id": 0}).sort("created_at", 1).to_list(300)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        r["like_count"] = int(r.get("like_count", 0) or 0)
        r["liked"] = uid in (r.get("likes") or [])
        r.pop("likes", None)
    return rows


@api_router.post("/judge/{submission_id}/comments")
async def judge_comment_add(submission_id: str, inp: JudgeComment, user=Depends(get_current_user)):
    sub = await db.judge_submissions.find_one({"submission_id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment is empty")
    doc = {
        "comment_id": new_id("jc"),
        "submission_id": submission_id,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_white"),
        "rank": rank_from_xp(user["xp"]),
        "text": text[:500],
        "founder_backer": user.get("founder_backer", False),
        "likes": [],
        "like_count": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.judge_comments.insert_one(doc)
    await db.judge_submissions.update_one({"submission_id": submission_id}, {"$inc": {"comment_count": 1}})
    # Reward leaving a critique on someone else's physique (daily-capped).
    awarded = 0
    if sub.get("user_id") != user["user_id"]:
        awarded = await reward_peer_critique(user["user_id"])
    doc.pop("_id", None)
    doc.pop("likes", None)
    doc["liked"] = False
    doc["created_at"] = doc["created_at"].isoformat()
    doc["awarded_xp"] = awarded
    return doc


@api_router.post("/judge/{submission_id}/comments/{comment_id}/like")
async def judge_comment_like(submission_id: str, comment_id: str, user=Depends(get_current_user)):
    uid = user["user_id"]
    c = await db.judge_comments.find_one({"comment_id": comment_id, "submission_id": submission_id}, {"_id": 0, "likes": 1, "user_id": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    liked = uid in (c.get("likes") or [])
    if liked:
        await db.judge_comments.update_one({"comment_id": comment_id}, {"$pull": {"likes": uid}, "$inc": {"like_count": -1}})
        if c.get("user_id") != uid:
            await remove_critic_like(c["user_id"], uid, comment_id)
    else:
        await db.judge_comments.update_one({"comment_id": comment_id}, {"$addToSet": {"likes": uid}, "$inc": {"like_count": 1}})
        if c.get("user_id") != uid:
            await add_critic_like(c["user_id"], uid, user.get("display_name", "Someone"), comment_id)
    fresh = await db.judge_comments.find_one({"comment_id": comment_id}, {"_id": 0, "like_count": 1})
    return {"liked": not liked, "like_count": max(0, (fresh or {}).get("like_count", 0))}


@api_router.delete("/judge/{submission_id}/comments/{comment_id}")
async def judge_comment_delete(submission_id: str, comment_id: str, user=Depends(get_current_user)):
    """Admin (or the comment's author) can remove a Judge comment."""
    c = await db.judge_comments.find_one({"comment_id": comment_id, "submission_id": submission_id})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not user.get("is_admin") and c.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.judge_comments.delete_one({"comment_id": comment_id})
    await db.judge_submissions.update_one(
        {"submission_id": submission_id, "comment_count": {"$gt": 0}}, {"$inc": {"comment_count": -1}}
    )
    return {"ok": True}


@api_router.delete("/judge/{submission_id}")
async def judge_submission_delete(submission_id: str, user=Depends(get_current_user)):
    """A member (or admin) can remove their own Judge submission + its comments."""
    sub = await db.judge_submissions.find_one({"submission_id": submission_id})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if not user.get("is_admin") and sub.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.judge_submissions.delete_one({"submission_id": submission_id})
    await db.judge_comments.delete_many({"submission_id": submission_id})
    return {"ok": True}


@api_router.patch("/judge/{submission_id}/comments/{comment_id}")
async def judge_comment_edit(submission_id: str, comment_id: str, inp: JudgeComment, user=Depends(get_current_user)):
    """Author (or admin) can edit their Judge comment ONCE."""
    c = await db.judge_comments.find_one({"comment_id": comment_id, "submission_id": submission_id})
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not user.get("is_admin") and c.get("user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    if c.get("edited") and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="You can only edit a comment once.")
    text = (inp.text or "").strip()[:500]
    if not text:
        raise HTTPException(status_code=400, detail="Comment cannot be empty.")
    await db.judge_comments.update_one(
        {"comment_id": comment_id},
        {"$set": {"text": text, "edited": True, "edited_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "text": text, "edited": True}

