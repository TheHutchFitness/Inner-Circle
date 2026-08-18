from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, UploadFile, File, Form, Request
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import uuid
import httpx
import bcrypt
import secrets
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
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
SKOOL_CODE = os.environ.get('SKOOL_VERIFICATION_CODE', '4882')

# ---------- RevenueCat server-side purchase verification ----------
# Paid lifetime tiers (Custom Program $200, Founder Backer $25) grant PERSISTENT
# server-side privileges, so they can NOT be granted on the client's word alone.
# RevenueCat posts a signed purchase event to /api/revenuecat/webhook (authenticated
# by this shared secret, configured in the RevenueCat dashboard) — that webhook is the
# ONLY trusted source that can write to the `verified_purchases` collection and flip the
# grant flags. The client /unlock and /back endpoints fail-closed unless a verified
# purchase exists, closing the free-unlock exploit.
RC_WEBHOOK_AUTH = os.environ.get("REVENUECAT_WEBHOOK_AUTH", "").strip()
CUSTOM_PROGRAM_ENTITLEMENT = "custom_program"
BACKER_ENTITLEMENT = "backer"
# RevenueCat event types that represent an active/granted purchase
RC_GRANT_EVENTS = {
    "INITIAL_PURCHASE", "NON_RENEWING_PURCHASE", "RENEWAL",
    "PRODUCT_CHANGE", "UNCANCELLATION", "TRANSFER", "SUBSCRIPTION_EXTENDED",
}
# Event types that revoke access (refund / chargeback)
RC_REVOKE_EVENTS = {"REFUND"}
# Only the actual "money changed hands" moments trigger a thank-you receipt email
RC_RECEIPT_EVENTS = {"INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"}

# ---------- Emergent Object Storage (chat media) ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
STORAGE_APP_NAME = "hutchs-inner-circle"
_storage_key: Optional[str] = None

# ---------- Emergent Managed Email (Resend) ----------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"  # constant, never from env
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "Hutch's Inner Circle")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    sex: Optional[Literal["male", "female", "other"]] = None

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
    source: Optional[str] = None  # "ai" | "monthly" | None
    monthly_day: Optional[int] = None

class MonthlyGenIn(BaseModel):
    split: str

class GoalsIn(BaseModel):
    goals: str

class PersonalCompleteIn(BaseModel):
    quest_id: str

class PRUpdate(BaseModel):
    lift: Literal["bench", "squat", "deadlift", "ohp"]
    weight_lb: float

class ChatMessageIn(BaseModel):
    text: Optional[str] = ""
    media_id: Optional[str] = None

class PhoneSendIn(BaseModel):
    phone: str

class CodeConfirmIn(BaseModel):
    code: str

class SkoolVerifyIn(BaseModel):
    code: str

class SubscriptionSet(BaseModel):
    is_premium: bool

class BackgroundSet(BaseModel):
    background_id: str

class AIWorkoutRequest(BaseModel):
    goal: str
    split: str
    days_per_week: int
    experience: str
    notes: Optional[str] = ""

class CardioLog(BaseModel):
    activity_type: Literal["run", "bike"]
    distance_km: float
    duration_s: int
    elevation_gain_m: Optional[float] = 0
    temperature_c: Optional[float] = None
    avg_pace_min_km: Optional[float] = None
    route: Optional[List[dict]] = None

class SprintLog(BaseModel):
    sprint_type: Literal["40yd", "100m"]
    seconds: float

class CustomProgramIntake(BaseModel):
    goals: str
    injuries: Optional[str] = ""
    schedule: Optional[str] = ""
    days_per_week: Optional[str] = ""
    experience: Optional[str] = ""
    contact_method: Optional[str] = "email"
    contact_value: Optional[str] = ""
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

# 8-tier rank ladder — each rank spans exactly 10 app levels (level = 1 + xp//250)
RANK_ORDER = ["Beginner", "Intermediate", "Advanced", "Vanguard", "Warrior", "Boss", "Elite", "Freak"]
LEVELS_PER_RANK = 10

def level_from_xp(xp: int) -> int:
    return 1 + xp // 250

def rank_from_xp(xp: int) -> str:
    lvl = level_from_xp(xp)
    idx = min((lvl - 1) // LEVELS_PER_RANK, len(RANK_ORDER) - 1)
    return RANK_ORDER[idx]

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
        "email_verified": False,
        "phone_verified": False,
        "phone": None,
        "athletes_center_access": False,
        "custom_program_purchased": False,
        "active_background": "bg_default",
        "created_at": datetime.now(timezone.utc),
    }

async def award_xp(user_id: str, amount: int):
    await db.users.update_one({"user_id": user_id}, {"$inc": {"xp": amount}})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if user:
        new_level = level_from_xp(user["xp"])
        await db.users.update_one({"user_id": user_id}, {"$set": {"level": new_level}})


# ---------- Object Storage helpers ----------
async def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY})
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key

async def storage_put(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = await init_storage()
    async with httpx.AsyncClient(timeout=120) as http:
        r = await http.put(f"{STORAGE_URL}/objects/{path}",
                           headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
    if r.status_code == 503:  # stale key — re-init once
        _storage_key = None
        key = await init_storage()
        async with httpx.AsyncClient(timeout=120) as http:
            r = await http.put(f"{STORAGE_URL}/objects/{path}",
                               headers={"X-Storage-Key": key, "Content-Type": content_type}, content=data)
    r.raise_for_status()
    return r.json()

async def storage_get(path: str) -> bytes:
    global _storage_key
    key = await init_storage()
    async with httpx.AsyncClient(timeout=60) as http:
        r = await http.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
    if r.status_code == 503:
        _storage_key = None
        key = await init_storage()
        async with httpx.AsyncClient(timeout=60) as http:
            r = await http.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key})
    r.raise_for_status()
    return r.content


# ---------- Email guardrail gate (per Emergent Resend playbook — do not weaken) ----------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for mm in _HOSTISH.finditer(text):
            if not _same_site(mm.group(1).lower(), real):
                raise ValueError(f"Anchor text {mm.group(1)!r} != real link host {real!r} (G3)")

async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                   headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=400, detail="Couldn't send to that email address — try phone verification instead")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Email send error: {e}")
        raise HTTPException(status_code=400, detail="Failed to send email — try again")


# ---------- Auth ----------
@api_router.post("/auth/register")
async def register(inp: RegisterInput):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = default_user_doc(inp.email, inp.display_name)
    doc["password_hash"] = hash_password(inp.password)
    if inp.sex:
        doc["sex"] = inp.sex
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

@api_router.get("/profile/attributes")
async def profile_attributes(user=Depends(get_current_user)):
    prs = user.get("prs", {}) or {}
    bench = prs.get("bench", 0); squat = prs.get("squat", 0)
    deadlift = prs.get("deadlift", 0); ohp = prs.get("ohp", 0)
    bw = max(1, user.get("bodyweight_lb", 1) or 1)
    total = bench + squat + deadlift + ohp
    workouts = user.get("workouts_logged", 0) or 0
    streak = user.get("streak_days", 0) or 0
    xp = user.get("xp", 0) or 0
    lvl = level_from_xp(xp)
    badges = len(user.get("badges", []) or [])

    def clamp(v):
        return max(5, min(100, round(v)))

    # In-app percentile for strength total (global-in-app comparison)
    all_totals = []
    async for u in db.users.find({}, {"_id": 0, "prs": 1}):
        p = u.get("prs", {}) or {}
        all_totals.append(p.get("bench", 0) + p.get("squat", 0) + p.get("deadlift", 0) + p.get("ohp", 0))
    if all_totals:
        below = sum(1 for t in all_totals if t <= total)
        app_percentile = round(below / len(all_totals) * 100)
    else:
        app_percentile = 50

    # Global benchmark: approx elite raw total ~1450 lb (bench 350 + squat 500 + dead 600 ... scaled)
    global_strength = total / 1450 * 100
    strength = clamp(0.6 * global_strength + 0.4 * app_percentile)
    # Power = relative strength (total per bodyweight); ~7x bw = elite
    power = clamp((total / bw) / 7.0 * 100)
    # Speed = explosive/press proxy (ohp relative) + training frequency, boosted by sprint times
    speed_base = (ohp / bw) / 0.9 * 60 + min(40, workouts * 0.8)
    sprints = user.get("sprints", {}) or {}
    sprint_scores = []
    if sprints.get("40yd"):
        sprint_scores.append(max(0, min(100, (6.5 - sprints["40yd"]) / (6.5 - 4.3) * 100)))
    if sprints.get("100m"):
        sprint_scores.append(max(0, min(100, (18.0 - sprints["100m"]) / (18.0 - 11.0) * 100)))
    if sprint_scores:
        speed = clamp(0.5 * speed_base + 0.5 * (sum(sprint_scores) / len(sprint_scores)))
    else:
        speed = clamp(speed_base)
    # Endurance = volume/consistency, boosted by cardio distance + daily steps
    cardio_km = 0.0
    async for c in db.cardio.find({"user_id": user["user_id"]}, {"_id": 0, "distance_km": 1}):
        cardio_km += c.get("distance_km", 0) or 0
    step_rows = await db.steps.find({"user_id": user["user_id"]}, {"_id": 0, "steps": 1}).sort("date", -1).limit(7).to_list(7)
    avg_steps = (sum(r.get("steps", 0) or 0 for r in step_rows) / len(step_rows)) if step_rows else 0
    endurance = clamp(workouts * 1.0 + streak * 1.6 + min(30, cardio_km * 1.2) + min(20, avg_steps / 10000 * 20))
    # Grit = progression + achievements
    grit = clamp(lvl * 3.2 + badges * 3.5)

    stats = {"strength": strength, "power": power, "speed": speed, "endurance": endurance, "grit": grit}
    overall = round(sum(stats.values()) / len(stats))

    # Class title from dominant axis
    dominant = max(stats, key=stats.get)
    spread = max(stats.values()) - min(stats.values())
    titles = {
        "strength": "JUGGERNAUT", "power": "POWERHOUSE", "speed": "STRIKER",
        "endurance": "MARATHONER", "grit": "WARLORD",
    }
    class_title = "ALL-ROUNDER" if spread <= 12 else titles[dominant]

    # Class tier from overall attribute score
    if overall < 25: tier = "E"
    elif overall < 40: tier = "D"
    elif overall < 55: tier = "C"
    elif overall < 70: tier = "B"
    elif overall < 85: tier = "A"
    else: tier = "S"

    return {
        "stats": stats,
        "overall": overall,
        "class_title": class_title,
        "class_tier": tier,
        "dominant": dominant,
        "app_percentile": app_percentile,
    }

# ---------- Cardio (Strava-style) ----------
@api_router.post("/cardio/log")
async def log_cardio(inp: CardioLog, user=Depends(get_current_user)):
    speed_kmh = (inp.distance_km / (inp.duration_s / 3600)) if inp.duration_s > 0 else 0
    doc = {
        "cardio_id": new_id("cardio"),
        "user_id": user["user_id"],
        "activity_type": inp.activity_type,
        "distance_km": round(inp.distance_km, 3),
        "duration_s": inp.duration_s,
        "elevation_gain_m": round(inp.elevation_gain_m or 0, 1),
        "temperature_c": inp.temperature_c,
        "avg_pace_min_km": inp.avg_pace_min_km,
        "avg_speed_kmh": round(speed_kmh, 2),
        "route": (inp.route or [])[:2000],
        "logged_at": datetime.now(timezone.utc),
    }
    await db.cardio.insert_one(doc)
    xp_gain = int(30 + inp.distance_km * 10)
    await award_xp(user["user_id"], xp_gain)
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    doc.pop("_id", None)
    doc["logged_at"] = doc["logged_at"].isoformat()
    return {"cardio": doc, "user": fresh, "xp_gained": xp_gain}

@api_router.get("/cardio/history")
async def cardio_history(user=Depends(get_current_user)):
    rows = await db.cardio.find({"user_id": user["user_id"]}, {"_id": 0, "route": 0}).sort("logged_at", -1).limit(50).to_list(50)
    for r in rows:
        if isinstance(r.get("logged_at"), datetime):
            r["logged_at"] = r["logged_at"].isoformat()
    return rows

@api_router.get("/cardio/leaderboard")
async def cardio_leaderboard(board: str = "overall", activity: str = "run", dist: float = 5, user=Depends(get_current_user)):
    q = {"activity_type": activity}
    rows = await db.cardio.find(q, {"_id": 0, "route": 0}).to_list(5000)
    # group by user
    by_user: dict = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r)
    users = {u["user_id"]: u for u in await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(2000)}
    entries = []
    for uid, sessions in by_user.items():
        u = users.get(uid)
        if not u:
            continue
        if board == "single":
            metric = max(s["distance_km"] for s in sessions)
            label = "KM (single)"
        elif board == "overall":
            metric = round(sum(s["distance_km"] for s in sessions), 1)
            label = "KM total"
        else:  # speed at distance category
            qualifying = [s for s in sessions if s["distance_km"] >= dist]
            if not qualifying:
                continue
            metric = max(s["avg_speed_kmh"] for s in qualifying)
            label = f"km/h @ {int(dist)}k+"
        entries.append({
            "user_id": uid,
            "display_name": u.get("display_name"),
            "avatar_id": u.get("avatar_id"),
            "rank": rank_from_xp(u.get("xp", 0)),
            "metric": round(metric, 2),
            "metric_label": label,
        })
    entries.sort(key=lambda x: x["metric"], reverse=True)
    return entries[:50]

@api_router.post("/sprint/log")
async def log_sprint(inp: SprintLog, user=Depends(get_current_user)):
    sprints = user.get("sprints", {}) or {}
    prev = sprints.get(inp.sprint_type)
    is_best = prev is None or inp.seconds < prev
    if is_best:
        sprints[inp.sprint_type] = round(inp.seconds, 2)
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"sprints": sprints}})
        await award_xp(user["user_id"], 40)
    await db.sprints.insert_one({"user_id": user["user_id"], "sprint_type": inp.sprint_type, "seconds": inp.seconds, "logged_at": datetime.now(timezone.utc)})
    return {"best": sprints.get(inp.sprint_type), "is_best": is_best}

@api_router.get("/sprint/me")
async def my_sprints(user=Depends(get_current_user)):
    return {"sprints": user.get("sprints", {}) or {}}

class StepsLog(BaseModel):
    steps: int
    date: Optional[str] = None

@api_router.post("/steps/log")
async def log_steps(inp: StepsLog, user=Depends(get_current_user)):
    day = inp.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    await db.steps.update_one(
        {"user_id": user["user_id"], "date": day},
        {"$set": {"steps": inp.steps, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"date": day, "steps": inp.steps}

@api_router.get("/steps/today")
async def steps_today(user=Depends(get_current_user)):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = await db.steps.find_one({"user_id": user["user_id"], "date": day}, {"_id": 0})
    return {"date": day, "steps": (row or {}).get("steps", 0), "goal": 10000}

class HeartRateLog(BaseModel):
    resting_bpm: Optional[int] = None
    avg_bpm: Optional[int] = None
    max_bpm: Optional[int] = None
    date: Optional[str] = None

@api_router.post("/heart-rate/log")
async def log_heart_rate(inp: HeartRateLog, user=Depends(get_current_user)):
    day = inp.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fields = {k: v for k, v in {"resting_bpm": inp.resting_bpm, "avg_bpm": inp.avg_bpm, "max_bpm": inp.max_bpm}.items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="No heart-rate values provided")
    fields["updated_at"] = datetime.now(timezone.utc)
    await db.heart_rate.update_one({"user_id": user["user_id"], "date": day}, {"$set": fields}, upsert=True)
    return {"date": day, "resting_bpm": inp.resting_bpm, "avg_bpm": inp.avg_bpm, "max_bpm": inp.max_bpm}

@api_router.get("/heart-rate/today")
async def heart_rate_today(user=Depends(get_current_user)):
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    row = await db.heart_rate.find_one({"user_id": user["user_id"], "date": day}, {"_id": 0, "updated_at": 0})
    return row or {"date": day, "resting_bpm": None, "avg_bpm": None, "max_bpm": None}

@api_router.get("/active-count")
async def active_count(user=Depends(get_current_user)):
    since = datetime.now(timezone.utc) - timedelta(minutes=30)
    try:
        real = await db.user_sessions.count_documents({"created_at": {"$gte": since}})
    except Exception:
        real = 0
    return {"active": max(10, real)}

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


# ---------- Account verification (email + phone) ----------
VERIFY_TTL_MIN = 10

def gen_verify_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"

async def _store_code(user_id: str, channel: str, code: str, extra: Optional[dict] = None):
    doc = {
        "user_id": user_id, "channel": channel, "code": code,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=VERIFY_TTL_MIN),
        "attempts": 0,
    }
    if extra:
        doc.update(extra)
    await db.verification_codes.replace_one({"user_id": user_id, "channel": channel}, doc, upsert=True)

async def _check_send_rate(user_id: str, channel: str):
    rec = await db.verification_codes.find_one({"user_id": user_id, "channel": channel}, {"_id": 0})
    if rec:
        created = rec.get("created_at")
        if isinstance(created, datetime):
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if (datetime.now(timezone.utc) - created).total_seconds() < 60:
                raise HTTPException(status_code=429, detail="Wait 60s before requesting another code")

async def _consume_code(user_id: str, channel: str, code: str) -> dict:
    rec = await db.verification_codes.find_one({"user_id": user_id, "channel": channel})
    if not rec:
        raise HTTPException(status_code=400, detail="No code requested — send one first")
    exp = rec.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Code expired — request a new one")
    if rec.get("attempts", 0) >= 5:
        raise HTTPException(status_code=400, detail="Too many attempts — request a new code")
    if code.strip() != rec["code"]:
        await db.verification_codes.update_one({"_id": rec["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Invalid code")
    await db.verification_codes.delete_one({"_id": rec["_id"]})
    return rec

@api_router.post("/verify/email/send")
async def verify_email_send(user=Depends(get_current_user)):
    if user.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email already verified")
    await _check_send_rate(user["user_id"], "email")
    code = gen_verify_code()
    await _store_code(user["user_id"], "email", code)
    name = user.get("display_name", "Athlete")
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;'
        f'background:#0a0a12;color:#e8f4ff">'
        f'<h2 style="color:#22d3ee;letter-spacing:2px;margin:0 0 16px">{escape(EMAIL_FROM_NAME.upper())}</h2>'
        f'<p>Hey {escape(name)}, your verification code is:</p>'
        f'<p style="font-size:34px;font-weight:bold;letter-spacing:8px;color:#22d3ee;margin:16px 0">{code}</p>'
        f'<p>Enter it in the app within {VERIFY_TTL_MIN} minutes to verify your email and unlock media sharing.</p>'
        f'<p style="font-size:12px;color:#888">Sent by {escape(EMAIL_FROM_NAME)}. We never ask for your password by email. '
        f'If you didn\'t request this, ignore it.</p>'
        f'</td></tr></table>'
    )
    await send_email(to=user["email"], subject=f"{code} is your verification code", html=html)
    return {"status": "sent", "email": user["email"]}

@api_router.post("/verify/email/confirm")
async def verify_email_confirm(inp: CodeConfirmIn, user=Depends(get_current_user)):
    await _consume_code(user["user_id"], "email", inp.code)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"email_verified": True}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh

@api_router.post("/verify/phone/send")
async def verify_phone_send(inp: PhoneSendIn, user=Depends(get_current_user)):
    digits = re.sub(r"\D", "", inp.phone)
    if not (7 <= len(digits) <= 15):
        raise HTTPException(status_code=400, detail="Enter a valid phone number")
    await _check_send_rate(user["user_id"], "phone")
    code = gen_verify_code()
    await _store_code(user["user_id"], "phone", code, {"phone": inp.phone.strip()})
    # MOCK SMS: Twilio keys not configured yet — code is returned so the app can show it on screen.
    logger.info(f"[MOCK SMS] verification code {code} for {inp.phone}")
    return {"status": "sent", "mock": True, "code": code}

@api_router.post("/verify/phone/confirm")
async def verify_phone_confirm(inp: CodeConfirmIn, user=Depends(get_current_user)):
    rec = await _consume_code(user["user_id"], "phone", inp.code)
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"phone_verified": True, "phone": rec.get("phone")}})
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


# ---------- Exercise Library + Split Templates ----------
EXERCISE_LIBRARY = [
    # Chest
    {"name": "Barbell Bench Press", "category": "Chest"},
    {"name": "Incline Barbell Bench Press", "category": "Chest"},
    {"name": "Decline Barbell Bench Press", "category": "Chest"},
    {"name": "Dumbbell Bench Press", "category": "Chest"},
    {"name": "Incline Dumbbell Press", "category": "Chest"},
    {"name": "Machine Chest Press", "category": "Chest"},
    {"name": "Cable Fly", "category": "Chest"},
    {"name": "Pec Deck", "category": "Chest"},
    {"name": "Dumbbell Fly", "category": "Chest"},
    {"name": "Push-Up", "category": "Chest"},
    {"name": "Weighted Dip", "category": "Chest"},
    # Back
    {"name": "Deadlift", "category": "Back"},
    {"name": "Barbell Row", "category": "Back"},
    {"name": "Pendlay Row", "category": "Back"},
    {"name": "T-Bar Row", "category": "Back"},
    {"name": "Chest-Supported Row", "category": "Back"},
    {"name": "Seated Cable Row", "category": "Back"},
    {"name": "Lat Pulldown", "category": "Back"},
    {"name": "Pulldowns", "category": "Back"},
    {"name": "Pull-Up", "category": "Back"},
    {"name": "Chin-Up", "category": "Back"},
    {"name": "Dumbbell Row", "category": "Back"},
    {"name": "Face Pull", "category": "Back"},
    {"name": "Straight-Arm Pulldown", "category": "Back"},
    {"name": "Rack Pull", "category": "Back"},
    # Shoulders
    {"name": "Overhead Press", "category": "Shoulders"},
    {"name": "Seated Dumbbell Press", "category": "Shoulders"},
    {"name": "Arnold Press", "category": "Shoulders"},
    {"name": "Lateral Raise", "category": "Shoulders"},
    {"name": "Cable Lateral Raise", "category": "Shoulders"},
    {"name": "Rear Delt Fly", "category": "Shoulders"},
    {"name": "Front Raise", "category": "Shoulders"},
    {"name": "Upright Row", "category": "Shoulders"},
    {"name": "Shrug", "category": "Shoulders"},
    # Legs
    {"name": "Back Squat", "category": "Legs"},
    {"name": "Front Squat", "category": "Legs"},
    {"name": "Hack Squat", "category": "Legs"},
    {"name": "Leg Press", "category": "Legs"},
    {"name": "Romanian Deadlift", "category": "Legs"},
    {"name": "Bulgarian Split Squat", "category": "Legs"},
    {"name": "Walking Lunge", "category": "Legs"},
    {"name": "Leg Extension", "category": "Legs"},
    {"name": "Leg Curl", "category": "Legs"},
    {"name": "Seated Leg Curl", "category": "Legs"},
    {"name": "Standing Calf Raise", "category": "Legs"},
    {"name": "Seated Calf Raise", "category": "Legs"},
    {"name": "Hip Thrust", "category": "Legs"},
    {"name": "Goblet Squat", "category": "Legs"},
    # Arms
    {"name": "Barbell Curl", "category": "Arms"},
    {"name": "EZ-Bar Curl", "category": "Arms"},
    {"name": "Dumbbell Curl", "category": "Arms"},
    {"name": "Hammer Curl", "category": "Arms"},
    {"name": "Preacher Curl", "category": "Arms"},
    {"name": "Incline Dumbbell Curl", "category": "Arms"},
    {"name": "Cable Curl", "category": "Arms"},
    {"name": "Tricep Pushdown", "category": "Arms"},
    {"name": "Overhead Tricep Extension", "category": "Arms"},
    {"name": "Skull Crusher", "category": "Arms"},
    {"name": "Close-Grip Bench Press", "category": "Arms"},
    {"name": "Cable Overhead Extension", "category": "Arms"},
    {"name": "Wrist Curl", "category": "Arms"},
    # Core
    {"name": "Hanging Leg Raise", "category": "Core"},
    {"name": "Cable Crunch", "category": "Core"},
    {"name": "Plank", "category": "Core"},
    {"name": "Ab Wheel Rollout", "category": "Core"},
    {"name": "Russian Twist", "category": "Core"},
    {"name": "Weighted Sit-Up", "category": "Core"},
    {"name": "Decline Sit-Up", "category": "Core"},
    # Olympic / Power
    {"name": "Power Clean", "category": "Olympic"},
    {"name": "Clean and Jerk", "category": "Olympic"},
    {"name": "Snatch", "category": "Olympic"},
    {"name": "Push Press", "category": "Olympic"},
    {"name": "Clean Pull", "category": "Olympic"},
]

# Aliases so PR tracking still recognizes the big lifts if a library variant is used
_PR_ALIASES = {
    "Barbell Bench Press": "bench", "Bench Press": "bench",
    "Back Squat": "squat", "Deadlift": "deadlift", "Overhead Press": "ohp",
}

WORKOUT_TEMPLATES = [
    {"id": "push", "name": "Push", "focus": "Chest · Shoulders · Triceps",
     "exercises": ["Barbell Bench Press", "Overhead Press", "Incline Dumbbell Press", "Lateral Raise", "Tricep Pushdown"]},
    {"id": "pull", "name": "Pull", "focus": "Back · Biceps · Rear Delts",
     "exercises": ["Deadlift", "Barbell Row", "Lat Pulldown", "Face Pull", "Barbell Curl"]},
    {"id": "legs", "name": "Legs", "focus": "Quads · Hams · Calves",
     "exercises": ["Back Squat", "Romanian Deadlift", "Leg Press", "Leg Curl", "Standing Calf Raise"]},
    {"id": "upper", "name": "Upper", "focus": "Chest · Back · Shoulders · Arms",
     "exercises": ["Barbell Bench Press", "Barbell Row", "Overhead Press", "Pull-Up", "Barbell Curl", "Tricep Pushdown"]},
    {"id": "lower", "name": "Lower", "focus": "Quads · Hams · Glutes · Calves",
     "exercises": ["Back Squat", "Romanian Deadlift", "Bulgarian Split Squat", "Leg Extension", "Standing Calf Raise"]},
    {"id": "arms", "name": "Arms", "focus": "Biceps · Triceps · Forearms",
     "exercises": ["Barbell Curl", "Close-Grip Bench Press", "Hammer Curl", "Skull Crusher", "Cable Curl", "Tricep Pushdown", "Wrist Curl"]},
    {"id": "core", "name": "Core", "focus": "Abs · Obliques · Stability",
     "exercises": ["Hanging Leg Raise", "Cable Crunch", "Ab Wheel Rollout", "Russian Twist", "Weighted Sit-Up", "Plank"]},
    {"id": "back", "name": "Back", "focus": "Lats · Traps · Erectors",
     "exercises": ["Deadlift", "Barbell Row", "Pull-Up", "Lat Pulldown", "Seated Cable Row", "Shrug"]},
    {"id": "fullbody", "name": "Full Body", "focus": "Total body compound day",
     "exercises": ["Back Squat", "Barbell Bench Press", "Barbell Row", "Overhead Press", "Barbell Curl", "Hanging Leg Raise"]},
    {"id": "custom", "name": "Custom", "focus": "Start blank · build your own",
     "exercises": []},
]


class CustomExerciseIn(BaseModel):
    name: str
    category: Optional[str] = "Custom"


@api_router.get("/workout/templates")
async def workout_templates(user=Depends(get_current_user)):
    return WORKOUT_TEMPLATES


# ---------- Monthly training programs (auto-scheduled) ----------
MONTHLY_SPLITS = {
    "ppl": {"name": "Push/Pull/Legs", "days_per_week": 6,
            "pattern": ["push", "pull", "legs", "push", "pull", "legs", "rest"]},
    "upper_lower": {"name": "Upper/Lower", "days_per_week": 4,
                    "pattern": ["upper", "lower", "rest", "upper", "lower", "rest", "rest"]},
    "fullbody": {"name": "Full Body", "days_per_week": 3,
                 "pattern": ["fullbody", "rest", "fullbody", "rest", "fullbody", "rest", "rest"]},
    "bro": {"name": "Bro Split", "days_per_week": 5,
            "pattern": ["push", "back", "legs", "arms", "core", "rest", "rest"]},
}

def _template_by_id(tid: str) -> Optional[dict]:
    return next((t for t in WORKOUT_TEMPLATES if t["id"] == tid), None)

@api_router.post("/programs/monthly/generate")
async def monthly_generate(inp: MonthlyGenIn, user=Depends(get_current_user)):
    split = MONTHLY_SPLITS.get(inp.split)
    if not split:
        raise HTTPException(status_code=400, detail="Unknown split")
    today = datetime.now(timezone.utc).date()
    days = []
    for i in range(28):
        tid = split["pattern"][i % 7]
        tpl = _template_by_id(tid) if tid != "rest" else None
        days.append({
            "day": i + 1,
            "date": (today + timedelta(days=i)).isoformat(),
            "template_id": tid,
            "name": tpl["name"] if tpl else "Rest",
        })
    # one active program at a time
    await db.monthly_programs.update_many({"user_id": user["user_id"], "active": True}, {"$set": {"active": False}})
    doc = {
        "monthly_id": new_id("mp"),
        "user_id": user["user_id"],
        "split": inp.split,
        "split_name": split["name"],
        "start_date": today.isoformat(),
        "days": days,
        "completed_days": [],
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.monthly_programs.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc

@api_router.get("/programs/monthly/current")
async def monthly_current(user=Depends(get_current_user)):
    prog = await db.monthly_programs.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0})
    if not prog:
        return {"active": False}
    if isinstance(prog.get("created_at"), datetime):
        prog["created_at"] = prog["created_at"].isoformat()
    today = datetime.now(timezone.utc).date()
    start = datetime.fromisoformat(prog["start_date"]).date()
    idx = (today - start).days
    prog["active"] = True
    prog["finished"] = idx >= 28
    prog["today_index"] = min(max(idx, 0), 27)
    if 0 <= idx < 28:
        entry = prog["days"][idx]
        tpl = _template_by_id(entry["template_id"]) if entry["template_id"] != "rest" else None
        prog["today"] = {**entry, "exercises": tpl["exercises"] if tpl else []}
    else:
        prog["today"] = None
    return prog

@api_router.delete("/programs/monthly/current")
async def monthly_cancel(user=Depends(get_current_user)):
    await db.monthly_programs.update_many({"user_id": user["user_id"], "active": True}, {"$set": {"active": False}})
    return {"active": False}


# ---------- Personal goal quests (AI-curated, real-life) ----------
def _fallback_personal_quests(goals: str) -> List[dict]:
    return [
        {"title": "Commit It To Paper", "description": f"Write down your goal ({goals[:60]}) and pin it where you train. Visible goals get chased.", "xp": 100, "timeframe": "This week"},
        {"title": "Baseline Check", "description": "Record your current stats — bodyweight, main lifts, or mile time. You can't improve what you don't measure.", "xp": 150, "timeframe": "This week"},
        {"title": "Meal Prep Mission", "description": "Prep 3 days of meals aligned with your goal. Nutrition is half the battle.", "xp": 200, "timeframe": "This week"},
        {"title": "Accountability Post", "description": "Share your goal in the Circle chat. Public goals are 2x more likely to get done.", "xp": 150, "timeframe": "Anytime"},
        {"title": "Four-Week Checkpoint", "description": "Re-test your baseline after 4 weeks of consistent work and log the difference.", "xp": 400, "timeframe": "This month"},
    ]

@api_router.get("/quests/personal")
async def personal_quests(user=Depends(get_current_user)):
    rows = await db.personal_quests.find(
        {"user_id": user["user_id"], "status": {"$in": ["active", "completed"]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
        if isinstance(r.get("completed_at"), datetime):
            r["completed_at"] = r["completed_at"].isoformat()
    return {"needs_setup": not user.get("goals_set"), "goals": user.get("goals", ""), "quests": rows}

@api_router.post("/quests/goals")
async def set_goals(inp: GoalsIn, user=Depends(get_current_user)):
    goals = inp.goals.strip()
    if len(goals) < 3:
        raise HTTPException(status_code=400, detail="Tell Coach what you're chasing first")

    quests = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        import json as _json
        system_msg = (
            "You are Coach Hutch, an elite strength coach in a hardcore powerlifting app. "
            "The athlete tells you their real-life goals. Curate 4-6 concrete, REAL-LIFE quests they can complete "
            "outside the app — e.g. 'Lose 5 lb', 'Sign up for a powerlifting meet', 'Hit 10k steps daily for a week', "
            "'Add 25 lb to your deadlift'. Each quest must be specific, measurable and tied to their stated goals. "
            "Return ONLY a JSON array, no markdown fences, of objects with keys: "
            "title (short, punchy), description (1-2 sentences, direct coach tone), "
            "xp (integer 100-500, harder = more), timeframe (e.g. 'This week', 'This month', '90 days')."
        )
        athlete_ctx = (
            f"Athlete stats: rank {rank_from_xp(user.get('xp', 0))}, bodyweight {user.get('bodyweight_lb', 180)} lb, "
            f"age {user.get('age', 25)}, sex {user.get('sex', 'male')}, PRs {user.get('prs', {})}. "
            f"Goals: {goals}"
        )
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"goals_{user['user_id']}_{uuid.uuid4().hex[:6]}",
            system_message=system_msg,
        ).with_model("anthropic", "claude-sonnet-4-6")
        resp = await chat.send_message(UserMessage(text=athlete_ctx))
        raw = str(resp).strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(json)?\s*|\s*```$", "", raw, flags=re.S)
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1:
            parsed = _json.loads(raw[start:end + 1])
            quests = [
                {"title": str(q.get("title", "Quest"))[:80],
                 "description": str(q.get("description", ""))[:300],
                 "xp": max(50, min(500, int(q.get("xp", 150)))),
                 "timeframe": str(q.get("timeframe", "This month"))[:40]}
                for q in parsed if isinstance(q, dict)
            ][:6] or None
    except Exception as e:
        logger.warning(f"AI goal quest generation failed, using fallback: {e}")

    if not quests:
        quests = _fallback_personal_quests(goals)

    # Archive previous active personal quests, insert the new batch
    await db.personal_quests.update_many(
        {"user_id": user["user_id"], "status": "active"}, {"$set": {"status": "archived"}}
    )
    now = datetime.now(timezone.utc)
    docs = [{
        "quest_id": new_id("pq"),
        "user_id": user["user_id"],
        "status": "active",
        "created_at": now,
        **q,
    } for q in quests]
    if docs:
        await db.personal_quests.insert_many(docs)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"goals_set": True, "goals": goals}})
    for d in docs:
        d.pop("_id", None)
        d["created_at"] = d["created_at"].isoformat()
    return {"goals": goals, "quests": docs}

@api_router.post("/quests/personal/complete")
async def complete_personal_quest(inp: PersonalCompleteIn, user=Depends(get_current_user)):
    q = await db.personal_quests.find_one(
        {"quest_id": inp.quest_id, "user_id": user["user_id"], "status": "active"}, {"_id": 0}
    )
    if not q:
        raise HTTPException(status_code=404, detail="Quest not found or already completed")
    await db.personal_quests.update_one(
        {"quest_id": inp.quest_id}, {"$set": {"status": "completed", "completed_at": datetime.now(timezone.utc)}}
    )
    await award_xp(user["user_id"], q["xp"])
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return {"xp_gained": q["xp"], "quest_id": inp.quest_id, "user": fresh}


@api_router.get("/exercises")
async def list_exercises(user=Depends(get_current_user)):
    custom = user.get("custom_exercises", []) or []
    return {"library": EXERCISE_LIBRARY, "custom": custom}


@api_router.post("/exercises/custom")
async def add_custom_exercise(inp: CustomExerciseIn, user=Depends(get_current_user)):
    name = inp.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    entry = {"name": name, "category": (inp.category or "Custom").strip() or "Custom"}
    await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"custom_exercises": entry}})
    custom = (await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "custom_exercises": 1})).get("custom_exercises", [])
    return {"custom": custom, "added": entry}


def _range_start(rng: str, now: datetime):
    if rng == "1w":
        return now - timedelta(days=7)
    if rng == "1m":
        return now - timedelta(days=30)
    if rng == "3m":
        return now - timedelta(days=90)
    return None  # all


async def _exercise_sessions(user_id: str, name: str, rng: str):
    """Returns list of {date, sets:[{reps,weight_lb,rpe}], workout_name} for one exercise."""
    now = datetime.now(timezone.utc)
    start = _range_start(rng, now)
    rows = await db.workouts.find({"user_id": user_id}, {"_id": 0}).sort("logged_at", -1).to_list(1000)
    sessions = []
    target = name.strip().lower()
    for r in rows:
        ts = r.get("logged_at")
        if isinstance(ts, str):
            try: ts = datetime.fromisoformat(ts)
            except Exception: ts = None
        if isinstance(ts, datetime) and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if start and isinstance(ts, datetime) and ts < start:
            continue
        for ex in r.get("exercises", []) or []:
            if (ex.get("name", "").strip().lower()) == target:
                sets = [{"reps": s.get("reps", 0) or 0, "weight_lb": s.get("weight_lb", 0) or 0, "rpe": s.get("rpe", 0) or 0} for s in ex.get("sets", []) or []]
                sessions.append({"date": ts.isoformat() if isinstance(ts, datetime) else None, "sets": sets, "workout_name": r.get("workout_name", "")})
    return sessions


@api_router.get("/exercise/stats")
async def exercise_stats(name: str, rng: str = "1m", user=Depends(get_current_user)):
    sessions = await _exercise_sessions(user["user_id"], name, rng)
    total_sets = total_reps = 0
    total_weight = total_volume = 0.0
    max_weight = max_reps = max_volume = 0.0
    max_weight_date = max_reps_date = max_volume_date = None
    wmaxes_w = []; wmaxes_r = []; wmaxes_v = []
    for s in sessions:
        sw = sr = sv = 0.0
        for st in s["sets"]:
            w = st["weight_lb"]; reps = st["reps"]; vol = w * reps
            total_sets += 1; total_reps += reps
            total_weight += w; total_volume += vol
            if w > max_weight: max_weight, max_weight_date = w, s["date"]
            if reps > max_reps: max_reps, max_reps_date = reps, s["date"]
            if vol > max_volume: max_volume, max_volume_date = vol, s["date"]
            sw = max(sw, w); sr = max(sr, reps); sv = max(sv, vol)
        if s["sets"]:
            wmaxes_w.append(sw); wmaxes_r.append(sr); wmaxes_v.append(sv)
    n = max(1, total_sets)
    nw = max(1, len(wmaxes_w))
    return {
        "name": name,
        "range": rng,
        "total_sets": total_sets,
        "total_workouts": len(sessions),
        "total_weight": round(total_weight, 1),
        "total_reps": total_reps,
        "total_volume": round(total_volume, 1),
        "avg_weight": round(total_weight / n, 1),
        "avg_reps": round(total_reps / n, 1),
        "avg_volume": round(total_volume / n, 1),
        "max_weight": round(max_weight, 1), "max_weight_date": max_weight_date,
        "max_reps": int(max_reps), "max_reps_date": max_reps_date,
        "max_volume": round(max_volume, 1), "max_volume_date": max_volume_date,
        "avg_max_weight": round(sum(wmaxes_w) / nw, 1),
        "avg_max_reps": round(sum(wmaxes_r) / nw, 1),
        "avg_max_volume": round(sum(wmaxes_v) / nw, 1),
    }


@api_router.get("/exercise/log")
async def exercise_log(name: str, rng: str = "all", user=Depends(get_current_user)):
    return {"name": name, "sessions": await _exercise_sessions(user["user_id"], name, rng)}


@api_router.get("/exercise/graph")
async def exercise_graph(name: str, rng: str = "3m", user=Depends(get_current_user)):
    sessions = await _exercise_sessions(user["user_id"], name, rng)
    points = []
    for s in reversed(sessions):  # oldest first
        if not s["sets"]:
            continue
        top_w = max(st["weight_lb"] for st in s["sets"])
        vol = sum(st["weight_lb"] * st["reps"] for st in s["sets"])
        points.append({"date": s["date"], "weight": round(top_w, 1), "volume": round(vol, 1)})
    return {"name": name, "points": points}


# ---------- Unlockables (XP/level rewards) ----------
BACKGROUNDS = [
    {"id": "bg_default", "name": "Midnight Steel", "level": 1, "colors": ["#002A55", "#12141A"]},
    {"id": "bg_cyber", "name": "Cyber Grid", "level": 11, "colors": ["#001A33", "#003A5C"]},
    {"id": "bg_toxic", "name": "Toxic Surge", "level": 16, "colors": ["#0A2A00", "#12141A"]},
    {"id": "bg_inferno", "name": "Inferno", "level": 21, "colors": ["#2A0010", "#12141A"]},
    {"id": "bg_vanguard", "name": "Vanguard Sapphire", "level": 31, "colors": ["#0A2A66", "#050914"]},
    {"id": "bg_warrior", "name": "Warrior's Forge", "level": 41, "colors": ["#3A1E00", "#140A00"]},
    {"id": "bg_boss", "name": "Boss Throne", "level": 51, "colors": ["#052A1A", "#04120C"]},
    {"id": "bg_void", "name": "The Void", "level": 61, "colors": ["#1A0033", "#050508"]},
    {"id": "bg_freak", "name": "Freak Mode", "level": 71, "colors": ["#330000", "#0A0000"]},
]
WIDGETS = [
    {"id": "w_streak", "name": "Streak Tracker", "level": 2, "desc": "Live consecutive-day counter"},
    {"id": "w_volume", "name": "Volume Meter", "level": 5, "desc": "Weekly tonnage moved"},
    {"id": "w_nextrank", "name": "Rank Progress", "level": 8, "desc": "XP-to-next-rank gauge"},
    {"id": "w_quote", "name": "War Cry", "level": 12, "desc": "Daily motivation banner"},
    {"id": "w_pr_radar", "name": "PR Radar", "level": 22, "desc": "Flags a lift primed for a new PR"},
    {"id": "w_class", "name": "Class Insignia", "level": 32, "desc": "Combat class crest on your player card"},
    {"id": "w_heatmap", "name": "Training Heatmap", "level": 42, "desc": "Yearly training-density grid"},
    {"id": "w_aura", "name": "Rank Aura", "level": 52, "desc": "Animated aura around your avatar"},
]

RANK_PERK_BG = {
    "Intermediate": "bg_cyber",
    "Advanced": "bg_inferno",
    "Vanguard": "bg_vanguard",
    "Warrior": "bg_warrior",
    "Boss": "bg_boss",
    "Elite": "bg_void",
    "Freak": "bg_freak",
}

# ---------- Quests ----------
QUEST_TEMPLATES = {
    "daily": [
        {"id": "d_train", "title": "Answer the Call", "flavor": "A Daily Quest has arrived. Log a training session.", "reward_xp": 60, "objectives": [{"key": "workouts", "label": "Log workouts today", "target": 1}]},
        {"id": "d_sets", "title": "Grind Sets", "flavor": "Volume builds the vessel. Complete your working sets.", "reward_xp": 70, "objectives": [{"key": "sets", "label": "Complete sets today", "target": 12}]},
        {"id": "d_volume", "title": "Iron Tonnage", "flavor": "Move serious weight before the day resets.", "reward_xp": 80, "objectives": [{"key": "volume", "label": "Move total lb today", "target": 8000}]},
    ],
    "weekly": [
        {"id": "w_consistency", "title": "Weekly Warrior", "flavor": "Show up. Discipline over motivation.", "reward_xp": 250, "objectives": [{"key": "workouts", "label": "Sessions this week", "target": 4}]},
        {"id": "w_pr", "title": "Break Limits", "flavor": "Set a new personal record this week.", "reward_xp": 300, "objectives": [{"key": "prs", "label": "New PRs this week", "target": 1}]},
        {"id": "w_volume", "title": "Mountain Mover", "flavor": "Accumulate massive weekly tonnage.", "reward_xp": 280, "objectives": [{"key": "volume", "label": "Move total lb this week", "target": 60000}]},
    ],
    "monthly": [
        {"id": "m_grind", "title": "Monthly Monster", "flavor": "A month of relentless work.", "reward_type": "badge", "reward_value": "quest_monthly_monster", "reward_label": "Monthly Monster Badge", "objectives": [{"key": "workouts", "label": "Sessions this month", "target": 16}]},
        {"id": "m_pr", "title": "Record Breaker", "flavor": "Rewrite your limits repeatedly.", "reward_type": "background", "reward_value": "bg_void", "reward_label": "The Void Background", "objectives": [{"key": "prs", "label": "New PRs this month", "target": 4}]},
        {"id": "m_ascend", "title": "Ascendant", "flavor": "Pure dedication. Earn the Prime card.", "reward_type": "card", "reward_value": "prime_card", "reward_label": "Prime Card Badge", "objectives": [{"key": "xp", "label": "XP earned this month", "target": 2000}]},
    ],
    "boss": [
        {"id": "boss_frame", "title": "SLAY THE GATEKEEPER", "flavor": "A rare Boss has appeared. Only the relentless claim its power. Unlock the coveted BOSS frame.", "reward_xp": 600, "reward_type": "frame", "reward_value": "boss", "reward_label": "BOSS Frame + 600 XP", "objectives": [{"key": "xp", "label": "XP earned this month", "target": 5000}, {"key": "workouts", "label": "Sessions this month", "target": 20}]},
        {"id": "boss_bg", "title": "CLAIM THE THRONE", "flavor": "Dethrone the Boss. Seize the Boss Throne and rule the arena.", "reward_xp": 700, "reward_type": "background", "reward_value": "bg_boss", "reward_label": "Boss Throne BG + 700 XP", "objectives": [{"key": "prs", "label": "New PRs this month", "target": 6}, {"key": "volume", "label": "Move total lb this month", "target": 250000}]},
    ],
}


def _period_key(scope: str, now: datetime) -> str:
    if scope == "daily":
        return now.strftime("%Y-%m-%d")
    if scope == "weekly":
        iso = now.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    return now.strftime("%Y-%m")


async def _metrics_for(user_id: str, scope: str, now: datetime):
    if scope == "daily":
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    elif scope == "weekly":
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)
    rows = await db.workouts.find({"user_id": user_id}, {"_id": 0}).sort("logged_at", -1).to_list(1000)
    workouts = sets = prs = xp = volume = 0
    for r in rows:
        ts = r.get("logged_at")
        if isinstance(ts, str):
            try: ts = datetime.fromisoformat(ts)
            except Exception: ts = None
        if not isinstance(ts, datetime):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts < start:
            continue
        workouts += 1
        prs += len(r.get("pr_details", []) or [])
        xp += r.get("xp_gained", 0) or 0
        for ex in r.get("exercises", []) or []:
            for s in ex.get("sets", []) or []:
                sets += 1
                volume += (s.get("reps", 0) or 0) * (s.get("weight_lb", 0) or 0)
    return {"workouts": workouts, "sets": sets, "prs": prs, "xp": xp, "volume": int(volume)}


async def _build_quests(user, scope: str, now: datetime):
    metrics = await _metrics_for(user["user_id"], scope, now)
    pkey = _period_key(scope, now)
    total_users = max(1, await db.users.count_documents({}))
    out = []
    for tmpl in QUEST_TEMPLATES[scope]:
        quest_key = f"{scope}:{tmpl['id']}:{pkey}"
        objectives = []
        complete = True
        for ob in tmpl["objectives"]:
            cur = min(metrics.get(ob["key"], 0), ob["target"])
            if metrics.get(ob["key"], 0) < ob["target"]:
                complete = False
            objectives.append({"label": ob["label"], "current": cur, "target": ob["target"]})
        claim = await db.quest_claims.find_one({"user_id": user["user_id"], "quest_key": quest_key})
        completers = await db.quest_claims.count_documents({"quest_key": quest_key})
        out.append({
            "id": quest_key,
            "scope": scope,
            "title": tmpl["title"],
            "flavor": tmpl["flavor"],
            "objectives": objectives,
            "complete": complete,
            "claimed": bool(claim),
            "reward_xp": tmpl.get("reward_xp", 0),
            "reward_type": tmpl.get("reward_type", "xp"),
            "reward_label": tmpl.get("reward_label", f"{tmpl.get('reward_xp', 0)} XP"),
            "global_completions": completers,
            "global_percent": round(completers / total_users * 100, 1),
        })
    return out


@api_router.get("/quests")
async def get_quests(scope: str = "daily", user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    if scope == "all":
        data = {}
        for sc in ("daily", "weekly", "monthly", "boss"):
            data[sc] = await _build_quests(user, sc, now)
        return data
    if scope not in QUEST_TEMPLATES:
        raise HTTPException(status_code=400, detail="Invalid scope")
    return {scope: await _build_quests(user, scope, now)}


@api_router.post("/quests/claim")
async def claim_quest(payload: dict, user=Depends(get_current_user)):
    quest_id = payload.get("quest_id", "")
    parts = quest_id.split(":")
    if len(parts) < 3:
        raise HTTPException(status_code=400, detail="Bad quest id")
    scope, tmpl_id = parts[0], parts[1]
    tmpl = next((t for t in QUEST_TEMPLATES.get(scope, []) if t["id"] == tmpl_id), None)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Quest not found")
    now = datetime.now(timezone.utc)
    quests = await _build_quests(user, scope, now)
    q = next((x for x in quests if x["id"] == quest_id), None)
    if not q:
        raise HTTPException(status_code=404, detail="Quest not active")
    if not q["complete"]:
        raise HTTPException(status_code=400, detail="Objectives not met")
    if q["claimed"]:
        raise HTTPException(status_code=400, detail="Already claimed")

    await db.quest_claims.insert_one({"user_id": user["user_id"], "quest_key": quest_id, "claimed_at": now})
    reward_msg = ""
    rtype = tmpl.get("reward_type", "xp")
    parts_msg = []
    # High-reward quests may grant XP alongside a typed reward
    gained = tmpl.get("reward_xp", 0)
    if gained and (rtype == "xp" or scope in ("daily", "weekly", "boss")):
        await award_xp(user["user_id"], gained)
        parts_msg.append(f"+{gained} XP")
    if rtype in ("badge", "card"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"badges": tmpl["reward_value"]}})
        parts_msg.append(tmpl.get("reward_label", "New badge"))
    elif rtype == "background":
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"extra_unlocks": tmpl["reward_value"]}})
        parts_msg.append(tmpl.get("reward_label", "New background"))
    elif rtype == "frame":
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"extra_unlocks": f"frame_{tmpl['reward_value']}"}})
        parts_msg.append(tmpl.get("reward_label", "New frame"))
    reward_msg = " · ".join(parts_msg) if parts_msg else tmpl.get("reward_label", "Reward claimed")

    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return {"ok": True, "reward": reward_msg, "user": fresh}


@api_router.get("/unlockables")
async def get_unlockables(user=Depends(get_current_user)):
    lvl = user.get("level", 1)
    active = user.get("active_background", "bg_default")
    rank = rank_from_xp(user.get("xp", 0))
    rank_order = RANK_ORDER
    earned_perks = set()
    for r in rank_order[: rank_order.index(rank) + 1]:
        if r in RANK_PERK_BG:
            earned_perks.add(RANK_PERK_BG[r])
    extra = set(user.get("extra_unlocks", []) or [])
    backgrounds = [{
        **b,
        "unlocked": lvl >= b["level"] or b["id"] in earned_perks or b["id"] == active or b["id"] in extra,
        "active": active == b["id"],
        "perk_rank": next((r for r, bid in RANK_PERK_BG.items() if bid == b["id"]), None),
    } for b in BACKGROUNDS]
    widgets = [{**w, "unlocked": lvl >= w["level"]} for w in WIDGETS]
    return {"level": lvl, "backgrounds": backgrounds, "widgets": widgets}

@api_router.post("/profile/set-background")
async def set_background(inp: BackgroundSet, user=Depends(get_current_user)):
    bg = next((b for b in BACKGROUNDS if b["id"] == inp.background_id), None)
    if not bg:
        raise HTTPException(status_code=400, detail="Unknown background")
    rank = rank_from_xp(user.get("xp", 0))
    rank_order = RANK_ORDER
    earned_perks = {RANK_PERK_BG[r] for r in rank_order[: rank_order.index(rank) + 1] if r in RANK_PERK_BG}
    if user.get("level", 1) < bg["level"] and bg["id"] not in earned_perks:
        raise HTTPException(status_code=403, detail=f"Unlocks at level {bg['level']}")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"active_background": inp.background_id}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh

def unlocked_frames_for(user) -> list:
    """Every card frame the athlete has earned: all frames up to their rank + quest-unlocked frames."""
    rank = rank_from_xp(user.get("xp", 0))
    frames = list(RANK_ORDER[: RANK_ORDER.index(rank) + 1])
    for u in (user.get("extra_unlocks") or []):
        if isinstance(u, str) and u.startswith("frame_"):
            fname = u[len("frame_"):].capitalize()
            if fname in RANK_ORDER and fname not in frames:
                frames.append(fname)
    return frames

@api_router.get("/profile/frames")
async def profile_frames(user=Depends(get_current_user)):
    return {"unlocked": unlocked_frames_for(user), "active": user.get("active_frame")}

@api_router.post("/profile/set-frame")
async def set_frame(payload: dict, user=Depends(get_current_user)):
    frame = payload.get("frame", "")
    if frame not in unlocked_frames_for(user):
        raise HTTPException(status_code=403, detail="Frame not unlocked")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"active_frame": frame}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh
@api_router.post("/workouts/log")
async def log_workout(inp: WorkoutLog, user=Depends(get_current_user)):
    workout_id = new_id("wk")
    doc = {
        "workout_id": workout_id,
        "user_id": user["user_id"],
        **inp.dict(),
        "logged_at": datetime.now(timezone.utc),
    }

    # Update PRs from main lifts (accepts library aliases)
    lift_map = {
        "Bench Press": "bench", "Barbell Bench Press": "bench",
        "Back Squat": "squat", "Deadlift": "deadlift",
        "Overhead Press": "ohp",
    }
    prs = user.get("prs", {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0})
    new_badges = set(user.get("badges", []))
    pr_hit = False
    pr_details = []
    for ex in inp.exercises:
        lift_key = lift_map.get(ex.name)
        if not lift_key:
            continue
        top = max((s.weight_lb for s in ex.sets), default=0)
        if top > prs.get(lift_key, 0):
            prev = prs.get(lift_key, 0)
            prs[lift_key] = top
            pr_hit = True
            pr_details.append({"lift": lift_key, "name": ex.name, "weight": top, "previous": prev})
            for m in milestones_for(top):
                new_badges.add(f"{lift_key}_{m}")

    xp_gain = 50 + (10 * len(inp.exercises))
    if pr_hit:
        xp_gain += 100
        new_badges.add("pr_hunter")

    doc["xp_gained"] = xp_gain
    doc["pr_details"] = pr_details
    await db.workouts.insert_one(doc)

    # Tick off the day in the active monthly program
    if inp.source == "monthly" and inp.monthly_day:
        await db.monthly_programs.update_one(
            {"user_id": user["user_id"], "active": True},
            {"$addToSet": {"completed_days": inp.monthly_day}},
        )

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

    # Rank Perk: auto-equip a fresh background the instant the athlete ranks up
    prev_rank = rank_from_xp(user.get("xp", 0))
    ranked_up = fresh["rank"] != prev_rank
    unlocked_background = None
    if ranked_up:
        perk = RANK_PERK_BG.get(fresh["rank"])
        if perk:
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"active_background": perk}})
            fresh["active_background"] = perk
            bg_meta = next((b for b in BACKGROUNDS if b["id"] == perk), None)
            unlocked_background = {"id": perk, "name": bg_meta["name"] if bg_meta else perk}

    doc.pop("_id", None)
    doc["logged_at"] = doc["logged_at"].isoformat()
    return {
        "workout": doc, "user": fresh, "xp_gained": xp_gain,
        "pr_hit": pr_hit, "pr_details": pr_details,
        "ranked_up": ranked_up, "prev_rank": prev_rank, "unlocked_background": unlocked_background,
    }

@api_router.get("/workouts/history")
async def workout_history(user=Depends(get_current_user)):
    rows = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).limit(50).to_list(50)
    for r in rows:
        if isinstance(r.get("logged_at"), datetime):
            r["logged_at"] = r["logged_at"].isoformat()
    return rows

@api_router.get("/recap/weekly")
async def weekly_recap(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    rows = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).to_list(500)
    week_workouts = []
    for r in rows:
        ts = r.get("logged_at")
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts)
            except Exception:
                ts = None
        if isinstance(ts, datetime):
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= week_ago:
                week_workouts.append(r)

    xp_week = sum(w.get("xp_gained", 50 + 10 * len(w.get("exercises", []))) for w in week_workouts)
    prs_week = []
    total_volume = 0
    for w in week_workouts:
        prs_week.extend(w.get("pr_details", []))
        for ex in w.get("exercises", []):
            for s in ex.get("sets", []):
                total_volume += s.get("reps", 0) * s.get("weight_lb", 0)

    current_xp = user.get("xp", 0)
    rank_now = rank_from_xp(current_xp)
    rank_start = rank_from_xp(max(0, current_xp - xp_week))
    promoted = rank_now != rank_start

    return {
        "display_name": user.get("display_name"),
        "avatar_id": user.get("avatar_id"),
        "week_start": week_ago.date().isoformat(),
        "week_end": now.date().isoformat(),
        "xp_gained": xp_week,
        "workouts": len(week_workouts),
        "total_volume_lb": int(total_volume),
        "prs": prs_week,
        "pr_count": len(prs_week),
        "rank_now": rank_now,
        "rank_start": rank_start,
        "promoted": promoted,
        "level": level_from_xp(current_xp),
    }

@api_router.get("/workouts/next-suggestion")
async def next_suggestion(user=Depends(get_current_user)):
    rank = rank_from_xp(user["xp"])
    # Pick program appropriate to rank
    idx = RANK_ORDER.index(rank)
    if idx >= 2:
        program = next(p for p in DEFAULT_PROGRAMS if p["program_id"] == "prog_ppl_advanced")
    elif idx == 1:
        program = next(p for p in DEFAULT_PROGRAMS if p["program_id"] == "prog_ppl_intermediate")
    else:
        program = next(p for p in DEFAULT_PROGRAMS if p["program_id"] == "prog_upper_lower")

    seq = [w["key"] for w in program["workouts"]]
    # Find last workout for this program's split to rotate to the next one
    recent = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).limit(5).to_list(5)
    next_key = seq[0]
    for r in recent:
        st = r.get("split_type", "")
        last_key = st.split("_")[-1] if st else None
        if last_key in seq:
            idx = seq.index(last_key)
            next_key = seq[(idx + 1) % len(seq)]
            break
    workout = next(w for w in program["workouts"] if w["key"] == next_key)

    # Adaptive focus: weakest of the big 4 relative to typical ratios
    prs = user.get("prs", {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0})
    targets = {"bench": 1.0, "squat": 1.3, "deadlift": 1.5, "ohp": 0.6}  # relative to bench baseline
    base = max(prs.get("bench", 0), 1)
    ratios = {k: (prs.get(k, 0) / base) / targets[k] if targets[k] else 1 for k in targets}
    weakest = min(ratios, key=ratios.get)
    focus_names = {"bench": "Bench Press", "squat": "Back Squat", "deadlift": "Deadlift", "ohp": "Overhead Press"}
    focus = focus_names[weakest]

    return {
        "program_id": program["program_id"],
        "program_name": program["name"],
        "split": program["split"],
        "workout": workout,
        "focus_lift": focus,
        "focus_note": f"Your {focus} is lagging behind your other lifts — attack it with intent today.",
        "based_on": rank,
    }

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


# ---------- Chat ----------
@api_router.get("/chat/{room}/messages")
async def get_messages(room: str, user=Depends(get_current_user)):
    if room not in ("main", "the_room"):
        raise HTTPException(status_code=400, detail="Invalid room")
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak") and not user.get("all_rooms_access"):
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
    if room == "the_room" and rank_from_xp(user["xp"]) not in ("Elite", "Freak") and not user.get("all_rooms_access"):
        raise HTTPException(status_code=403, detail="The Room requires Elite rank")
    text = (inp.text or "").strip()
    media = None
    if inp.media_id:
        media = await db.chat_media.find_one({"media_id": inp.media_id, "user_id": user["user_id"]}, {"_id": 0})
        if not media:
            raise HTTPException(status_code=400, detail="Invalid media attachment")
    if not text and not media:
        raise HTTPException(status_code=400, detail="Message is empty")
    msg = {
        "message_id": new_id("msg"),
        "room": room,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_ronin"),
        "rank": rank_from_xp(user["xp"]),
        "skool_verified": user.get("skool_verified", False),
        "founder_backer": user.get("founder_backer", False),
        "text": text[:500],
        "media_id": media["media_id"] if media else None,
        "media_type": media["media_type"] if media else None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    msg["created_at"] = msg["created_at"].isoformat()
    return msg


# ---------- Chat media (Emergent Object Storage) ----------
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-matroska"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024   # 15 MB
MAX_VIDEO_BYTES = 80 * 1024 * 1024   # 80 MB (~1 min of phone video)
_EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
            "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov",
            "video/webm": "webm", "video/3gpp": "3gp", "video/x-matroska": "mkv"}

@api_router.post("/chat/upload")
async def chat_upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    if not (user.get("email_verified") or user.get("phone_verified")):
        raise HTTPException(status_code=403, detail="Verify your email or phone to share media")
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct in ALLOWED_IMAGE_TYPES:
        media_type, cap = "image", MAX_IMAGE_BYTES
    elif ct in ALLOWED_VIDEO_TYPES:
        media_type, cap = "video", MAX_VIDEO_BYTES
    else:
        raise HTTPException(status_code=400, detail="Only photos and videos are allowed")
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > cap:
        limit_mb = cap // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File too large (max {limit_mb}MB). Videos are capped at 1 minute.")
    ext = _EXT_MAP.get(ct, "bin")
    path = f"{STORAGE_APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        logger.error(f"Storage upload failed: {e.response.status_code} {e.response.text[:200]}")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("med")
    await db.chat_media.insert_one({
        "media_id": media_id,
        "user_id": user["user_id"],
        "storage_path": path,
        "content_type": ct,
        "media_type": media_type,
        "size": len(data),
        "original_name": file.filename,
        "created_at": datetime.now(timezone.utc),
    })
    return {"media_id": media_id, "media_type": media_type}

@api_router.get("/chat/media/{media_id}")
async def chat_media_get(media_id: str, token: Optional[str] = None,
                         authorization: Optional[str] = Header(None)):
    # Auth via Bearer header (native) or ?token= query (web <img>/<video> tags)
    tok = None
    if authorization and authorization.startswith("Bearer "):
        tok = authorization.split(" ", 1)[1]
    elif token:
        tok = token
    if not tok:
        raise HTTPException(status_code=401, detail="Missing token")
    session = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    rec = await db.chat_media.find_one({"media_id": media_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        content = await storage_get(rec["storage_path"])
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=502, detail="Media unavailable")
    return Response(content=content, media_type=rec["content_type"],
                    headers={"Cache-Control": "private, max-age=86400"})


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


# ---------- RevenueCat webhook + server-side purchase verification ----------
def _grant_set_for_entitlement(ent: str):
    if ent == CUSTOM_PROGRAM_ENTITLEMENT:
        return {"custom_program_purchased": True, "athletes_center_access": True,
                "custom_program_purchased_at": datetime.now(timezone.utc)}
    if ent == BACKER_ENTITLEMENT:
        return {"founder_backer": True, "backed_at": datetime.now(timezone.utc)}
    return None

def _revoke_set_for_entitlement(ent: str):
    if ent == CUSTOM_PROGRAM_ENTITLEMENT:
        return {"custom_program_purchased": False, "athletes_center_access": False}
    if ent == BACKER_ENTITLEMENT:
        return {"founder_backer": False}
    return None

async def _find_user_by_candidates(candidates):
    ids = [c for c in candidates if c and not str(c).startswith("$RCAnonymousID:")]
    if not ids:
        return None
    return await db.users.find_one({"user_id": {"$in": ids}}, {"_id": 0, "password_hash": 0})

async def has_verified_purchase(user_id: str, entitlement: str) -> bool:
    row = await db.verified_purchases.find_one(
        {"user_id": user_id, "entitlement": entitlement, "revoked": {"$ne": True}}
    )
    return bool(row)

def _receipt_email_for(user: dict, ent: str):
    """Returns (subject, html) for the purchase thank-you/receipt, or None."""
    name = escape((user.get("display_name") or "Athlete").strip())
    if ent == CUSTOM_PROGRAM_ENTITLEMENT:
        subject = "Your 1-on-1 Custom Program is confirmed — welcome to the Inner Circle"
        html = f"""
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0e;">
          <h2 style="letter-spacing:1px;">HUTCH'S INNER CIRCLE</h2>
          <p>Hey {name},</p>
          <p><strong>Your 1-on-1 Custom Program purchase is confirmed.</strong> Thank you for going all in.</p>
          <p>Here's what happens next:</p>
          <ul>
            <li>Coach Hutch will personally build your program around your goals, injuries and schedule.</li>
            <li>Open the app and complete your <strong>intake form</strong> (Home &rarr; 1-on-1 Custom Program) so Coach has everything he needs.</li>
            <li>Your <strong>Athlete's Center</strong> is unlocked and yours for life.</li>
          </ul>
          <p>This is a one-time payment — no subscription, no renewals.</p>
          <p>Let's get to work.<br/>— Coach Hutch</p>
        </div>"""
        return subject, html
    if ent == BACKER_ENTITLEMENT:
        subject = "Thank you for backing Hutch's Inner Circle"
        html = f"""
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0e;">
          <h2 style="letter-spacing:1px;">HUTCH'S INNER CIRCLE</h2>
          <p>Hey {name},</p>
          <p><strong>You're officially a Development Backer.</strong> Thank you for helping fuel the build.</p>
          <p>Your name is now etched into the Backers hall inside the app — forever. Every feature we ship, you helped make happen.</p>
          <p>Respect.<br/>— Coach Hutch</p>
        </div>"""
        return subject, html
    return None

async def _send_purchase_receipt(user: dict, ent: str):
    """Fire-and-forget thank-you email. Never let an email failure break the webhook."""
    to = (user.get("email") or "").strip()
    if not to:
        return
    built = _receipt_email_for(user, ent)
    if not built:
        return
    subject, html = built
    try:
        await send_email(to=to, subject=subject, html=html)
    except Exception as e:
        logger.warning(f"Purchase receipt email failed for {to} ({ent}): {e}")

@api_router.post("/revenuecat/webhook")
async def revenuecat_webhook(request: Request, authorization: Optional[str] = Header(None)):
    """Server-side proof of purchase. RevenueCat POSTs a signed purchase event here,
    authenticated by the shared REVENUECAT_WEBHOOK_AUTH secret configured in the RC
    dashboard. This is the ONLY path that writes verified_purchases + flips paid flags."""
    if not RC_WEBHOOK_AUTH:
        raise HTTPException(status_code=503, detail="RevenueCat webhook not configured")
    if not authorization or not secrets.compare_digest(authorization.strip(), RC_WEBHOOK_AUTH):
        raise HTTPException(status_code=401, detail="Invalid webhook authorization")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event = body.get("event") or {}
    etype = (event.get("type") or "").upper()
    event_id = event.get("id") or new_id("rcevt")

    # Idempotency — never process the same RC event twice
    if await db.rc_webhook_events.find_one({"event_id": event_id}):
        return {"ok": True, "duplicate": True}
    await db.rc_webhook_events.insert_one(
        {"event_id": event_id, "type": etype, "received_at": datetime.now(timezone.utc)}
    )

    ents = event.get("entitlement_ids") or (
        [event["entitlement_id"]] if event.get("entitlement_id") else []
    )
    ents = [e for e in ents if e in (CUSTOM_PROGRAM_ENTITLEMENT, BACKER_ENTITLEMENT)]

    candidates = [event.get("app_user_id"), event.get("original_app_user_id")] + (event.get("aliases") or [])
    user = await _find_user_by_candidates(candidates)
    fallback_uid = next((c for c in candidates if c and not str(c).startswith("$RCAnonymousID:")), None)

    processed = []
    for ent in ents:
        uid = (user or {}).get("user_id") or fallback_uid
        if not uid:
            continue
        if etype in RC_GRANT_EVENTS:
            existing = await db.verified_purchases.find_one({"user_id": uid, "entitlement": ent})
            await db.verified_purchases.update_one(
                {"user_id": uid, "entitlement": ent},
                {"$set": {
                    "user_id": uid, "entitlement": ent,
                    "product_id": event.get("product_id"), "store": event.get("store"),
                    "environment": event.get("environment"), "event_id": event_id,
                    "event_type": etype, "revoked": False,
                    "verified_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
            if user:
                grant = _grant_set_for_entitlement(ent)
                if grant:
                    await db.users.update_one({"user_id": user["user_id"]}, {"$set": grant})
                # Thank-you receipt — only on a real purchase moment, and only once
                if etype in RC_RECEIPT_EVENTS and not (existing or {}).get("receipt_sent"):
                    await _send_purchase_receipt(user, ent)
                    await db.verified_purchases.update_one(
                        {"user_id": uid, "entitlement": ent}, {"$set": {"receipt_sent": True}}
                    )
            processed.append({"entitlement": ent, "action": "granted"})
        elif etype in RC_REVOKE_EVENTS:
            await db.verified_purchases.update_one(
                {"user_id": uid, "entitlement": ent},
                {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}},
            )
            if user:
                rev = _revoke_set_for_entitlement(ent)
                if rev:
                    await db.users.update_one({"user_id": user["user_id"]}, {"$set": rev})
            processed.append({"entitlement": ent, "action": "revoked"})

    return {"ok": True, "processed": processed}


# ---------- 1-on-1 Custom Program ($200 lifetime) ----------
@api_router.post("/custom-program/unlock")
async def custom_program_unlock(user=Depends(get_current_user)):
    """Sync endpoint called by the client after a RevenueCat lifetime purchase.
    Grants Athlete's Center access ONLY if RevenueCat has confirmed the purchase
    server-side (via the webhook). Fail-closed — no verified purchase, no grant."""
    if not await has_verified_purchase(user["user_id"], CUSTOM_PROGRAM_ENTITLEMENT):
        raise HTTPException(
            status_code=402,
            detail="Purchase not verified yet. If you just purchased, wait a few seconds and tap Restore.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": _grant_set_for_entitlement(CUSTOM_PROGRAM_ENTITLEMENT)},
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh

@api_router.post("/custom-program/intake")
async def custom_program_intake(inp: CustomProgramIntake, user=Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not fresh.get("custom_program_purchased"):
        raise HTTPException(status_code=403, detail="Purchase the 1-on-1 custom program first")
    doc = {
        "request_id": new_id("cprog"),
        "user_id": user["user_id"],
        "email": fresh.get("email"),
        "display_name": fresh.get("display_name"),
        **inp.dict(),
        "status": "submitted",
        "created_at": datetime.now(timezone.utc),
    }
    await db.custom_program_requests.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return {"ok": True, "request": doc}

@api_router.get("/custom-program")
async def custom_program_status(user=Depends(get_current_user)):
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    intake = await db.custom_program_requests.find_one(
        {"user_id": user["user_id"]}, {"_id": 0}, sort=[("created_at", -1)]
    )
    if intake and isinstance(intake.get("created_at"), datetime):
        intake["created_at"] = intake["created_at"].isoformat()
    return {
        "purchased": bool(fresh.get("custom_program_purchased")),
        "athletes_center_access": bool(fresh.get("athletes_center_access")),
        "intake": intake,
    }

def _is_owner(user) -> bool:
    return (user.get("email", "").lower() in [e.lower() for e in OWNER_EMAILS]) or bool(user.get("all_rooms_access"))

@api_router.get("/custom-program/requests")
async def custom_program_requests(user=Depends(get_current_user)):
    """Coach-only: list every custom-program intake so Hutch can deliver files."""
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    rows = await db.custom_program_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows

@api_router.post("/custom-program/requests/{request_id}/deliver")
async def custom_program_deliver(request_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    """Coach-only: upload the finished program file for a buyer."""
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Coach access only")
    req = await db.custom_program_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    ct = (file.content_type or "application/octet-stream").lower().split(";")[0].strip()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > 40 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 40MB)")
    ext = (file.filename or "program.pdf").rsplit(".", 1)[-1][:5] if "." in (file.filename or "") else "bin"
    path = f"{STORAGE_APP_NAME}/programs/{req['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("med")
    await db.chat_media.insert_one({
        "media_id": media_id, "user_id": req["user_id"], "storage_path": path,
        "content_type": ct, "media_type": "file", "size": len(data),
        "original_name": file.filename, "created_at": datetime.now(timezone.utc),
    })
    await db.custom_program_requests.update_one(
        {"request_id": request_id},
        {"$set": {"program_media_id": media_id, "program_file_name": file.filename or "program",
                  "status": "delivered", "delivered_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "media_id": media_id, "file_name": file.filename}


# ---------- Founders (first 100 members + development backers) ----------
FOUNDER_LIMIT = 100

@api_router.get("/founders")
async def founders_list(user=Depends(get_current_user)):
    # First 100 real members (exclude leaderboard bots), earliest signups first
    rows = await db.users.find(
        {"is_bot": {"$ne": True}},
        {"_id": 0, "user_id": 1, "display_name": 1, "avatar_id": 1, "xp": 1, "created_at": 1, "founder_backer": 1, "sex": 1},
    ).sort("created_at", 1).limit(FOUNDER_LIMIT).to_list(FOUNDER_LIMIT)

    founders = []
    my_number = None
    for i, r in enumerate(rows):
        num = i + 1
        if r["user_id"] == user["user_id"]:
            my_number = num
        founders.append({
            "number": num,
            "display_name": r.get("display_name", "Athlete"),
            "avatar_id": r.get("avatar_id", "avatar_ronin"),
            "sex": r.get("sex", "male"),
            "rank": rank_from_xp(r.get("xp", 0)),
            "is_backer": bool(r.get("founder_backer")),
        })

    backer_rows = await db.users.find(
        {"founder_backer": True, "is_bot": {"$ne": True}},
        {"_id": 0, "display_name": 1, "avatar_id": 1, "xp": 1, "backed_at": 1, "sex": 1},
    ).sort("backed_at", 1).to_list(500)
    backers = [{
        "display_name": b.get("display_name", "Athlete"),
        "avatar_id": b.get("avatar_id", "avatar_ronin"),
        "sex": b.get("sex", "male"),
        "rank": rank_from_xp(b.get("xp", 0)),
    } for b in backer_rows]

    return {
        "founders": founders,
        "backers": backers,
        "founder_limit": FOUNDER_LIMIT,
        "me": {
            "number": my_number,
            "is_founder": my_number is not None,
            "is_backer": bool(user.get("founder_backer")),
        },
    }

@api_router.post("/founders/back")
async def founders_back(user=Depends(get_current_user)):
    """Sync endpoint called by the client after a RevenueCat 'Backer' purchase.
    Flags the backer ONLY if RevenueCat has confirmed the purchase server-side
    (via the webhook). Fail-closed — no verified purchase, no backer status."""
    if not await has_verified_purchase(user["user_id"], BACKER_ENTITLEMENT):
        raise HTTPException(
            status_code=402,
            detail="Purchase not verified yet. If you just purchased, wait a few seconds and tap Restore.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": _grant_set_for_entitlement(BACKER_ENTITLEMENT)},
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    fresh["rank"] = rank_from_xp(fresh["xp"])
    return fresh


# ---------- The Judge (AI physique critique + member comments) ----------
JUDGE_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_JUDGE_BYTES = 15 * 1024 * 1024

JUDGE_SYSTEM = (
    "You are 'The Judge', a world-class IFBB head bodybuilding judge with decades on the Olympia "
    "panel. You are tough, precise, and fair. Critique the physique shown in the photo. Score each "
    "category from 1.0 to 10.0 (one decimal). Return ONLY a single valid JSON object, no markdown, "
    'with EXACTLY these keys: {"overall": number, "symmetry": number, "conditioning": number, '
    '"size": number, "posing": number, "notes": string}. "notes" must be 2-4 sentences in a blunt '
    "but constructive pro-judge voice, naming specific strengths and what to bring up next. If the "
    "image does not clearly show a human physique, set all scores to 0 and use notes to ask for a "
    "clear, well-lit physique photo."
)

class JudgeComment(BaseModel):
    text: str

def _parse_judge_json(text: str):
    import json as _json, re as _re
    m = _re.search(r"\{.*\}", text or "", _re.DOTALL)
    if not m:
        return None
    try:
        d = _json.loads(m.group(0))
    except Exception:
        return None
    def num(k):
        try:
            return max(0.0, min(10.0, round(float(d.get(k, 0)), 1)))
        except Exception:
            return 0.0
    return {
        "overall": num("overall"),
        "symmetry": num("symmetry"),
        "conditioning": num("conditioning"),
        "size": num("size"),
        "posing": num("posing"),
        "notes": str(d.get("notes", ""))[:800],
    }

@api_router.post("/judge/submit")
async def judge_submit(file: UploadFile = File(...), caption: Optional[str] = Form(None),
                       user=Depends(get_current_user)):
    import base64
    if not (user.get("email_verified") or user.get("phone_verified")):
        raise HTTPException(status_code=403, detail="Verify your email or phone to submit to The Judge")
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if ct not in JUDGE_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Upload a JPEG, PNG, or WEBP photo")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_JUDGE_BYTES:
        raise HTTPException(status_code=400, detail="Photo too large (max 15MB)")
    ext = _EXT_MAP.get(ct, "jpg")
    path = f"{STORAGE_APP_NAME}/judge/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage_put(path, data, ct)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 402:
            raise HTTPException(status_code=402, detail="Storage credits exhausted — try again later")
        logger.error(f"Judge storage upload failed: {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Upload failed — try again")
    media_id = new_id("med")
    await db.chat_media.insert_one({
        "media_id": media_id, "user_id": user["user_id"], "storage_path": path,
        "content_type": ct, "media_type": "image", "size": len(data),
        "original_name": file.filename, "created_at": datetime.now(timezone.utc),
    })

    critique = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"judge_{user['user_id']}_{uuid.uuid4().hex[:6]}",
            system_message=JUDGE_SYSTEM,
        ).with_model("openai", "gpt-5.6-terra")
        img = ImageContent(image_base64=base64.b64encode(data).decode())
        resp = await chat.send_message(UserMessage(
            text="Judge this physique. Return only the JSON object.",
            file_contents=[img],
        ))
        critique = _parse_judge_json(resp)
    except Exception:
        logger.exception("Judge AI critique failed")
        critique = None

    sub_id = new_id("judge")
    doc = {
        "submission_id": sub_id,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_ronin"),
        "rank": rank_from_xp(user["xp"]),
        "media_id": media_id,
        "caption": (caption or "")[:300],
        "critique": critique,
        "comment_count": 0,
        "founder_backer": user.get("founder_backer", False),
        "created_at": datetime.now(timezone.utc),
    }
    await db.judge_submissions.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc

@api_router.get("/judge/feed")
async def judge_feed(user=Depends(get_current_user)):
    rows = await db.judge_submissions.find({}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows

@api_router.get("/judge/my-history")
async def judge_my_history(user=Depends(get_current_user)):
    rows = await db.judge_submissions.find(
        {"user_id": user["user_id"], "critique.overall": {"$gt": 0}}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    out = []
    for r in rows:
        c = r.get("critique") or {}
        ts = r.get("created_at")
        out.append({
            "submission_id": r["submission_id"],
            "media_id": r.get("media_id"),
            "overall": c.get("overall", 0),
            "symmetry": c.get("symmetry", 0),
            "conditioning": c.get("conditioning", 0),
            "size": c.get("size", 0),
            "posing": c.get("posing", 0),
            "created_at": ts.isoformat() if isinstance(ts, datetime) else ts,
        })
    best = max((r["overall"] for r in out), default=0)
    return {"history": out, "best": best, "count": len(out)}

@api_router.get("/judge/leaderboard")
async def judge_leaderboard(user=Depends(get_current_user)):
    """Top-scored physiques from the last 7 days."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    rows = await db.judge_submissions.find(
        {"created_at": {"$gte": week_ago}, "critique.overall": {"$gt": 0}}, {"_id": 0}
    ).to_list(500)
    rows.sort(key=lambda r: (r.get("critique") or {}).get("overall", 0), reverse=True)
    top = []
    for i, r in enumerate(rows[:20]):
        c = r.get("critique") or {}
        top.append({
            "rank_pos": i + 1,
            "submission_id": r["submission_id"],
            "display_name": r.get("display_name", "Athlete"),
            "avatar_id": r.get("avatar_id", "avatar_ronin"),
            "rank": r.get("rank", "Beginner"),
            "media_id": r.get("media_id"),
            "overall": c.get("overall", 0),
            "founder_backer": r.get("founder_backer", False),
        })
    return top

@api_router.get("/judge/{submission_id}/comments")
async def judge_comments(submission_id: str, user=Depends(get_current_user)):
    rows = await db.judge_comments.find({"submission_id": submission_id}, {"_id": 0}).sort("created_at", 1).to_list(300)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows

@api_router.post("/judge/{submission_id}/comments")
async def judge_comment_add(submission_id: str, inp: JudgeComment, user=Depends(get_current_user)):
    sub = await db.judge_submissions.find_one({"submission_id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment is empty")
    doc = {
        "comment_id": new_id("jc"),
        "submission_id": submission_id,
        "user_id": user["user_id"],
        "display_name": user.get("display_name", "Athlete"),
        "avatar_id": user.get("avatar_id", "avatar_ronin"),
        "rank": rank_from_xp(user["xp"]),
        "text": text[:500],
        "founder_backer": user.get("founder_backer", False),
        "created_at": datetime.now(timezone.utc),
    }
    await db.judge_comments.insert_one(doc)
    await db.judge_submissions.update_one({"submission_id": submission_id}, {"$inc": {"comment_count": 1}})
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


# ---------- AI Coach (GPT-5.4 conversational training/nutrition assistant) ----------
COACH_SYSTEM = (
    "You are the AI Coach for 'Hutch's Inner Circle', an elite strength & performance training app. "
    "You are an expert strength coach — powerlifting, hypertrophy, athletic performance, conditioning, "
    "mobility, and sports nutrition. Voice: blunt, motivating, no-fluff, like a hardcore but caring coach. "
    "Give concise, actionable answers (a few short paragraphs or tight bullet points max). Prescribe real "
    "sets/reps/loads and concrete nutrition numbers when asked. You are not a medical professional — if a "
    "user mentions pain, injury, or medical issues, add one short line advising them to consult a professional. "
    "Stay on training, nutrition, recovery, and mindset; politely redirect off-topic questions back to fitness. "
    "Format for a mobile chat bubble: PLAIN TEXT ONLY — no markdown symbols (do not use *, **, #, or ##). "
    "Use short lines, simple '-' bullets, and 1) 2) 3) numbering when listing."
)

class CoachMessageIn(BaseModel):
    text: str

@api_router.get("/coach/messages")
async def coach_messages(user=Depends(get_current_user)):
    rows = await db.coach_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).limit(200).to_list(200)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows

@api_router.post("/coach/messages")
async def coach_send(inp: CoachMessageIn, user=Depends(get_current_user)):
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message is empty")
    now = datetime.now(timezone.utc)
    await db.coach_messages.insert_one({
        "msg_id": new_id("coach"), "user_id": user["user_id"], "role": "user", "text": text[:1500], "created_at": now,
    })

    # Build recent transcript for context (last 16 turns)
    prior = await db.coach_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(17).to_list(17)
    prior = list(reversed(prior))[:-1]  # drop the just-added user msg
    transcript = "\n".join(f"{'Athlete' if m['role']=='user' else 'Coach'}: {m['text']}" for m in prior[-16:])
    profile = f"Athlete profile — display name: {user.get('display_name','Athlete')}, rank: {rank_from_xp(user['xp'])}, level: {level_from_xp(user['xp'])}."

    # Coach Memory: real PRs + recent training so advice is tailored
    prs = user.get("prs", {}) or {}
    pr_str = ", ".join(f"{k} {v}lb" for k, v in prs.items() if v) or "none logged yet"
    recent = await db.workouts.find({"user_id": user["user_id"]}, {"_id": 0}).sort("logged_at", -1).limit(5).to_list(5)
    lines = []
    for w in recent:
        exs = []
        for ex in (w.get("exercises") or [])[:6]:
            sets = ex.get("sets") or []
            top = max((s.get("weight_lb", 0) for s in sets), default=0)
            exs.append(f"{ex.get('name','?')} {len(sets)}x@{top}lb" if top else ex.get("name", "?"))
        when = w.get("logged_at")
        when_s = when.date().isoformat() if isinstance(when, datetime) else ""
        lines.append(f"  • {when_s} {w.get('template_name','Session')}: {', '.join(exs)}")
    memory = f"Current PRs: {pr_str}.\nLast {len(recent)} sessions:\n" + ("\n".join(lines) if lines else "  • none logged yet")
    memory += "\nUse these real numbers to tailor prescriptions (loads, progressions) to THIS athlete."

    sys = COACH_SYSTEM + "\n\n" + profile + "\n\n" + memory + ("\n\nRecent conversation:\n" + transcript if transcript else "")

    reply_text = ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"coach_{user['user_id']}",
            system_message=sys,
        ).with_model("openai", "gpt-5.4")
        reply_text = await chat.send_message(UserMessage(text=text))
    except Exception:
        logger.exception("AI Coach failed")
        raise HTTPException(status_code=502, detail="Coach is catching their breath — try again in a moment.")

    reply = {
        "msg_id": new_id("coach"), "user_id": user["user_id"], "role": "assistant",
        "text": reply_text.strip(), "created_at": datetime.now(timezone.utc),
    }
    await db.coach_messages.insert_one(dict(reply))
    reply["created_at"] = reply["created_at"].isoformat()
    return reply

@api_router.delete("/coach/messages")
async def coach_clear(user=Depends(get_current_user)):
    await db.coach_messages.delete_many({"user_id": user["user_id"]})
    return {"ok": True}

@api_router.post("/coach/tts")
async def coach_tts(inp: CoachMessageIn, user=Depends(get_current_user)):
    import re as _re
    text = _re.sub(r"https?://\S+", "", inp.text or "")
    text = _re.sub(r"[*_#>~|`]", "", text)
    text = _re.sub(r"\s+", " ", text).strip()[:4000]
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to speak")
    try:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
        tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio = await tts.generate_speech(text=text, model="tts-1", voice="onyx")
    except Exception:
        logger.exception("Coach TTS failed")
        raise HTTPException(status_code=502, detail="Voice unavailable")
    tid = new_id("tts")
    await db.coach_tts.insert_one({"tts_id": tid, "audio": audio, "created_at": datetime.now(timezone.utc)})
    return {"url": f"/api/coach/tts/{tid}.mp3"}

@api_router.get("/coach/tts/{tid}.mp3")
async def coach_tts_get(tid: str):
    from fastapi import Response
    row = await db.coach_tts.find_one({"tts_id": tid})
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=row["audio"], media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})


# ---------- Save Plan (store a coach-generated plan, show in Train) ----------
class CoachPlanIn(BaseModel):
    title: Optional[str] = None
    text: str

@api_router.get("/coach/plans")
async def coach_plans_list(user=Depends(get_current_user)):
    rows = await db.coach_plans.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return rows

@api_router.post("/coach/plans")
async def coach_plan_save(inp: CoachPlanIn, user=Depends(get_current_user)):
    text = (inp.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Nothing to save")
    title = (inp.title or "").strip()
    if not title:
        first = text.split("\n", 1)[0].strip()
        title = (first[:48] + "…") if len(first) > 48 else (first or "Coach Plan")
    doc = {
        "plan_id": new_id("plan"), "user_id": user["user_id"],
        "title": title, "text": text[:6000], "created_at": datetime.now(timezone.utc),
    }
    await db.coach_plans.insert_one(dict(doc))
    doc["created_at"] = doc["created_at"].isoformat()
    return doc

@api_router.delete("/coach/plans/{plan_id}")
async def coach_plan_delete(plan_id: str, user=Depends(get_current_user)):
    await db.coach_plans.delete_one({"plan_id": plan_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Voice Ask (Whisper STT) ----------
_STT = None
@api_router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...), user=Depends(get_current_user)):
    global _STT
    fname = (file.filename or "voice.webm")
    suffix = fname.rsplit(".", 1)[-1].lower() if "." in fname else "webm"
    if suffix not in ("m4a", "wav", "webm", "mp4", "mp3", "mpeg", "mpga", "ogg"):
        raise HTTPException(status_code=400, detail="Unsupported audio format")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty recording")
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Recording too long")
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        if _STT is None:
            _STT = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        result = await _STT.transcribe(data, filename=fname, model="whisper-1", response_format="text")
        text = result if isinstance(result, str) else (result.get("text") if isinstance(result, dict) else getattr(result, "text", str(result)))
        text = (text or "").strip()
    except Exception:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail="Couldn't transcribe that — try again.")
    if not text:
        raise HTTPException(status_code=422, detail="No speech detected")
    return {"text": text}


# ---------- Seed ----------
# Owner accounts get full access to every chatroom regardless of rank/subscription
OWNER_EMAILS = ["the9hutch@gmail.com"]

async def seed():
    # Grant owner accounts full room access (persists across restarts)
    await db.users.update_many(
        {"email": {"$in": OWNER_EMAILS}},
        {"$set": {"all_rooms_access": True, "skool_verified": True}},
    )
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.chat_messages.create_index([("room", 1), ("created_at", -1)])
    await db.chat_media.create_index("media_id", unique=True)
    await db.verification_codes.create_index([("user_id", 1), ("channel", 1)], unique=True)
    await db.verified_purchases.create_index([("user_id", 1), ("entitlement", 1)], unique=True)
    await db.rc_webhook_events.create_index("event_id", unique=True)

    # Warm up object storage (non-fatal if it fails at boot)
    try:
        await init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed at startup (will retry lazily): {e}")

    # Seed test users
    seeds = [
        {"email": "athlete@test.com", "name": "Ronin", "xp": 3000, "prs": {"bench": 225, "squat": 315, "deadlift": 405, "ohp": 135}, "bw": 180, "avatar": "avatar_ronin"},
        {"email": "elite@test.com", "name": "Kaido", "xp": 15500, "prs": {"bench": 315, "squat": 455, "deadlift": 545, "ohp": 185}, "bw": 200, "avatar": "avatar_kaido"},
        {"email": "freak@test.com", "name": "Titan", "xp": 18500, "prs": {"bench": 405, "squat": 585, "deadlift": 675, "ohp": 245}, "bw": 240, "avatar": "avatar_titan"},
    ]
    for s in seeds:
        badges = set()
        for lift_key, w in s["prs"].items():
            for m in milestones_for(w):
                badges.add(f"{lift_key}_{m}")
        existing = await db.users.find_one({"email": s["email"]})
        # Canonical stats reset on every startup so demo + tests stay deterministic
        canonical = {
            "display_name": s["name"],
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
            "skool_verified": s["email"] == "elite@test.com",
            "active_background": "bg_default",
        }
        if existing:
            await db.users.update_one({"email": s["email"]}, {"$set": canonical})
            continue
        doc = {
            "user_id": new_id("usr"),
            "email": s["email"],
            "picture": "",
            "last_workout_date": datetime.now(timezone.utc).isoformat(),
            "password_hash": hash_password("TestPass123!"),
            "created_at": datetime.now(timezone.utc),
            **canonical,
        }
        await db.users.insert_one(doc)
    # Seed 10 permanent "milestone" bot athletes so leaderboards are always populated
    BOTS = [
        {"name": "Plate Prophet", "xp": 620, "prs": {"bench": 185, "squat": 275, "deadlift": 315, "ohp": 115}, "bw": 175, "avatar": "avatar_ronin", "sprints": {"40yd": 5.3, "100m": 14.1}, "cardio": [("run", 5.2, 1620), ("run", 3.1, 960)]},
        {"name": "Iron Sentinel", "xp": 1350, "prs": {"bench": 225, "squat": 315, "deadlift": 405, "ohp": 135}, "bw": 190, "avatar": "avatar_titan", "sprints": {"40yd": 5.0, "100m": 13.4}, "cardio": [("bike", 22.0, 3600)]},
        {"name": "Gravitas", "xp": 2100, "prs": {"bench": 275, "squat": 365, "deadlift": 455, "ohp": 155}, "bw": 205, "avatar": "avatar_kaido", "sprints": {"40yd": 4.9, "100m": 13.0}, "cardio": [("run", 10.0, 2820)]},
        {"name": "Warhound", "xp": 2800, "prs": {"bench": 315, "squat": 405, "deadlift": 500, "ohp": 175}, "bw": 198, "avatar": "avatar_demon", "sprints": {"40yd": 4.7, "100m": 12.5}, "cardio": [("run", 8.0, 2160), ("bike", 30.0, 4500)]},
        {"name": "Vanguard", "xp": 3600, "prs": {"bench": 335, "squat": 455, "deadlift": 545, "ohp": 185}, "bw": 210, "avatar": "avatar_saiyan", "sprints": {"40yd": 4.6, "100m": 12.2}, "cardio": [("run", 12.0, 3300)]},
        {"name": "Colossus", "xp": 4500, "prs": {"bench": 365, "squat": 495, "deadlift": 585, "ohp": 205}, "bw": 235, "avatar": "avatar_titan", "sprints": {"40yd": 4.9, "100m": 13.1}, "cardio": [("bike", 40.0, 5400)]},
        {"name": "Nightfall", "xp": 5400, "prs": {"bench": 385, "squat": 515, "deadlift": 605, "ohp": 215}, "bw": 215, "avatar": "avatar_reaper", "sprints": {"40yd": 4.5, "100m": 11.9}, "cardio": [("run", 15.0, 3900)]},
        {"name": "Bastion", "xp": 6600, "prs": {"bench": 405, "squat": 545, "deadlift": 635, "ohp": 225}, "bw": 228, "avatar": "avatar_shinobi", "sprints": {"40yd": 4.6, "100m": 12.0}, "cardio": [("run", 10.0, 2640), ("bike", 35.0, 4800)]},
        {"name": "Overkill", "xp": 8200, "prs": {"bench": 455, "squat": 585, "deadlift": 675, "ohp": 245}, "bw": 245, "avatar": "avatar_phoenix", "sprints": {"40yd": 4.5, "100m": 11.7}, "cardio": [("run", 6.0, 1560)]},
        {"name": "Apex Prime", "xp": 11000, "prs": {"bench": 495, "squat": 635, "deadlift": 725, "ohp": 275}, "bw": 250, "avatar": "avatar_saiyan", "sprints": {"40yd": 4.4, "100m": 11.4}, "cardio": [("run", 21.1, 5400), ("bike", 50.0, 6300)]},
    ]
    for i, b in enumerate(BOTS):
        email = f"bot{i+1}@circle.ai"
        badges = set()
        for lk, w in b["prs"].items():
            for m in milestones_for(w):
                badges.add(f"{lk}_{m}")
        canonical = {
            "display_name": b["name"],
            "avatar_id": b["avatar"],
            "bodyweight_lb": b["bw"],
            "age": 26,
            "sex": "male",
            "xp": b["xp"],
            "level": level_from_xp(b["xp"]),
            "prs": b["prs"],
            "badges": list(badges) + ["pr_hunter"],
            "workouts_logged": 30 + i * 4,
            "streak_days": 6 + i,
            "skool_verified": i % 2 == 0,
            "active_background": "bg_default",
            "sprints": b.get("sprints", {}),
            "is_bot": True,
        }
        existing = await db.users.find_one({"email": email})
        if existing:
            uid = existing["user_id"]
            await db.users.update_one({"email": email}, {"$set": canonical})
        else:
            uid = new_id("usr")
            await db.users.insert_one({
                "user_id": uid, "email": email, "picture": "", "password_hash": "",
                "created_at": datetime.now(timezone.utc), **canonical,
            })
        # Reset bot cardio each startup so cardio boards stay deterministic
        await db.cardio.delete_many({"user_id": uid})
        for act, km, dur in b.get("cardio", []):
            await db.cardio.insert_one({
                "cardio_id": new_id("cardio"), "user_id": uid, "activity_type": act,
                "distance_km": km, "duration_s": dur, "elevation_gain_m": 0, "temperature_c": None,
                "avg_pace_min_km": round((dur / 60) / km, 2) if km else 0,
                "avg_speed_kmh": round(km / (dur / 3600), 2) if dur else 0,
                "route": [], "logged_at": datetime.now(timezone.utc),
            })

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
