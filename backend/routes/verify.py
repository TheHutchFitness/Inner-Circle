# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.post("/verify/email/send")
async def verify_email_send(user=Depends(get_current_user)):
    if user.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email already verified")
    await _check_send_rate(user["user_id"], "email")
    code = gen_verify_code()
    await _store_code(user["user_id"], "email", code)
    name = user.get("display_name", "Athlete")
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;'
        f'background:#0a0a12;color:#e8f4ff">'
        f'<h2 style="color:#22d3ee;letter-spacing:2px;margin:0 0 16px">{escape(EMAIL_FROM_NAME.upper())}</h2>'
        f'<p>Hey {escape(name)}, your verification code is:</p>'
        f'<p style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#22d3ee;margin:16px 0">{code}</p>'
        f'<p>Enter it in the app within {VERIFY_TTL_MIN} minutes to verify your email and unlock media sharing.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {escape(EMAIL_FROM_NAME)}. We never ask for your password by email. '
        f'If you didn\'t request this, ignore it.</p>'
        f'</td></tr></table>'
    )
    await send_email(to=user["email"], subject=f"{code} is your verification code", html=html)
    return {"status": "sent", "email": user["email"]}


@api_router.post("/verify/email/confirm")
async def verify_email_confirm(inp: CodeConfirmIn, user=Depends(get_current_user)):
    await _consume_code(user["user_id"], "email", inp.code)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"email_verified": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


@api_router.post("/verify/phone/send")
async def verify_phone_send(inp: PhoneSendIn, user=Depends(get_current_user)):
    digits = re.sub(r"\D", "", inp.phone)
    if not (7 <= len(digits) <= 15):
        raise HTTPException(status_code=400, detail="Enter a valid phone number")
    await _check_send_rate(user["user_id"], "phone")
    code = gen_verify_code()
    await _store_code(user["user_id"], "phone", code, {"phone": inp.phone.strip()})
    if twilio_configured():
        try:
            await send_sms(inp.phone, f"{code} is your Hutch's Inner Circle verification code. Expires in {VERIFY_TTL_MIN} min.")
            return {"status": "sent", "mock": False}
        except Exception as e:
            logger.warning(f"Twilio SMS failed for {inp.phone}: {e}")
            raise HTTPException(status_code=502, detail="Couldn't send the text. Double-check the number (include country code, e.g. +1).")
    # Fallback when Twilio isn't configured — code returned so the app can show it on screen.
    logger.info(f"[MOCK SMS] verification code {code} for {inp.phone}")
    return {"status": "sent", "mock": True, "code": code}


@api_router.post("/verify/phone/confirm")
async def verify_phone_confirm(inp: CodeConfirmIn, user=Depends(get_current_user)):
    rec = await _consume_code(user["user_id"], "phone", inp.code)
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"phone_verified": True, "phone": rec.get("phone")}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh
