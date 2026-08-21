from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, UploadFile, File, Form, Request, Body
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
    full_name: Optional[str] = None
    sex: Optional[Literal["male", "female", "other"]] = None
    referral_code: Optional[str] = None
    gym: Optional[str] = None
    inperson_request: Optional[bool] = None

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
    equipped_hair: Optional[str] = None
    equipped_beard: Optional[str] = None
    social_tiktok: Optional[str] = None
    social_instagram: Optional[str] = None
    social_youtube: Optional[str] = None
    gym: Optional[str] = None
    lite_mode: Optional[bool] = None
    inperson_request: Optional[bool] = None
    tour_seen: Optional[bool] = None
    tour_version: Optional[int] = None
    founder_welcomed: Optional[bool] = None


def social_handle(raw: str) -> str:
    """Normalize a TikTok/Instagram/YouTube input (handle or full URL) to a bare username."""
    s = (raw or "").strip()
    if not s:
        return ""
    # pull the last path segment if a URL was pasted
    if "/" in s:
        s = s.rstrip("/").split("/")[-1]
    s = s.lstrip("@").strip()
    # strip query strings
    s = s.split("?")[0]
    # keep only valid handle chars
    s = re.sub(r"[^A-Za-z0-9._-]", "", s)
    return s[:30]


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

class SessionRequestIn(BaseModel):
    date: str
    time: str
    note: Optional[str] = ""
    tz_offset_minutes: Optional[int] = 0

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
    try:
        xp = int(xp or 0)
    except (TypeError, ValueError):
        xp = 0
    if xp < 0:
        xp = 0
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

def ban_state(user) -> Optional[dict]:
    """Active temporary-ban info for a user, or None. scope: login|chat|all."""
    until = user.get("banned_until")
    if not until:
        return None
    if isinstance(until, str):
        try:
            until = datetime.fromisoformat(until)
        except Exception:
            return None
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if until <= datetime.now(timezone.utc):
        return None
    return {"until": until, "scope": user.get("ban_scope", "all"), "reason": user.get("ban_reason", "")}


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
    if not user.get("is_admin"):
        b = ban_state(user)
        if b and b["scope"] in ("login", "all"):
            until = b["until"].strftime("%b %d, %H:%M UTC")
            raise HTTPException(status_code=403, detail=f"Your access is suspended until {until}." + (f" Reason: {b['reason']}" if b['reason'] else ""))
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
        "avatar_id": "avatar_white",
        "bodyweight_lb": 180,
        "age": 25,
        "sex": "male",
        "xp": 0,
        "level": 1,
        "prs": {"bench": 0, "squat": 0, "deadlift": 0, "ohp": 0},
        "baseline_set": False,
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
        "referral_code": "HIC" + uuid.uuid4().hex[:6].upper(),
        "referred_by": None,
        "referral_count": 0,
        "created_at": datetime.now(timezone.utc),
    }

async def award_xp(user_id: str, amount: int):
    await db.users.update_one({"user_id": user_id}, {"$inc": {"xp": amount}})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if user:
        new_level = level_from_xp(user["xp"])
        await db.users.update_one({"user_id": user_id}, {"$set": {"level": new_level}})


async def award_group_xp(user_id: str, amount: int):
    """Contribute a member's earned XP to every clan/group they belong to."""
    if not amount or amount <= 0:
        return
    await db.groups.update_many({"members": user_id}, {"$inc": {"xp": int(amount)}})


async def founder_status(user) -> dict:
    """First FOUNDER_LIMIT real members (by signup order) are Founding Beta members and
    get all subscription/Skool-gated perks free. Returns {is_founder, founder_number}."""
    if not user or user.get("is_bot"):
        return {"is_founder": False, "founder_number": None}
    if user.get("founder_grant"):
        return {"is_founder": True, "founder_number": user.get("founder_number_override")}
    created = user.get("created_at")
    if not created:
        return {"is_founder": False, "founder_number": None}
    ahead = await db.users.count_documents(
        {"is_bot": {"$ne": True}, "created_at": {"$lt": created}, **NOT_TEST_EMAIL}
    )
    num = ahead + 1
    return {"is_founder": num <= FOUNDER_LIMIT, "founder_number": num if num <= FOUNDER_LIMIT else None}


# ---------- Season champions (Hall of Fame) ----------
def season_label_for(dt) -> str:
    """Calendar-quarter season label, e.g. 2026-S3."""
    q = (dt.month - 1) // 3 + 1
    return f"{dt.year}-S{q}"


async def season_champions_map() -> dict:
    """{season_label: {user_id, bosses}} — top boss-slayer of each PAST season
    (the current season stays on the live board, so it is excluded)."""
    now = datetime.now(timezone.utc)
    cur = season_label_for(now)
    buckets: dict = {}
    async for c in db.quest_claims.find({"quest_key": {"$regex": "^boss:"}}):
        ts = c.get("claimed_at")
        uid = c.get("user_id")
        if not ts or not uid:
            continue
        if getattr(ts, "tzinfo", None) is None:
            ts = ts.replace(tzinfo=timezone.utc)
        label = season_label_for(ts)
        if label == cur:
            continue
        buckets.setdefault(label, {})
        buckets[label][uid] = buckets[label].get(uid, 0) + 1
    out: dict = {}
    for label, counts in buckets.items():
        uid, n = max(counts.items(), key=lambda kv: kv[1])
        out[label] = {"user_id": uid, "bosses": n}
    return out


async def season_titles_for(user_id: str) -> list:
    """Sorted (newest-first) list of season labels this user won."""
    m = await season_champions_map()
    return sorted([s for s, v in m.items() if v.get("user_id") == user_id], reverse=True)


# ---------- Referral rewards ----------
REFERRER_XP = 100      # bonus XP the inviter earns per successful referral
REFERRED_XP = 50       # welcome XP boost for the new friend who used a code
RECRUITER_BADGE_AT = 3  # successful referrals needed for the RECRUITER badge


async def apply_referral(new_user: dict, code: str) -> Optional[dict]:
    """Link a fresh signup to their inviter (by referral_code) and pay both sides.
    Returns the referrer's public-ish info dict, or None if code invalid/self."""
    code = (code or "").strip().upper()
    if not code:
        return None
    referrer = await db.users.find_one({"referral_code": code})
    if not referrer or referrer["user_id"] == new_user["user_id"]:
        return None
    # Link + reward the new friend
    await db.users.update_one(
        {"user_id": new_user["user_id"]}, {"$set": {"referred_by": referrer["user_id"]}}
    )
    await award_xp(new_user["user_id"], REFERRED_XP)
    # Reward the inviter + tally
    await db.users.update_one({"user_id": referrer["user_id"]}, {"$inc": {"referral_count": 1}})
    await award_xp(referrer["user_id"], REFERRER_XP)
    fresh_ref = await db.users.find_one({"user_id": referrer["user_id"]}, {"_id": 0})
    if (fresh_ref.get("referral_count", 0) >= RECRUITER_BADGE_AT) and "recruiter" not in (fresh_ref.get("badges") or []):
        await db.users.update_one({"user_id": referrer["user_id"]}, {"$addToSet": {"badges": "recruiter"}})
    return {"user_id": referrer["user_id"], "display_name": referrer.get("display_name", "Athlete")}


# ---------- Twilio SMS (phone OTP + admin announcements) ----------
from starlette.concurrency import run_in_threadpool  # noqa: E402

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")
_twilio_client = None


def twilio_configured() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER)


def _twilio():
    global _twilio_client
    if _twilio_client is None and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
        from twilio.rest import Client
        _twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    return _twilio_client


def to_e164(phone: str) -> str:
    p = (phone or "").strip()
    digits = re.sub(r"\D", "", p)
    if p.startswith("+"):
        return "+" + digits
    if len(digits) == 10:  # assume North America if no country code
        return "+1" + digits
    return "+" + digits


async def send_sms(to: str, body: str) -> str:
    """Send an SMS via Twilio (runs the sync SDK in a threadpool). Returns message SID."""
    client = _twilio()
    if not client or not TWILIO_PHONE_NUMBER:
        raise RuntimeError("Twilio not configured")
    msg = await run_in_threadpool(
        lambda: client.messages.create(from_=TWILIO_PHONE_NUMBER, to=to_e164(to), body=body)
    )
    return msg.sid



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











async def _compute_attributes(user):
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






class StepsLog(BaseModel):
    steps: int
    date: Optional[str] = None



class HeartRateLog(BaseModel):
    current_bpm: Optional[int] = None
    resting_bpm: Optional[int] = None
    avg_bpm: Optional[int] = None
    max_bpm: Optional[int] = None
    date: Optional[str] = None







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



# ---------- Exercise Library + Split Templates ----------
EXERCISE_LIBRARY = [
    # Chest
    {"name": "Barbell Bench Press", "category": "Chest", "desc": "The primary flat-bench press. Retract your shoulder blades and drive the bar over mid-chest for max pec and triceps power."},
    {"name": "Incline Barbell Bench Press", "category": "Chest", "desc": "Bench set to 30-45 degrees to emphasize the upper chest and front delts."},
    {"name": "Decline Barbell Bench Press", "category": "Chest", "desc": "Bench angled downward to bias the lower-chest fibers."},
    {"name": "Dumbbell Bench Press", "category": "Chest", "desc": "Flat press with dumbbells for a deeper stretch and even left/right development."},
    {"name": "Incline Dumbbell Press", "category": "Chest", "desc": "Inclined dumbbell press that hits the upper chest with a bigger range of motion."},
    {"name": "Machine Chest Press", "category": "Chest", "desc": "Fixed-path press, great for controlled volume and chasing a safe pump."},
    {"name": "Cable Fly", "category": "Chest", "desc": "Standing cable flyes that keep constant tension across the chest through the full arc."},
    {"name": "Pec Deck", "category": "Chest", "desc": "Seated machine flye that isolates the chest on a joint-friendly path."},
    {"name": "Dumbbell Fly", "category": "Chest", "desc": "Flat-bench flye with a wide arc for a strong pec stretch and squeeze."},
    {"name": "Push-Up", "category": "Chest", "desc": "Bodyweight press. Keep a tight plank and lower your chest to the floor."},
    {"name": "Weighted Dip", "category": "Chest", "desc": "Dip leaning forward with added load to build the lower chest and triceps."},
    {"name": "Incline Machine Press", "category": "Chest", "desc": "Machine incline press for stable, high-volume upper-chest work."},
    {"name": "Cable Crossover", "category": "Chest", "desc": "Cables pulled down and together to target the lower and inner chest."},
    {"name": "Landmine Press", "category": "Chest", "desc": "One-arm press with a barbell in a landmine, a shoulder-friendly upper-chest builder."},
    {"name": "Smith Machine Bench Press", "category": "Chest", "desc": "Guided-bar bench for controlled pressing and safe overload."},
    # Back
    {"name": "Deadlift", "category": "Back", "desc": "The king of pulls. Hinge and drive the floor away to build the entire posterior chain."},
    {"name": "Barbell Row", "category": "Back", "desc": "Bent-over row pulling to the lower ribs for mid-back thickness."},
    {"name": "Pendlay Row", "category": "Back", "desc": "Explosive row from a dead stop on the floor every rep. Strict and powerful."},
    {"name": "T-Bar Row", "category": "Back", "desc": "Chest-supported or landmine row for heavy mid-back loading."},
    {"name": "Chest-Supported Row", "category": "Back", "desc": "Row with your torso braced on a pad to remove momentum and isolate the back."},
    {"name": "Seated Cable Row", "category": "Back", "desc": "Seated row with a neutral grip. Squeeze the shoulder blades together at the back."},
    {"name": "Lat Pulldown", "category": "Back", "desc": "Vertical pull to the collarbone that builds lat width."},
    {"name": "Pulldowns", "category": "Back", "desc": "General cable pulldown variation for lat width and control."},
    {"name": "Pull-Up", "category": "Back", "desc": "Bodyweight vertical pull. Dead-hang to chin-over-bar for lats and grip."},
    {"name": "Chin-Up", "category": "Back", "desc": "Underhand pull-up that biases the lats and biceps."},
    {"name": "Dumbbell Row", "category": "Back", "desc": "Single-arm braced row for a big stretch and balanced unilateral work."},
    {"name": "Face Pull", "category": "Back", "desc": "Rope pull to the face for rear delts and healthier shoulders."},
    {"name": "Straight-Arm Pulldown", "category": "Back", "desc": "Lat isolation with straight arms sweeping the bar toward your thighs."},
    {"name": "Rack Pull", "category": "Back", "desc": "Partial deadlift from pins to overload the top-end pull and traps."},
    {"name": "Meadows Row", "category": "Back", "desc": "Landmine single-arm row with a big stretch across the lats."},
    {"name": "Inverted Row", "category": "Back", "desc": "Bodyweight horizontal row under a fixed bar, scalable for any level."},
    {"name": "Machine Row", "category": "Back", "desc": "Plate- or pin-loaded row on a fixed path for easy progressive overload."},
    {"name": "Snatch-Grip Deadlift", "category": "Back", "desc": "Wide-grip deadlift that increases range of motion and upper-back demand."},
    {"name": "Reverse Pec Deck", "category": "Back", "desc": "Machine rear-delt flye for the upper back and posture."},
    # Shoulders
    {"name": "Overhead Press", "category": "Shoulders", "desc": "Standing barbell press overhead. Brace hard and press to full lockout."},
    {"name": "Seated Dumbbell Press", "category": "Shoulders", "desc": "Seated overhead press with dumbbells for even delt development."},
    {"name": "Arnold Press", "category": "Shoulders", "desc": "Rotating dumbbell press that hits all three delt heads."},
    {"name": "Lateral Raise", "category": "Shoulders", "desc": "Raise dumbbells out to the sides to build lateral-delt width."},
    {"name": "Cable Lateral Raise", "category": "Shoulders", "desc": "Cable side raise for constant tension on the side delts."},
    {"name": "Rear Delt Fly", "category": "Shoulders", "desc": "Bent-over reverse flye targeting the rear delts."},
    {"name": "Front Raise", "category": "Shoulders", "desc": "Raise the weight to shoulder height in front to hit the front delts."},
    {"name": "Upright Row", "category": "Shoulders", "desc": "Pull the bar up along the body to the chest for delts and traps."},
    {"name": "Shrug", "category": "Shoulders", "desc": "Elevate the shoulders straight up to build the traps."},
    {"name": "Machine Shoulder Press", "category": "Shoulders", "desc": "Fixed-path overhead press for safe, high delt volume."},
    {"name": "Landmine Shoulder Press", "category": "Shoulders", "desc": "Angled one-arm press that is easy on the shoulder joint."},
    {"name": "Cable Rear Delt Fly", "category": "Shoulders", "desc": "Cross-cable reverse flye keeping tension on the rear delts."},
    {"name": "Y-Raise", "category": "Shoulders", "desc": "Incline raise in a Y path for the lower traps and rear delts."},
    # Legs
    {"name": "Back Squat", "category": "Legs", "desc": "Barbell on the back. Squat to depth to build total-leg strength."},
    {"name": "Front Squat", "category": "Legs", "desc": "Bar racked on the front delts with an upright torso that hammers the quads."},
    {"name": "Hack Squat", "category": "Legs", "desc": "Machine squat on a fixed sled to overload the quads safely."},
    {"name": "Leg Press", "category": "Legs", "desc": "Seated sled press for heavy quad and glute volume."},
    {"name": "Romanian Deadlift", "category": "Legs", "desc": "Stiff-leg hinge with a big hamstring stretch. Keep the bar close."},
    {"name": "Bulgarian Split Squat", "category": "Legs", "desc": "Rear-foot-elevated split squat for single-leg strength and balance."},
    {"name": "Walking Lunge", "category": "Legs", "desc": "Alternating forward lunges for quads, glutes, and conditioning."},
    {"name": "Leg Extension", "category": "Legs", "desc": "Seated machine knee extension that isolates the quads."},
    {"name": "Leg Curl", "category": "Legs", "desc": "Lying machine curl that isolates the hamstrings."},
    {"name": "Seated Leg Curl", "category": "Legs", "desc": "Seated hamstring curl with a strong stretch under load."},
    {"name": "Standing Calf Raise", "category": "Legs", "desc": "Rise onto the toes standing to build the gastrocnemius."},
    {"name": "Seated Calf Raise", "category": "Legs", "desc": "Seated toe raise that targets the soleus of the calf."},
    {"name": "Hip Thrust", "category": "Legs", "desc": "Bench-supported barbell bridge for powerful glute development."},
    {"name": "Goblet Squat", "category": "Legs", "desc": "Hold a dumbbell at the chest and squat. Great for depth and form."},
    {"name": "Sumo Deadlift", "category": "Legs", "desc": "Wide-stance deadlift with more quad and adductor involvement."},
    {"name": "Belt Squat", "category": "Legs", "desc": "Load hung from the hips to squat hard without loading the spine."},
    {"name": "Step-Up", "category": "Legs", "desc": "Drive up onto a box one leg at a time for quads and glutes."},
    {"name": "Reverse Lunge", "category": "Legs", "desc": "Step back into a lunge, easier on the knees than the forward version."},
    {"name": "Nordic Curl", "category": "Legs", "desc": "Eccentric bodyweight hamstring curl for serious hamstring strength."},
    {"name": "Glute-Ham Raise", "category": "Legs", "desc": "GHD hip-and-knee extension for the hamstrings and glutes."},
    {"name": "Adductor Machine", "category": "Legs", "desc": "Squeeze the pads together to train the inner thighs."},
    {"name": "Abductor Machine", "category": "Legs", "desc": "Press the pads apart to train the glute medius and outer hips."},
    # Arms
    {"name": "Barbell Curl", "category": "Arms", "desc": "Standing straight-bar curl to build overall biceps mass."},
    {"name": "EZ-Bar Curl", "category": "Arms", "desc": "Curl on an angled bar that is easier on the wrists."},
    {"name": "Dumbbell Curl", "category": "Arms", "desc": "Alternating or simultaneous curls with a supinating grip."},
    {"name": "Hammer Curl", "category": "Arms", "desc": "Neutral-grip curl that targets the brachialis and forearms."},
    {"name": "Preacher Curl", "category": "Arms", "desc": "Arm braced on a pad to strictly isolate the biceps."},
    {"name": "Incline Dumbbell Curl", "category": "Arms", "desc": "Curl lying back on an incline for a long biceps stretch."},
    {"name": "Cable Curl", "category": "Arms", "desc": "Standing cable curl for constant tension through the rep."},
    {"name": "Tricep Pushdown", "category": "Arms", "desc": "Cable pushdown pressing the handle to lockout for the triceps."},
    {"name": "Overhead Tricep Extension", "category": "Arms", "desc": "Extend a weight overhead to hit the long head of the triceps."},
    {"name": "Skull Crusher", "category": "Arms", "desc": "Lying extension lowering the bar toward the forehead for the triceps."},
    {"name": "Close-Grip Bench Press", "category": "Arms", "desc": "Narrow-grip bench that emphasizes the triceps."},
    {"name": "Cable Overhead Extension", "category": "Arms", "desc": "Overhead rope extension keeping tension on the long head."},
    {"name": "Wrist Curl", "category": "Arms", "desc": "Curl the wrists up to build the forearm flexors."},
    {"name": "Concentration Curl", "category": "Arms", "desc": "Seated single-arm curl braced on the thigh for a peak contraction."},
    {"name": "Spider Curl", "category": "Arms", "desc": "Curl with arms hanging over an incline bench for constant biceps tension."},
    {"name": "Reverse Curl", "category": "Arms", "desc": "Overhand curl for the brachialis and forearm extensors."},
    {"name": "Zottman Curl", "category": "Arms", "desc": "Curl up supinated and lower pronated to hit biceps and forearms."},
    {"name": "Rope Pushdown", "category": "Arms", "desc": "Cable pushdown with a rope, spreading the ends apart at lockout."},
    {"name": "Triceps Dip", "category": "Arms", "desc": "Upright bodyweight dip that biases the triceps."},
    {"name": "Reverse Wrist Curl", "category": "Arms", "desc": "Curl the wrists upward to build the forearm extensors."},
    # Core
    {"name": "Hanging Leg Raise", "category": "Core", "desc": "Hang and raise the legs to hit the lower abs and hip flexors."},
    {"name": "Cable Crunch", "category": "Core", "desc": "Kneeling rope crunch that lets you progressively load the abs."},
    {"name": "Plank", "category": "Core", "desc": "Hold a rigid plank to build anti-extension core stability."},
    {"name": "Ab Wheel Rollout", "category": "Core", "desc": "Roll out and back under control for total-core strength."},
    {"name": "Russian Twist", "category": "Core", "desc": "Rotate side to side to train the obliques."},
    {"name": "Weighted Sit-Up", "category": "Core", "desc": "Sit-up holding a plate for loaded ab work."},
    {"name": "Decline Sit-Up", "category": "Core", "desc": "Sit-up on a decline for a longer range on the abs."},
    {"name": "Hanging Knee Raise", "category": "Core", "desc": "Hang and drive the knees up, a scalable lower-ab builder."},
    {"name": "Pallof Press", "category": "Core", "desc": "Press a cable straight out to resist rotation (anti-rotation)."},
    {"name": "Side Plank", "category": "Core", "desc": "Hold on one forearm to train the obliques and lateral core."},
    {"name": "Toes-to-Bar", "category": "Core", "desc": "Hang and bring the toes to the bar for advanced ab strength."},
    {"name": "Cable Woodchopper", "category": "Core", "desc": "Cable chop across the body for rotational core power."},
    {"name": "Machine Crunch", "category": "Core", "desc": "Seated machine crunch for easy, loadable ab volume."},
    # Olympic / Power
    {"name": "Power Clean", "category": "Olympic", "desc": "Explosively pull the bar from the floor to the shoulders."},
    {"name": "Clean and Jerk", "category": "Olympic", "desc": "Clean to the shoulders, then jerk overhead. Full-body power."},
    {"name": "Snatch", "category": "Olympic", "desc": "One explosive pull from floor to overhead, the most technical lift."},
    {"name": "Push Press", "category": "Olympic", "desc": "Dip and drive to press the bar overhead using the legs."},
    {"name": "Clean Pull", "category": "Olympic", "desc": "The pull portion of the clean to build power off the floor."},
    {"name": "Hang Clean", "category": "Olympic", "desc": "Clean starting from the hang to train the explosive second pull."},
    {"name": "Power Snatch", "category": "Olympic", "desc": "Snatch caught above parallel to emphasize speed and power."},
    {"name": "Push Jerk", "category": "Olympic", "desc": "Dip, drive, and re-dip under the bar to lock it out overhead."},
    {"name": "Kettlebell Swing", "category": "Olympic", "desc": "Hip-hinge swing for explosive glutes, hamstrings, and conditioning."},
    {"name": "Box Jump", "category": "Olympic", "desc": "Explosive jump onto a box for lower-body power (log your reps)."},

    # ---- Powerlifting ----
    {"name": "Competition Squat", "category": "Powerlifting", "desc": "Low-bar competition-style squat to depth. Brace, break at the hips, and drive out of the hole."},
    {"name": "Competition Bench Press", "category": "Powerlifting", "desc": "Paused competition bench with a set grip and leg drive. Pause on the chest, then press to lockout."},
    {"name": "Competition Deadlift", "category": "Powerlifting", "desc": "Conventional or sumo pull to lockout under meet commands. Own the setup and grind the lockout."},
    {"name": "Sumo Deadlift", "category": "Powerlifting", "desc": "Wide-stance pull with a more upright torso that shortens the range and loads the hips and quads."},
    {"name": "Pause Squat", "category": "Powerlifting", "desc": "Squat with a dead-stop pause at the bottom to build out-of-the-hole strength and control."},
    {"name": "Pause Bench Press", "category": "Powerlifting", "desc": "Bench with a longer pause on the chest to build starting strength and meet-legal control."},
    {"name": "Deficit Deadlift", "category": "Powerlifting", "desc": "Pull while standing on a plate to increase range of motion and off-the-floor strength."},
    {"name": "Block Pull", "category": "Powerlifting", "desc": "Deadlift from blocks to overload the mid-range and lockout."},
    {"name": "Board Press", "category": "Powerlifting", "desc": "Bench to a board to overload the lockout and train triceps strength."},
    {"name": "Spoto Press", "category": "Powerlifting", "desc": "Bench paused just above the chest to build tension and control mid-press."},
    {"name": "Pin Squat", "category": "Powerlifting", "desc": "Squat to pins in a rack to train a dead-stop start at a set depth."},
    {"name": "Good Morning", "category": "Powerlifting", "desc": "Hip hinge with the bar on your back to build the posterior chain and brace for squats."},
    {"name": "Banded Bench Press", "category": "Powerlifting", "desc": "Bench with bands for accommodating resistance and explosive lockout speed."},
    {"name": "Banded Deadlift", "category": "Powerlifting", "desc": "Deadlift against band tension to build speed and lockout power."},

    # ---- Strongman ----
    {"name": "Atlas Stone Lift", "category": "Strongman", "desc": "Lap and load a heavy stone to a platform. Full-body pull, hip drive, and grip."},
    {"name": "Log Press", "category": "Strongman", "desc": "Clean and press a thick log overhead. Big shoulders, triceps, and bracing."},
    {"name": "Farmer's Walk", "category": "Strongman", "desc": "Carry heavy implements for distance. Brutal grip, trap, and core conditioning."},
    {"name": "Yoke Walk", "category": "Strongman", "desc": "Walk with a loaded yoke across your back for total-body stability and speed."},
    {"name": "Sled Push", "category": "Strongman", "desc": "Drive a loaded sled forward for leg drive and conditioning."},
    {"name": "Sled Drag", "category": "Strongman", "desc": "Pull a loaded sled backward or forward to build legs and work capacity."},
    {"name": "Tire Flip", "category": "Strongman", "desc": "Lift and flip a heavy tire using a full posterior-chain drive."},
    {"name": "Sandbag Carry", "category": "Strongman", "desc": "Bear-hug and carry a sandbag for grip, core, and conditioning."},
    {"name": "Sandbag-to-Shoulder", "category": "Strongman", "desc": "Explosively load a sandbag to your shoulder. Full hip extension and grip."},
    {"name": "Keg Clean & Press", "category": "Strongman", "desc": "Clean and press a shifting keg overhead for real-world pressing power."},
    {"name": "Axle Deadlift", "category": "Strongman", "desc": "Deadlift a thick axle bar to challenge grip and pulling strength."},
    {"name": "Viking Press", "category": "Strongman", "desc": "Neutral-grip overhead press on a landmine/machine for pressing volume."},
    {"name": "Circus Dumbbell Press", "category": "Strongman", "desc": "One-arm press of an oversized dumbbell overhead for shoulder and core power."},
    {"name": "Zercher Carry", "category": "Strongman", "desc": "Carry a load in the crook of your elbows to hammer the core and upper back."},

    # ---- Calisthenics ----
    {"name": "Muscle-Up", "category": "Calisthenics", "desc": "Explosive pull-up transitioning into a dip above the bar or rings."},
    {"name": "Pistol Squat", "category": "Calisthenics", "desc": "Single-leg squat to full depth for unilateral strength, balance, and mobility."},
    {"name": "Handstand Push-Up", "category": "Calisthenics", "desc": "Vertical press in a handstand for overhead strength and shoulder stability."},
    {"name": "Pike Push-Up", "category": "Calisthenics", "desc": "Elevated-hip push-up that biases the shoulders — a step toward handstand push-ups."},
    {"name": "Archer Push-Up", "category": "Calisthenics", "desc": "Push-up shifting weight to one arm for unilateral pressing strength."},
    {"name": "Pseudo Planche Push-Up", "category": "Calisthenics", "desc": "Leaned-forward push-up loading the shoulders toward the planche."},
    {"name": "Dip", "category": "Calisthenics", "desc": "Bodyweight parallel-bar dip for chest, triceps, and shoulders."},
    {"name": "L-Sit", "category": "Calisthenics", "desc": "Hold legs straight out while supported to build core and hip-flexor strength (log seconds)."},
    {"name": "Hollow Body Hold", "category": "Calisthenics", "desc": "Braced hollow position to build a rock-solid midline (log seconds)."},
    {"name": "Front Lever", "category": "Calisthenics", "desc": "Horizontal body hold under a bar for elite lat and core strength (log seconds)."},
    {"name": "Back Lever", "category": "Calisthenics", "desc": "Face-down straight-body hold under a bar for shoulder and core strength (log seconds)."},
    {"name": "Toes-to-Bar", "category": "Calisthenics", "desc": "Hang and bring the toes to the bar for explosive core and grip."},
    {"name": "Australian Pull-Up", "category": "Calisthenics", "desc": "Body-row under a low bar — a scalable horizontal pull for the back."},
    {"name": "Nordic Hamstring Curl", "category": "Calisthenics", "desc": "Anchored eccentric curl for powerful, injury-resistant hamstrings."},
    {"name": "Sissy Squat", "category": "Calisthenics", "desc": "Knees-forward bodyweight squat that torches the quads."},
    {"name": "Wall Handstand Hold", "category": "Calisthenics", "desc": "Hold an inverted handstand against a wall for shoulder stability (log seconds)."},

    # ---- CrossFit / Conditioning ----
    {"name": "Thruster", "category": "CrossFit", "desc": "Front squat into an overhead press in one fluid rep. A brutal full-body conditioner."},
    {"name": "Wall Ball", "category": "CrossFit", "desc": "Squat and throw a medicine ball to a target for legs, shoulders, and lungs."},
    {"name": "Burpee", "category": "CrossFit", "desc": "Drop, push-up, jump — a full-body conditioning staple (log reps)."},
    {"name": "Box Jump Over", "category": "CrossFit", "desc": "Jump onto and over a box for explosive, high-rep conditioning."},
    {"name": "Double-Under", "category": "CrossFit", "desc": "Jump rope passing the rope twice per jump for coordination and conditioning (log reps)."},
    {"name": "Toes-to-Bar (WOD)", "category": "CrossFit", "desc": "Kipping toes-to-bar for high-rep midline conditioning."},
    {"name": "Kettlebell Snatch", "category": "CrossFit", "desc": "One-motion kettlebell swing to overhead lockout for power and conditioning."},
    {"name": "Kettlebell Clean & Jerk", "category": "CrossFit", "desc": "Clean the bell to the rack and jerk it overhead for full-body power."},
    {"name": "Rowing (Erg)", "category": "CrossFit", "desc": "Full-body erg rowing for calories or meters — a conditioning workhorse."},
    {"name": "Assault Bike", "category": "CrossFit", "desc": "All-out air-bike intervals for lung-searing conditioning (log calories)."},
    {"name": "Devil's Press", "category": "CrossFit", "desc": "Dumbbell burpee into an overhead snatch — a savage full-body movement."},
    {"name": "Dumbbell Snatch", "category": "CrossFit", "desc": "Ground-to-overhead single-dumbbell snatch for power and conditioning."},
    {"name": "Overhead Squat", "category": "CrossFit", "desc": "Squat with the bar locked out overhead for mobility, midline, and control."},
    {"name": "Chest-to-Bar Pull-Up", "category": "CrossFit", "desc": "Pull-up bringing the chest to the bar for a bigger range and back strength."},
    {"name": "Handstand Walk", "category": "CrossFit", "desc": "Walk on your hands for shoulder stability and skill (log distance)."},
    {"name": "Rope Climb", "category": "CrossFit", "desc": "Climb a rope using legs and grip for pulling strength and skill."},
    # Chest (extra)
    {"name": "Weighted Dip", "category": "Chest", "desc": "Chest dip with added load for lower-chest and triceps mass. Lean forward to bias the pecs."},
    {"name": "Incline Cable Fly", "category": "Chest", "desc": "Low-to-high cable flye that targets the upper-chest fibers with constant tension."},
    {"name": "Svend Press", "category": "Chest", "desc": "Press two plates together in front of you for an inner-chest squeeze finisher."},
    {"name": "Smith Machine Bench Press", "category": "Chest", "desc": "Fixed-bar press for controlled, spotter-free heavy pressing volume."},
    # Back (extra)
    {"name": "Pendlay Row", "category": "Back", "desc": "Explosive barbell row from a dead stop on the floor for raw upper-back power."},
    {"name": "Chest-Supported Row", "category": "Back", "desc": "Row with your chest on an incline pad to remove momentum and isolate the back."},
    {"name": "Meadows Row", "category": "Back", "desc": "Landmine single-arm row that hammers the lats and upper back through a long arc."},
    {"name": "Straight-Arm Pulldown", "category": "Back", "desc": "Cable pullover-style movement that isolates the lats with locked elbows."},
    {"name": "Rack Pull", "category": "Back", "desc": "Partial deadlift from pins to overload the upper back, traps, and lockout."},
    # Legs (extra)
    {"name": "Hack Squat", "category": "Legs", "desc": "Machine squat with a fixed path to load the quads safely and heavily."},
    {"name": "Bulgarian Split Squat", "category": "Legs", "desc": "Rear-foot-elevated split squat for single-leg strength, size, and balance."},
    {"name": "Walking Lunge", "category": "Legs", "desc": "Alternating forward lunges for glutes, quads, and conditioning."},
    {"name": "Seated Leg Curl", "category": "Legs", "desc": "Machine hamstring curl in a seated position for a strong stretch and contraction."},
    {"name": "Nordic Ham Curl", "category": "Legs", "desc": "Bodyweight eccentric hamstring curl for elite posterior-chain strength."},
    {"name": "Sissy Squat", "category": "Legs", "desc": "Knee-dominant squat that deeply stretches and isolates the quads."},
    {"name": "Standing Calf Raise", "category": "Legs", "desc": "Loaded calf raise through a full range to build the gastrocnemius."},
    {"name": "Seated Calf Raise", "category": "Legs", "desc": "Bent-knee calf raise that emphasizes the soleus for lower-leg thickness."},
    # Shoulders (extra)
    {"name": "Arnold Press", "category": "Shoulders", "desc": "Rotating dumbbell press that hits all three delt heads through a big arc."},
    {"name": "Cable Lateral Raise", "category": "Shoulders", "desc": "Single-arm cable raise for constant tension on the side delts."},
    {"name": "Face Pull", "category": "Shoulders", "desc": "Rope pull to the face for rear delts and healthy shoulder external rotation."},
    {"name": "Reverse Pec Deck", "category": "Shoulders", "desc": "Machine rear-delt flye that isolates the back of the shoulders."},
    {"name": "Landmine Press", "category": "Shoulders", "desc": "Angled single-arm press that is joint-friendly and core-demanding."},
    # Arms (extra)
    {"name": "Preacher Curl", "category": "Arms", "desc": "Curl on a preacher bench to isolate the biceps and kill momentum."},
    {"name": "Incline Dumbbell Curl", "category": "Arms", "desc": "Curl on an incline for a deep biceps stretch and long-head emphasis."},
    {"name": "Hammer Curl", "category": "Arms", "desc": "Neutral-grip curl for the brachialis and forearm thickness."},
    {"name": "Concentration Curl", "category": "Arms", "desc": "Seated single-arm curl for a peak-focused biceps contraction."},
    {"name": "Overhead Triceps Extension", "category": "Arms", "desc": "Overhead extension that stretches and loads the triceps long head."},
    {"name": "Triceps Pushdown", "category": "Arms", "desc": "Cable pushdown for controlled triceps volume and a strong pump."},
    {"name": "Skull Crusher", "category": "Arms", "desc": "Lying triceps extension for mass across all three heads."},
    {"name": "Cable Rope Hammer Curl", "category": "Arms", "desc": "Rope curl keeping constant tension on biceps and forearms."},
    # Core (extra)
    {"name": "Hanging Leg Raise", "category": "Core", "desc": "Hang and raise your legs for lower-ab and hip-flexor strength."},
    {"name": "Cable Crunch", "category": "Core", "desc": "Kneeling weighted crunch for progressive-overload ab training."},
    {"name": "Ab Wheel Rollout", "category": "Core", "desc": "Roll out and back under control for brutal anti-extension core strength."},
    {"name": "Weighted Plank", "category": "Core", "desc": "Plank with a plate on your back for anti-extension endurance (log time)."},
    {"name": "Russian Twist", "category": "Core", "desc": "Seated rotational twist for the obliques (add a plate to load it)."},
    # Glutes (extra)
    {"name": "Hip Thrust", "category": "Legs", "desc": "Barbell hip thrust for maximal glute strength and hypertrophy."},
    {"name": "Cable Kickback", "category": "Legs", "desc": "Standing cable glute kickback for isolation and mind-muscle contraction."},
    # Olympic weightlifting
    {"name": "Snatch", "category": "Olympic", "desc": "Full lift from floor to overhead in one motion — the ultimate test of power, speed, and mobility."},
    {"name": "Power Snatch", "category": "Olympic", "desc": "Snatch caught above parallel to build explosive pulling speed."},
    {"name": "Hang Snatch", "category": "Olympic", "desc": "Snatch initiated from the hang to train the second pull and turnover."},
    {"name": "Clean and Jerk", "category": "Olympic", "desc": "Pull the bar to the shoulders, then drive it overhead — total-body power and strength."},
    {"name": "Power Clean", "category": "Olympic", "desc": "Explosive pull catching the bar above parallel to build speed-strength."},
    {"name": "Hang Clean", "category": "Olympic", "desc": "Clean from the hang position to sharpen the second pull and catch."},
    {"name": "Squat Clean", "category": "Olympic", "desc": "Full-depth clean received in a front squat for maximal loads."},
    {"name": "Push Jerk", "category": "Olympic", "desc": "Dip and drive the bar overhead, receiving with a slight knee bend."},
    {"name": "Split Jerk", "category": "Olympic", "desc": "Overhead jerk received in a split stance for stability under heavy loads."},
    {"name": "Clean Pull", "category": "Olympic", "desc": "Explosive pull without the catch to build clean strength and speed."},
    {"name": "Snatch Pull", "category": "Olympic", "desc": "Powerful pull to reinforce snatch bar path and extension."},
    {"name": "Overhead Squat", "category": "Olympic", "desc": "Squat with the bar locked overhead — mobility, stability, and core control."},
    {"name": "Snatch Balance", "category": "Olympic", "desc": "Drive under the bar into an overhead squat to train a fast, confident catch."},
    {"name": "Muscle Snatch", "category": "Olympic", "desc": "Snatch with no re-bend to strengthen the turnover and upper back."},
    # Stretches & mobility
    {"name": "Couch Stretch", "category": "Stretch", "desc": "Deep hip-flexor and quad stretch against a wall to open the front of the hips."},
    {"name": "Pigeon Pose", "category": "Stretch", "desc": "Glute and hip external-rotator stretch for squat and hinge mobility."},
    {"name": "World's Greatest Stretch", "category": "Stretch", "desc": "Dynamic lunge-with-rotation flow that opens hips, T-spine, and hamstrings."},
    {"name": "Hamstring Stretch", "category": "Stretch", "desc": "Seated or standing hamstring lengthening for deadlift and hinge range."},
    {"name": "Thoracic Extension (Foam Roll)", "category": "Stretch", "desc": "Extend over a foam roller to unlock upper-back mobility for pressing/squats."},
    {"name": "Cat-Cow", "category": "Stretch", "desc": "Segmental spinal flexion/extension to warm up the back and improve control."},
    {"name": "Shoulder Dislocates", "category": "Stretch", "desc": "Band or PVC pass-throughs to open the shoulders for overhead work."},
    {"name": "90/90 Hip Stretch", "category": "Stretch", "desc": "Seated internal/external hip rotation drill for deep squat mobility."},
    {"name": "Ankle Dorsiflexion Stretch", "category": "Stretch", "desc": "Knee-to-wall drill to improve ankle range for squats and lifts."},
    {"name": "Child's Pose", "category": "Stretch", "desc": "Gentle lat, spine, and hip decompression for cooldowns."},
    {"name": "Standing Quad Stretch", "category": "Stretch", "desc": "Pull the heel to the glute to lengthen the quads and hip flexors."},
    {"name": "Figure-4 Glute Stretch", "category": "Stretch", "desc": "Cross-ankle-over-knee stretch to release the glutes and piriformis."},
    # Plyometrics
    {"name": "Box Jump", "category": "Plyometric", "desc": "Explosive two-foot jump onto a box to build lower-body power."},
    {"name": "Depth Jump", "category": "Plyometric", "desc": "Step off a box and rebound instantly to train reactive strength."},
    {"name": "Broad Jump", "category": "Plyometric", "desc": "Maximal horizontal jump for explosive hip extension and power."},
    {"name": "Tuck Jump", "category": "Plyometric", "desc": "Jump and pull knees to chest for fast-twitch power and coordination."},
    {"name": "Jump Squat", "category": "Plyometric", "desc": "Squat and explode upward to develop rate of force development."},
    {"name": "Bounding", "category": "Plyometric", "desc": "Exaggerated running leaps to build single-leg power and stride."},
    {"name": "Lateral Bound", "category": "Plyometric", "desc": "Side-to-side skater jumps for lateral power and hip stability."},
    {"name": "Medicine Ball Slam", "category": "Plyometric", "desc": "Overhead slam for explosive core and full-body power output."},
    {"name": "Medicine Ball Chest Pass", "category": "Plyometric", "desc": "Explosive push-throw to develop upper-body power."},
    {"name": "Clap Push-Up", "category": "Plyometric", "desc": "Explosive push-up with a mid-air clap for upper-body reactive power."},
    {"name": "Pogo Hops", "category": "Plyometric", "desc": "Quick stiff-ankle hops to build tendon stiffness and reactivity."},
    {"name": "Single-Leg Box Hop", "category": "Plyometric", "desc": "One-legged hops onto a box for unilateral power and control."},
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
    desc: Optional[str] = ""




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





# ---------- Personal goal quests (AI-curated, real-life) ----------
def _fallback_personal_quests(goals: str) -> List[dict]:
    return [
        {"title": "Commit It To Paper", "description": f"Write down your goal ({goals[:60]}) and pin it where you train. Visible goals get chased.", "xp": 100, "timeframe": "This week"},
        {"title": "Baseline Check", "description": "Record your current stats — bodyweight, main lifts, or mile time. You can't improve what you don't measure.", "xp": 150, "timeframe": "This week"},
        {"title": "Meal Prep Mission", "description": "Prep 3 days of meals aligned with your goal. Nutrition is half the battle.", "xp": 200, "timeframe": "This week"},
        {"title": "Accountability Post", "description": "Share your goal in the Circle chat. Public goals are 2x more likely to get done.", "xp": 150, "timeframe": "Anytime"},
        {"title": "Four-Week Checkpoint", "description": "Re-test your baseline after 4 weeks of consistent work and log the difference.", "xp": 400, "timeframe": "This month"},
    ]







class FavouriteIn(BaseModel):
    name: str
    on: bool = True







# ---- AI health tracking (so the app can show a clear "AI unavailable" banner) ----
def _aware_dt(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def mark_ai_outage(reason: str = "") -> None:
    """Record that an AI (LLM) call just failed — used to surface an outage banner."""
    await db.app_state.update_one(
        {"key": "ai_health"},
        {"$set": {"last_fail_at": datetime.now(timezone.utc), "reason": str(reason)[:200]}},
        upsert=True,
    )


async def mark_ai_ok() -> None:
    """Record a successful AI call — clears the outage banner."""
    await db.app_state.update_one(
        {"key": "ai_health"},
        {"$set": {"last_ok_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def ai_is_degraded() -> bool:
    """True if the last AI call failed within 15 min and no success has happened since."""
    doc = await db.app_state.find_one({"key": "ai_health"}) or {}
    lf = _aware_dt(doc.get("last_fail_at"))
    lo = _aware_dt(doc.get("last_ok_at"))
    if not lf:
        return False
    if (datetime.now(timezone.utc) - lf) > timedelta(minutes=15):
        return False
    return lo is None or lf > lo



# ---- AI usage cap (per-user, per-day) to prevent LLM cost abuse ----
# Daily quota per AI feature. Admins bypass. Keyed by user_id so it works across
# devices/sessions. Backed by the same MongoDB fixed-window limiter as auth.
AI_DAILY_CAPS = {
    "coach_chat": 80,
    "coach_tts": 80,
    "voice_transcribe": 80,
    "judge_submit": 25,
    "critique_submit": 25,
}


async def ai_daily_cap(user: dict, feature: str) -> None:
    """Raise 429 once the caller exceeds their daily quota for an AI feature.

    Admins are exempt. Falls back to a permissive default limit for unknown
    features. Never blocks on limiter DB hiccups turning into 503 — we let
    consume_bucket surface 429/503 exactly like the auth throttle does.
    """
    if user.get("is_admin"):
        return
    limit = AI_DAILY_CAPS.get(feature, 100)
    from auth_throttle import consume_bucket  # lazy import to avoid circular import
    await consume_bucket(
        kind=f"ai:{feature}",
        raw_key=user["user_id"],
        limit=limit,
        window=timedelta(days=1),
    )




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
        # Admin override: force a quest complete/incomplete for this user
        ov = await db.quest_overrides.find_one({"user_id": user["user_id"], "quest_key": quest_key})
        if ov:
            if ov.get("forced") == "complete":
                complete = True
            elif ov.get("forced") == "incomplete":
                complete = False
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




# ---------- The Journey (RPG map mini-game) ----------
_JOURNEY_ZONES = {
    "E": {"name": "THE WASTES", "index": 0, "primary": "#3A4250", "accent": "#8792A6"},
    "D": {"name": "IRON VALLEY", "index": 1, "primary": "#234E7A", "accent": "#4299E1"},
    "C": {"name": "STORM RIDGE", "index": 2, "primary": "#1E6C8C", "accent": "#00E5FF"},
    "B": {"name": "EMBER PEAKS", "index": 3, "primary": "#A2521B", "accent": "#F6A040"},
    "A": {"name": "CRIMSON CITADEL", "index": 4, "primary": "#8E1B24", "accent": "#FF4D5E"},
    "S": {"name": "ASCENSION", "index": 5, "primary": "#5B2E9B", "accent": "#C08BFF"},
}


def _zone_for_tier(t: str):
    return {"tier": t, **_JOURNEY_ZONES.get(t, _JOURNEY_ZONES["E"])}






class NutritionIn(BaseModel):
    calories: float = 0
    protein: float = 0
    carbs: float = 0
    fats: float = 0






class SupplementIn(BaseModel):
    name: str
    on: bool = True






class ChallengeIn(BaseModel):
    to_user_id: str








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



# ---------- Cosmetics: emblems, auras, titles (equippable overlays) ----------
# Each item unlocks at a level (and/or via coach grant). level=999 => coach-grant only.
COSMETICS = {
    "emblem": [
        {"id": "em_none", "name": "None", "icon": "", "level": 1},
        {"id": "em_flame", "name": "Flame", "icon": "🔥", "level": 3},
        {"id": "em_bolt", "name": "Bolt", "icon": "⚡", "level": 6},
        {"id": "em_skull", "name": "Skull", "icon": "💀", "level": 10},
        {"id": "em_dragon", "name": "Dragon", "icon": "🐉", "level": 15},
        {"id": "em_crown", "name": "Crown", "icon": "👑", "level": 20},
        {"id": "em_star", "name": "Founder Star", "icon": "⭐", "level": 999},
    ],
    "aura": [
        {"id": "au_none", "name": "None", "color": "", "level": 1},
        {"id": "au_blue", "name": "Ion Blue", "color": "#00E5FF", "level": 2},
        {"id": "au_green", "name": "Toxic", "color": "#00E5B4", "level": 8},
        {"id": "au_gold", "name": "Champion Gold", "color": "#FFD700", "level": 12},
        {"id": "au_violet", "name": "Void", "color": "#B14CFF", "level": 18},
        {"id": "au_red", "name": "Freak Red", "color": "#FF3B5C", "level": 999},
    ],
    "title": [
        {"id": "ti_none", "name": "None", "text": "", "level": 1},
        {"id": "ti_iron", "name": "Iron Will", "text": "IRON WILL", "level": 4},
        {"id": "ti_beast", "name": "Beast", "text": "BEAST MODE", "level": 9},
        {"id": "ti_quest", "name": "Quest Master", "text": "QUEST MASTER", "level": 11},
        {"id": "ti_slayer", "name": "Boss Slayer", "text": "BOSS SLAYER", "level": 14},
        {"id": "ti_boss", "name": "Boss Killer", "text": "BOSS KILLER", "level": 22},
        {"id": "ti_legend", "name": "Legend", "text": "LIVING LEGEND", "level": 25},
        {"id": "ti_enhanced", "name": "Enhanced", "text": "ENHANCED", "level": 999},
        {"id": "ti_founder", "name": "Founder", "text": "FOUNDER", "level": 999},
        {"id": "ti_theone", "name": "The One", "text": "THE ONE", "level": 999},
    ],
}
_COSMETIC_BY_ID = {it["id"]: (slot, it) for slot, items in COSMETICS.items() for it in items}

def _cosmetic_owned(user, item) -> bool:
    if item["id"].endswith("_none"):
        return True
    if item["id"] == "ti_enhanced" and user.get("enhanced"):
        return True
    if item.get("level", 999) <= int(user.get("level", 1)):
        return True
    return item["id"] in (user.get("granted_items") or [])

def _clean_loadout(user):
    lo = user.get("loadout") or {}
    return {"emblem": lo.get("emblem") or "em_none", "aura": lo.get("aura") or "au_none", "title": lo.get("title") or "ti_none"}


class LoadoutIn(BaseModel):
    emblem: Optional[str] = None
    aura: Optional[str] = None
    title: Optional[str] = None
    use_photo: Optional[bool] = None



class GrantItemIn(BaseModel):
    user_id: str
    item_id: str


# ---------- The Enhanced (age-gated PED discussion room) ----------
PED_LIBRARY = [
    {"name": "Testosterone", "class": "Anabolic steroid", "desc": "The base of most cycles; androgen used to raise training volume and recovery. Commonly run as a base with other compounds."},
    {"name": "Trenbolone", "class": "Anabolic steroid", "desc": "Potent 19-nor known for strength and conditioning effects. Frequently discussed for aggressive body recomposition."},
    {"name": "Nandrolone (Deca)", "class": "Anabolic steroid", "desc": "Long-ester 19-nor often discussed for joint comfort and mass during bulking phases."},
    {"name": "Boldenone (EQ)", "class": "Anabolic steroid", "desc": "Slow-acting compound often used for lean mass and appetite/endurance over long blocks."},
    {"name": "Oxandrolone (Anavar)", "class": "Oral steroid", "desc": "Mild oral often discussed for strength and dryness with lower water retention."},
    {"name": "Methandrostenolone (Dbol)", "class": "Oral steroid", "desc": "Fast-acting oral discussed for rapid size/strength kick-starts."},
    {"name": "Stanozolol (Winstrol)", "class": "Oral/injectable steroid", "desc": "Discussed for a hard, dry look in the lead-up to peak conditioning."},
    {"name": "Human Growth Hormone (HGH)", "class": "Peptide hormone", "desc": "Discussed for recovery, body composition and connective-tissue support over long durations."},
    {"name": "IGF-1 LR3", "class": "Peptide", "desc": "Insulin-like growth factor analog discussed around localized growth and recovery."},
    {"name": "BPC-157", "class": "Peptide", "desc": "Research peptide widely discussed for soft-tissue and tendon recovery."},
    {"name": "TB-500", "class": "Peptide", "desc": "Research peptide discussed alongside BPC-157 for recovery and mobility."},
    {"name": "Ipamorelin", "class": "Peptide (GH secretagogue)", "desc": "GH-releasing peptide discussed for sleep, recovery and gradual GH support."},
    {"name": "CJC-1295", "class": "Peptide (GHRH)", "desc": "Often paired with Ipamorelin in discussions of GH pulse support."},
    {"name": "Clenbuterol", "class": "Beta-2 agonist", "desc": "Non-steroid stimulant discussed for fat loss and its cardiovascular considerations."},
    {"name": "Semaglutide", "class": "GLP-1 peptide", "desc": "GLP-1 agonist discussed for appetite regulation and body-fat management."},
    {"name": "Drostanolone (Masteron)", "class": "Anabolic steroid", "desc": "DHT-derived compound discussed for a hard, dry look and anti-estrogenic feel near contest."},
    {"name": "Methenolone (Primobolan)", "class": "Anabolic steroid", "desc": "Mild long-ester compound discussed for lean, low-side-effect gains over longer blocks."},
    {"name": "Oxymetholone (Anadrol)", "class": "Oral steroid", "desc": "Strong oral discussed for rapid size and strength; noted for high water/appetite effects."},
    {"name": "Chlorodehydromethyltestosterone (Turinabol)", "class": "Oral steroid", "desc": "Oral discussed for steady lean strength with minimal water retention."},
    {"name": "Fluoxymesterone (Halotestin)", "class": "Oral steroid", "desc": "Very potent oral discussed for peak strength and aggression in short pre-meet windows."},
    {"name": "Methasterone (Superdrol)", "class": "Oral steroid", "desc": "Harsh oral discussed for fast dry mass; noted for significant liver/lipid considerations."},
    {"name": "Mesterolone (Proviron)", "class": "Oral steroid", "desc": "Mild DHT-derived oral discussed for a drier look and libido/androgen support alongside a cycle."},
    {"name": "Trestolone (MENT)", "class": "Anabolic steroid", "desc": "Highly androgenic 19-nor discussed for aggressive mass; noted for strong suppression."},
    {"name": "1-Testosterone (DHB)", "class": "Anabolic steroid", "desc": "Dihydroboldenone discussed for dense lean mass and strength; noted for injection-site soreness."},
    {"name": "Human Chorionic Gonadotropin (HCG)", "class": "Peptide hormone", "desc": "Discussed for testicular function/fertility support during and after suppressive cycles."},
    {"name": "MK-677 (Ibutamoren)", "class": "GH secretagogue", "desc": "Oral GH secretagogue discussed for appetite, sleep and gradual GH/IGF-1 support."},
    {"name": "GHRP-6", "class": "Peptide (GH secretagogue)", "desc": "GH-releasing peptide discussed for GH pulses and strong appetite stimulation."},
    {"name": "GHRP-2", "class": "Peptide (GH secretagogue)", "desc": "GH-releasing peptide discussed for GH support with less hunger than GHRP-6."},
    {"name": "Hexarelin", "class": "Peptide (GH secretagogue)", "desc": "Potent GH-releasing peptide discussed for short, strong GH pulses."},
    {"name": "Tesamorelin", "class": "Peptide (GHRH)", "desc": "GHRH analog discussed for visceral-fat reduction and GH support."},
    {"name": "Sermorelin", "class": "Peptide (GHRH)", "desc": "GHRH analog discussed for gentle, sleep-timed GH release."},
    {"name": "Tirzepatide", "class": "GLP-1/GIP peptide", "desc": "Dual GLP-1/GIP agonist discussed for appetite control and body-fat management."},
    {"name": "AOD-9604", "class": "Peptide", "desc": "GH-fragment peptide discussed around fat metabolism without broad GH effects."},
    {"name": "Follistatin-344", "class": "Peptide", "desc": "Myostatin-related peptide discussed for muscle-growth potential in research settings."},
    {"name": "Thymosin Alpha-1", "class": "Peptide", "desc": "Immune-modulating peptide discussed for recovery and immune support."},
    {"name": "GHK-Cu", "class": "Copper peptide", "desc": "Copper peptide discussed for skin, connective-tissue and recovery support."},
    {"name": "PT-141 (Bremelanotide)", "class": "Peptide", "desc": "Melanocortin peptide discussed for libido support."},
    {"name": "Melanotan II", "class": "Peptide", "desc": "Melanocortin peptide discussed for tanning and appetite/libido effects."},
    {"name": "DSIP", "class": "Peptide", "desc": "Delta sleep-inducing peptide discussed for sleep quality and recovery."},
    {"name": "Testosterone Propionate", "class": "Anabolic steroid", "desc": "Short-ester testosterone discussed for faster onset and quicker clearance than longer esters."},
    {"name": "Testosterone Cypionate", "class": "Anabolic steroid", "desc": "Long-ester testosterone commonly used as a stable weekly base."},
    {"name": "Testosterone Enanthate", "class": "Anabolic steroid", "desc": "Long-ester testosterone base widely discussed for steady blood levels."},
    {"name": "Sustanon 250", "class": "Anabolic steroid", "desc": "Blend of testosterone esters discussed as a mixed-release base compound."},
    {"name": "Trenbolone Acetate", "class": "Anabolic steroid", "desc": "Short-ester tren discussed for fast onset and tight control of levels."},
    {"name": "Trenbolone Enanthate", "class": "Anabolic steroid", "desc": "Long-ester tren discussed for less frequent dosing over a block."},
    {"name": "Methyltestosterone", "class": "Oral steroid", "desc": "Oral androgen discussed historically; noted for strong hepatic considerations."},
    {"name": "Fluoxymesterone (Halotestin)", "class": "Oral steroid", "desc": "Potent oral discussed for strength and aggression near meets/contests."},
    {"name": "Mesterolone (Proviron)", "class": "Oral steroid", "desc": "DHT-derived oral discussed for a hardening feel and free-hormone effects."},
    {"name": "Mibolerone (Cheque Drops)", "class": "Oral steroid", "desc": "Very potent oral discussed only for short pre-competition aggression windows."},
    {"name": "Trestolone (MENT)", "class": "Anabolic steroid", "desc": "Potent 19-nor discussed for rapid mass with strong androgenic/estrogenic activity."},
    {"name": "1-Testosterone (DHB)", "class": "Anabolic steroid", "desc": "Dihydroboldenone discussed for lean strength; noted for injection-site considerations."},
    {"name": "Anastrozole (Arimidex)", "class": "Aromatase inhibitor", "desc": "AI discussed for managing estrogen conversion on aromatizing cycles."},
    {"name": "Exemestane (Aromasin)", "class": "Aromatase inhibitor", "desc": "Suicidal AI discussed for estrogen control with a different profile than Arimidex."},
    {"name": "Letrozole (Femara)", "class": "Aromatase inhibitor", "desc": "Strong AI discussed for aggressive estrogen control."},
    {"name": "Tamoxifen (Nolvadex)", "class": "SERM", "desc": "SERM widely discussed for post-cycle protocols and gyno management."},
    {"name": "Clomiphene (Clomid)", "class": "SERM", "desc": "SERM discussed for restarting natural testosterone production post-cycle."},
    {"name": "Enclomiphene", "class": "SERM", "desc": "Clomid isomer discussed for raising testosterone with fewer estrogenic side effects."},
    {"name": "HCG", "class": "Peptide hormone", "desc": "Human chorionic gonadotropin discussed for testicular function during/after cycles."},
    {"name": "Cabergoline", "class": "Dopamine agonist", "desc": "Discussed for managing prolactin with 19-nor compounds."},
    {"name": "Aromatase / Cortisol note — Finasteride", "class": "5-AR inhibitor", "desc": "Discussed for DHT-related hair concerns; not effective against non-DHT compounds."},
    {"name": "MK-677 (Ibutamoren)", "class": "GH secretagogue (oral)", "desc": "Oral GH secretagogue discussed for appetite, sleep, and recovery."},
    {"name": "Tesamorelin", "class": "Peptide (GHRH)", "desc": "GHRH analog discussed for visceral-fat reduction and GH support."},
    {"name": "Sermorelin", "class": "Peptide (GHRH)", "desc": "GHRH peptide discussed for gradual, pulsatile GH support."},
    {"name": "Hexarelin", "class": "Peptide (GH secretagogue)", "desc": "Potent GH-releasing peptide discussed for strong GH pulses."},
    {"name": "GHRP-2", "class": "Peptide (GH secretagogue)", "desc": "GH-releasing peptide discussed for appetite and GH support."},
    {"name": "GHRP-6", "class": "Peptide (GH secretagogue)", "desc": "GH-releasing peptide discussed for strong hunger and GH pulses."},
    {"name": "Follistatin 344", "class": "Peptide", "desc": "Research peptide discussed around myostatin inhibition and muscle growth."},
    {"name": "AOD-9604", "class": "Peptide", "desc": "Modified GH fragment discussed for fat-loss support without strong GH effects."},
    {"name": "HGH Fragment 176-191", "class": "Peptide", "desc": "GH fragment discussed for targeted fat-loss support."},
    {"name": "Thymosin Alpha-1", "class": "Peptide", "desc": "Immune-modulating peptide discussed for recovery and immune support."},
    {"name": "Epithalon", "class": "Peptide", "desc": "Research peptide discussed around sleep, longevity, and recovery."},
    {"name": "Tirzepatide", "class": "GLP-1/GIP peptide", "desc": "Dual GLP-1/GIP agonist discussed for appetite regulation and body-fat management."},
    {"name": "Retatrutide", "class": "GLP-1/GIP/glucagon peptide", "desc": "Triple-agonist discussed for appetite control and fat loss."},
    {"name": "Cardarine (GW-501516)", "class": "PPAR agonist (research)", "desc": "Research compound discussed for endurance and fat oxidation."},
    {"name": "Stenabolic (SR-9009)", "class": "Rev-ErbA agonist (research)", "desc": "Research compound discussed for endurance and metabolic effects."},
    {"name": "Ostarine (MK-2866)", "class": "SARM (research)", "desc": "Research SARM discussed for lean mass and recovery."},
    {"name": "Ligandrol (LGD-4033)", "class": "SARM (research)", "desc": "Research SARM discussed for strength and mass gains."},
    {"name": "RAD-140 (Testolone)", "class": "SARM (research)", "desc": "Research SARM discussed for strength and lean mass."},
    {"name": "YK-11", "class": "SARM/myostatin (research)", "desc": "Research compound discussed around myostatin inhibition and muscle growth."},
    {"name": "S4 (Andarine)", "class": "SARM (research)", "desc": "Research SARM discussed for hardening and strength; noted for vision side effects."},
    {"name": "T3 (Liothyronine)", "class": "Thyroid hormone", "desc": "Thyroid hormone discussed for metabolic rate and fat loss; requires careful management."},
    {"name": "T4 (Levothyroxine)", "class": "Thyroid hormone", "desc": "Thyroid hormone discussed for metabolic support; converts to T3."},
    {"name": "Yohimbine", "class": "Alpha-2 antagonist", "desc": "Non-steroid stimulant discussed for stubborn fat loss; noted for anxiety/BP effects."},
    {"name": "Albuterol", "class": "Beta-2 agonist", "desc": "Bronchodilator discussed as a milder alternative to clenbuterol for fat loss."},
    {"name": "DNP", "class": "Metabolic uncoupler (dangerous)", "desc": "Extremely dangerous fat-loss compound — widely discussed with severe safety warnings."},
]
PED_DISCLAIMER = "This is not medical advice. The Enhanced is a discussion space only. Nothing here recommends, prescribes or endorses using any substance. Consult a licensed physician."

class AgeIn(BaseModel):
    dob: str  # ISO yyyy-mm-dd

def _age_from_dob(dob: str) -> int:
    try:
        y, m, d = [int(x) for x in dob.split("-")]
        today = datetime.now(timezone.utc).date()
        from datetime import date
        b = date(y, m, d)
        return today.year - b.year - ((today.month, today.day) < (b.month, b.day))
    except Exception:
        return -1



class ConsentIn(BaseModel):
    accept: bool



class RegimenItem(BaseModel):
    name: str
    dosage: str
    schedule: str
    notes: str = ""

class RegimenIn(BaseModel):
    items: list[RegimenItem]



class RegimenNoteIn(BaseModel):
    index: int
    notes: str


_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

def _dose_due_today(schedule: str) -> bool:
    s = (schedule or "").lower()
    if not s:
        return False
    if any(w in s for w in ["daily", "every day", "everyday", "each day", " ed", "ed ", "am/pm", "morning", "evening", "night"]):
        return True
    today = _WEEKDAYS[datetime.now(timezone.utc).weekday()]
    return today in s


# ---------- Set Presets (favourite rep/weight combos) ----------
class PresetIn(BaseModel):
    reps: int
    weight_lb: float
    rpe: float = 7
    label: str = ""

















# ---------- Chat media (Emergent Object Storage) ----------
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-matroska"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024   # 15 MB
MAX_VIDEO_BYTES = 80 * 1024 * 1024   # 80 MB (~1 min of phone video)
_EXT_MAP = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
            "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov",
            "video/webm": "webm", "video/3gpp": "3gp", "video/x-matroska": "mkv",
            "application/pdf": "pdf", "application/msword": "doc",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
            "text/plain": "txt", "application/vnd.ms-excel": "xls",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
            "text/csv": "csv"}

# Documents allowed in the In-Person Clients room (in addition to images)
ALLOWED_DOC_TYPES = {
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain", "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv",
}
MAX_DOC_BYTES = 25 * 1024 * 1024   # 25 MB







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

def _new_order_number() -> str:
    return "HIC-" + secrets.token_hex(4).upper()

async def has_verified_purchase(user_id: str, entitlement: str) -> bool:
    row = await db.verified_purchases.find_one(
        {"user_id": user_id, "entitlement": entitlement, "revoked": {"$ne": True}}
    )
    return bool(row)

# Human-readable product metadata for receipts / order history
PURCHASE_PRODUCTS = {
    CUSTOM_PROGRAM_ENTITLEMENT: ("1-on-1 Custom Program", "$200.00"),
    BACKER_ENTITLEMENT: ("Founder Backer", "$25.00"),
}

def _receipt_resend_email(user: dict, ent: str, vp: dict):
    """A formatted receipt email (includes order number + amount) for the resend action."""
    name = escape((user.get("display_name") or "Athlete").strip())
    product, amount = PURCHASE_PRODUCTS.get(ent, (ent, ""))
    order = escape(str(vp.get("order_number") or "—"))
    when = vp.get("verified_at")
    date_str = when.strftime("%b %d, %Y") if isinstance(when, datetime) else "—"
    subject = f"Your Hutch's Inner Circle receipt — {order}"
    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0e;">
      <h2 style="letter-spacing:1px;">HUTCH'S INNER CIRCLE</h2>
      <p>Hey {name}, here's your receipt.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <tr><td style="padding:6px 0;color:#666;">Order #</td><td style="padding:6px 0;text-align:right;font-weight:bold;">{order}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Item</td><td style="padding:6px 0;text-align:right;">{escape(product)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Date</td><td style="padding:6px 0;text-align:right;">{date_str}</td></tr>
        <tr><td style="padding:10px 0;border-top:1px solid #ddd;color:#666;">Total</td><td style="padding:10px 0;border-top:1px solid #ddd;text-align:right;font-weight:bold;">{escape(amount)}</td></tr>
      </table>
      <p style="color:#666;font-size:13px;margin-top:12px;">One-time payment. Keep this order number for your records.</p>
      <p>— Coach Hutch</p>
    </div>"""
    return subject, html



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








class DownloadedIn(BaseModel):
    media_id: str


def _is_owner(user) -> bool:
    return (user.get("email", "").lower() in [e.lower() for e in OWNER_EMAILS]) or bool(user.get("all_rooms_access"))


# Full admin grant for the creator account(s). enhanced_access unlocks The Enhanced
# room/tracker WITHOUT the red theme (that only flips on the `enhanced` flag).
OWNER_ADMIN_SET = {
    "all_rooms_access": True,
    "skool_verified": True,
    "athletes_center_access": True,
    "enhanced_access": True,
    "is_admin": True,
}


async def ensure_owner_admin(user):
    """Idempotently grant the creator account every access flag (no red theme)."""
    if not user:
        return user
    if user.get("email", "").lower() not in [e.lower() for e in OWNER_EMAILS]:
        return user
    missing = {k: v for k, v in OWNER_ADMIN_SET.items() if user.get(k) != v}
    if missing:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": missing})
        user.update(missing)
    return user




# ---------- Founders (first 100 members + development backers) ----------
FOUNDER_LIMIT = 100
BASELINE_REWARD_XP = 150  # one-time bonus for logging real baseline lifts at signup
RACE_WINNER_XP = 200      # awarded to the winner when a rival race is won (overtake)
RACE_NUDGE_STEP = 20      # min XP the gap must shrink to trigger a "rival closing" nudge
SHIELD_STREAK = 3         # nudges survived while still leading to earn a lead-defender shield
SHIELD_XP = 120           # awarded once per race for defending a lead through SHIELD_STREAK nudges


def shield_tier_for(count: int):
    """Lead-defender tier from lifetime shields earned. None below 1."""
    c = int(count or 0)
    if c >= 6:
        return "gold"
    if c >= 3:
        return "silver"
    if c >= 1:
        return "bronze"
    return None
# Keep obvious test/QA accounts (…@test.com, …@example.com) out of the public
# Founders list and its counts, without deleting them (some are used for QA login).
NOT_TEST_EMAIL = {"email": {"$not": {"$regex": r"@(?:test|example|qa)\.com$", "$options": "i"}}}





class ReceiptResendIn(BaseModel):
    entitlement: str






class RemindIn(BaseModel):
    user_id: str



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







# ---------- Save Plan (store a coach-generated plan, show in Train) ----------
class CoachPlanIn(BaseModel):
    title: Optional[str] = None
    text: str





# ---------- Voice Ask (Whisper STT) ----------
_STT = None


# ---------- Seed ----------
# Owner accounts get full access to every chatroom regardless of rank/subscription
OWNER_EMAILS = ["the9hutch@gmail.com"]

# Curated badges the admin can hand out from the admin panel.
ADMIN_BADGE_OPTIONS = [
    "recruiter", "pr_hunter", "consistency_week1", "og_member", "verified_athlete",
    "coach_pick", "community_mvp", "beast_mode", "iron_will", "comeback_kid",
]

async def seed():
    # Ensure the creator/admin account exists with full access (persists across restarts).
    # It can sign in with Google OR email/password. A password is seeded ONLY from the
    # OWNER_DEFAULT_PASSWORD env secret (never a source default) and only when missing.
    OWNER_DEFAULT_PASSWORD = os.environ.get("OWNER_DEFAULT_PASSWORD", "").strip()
    for oemail in OWNER_EMAILS:
        existing = await db.users.find_one({"email": oemail})
        if existing:
            upd = dict(OWNER_ADMIN_SET)
            if not existing.get("password_hash") and OWNER_DEFAULT_PASSWORD:
                upd["password_hash"] = hash_password(OWNER_DEFAULT_PASSWORD)
            await db.users.update_one({"email": oemail}, {"$set": upd})
        else:
            doc = default_user_doc(oemail, "The Hutch")
            doc.update(OWNER_ADMIN_SET)
            if OWNER_DEFAULT_PASSWORD:
                doc["password_hash"] = hash_password(OWNER_DEFAULT_PASSWORD)
            await db.users.insert_one(doc)
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.chat_messages.create_index([("room", 1), ("created_at", -1)])
    await db.chat_messages.create_index("media_id", sparse=True)
    await db.inperson_messages.create_index("media_id", sparse=True)
    await db.chat_media.create_index("media_id", unique=True)
    await db.gym_places_cache.create_index("expires_at", expireAfterSeconds=0)
    await db.verification_codes.create_index([("user_id", 1), ("channel", 1)], unique=True)
    await db.verified_purchases.create_index([("user_id", 1), ("entitlement", 1)], unique=True)
    await db.rc_webhook_events.create_index("event_id", unique=True)
    await db.set_presets.create_index("user_id")
    await db.exercise_demos.create_index("name", unique=True)

    # Warm up object storage (non-fatal if it fails at boot)
    try:
        await init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init failed at startup (will retry lazily): {e}")

    # No demo/test/bot accounts are seeded. NOTE: we intentionally do NOT delete any
    # data on startup — startup must be non-destructive. Legacy AI bots (if any exist
    # in an environment) are removed via the admin panel's manual "purge" tools, never
    # automatically here.


    # (Welcome chat messages seed removed — Social Hub starts empty per owner request.)
    # ---- House store cosmetics: paid badges + titles for the current month ----
    _house_month = datetime.now(timezone.utc).strftime("%Y-%m")
    HOUSE_STORE = [
        # badges
        {"item_id": "st_badge_flame", "kind": "badge", "name": "Inferno Crest", "rarity": "epic", "icon": "🔥", "colors": ["#FF6A00", "#FF0033"], "glow": "#FF6A00", "motion": "flame", "description": "A blazing emblem for those who never cool off."},
        {"item_id": "st_badge_bolt", "kind": "badge", "name": "Storm Sigil", "rarity": "rare", "icon": "⚡", "colors": ["#00E5FF", "#4C6FFF"], "glow": "#00E5FF", "motion": "pulse", "description": "Crackling with raw power."},
        {"item_id": "st_badge_skull", "kind": "badge", "name": "Reaper Mark", "rarity": "legendary", "icon": "💀", "colors": ["#B14CFF", "#3A0A5A"], "glow": "#B14CFF", "motion": "shimmer", "description": "Worn by those who bury their limits."},
        {"item_id": "st_badge_crown", "kind": "badge", "name": "Iron Crown", "rarity": "mythic", "icon": "👑", "colors": ["#FFD24A", "#C9971A"], "glow": "#FFD24A", "motion": "orbit", "description": "Reserved for royalty of the iron."},
        {"item_id": "st_badge_dragon", "kind": "badge", "name": "Dragon Seal", "rarity": "mythic", "icon": "🐉", "colors": ["#12B886", "#0A5C3E"], "glow": "#12B886", "motion": "shimmer", "description": "Ancient power bound in a crest."},
        {"item_id": "st_badge_star", "kind": "badge", "name": "Nova Star", "rarity": "epic", "icon": "🌟", "colors": ["#FFE14A", "#FF9A00"], "glow": "#FFE14A", "motion": "pulse", "description": "Shine brighter than the rest."},
        # titles
        {"item_id": "st_title_apex", "kind": "title", "name": "APEX PREDATOR", "rarity": "legendary", "icon": "❰❱", "colors": ["#FF3B5C", "#7A0A1A"], "glow": "#FF3B5C", "motion": "pulse", "description": "A title that ends arguments."},
        {"item_id": "st_title_titan", "kind": "title", "name": "TITAN", "rarity": "epic", "icon": "❰❱", "colors": ["#4C6FFF", "#0A1C6A"], "glow": "#4C6FFF", "motion": "shimmer", "description": "Built different."},
        {"item_id": "st_title_unbroken", "kind": "title", "name": "UNBROKEN", "rarity": "rare", "icon": "❰❱", "colors": ["#00E5FF", "#0A4C5A"], "glow": "#00E5FF", "motion": "pulse", "description": "Never missed a session."},
        {"item_id": "st_title_immortal", "kind": "title", "name": "IMMORTAL", "rarity": "mythic", "icon": "❰❱", "colors": ["#B14CFF", "#2A0A4A"], "glow": "#B14CFF", "motion": "orbit", "description": "Legends never die."},
        {"item_id": "st_title_warlord", "kind": "title", "name": "WARLORD", "rarity": "legendary", "icon": "❰❱", "colors": ["#FF6A00", "#5A2A00"], "glow": "#FF6A00", "motion": "flame", "description": "Command the iron battlefield."},
        {"item_id": "st_title_ascended", "kind": "title", "name": "ASCENDED", "rarity": "mythic", "icon": "❰❱", "colors": ["#FFD24A", "#B14CFF"], "glow": "#FFD24A", "motion": "shimmer", "description": "Beyond mortal strength."},
    ]
    for it in HOUSE_STORE:
        doc = dict(it, active=True, drop_month=_house_month)
        await db.store_items.update_one(
            {"item_id": it["item_id"]},
            {"$set": doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    logger.info("Seeded DB")


# ---------- Curated gym directory ----------
async def ensure_gym(name: str):
    """Persist a gym name to the shared directory (case-insensitive dedupe)."""
    name = (name or "").strip()[:60]
    if not name:
        return
    await db.gyms.update_one(
        {"name_lower": name.lower()},
        {"$setOnInsert": {"id": new_id("gym"), "name": name, "name_lower": name.lower(),
                          "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def list_gym_names() -> list:
    """Curated gym list; backfills once from existing members' gyms."""
    rows = await db.gyms.find({}, {"_id": 0, "name": 1}).sort("name", 1).to_list(1000)
    if not rows:
        for n in await db.users.distinct("inperson_gym"):
            await ensure_gym(n)
        rows = await db.gyms.find({}, {"_id": 0, "name": 1}).sort("name", 1).to_list(1000)
    return [r["name"] for r in rows]


async def gym_meta(name: str) -> dict:
    """Logo + verified status for a gym by (case-insensitive) name."""
    name = (name or "").strip()
    if not name:
        return {"logo_media_id": None, "verified": False}
    g = await db.gyms.find_one({"name_lower": name.lower()}, {"_id": 0, "logo_media_id": 1, "verified": 1})
    if not g:
        return {"logo_media_id": None, "verified": False}
    return {"logo_media_id": g.get("logo_media_id"), "verified": bool(g.get("verified"))}


# ---------- Emergent Managed Push Notifications ----------
PUSH_BASE_URL = "https://integrations.emergentagent.com"  # constant, never from env
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


async def send_push(recipients: list, data: dict, idempotency_key: Optional[str] = None) -> None:
    """Relay a push to specific user_ids via the Emergent managed push service.
    Never blocks the caller — wrap calls in try/except."""
    recipients = [r for r in (recipients or []) if r]
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients[:100], "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    resp.raise_for_status()


# ---------- In-Person booking reminders (24h + 1h before appointment) ----------
async def _send_booking_reminder(bk: dict, kind: str):
    """kind: '24' or '1'. Notifies the client and coach; marks the flag sent."""
    cid = bk.get("client_id")
    coach_id = bk.get("coach_id")
    client = await db.users.find_one({"user_id": cid}, {"_id": 0, "display_name": 1})
    when = f"{bk.get('date')} {bk.get('time')}"
    lead = "in 24 hours" if kind == "24" else "in 1 hour"
    note = (bk.get("coach_note") or "").strip()
    note_suffix = f" 📝 Coach: {note}" if note else ""
    try:
        await send_push(
            recipients=[cid],
            data={"title": "Training session reminder",
                  "message": f"Your in-person session with Coach is {lead} ({when}).{note_suffix}",
                  "action_url": "/inperson"},
            idempotency_key=f"{bk['id']}:client:{kind}",
        )
    except Exception as e:
        logger.warning(f"client reminder push failed (non-blocking): {e}")
    if coach_id:
        try:
            await send_push(
                recipients=[coach_id],
                data={"title": "Coaching session reminder",
                      "message": f"Session with {(client or {}).get('display_name', 'your client')} is {lead} ({when}).",
                      "action_url": "/inperson"},
                idempotency_key=f"{bk['id']}:coach:{kind}",
            )
        except Exception as e:
            logger.warning(f"coach reminder push failed (non-blocking): {e}")
    await db.inperson_bookings.update_one({"id": bk["id"]}, {"$set": {f"reminder_{kind}_sent": True}})


async def _booking_reminder_loop():
    """Every 60s: fire 24h/1h reminders for approved, upcoming bookings."""
    import asyncio
    while True:
        try:
            now = datetime.now(timezone.utc)
            cursor = db.inperson_bookings.find({"status": "approved"})
            async for bk in cursor:
                appt = bk.get("appt_at")
                if not isinstance(appt, datetime):
                    continue
                if appt.tzinfo is None:
                    appt = appt.replace(tzinfo=timezone.utc)
                if appt < now:
                    continue
                secs = (appt - now).total_seconds()
                if secs <= 24 * 3600 and not bk.get("reminder_24_sent"):
                    await _send_booking_reminder(bk, "24")
                if secs <= 3600 and not bk.get("reminder_1_sent"):
                    await _send_booking_reminder(bk, "1")
        except Exception as e:
            logger.warning(f"booking reminder loop error: {e}")
        await asyncio.sleep(60)


@app.on_event("startup")
async def on_start():
    await seed()
    import asyncio
    asyncio.create_task(_booking_reminder_loop())




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

# Auto-exported so route modules can `from shared import *`.
__all__ = [name for name in dir() if not name.startswith('__')]
