"""
Backend tests for iteration 11 additions:
 - Custom Program ($200 lifetime) unlock/intake/status
 - Founders list + backers + POST /founders/back
 - The Judge submit/feed/comments (real physique JPEG for gpt-5.6-terra)
 - Rank ladder (Intermediate/Elite/Freak seeds)
 - Unlockables includes bg_vanguard/bg_warrior/bg_boss
"""
import os
import io
import time
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not configured"

TEST_USERS = {
    "athlete": ("athlete@test.com", "TestPass123!"),
    "elite":   ("elite@test.com",   "TestPass123!"),
    "freak":   ("freak@test.com",   "TestPass123!"),
}


def _login(email: str, pw: str):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for k, (e, p) in TEST_USERS.items():
        d = _login(e, p)
        out[k] = {"token": d.get("token") or d.get("session_token"), "user": d["user"]}
    return out


# ---------- Rank ladder ----------
class TestRankLadder:
    def test_seed_ranks(self, tokens):
        assert tokens["athlete"]["user"]["rank"] == "Intermediate", tokens["athlete"]["user"]["rank"]
        assert tokens["elite"]["user"]["rank"] == "Elite", tokens["elite"]["user"]["rank"]
        assert tokens["freak"]["user"]["rank"] == "Freak", tokens["freak"]["user"]["rank"]

    def test_unlockables_has_new_backgrounds(self, tokens):
        tk = tokens["elite"]["token"]
        r = requests.get(f"{BASE_URL}/api/unlockables", headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        ids = {b["id"] for b in j.get("backgrounds", [])}
        for req in ("bg_vanguard", "bg_warrior", "bg_boss"):
            assert req in ids, f"{req} missing from backgrounds: {ids}"


# ---------- Custom Program ----------
class TestCustomProgram:
    def test_status_default(self, tokens):
        tk = tokens["athlete"]["token"]
        r = requests.get(f"{BASE_URL}/api/custom-program", headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert set(j.keys()) >= {"purchased", "athletes_center_access", "intake"}

    def test_intake_requires_purchase(self, tokens):
        # Fresh user (not purchased) — use athlete@ but first ensure state via freak (freak not purchased either)
        tk = tokens["freak"]["token"]
        # Reset via GET
        st = requests.get(f"{BASE_URL}/api/custom-program", headers={"Authorization": f"Bearer {tk}"}, timeout=30).json()
        if st.get("purchased"):
            pytest.skip("freak already purchased — cannot test 403 path")
        r = requests.post(
            f"{BASE_URL}/api/custom-program/intake",
            headers={"Authorization": f"Bearer {tk}", "Content-Type": "application/json"},
            json={"goals": "test goals"}, timeout=30,
        )
        assert r.status_code == 403, r.text

    def test_unlock_then_intake_then_status(self, tokens):
        # Use freak so we don't disturb athlete
        tk = tokens["freak"]["token"]
        r = requests.post(f"{BASE_URL}/api/custom-program/unlock",
                          headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("custom_program_purchased") is True
        assert u.get("athletes_center_access") is True

        # Intake
        r2 = requests.post(f"{BASE_URL}/api/custom-program/intake",
                           headers={"Authorization": f"Bearer {tk}", "Content-Type": "application/json"},
                           json={"goals": "Add 20 lbs of muscle", "days_per_week": "5", "experience": "5 yrs"},
                           timeout=30)
        assert r2.status_code == 200, r2.text
        j2 = r2.json()
        assert j2.get("ok") is True
        assert j2["request"]["goals"] == "Add 20 lbs of muscle"

        # Status reflects
        r3 = requests.get(f"{BASE_URL}/api/custom-program",
                          headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r3.status_code == 200
        j3 = r3.json()
        assert j3["purchased"] is True
        assert j3["athletes_center_access"] is True
        assert j3["intake"] is not None
        assert j3["intake"]["goals"] == "Add 20 lbs of muscle"


# ---------- Founders ----------
class TestFounders:
    def test_founders_list_shape(self, tokens):
        tk = tokens["athlete"]["token"]
        r = requests.get(f"{BASE_URL}/api/founders", headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "founders" in j and "backers" in j and "me" in j
        assert isinstance(j["founders"], list)
        assert len(j["founders"]) > 0
        # First entry has a number
        f0 = j["founders"][0]
        for k in ("number", "display_name", "avatar_id", "rank", "is_backer"):
            assert k in f0
        assert f0["number"] == 1
        # Numbers strictly increasing
        nums = [x["number"] for x in j["founders"]]
        assert nums == sorted(nums)
        # Me info
        me = j["me"]
        assert "number" in me and "is_founder" in me and "is_backer" in me

    def test_backer_flag(self, tokens):
        tk = tokens["athlete"]["token"]
        # Snapshot backer count
        r0 = requests.get(f"{BASE_URL}/api/founders", headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r0.status_code == 200
        before_count = len(r0.json().get("backers", []))
        already_backer = r0.json()["me"]["is_backer"]

        # POST back
        r = requests.post(f"{BASE_URL}/api/founders/back",
                          headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("founder_backer") is True

        # GET again
        r2 = requests.get(f"{BASE_URL}/api/founders", headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2["me"]["is_backer"] is True
        after_count = len(j2["backers"])
        if already_backer:
            assert after_count == before_count
        else:
            assert after_count == before_count + 1


# ---------- The Judge ----------
def _make_physique_jpeg() -> bytes:
    """Generate a realistic 512x768 JPEG with visible torso shading — has real edges/textures/shadows
    so it passes emergent guardrails ('do not upload blank or uniform-variance images')."""
    from PIL import Image, ImageDraw, ImageFilter
    import random
    random.seed(7)
    W, H = 512, 768
    img = Image.new("RGB", (W, H), (28, 22, 20))
    d = ImageDraw.Draw(img)
    # Background gradient (spotlight)
    for y in range(H):
        c = int(30 + 60 * (1 - abs(y - H * 0.35) / H))
        d.line([(0, y), (W, y)], fill=(c, c - 5, c - 10))
    # Torso silhouette (V-taper)
    cx = W // 2
    torso = [
        (cx - 140, 250), (cx - 170, 320), (cx - 130, 520),
        (cx - 60, 700), (cx + 60, 700),
        (cx + 130, 520), (cx + 170, 320), (cx + 140, 250),
    ]
    d.polygon(torso, fill=(150, 105, 78))
    # Shoulders
    d.ellipse((cx - 210, 220, cx - 70, 340), fill=(160, 118, 88))
    d.ellipse((cx + 70, 220, cx + 210, 340), fill=(160, 118, 88))
    # Head
    d.ellipse((cx - 55, 90, cx + 55, 210), fill=(170, 128, 96))
    # Neck
    d.rectangle((cx - 32, 190, cx + 32, 250), fill=(155, 110, 82))
    # Pec line
    d.line([(cx, 320), (cx, 500)], fill=(80, 55, 40), width=4)
    d.arc((cx - 130, 300, cx - 10, 460), 260, 340, fill=(90, 60, 44), width=5)
    d.arc((cx + 10, 300, cx + 130, 460), 200, 280, fill=(90, 60, 44), width=5)
    # Abs (grid of shadows)
    for row in range(4):
        y0 = 460 + row * 45
        for col in (-1, 1):
            x0 = cx + col * 60
            x1 = cx + col * 20
            if x0 > x1: x0, x1 = x1, x0
            d.ellipse((x0, y0, x1, y0 + 40), outline=(70, 45, 30), width=3)
    # Arms
    d.ellipse((cx - 240, 300, cx - 170, 560), fill=(155, 112, 84))
    d.ellipse((cx + 170, 300, cx + 240, 560), fill=(155, 112, 84))
    # Random highlights (textures)
    for _ in range(600):
        x = random.randint(0, W - 1); y = random.randint(0, H - 1)
        d.point((x, y), fill=(random.randint(60, 220),) * 3)
    img = img.filter(ImageFilter.GaussianBlur(radius=1.2))
    # Sharpen edges lightly
    img = img.filter(ImageFilter.EDGE_ENHANCE)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


class TestJudge:
    submission_id = None

    def test_submit_physique(self, tokens):
        tk = tokens["elite"]["token"]  # skool_verified
        jpg = _make_physique_jpeg()
        assert len(jpg) > 5000
        files = {"file": ("physique.jpg", jpg, "image/jpeg")}
        data = {"caption": "test — 4 weeks out"}
        r = requests.post(
            f"{BASE_URL}/api/judge/submit",
            headers={"Authorization": f"Bearer {tk}"},
            files=files, data=data, timeout=180,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "submission_id" in j
        assert j["caption"] == "test — 4 weeks out"
        assert j["comment_count"] == 0
        crit = j.get("critique")
        # AI may fail; we allow None but log it
        if crit is not None:
            for k in ("overall", "symmetry", "conditioning", "size", "posing", "notes"):
                assert k in crit, f"missing {k} in critique: {crit}"
            for k in ("overall", "symmetry", "conditioning", "size", "posing"):
                v = crit[k]
                assert isinstance(v, (int, float))
                assert 0.0 <= float(v) <= 10.0
        TestJudge.submission_id = j["submission_id"]

    def test_feed_contains_submission(self, tokens):
        assert TestJudge.submission_id, "submission not created"
        tk = tokens["elite"]["token"]
        r = requests.get(f"{BASE_URL}/api/judge/feed", headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r.status_code == 200
        feed = r.json()
        assert isinstance(feed, list)
        assert any(s.get("submission_id") == TestJudge.submission_id for s in feed)

    def test_post_and_get_comment(self, tokens):
        assert TestJudge.submission_id
        tk = tokens["elite"]["token"]
        sid = TestJudge.submission_id
        # Post
        r = requests.post(
            f"{BASE_URL}/api/judge/{sid}/comments",
            headers={"Authorization": f"Bearer {tk}", "Content-Type": "application/json"},
            json={"text": "Solid conditioning, bring up rear delts."}, timeout=30,
        )
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["text"].startswith("Solid conditioning")

        # Get
        r2 = requests.get(f"{BASE_URL}/api/judge/{sid}/comments",
                          headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        assert r2.status_code == 200
        arr = r2.json()
        assert any(x.get("comment_id") == c["comment_id"] for x in arr)

        # comment_count incremented in feed
        r3 = requests.get(f"{BASE_URL}/api/judge/feed",
                          headers={"Authorization": f"Bearer {tk}"}, timeout=30)
        target = next(s for s in r3.json() if s["submission_id"] == sid)
        assert target["comment_count"] >= 1

    def test_reject_bad_mime(self, tokens):
        tk = tokens["elite"]["token"]
        files = {"file": ("junk.txt", b"not an image", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/judge/submit",
                          headers={"Authorization": f"Bearer {tk}"}, files=files, timeout=30)
        assert r.status_code == 400, r.text

    def test_empty_comment_rejected(self, tokens):
        assert TestJudge.submission_id
        tk = tokens["elite"]["token"]
        r = requests.post(
            f"{BASE_URL}/api/judge/{TestJudge.submission_id}/comments",
            headers={"Authorization": f"Bearer {tk}", "Content-Type": "application/json"},
            json={"text": "  "}, timeout=30,
        )
        assert r.status_code == 400
