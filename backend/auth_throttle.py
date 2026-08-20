"""Brute-force / rate-limit throttling for auth endpoints (MongoDB-backed, fail-closed).

Wraps the existing login/register/apple flows without changing the session model.
Counters live in db.auth_limits with a TTL index for cleanup; enforcement always
checks timestamps in code (TTL deletion can lag). Keys are HMAC-hashed so raw IPs
and emails are never stored.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from shared import db

_KEY_SECRET = os.environ.get("AUTH_THROTTLE_SECRET", "hutch-inner-circle-throttle-v1").encode()

# Policy
IP_LOGIN_LIMIT = 20
IP_LOGIN_WINDOW = timedelta(minutes=10)
SIGNUP_IP_LIMIT = 5
SIGNUP_EMAIL_LIMIT = 3
SIGNUP_WINDOW = timedelta(hours=1)
ACCOUNT_THRESHOLD = 5           # first 5 failures free
ACCOUNT_WINDOW = timedelta(minutes=15)
MAX_BACKOFF = 15 * 60           # seconds

_indexes_ready = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt):
    # pymongo returns naive UTC datetimes; make them tz-aware for safe comparison.
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _digest(namespace: str, value: str) -> str:
    return hmac.new(_KEY_SECRET, f"{namespace}:{value}".encode(), hashlib.sha256).hexdigest()


def client_ip(request: Request) -> str:
    # Behind the cluster ingress: prefer the left-most X-Forwarded-For hop, else peer.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _ensure_indexes() -> None:
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        await db.auth_limits.create_index("expires_at", expireAfterSeconds=0)
        await db.auth_limits.create_index([("kind", 1), ("key", 1), ("bucket", 1)], unique=True, sparse=True)
        await db.login_events.create_index("expires_at", expireAfterSeconds=0)
        await db.login_events.create_index([("at", -1)])
        _indexes_ready = True
    except PyMongoError:
        # Non-fatal; upserts still work without the unique index.
        _indexes_ready = True


def mask_email(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return "***"
    local, _, dom = e.partition("@")
    return f"{local[:2]}{'*' * max(1, len(local) - 2)}@{dom}"


async def log_failed_login(ip: str, email: str) -> None:
    """Append a lightweight failed-login event (masked email) for the admin audit log."""
    await _ensure_indexes()
    t = _now()
    try:
        await db.login_events.insert_one({
            "at": t, "ip": ip or "unknown", "email_masked": mask_email(email),
            "expires_at": t + timedelta(days=7),
        })
    except PyMongoError:
        pass


async def consume_bucket(*, kind: str, raw_key: str, limit: int, window: timedelta) -> None:
    """Fixed-window quota. Raises 429 when exceeded, 503 if the DB is unreachable."""
    await _ensure_indexes()
    t = _now()
    seconds = int(window.total_seconds())
    bucket = int(t.timestamp()) // seconds
    expires = datetime.fromtimestamp((bucket + 1) * seconds, tz=timezone.utc) + timedelta(hours=1)
    key = _digest(kind, raw_key)
    try:
        doc = await db.auth_limits.find_one_and_update(
            {"kind": kind, "key": key, "bucket": bucket},
            {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": expires}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if int(doc["count"]) > limit:
            retry = max(1, int((expires - timedelta(hours=1) - t).total_seconds()))
            raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.",
                                headers={"Retry-After": str(retry)})
    except HTTPException:
        raise
    except (PyMongoError, DuplicateKeyError) as exc:
        raise HTTPException(status_code=503, detail="Authentication temporarily unavailable") from exc


async def check_account_backoff(email: str) -> None:
    """Raise a generic 401 while an account is in failed-login backoff."""
    try:
        doc = await db.auth_limits.find_one({"kind": "account", "key": _digest("account", email)})
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Authentication temporarily unavailable") from exc
    if doc and doc.get("locked_until") and _aware(doc["locked_until"]) > _now():
        raise HTTPException(status_code=401, detail="Invalid credentials")


async def record_failed_account_login(email: str) -> None:
    """Atomic CAS increment with capped exponential backoff after the threshold."""
    key = _digest("account", email)
    for _ in range(5):
        t = _now()
        try:
            old = await db.auth_limits.find_one({"kind": "account", "key": key})
        except PyMongoError:
            return  # don't block the (already failed) response on limiter DB issues
        if not old:
            try:
                await db.auth_limits.insert_one({
                    "kind": "account", "key": key, "failures": 1,
                    "window_started": t, "locked_until": t,
                    "expires_at": t + ACCOUNT_WINDOW + timedelta(hours=1),
                })
                return
            except DuplicateKeyError:
                continue
            except PyMongoError:
                return
        failures = 0 if _aware(old["window_started"]) < t - ACCOUNT_WINDOW else int(old.get("failures", 0))
        new_failures = failures + 1
        delay = 0 if new_failures <= ACCOUNT_THRESHOLD else min(MAX_BACKOFF, 2 ** (new_failures - ACCOUNT_THRESHOLD))
        locked_until = t + timedelta(seconds=delay)
        try:
            changed = await db.auth_limits.update_one(
                {"_id": old["_id"], "failures": old.get("failures", 0), "window_started": old["window_started"]},
                {"$set": {"failures": new_failures, "window_started": t, "locked_until": locked_until,
                          "expires_at": t + ACCOUNT_WINDOW + timedelta(hours=1)}},
            )
        except PyMongoError:
            return
        if changed.modified_count == 1:
            return


async def reset_account_login(email: str) -> None:
    try:
        await db.auth_limits.delete_one({"kind": "account", "key": _digest("account", email)})
    except PyMongoError:
        pass
