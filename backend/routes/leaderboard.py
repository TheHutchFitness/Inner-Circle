# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


# ---------- Leaderboards ----------
@api_router.get("/leaderboard/{board_type}")
async def leaderboard(board_type: str, filter: str = "all", user=Depends(get_current_user)):
    q = {"is_admin": {"$ne": True}}
    if filter == "enhanced":
        q = {"enhanced": True, "is_admin": {"$ne": True}}
    elif filter == "natural":
        q = {"enhanced": {"$ne": True}, "is_admin": {"$ne": True}}
    users = await db.users.find(q, {"_id": 0, "password_hash": 0}).to_list(1000)
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
    return users[:50]
