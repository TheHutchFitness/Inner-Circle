# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403
from fastapi import Request
from auth_throttle import (
    consume_bucket, check_account_backoff, record_failed_account_login,
    reset_account_login, client_ip, log_failed_login, IP_LOGIN_LIMIT, IP_LOGIN_WINDOW,
    SIGNUP_IP_LIMIT, SIGNUP_EMAIL_LIMIT, SIGNUP_WINDOW,
)


# ---------- Auth ----------
@api_router.post("/auth/register")
async def register(inp: RegisterInput, request: Request):
    email = inp.email.strip().lower()
    ip = client_ip(request)
    await consume_bucket(kind="signup-ip", raw_key=ip, limit=SIGNUP_IP_LIMIT, window=SIGNUP_WINDOW)
    await consume_bucket(kind="signup-email", raw_key=email, limit=SIGNUP_EMAIL_LIMIT, window=SIGNUP_WINDOW)
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = default_user_doc(inp.email, inp.display_name)
    doc["password_hash"] = hash_password(inp.password)
    full_name = (inp.full_name or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="Full legal name is required")
    doc["full_name"] = full_name[:80]
    if inp.sex:
        doc["sex"] = inp.sex
    if inp.gym:
        doc["inperson_gym"] = inp.gym.strip()[:60]
        await ensure_gym(doc["inperson_gym"])
    if inp.inperson_request:
        doc["inperson_request"] = True
    await db.users.insert_one(doc)
    if inp.referral_code:
        try:
            await apply_referral(doc, inp.referral_code)
        except Exception as e:
            logger.warning(f"referral apply failed: {e}")
    token = await create_session(doc["user_id"])
    fresh = await db.users.find_one({"user_id": doc["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    fresh.update(await founder_status(fresh))
    fresh["season_champ_titles"] = await season_titles_for(fresh["user_id"])
    return {"session_token": token, "user": fresh}


@api_router.post("/auth/login")
async def login(inp: LoginInput, request: Request):
    email = inp.email.strip().lower()
    ip = client_ip(request)
    await consume_bucket(kind="login-ip", raw_key=ip, limit=IP_LOGIN_LIMIT, window=IP_LOGIN_WINDOW)
    await check_account_backoff(email)
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(inp.password, user["password_hash"]):
        await record_failed_account_login(email)
        await log_failed_login(ip, email)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("is_admin"):
        b = ban_state(user)
        if b and b["scope"] in ("login", "all"):
            until = b["until"].strftime("%b %d, %H:%M UTC")
            raise HTTPException(status_code=403, detail=f"Your access is suspended until {until}." + (f" Reason: {b['reason']}" if b['reason'] else ""))
    await reset_account_login(email)
    token = await create_session(user["user_id"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    user = await ensure_owner_admin(user)
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    user["season_champ_titles"] = await season_titles_for(user["user_id"])
    return {"session_token": token, "user": user}


@api_router.post("/auth/session")
async def google_session(inp: SessionInput):
    # Exchange session_id with Emergent
    async with httpx.AsyncClient(timeout=10.0) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": inp.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data.get("email", "").lower()
    name = data.get("name", email.split("@")[0])
    picture = data.get("picture", "")
    session_token = data.get("session_token") or f"tok_{uuid.uuid4().hex}"

    user = await db.users.find_one({"email": email})
    if not user:
        user = default_user_doc(email, name, picture)
        await db.users.insert_one(user)
    else:
        await db.users.update_one({"email": email}, {"$set": {"display_name": user.get("display_name") or name, "picture": picture or user.get("picture", "")}})
        user = await db.users.find_one({"email": email})

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })
    user.pop("password_hash", None)
    user.pop("_id", None)
    user = await ensure_owner_admin(user)
    if not user.get("is_admin"):
        b = ban_state(user)
        if b and b["scope"] in ("login", "all"):
            await db.user_sessions.delete_one({"session_token": session_token})
            until = b["until"].strftime("%b %d, %H:%M UTC")
            raise HTTPException(status_code=403, detail=f"Your access is suspended until {until}." + (f" Reason: {b['reason']}" if b['reason'] else ""))
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    user["season_champ_titles"] = await season_titles_for(user["user_id"])
    return {"session_token": session_token, "user": user}


APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
_apple_jwk_client = None


def _apple_audiences() -> list:
    return [a.strip() for a in os.environ.get("APPLE_AUDIENCES", "").split(",") if a.strip()]


@api_router.post("/auth/apple")
async def apple_session(inp: dict = Body(...), request: Request = None):
    """Sign in with Apple (iOS). Verifies the identity token against Apple's public
    keys, then finds/creates a user keyed on the Apple `sub` and issues a session."""
    import jwt as _jwt
    from jwt import PyJWKClient
    if request is not None:
        await consume_bucket(kind="apple-ip", raw_key=client_ip(request), limit=IP_LOGIN_LIMIT, window=IP_LOGIN_WINDOW)

    token = (inp or {}).get("identity_token") or (inp or {}).get("identityToken")
    if not token:
        raise HTTPException(status_code=400, detail="identity_token required")
    global _apple_jwk_client
    try:
        if _apple_jwk_client is None:
            _apple_jwk_client = PyJWKClient(APPLE_JWKS_URL)
        signing_key = _apple_jwk_client.get_signing_key_from_jwt(token)
        claims = _jwt.decode(
            token, signing_key.key, algorithms=["RS256"],
            audience=_apple_audiences(), issuer=APPLE_ISSUER,
        )
    except Exception as e:
        logger.warning(f"apple token verify failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Apple token")

    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Invalid Apple token")
    token_email = (claims.get("email") or "").lower()
    first_email = ((inp or {}).get("email") or token_email or "").lower()
    first_name = (inp or {}).get("name") or (first_email.split("@")[0] if first_email else "Athlete")

    user = await db.users.find_one({"apple_sub": apple_sub})
    if not user and first_email:
        user = await db.users.find_one({"email": first_email})
    if not user:
        email = first_email or f"apple_{apple_sub[:16]}@appleid.local"
        user = default_user_doc(email, first_name)
        user["apple_sub"] = apple_sub
        await db.users.insert_one(user)
    elif not user.get("apple_sub"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"apple_sub": apple_sub}})

    session_token = await create_session(user["user_id"])
    user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    user = await ensure_owner_admin(user)
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    user["season_champ_titles"] = await season_titles_for(user["user_id"])
    return {"session_token": session_token, "user": user}



@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    user = await ensure_owner_admin(user)
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    user["is_creator"] = bool(user.get("social_tiktok") or user.get("social_instagram") or user.get("social_youtube"))
    user["season_champ_titles"] = await season_titles_for(user["user_id"])
    # Coaching is only requestable if the member's chosen gym is a coaching-enabled gym.
    gym = (user.get("inperson_gym") or "").strip()
    user["coaching_available"] = False
    if gym:
        cg = await db.gyms.find_one({"name_lower": gym.lower(), "coaching_enabled": True}, {"_id": 1})
        user["coaching_available"] = bool(cg)
    # Baseline run bests (seconds) so the retest screen can pre-fill 5K / 10K.
    runs = {}
    async for c in db.cardio.find(
        {"user_id": user["user_id"], "baseline": True}, {"_id": 0, "distance_km": 1, "duration_s": 1}
    ):
        if c.get("distance_km") == 5.0:
            runs["t_5k"] = int(c.get("duration_s") or 0)
        elif c.get("distance_km") == 10.0:
            runs["t_10k"] = int(c.get("duration_s") or 0)
    user["baseline_runs"] = runs
    return user


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}



# Collections that store per-user data keyed by "user_id" — wiped on account deletion.
_USER_DATA_COLLECTIONS = [
    "workouts", "cardio", "sprints", "steps", "heart_rate", "nutrition_logs",
    "monthly_programs", "ai_programs", "set_presets", "personal_quests", "quest_claims",
    "ped_regimens", "custom_program_requests", "rival_challenges", "coach_messages",
    "coach_plans", "coach_tts", "store_purchases", "verified_purchases",
    "inperson_messages", "inperson_bookings", "inperson_attendance", "inperson_programs",
    "judge_submissions", "judge_comments", "chat_messages", "featured_members",
]


@api_router.post("/auth/delete-account")
async def delete_account(user=Depends(get_current_user)):
    """Permanently delete the signed-in member's account and all associated data.
    Required for App Store compliance. The owner account cannot be self-deleted."""
    uid = user["user_id"]
    if user.get("email", "").lower() in [e.lower() for e in OWNER_EMAILS]:
        raise HTTPException(status_code=403, detail="The owner account cannot be deleted from the app.")
    # Remove the user from any clans/groups they belong to.
    await db.groups.update_many({}, {"$pull": {"members": uid, "pending": uid}})
    # Wipe all per-user data across collections.
    for coll in _USER_DATA_COLLECTIONS:
        try:
            await db[coll].delete_many({"user_id": uid})
        except Exception as e:
            logger.warning(f"delete-account: {coll} wipe failed for {uid}: {e}")
    # Invalidate sessions and finally remove the user document.
    await db.user_sessions.delete_many({"user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True, "deleted": True}
