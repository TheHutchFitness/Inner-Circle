from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
import bcrypt
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Literal
from datetime import datetime, timedelta, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
SKOOL_CODE = os.environ.get('SKOOL_VERIFICATION_CODE', 'HUTCH-INNER-CIRCLE-2026')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    display_name: str

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class SessionInput(BaseModel):
    session_id: str

class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    bodyweight_lb: Optional[float] = None
    age: Optional[int] = None
    sex: Optional[Literal["male", "female", "other"]] = None
    avatar_id: Optional[str] = None

class WorkoutSet(BaseModel):
    reps: int
    weight_lb: float
    rpe: float

class WorkoutExercise(BaseModel):
    name: str
    sets: List[WorkoutSet]

class WorkoutLog(BaseModel):
    program_id: Optional[str] = None
    workout_name: str
    split_type: str  # ppl_push, ppl_pull, ppl_legs, upper, lower
    exercises: List[WorkoutExercise]
    rating: Optional[int] = None  # 1-5
    critique: Optional[str] = None
    duration_min: Optional[int] = None

class PRUpdate(BaseModel):
    lift: Literal["bench", "squat", "deadlift", "ohp"]
    weight_lb: float

class ChatMessageIn(BaseModel):
    text: str

class SkoolVerifyIn(BaseModel):
    code: str

class SubscriptionSet(BaseModel):
    is_premium: bool

class AIWorkoutRequest(BaseModel):
    goal: str
    split: str
    days_per_week: int
    experience: str
    notes: Optional[str] = ""


# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

def rank_from_xp(xp: int) -> str:
    if xp < 500: return "Beginner"
    if xp < 1500: return "Intermediate"
    if xp < 3500: return "Advanced"
    if xp < 8000: return "Elite"
    return "Freak"

def level_from_xp(xp: int) -> int:
    return 1 + xp // 250

def milestones_for(weight: float) -> List[int]:
    milestones = []
    for m in [135, 185, 225, 275, 315, 365, 405, 455, 495, 585, 675]:
        if weight >= m:
            milestones.append(m)
    return milestones

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def create_session(user_id: str) -> str:
    token = f"tok_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
    })
    return token

def default_user_doc(email: str, name: str, picture: str = "") -> dict:
    return {
        "user_id": new_id("usr"),
        "email": email.lower(),
        "display_name": name,
        "picture": picture,
        "avatar_id": "avatar_ronin",
        "bodyweight_lb": 180,
        "age": 25,
        "sex": "male",
        "xp": 0,
        "level": 1,
        "prs": {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0},
        "badges": [],
        "workouts_logged": 0,
        "streak_days": 0,
        "last_workout_date": None,
        "skool_verified": False,
        "created_at": datetime.now(timezone.utc),
    }

async def award_xp(user_id: str, amount: int):
    await db.users.update_one({"user_id": user_id}, {"$inc": {"xp": amount}})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if user:
        new_level = level_from_xp(user["xp"])
        await db.users.update_one({"user_id": user_id}, {"$set": {"level": new_level}})


# ---------- Auth ----------
@api_router.post("/auth/register")
async def register(inp: RegisterInput):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = default_user_doc(inp.email, inp.display_name)
    doc["password_hash"] = hash_password(inp.password)
    await db.users.insert_one(doc)
    token = await create_session(doc["user_id"])
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    doc["rank"] = rank_from_xp(doc["xp"])
    return {"session_token": token, "user": doc}

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
    user["rank"] = rank_from_xp(user["xp"])
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
    user["rank"] = rank_from_xp(user["xp"])
    return {"session_token": session_token, "user": user}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    user["rank"] = rank_from_xp(user["xp"])
    return user

@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Profile ----------
@api_router.get("/profile/me")
async def profile_me(user=Depends(get_current_user)):
    user["rank"] = rank_from_xp(user["xp"])
    return user

@api_router.patch("/profile/update")
async def update_profile(inp: ProfileUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in inp.dict().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh

@api_router.post("/profile/skool-verify")
async def skool_verify(inp: SkoolVerifyIn, user=Depends(get_current_user)):
    if inp.code.strip().upper() != SKOOL_CODE.upper():
        raise HTTPException(status_code=400, detail="Invalid Skool verification code")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"skool_verified": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


# ---------- Programs ----------
DEFAULT_PROGRAMS = [
    {
        "program_id": "prog_ppl_intermediate",
        "name": "Push/Pull/Legs — Intermediate",
        "split": "ppl",
        "min_rank": "Intermediate",
        "days_per_week": 6,
        "workouts": [
            {"key": "push", "name": "Push Day", "exercises": ["Bench Press", "Overhead Press", "Incline DB Press", "Tricep Pushdown", "Lateral Raises"]},
            {"key": "pull", "name": "Pull Day", "exercises": ["Deadlift", "Barbell Row", "Pull-Ups", "Face Pulls", "Barbell Curl"]},
            {"key": "legs", "name": "Legs Day", "exercises": ["Back Squat", "Romanian Deadlift", "Leg Press", "Standing Calf Raises", "Leg Curl"]},
        ],
    },
    {
        "program_id": "prog_upper_lower",
        "name": "Upper/Lower — Foundational",
        "split": "upper_lower",
        "min_rank": "Beginner",
        "days_per_week": 4,
        "workouts": [
            {"key": "upper", "name": "Upper Body", "exercises": ["Bench Press", "Barbell Row", "Overhead Press", "Pull-Ups", "Bicep Curl"]},
            {"key": "lower", "name": "Lower Body", "exercises": ["Back Squat", "Romanian Deadlift", "Bulgarian Split Squat", "Calf Raises"]},
        ],
    },
    {
        "program_id": "prog_ppl_advanced",
        "name": "Push/Pull/Legs — Advanced Powerbuilder",
        "split": "ppl",
        "min_rank": "Advanced",
        "days_per_week": 6,
        "workouts": [
            {"key": "push", "name": "Push (Heavy)", "exercises": ["Bench Press 5x5", "Weighted Dips", "Overhead Press", "Close-Grip Bench", "DB Lateral Raises"]},
            {"key": "pull", "name": "Pull (Heavy)", "exercises": ["Deadlift 5x3", "Weighted Pull-Ups", "Pendlay Row", "Chest-Supported Row", "EZ Bar Curl"]},
            {"key": "legs", "name": "Legs (Heavy)", "exercises": ["Back Squat 5x5", "Front Squat", "Romanian Deadlift", "Leg Press", "Calf Raises"]},
        ],
    },
]

@api_router.get("/programs")
async def list_programs(user=Depends(get_current_user)):
    return DEFAULT_PROGRAMS


# ---------- Workouts ----------
@api_router.post("/workouts/log")
async def log_workout(inp: WorkoutLog, user=Depends(get_current_user)):
    workout_id = new_id("wk")
    doc = {
        "workout_id": workout_id,
        "user_id": user["user_id"],
        **inp.dict(),
        "logged_at": datetime.now(timezone.utc),
    }
    await db.workouts.insert_one(doc)

    # Update PRs from main lifts
    lift_map = {
        "Bench Press": "bench", "Back Squat": "squat", "Deadlift": "deadlift", "Overhead Press": "ohp",
    }
    prs = user.get("prs", {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0})
    new_badges = set(user.get("badges", []))
    pr_hit = False
    for ex in inp.exercises:
        lift_key = lift_map.get(ex.name)
        if not lift_key:
            continue
        top = max((s.weight_lb for s in ex.sets), default=0)
        if top > prs.get(lift_key, 0):
            prs[lift_key] = top
            pr_hit = True
            for m in milestones_for(top):
                new_badges.add(f"{lift_key}_{m}")

    xp_gain = 50 + (10 * len(inp.exercises))
    if pr_hit:
        xp_gain += 100
        new_badges.add("pr_hunter")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {"prs": prs, "badges": list(new_badges), "last_workout_date": datetime.now(timezone.utc).isoformat()},
            "$inc": {"xp": xp_gain, "workouts_logged": 1},
        },
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["level"] = level_from_xp(fresh["xp"])
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"level": fresh["level"]}})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    doc.pop("_id", None)
    doc["logged_at"] = doc["logged_at"].isoformat()
    return {"workout": doc, "user": fresh, "xp_gained": xp_gain, "pr_hit": pr_hit}

@api_router.get("/workouts/history")
async def workout_history(user=Depends(get_current_user)):
    rows = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).limit(50).to_list(50)
    for r in rows:
        if isinstance(r.get("logged_at"), datetime):
            r["logged_at"] = r["logged_at"].isoformat()
    return rows

@api_router.get("/progress/chart")
async def progress_chart(user=Depends(get_current_user)):
    rows = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", 1).to_list(500)
    series = {"bench": [], "squat": [], "deadlift": [], "ohp": []}
    lift_map = {"Bench Press": "bench", "Back Squat": "squat", "Deadlift": "deadlift", "Overhead Press": "ohp"}
    for r in rows:
        ts = r.get("logged_at")
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        for ex in r.get("exercises", []):
            k = lift_map.get(ex.get("name"))
            if k:
                top = max((s.get("weight_lb", 0) for s in ex.get("sets", [])), default=0)
                if top > 0:
                    series[k].append({"date": ts, "weight": top})
    return series


# ---------- Leaderboards ----------
@api_router.get("/leaderboard/{board_type}")
async def leaderboard(board_type: str, user=Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for u in users:
        u["rank"] = rank_from_xp(u.get("xp", 0))
        u["total_lift"] = sum(u.get("prs", {}).values())
        bw = u.get("bodyweight_lb", 1) or 1
        u["ratio"] = round(u["total_lift"] / bw, 2)
    if board_type == "xp":
        users.sort(key=lambda x: x.get("xp", 0), reverse=True)
        for u in users: u["metric"] = u["xp"]; u["metric_label"] = "XP"
    elif board_type == "strength":
        users.sort(key=lambda x: x["total_lift"], reverse=True)
        for u in users: u["metric"] = u["total_lift"]; u["metric_label"] = "Total (lb)"
    elif board_type == "ratio":
        users.sort(key=lambda x: x["ratio"], reverse=True)
        for u in users: u["metric"] = u["ratio"]; u["metric_label"] = "BW Ratio"
    else:
        raise HTTPException(status_code=400, detail="Invalid board type")
    return users[:50]


# ---------- Chat ----------
@api_router.get("/chat/{room}/messages")
async def get_messages(room: str, user=Depends(get_current_user)):
    if room not in ("main", "the_room"):
        raise HTTPException(status_code=400, detail="Invalid room")
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak"):
        raise HTTPException(status_code=403, detail="The Room requires Elite rank")
    rows = await db.chat_messages.find({"room": room}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    rows.reverse()
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows

@api_router.post("/chat/{room}/messages")
async def post_message(room: str, inp: ChatMessageIn, user=Depends(get_current_user)):
    if room not in ("main", "the_room"):
        raise HTTPException(status_code=400, detail="Invalid room")
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak"):
        raise HTTPException(status_code=403, detail="The Room requires Elite rank")
    msg = {
        "message_id": new_id("msg"),
        "room": room,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_ronin"),
        "rank": rank_from_xp(user["xp"]),
        "skool_verified": user.get("skool_verified", False),
        "text": inp.text[:500],
        "created_at": datetime.now(timezone.utc),
    }
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    msg["created_at"] = msg["created_at"].isoformat()
    return msg


# ---------- AI Athlete's Center ----------
@api_router.post("/ai/build-workout")
async def ai_build(inp: AIWorkoutRequest, user=Depends(get_current_user)):
    if rank_from_xp(user["xp"]) in ("Beginner", "Intermediate"):
        raise HTTPException(status_code=403, detail="Athlete's Center unlocks at Advanced rank")

    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system_msg = (
        "You are Coach Hutch, an elite strength & performance AI in a hardcore powerlifting app. "
        "Design a highly structured, adaptive weekly training program based on the athlete's stats. "
        "Return a concise markdown program with: (1) Weekly split table, (2) Exact sets/reps/RPE per exercise, "
        "(3) Progression scheme (linear or double-progression), (4) Notes on RPE + technique. "
        "Be aggressive, use lifting-culture language, but be technically sound. Max 500 words."
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

    prog_id = new_id("aiprog")
    doc = {
        "program_id": prog_id,
        "user_id": user["user_id"],
        "request": inp.dict(),
        "program_text": response,
        "created_at": datetime.now(timezone.utc),
    }
    await db.ai_programs.insert_one(doc)
    return {"program_id": prog_id, "program_text": response}

@api_router.get("/ai/programs")
async def my_ai_programs(user=Depends(get_current_user)):
    rows = await db.ai_programs.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows


# ---------- Seed ----------
async def seed():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.chat_messages.create_index([("room", 1), ("created_at", -1)])

    # Seed test users
    seeds = [
        {"email": "athlete@test.com", "name": "Ronin", "xp": 1200, "prs": {"bench": 225, "squat": 315, "deadlift": 405, "ohp": 135}, "bw": 180, "avatar": "avatar_ronin"},
        {"email": "elite@test.com", "name": "Kaido", "xp": 4200, "prs": {"bench": 315, "squat": 455, "deadlift": 545, "ohp": 185}, "bw": 200, "avatar": "avatar_kaido"},
        {"email": "freak@test.com", "name": "Titan", "xp": 9500, "prs": {"bench": 405, "squat": 585, "deadlift": 675, "ohp": 245}, "bw": 240, "avatar": "avatar_titan"},
    ]
    for s in seeds:
        existing = await db.users.find_one({"email": s["email"]})
        if existing:
            continue
        badges = set()
        for lift_key, w in s["prs"].items():
            for m in milestones_for(w):
                badges.add(f"{lift_key}_{m}")
        doc = {
            "user_id": new_id("usr"),
            "email": s["email"],
            "display_name": s["name"],
            "picture": "",
            "avatar_id": s["avatar"],
            "bodyweight_lb": s["bw"],
            "age": 27,
            "sex": "male",
            "xp": s["xp"],
            "level": level_from_xp(s["xp"]),
            "prs": s["prs"],
            "badges": list(badges) + ["pr_hunter", "consistency_week1"],
            "workouts_logged": 45,
            "streak_days": 12,
            "last_workout_date": datetime.now(timezone.utc).isoformat(),
            "skool_verified": s["email"] == "elite@test.com",
            "password_hash": hash_password("TestPass123!"),
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(doc)
    # Seed a couple of welcome chat messages
    existing_msg = await db.chat_messages.count_documents({"room": "main"})
    if existing_msg == 0:
        for msg in [
            {"text": "Welcome to the Inner Circle. Post your PRs, ask questions, get after it.", "name": "Coach Hutch", "avatar": "avatar_hutch"},
            {"text": "Just hit 315 bench for the first time. Feeling like a freak.", "name": "Kaido", "avatar": "avatar_kaido"},
        ]:
            await db.chat_messages.insert_one({
                "message_id": new_id("msg"),
                "room": "main",
                "user_id": "system",
                "display_name": msg["name"],
                "avatar_id": msg["avatar"],
                "rank": "Freak",
                "skool_verified": True,
                "text": msg["text"],
                "created_at": datetime.now(timezone.utc),
            })
    logger.info("Seeded DB")


@app.on_event("startup")
async def on_start():
    await seed()

@api_router.get("/")
async def root():
    return {"ok": True, "app": "Hutch's Inner Circle"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
