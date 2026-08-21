# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.post("/coach/grant-item")
async def coach_grant_item(inp: GrantItemIn, user=Depends(get_current_user)):
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    if inp.item_id not in _COSMETIC_BY_ID:
        raise HTTPException(status_code=400, detail="Unknown item")
    target = await db.users.find_one({"user_id": inp.user_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    await db.users.update_one({"user_id": inp.user_id}, {"$addToSet": {"granted_items": inp.item_id}})
    return {"ok": True}


@api_router.get("/coach/sales")
async def coach_sales(user=Depends(get_current_user)):
    """Owner-only: total orders + revenue, broken down by month and product."""
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    PRICES = {CUSTOM_PROGRAM_ENTITLEMENT: 200.0, BACKER_ENTITLEMENT: 25.0}
    rows = await db.verified_purchases.find({"revoked": {"$ne": True}}, {"_id": 0}).to_list(5000)
    by_month: dict = {}
    total_rev = 0.0
    total_orders = 0
    prod_counts = {CUSTOM_PROGRAM_ENTITLEMENT: 0, BACKER_ENTITLEMENT: 0}
    for r in rows:
        ent = r.get("entitlement")
        price = PRICES.get(ent, 0.0)
        when = r.get("verified_at")
        if not isinstance(when, datetime):
            continue
        key = when.strftime("%Y-%m")
        m = by_month.setdefault(key, {"month": key, "orders": 0, "revenue": 0.0, "custom_program": 0, "backer": 0})
        m["orders"] += 1
        m["revenue"] += price
        if ent == CUSTOM_PROGRAM_ENTITLEMENT:
            m["custom_program"] += 1
        elif ent == BACKER_ENTITLEMENT:
            m["backer"] += 1
        total_rev += price
        total_orders += 1
        if ent in prod_counts:
            prod_counts[ent] += 1
    months = sorted(by_month.values(), key=lambda x: x["month"], reverse=True)
    for m in months:
        m["revenue"] = round(m["revenue"], 2)
    return {
        "total_orders": total_orders,
        "total_revenue": round(total_rev, 2),
        "by_product": {
            "custom_program": {"count": prod_counts[CUSTOM_PROGRAM_ENTITLEMENT], "revenue": round(prod_counts[CUSTOM_PROGRAM_ENTITLEMENT] * 200.0, 2)},
            "backer": {"count": prod_counts[BACKER_ENTITLEMENT], "revenue": round(prod_counts[BACKER_ENTITLEMENT] * 25.0, 2)},
        },
        "by_month": months,
    }


@api_router.get("/coach/buyers")
async def coach_buyers(user=Depends(get_current_user)):
    """Owner-only: everyone who bought the 1-on-1 Custom Program, with intake status."""
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    vps = await db.verified_purchases.find(
        {"entitlement": CUSTOM_PROGRAM_ENTITLEMENT, "revoked": {"$ne": True}}, {"_id": 0}
    ).sort("verified_at", -1).to_list(500)
    out = []
    for vp in vps:
        u = await db.users.find_one({"user_id": vp["user_id"]}, {"_id": 0, "display_name": 1, "avatar_id": 1, "sex": 1})
        intake = await db.custom_program_requests.find_one(
            {"user_id": vp["user_id"]}, {"_id": 0}, sort=[("created_at", -1)]
        )
        out.append({
            "user_id": vp["user_id"],
            "display_name": (u or {}).get("display_name", "Athlete"),
            "avatar_id": (u or {}).get("avatar_id", "avatar_white"),
            "sex": (u or {}).get("sex", "male"),
            "order_number": vp.get("order_number"),
            "purchased_at": (vp["verified_at"].isoformat() if isinstance(vp.get("verified_at"), datetime) else vp.get("verified_at")),
            "has_intake": bool(intake),
            "intake_status": (intake.get("status") if intake else None),
            "request_id": (intake.get("request_id") if intake else None),
            "awaiting_download": bool(
                intake and intake.get("program_media_id")
                and intake.get("last_downloaded_media_id") != intake.get("program_media_id")
            ),
        })
    return {"buyers": out}


@api_router.post("/coach/buyers/remind-intake")
async def coach_remind_intake(inp: RemindIn, user=Depends(get_current_user)):
    """Owner-only: email a buyer who paid but hasn't submitted their intake form."""
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    buyer = await db.users.find_one({"user_id": inp.user_id}, {"_id": 0, "email": 1, "display_name": 1})
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")
    to = (buyer.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="Buyer has no email on file")
    name = escape((buyer.get("display_name") or "Athlete").strip())
    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0e;">
      <h2 style="letter-spacing:1px;">HUTCH'S INNER CIRCLE</h2>
      <p>Hey {name},</p>
      <p>Coach Hutch is ready to build your <strong>1-on-1 Custom Program</strong> — he just needs your intake form.</p>
      <p>Open the app &rarr; Home &rarr; <strong>1-on-1 Custom Program</strong> and fill in your goals, schedule and injuries. It takes about 2 minutes, and then Coach gets to work.</p>
      <p>— Team Hutch</p>
    </div>"""
    await send_email(to=to, subject="Finish your Custom Program intake 💪", html=html)
    return {"ok": True, "sent_to": to}


@api_router.get("/coach/messages")
async def coach_messages(user=Depends(get_current_user)):
    rows = await db.coach_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).limit(200).to_list(200)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/coach/messages")
async def coach_send(inp: CoachMessageIn, user=Depends(get_current_user)):
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    await require_ai_access(user)
    await ai_daily_cap(user, "coach_chat")
    now = datetime.now(timezone.utc)
    await db.coach_messages.insert_one({
        "msg_id": new_id("coach"), "user_id": user["user_id"], "role": "user", "text": text[:1500], "created_at": now,
    })

    # Build recent transcript for context (last 16 turns)
    prior = await db.coach_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(17).to_list(17)
    prior = list(reversed(prior))[:-1]  # drop the just-added user msg
    transcript = "\n".join(f"{'Athlete' if m['role']=='user' else 'Coach'}: {m['text']}" for m in prior[-16:])
    profile = f"Athlete profile — display name: {user.get('display_name','Athlete')}, rank: {rank_from_xp(user['xp'])}, level: {level_from_xp(user['xp'])}."

    # Coach Memory: real PRs + recent training so advice is tailored
    prs = user.get("prs", {}) or {}
    pr_str = ", ".join(f"{k} {v}lb" for k, v in prs.items() if v) or "none logged yet"
    recent = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).limit(5).to_list(5)
    lines = []
    for w in recent:
        exs = []
        for ex in (w.get("exercises") or [])[:6]:
            sets = ex.get("sets") or []
            top = max((s.get("weight_lb", 0) for s in sets), default=0)
            exs.append(f"{ex.get('name','?')} {len(sets)}x@{top}lb" if top else ex.get("name", "?"))
        when = w.get("logged_at")
        when_s = when.date().isoformat() if isinstance(when, datetime) else ""
        lines.append(f"  • {when_s} {w.get('template_name','Session')}: {', '.join(exs)}")
    memory = f"Current PRs: {pr_str}.\nLast {len(recent)} sessions:\n" + ("\n".join(lines) if lines else "  • none logged yet")
    memory += "\nUse these real numbers to tailor prescriptions (loads, progressions) to THIS athlete."

    sys = COACH_SYSTEM + "\n\n" + profile + "\n\n" + memory + ("\n\nRecent conversation:\n" + transcript if transcript else "")

    reply_text = ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"coach_{user['user_id']}",
            system_message=sys,
        ).with_model("openai", "gpt-5.4")
        reply_text = await chat.send_message(UserMessage(text=text))
        await mark_ai_ok()
    except Exception:
        logger.exception("AI Coach failed")
        await mark_ai_outage("coach")
        raise HTTPException(status_code=502, detail="Coach is catching their breath — try again in a moment.")

    reply = {
        "msg_id": new_id("coach"), "user_id": user["user_id"], "role": "assistant",
        "text": reply_text.strip(), "created_at": datetime.now(timezone.utc),
    }
    await db.coach_messages.insert_one(dict(reply))
    reply["created_at"] = reply["created_at"].isoformat()
    return reply


@api_router.delete("/coach/messages")
async def coach_clear(user=Depends(get_current_user)):
    await db.coach_messages.delete_many({"user_id": user["user_id"]})
    return {"ok": True}


@api_router.post("/coach/tts")
async def coach_tts(inp: CoachMessageIn, user=Depends(get_current_user)):
    import re as _re
    text = _re.sub(r"https?://\S+", "", inp.text or "")
    text = _re.sub(r"[*_#>~|`]", "", text)
    text = _re.sub(r"\s+", " ", text).strip()[:4000]
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to speak")
    await require_ai_access(user)
    await ai_daily_cap(user, "coach_tts")
    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio = await tts.generate_speech(text=text, model="tts-1", voice="onyx")
    except Exception:
        logger.exception("Coach TTS failed")
        raise HTTPException(status_code=502, detail="Voice unavailable")
    tid = new_id("tts")
    await db.coach_tts.insert_one({"tts_id": tid, "audio": audio, "created_at": datetime.now(timezone.utc)})
    return {"url": f"/api/coach/tts/{tid}.mp3"}


@api_router.get("/coach/tts/{tid}.mp3")
async def coach_tts_get(tid: str):
    from fastapi import Response
    row = await db.coach_tts.find_one({"tts_id": tid})
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=row["audio"], media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})


@api_router.get("/coach/plans")
async def coach_plans_list(user=Depends(get_current_user)):
    rows = await db.coach_plans.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/coach/plans")
async def coach_plan_save(inp: CoachPlanIn, user=Depends(get_current_user)):
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to save")
    title = (inp.title or "").strip()
    if not title:
        first = text.split("\n", 1)[0].strip()
        title = (first[:48] + "…") if len(first) > 48 else (first or "Coach Plan")
    doc = {
        "plan_id": new_id("plan"), "user_id": user["user_id"],
        "title": title, "text": text[:6000], "created_at": datetime.now(timezone.utc),
    }
    await db.coach_plans.insert_one(dict(doc))
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.delete("/coach/plans/{plan_id}")
async def coach_plan_delete(plan_id: str, user=Depends(get_current_user)):
    await db.coach_plans.delete_one({"plan_id": plan_id, "user_id": user["user_id"]})
    return {"ok": True}


@api_router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...), user=Depends(get_current_user)):
    global _STT
    fname = (file.filename or "voice.webm")
    suffix = fname.rsplit(".", 1)[-1].lower() if "." in fname else "webm"
    if suffix not in ("m4a", "wav", "webm", "mp4", "mp3", "mpeg", "mpga", "ogg"):
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty recording")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Recording too long")
    await require_ai_access(user)
    await ai_daily_cap(user, "voice_transcribe")
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        if _STT is None:
            _STT = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        result = await _STT.transcribe(data, filename=fname, model="whisper-1", response_format="text")
        text = result if isinstance(result, str) else (result.get("text") if isinstance(result, dict) else getattr(result, "text", str(result)))
        text = (text or "").strip()
    except Exception:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail="Couldn't transcribe that — try again.")
    if not text:
        raise HTTPException(status_code=422, detail="No speech detected")
    return {"text": text}
