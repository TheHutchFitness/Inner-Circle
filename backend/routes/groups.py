# ruff: noqa: F403, F405
"""Clans / Groups: member-created groups with a home page, announcements,
a members list, an exclusive group chat, XP and levels."""
from shared import *  # noqa: F401,F403

MAX_GROUPS_PER_USER = 2

# Invite rewards — bonus XP when someone joins a clan via a shared invite link.
INVITE_INVITER_XP = 200   # to the member whose link was used (ref)
INVITE_JOIN_XP = 100      # welcome bonus to the new joiner
INVITE_CLAN_XP = 150      # added to the clan itself (helps leveling & challenges)


def _can_create(u: dict) -> bool:
    return bool(u.get("is_founder") or u.get("founder_grant") or u.get("is_premium")
                or u.get("all_rooms_access") or u.get("is_admin"))


XP_PER_GROUP_LEVEL = 1000

# Tiers unlock a clan color + badge for the WHOLE group as it levels up.
GROUP_TIERS = [
    {"level": 1, "color": "#6EE7F9", "badge": "", "title": "Cyan Cell"},
    {"level": 2, "color": "#6EE7F9", "badge": "🔥", "title": "Ignited"},
    {"level": 3, "color": "#A78BFA", "badge": "🔥", "title": "Violet Vanguard"},
    {"level": 5, "color": "#F472B6", "badge": "⚡", "title": "Charged"},
    {"level": 8, "color": "#FBBF24", "badge": "⚡", "title": "Golden Order"},
    {"level": 10, "color": "#F87171", "badge": "👑", "title": "Crimson Crown"},
    {"level": 15, "color": "#34D399", "badge": "💀", "title": "Emerald Reapers"},
    {"level": 20, "color": "#E879F9", "badge": "🏆", "title": "Apex Clan"},
]


def _group_level(xp: int) -> int:
    return max(1, int(xp) // XP_PER_GROUP_LEVEL + 1)


def _group_meta(xp: int) -> dict:
    xp = int(xp or 0)
    level = _group_level(xp)
    unlocked = [t for t in GROUP_TIERS if t["level"] <= level]
    color = next((t["color"] for t in reversed(unlocked) if t["color"]), GROUP_TIERS[0]["color"])
    badge = next((t["badge"] for t in reversed(unlocked) if t["badge"]), "")
    title = unlocked[-1]["title"] if unlocked else GROUP_TIERS[0]["title"]
    nxt = next((t for t in GROUP_TIERS if t["level"] > level), None)
    return {
        "level": level,
        "color": color,
        "badge": badge,
        "title": title,
        "xp_into_level": xp % XP_PER_GROUP_LEVEL,
        "xp_for_next": XP_PER_GROUP_LEVEL,
        "next_tier": ({"level": nxt["level"], "color": nxt["color"], "badge": nxt["badge"], "title": nxt["title"]} if nxt else None),
    }


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class GroupText(BaseModel):
    text: str


class GroupTarget(BaseModel):
    user_id: Optional[str] = None
    display_name: Optional[str] = None


async def _brief(g: dict, uid: str, last_at=None) -> dict:
    members = g.get("members", [])
    officers = g.get("officers", [])
    role = ("creator" if g.get("creator_id") == uid
            else "officer" if uid in officers
            else "member" if uid in members
            else "pending" if uid in g.get("pending", [])
            else "none")
    meta = _group_meta(g.get("xp", 0))
    return {
        "id": g["id"], "name": g["name"], "description": g.get("description", ""),
        "creator_id": g.get("creator_id"), "member_count": len(members),
        "xp": g.get("xp", 0),
        **meta,
        "champion_title": g.get("champion_title"),
        "role": role, "pending_count": len(g.get("pending", [])),
        "last_message_at": last_at.isoformat() if isinstance(last_at, datetime) else None,
    }


async def _count_membership(uid: str) -> int:
    return await db.groups.count_documents({"members": uid})


@api_router.get("/groups")
async def list_groups(user=Depends(get_current_user)):
    rows = await db.groups.find({}, {"_id": 0}).sort("xp", -1).to_list(500)
    uid = user["user_id"]
    is_admin = bool(user.get("is_admin"))
    # Private "test" groups are only visible to their creator / admins.
    rows = [g for g in rows if (g.get("name_lower") != "test" or is_admin or g.get("creator_id") == uid or uid in g.get("members", []))]
    # Latest message time per clan room, in one aggregation.
    room_ids = [f"group:{g['id']}" for g in rows]
    last_map: dict = {}
    if room_ids:
        agg = await db.chat_messages.aggregate([
            {"$match": {"room": {"$in": room_ids}}},
            {"$group": {"_id": "$room", "last": {"$max": "$created_at"}}},
        ]).to_list(len(room_ids))
        last_map = {a["_id"]: a["last"] for a in agg}
    return {
        "groups": [await _brief(g, uid, last_map.get(f"group:{g['id']}")) for g in rows],
        "can_create": _can_create(user),
        "my_group_count": await _count_membership(uid),
    }


@api_router.post("/groups")
async def create_group(inp: GroupCreate, user=Depends(get_current_user)):
    if not _can_create(user):
        raise HTTPException(status_code=403, detail="Only Founders & premium members can create a group")
    if await _count_membership(user["user_id"]) >= MAX_GROUPS_PER_USER:
        raise HTTPException(status_code=400, detail="You can be in at most 2 groups")
    name = (inp.name or "").strip()[:40]
    if not name:
        raise HTTPException(status_code=400, detail="Group name required")
    if await db.groups.find_one({"name_lower": name.lower()}):
        raise HTTPException(status_code=400, detail="That group name is taken")
    doc = {
        "id": new_id("grp"), "name": name, "name_lower": name.lower(),
        "description": (inp.description or "").strip()[:200],
        "creator_id": user["user_id"], "members": [user["user_id"]], "pending": [],
        "xp": 0, "announcements": [], "created_at": datetime.now(timezone.utc),
    }
    await db.groups.insert_one(doc)
    return await _brief(doc, user["user_id"])


async def _members_public(ids: list, officers=None, creator_id=None) -> list:
    officers = set(officers or [])
    out = []
    for uid in ids:
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "user_id": 1, "display_name": 1, "avatar_id": 1, "xp": 1, "loadout": 1, "sex": 1})
        if u:
            u["rank"] = rank_from_xp(u.get("xp", 0))
            u["is_creator"] = uid == creator_id
            u["is_officer"] = uid in officers
            out.append(u)
    return out


@api_router.get("/groups/{gid}")
async def group_detail(gid: str, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    uid = user["user_id"]
    is_admin = bool(user.get("is_admin"))
    can_edit = is_admin or g.get("creator_id") == uid
    can_manage = _can_manage(g, user)
    b = await _brief(g, uid)
    b["members"] = await _members_public(g.get("members", []), g.get("officers", []), g.get("creator_id"))
    b["announcements"] = sorted(g.get("announcements", []), key=lambda a: a.get("created_at", ""), reverse=True)[:20]
    b["can_edit"] = can_edit
    b["can_manage"] = can_manage
    b["pending"] = await _members_public(g.get("pending", [])) if can_manage else []
    creator = await db.users.find_one({"user_id": g.get("creator_id")}, {"_id": 0, "display_name": 1})
    b["creator_name"] = (creator or {}).get("display_name", "—")
    return b


@api_router.post("/groups/{gid}/join")
async def join_group(gid: str, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    uid = user["user_id"]
    if uid in g.get("members", []):
        return {"ok": True, "status": "member"}
    if await _count_membership(uid) >= MAX_GROUPS_PER_USER:
        raise HTTPException(status_code=400, detail="You can be in at most 2 groups")
    await db.groups.update_one({"id": gid}, {"$addToSet": {"pending": uid}})
    return {"ok": True, "status": "pending"}


def _require_edit(g: dict, user):
    if not (user.get("is_admin") or g.get("creator_id") == user["user_id"]):
        raise HTTPException(status_code=403, detail="Only the group creator or admin can do that")


def _can_manage(g: dict, user) -> bool:
    return bool(user.get("is_admin") or g.get("creator_id") == user["user_id"] or user["user_id"] in g.get("officers", []))


def _require_manage(g: dict, user):
    if not _can_manage(g, user):
        raise HTTPException(status_code=403, detail="Only the leader or officers can do that")


@api_router.post("/groups/{gid}/approve")
async def approve_member(gid: str, inp: GroupTarget, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_manage(g, user)
    tid = inp.user_id
    if not tid:
        raise HTTPException(status_code=400, detail="user_id required")
    if await _count_membership(tid) >= MAX_GROUPS_PER_USER:
        raise HTTPException(status_code=400, detail="That member is already in 2 groups")
    await db.groups.update_one({"id": gid}, {"$pull": {"pending": tid}, "$addToSet": {"members": tid}})
    return {"ok": True}


@api_router.post("/groups/{gid}/deny")
async def deny_member(gid: str, inp: GroupTarget, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_manage(g, user)
    await db.groups.update_one({"id": gid}, {"$pull": {"pending": inp.user_id}})
    return {"ok": True}


@api_router.post("/groups/{gid}/invite")
async def invite_member(gid: str, inp: GroupTarget, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_manage(g, user)
    name = (inp.display_name or "").strip()
    target = None
    if inp.user_id:
        target = await db.users.find_one({"user_id": inp.user_id})
    elif name:
        target = await db.users.find_one({"display_name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target["user_id"] in g.get("members", []):
        return {"ok": True}
    if await _count_membership(target["user_id"]) >= MAX_GROUPS_PER_USER:
        raise HTTPException(status_code=400, detail="That member is already in 2 groups")
    await db.groups.update_one({"id": gid}, {"$pull": {"pending": target["user_id"]}, "$addToSet": {"members": target["user_id"]}})
    return {"ok": True, "added": target.get("display_name")}


@api_router.post("/groups/{gid}/remove")
async def remove_member(gid: str, inp: GroupTarget, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_edit(g, user)
    if inp.user_id == g.get("creator_id"):
        raise HTTPException(status_code=400, detail="The creator can't be removed")
    await db.groups.update_one({"id": gid}, {"$pull": {"members": inp.user_id}})
    # a removed member is no longer an officer either
    await db.groups.update_one({"id": gid}, {"$pull": {"officers": inp.user_id}})
    return {"ok": True}


@api_router.post("/groups/{gid}/officer")
async def set_officer(gid: str, inp: dict = Body(default={}), user=Depends(get_current_user)):
    """Creator/admin: promote or demote a member to clan officer (own chat badge)."""
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_edit(g, user)
    tid = str((inp or {}).get("user_id", "") or "").strip()
    on = bool((inp or {}).get("on"))
    if not tid or tid not in g.get("members", []):
        raise HTTPException(status_code=400, detail="That person isn't a member of this clan")
    if tid == g.get("creator_id"):
        raise HTTPException(status_code=400, detail="The leader is already the top rank")
    op = "$addToSet" if on else "$pull"
    await db.groups.update_one({"id": gid}, {op: {"officers": tid}})
    return {"ok": True, "user_id": tid, "is_officer": on}


@api_router.post("/groups/{gid}/leave")
async def leave_group(gid: str, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    uid = user["user_id"]
    if g.get("creator_id") == uid:
        raise HTTPException(status_code=400, detail="Creators can't leave their own group")
    await db.groups.update_one({"id": gid}, {"$pull": {"members": uid, "pending": uid, "officers": uid}})
    return {"ok": True}


@api_router.post("/groups/{gid}/announce")
async def announce(gid: str, inp: GroupText, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_manage(g, user)
    text = (inp.text or "").strip()[:500]
    if not text:
        raise HTTPException(status_code=400, detail="Announcement text required")
    ann = {"id": new_id("ann"), "text": text, "author": user.get("display_name", "Officer"),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.groups.update_one({"id": gid}, {"$push": {"announcements": ann}})
    return ann


async def _ensure_invite_code(g: dict) -> str:
    """Return the group's invite code, generating & persisting one on first use."""
    code = g.get("invite_code")
    if code:
        return code
    # short, URL/deep-link-safe, collision-checked
    while True:
        code = uuid.uuid4().hex[:8].upper()
        if not await db.groups.find_one({"invite_code": code}):
            break
    await db.groups.update_one({"id": g["id"]}, {"$set": {"invite_code": code}})
    return code


@api_router.get("/groups/{gid}/invite-code")
async def group_invite_code(gid: str, user=Depends(get_current_user)):
    """Creator/admin: fetch (or lazily create) the shareable invite code for a clan."""
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_edit(g, user)
    code = await _ensure_invite_code(g)
    return {"code": code, "group_id": gid, "name": g.get("name")}


@api_router.get("/groups/by-code/{code}")
async def group_by_code(code: str, user=Depends(get_current_user)):
    """Preview a clan from an invite code before joining."""
    g = await db.groups.find_one({"invite_code": (code or "").strip().upper()}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="This invite link is invalid or expired")
    uid = user["user_id"]
    b = await _brief(g, uid)
    creator = await db.users.find_one({"user_id": g.get("creator_id")}, {"_id": 0, "display_name": 1})
    b["creator_name"] = (creator or {}).get("display_name", "—")
    b["already_member"] = uid in g.get("members", [])
    return b


@api_router.post("/groups/join-by-code")
async def join_by_code(payload: dict = Body(default={}), user=Depends(get_current_user)):
    """Instantly join a clan via an invite code — skips the usual approval step.
    Rewards the inviter (ref), the joiner, and the clan itself with bonus XP on a new join."""
    code = str((payload or {}).get("code", "") or "").strip().upper()
    ref = str((payload or {}).get("ref", "") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Invite code required")
    g = await db.groups.find_one({"invite_code": code})
    if not g:
        raise HTTPException(status_code=404, detail="This invite link is invalid or expired")
    uid = user["user_id"]
    if uid in g.get("members", []):
        return {"ok": True, "group_id": g["id"], "name": g.get("name"), "status": "member"}
    if await _count_membership(uid) >= MAX_GROUPS_PER_USER:
        raise HTTPException(status_code=400, detail="You can be in at most 2 groups")
    await db.groups.update_one({"id": g["id"]}, {"$pull": {"pending": uid}, "$addToSet": {"members": uid}})
    # Invite rewards: only ever paid on a user's FIRST join of this clan (prevents leave/rejoin farming).
    first_join = uid not in g.get("reward_claimed", [])
    inviter_rewarded = False
    if first_join:
        await db.groups.update_one({"id": g["id"]}, {"$addToSet": {"reward_claimed": uid}, "$inc": {"xp": INVITE_CLAN_XP}})
        await award_xp(uid, INVITE_JOIN_XP)
        if ref and ref != uid and ref in g.get("members", []):
            if await db.users.find_one({"user_id": ref}, {"_id": 0, "user_id": 1}):
                await award_xp(ref, INVITE_INVITER_XP)
                inviter_rewarded = True
    return {"ok": True, "group_id": g["id"], "name": g.get("name"), "status": "joined",
            "joiner_xp": INVITE_JOIN_XP if first_join else 0,
            "inviter_rewarded": inviter_rewarded, "inviter_xp": INVITE_INVITER_XP if inviter_rewarded else 0}



@api_router.get("/my-groups")
async def my_groups(user=Depends(get_current_user)):
    rows = await db.groups.find({"members": user["user_id"]}, {"_id": 0}).to_list(10)
    return {"groups": [await _brief(g, user["user_id"]) for g in rows]}



# ---------- Group (Clan) Challenges: monthly clan-vs-clan competition ----------
CHALLENGE_MEMBER_XP = 500   # personal XP awarded to every member of the winning clan
CHALLENGE_GROUP_XP = 2500   # bonus XP added to the winning clan itself
CHALLENGE_BADGE = "Clan Champion"


def _require_admin_u(user):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")


async def _challenge_standings(ch: dict) -> list:
    snap = ch.get("start_snapshot", {}) or {}
    groups = await db.groups.find({}, {"_id": 0, "id": 1, "name": 1, "xp": 1, "members": 1}).to_list(500)
    rows = []
    for g in groups:
        gained = max(0, int(g.get("xp", 0)) - int(snap.get(g["id"], 0)))
        meta = _group_meta(g.get("xp", 0))
        rows.append({
            "id": g["id"], "name": g["name"], "color": meta["color"], "badge": meta["badge"],
            "gained": gained, "member_count": len(g.get("members", [])),
        })
    rows.sort(key=lambda r: r["gained"], reverse=True)
    return rows


@api_router.get("/group-challenge")
async def group_challenge(user=Depends(get_current_user)):
    ch = await db.group_challenges.find_one({"status": "active"}, {"_id": 0})
    last = await db.group_challenges.find_one({"status": "ended"}, {"_id": 0}, sort=[("ended_at", -1)])
    my_ids = [g["id"] for g in await db.groups.find({"members": user["user_id"]}, {"_id": 0, "id": 1}).to_list(10)]
    out = {"active": None, "standings": [], "last": None, "is_admin": bool(user.get("is_admin")), "my_group_ids": my_ids}
    if ch:
        standings = await _challenge_standings(ch)
        end_at = ch.get("end_at")
        if isinstance(end_at, datetime):
            if end_at.tzinfo is None:
                end_at = end_at.replace(tzinfo=timezone.utc)
            days_left = max(0, (end_at - datetime.now(timezone.utc)).days)
            end_iso = end_at.isoformat()
        else:
            days_left, end_iso = None, end_at
        out["active"] = {"id": ch["id"], "title": ch["title"], "end_at": end_iso, "days_left": days_left,
                         "reward_xp": ch.get("reward_xp", CHALLENGE_GROUP_XP)}
        out["standings"] = standings[:10]
    if last:
        out["last"] = {"title": last.get("title"), "winner_name": last.get("winner_name"),
                       "winner_group_id": last.get("winner_group_id"),
                       "ended_at": last.get("ended_at").isoformat() if isinstance(last.get("ended_at"), datetime) else last.get("ended_at")}
    return out


@api_router.post("/admin/group-challenge/start")
async def start_group_challenge(payload: dict = Body(default={}), user=Depends(get_current_user)):
    _require_admin_u(user)
    if await db.group_challenges.find_one({"status": "active"}):
        raise HTTPException(status_code=400, detail="A challenge is already running — finalize it first")
    now = datetime.now(timezone.utc)
    title = (str((payload or {}).get("title", "")) or "").strip()[:60] or f"{now.strftime('%B')} Clan Clash"
    days = max(1, min(90, int((payload or {}).get("days", 30))))
    groups = await db.groups.find({}, {"_id": 0, "id": 1, "xp": 1}).to_list(500)
    snap = {g["id"]: int(g.get("xp", 0)) for g in groups}
    doc = {
        "id": new_id("gch"), "title": title, "status": "active",
        "start_at": now, "end_at": now + timedelta(days=days), "start_snapshot": snap,
        "reward_xp": max(0, int((payload or {}).get("reward_xp", CHALLENGE_GROUP_XP))),
        "created_at": now,
    }
    await db.group_challenges.insert_one(doc)
    return {"ok": True, "id": doc["id"], "title": title, "end_at": doc["end_at"].isoformat()}


@api_router.post("/admin/group-challenge/finalize")
async def finalize_group_challenge(user=Depends(get_current_user)):
    _require_admin_u(user)
    ch = await db.group_challenges.find_one({"status": "active"})
    if not ch:
        raise HTTPException(status_code=404, detail="No active challenge")
    standings = await _challenge_standings(ch)
    winner = next((s for s in standings if s["gained"] > 0), None)
    reward_group_xp = int(ch.get("reward_xp", CHALLENGE_GROUP_XP))
    now = datetime.now(timezone.utc)
    winner_name, winner_gid, rewarded_members = None, None, 0
    if winner:
        winner_gid, winner_name = winner["id"], winner["name"]
        g = await db.groups.find_one({"id": winner_gid})
        await db.groups.update_one(
            {"id": winner_gid},
            {"$inc": {"xp": reward_group_xp}, "$set": {"champion": True, "champion_title": ch["title"]}},
        )
        for uid in (g or {}).get("members", []):
            await award_xp(uid, CHALLENGE_MEMBER_XP)
            await db.users.update_one({"user_id": uid}, {"$addToSet": {"badges": CHALLENGE_BADGE}})
            rewarded_members += 1
            try:
                await send_push([uid], {
                    "title": "🏆 Clan Champions!",
                    "message": f"{winner_name} won {ch['title']}! +{CHALLENGE_MEMBER_XP} XP and the Clan Champion badge.",
                    "action_url": "/(tabs)/community",
                }, idempotency_key=f"gch:{ch['id']}:{uid}")
            except Exception:
                pass
    await db.group_challenges.update_one(
        {"id": ch["id"]},
        {"$set": {"status": "ended", "ended_at": now, "winner_group_id": winner_gid,
                  "winner_name": winner_name, "final_standings": standings[:10]}},
    )
    return {"ok": True, "winner_name": winner_name, "winner_group_id": winner_gid,
            "group_xp_awarded": reward_group_xp if winner else 0, "members_rewarded": rewarded_members}
