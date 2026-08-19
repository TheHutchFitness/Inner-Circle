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
    else:
        raise HTTPException(status_code=400, detail="Invalid board type")
    return users[:50]
