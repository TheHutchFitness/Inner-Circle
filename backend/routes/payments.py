# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.post("/revenuecat/webhook")
async def revenuecat_webhook(request: Request, authorization: Optional[str] = Header(None)):
    """Server-side proof of purchase. RevenueCat POSTs a signed purchase event here,
    authenticated by the shared REVENUECAT_WEBHOOK_AUTH secret configured in the RC
    dashboard. This is the ONLY path that writes verified_purchases + flips paid flags."""
    if not RC_WEBHOOK_AUTH:
        raise HTTPException(status_code=503, detail="RevenueCat webhook not configured")
    if not authorization or not secrets.compare_digest(authorization.strip(), RC_WEBHOOK_AUTH):
        raise HTTPException(status_code=401, detail="Invalid webhook authorization")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = body.get("event") or {}
    etype = (event.get("type") or "").upper()
    event_id = event.get("id") or new_id("rcevt")

    # Idempotency — never process the same RC event twice
    if await db.rc_webhook_events.find_one({"event_id": event_id}):
        return {"ok": True, "duplicate": True}
    await db.rc_webhook_events.insert_one(
        {"event_id": event_id, "type": etype, "received_at": datetime.now(timezone.utc)}
    )

    ents = event.get("entitlement_ids") or (
        [event["entitlement_id"]] if event.get("entitlement_id") else []
    )
    ents = [e for e in ents if e in (CUSTOM_PROGRAM_ENTITLEMENT, BACKER_ENTITLEMENT)]

    candidates = [event.get("app_user_id"), event.get("original_app_user_id")] + (event.get("aliases") or [])
    user = await _find_user_by_candidates(candidates)
    fallback_uid = next((c for c in candidates if c and not str(c).startswith("$RCAnonymousID:")), None)

    processed = []
    for ent in ents:
        uid = (user or {}).get("user_id") or fallback_uid
        if not uid:
            continue
        if etype in RC_GRANT_EVENTS:
            existing = await db.verified_purchases.find_one({"user_id": uid, "entitlement": ent})
            await db.verified_purchases.update_one(
                {"user_id": uid, "entitlement": ent},
                {"$set": {
                    "user_id": uid, "entitlement": ent,
                    "product_id": event.get("product_id"), "store": event.get("store"),
                    "environment": event.get("environment"), "event_id": event_id,
                    "event_type": etype, "revoked": False,
                    "verified_at": datetime.now(timezone.utc),
                },
                 "$setOnInsert": {"order_number": _new_order_number()}},
                upsert=True,
            )
            if user:
                grant = _grant_set_for_entitlement(ent)
                if grant:
                    await db.users.update_one({"user_id": user["user_id"]}, {"$set": grant})
                # Thank-you receipt — only on a real purchase moment, and only once
                if etype in RC_RECEIPT_EVENTS and not (existing or {}).get("receipt_sent"):
                    await _send_purchase_receipt(user, ent)
                    await db.verified_purchases.update_one(
                        {"user_id": uid, "entitlement": ent}, {"$set": {"receipt_sent": True}}
                    )
            processed.append({"entitlement": ent, "action": "granted"})
        elif etype in RC_REVOKE_EVENTS:
            await db.verified_purchases.update_one(
                {"user_id": uid, "entitlement": ent},
                {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}},
            )
            if user:
                rev = _revoke_set_for_entitlement(ent)
                if rev:
                    await db.users.update_one({"user_id": user["user_id"]}, {"$set": rev})
            processed.append({"entitlement": ent, "action": "revoked"})

    return {"ok": True, "processed": processed}


# ---------- 1-on-1 Custom Program ($200 lifetime) ----------
@api_router.post("/custom-program/unlock")
async def custom_program_unlock(user=Depends(get_current_user)):
    """Sync endpoint called by the client after a RevenueCat lifetime purchase.
    Grants Athlete's Center access ONLY if RevenueCat has confirmed the purchase
    server-side (via the webhook). Fail-closed — no verified purchase, no grant."""
    if not await has_verified_purchase(user["user_id"], CUSTOM_PROGRAM_ENTITLEMENT):
        raise HTTPException(
            status_code=402,
            detail="Purchase not verified yet. If you just purchased, wait a few seconds and tap Restore.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": _grant_set_for_entitlement(CUSTOM_PROGRAM_ENTITLEMENT)},
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


@api_router.post("/custom-program/intake")
async def custom_program_intake(inp: CustomProgramIntake, user=Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not fresh.get("custom_program_purchased"):
        raise HTTPException(status_code=403, detail="Purchase the 1-on-1 custom program first")
    doc = {
        "request_id": new_id("cprog"),
        "user_id": user["user_id"],
        "email": fresh.get("email"),
        "display_name": fresh.get("display_name"),
        **inp.dict(),
        "status": "submitted",
        "created_at": datetime.now(timezone.utc),
    }
    await db.custom_program_requests.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return {"ok": True, "request": doc}


@api_router.get("/custom-program")
async def custom_program_status(user=Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    intake = await db.custom_program_requests.find_one(
        {"user_id": user["user_id"]}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if intake and isinstance(intake.get("created_at"), datetime):
        intake["created_at"] = intake["created_at"].isoformat()
    vp = await db.verified_purchases.find_one(
        {"user_id": user["user_id"], "entitlement": CUSTOM_PROGRAM_ENTITLEMENT, "revoked": {"$ne": True}},
        {"_id": 0},
    )
    receipt = None
    if vp:
        receipt = {
            "order_number": vp.get("order_number"),
            "purchased_at": (vp["verified_at"].isoformat() if isinstance(vp.get("verified_at"), datetime) else vp.get("verified_at")),
            "product": "1-on-1 Custom Program",
            "amount": "$200.00",
        }
    return {
        "purchased": bool(fresh.get("custom_program_purchased")),
        "athletes_center_access": bool(fresh.get("athletes_center_access")),
        "intake": intake,
        "receipt": receipt,
    }


@api_router.get("/custom-program/alert")
async def custom_program_alert(user=Depends(get_current_user)):
    """Lightweight poll for the buyer: program delivery state + intake reminder."""
    purchased = await has_verified_purchase(user["user_id"], CUSTOM_PROGRAM_ENTITLEMENT) or bool(user.get("custom_program_purchased"))
    latest_intake = await db.custom_program_requests.find_one(
        {"user_id": user["user_id"]}, {"_id": 0, "goals": 1}, sort=[("created_at", -1)]
    )
    intake_pending = bool(purchased) and not latest_intake
    req = await db.custom_program_requests.find_one(
        {"user_id": user["user_id"], "status": "delivered"},
        {"_id": 0, "program_file_name": 1, "delivered_at": 1, "delivered_seen": 1, "program_label": 1},
        sort=[("delivered_at", -1)],
    )
    if not req:
        return {"program_ready": False, "unseen": False, "intake_pending": intake_pending}
    return {
        "program_ready": True,
        "unseen": not bool(req.get("delivered_seen")),
        "intake_pending": intake_pending,
        "file_name": req.get("program_file_name"),
        "label": req.get("program_label"),
        "delivered_at": (req["delivered_at"].isoformat() if isinstance(req.get("delivered_at"), datetime) else req.get("delivered_at")),
    }


@api_router.post("/custom-program/alert/seen")
async def custom_program_alert_seen(user=Depends(get_current_user)):
    await db.custom_program_requests.update_many(
        {"user_id": user["user_id"], "status": "delivered"},
        {"$set": {"delivered_seen": True}},
    )
    return {"ok": True}


@api_router.post("/custom-program/downloaded")
async def custom_program_downloaded(inp: DownloadedIn, user=Depends(get_current_user)):
    """Buyer marks a delivered program file as downloaded (clears Coach's unread dot)."""
    await db.custom_program_requests.update_many(
        {"user_id": user["user_id"], "status": "delivered"},
        {"$set": {"last_downloaded_media_id": inp.media_id}},
    )
    return {"ok": True}


@api_router.get("/custom-program/requests")
async def custom_program_requests(user=Depends(get_current_user)):
    """Coach-only: list every custom-program intake so Hutch can deliver files."""
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    rows = await db.custom_program_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.post("/custom-program/requests/{request_id}/deliver")
async def custom_program_deliver(request_id: str, file: UploadFile = File(...), note: Optional[str] = Form(None), label: Optional[str] = Form(None), user=Depends(get_current_user)):
    """Coach-only: upload the finished program file for a buyer."""
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    req = await db.custom_program_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    ct = (file.content_type or "application/octet-stream").lower().split(";")[0].strip()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 40 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 40MB)")
    ext = (file.filename or "program.pdf").rsplit(".", 1)[-1][:5] if "." in (file.filename or "") else "bin"
    path = f"{STORAGE_APP_NAME}/programs/{req['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("med")
    await db.chat_media.insert_one({
        "media_id": media_id, "user_id": req["user_id"], "storage_path": path,
        "content_type": ct, "media_type": "file", "size": len(data),
        "original_name": file.filename, "created_at": datetime.now(timezone.utc),
    })
    note_clean = (note or "").strip()[:500]
    label_clean = (label or "").strip()[:60]
    now = datetime.now(timezone.utc)
    delivery_entry = {
        "media_id": media_id, "file_name": file.filename or "program",
        "note": note_clean, "label": label_clean, "delivered_at": now,
    }
    await db.custom_program_requests.update_one(
        {"request_id": request_id},
        {"$set": {"program_media_id": media_id, "program_file_name": file.filename or "program",
                  "program_note": note_clean, "program_label": label_clean,
                  "status": "delivered", "delivered_at": now,
                  "delivered_seen": False},
         "$push": {"deliveries": delivery_entry}},
    )
    # Notify the buyer by email (fire-and-forget)
    buyer = await db.users.find_one({"user_id": req["user_id"]}, {"_id": 0, "email": 1, "display_name": 1})
    if buyer and (buyer.get("email") or "").strip():
        name = escape((buyer.get("display_name") or "Athlete").strip())
        note_html = f'<div style="background:#f4f4f4;border-left:4px solid #111;padding:12px 14px;margin:14px 0;"><strong>Note from Coach Hutch:</strong><br/>{escape(note_clean)}</div>' if note_clean else ""
        html = f"""
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0e;">
          <h2 style="letter-spacing:1px;">HUTCH'S INNER CIRCLE</h2>
          <p>Hey {name},</p>
          <p><strong>Your custom program is ready.</strong> Open the app &rarr; Home &rarr; 1-on-1 Custom Program to download it.</p>
          {note_html}
          <p>Let's get to work.<br/>— Coach Hutch</p>
        </div>"""
        try:
            await send_email(to=buyer["email"].strip(), subject="Your custom program is ready 💪", html=html)
        except Exception as e:
            logger.warning(f"Delivery email failed for {buyer.get('email')}: {e}")
    return {"ok": True, "media_id": media_id, "file_name": file.filename}


@api_router.get("/founders/spots")
async def founder_spots():
    """Public (no auth): how many Founding Beta spots remain. Shown on the login screen."""
    taken = await db.users.count_documents({"is_bot": {"$ne": True}, "is_admin": {"$ne": True}})
    taken = min(taken, FOUNDER_LIMIT)
    return {"taken": taken, "limit": FOUNDER_LIMIT, "remaining": max(0, FOUNDER_LIMIT - taken)}


@api_router.get("/founders")
async def founders_list(user=Depends(get_current_user)):
    # First 100 real members (exclude leaderboard bots), earliest signups first
    rows = await db.users.find(
        {"is_bot": {"$ne": True}, "is_admin": {"$ne": True}},
        {"_id": 0, "user_id": 1, "display_name": 1, "avatar_id": 1, "xp": 1, "created_at": 1, "founder_backer": 1, "sex": 1, "social_tiktok": 1, "social_instagram": 1},
    ).sort("created_at", 1).limit(FOUNDER_LIMIT).to_list(FOUNDER_LIMIT)

    founders = []
    my_number = None
    for i, r in enumerate(rows):
        num = i + 1
        if r["user_id"] == user["user_id"]:
            my_number = num
        founders.append({
            "number": num,
            "user_id": r["user_id"],
            "display_name": r.get("display_name", "Athlete"),
            "avatar_id": r.get("avatar_id", "avatar_ronin"),
            "sex": r.get("sex", "male"),
            "rank": rank_from_xp(r.get("xp", 0)),
            "is_backer": bool(r.get("founder_backer")),
            "is_creator": bool(r.get("social_tiktok") or r.get("social_instagram")),
        })

    backer_rows = await db.users.find(
        {"founder_backer": True, "is_bot": {"$ne": True}},
        {"_id": 0, "user_id": 1, "display_name": 1, "avatar_id": 1, "xp": 1, "backed_at": 1, "sex": 1},
    ).sort("backed_at", 1).to_list(500)
    backers = [{
        "user_id": b.get("user_id"),
        "display_name": b.get("display_name", "Athlete"),
        "avatar_id": b.get("avatar_id", "avatar_ronin"),
        "sex": b.get("sex", "male"),
        "rank": rank_from_xp(b.get("xp", 0)),
    } for b in backer_rows]

    # Creators — members who linked a TikTok/Instagram (top creators stand out).
    creator_rows = await db.users.find(
        {"is_bot": {"$ne": True}, "is_admin": {"$ne": True}, "$or": [
            {"social_tiktok": {"$nin": [None, ""]}},
            {"social_instagram": {"$nin": [None, ""]}},
        ]},
        {"_id": 0, "user_id": 1, "display_name": 1, "avatar_id": 1, "xp": 1, "sex": 1,
         "social_tiktok": 1, "social_instagram": 1},
    ).sort("xp", -1).to_list(300)
    creators = [{
        "user_id": c.get("user_id"),
        "display_name": c.get("display_name", "Athlete"),
        "avatar_id": c.get("avatar_id", "avatar_ronin"),
        "sex": c.get("sex", "male"),
        "rank": rank_from_xp(c.get("xp", 0)),
        "social_tiktok": c.get("social_tiktok", "") or "",
        "social_instagram": c.get("social_instagram", "") or "",
    } for c in creator_rows]

    my_receipt = None
    if user.get("founder_backer"):
        vp = await db.verified_purchases.find_one(
            {"user_id": user["user_id"], "entitlement": BACKER_ENTITLEMENT, "revoked": {"$ne": True}},
            {"_id": 0},
        )
        if vp:
            my_receipt = {
                "order_number": vp.get("order_number"),
                "purchased_at": (vp["verified_at"].isoformat() if isinstance(vp.get("verified_at"), datetime) else vp.get("verified_at")),
                "product": "Founder Backer",
                "amount": "$25.00",
            }

    return {
        "founders": founders,
        "backers": backers,
        "creators": creators,
        "founder_limit": FOUNDER_LIMIT,
        "me": {
            "number": my_number,
            "is_founder": my_number is not None,
            "is_backer": bool(user.get("founder_backer")),
            "is_creator": bool(user.get("social_tiktok") or user.get("social_instagram")),
            "receipt": my_receipt,
        },
    }


@api_router.get("/referral")
async def referral_info(user=Depends(get_current_user)):
    """The signed-in athlete's invite code + progress toward the RECRUITER badge."""
    code = user.get("referral_code")
    if not code:
        code = "HIC" + uuid.uuid4().hex[:6].upper()
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"referral_code": code}})
    invited = await db.users.find(
        {"referred_by": user["user_id"]},
        {"_id": 0, "user_id": 1, "display_name": 1, "avatar_id": 1, "xp": 1, "sex": 1},
    ).sort("created_at", 1).to_list(200)
    recruits = [{
        "user_id": r.get("user_id"),
        "display_name": r.get("display_name", "Athlete"),
        "avatar_id": r.get("avatar_id", "avatar_ronin"),
        "sex": r.get("sex", "male"),
        "rank": rank_from_xp(r.get("xp", 0)),
    } for r in invited]
    count = user.get("referral_count", 0) or 0
    return {
        "code": code,
        "count": count,
        "recruits": recruits,
        "referrer_xp": REFERRER_XP,
        "referred_xp": REFERRED_XP,
        "badge_at": RECRUITER_BADGE_AT,
        "has_badge": count >= RECRUITER_BADGE_AT,
        "to_badge": max(0, RECRUITER_BADGE_AT - count),
    }


@api_router.post("/founders/back")
async def founders_back(user=Depends(get_current_user)):
    """Sync endpoint called by the client after a RevenueCat 'Backer' purchase.
    Flags the backer ONLY if RevenueCat has confirmed the purchase server-side
    (via the webhook). Fail-closed — no verified purchase, no backer status."""
    if not await has_verified_purchase(user["user_id"], BACKER_ENTITLEMENT):
        raise HTTPException(
            status_code=402,
            detail="Purchase not verified yet. If you just purchased, wait a few seconds and tap Restore.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": _grant_set_for_entitlement(BACKER_ENTITLEMENT)},
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


# ---------- Purchases: order history + receipt resend ----------
@api_router.get("/purchases")
async def my_purchases(user=Depends(get_current_user)):
    rows = await db.verified_purchases.find(
        {"user_id": user["user_id"], "revoked": {"$ne": True}}, {"_id": 0}
    ).sort("verified_at", -1).to_list(100)
    out = []
    for r in rows:
        product, amount = PURCHASE_PRODUCTS.get(r.get("entitlement"), (r.get("entitlement") or "Purchase", ""))
        out.append({
            "order_number": r.get("order_number"),
            "entitlement": r.get("entitlement"),
            "product": product,
            "amount": amount,
            "store": r.get("store"),
            "purchased_at": (r["verified_at"].isoformat() if isinstance(r.get("verified_at"), datetime) else r.get("verified_at")),
        })
    return {"purchases": out}


@api_router.post("/receipt/resend")
async def resend_receipt(inp: ReceiptResendIn, user=Depends(get_current_user)):
    ent = inp.entitlement
    if ent not in (CUSTOM_PROGRAM_ENTITLEMENT, BACKER_ENTITLEMENT):
        raise HTTPException(status_code=400, detail="Invalid item")
    vp = await db.verified_purchases.find_one(
        {"user_id": user["user_id"], "entitlement": ent, "revoked": {"$ne": True}}
    )
    if not vp:
        raise HTTPException(status_code=404, detail="No purchase found for this item")
    to = (user.get("email") or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="No email on file — add one in your profile")
    subject, html = _receipt_resend_email(user, ent, vp)
    await send_email(to=to, subject=subject, html=html)  # raises HTTPException on failure
    return {"ok": True, "sent_to": to, "order_number": vp.get("order_number")}
