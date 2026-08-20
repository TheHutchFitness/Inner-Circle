"""Bug fix verification: clan invite XP reward farming.

Prior bug: A member could leave a clan and rejoin via its invite code repeatedly,
each rejoin re-granting joiner XP, clan XP, and inviter XP.

Fix: `reward_claimed` array on the group document persists which users already
claimed the invite reward for that clan. Rejoin pays 0 to joiner, 0 to inviter,
and 0 to clan.

Also covers regression:
  - New different member joining still receives full rewards.
  - 2-group cap still enforced on join-by-code.
  - Officer powers (approve, announce OK; remove, promote FORBIDDEN).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "the9hutch@gmail.com"
OWNER_PW = "Hutch-TWVmifIRhU6u8bBl"

BOT_PW = "BotPass123!"

INVITE_JOIN_XP = 100
INVITE_INVITER_XP = 200
INVITE_CLAN_XP = 150


# ---------- helpers ----------
def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    assert "session_token" in body, f"missing session_token: {body}"
    return body


def _hdrs(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _me(token: str) -> dict:
    r = requests.get(f"{API}/auth/me", headers=_hdrs(token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _xp(token: str) -> int:
    """Return current xp for user identified by session token."""
    me = _me(token)
    # /auth/me returns a user dict directly (see routes/auth.py refresh)
    u = me.get("user", me)
    return int(u.get("xp", 0))


def _leave_all_non_test_groups(token: str, user_id: str):
    """Best-effort: pull the user out of any group whose name starts with TEST_ so
    they satisfy the 2-group cap. Uses /leave (works for non-creator memberships)."""
    r = requests.get(f"{API}/my-groups", headers=_hdrs(token), timeout=15)
    if r.status_code != 200:
        return
    for g in r.json().get("groups", []):
        if g.get("role") == "creator":
            continue
        if str(g.get("name", "")).startswith("TEST_"):
            requests.post(f"{API}/groups/{g['id']}/leave", headers=_hdrs(token), timeout=15)


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def owner():
    return _login(OWNER_EMAIL, OWNER_PW)


@pytest.fixture(scope="module")
def bot1():
    return _login("bot1@circle.ai", BOT_PW)


@pytest.fixture(scope="module")
def bot2():
    return _login("bot2@circle.ai", BOT_PW)


@pytest.fixture(scope="module")
def bot3():
    return _login("bot3@circle.ai", BOT_PW)


@pytest.fixture(scope="module")
def bot4():
    return _login("bot4@circle.ai", BOT_PW)


@pytest.fixture(scope="module")
def clan(owner):
    """Owner creates a fresh throwaway clan and yields (gid, code). Cleaned via db."""
    name = f"TEST_farm_{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/groups", headers=_hdrs(owner["session_token"]),
                      json={"name": name, "description": "invite farm test"}, timeout=15)
    assert r.status_code == 200, f"create clan failed: {r.status_code} {r.text}"
    gid = r.json()["id"]
    # invite code
    r2 = requests.get(f"{API}/groups/{gid}/invite-code", headers=_hdrs(owner["session_token"]), timeout=15)
    assert r2.status_code == 200, r2.text
    code = r2.json()["code"]
    yield {"gid": gid, "code": code, "name": name}
    # teardown: remove all members then attempt clan delete via mongo (no delete API)
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if mongo_url and db_name:
            async def _drop():
                c = AsyncIOMotorClient(mongo_url)
                await c[db_name].groups.delete_one({"id": gid})
            asyncio.get_event_loop().run_until_complete(_drop())
    except Exception:
        pass  # test report will note manual cleanup needed


# ---------- bug fix: rejoin does NOT re-grant rewards ----------
class TestInviteRewardFarming:
    def test_first_join_grants_rewards(self, owner, bot1, clan):
        # ensure bot1 not already member/room-full
        _leave_all_non_test_groups(bot1["session_token"], bot1["user"]["user_id"])
        # baseline xp
        xp_before = _xp(bot1["session_token"])
        # clan xp before
        gr = requests.get(f"{API}/groups/{clan['gid']}", headers=_hdrs(owner["session_token"]), timeout=15)
        assert gr.status_code == 200, gr.text
        clan_xp_before = int(gr.json().get("xp", 0))

        # first join (with owner as ref -> should also pay inviter)
        owner_xp_before = _xp(owner["session_token"])
        r = requests.post(f"{API}/groups/join-by-code", headers=_hdrs(bot1["session_token"]),
                          json={"code": clan["code"], "ref": owner["user"]["user_id"]}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "joined", body
        assert body["joiner_xp"] == INVITE_JOIN_XP, body
        assert body["inviter_rewarded"] is True, body
        assert body["inviter_xp"] == INVITE_INVITER_XP, body

        # verify xp deltas
        assert _xp(bot1["session_token"]) == xp_before + INVITE_JOIN_XP
        assert _xp(owner["session_token"]) == owner_xp_before + INVITE_INVITER_XP
        gr2 = requests.get(f"{API}/groups/{clan['gid']}", headers=_hdrs(owner["session_token"]), timeout=15)
        assert int(gr2.json()["xp"]) == clan_xp_before + INVITE_CLAN_XP

    def test_rejoin_pays_zero(self, owner, bot1, clan):
        # bot1 leaves
        lv = requests.post(f"{API}/groups/{clan['gid']}/leave",
                           headers=_hdrs(bot1["session_token"]), timeout=15)
        assert lv.status_code == 200, lv.text

        xp_before = _xp(bot1["session_token"])
        owner_xp_before = _xp(owner["session_token"])
        gr = requests.get(f"{API}/groups/{clan['gid']}", headers=_hdrs(owner["session_token"]), timeout=15)
        clan_xp_before = int(gr.json()["xp"])

        # rejoin same code, same ref
        r = requests.post(f"{API}/groups/join-by-code", headers=_hdrs(bot1["session_token"]),
                          json={"code": clan["code"], "ref": owner["user"]["user_id"]}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "joined", body
        assert body["joiner_xp"] == 0, f"expected joiner_xp=0 on rejoin, got {body}"
        assert body["inviter_rewarded"] is False, body
        assert body["inviter_xp"] == 0, body

        # verify NO xp changed (bot / owner / clan)
        assert _xp(bot1["session_token"]) == xp_before, "bot xp changed on rejoin — farming still possible"
        assert _xp(owner["session_token"]) == owner_xp_before, "inviter xp changed on rejoin — farming still possible"
        gr2 = requests.get(f"{API}/groups/{clan['gid']}", headers=_hdrs(owner["session_token"]), timeout=15)
        assert int(gr2.json()["xp"]) == clan_xp_before, "clan xp changed on rejoin — farming still possible"

    def test_multiple_rejoins_still_zero(self, owner, bot1, clan):
        # leave + rejoin two more times, confirm no reward ever pays again
        for i in range(2):
            requests.post(f"{API}/groups/{clan['gid']}/leave", headers=_hdrs(bot1["session_token"]), timeout=15)
            r = requests.post(f"{API}/groups/join-by-code", headers=_hdrs(bot1["session_token"]),
                              json={"code": clan["code"], "ref": owner["user"]["user_id"]}, timeout=15)
            assert r.status_code == 200, r.text
            b = r.json()
            assert b["joiner_xp"] == 0 and b["inviter_xp"] == 0, f"cycle {i} paid reward: {b}"


# ---------- regression: NEW member first-join still gets reward ----------
class TestNewMemberStillGetsReward:
    def test_new_member_first_join(self, owner, bot2, clan):
        _leave_all_non_test_groups(bot2["session_token"], bot2["user"]["user_id"])
        xp_before = _xp(bot2["session_token"])
        gr = requests.get(f"{API}/groups/{clan['gid']}", headers=_hdrs(owner["session_token"]), timeout=15)
        clan_xp_before = int(gr.json()["xp"])

        r = requests.post(f"{API}/groups/join-by-code", headers=_hdrs(bot2["session_token"]),
                          json={"code": clan["code"]}, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["status"] == "joined"
        assert b["joiner_xp"] == INVITE_JOIN_XP, b
        assert _xp(bot2["session_token"]) == xp_before + INVITE_JOIN_XP
        gr2 = requests.get(f"{API}/groups/{clan['gid']}", headers=_hdrs(owner["session_token"]), timeout=15)
        assert int(gr2.json()["xp"]) == clan_xp_before + INVITE_CLAN_XP


# ---------- regression: 2-group cap enforced on join-by-code ----------
class TestTwoGroupCap:
    def test_third_group_rejected(self, owner, bot3, clan):
        _leave_all_non_test_groups(bot3["session_token"], bot3["user"]["user_id"])

        # Owner is capped at 2 groups (his private 'test' + this run's TEST_farm),
        # and bots don't have creator privileges. So we insert two throwaway clans
        # directly via mongo (still tests the join-by-code path we care about).
        from pymongo import MongoClient
        from datetime import datetime, timezone
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        mdb = mc[os.environ.get("DB_NAME", "hutchs_inner_circle")]

        codes = []
        gids = []
        for _ in range(2):
            gid = f"grp_{uuid.uuid4().hex[:12]}"
            code = uuid.uuid4().hex[:8].upper()
            name = f"TEST_cap_{uuid.uuid4().hex[:6]}"
            mdb.groups.insert_one({
                "id": gid, "name": name, "name_lower": name.lower(),
                "description": "cap test", "creator_id": owner["user"]["user_id"],
                "members": [owner["user"]["user_id"]], "pending": [], "xp": 0,
                "announcements": [], "created_at": datetime.now(timezone.utc),
                "invite_code": code,
            })
            gids.append(gid)
            codes.append(code)

        try:
            # bot3 joins the two cap clans
            for c in codes:
                r = requests.post(f"{API}/groups/join-by-code", headers=_hdrs(bot3["session_token"]),
                                  json={"code": c}, timeout=15)
                assert r.status_code == 200, r.text
            # now 3rd join must be rejected 400
            r3 = requests.post(f"{API}/groups/join-by-code", headers=_hdrs(bot3["session_token"]),
                               json={"code": clan["code"]}, timeout=15)
            assert r3.status_code == 400, f"expected 400 on 3rd clan, got {r3.status_code} {r3.text}"
            assert "2 groups" in r3.text
        finally:
            # cleanup: bot3 leaves + drop groups via mongo
            for gid in gids:
                requests.post(f"{API}/groups/{gid}/leave", headers=_hdrs(bot3["session_token"]), timeout=15)
            try:
                from motor.motor_asyncio import AsyncIOMotorClient
                import asyncio
                mongo_url = os.environ.get("MONGO_URL")
                db_name = os.environ.get("DB_NAME")
                if mongo_url and db_name:
                    async def _drop():
                        c = AsyncIOMotorClient(mongo_url)
                        for gid in gids:
                            await c[db_name].groups.delete_one({"id": gid})
                    asyncio.get_event_loop().run_until_complete(_drop())
            except Exception:
                pass


# ---------- regression: officer powers ----------
class TestOfficerPowers:
    def test_officer_can_approve_and_announce_but_not_remove_or_promote(self, owner, bot2, bot4, clan):
        # bot2 already a member (from prior class). If not, join.
        gr = requests.get(f"{API}/groups/{clan['gid']}", headers=_hdrs(owner["session_token"]), timeout=15)
        members = [m["user_id"] for m in gr.json().get("members", [])]
        if bot2["user"]["user_id"] not in members:
            r = requests.post(f"{API}/groups/join-by-code", headers=_hdrs(bot2["session_token"]),
                              json={"code": clan["code"]}, timeout=15)
            assert r.status_code == 200, r.text

        # owner promotes bot2 -> officer
        r = requests.post(f"{API}/groups/{clan['gid']}/officer", headers=_hdrs(owner["session_token"]),
                          json={"user_id": bot2["user"]["user_id"], "on": True}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("is_officer") is True

        # bot4 attempts /join (regular, not by code) -> should end up pending
        _leave_all_non_test_groups(bot4["session_token"], bot4["user"]["user_id"])
        rj = requests.post(f"{API}/groups/{clan['gid']}/join", headers=_hdrs(bot4["session_token"]), timeout=15)
        assert rj.status_code == 200, rj.text
        assert rj.json().get("status") in ("pending", "member")

        # officer (bot2) approves bot4 — expect 200
        ap = requests.post(f"{API}/groups/{clan['gid']}/approve", headers=_hdrs(bot2["session_token"]),
                           json={"user_id": bot4["user"]["user_id"]}, timeout=15)
        assert ap.status_code == 200, f"officer approve should work: {ap.status_code} {ap.text}"

        # officer posts announcement -> 200
        an = requests.post(f"{API}/groups/{clan['gid']}/announce", headers=_hdrs(bot2["session_token"]),
                           json={"text": "TEST officer announcement"}, timeout=15)
        assert an.status_code == 200, f"officer announce should work: {an.status_code} {an.text}"

        # officer tries to REMOVE bot4 -> 403
        rm = requests.post(f"{API}/groups/{clan['gid']}/remove", headers=_hdrs(bot2["session_token"]),
                           json={"user_id": bot4["user"]["user_id"]}, timeout=15)
        assert rm.status_code == 403, f"officer remove must be 403: got {rm.status_code} {rm.text}"

        # officer tries to promote bot4 -> 403
        pr = requests.post(f"{API}/groups/{clan['gid']}/officer", headers=_hdrs(bot2["session_token"]),
                           json={"user_id": bot4["user"]["user_id"], "on": True}, timeout=15)
        assert pr.status_code == 403, f"officer promote must be 403: got {pr.status_code} {pr.text}"
