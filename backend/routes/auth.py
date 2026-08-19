# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


# ---------- Auth ----------
@api_router.post("/auth/register")
async def register(inp: RegisterInput):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = default_user_doc(inp.email, inp.display_name)
    doc["password_hash"] = hash_password(inp.password)
    if inp.sex:
        doc["sex"] = inp.sex
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
    return {"session_token": token, "user": fresh}


@api_router.post("/auth/login")
async def login(inp: LoginInput):
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = await create_session(user["user_id"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    user = await ensure_owner_admin(user)
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
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
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    return {"session_token": session_token, "user": user}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    user = await ensure_owner_admin(user)
    user["rank"] = rank_from_xp(user["xp"])
    user.update(await founder_status(user))
    return user


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}
