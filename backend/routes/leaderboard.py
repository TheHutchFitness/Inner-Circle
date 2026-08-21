# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


# ---------- Leaderboards ----------
@api_router.get("/leaderboard/{board_type}")
async def leaderboard(board_type: str, filter: str = "all", gym: str = "", user=Depends(get_current_user)):
    q = {"is_admin": {"$ne": True}, "is_bot": {"$ne": True}}
    if filter == "enhanced":
        q = {"enhanced": True, "is_admin": {"$ne": True}, "is_bot": {"$ne": True}}
    elif filter == "natural":
        q = {"enhanced": {"$ne": True}, "is_admin": {"$ne": True}, "is_bot": {"$ne": True}}
    q["leaderboard_hidden"] = {"$ne": True}
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(1000)
    # Gym-only ranking: keep athletes whose gym matches (case-insensitive)
    if gym.strip():
        gl = gym.strip().lower()
        users = [u for u in users if ((u.get("inperson_gym", "") or "").strip().lower() == gl)]
    for u in users:
        u["rank"] = rank_from_xp(u.get("xp", 0))
        u["total_lift"] = sum(u.get("prs", {}).values())
        bw = u.get("bodyweight_lb", 1) or 1
        u["ratio"] = round(u["total_lift"] / bw, 2)
    if board_type == "xp":
        users.sort(key=lambda x: x.get("xp", 0), reverse=True)
        for u in users:
            u["metric"] = level_from_xp(u.get("xp", 0))
            u["metric_label"] = "LEVEL"
    elif board_type == "strength":
        users.sort(key=lambda x: x["total_lift"], reverse=True)
        for u in users: u["metric"] = u["total_lift"]; u["metric_label"] = "Total (lb)"
    elif board_type == "ratio":
        users.sort(key=lambda x: x["ratio"], reverse=True)
        for u in users: u["metric"] = u["ratio"]; u["metric_label"] = "BW Ratio"
    elif board_type in ("squat", "bench", "deadlift", "ohp"):
        # Individual compound-lift boards (by PR)
        for u in users:
            u["metric"] = u.get("prs", {}).get(board_type, 0) or 0
            u["metric_label"] = f"{board_type.upper()} (lb)"
        users = [u for u in users if u["metric"] > 0]
        users.sort(key=lambda x: x["metric"], reverse=True)
    elif board_type == "season":
        # Bosses defeated during the current season (calendar quarter)
        now = datetime.now(timezone.utc)
        q_start_month = ((now.month - 1) // 3) * 3 + 1
        season_start = datetime(now.year, q_start_month, 1, tzinfo=timezone.utc)
        pipeline = [
            {"$match": {"quest_key": {"$regex": "^boss:"}}},
            {"$group": {"_id": "$user_id", "n": {"$sum": 1},
                        "recent": {"$max": "$claimed_at"}}},
        ]
        counts = {}
        async for row in db.quest_claims.aggregate(pipeline):
            recent = row.get("recent")
            # count claims made this season (fallback: count all if timestamps missing)
            counts[row["_id"]] = row["n"] if (recent is None or recent >= season_start) else 0
        for u in users:
            u["metric"] = counts.get(u["user_id"], 0)
            u["metric_label"] = "Bosses"
        users = [u for u in users if u["metric"] > 0]
        users.sort(key=lambda x: x["metric"], reverse=True)
    else:
        raise HTTPException(status_code=400, detail="Invalid board type")
    # SECURITY: never return raw user docs (they hold email/phone/apple_sub/etc.).
    # Emit only display + cosmetic + computed metric fields the leaderboard UI needs.
    def _safe(u: dict) -> dict:
        return {
            "user_id": u.get("user_id"),
            "display_name": u.get("display_name", "Athlete"),
            "avatar_id": u.get("avatar_id", "avatar_white"),
            "sex": u.get("sex", "male"),
            "xp": u.get("xp", 0),
            "rank": u.get("rank"),
            "level": level_from_xp(u.get("xp", 0)),
            "total_lift": u.get("total_lift", 0),
            "ratio": u.get("ratio", 0),
            "metric": u.get("metric", 0),
            "metric_label": u.get("metric_label", ""),
            "enhanced": bool(u.get("enhanced")),
            "founder_backer": bool(u.get("founder_backer")),
            "skool_verified": bool(u.get("skool_verified")),
            "loadout": u.get("loadout"),
            "photo_media_id": u.get("photo_media_id"),
            "use_photo": bool(u.get("use_photo")),
            "active_frame": u.get("active_frame"),
            "equipped_skin": u.get("equipped_skin"),
            "equipped_weapon": u.get("equipped_weapon"),
            "equipped_hair": u.get("equipped_hair"),
            "equipped_beard": u.get("equipped_beard"),
            "equipped_pet": u.get("equipped_pet"),
            "inperson_gym": u.get("inperson_gym", "") or "",
        }
    return [_safe(u) for u in users[:50]]


@api_router.get("/leaderboard/season/history")
async def season_history(user=Depends(get_current_user)):
    """Hall of Fame: top boss-slayer of each PAST season (calendar quarter)."""
    champs = await season_champions_map()
    if not champs:
        return []
    champ_ids = {v["user_id"] for v in champs.values()}
    users = await db.users.find(
        {"user_id": {"$in": list(champ_ids)}},
        {"_id": 0, "password_hash": 0},
    ).to_list(1000)
    umap = {u["user_id"]: u for u in users}
    out = []
    for label, v in champs.items():
        u = umap.get(v["user_id"])
        if not u:
            continue
        out.append({
            "season": label,
            "bosses": v["bosses"],
            "user_id": v["user_id"],
            "display_name": u.get("display_name", "Athlete"),
            "avatar_id": u.get("avatar_id", "avatar_white"),
            "sex": u.get("sex"),
            "equipped_skin": u.get("equipped_skin"),
            "equipped_weapon": u.get("equipped_weapon"),
            "equipped_hair": u.get("equipped_hair"),
            "equipped_beard": u.get("equipped_beard"),
            "rank": rank_from_xp(u.get("xp", 0)),
            "level": level_from_xp(u.get("xp", 0)),
            "founder_backer": bool(u.get("founder_backer")),
        })
    out.sort(key=lambda x: x["season"], reverse=True)
    return out
