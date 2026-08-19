"""
Iteration 19 — Admin Feature Set tests
Covers:
- Admin auth + non-admin 403 on /api/admin/*
- Badge grant/revoke, verify-member, founder grant
- Rank up/down
- Bans: chat scope (blocks chat, allows /auth/me), all scope (blocks login + kills session), unban
- Featured/spotlight add/get/delete
- Enhanced-theme toggle
- Judge delete-comment auth matrix (admin, author, other non-admin)
- Regression: bot login, /auth/me, /leaderboard/xp, /founders
"""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@hutchcircle.com", "AdminPass123!")
MEMBER1 = ("member1@hutchcircle.com", "Pass123!")
MEMBER2 = ("member2@hutchcircle.com", "Pass123!")
BOT = ("bot1@circle.ai", "BotPass123!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def admin_token():
    r = _login(*ADMIN)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def member1_token():
    r = _login(*MEMBER1)
    assert r.status_code == 200, f"member1 login failed: {r.status_code} {r.text}"
    return r.json()["session_token"], r.json()["user"]["user_id"]


@pytest.fixture(scope="module")
def member2_token():
    r = _login(*MEMBER2)
    assert r.status_code == 200, f"member2 login failed: {r.status_code} {r.text}"
    return r.json()["session_token"], r.json()["user"]["user_id"]


# ---------- ADMIN AUTH ----------
class TestAdminAuth:
    def test_admin_members_ok(self, admin_token):
        r = requests.get(f"{API}/admin/members", headers=_auth_header(admin_token))
        assert r.status_code == 200
        body = r.json()
        assert "members" in body and "badge_options" in body
        assert isinstance(body["members"], list)
        assert isinstance(body["badge_options"], list) and len(body["badge_options"]) > 0

    def test_non_admin_forbidden_all_admin_endpoints(self, member1_token):
        tok, _ = member1_token
        endpoints = [
            ("GET", "/admin/members", None),
            ("POST", "/admin/grant-badge", {"user_id": "x", "badge": "coach_pick"}),
            ("POST", "/admin/verify-member", {"user_id": "x", "skool_verified": True}),
            ("POST", "/admin/founder", {"user_id": "x", "on": True}),
            ("POST", "/admin/set-rank", {"user_id": "x", "direction": "up"}),
            ("POST", "/admin/ban", {"user_id": "x", "scope": "chat", "minutes": 5}),
            ("POST", "/admin/unban", {"user_id": "x"}),
            ("POST", "/admin/featured", {"user_id": "x", "reason": "n"}),
            ("POST", "/admin/enhanced-theme", {"on": True}),
        ]
        for method, ep, body in endpoints:
            r = requests.request(method, f"{API}{ep}", headers=_auth_header(tok), json=body)
            assert r.status_code == 403, f"{method} {ep} expected 403 got {r.status_code}"


# ---------- BADGES ----------
class TestBadges:
    def test_grant_and_revoke_badge(self, admin_token, member1_token):
        _, uid = member1_token
        r = requests.post(f"{API}/admin/grant-badge", headers=_auth_header(admin_token),
                          json={"user_id": uid, "badge": "coach_pick", "on": True})
        assert r.status_code == 200
        assert "coach_pick" in (r.json().get("badges") or [])
        r = requests.post(f"{API}/admin/grant-badge", headers=_auth_header(admin_token),
                          json={"user_id": uid, "badge": "coach_pick", "on": False})
        assert r.status_code == 200
        assert "coach_pick" not in (r.json().get("badges") or [])


# ---------- VERIFY ----------
class TestVerify:
    def test_verify_member(self, admin_token, member1_token):
        _, uid = member1_token
        r = requests.post(f"{API}/admin/verify-member", headers=_auth_header(admin_token),
                          json={"user_id": uid, "skool_verified": True})
        assert r.status_code == 200
        assert r.json().get("skool_verified") is True


# ---------- FOUNDER GRANT ----------
class TestFounderGrant:
    def test_founder_grant_and_public(self, admin_token, member1_token):
        _, uid = member1_token
        r = requests.post(f"{API}/admin/founder", headers=_auth_header(admin_token),
                          json={"user_id": uid, "on": True})
        assert r.status_code == 200
        assert r.json().get("founder_grant") is True
        pr = requests.get(f"{API}/users/{uid}/public", headers=_auth_header(admin_token))
        assert pr.status_code == 200
        assert pr.json().get("is_founder") is True


# ---------- RANK ----------
class TestRank:
    def test_rank_up_and_down(self, admin_token, member2_token):
        _, uid = member2_token
        # Grab starting rank
        r = requests.get(f"{API}/admin/members", headers=_auth_header(admin_token))
        me = next((m for m in r.json()["members"] if m["user_id"] == uid), None)
        assert me
        start_rank = me["rank"]
        r = requests.post(f"{API}/admin/set-rank", headers=_auth_header(admin_token),
                          json={"user_id": uid, "direction": "up"})
        assert r.status_code == 200
        after_up = r.json()
        assert after_up["rank"] != start_rank or start_rank == "Freak"
        r = requests.post(f"{API}/admin/set-rank", headers=_auth_header(admin_token),
                          json={"user_id": uid, "direction": "down"})
        assert r.status_code == 200
        # Not below Beginner (xp>=0)
        assert r.json()["xp"] >= 0


# ---------- BANS ----------
class TestBans:
    def test_chat_ban_blocks_chat_but_not_me(self, admin_token, member1_token):
        tok, uid = member1_token
        # Ban chat 5 mins
        r = requests.post(f"{API}/admin/ban", headers=_auth_header(admin_token),
                          json={"user_id": uid, "scope": "chat", "minutes": 5})
        assert r.status_code == 200
        # /auth/me should be 200
        me = requests.get(f"{API}/auth/me", headers=_auth_header(tok))
        assert me.status_code == 200, f"/auth/me should still work under chat ban, got {me.status_code}"
        # posting a chat message should 403
        pm = requests.post(f"{API}/chat/main/messages", headers=_auth_header(tok),
                           json={"text": "TEST_chat_muted"})
        assert pm.status_code == 403, f"chat post should be 403, got {pm.status_code} {pm.text}"
        # Unban
        ub = requests.post(f"{API}/admin/unban", headers=_auth_header(admin_token),
                           json={"user_id": uid})
        assert ub.status_code == 200

    def test_all_ban_kills_session_and_blocks_login(self, admin_token, member2_token):
        tok, uid = member2_token
        r = requests.post(f"{API}/admin/ban", headers=_auth_header(admin_token),
                          json={"user_id": uid, "scope": "all", "minutes": 5})
        assert r.status_code == 200
        # existing session killed -> /auth/me 403 (banned) or 401 (session deleted)
        me = requests.get(f"{API}/auth/me", headers=_auth_header(tok))
        assert me.status_code in (401, 403), f"session should be killed, got {me.status_code}"
        # login should be 403
        login = _login(*MEMBER2)
        assert login.status_code == 403, f"login should be 403, got {login.status_code} {login.text}"
        # Unban
        ub = requests.post(f"{API}/admin/unban", headers=_auth_header(admin_token),
                           json={"user_id": uid})
        assert ub.status_code == 200
        # Login should work again
        login2 = _login(*MEMBER2)
        assert login2.status_code == 200


# ---------- FEATURED ----------
class TestFeatured:
    def test_feature_add_get_delete(self, admin_token, member2_token):
        _, uid = member2_token
        reason = "TEST_spotlight_reason: gnarly week"
        r = requests.post(f"{API}/admin/featured", headers=_auth_header(admin_token),
                          json={"user_id": uid, "reason": reason})
        assert r.status_code == 200
        f = requests.get(f"{API}/featured", headers=_auth_header(admin_token))
        assert f.status_code == 200
        featured = f.json()["featured"]
        entry = next((x for x in featured if x["user_id"] == uid), None)
        assert entry is not None
        assert entry["reason"] == reason
        d = requests.delete(f"{API}/admin/featured/{uid}", headers=_auth_header(admin_token))
        assert d.status_code == 200
        f2 = requests.get(f"{API}/featured", headers=_auth_header(admin_token))
        assert not any(x["user_id"] == uid for x in f2.json()["featured"])


# ---------- ENHANCED THEME TOGGLE ----------
class TestEnhancedTheme:
    def test_toggle_on_off(self, admin_token):
        r_on = requests.post(f"{API}/admin/enhanced-theme", headers=_auth_header(admin_token),
                             json={"on": True})
        assert r_on.status_code == 200
        assert r_on.json().get("enhanced") is True
        r_off = requests.post(f"{API}/admin/enhanced-theme", headers=_auth_header(admin_token),
                              json={"on": False})
        assert r_off.status_code == 200
        assert r_off.json().get("enhanced") is False


# ---------- JUDGE COMMENT DELETE (API-only path: seed via db.judge_comments) ----------
# We can't easily post a judge submission without an image + verified email, so we
# find an existing submission or the API supports comments if any exists. If none exist,
# skip the test.
class TestJudgeCommentDelete:
    def test_admin_and_author_and_other_permissions(self, admin_token, member1_token, member2_token):
        # Get list of judge submissions
        m1_tok, m1_uid = member1_token
        m2_tok, m2_uid = member2_token
        feed = requests.get(f"{API}/judge/feed", headers=_auth_header(admin_token))
        if feed.status_code != 200 or not feed.json():
            pytest.skip("No judge submissions available; skipping comment-delete flow")
        sub_id = feed.json()[0]["submission_id"]

        # Member1 posts a comment
        c = requests.post(f"{API}/judge/{sub_id}/comments", headers=_auth_header(m1_tok),
                          json={"text": "TEST_del_this_comment"})
        assert c.status_code == 200, f"comment add failed: {c.status_code} {c.text}"
        cid = c.json()["comment_id"]

        # Member2 (other non-admin) tries to delete -> 403
        r = requests.delete(f"{API}/judge/{sub_id}/comments/{cid}", headers=_auth_header(m2_tok))
        assert r.status_code == 403, f"non-author non-admin should 403, got {r.status_code}"

        # Admin deletes -> 200
        r = requests.delete(f"{API}/judge/{sub_id}/comments/{cid}", headers=_auth_header(admin_token))
        assert r.status_code == 200

        # Author-can-delete: post another and delete as author
        c2 = requests.post(f"{API}/judge/{sub_id}/comments", headers=_auth_header(m1_tok),
                           json={"text": "TEST_del_author_owns"})
        assert c2.status_code == 200
        cid2 = c2.json()["comment_id"]
        r = requests.delete(f"{API}/judge/{sub_id}/comments/{cid2}", headers=_auth_header(m1_tok))
        assert r.status_code == 200


# ---------- REGRESSION ----------
class TestRegression:
    def test_bot_login_me_leaderboard_founders(self):
        r = _login(*BOT)
        assert r.status_code == 200
        tok = r.json()["session_token"]
        me = requests.get(f"{API}/auth/me", headers=_auth_header(tok))
        assert me.status_code == 200
        lb = requests.get(f"{API}/leaderboard/xp", headers=_auth_header(tok))
        assert lb.status_code == 200
        f = requests.get(f"{API}/founders", headers=_auth_header(tok))
        assert f.status_code == 200


# ---------- CLEANUP: make sure test members are unbanned + unfeatured ----------
def test_zz_cleanup(admin_token, member1_token, member2_token):
    _, uid1 = member1_token
    _, uid2 = member2_token
    for uid in (uid1, uid2):
        requests.post(f"{API}/admin/unban", headers=_auth_header(admin_token),
                      json={"user_id": uid})
    requests.delete(f"{API}/admin/featured/{uid2}", headers=_auth_header(admin_token))
