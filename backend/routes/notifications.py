# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    rows = await db.notifications.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


@api_router.get("/notifications/unread-count")
async def unread_count(user=Depends(get_current_user)):
    n = await db.notifications.count_documents({"user_id": user["user_id"], "read": False})
    return {"count": n}


@api_router.post("/notifications/mark-read")
async def mark_read(user=Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["user_id"], "read": False}, {"$set": {"read": True}}
    )
    return {"ok": True}
