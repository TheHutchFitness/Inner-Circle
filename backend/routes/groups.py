# ruff: noqa: F403, F405
"""Clans / Groups: member-created groups with a home page, announcements,
a members list, an exclusive group chat, XP and levels."""
from shared import *  # noqa: F401,F403

MAX_GROUPS_PER_USER = 2


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


async def _brief(g: dict, uid: str) -> dict:
    members = g.get("members", [])
    role = "creator" if g.get("creator_id") == uid else ("member" if uid in members else ("pending" if uid in g.get("pending", []) else "none"))
    return {
        "id": g["id"], "name": g["name"], "description": g.get("description", ""),
        "creator_id": g.get("creator_id"), "member_count": len(members),
        "xp": g.get("xp", 0),
        **_group_meta(g.get("xp", 0)),
        "role": role, "pending_count": len(g.get("pending", [])),
    }


async def _count_membership(uid: str) -> int:
    return await db.groups.count_documents({"members": uid})


@api_router.get("/groups")
async def list_groups(user=Depends(get_current_user)):
    rows = await db.groups.find({}, {"_id": 0}).sort("xp", -1).to_list(500)
    return {
        "groups": [await _brief(g, user["user_id"]) for g in rows],
        "can_create": _can_create(user),
        "my_group_count": await _count_membership(user["user_id"]),
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


async def _members_public(ids: list) -> list:
    out = []
    for uid in ids:
        u = await db.users.find_one({"user_id": uid}, {"_id": 0, "user_id": 1, "display_name": 1, "avatar_id": 1, "xp": 1, "loadout": 1, "sex": 1})
        if u:
            u["rank"] = rank_from_xp(u.get("xp", 0))
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
    b = await _brief(g, uid)
    b["members"] = await _members_public(g.get("members", []))
    b["announcements"] = sorted(g.get("announcements", []), key=lambda a: a.get("created_at", ""), reverse=True)[:20]
    b["can_edit"] = can_edit
    b["pending"] = await _members_public(g.get("pending", [])) if can_edit else []
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


@api_router.post("/groups/{gid}/approve")
async def approve_member(gid: str, inp: GroupTarget, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_edit(g, user)
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
    _require_edit(g, user)
    await db.groups.update_one({"id": gid}, {"$pull": {"pending": inp.user_id}})
    return {"ok": True}


@api_router.post("/groups/{gid}/invite")
async def invite_member(gid: str, inp: GroupTarget, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_edit(g, user)
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
    return {"ok": True}


@api_router.post("/groups/{gid}/leave")
async def leave_group(gid: str, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    uid = user["user_id"]
    if g.get("creator_id") == uid:
        raise HTTPException(status_code=400, detail="Creators can't leave their own group")
    await db.groups.update_one({"id": gid}, {"$pull": {"members": uid, "pending": uid}})
    return {"ok": True}


@api_router.post("/groups/{gid}/announce")
async def announce(gid: str, inp: GroupText, user=Depends(get_current_user)):
    g = await db.groups.find_one({"id": gid})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_edit(g, user)
    text = (inp.text or "").strip()[:500]
    if not text:
        raise HTTPException(status_code=400, detail="Announcement text required")
    ann = {"id": new_id("ann"), "text": text, "author": user.get("display_name", "Creator"),
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.groups.update_one({"id": gid}, {"$push": {"announcements": ann}})
    return ann


@api_router.get("/my-groups")
async def my_groups(user=Depends(get_current_user)):
    rows = await db.groups.find({"members": user["user_id"]}, {"_id": 0}).to_list(10)
    return {"groups": [await _brief(g, user["user_id"]) for g in rows]}
