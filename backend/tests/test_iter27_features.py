"""Iteration 27 backend test suite.

Feature coverage:
  1. Group Leveling meta (level/color/badge/title/xp_into_level/xp_for_next/next_tier)
  2. Group (Clan) Challenges — GET /api/group-challenge + admin start/finalize + 403 boundaries
  3. Verified Gyms — admin toggle verify + public directory + profile/gym-rank surface
  4. Gym Logos — admin multipart upload + rejection of non-image content types
  5. YouTube social link — PATCH normalization + surfaced in /profile/me and /users/{id}/public
  6. Exercise Library additions + instant demo (no image generation for members)
  7. Enhanced PED library — ~39 entries with the new steroids/peptides
"""
import io
import os
import time
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")

OWNER_EMAIL = "the9hutch@gmail.com"
OWNER_PASS = "Hutch-TWVmifIRhU6u8bBl"
BOT_EMAIL = "bot1@circle.ai"
BOT_PASS = "BotPass123!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"].get("is_admin") is True
    return body["session_token"]


@pytest.fixture(scope="session")
def bot_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": BOT_EMAIL, "password": BOT_PASS}, timeout=15)
    assert r.status_code == 200, f"Bot login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"].get("is_admin") is not True
    return body["session_token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- 1. Group Leveling ----------
class TestGroupLeveling:
    def test_list_groups_meta_fields(self, bot_token):
        r = requests.get(f"{BASE}/api/groups", headers=H(bot_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "groups" in body
        assert isinstance(body["groups"], list) and len(body["groups"]) >= 1
        g0 = body["groups"][0]
        # All new meta fields present
        for k in ("level", "color", "badge", "title", "xp_into_level", "xp_for_next", "next_tier"):
            assert k in g0, f"missing key {k} in group brief: {g0}"
        assert "champion_title" in g0
        # Level math: level = xp//1000 + 1
        assert g0["level"] == (int(g0["xp"]) // 1000) + 1
        assert g0["xp_for_next"] == 1000
        assert g0["xp_into_level"] == int(g0["xp"]) % 1000
        # next_tier is either None or has level/color/badge/title
        if g0["next_tier"]:
            for k in ("level", "color", "badge", "title"):
                assert k in g0["next_tier"]

    def test_group_detail_meta_fields(self, bot_token):
        r = requests.get(f"{BASE}/api/groups", headers=H(bot_token), timeout=15)
        gid = r.json()["groups"][0]["id"]
        r2 = requests.get(f"{BASE}/api/groups/{gid}", headers=H(bot_token), timeout=15)
        assert r2.status_code == 200, r2.text
        g = r2.json()
        for k in ("level", "color", "badge", "title", "xp_into_level", "xp_for_next", "next_tier", "champion_title", "members"):
            assert k in g


# ---------- 2. Group Challenges ----------
class TestGroupChallenges:
    def test_group_challenge_shape(self, bot_token):
        r = requests.get(f"{BASE}/api/group-challenge", headers=H(bot_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("active", "standings", "last", "is_admin", "my_group_ids"):
            assert k in body, f"missing {k}: {body}"
        assert body["is_admin"] is False
        assert isinstance(body["standings"], list)
        assert isinstance(body["my_group_ids"], list)

    def test_group_challenge_admin_flag(self, admin_token):
        r = requests.get(f"{BASE}/api/group-challenge", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["is_admin"] is True

    def test_non_admin_cannot_start(self, bot_token):
        r = requests.post(
            f"{BASE}/api/admin/group-challenge/start",
            headers=H(bot_token),
            json={"title": "Hack Attempt", "days": 3},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_non_admin_cannot_finalize(self, bot_token):
        r = requests.post(f"{BASE}/api/admin/group-challenge/finalize", headers=H(bot_token), timeout=15)
        assert r.status_code == 403

    def test_admin_start_rejects_if_active(self, admin_token):
        # Main agent already left one active challenge. Starting another must fail 400 (or 409).
        r = requests.post(
            f"{BASE}/api/admin/group-challenge/start",
            headers=H(admin_token),
            json={"title": "Should Fail", "days": 5},
            timeout=15,
        )
        # Feature spec allows 400 or 409
        assert r.status_code in (400, 409), f"expected 400/409, got {r.status_code} {r.text}"


# ---------- 3 & 4. Verified Gyms + Gym Logos ----------
class TestGymsVerifyAndLogo:
    @pytest.fixture(scope="class")
    def gym_id_and_name(self, admin_token):
        # Ensure a TEST_ gym exists
        name = "TEST_Verified_Gym_iter27"
        requests.post(f"{BASE}/api/admin/gyms", headers=H(admin_token), json={"name": name}, timeout=15)
        r = requests.get(f"{BASE}/api/admin/gyms", headers=H(admin_token), timeout=15)
        assert r.status_code == 200
        row = next((g for g in r.json()["gyms"] if g["name"] == name), None)
        assert row and row.get("id"), f"gym not created: {r.text}"
        yield row["id"], name
        # cleanup
        requests.delete(f"{BASE}/api/admin/gyms/{row['id']}", headers=H(admin_token), timeout=15)

    def test_verify_toggle_on(self, admin_token, gym_id_and_name):
        gid, name = gym_id_and_name
        r = requests.post(f"{BASE}/api/admin/gyms/{gid}/verify", headers=H(admin_token), json={"on": True}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("verified") is True
        # confirm public /api/gyms surfaces the flag
        r2 = requests.get(f"{BASE}/api/gyms", timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert name in d["gyms"]
        rec = next((x for x in d["directory"] if x["name"] == name), None)
        assert rec and rec["verified"] is True

    def test_verify_toggle_off(self, admin_token, gym_id_and_name):
        gid, name = gym_id_and_name
        r = requests.post(f"{BASE}/api/admin/gyms/{gid}/verify", headers=H(admin_token), json={"on": False}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("verified") is False
        r2 = requests.get(f"{BASE}/api/gyms", timeout=15)
        rec = next((x for x in r2.json()["directory"] if x["name"] == name), None)
        assert rec and rec["verified"] is False

    def test_non_admin_cannot_verify(self, bot_token, gym_id_and_name):
        gid, _ = gym_id_and_name
        r = requests.post(f"{BASE}/api/admin/gyms/{gid}/verify", headers=H(bot_token), json={"on": True}, timeout=15)
        assert r.status_code == 403

    def test_logo_upload_rejects_non_image(self, admin_token, gym_id_and_name):
        gid, _ = gym_id_and_name
        files = {"file": ("evil.txt", io.BytesIO(b"not an image"), "text/plain")}
        r = requests.post(f"{BASE}/api/admin/gyms/{gid}/logo", headers=H(admin_token), files=files, timeout=20)
        assert r.status_code == 400, f"expected 400 for non-image, got {r.status_code} {r.text}"

    def test_logo_upload_accepts_png(self, admin_token, gym_id_and_name):
        gid, name = gym_id_and_name
        # minimal valid 1x1 PNG
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00"
            b"\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        files = {"file": ("logo.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE}/api/admin/gyms/{gid}/logo", headers=H(admin_token), files=files, timeout=30)
        assert r.status_code == 200, f"logo upload failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("logo_media_id")
        media_id = body["logo_media_id"]
        # surfaces in /api/gyms directory
        r2 = requests.get(f"{BASE}/api/gyms", timeout=15)
        rec = next((x for x in r2.json()["directory"] if x["name"] == name), None)
        assert rec and rec.get("logo_media_id") == media_id, f"logo not in directory: {rec}"

    def test_non_admin_cannot_upload_logo(self, bot_token, gym_id_and_name):
        gid, _ = gym_id_and_name
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
        files = {"file": ("logo.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{BASE}/api/admin/gyms/{gid}/logo", headers=H(bot_token), files=files, timeout=20)
        assert r.status_code == 403


# ---------- 3b. Profile gym-rank surfaces verified + logo ----------
class TestProfileGymRank:
    def test_profile_gym_rank_shape(self, admin_token):
        r = requests.get(f"{BASE}/api/profile/gym-rank", headers=H(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("gym", "rank", "members", "big4", "gym_logo", "gym_verified"):
            assert k in body, f"missing {k} in gym-rank: {body}"
        assert isinstance(body["gym_verified"], bool)


# ---------- 5. YouTube social link ----------
class TestSocialYouTube:
    def test_patch_and_normalize_full_url(self, bot_token):
        # full URL should normalize to a bare handle
        r = requests.patch(
            f"{BASE}/api/profile/update",
            headers=H(bot_token),
            json={"social_youtube": "https://www.youtube.com/@TestHandle"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # confirm normalized to bare "TestHandle" (no leading @, no URL)
        r2 = requests.get(f"{BASE}/api/profile/me", headers=H(bot_token), timeout=15)
        assert r2.status_code == 200
        me = r2.json()
        assert me.get("social_youtube") == "TestHandle", f"expected TestHandle, got {me.get('social_youtube')!r}"
        assert me.get("is_creator") is True

    def test_patch_handle_form(self, bot_token):
        r = requests.patch(
            f"{BASE}/api/profile/update",
            headers=H(bot_token),
            json={"social_youtube": "@HandleTwo"},
            timeout=15,
        )
        assert r.status_code == 200
        me = requests.get(f"{BASE}/api/profile/me", headers=H(bot_token), timeout=15).json()
        assert me.get("social_youtube") == "HandleTwo"
        assert me.get("is_creator") is True

    def test_public_endpoint_exposes_youtube(self, bot_token):
        me = requests.get(f"{BASE}/api/profile/me", headers=H(bot_token), timeout=15).json()
        uid = me["user_id"]
        r = requests.get(f"{BASE}/api/users/{uid}/public", headers=H(bot_token), timeout=15)
        assert r.status_code == 200, r.text
        pub = r.json()
        assert pub.get("social_youtube") == "HandleTwo"
        assert pub.get("is_creator") is True

    def test_clearing_youtube_updates_is_creator(self, bot_token):
        # Only clear if no other social handles are set. Set to "" to clear.
        r = requests.patch(
            f"{BASE}/api/profile/update",
            headers=H(bot_token),
            json={"social_youtube": "", "social_tiktok": "", "social_instagram": ""},
            timeout=15,
        )
        assert r.status_code == 200
        me = requests.get(f"{BASE}/api/profile/me", headers=H(bot_token), timeout=15).json()
        assert me.get("social_youtube") in ("", None)
        assert me.get("is_creator") is False


# ---------- 6. Exercise Library + demo ----------
class TestExerciseLibrary:
    def test_library_has_new_categories(self, bot_token):
        r = requests.get(f"{BASE}/api/exercises", headers=H(bot_token), timeout=15)
        assert r.status_code == 200, r.text
        lib = r.json()["library"]
        assert isinstance(lib, list)
        # ~172 total (allow ±10 tolerance)
        assert 160 <= len(lib) <= 200, f"unexpected total: {len(lib)}"
        cats = {e["category"] for e in lib}
        for expected in ("Powerlifting", "Strongman", "Calisthenics", "CrossFit"):
            assert expected in cats, f"category missing: {expected}"

    def test_demo_returns_instantly_no_gen(self, bot_token):
        # Pick any name from library
        lib = requests.get(f"{BASE}/api/exercises", headers=H(bot_token), timeout=15).json()["library"]
        name = lib[0]["name"]
        t0 = time.time()
        r = requests.get(f"{BASE}/api/exercises/demo", headers=H(bot_token), params={"name": name}, timeout=15)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"demo returned {r.status_code} {r.text}"
        body = r.json()
        assert body["name"] == name
        assert "media_id" in body  # may be None
        # Must be near-instant — hard cap 3s (no on-demand image gen for members)
        assert elapsed < 3.0, f"demo took {elapsed:.2f}s — should be instant"


# ---------- 7. Enhanced PED library ----------
class TestEnhancedPEDs:
    def test_peds_count_and_new_entries(self, bot_token):
        r = requests.get(f"{BASE}/api/enhanced/peds", headers=H(bot_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "peds" in body and "disclaimer" in body
        peds = body["peds"]
        assert isinstance(peds, list)
        # ~39 total (allow ±6 tolerance)
        assert 33 <= len(peds) <= 50, f"unexpected PED count: {len(peds)}"
        # normalize names
        names_lc = " | ".join([str(p.get("name", "")).lower() for p in peds])
        for new_ped in ("masteron", "anadrol", "mk-677", "tesamorelin"):
            assert new_ped in names_lc, f"missing new PED: {new_ped} (got names: {names_lc[:400]})"
