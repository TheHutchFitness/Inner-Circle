"""Iteration 28 — re-verify the is_creator fix on /api/auth/me and /api/profile/me.

Spec: is_creator must be True when any of social_tiktok / social_instagram / social_youtube
is set. Previous iteration_27 reported this missing on the two 'me' endpoints; fix should
now be in routes/auth.py & routes/profile.py.
"""
import os
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

OWNER_EMAIL = "the9hutch@gmail.com"
OWNER_PASS = "Hutch-TWVmifIRhU6u8bBl"
BOT_EMAIL = "bot1@circle.ai"   # fresh bot, no socials
BOT_PASS = "BotPass123!"


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASS}, timeout=15)
    assert r.status_code == 200, f"owner login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def bot_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": BOT_EMAIL, "password": BOT_PASS}, timeout=15)
    assert r.status_code == 200, f"bot login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


# ---------- Owner (has socials) => is_creator True ----------

class TestOwnerIsCreator:
    def _ensure_owner_has_socials(self, tok):
        # Ensure at least social_youtube is set so owner should be a creator.
        me = requests.get(f"{BASE}/api/auth/me", headers=H(tok), timeout=15).json()
        has_any = bool(me.get("social_tiktok") or me.get("social_instagram") or me.get("social_youtube"))
        if not has_any:
            r = requests.patch(f"{BASE}/api/profile/update",
                               headers=H(tok),
                               json={"social_youtube": "hutch"}, timeout=15)
            assert r.status_code == 200, r.text

    def test_auth_me_has_is_creator_true(self, owner_token):
        self._ensure_owner_has_socials(owner_token)
        r = requests.get(f"{BASE}/api/auth/me", headers=H(owner_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "is_creator" in body, f"is_creator key missing on /auth/me for owner. keys={list(body.keys())[:20]}"
        assert body["is_creator"] is True, f"Owner has socials but is_creator={body.get('is_creator')} (socials: tt={body.get('social_tiktok')!r}, ig={body.get('social_instagram')!r}, yt={body.get('social_youtube')!r})"

    def test_profile_me_has_is_creator_true(self, owner_token):
        self._ensure_owner_has_socials(owner_token)
        r = requests.get(f"{BASE}/api/profile/me", headers=H(owner_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "is_creator" in body, f"is_creator key missing on /profile/me for owner. keys={list(body.keys())[:20]}"
        assert body["is_creator"] is True


# ---------- Bot (no socials) => is_creator False ----------

class TestBotNotCreator:
    def _clear_bot_socials(self, tok):
        r = requests.patch(f"{BASE}/api/profile/update",
                           headers=H(tok),
                           json={"social_tiktok": "", "social_instagram": "", "social_youtube": ""},
                           timeout=15)
        assert r.status_code == 200, r.text

    def test_auth_me_is_creator_false(self, bot_token):
        self._clear_bot_socials(bot_token)
        r = requests.get(f"{BASE}/api/auth/me", headers=H(bot_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "is_creator" in body, "is_creator key missing on /auth/me for bot"
        assert body["is_creator"] is False, f"Bot has no socials but is_creator={body.get('is_creator')}"

    def test_profile_me_is_creator_false(self, bot_token):
        self._clear_bot_socials(bot_token)
        r = requests.get(f"{BASE}/api/profile/me", headers=H(bot_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "is_creator" in body
        assert body["is_creator"] is False


# ---------- Toggle transitions ----------

class TestToggleIsCreator:
    def test_bot_becomes_creator_after_setting_tiktok(self, bot_token):
        # start clean
        requests.patch(f"{BASE}/api/profile/update", headers=H(bot_token),
                       json={"social_tiktok": "", "social_instagram": "", "social_youtube": ""}, timeout=15)
        # set TikTok as full URL to also confirm normalization is fine end-to-end
        r = requests.patch(f"{BASE}/api/profile/update", headers=H(bot_token),
                           json={"social_tiktok": "https://www.tiktok.com/@testcreator"}, timeout=15)
        assert r.status_code == 200, r.text
        me = requests.get(f"{BASE}/api/auth/me", headers=H(bot_token), timeout=15).json()
        assert me.get("social_tiktok") == "testcreator", f"normalize failed, got {me.get('social_tiktok')!r}"
        assert me.get("is_creator") is True

        pme = requests.get(f"{BASE}/api/profile/me", headers=H(bot_token), timeout=15).json()
        assert pme.get("is_creator") is True

    def test_bot_reverts_to_non_creator_when_cleared(self, bot_token):
        r = requests.patch(f"{BASE}/api/profile/update", headers=H(bot_token),
                           json={"social_tiktok": "", "social_instagram": "", "social_youtube": ""}, timeout=15)
        assert r.status_code == 200, r.text
        me = requests.get(f"{BASE}/api/auth/me", headers=H(bot_token), timeout=15).json()
        assert me.get("is_creator") is False
        pme = requests.get(f"{BASE}/api/profile/me", headers=H(bot_token), timeout=15).json()
        assert pme.get("is_creator") is False
