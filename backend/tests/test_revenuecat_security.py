"""
Backend regression: RevenueCat server-side purchase verification (P0 security fix).

Covers:
  - /api/custom-program/unlock and /api/founders/back must fail-closed (402)
    without a webhook-verified purchase.
  - /api/revenuecat/webhook authorization (401 on wrong / missing secret).
  - Full grant flow for `custom_program` and `backer` entitlements.
  - Idempotency (duplicate event_id).
  - Refund flow revokes access -> unlock returns 402 again.
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
RC_SECRET = "rcwh_-6GP4zz9-3_cjbOxcChx3fNLZ8p5LygS65EWNA3nyDnLMyM5"
TEST_EMAIL = "athlete@test.com"
TEST_PASSWORD = "TestPass123!"


# ---------- Shared fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth(session):
    """Log in as the throwaway athlete user and return token + user_id."""
    r = session.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token") or data.get("session_token")
    assert token, f"no token in login response: {data}"
    headers = {"Authorization": f"Bearer {token}"}
    me = session.get(f"{API}/auth/me", headers=headers, timeout=15)
    assert me.status_code == 200, f"/auth/me failed: {me.status_code} {me.text}"
    me_json = me.json()
    uid = me_json.get("user_id") or me_json.get("id")
    assert uid, f"no user_id in /auth/me: {me_json}"
    return {"token": token, "headers": headers, "user_id": uid}


def _post_webhook(session, body, auth_header=None):
    headers = {"Content-Type": "application/json"}
    if auth_header is not None:
        headers["Authorization"] = auth_header
    return session.post(f"{API}/revenuecat/webhook", json=body, headers=headers, timeout=15)


def _grant_event(user_id, entitlement, event_id=None, etype="INITIAL_PURCHASE"):
    return {
        "event": {
            "id": event_id or f"evt_{uuid.uuid4().hex}",
            "type": etype,
            "app_user_id": user_id,
            "entitlement_ids": [entitlement],
            "product_id": "custom_program_lifetime" if entitlement == "custom_program" else "founder_backer",
            "store": "APP_STORE",
            "environment": "SANDBOX",
        }
    }


# ---------- Pre-conditions: ensure user has no lingering grants from prior runs ----------
@pytest.fixture(scope="module", autouse=True)
def reset_user_state(session, auth):
    """Refund any pre-existing verified purchases so tests start from a clean slate."""
    for ent in ("custom_program", "backer"):
        _post_webhook(
            session,
            {
                "event": {
                    "id": f"reset_{uuid.uuid4().hex}",
                    "type": "REFUND",
                    "app_user_id": auth["user_id"],
                    "entitlement_ids": [ent],
                    "product_id": "reset",
                    "store": "APP_STORE",
                    "environment": "SANDBOX",
                }
            },
            auth_header=RC_SECRET,
        )
    yield


# ---------- 1) Fail-closed: no purchase => 402 on both grant endpoints ----------
class TestFailClosed:
    def test_custom_program_unlock_without_purchase_returns_402(self, session, auth):
        r = session.post(f"{API}/custom-program/unlock", headers=auth["headers"], timeout=15)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        assert "not verified" in (r.json().get("detail") or "").lower()

    def test_founders_back_without_purchase_returns_402(self, session, auth):
        r = session.post(f"{API}/founders/back", headers=auth["headers"], timeout=15)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"
        assert "not verified" in (r.json().get("detail") or "").lower()


# ---------- 2) Webhook auth guard ----------
class TestWebhookAuth:
    def test_webhook_missing_auth_returns_401(self, session, auth):
        r = _post_webhook(session, _grant_event(auth["user_id"], "custom_program"), auth_header=None)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_webhook_wrong_auth_returns_401(self, session, auth):
        r = _post_webhook(session, _grant_event(auth["user_id"], "custom_program"), auth_header="not-the-secret")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_webhook_bearer_prefix_returns_401(self, session, auth):
        """Docs say raw value, NOT 'Bearer ...' -> Bearer prefix must be rejected."""
        r = _post_webhook(session, _grant_event(auth["user_id"], "custom_program"),
                          auth_header=f"Bearer {RC_SECRET}")
        assert r.status_code == 401, f"expected 401 with Bearer prefix, got {r.status_code}: {r.text}"


# ---------- 3) Custom program: happy path grant + unlock ----------
class TestCustomProgramGrant:
    def test_webhook_grants_custom_program(self, session, auth):
        event_id = f"evt_cp_{uuid.uuid4().hex}"
        r = _post_webhook(session, _grant_event(auth["user_id"], "custom_program", event_id=event_id),
                          auth_header=RC_SECRET)
        assert r.status_code == 200, f"webhook failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("ok") is True
        processed = data.get("processed") or []
        assert any(p.get("entitlement") == "custom_program" and p.get("action") == "granted" for p in processed), \
            f"expected granted action in processed: {processed}"
        # keep event_id for idempotency test
        pytest.custom_program_event_id = event_id

    def test_unlock_returns_200_and_sets_flags(self, session, auth):
        r = session.post(f"{API}/custom-program/unlock", headers=auth["headers"], timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("custom_program_purchased") is True, f"custom_program_purchased not set: {body}"
        assert body.get("athletes_center_access") is True, f"athletes_center_access not set: {body}"

    def test_me_reflects_custom_program_flags(self, session, auth):
        me = session.get(f"{API}/auth/me", headers=auth["headers"], timeout=15)
        assert me.status_code == 200
        j = me.json()
        assert j.get("custom_program_purchased") is True
        assert j.get("athletes_center_access") is True


# ---------- 4) Backer: happy path grant + founders/back ----------
class TestBackerGrant:
    def test_webhook_grants_backer(self, session, auth):
        event_id = f"evt_bk_{uuid.uuid4().hex}"
        r = _post_webhook(session, _grant_event(auth["user_id"], "backer", event_id=event_id),
                          auth_header=RC_SECRET)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        processed = r.json().get("processed") or []
        assert any(p.get("entitlement") == "backer" and p.get("action") == "granted" for p in processed), \
            f"expected granted backer: {processed}"

    def test_founders_back_returns_200_and_flag(self, session, auth):
        r = session.post(f"{API}/founders/back", headers=auth["headers"], timeout=15)
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("founder_backer") is True, f"founder_backer flag not set: {body}"


# ---------- 5) Idempotency ----------
class TestIdempotency:
    def test_duplicate_event_returns_duplicate_true(self, session, auth):
        eid = getattr(pytest, "custom_program_event_id", None)
        assert eid, "prior custom_program grant test must have run first"
        r = _post_webhook(session, _grant_event(auth["user_id"], "custom_program", event_id=eid),
                          auth_header=RC_SECRET)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert data.get("duplicate") is True, f"expected duplicate:true, got {data}"


# ---------- 6) Refund revokes access ----------
class TestRefundRevoke:
    def test_refund_webhook_then_unlock_returns_402(self, session, auth):
        # Sanity: unlock currently 200 (from earlier test)
        pre = session.post(f"{API}/custom-program/unlock", headers=auth["headers"], timeout=15)
        assert pre.status_code == 200, f"precondition: unlock should be 200 before refund, got {pre.status_code}"

        refund_body = {
            "event": {
                "id": f"evt_refund_{uuid.uuid4().hex}",
                "type": "REFUND",
                "app_user_id": auth["user_id"],
                "entitlement_ids": ["custom_program"],
                "product_id": "custom_program_lifetime",
                "store": "APP_STORE",
                "environment": "SANDBOX",
            }
        }
        r = _post_webhook(session, refund_body, auth_header=RC_SECRET)
        assert r.status_code == 200, f"refund webhook failed: {r.status_code} {r.text}"
        processed = r.json().get("processed") or []
        assert any(p.get("action") == "revoked" for p in processed), f"expected revoked action: {processed}"

        # small pause to be safe against any eventual-consistency (mongo local is sync but harmless)
        time.sleep(0.5)

        after = session.post(f"{API}/custom-program/unlock", headers=auth["headers"], timeout=15)
        assert after.status_code == 402, f"expected 402 after refund, got {after.status_code}: {after.text}"
