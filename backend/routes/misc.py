# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


@api_router.get("/cosmetics")
async def get_cosmetics(user=Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    out = {}
    for slot, items in COSMETICS.items():
        out[slot] = [{**it, "owned": _cosmetic_owned(fresh, it)} for it in items]
    return {
        "catalog": out,
        "loadout": _clean_loadout(fresh),
        "frames": {"unlocked": unlocked_frames_for(fresh), "active": fresh.get("active_frame")},
        "photo_media_id": fresh.get("photo_media_id"),
        "use_photo": bool(fresh.get("use_photo")),
    }


@api_router.get("/")
async def root():
    return {"ok": True, "app": "Hutch's Inner Circle"}
