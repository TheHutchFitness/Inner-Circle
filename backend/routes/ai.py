# ruff: noqa: F403, F405
from shared import *  # noqa: F401,F403


# ---------- AI Athlete's Center ----------
@api_router.post("/ai/build-workout")
async def ai_build(inp: AIWorkoutRequest, user=Depends(get_current_user)):
    if rank_from_xp(user["xp"]) in ("Beginner", "Intermediate") and not user.get("all_rooms_access") and not user.get("athletes_center_access"):
        raise HTTPException(status_code=403, detail="Athlete's Center unlocks at Advanced rank")

    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system_msg = (
        "You are Coach Hutch, an elite strength & performance AI in a hardcore powerlifting app. "
        "Design a highly structured, adaptive weekly training program based on the athlete's stats. "
        "Return a concise markdown program with: (1) Weekly split table, (2) Exact sets/reps/RPE per exercise, "
        "(3) Progression scheme (linear or double-progression), (4) Notes on RPE + technique. "
        "Be aggressive, use lifting-culture language, but be technically sound. Max 450 words.\n\n"
        "AFTER the human-readable program, output on its own line the exact delimiter ===SESSIONS_JSON=== "
        "followed by ONLY a valid JSON object covering EVERY training day of the week, in this schema: "
        '{\"sessions\":[{\"name\":\"Day name\",\"split_key\":\"push|pull|legs|upper|lower\",'
        '\"exercises\":[{\"name\":\"Exercise\",\"sets\":3,\"reps\":5,\"rpe\":8,\"weight_lb\":135}]}]}. '
        "Include one object in the sessions array for EACH training day in the program (match the requested days per week). "
        "Use realistic starting weights derived from the athlete's PRs (e.g. 70-85% for main lifts). "
        "Do not write anything after the JSON."
    )
    prs = user.get("prs", {})
    user_text = (
        f"Athlete profile:\n"
        f"- Rank: {rank_from_xp(user['xp'])}\n"
        f"- Bodyweight: {user.get('bodyweight_lb')} lb, Age: {user.get('age')}, Sex: {user.get('sex')}\n"
        f"- PRs: Bench {prs.get('bench', 0)} / Squat {prs.get('squat', 0)} / Deadlift {prs.get('deadlift', 0)} / OHP {prs.get('ohp', 0)}\n"
        f"- XP: {user.get('xp')}\n\n"
        f"Requested:\n- Goal: {inp.goal}\n- Split preference: {inp.split}\n"
        f"- Days/week: {inp.days_per_week}\n- Experience: {inp.experience}\n- Notes: {inp.notes}"
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ai_{user['user_id']}_{uuid.uuid4().hex[:6]}",
        system_message=system_msg,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        response = await chat.send_message(UserMessage(text=user_text))
    except Exception as e:
        logger.exception("AI build failed")
        raise HTTPException(status_code=500, detail=f"AI error: {e}")

    # Split human text from structured JSON
    program_text = response
    sessions = []
    if "===SESSIONS_JSON===" in response:
        program_text, _, json_part = response.partition("===SESSIONS_JSON===")
        program_text = program_text.strip()
        import json as _json, re as _re
        m = _re.search(r"\{.*\}", json_part, _re.DOTALL)
        if m:
            try:
                parsed = _json.loads(m.group(0))
                sessions = parsed.get("sessions", [])
            except Exception:
                sessions = []

    prog_id = new_id("aiprog")
    doc = {
        "program_id": prog_id,
        "user_id": user["user_id"],
        "request": inp.dict(),
        "program_text": program_text,
        "sessions": sessions,
        "created_at": datetime.now(timezone.utc),
    }
    await db.ai_programs.insert_one(doc)
    return {"program_id": prog_id, "program_text": program_text, "sessions": sessions}


@api_router.get("/ai/programs")
async def my_ai_programs(user=Depends(get_current_user)):
    rows = await db.ai_programs.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows
