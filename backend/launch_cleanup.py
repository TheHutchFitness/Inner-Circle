"""One-off final launch cleanup for Hutch's Inner Circle.

- Keep ONLY: the 10 AI bots, the owner (the9hutch@gmail.com), and Test@Test.com.
- Max out The Hutch (top rank + every unlockable) and unlock Enhanced.
- Keep exactly one gym "test" and one group "test" (owned by the owner).
- Keep exactly one in-person client (the Test account).
- Wipe all chat messages, in-person data, challenges, and other test activity.
"""
import asyncio

from shared import (
    db, OWNER_EMAILS, COSMETICS, ADMIN_BADGE_OPTIONS, OWNER_ADMIN_SET,
    hash_password, level_from_xp, new_id, milestones_for, datetime, timezone,
)
from routes.gear import (
    PAID_SKINS, FREE_SKINS, QUEST_SKINS, SEASON_SKINS,
    PAID_WEAPONS, FREE_WEAPONS, QUEST_WEAPONS,
)

TEST_EMAIL = "test@test.com"

ALL_SKIN_IDS = [s["id"] for s in (PAID_SKINS + FREE_SKINS + QUEST_SKINS + SEASON_SKINS)]
ALL_WEAPON_IDS = [w["id"] for w in (PAID_WEAPONS + FREE_WEAPONS + QUEST_WEAPONS)]
ALL_COSMETIC_IDS = [it["id"] for items in COSMETICS.values() for it in items]

WIPE_COLLECTIONS = [
    "ai_programs", "announcements", "cardio", "coach_messages", "coach_plans",
    "coach_tts", "custom_program_requests", "featured_members", "group_challenges",
    "heart_rate", "inperson_attendance", "inperson_bookings", "inperson_messages",
    "inperson_programs", "inperson_templates", "judge_comments", "judge_submissions",
    "monthly_programs", "nutrition_logs", "ped_regimens", "personal_quests",
    "quest_claims", "rc_webhook_events", "rival_challenges", "set_presets", "sprints",
    "steps", "store_purchases", "verification_codes", "verified_purchases", "workouts",
    "chat_messages",
]


async def main():
    owner_lc = [e.lower() for e in OWNER_EMAILS]

    # 1) Delete every account except bots, owner(s), and the Test account.
    keep_q = {"$or": [
        {"is_bot": True},
        {"email": {"$in": owner_lc + [TEST_EMAIL]}},
    ]}
    del_res = await db.users.delete_many({"$nor": [keep_q]})
    print(f"Deleted {del_res.deleted_count} non-kept users")

    # 2) Create / normalize the Test account (private test login, hidden from boards).
    test_doc = await db.users.find_one({"email": TEST_EMAIL})
    if not test_doc:
        doc = {
            "user_id": new_id("usr"),
            "email": TEST_EMAIL,
            "display_name": "Test",
            "picture": "",
            "avatar_id": "avatar_white",
            "bodyweight_lb": 180, "age": 25, "sex": "male",
            "xp": 0, "level": 1,
            "prs": {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0},
            "badges": [], "workouts_logged": 0, "streak_days": 0,
            "referral_code": "HIC" + new_id("x")[-6:].upper(),
            "created_at": datetime.now(timezone.utc),
            "password_hash": hash_password("test"),
            "leaderboard_hidden": True,
            "inperson_client": True, "inperson_gym": "test",
            "mode_selected": True, "lite_mode": False,
        }
        await db.users.insert_one(doc)
        print("Created Test@Test.com account")
    else:
        await db.users.update_one({"email": TEST_EMAIL}, {"$set": {
            "display_name": "Test", "password_hash": hash_password("test"),
            "leaderboard_hidden": True, "inperson_client": True, "inperson_gym": "test",
            "is_admin": False, "mode_selected": True,
        }})
        print("Normalized existing Test account")

    # 3) Max out The Hutch — top rank + every unlockable + Enhanced access.
    owner_max = dict(OWNER_ADMIN_SET)
    owner_max.update({
        "xp": 250000,
        "level": level_from_xp(250000),
        "prs": {"squat": 900, "bench": 650, "deadlift": 1005, "ohp": 405},
        "owned_skins": ALL_SKIN_IDS,
        "owned_weapons": ALL_WEAPON_IDS,
        "granted_items": ALL_COSMETIC_IDS,
        "custom_program_purchased": True,
        "athletes_center_access": True,
        "inperson_gym": "test",
        "leaderboard_hidden": True,   # keep owner off the boards (already is_admin)
        "mode_selected": True, "lite_mode": False,
        "age_verified": True,
    })
    # Grant every badge (admin options + all PR milestones).
    all_badges = set(ADMIN_BADGE_OPTIONS)
    for lift, w in owner_max["prs"].items():
        for m in milestones_for(w):
            all_badges.add(f"{lift}_{m}")
    all_badges.update({"pr_hunter", "Clan Champion"})
    owner_max["badges"] = list(all_badges)
    # Own every current store drop.
    store_ids = [s["item_id"] async for s in db.store_items.find({}, {"_id": 0, "item_id": 1})]
    owner_max["owned_store_items"] = store_ids
    for oemail in owner_lc:
        await db.users.update_one({"email": oemail}, {"$set": owner_max})
    print(f"Maxed owner ({len(ALL_SKIN_IDS)} skins, {len(ALL_WEAPON_IDS)} weapons, "
          f"{len(ALL_COSMETIC_IDS)} cosmetics, {len(store_ids)} store items)")

    # 4) Gyms — keep exactly one "test" gym.
    await db.gyms.delete_many({"name_lower": {"$ne": "test"}})
    await db.gyms.update_one(
        {"name_lower": "test"},
        {"$setOnInsert": {"id": new_id("gym"), "name": "test", "name_lower": "test",
                          "verified": True, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    print("Gyms reset to single 'test' gym")

    # 5) Groups — keep exactly one "test" group owned by the owner.
    owner = await db.users.find_one({"email": owner_lc[0]}, {"user_id": 1})
    owner_id = owner["user_id"] if owner else None
    await db.groups.delete_many({"name_lower": {"$ne": "test"}})
    existing_grp = await db.groups.find_one({"name_lower": "test"})
    if existing_grp:
        await db.groups.update_one({"name_lower": "test"}, {"$set": {
            "name": "test", "creator_id": owner_id, "members": [owner_id], "pending": [],
            "xp": 0, "announcements": [],
        }, "$unset": {"champion": "", "champion_title": ""}})
    else:
        await db.groups.insert_one({
            "id": new_id("grp"), "name": "test", "name_lower": "test",
            "description": "Private test clan", "creator_id": owner_id,
            "members": [owner_id], "pending": [], "xp": 0, "announcements": [],
            "created_at": datetime.now(timezone.utc),
        })
    print("Groups reset to single 'test' group")

    # 6) In-person clients — only the Test account stays a client.
    await db.users.update_many(
        {"email": {"$nin": [TEST_EMAIL]}, "inperson_client": True},
        {"$set": {"inperson_client": False}},
    )
    await db.users.update_many({}, {"$set": {"inperson_request": False}})
    print("In-person clients reset to single 'test' client")

    # 7) Wipe all test activity + force everyone to re-login.
    for coll in WIPE_COLLECTIONS:
        r = await db[coll].delete_many({})
        if r.deleted_count:
            print(f"  wiped {coll}: {r.deleted_count}")
    await db.user_sessions.delete_many({})
    print("Cleared all sessions")
    print("DONE — launch cleanup complete.")


if __name__ == "__main__":
    asyncio.run(main())
