"""Iteration 35 backend tests — critique rooms (PR/Form Lab), multi-gym membership,
required full_name at signup, admin purge-preview, journey objectives.

Runs against the public EXPO_BACKEND_URL. Uses the seeded owner/admin, plus a
throwaway registered user for non-admin flows.
"""
import io
import os
import time
import uuid
import struct
import zlib

import pytest
import requests

BASE_URL = "https://powerup-arena.preview.emergentagent.com"
OWNER_EMAIL = "the9hutch@gmail.com"
OWNER_PASSWORD = "Hutch-TWVmifIRhU6u8bBl"


def _tiny_png_bytes() -> bytes:
    """1x1 red PNG (valid PNG, no external deps)."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00" + b"\xff\x00\x00"  # filter byte + RGB pixel
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def owner_headers(owner_token):
    return {"Authorization": f"Bearer {owner_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_id(owner_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=owner_headers, timeout=15)
    assert r.status_code == 200
    return r.json()["user_id"]


@pytest.fixture(scope="module")
def owner_original_gym(owner_headers):
    """Snapshot owner's gym state so we can restore after the multi-gym test."""
    r = requests.get(f"{BASE_URL}/api/gyms/mine", headers=owner_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    original = [g["name"] for g in data.get("gyms", [])]
    primary = next((g["name"] for g in data.get("gyms", []) if g.get("primary")), None)
    return {"gyms": original, "primary": primary}


# ---------- (a) Register full_name required ----------
class TestRegisterFullName:
    def test_register_without_full_name_400(self):
        email = f"fulltest_{uuid.uuid4().hex[:8]}@test.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "TestPass123!", "display_name": "NoName",
        }, timeout=15)
        assert r.status_code == 400, f"expected 400 without full_name, got {r.status_code} {r.text}"
        assert "full" in r.text.lower() or "name" in r.text.lower()

    def test_register_with_full_name_then_me_returns_it(self):
        email = f"fulltest_{uuid.uuid4().hex[:8]}@test.com"
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "TestPass123!", "display_name": "FN Test",
            "full_name": "Fullname Legal Person",
        }, timeout=15)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
        body = r.json()
        assert "session_token" in body
        token = body["session_token"]
        assert body["user"].get("full_name") == "Fullname Legal Person"
        # /auth/me returns full_name
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"}, timeout=15)
        assert me.status_code == 200
        assert me.json().get("full_name") == "Fullname Legal Person"


# ---------- Non-admin fixture (throwaway user for rooms + gyms) ----------
@pytest.fixture(scope="module")
def test_user():
    """A fresh throwaway user used across rooms + multi-gym tests."""
    email = f"iter35_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "TestPass123!", "display_name": "Iter35 Test",
        "full_name": "Iter35 Testing User",
    }, timeout=15)
    assert r.status_code == 200, f"throwaway register failed: {r.status_code} {r.text}"
    body = r.json()
    token = body["session_token"]
    uid = body["user"]["user_id"]
    return {"email": email, "token": token, "user_id": uid,
            "headers": {"Authorization": f"Bearer {token}"}}


# The critique_submit route requires email_verified OR phone_verified. Freshly
# registered users have neither — so we mark them verified directly in Mongo
# before running the room-submit tests.
@pytest.fixture(scope="module")
def verified_test_user(test_user):
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "hutchs_inner_circle")
    cli = MongoClient(mongo_url)
    cli[db_name].users.update_one(
        {"user_id": test_user["user_id"]},
        {"$set": {"email_verified": True}},
    )
    cli.close()
    return test_user


# ---------- (b/c/d/e/f/g) Critique rooms (PR + Form) ----------
class TestCritiqueRooms:
    submitted = {}  # room -> post_id

    @pytest.mark.parametrize("room", ["pr", "form"])
    def test_submit_photo(self, verified_test_user, room):
        headers = {"Authorization": f"Bearer {verified_test_user['token']}"}
        files = {"file": (f"lift_{room}.png", _tiny_png_bytes(), "image/png")}
        data = {"exercise": "Bench Press", "weight": "225", "reps": "3",
                "bodyweight": "180", "caption": f"iter35 {room} test"}
        r = requests.post(f"{BASE_URL}/api/rooms/{room}/submit",
                          headers=headers, files=files, data=data, timeout=90)
        assert r.status_code == 200, f"{room}/submit failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body.get("media_id"), "media_id missing"
        assert body.get("media_type") == "image"
        assert body.get("room") == room
        assert "critique" in body, "critique key missing"
        # critique can be None if AI failed — that's acceptable per spec
        assert body["critique"] is None or isinstance(body["critique"], dict)
        assert body.get("post_id")
        TestCritiqueRooms.submitted[room] = body["post_id"]

    @pytest.mark.parametrize("room", ["pr", "form"])
    def test_feed_shows_submitted(self, verified_test_user, room):
        pid = TestCritiqueRooms.submitted.get(room)
        assert pid, f"no submitted post recorded for room={room}"
        headers = {"Authorization": f"Bearer {verified_test_user['token']}"}
        r = requests.get(f"{BASE_URL}/api/rooms/{room}/feed", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        mine = next((p for p in rows if p.get("post_id") == pid), None)
        assert mine, f"submitted post not in feed room={room}"
        assert mine.get("liked") is False

    @pytest.mark.parametrize("room", ["pr", "form"])
    def test_like_toggle(self, verified_test_user, room):
        pid = TestCritiqueRooms.submitted[room]
        headers = {"Authorization": f"Bearer {verified_test_user['token']}"}
        r1 = requests.post(f"{BASE_URL}/api/rooms/{room}/{pid}/like", headers=headers, timeout=15)
        assert r1.status_code == 200, r1.text
        b1 = r1.json()
        assert b1.get("liked") is True
        assert b1.get("like_count") == 1
        r2 = requests.post(f"{BASE_URL}/api/rooms/{room}/{pid}/like", headers=headers, timeout=15)
        assert r2.status_code == 200
        b2 = r2.json()
        assert b2.get("liked") is False
        assert b2.get("like_count") == 0

    @pytest.mark.parametrize("room", ["pr", "form"])
    def test_comment_add_get_delete(self, verified_test_user, room):
        pid = TestCritiqueRooms.submitted[room]
        headers = {"Authorization": f"Bearer {verified_test_user['token']}",
                   "Content-Type": "application/json"}
        # add
        r = requests.post(f"{BASE_URL}/api/rooms/{room}/{pid}/comments",
                          headers=headers, json={"text": "great lift"}, timeout=15)
        assert r.status_code == 200, r.text
        cid = r.json().get("comment_id")
        assert cid
        # get
        g = requests.get(f"{BASE_URL}/api/rooms/{room}/{pid}/comments",
                         headers=headers, timeout=15)
        assert g.status_code == 200
        assert any(c.get("comment_id") == cid for c in g.json())
        # delete own
        d = requests.delete(f"{BASE_URL}/api/rooms/{room}/{pid}/comments/{cid}",
                            headers=headers, timeout=15)
        assert d.status_code == 200

    @pytest.mark.parametrize("room", ["pr", "form"])
    def test_leaderboard(self, verified_test_user, room):
        headers = {"Authorization": f"Bearer {verified_test_user['token']}"}
        r = requests.get(f"{BASE_URL}/api/rooms/{room}/leaderboard", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "board" in body and isinstance(body["board"], list)
        assert "prize_label" in body
        assert "prize_xp" in body

    def test_unknown_room_404(self, verified_test_user):
        headers = {"Authorization": f"Bearer {verified_test_user['token']}"}
        r = requests.get(f"{BASE_URL}/api/rooms/bogus/feed", headers=headers, timeout=15)
        assert r.status_code == 404


# ---------- (h) Multi-gym membership ----------
class TestMultiGym:
    added = []  # gym names added by this test — cleaned up in teardown

    @classmethod
    def teardown_class(cls):
        """Best-effort restore owner's gyms to the original single gym."""
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=15)
        if r.status_code != 200:
            return
        tok = r.json()["session_token"]
        h = {"Authorization": f"Bearer {tok}"}
        for name in cls.added:
            requests.delete(f"{BASE_URL}/api/gyms/mine", headers=h,
                            params={"name": name}, timeout=15)

    def test_get_mine(self, owner_headers, owner_original_gym):
        r = requests.get(f"{BASE_URL}/api/gyms/mine", headers=owner_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("max") == 5
        assert isinstance(body.get("gyms"), list)

    def test_add_and_dedupe_and_limit(self, owner_headers):
        # Add first
        name = f"TEST Iter35 Iron Gym {uuid.uuid4().hex[:4]}"
        r = requests.post(f"{BASE_URL}/api/gyms/mine", headers=owner_headers,
                          json={"name": name}, timeout=15)
        assert r.status_code == 200, r.text
        TestMultiGym.added.append(name)
        gyms = [g["name"] for g in r.json()["gyms"]]
        assert name in gyms

        # Dedupe: add same name again → 400
        r2 = requests.post(f"{BASE_URL}/api/gyms/mine", headers=owner_headers,
                           json={"name": name}, timeout=15)
        assert r2.status_code == 400

        # Fill up to 5 distinct gyms, then attempt 6th → 400
        # Determine current count from GET
        current = requests.get(f"{BASE_URL}/api/gyms/mine", headers=owner_headers, timeout=15).json()
        count = len(current.get("gyms", []))
        while count < 5:
            nm = f"TEST Iter35 Gym {uuid.uuid4().hex[:6]}"
            resp = requests.post(f"{BASE_URL}/api/gyms/mine", headers=owner_headers,
                                 json={"name": nm}, timeout=15)
            assert resp.status_code == 200, resp.text
            TestMultiGym.added.append(nm)
            count = len(resp.json().get("gyms", []))
        # 6th (distinct) should 400
        sixth = f"TEST Iter35 Gym 6th {uuid.uuid4().hex[:4]}"
        r6 = requests.post(f"{BASE_URL}/api/gyms/mine", headers=owner_headers,
                           json={"name": sixth}, timeout=15)
        assert r6.status_code == 400, f"expected limit-block, got {r6.status_code} {r6.text}"

    def test_set_primary(self, owner_headers):
        # Use the first added gym as new primary
        assert TestMultiGym.added, "no added gyms available"
        target = TestMultiGym.added[0]
        r = requests.post(f"{BASE_URL}/api/gyms/mine/primary", headers=owner_headers,
                          json={"name": target}, timeout=15)
        assert r.status_code == 200, r.text
        gyms = r.json()["gyms"]
        primary = next((g for g in gyms if g.get("primary")), None)
        assert primary and primary["name"].lower() == target.lower()

    def test_delete_reassigns_primary(self, owner_headers):
        assert TestMultiGym.added
        target = TestMultiGym.added.pop(0)  # was primary
        r = requests.delete(f"{BASE_URL}/api/gyms/mine", headers=owner_headers,
                            params={"name": target}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # target removed
        assert not any(g["name"].lower() == target.lower() for g in body["gyms"])
        # a new primary should exist if any gyms remain
        if body["gyms"]:
            assert any(g.get("primary") for g in body["gyms"]), "primary not reassigned"


# ---------- (i) Journey objectives ----------
class TestJourneyObjectives:
    def test_journey_nodes_have_objectives(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/journey", headers=owner_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        nodes = body.get("nodes") or []
        assert isinstance(nodes, list) and len(nodes) > 0
        # Every node should have objectives + flavor + global_percent
        missing = []
        for n in nodes:
            if "objectives" not in n or "flavor" not in n or "global_percent" not in n:
                missing.append(n.get("id") or n.get("node_id") or "?")
        assert not missing, f"nodes missing objectives/flavor/global_percent: {missing[:5]}"
        # Objectives must be a list
        assert isinstance(nodes[0]["objectives"], list)


# ---------- (j) Admin purge preview ----------
class TestAdminPurge:
    def test_purge_preview_shape(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/admin/purge-preview", headers=owner_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("bots", "test_users", "test_clans", "test_gyms"):
            assert k in body, f"missing key {k}"
            assert isinstance(body[k], int)


# ---------- (k) Admin members full_name field ----------
class TestAdminMembers:
    def test_members_has_full_name(self, owner_headers):
        r = requests.get(f"{BASE_URL}/api/admin/members", headers=owner_headers, timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list), f"expected list, got {type(rows).__name__}: {rows}"
        if rows:
            # Every row should have a full_name key (possibly empty for old users)
            for row in rows:
                assert "full_name" in row, f"row missing full_name: {row.get('user_id')}"
