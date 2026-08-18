"""Tests for sprint, steps, heart-rate, active-count, attributes, bots (iteration 9)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ATHLETE = {"email": "athlete@test.com", "password": "TestPass123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def _register():
    email = f"new_{uuid.uuid4().hex[:10]}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "display_name": "New"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"], email


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Sprint ---
class TestSprint:
    def test_sprint_log_first_is_best_awards_xp(self):
        tok, _ = _register()
        pre = requests.get(f"{API}/auth/me", headers=h(tok), timeout=15).json()
        r = requests.post(f"{API}/sprint/log", json={"sprint_type": "40yd", "seconds": 5.10}, headers=h(tok), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_best"] is True
        assert data["best"] == 5.10
        post = requests.get(f"{API}/auth/me", headers=h(tok), timeout=15).json()
        assert post["xp"] == pre["xp"] + 40, f"expected +40 XP, got pre={pre['xp']} post={post['xp']}"

    def test_sprint_slower_not_best_no_xp(self):
        tok, _ = _register()
        # First (best)
        requests.post(f"{API}/sprint/log", json={"sprint_type": "40yd", "seconds": 4.90}, headers=h(tok), timeout=15)
        pre = requests.get(f"{API}/auth/me", headers=h(tok), timeout=15).json()
        # Slower run
        r = requests.post(f"{API}/sprint/log", json={"sprint_type": "40yd", "seconds": 5.50}, headers=h(tok), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["is_best"] is False
        assert data["best"] == 4.90
        post = requests.get(f"{API}/auth/me", headers=h(tok), timeout=15).json()
        assert post["xp"] == pre["xp"], "XP should not change on non-PR sprint"

    def test_sprint_faster_new_best_awards_xp(self):
        tok, _ = _register()
        requests.post(f"{API}/sprint/log", json={"sprint_type": "100m", "seconds": 13.5}, headers=h(tok), timeout=15)
        pre = requests.get(f"{API}/auth/me", headers=h(tok), timeout=15).json()
        r = requests.post(f"{API}/sprint/log", json={"sprint_type": "100m", "seconds": 12.9}, headers=h(tok), timeout=15)
        assert r.json()["is_best"] is True
        assert r.json()["best"] == 12.9
        post = requests.get(f"{API}/auth/me", headers=h(tok), timeout=15).json()
        assert post["xp"] == pre["xp"] + 40

    def test_sprint_me(self):
        tok, _ = _register()
        requests.post(f"{API}/sprint/log", json={"sprint_type": "40yd", "seconds": 4.8}, headers=h(tok), timeout=15)
        requests.post(f"{API}/sprint/log", json={"sprint_type": "100m", "seconds": 12.0}, headers=h(tok), timeout=15)
        r = requests.get(f"{API}/sprint/me", headers=h(tok), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["sprints"]["40yd"] == 4.8
        assert data["sprints"]["100m"] == 12.0


# --- Steps ---
class TestSteps:
    def test_steps_log_and_today(self):
        tok, _ = _register()
        r = requests.post(f"{API}/steps/log", json={"steps": 7500}, headers=h(tok), timeout=15)
        assert r.status_code == 200
        assert r.json()["steps"] == 7500
        g = requests.get(f"{API}/steps/today", headers=h(tok), timeout=15)
        assert g.status_code == 200
        d = g.json()
        assert d["steps"] == 7500
        assert d["goal"] == 10000

    def test_steps_log_upsert(self):
        tok, _ = _register()
        requests.post(f"{API}/steps/log", json={"steps": 3000}, headers=h(tok), timeout=15)
        requests.post(f"{API}/steps/log", json={"steps": 9000}, headers=h(tok), timeout=15)
        d = requests.get(f"{API}/steps/today", headers=h(tok), timeout=15).json()
        assert d["steps"] == 9000, "steps should upsert to latest value"


# --- Heart rate ---
class TestHeartRate:
    def test_hr_log_and_today(self):
        tok, _ = _register()
        r = requests.post(f"{API}/heart-rate/log",
                          json={"resting_bpm": 55, "avg_bpm": 132, "max_bpm": 178},
                          headers=h(tok), timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{API}/heart-rate/today", headers=h(tok), timeout=15)
        assert g.status_code == 200
        d = g.json()
        assert d["resting_bpm"] == 55
        assert d["avg_bpm"] == 132
        assert d["max_bpm"] == 178

    def test_hr_partial(self):
        tok, _ = _register()
        r = requests.post(f"{API}/heart-rate/log", json={"resting_bpm": 60},
                          headers=h(tok), timeout=15)
        assert r.status_code == 200
        d = requests.get(f"{API}/heart-rate/today", headers=h(tok), timeout=15).json()
        assert d["resting_bpm"] == 60

    def test_hr_empty_rejected(self):
        tok, _ = _register()
        r = requests.post(f"{API}/heart-rate/log", json={}, headers=h(tok), timeout=15)
        assert r.status_code == 400


# --- Active count ---
class TestActiveCount:
    def test_active_count_min_10(self):
        tok = _login(ATHLETE)
        r = requests.get(f"{API}/active-count", headers=h(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "active" in d
        assert d["active"] >= 10


# --- Attributes: SPEED / ENDURANCE integration ---
class TestAttributes:
    def test_speed_increases_after_fast_sprint(self):
        tok, _ = _register()
        pre = requests.get(f"{API}/profile/attributes", headers=h(tok), timeout=15).json()
        pre_speed = pre["stats"]["speed"]
        # Fast 40yd
        requests.post(f"{API}/sprint/log", json={"sprint_type": "40yd", "seconds": 4.4}, headers=h(tok), timeout=15)
        requests.post(f"{API}/sprint/log", json={"sprint_type": "100m", "seconds": 11.5}, headers=h(tok), timeout=15)
        post = requests.get(f"{API}/profile/attributes", headers=h(tok), timeout=15).json()
        assert post["stats"]["speed"] > pre_speed, f"speed did not increase: pre={pre_speed} post={post['stats']['speed']}"

    def test_endurance_increases_after_steps_and_cardio(self):
        tok, _ = _register()
        pre = requests.get(f"{API}/profile/attributes", headers=h(tok), timeout=15).json()
        pre_end = pre["stats"]["endurance"]
        # Steps to raise avg_steps
        requests.post(f"{API}/steps/log", json={"steps": 15000}, headers=h(tok), timeout=15)
        # Cardio 10km run
        requests.post(f"{API}/cardio/log",
                      json={"activity_type": "run", "distance_km": 10.0, "duration_s": 3000},
                      headers=h(tok), timeout=15)
        post = requests.get(f"{API}/profile/attributes", headers=h(tok), timeout=15).json()
        assert post["stats"]["endurance"] > pre_end, f"endurance did not increase: pre={pre_end} post={post['stats']['endurance']}"


# --- Bots on leaderboards ---
class TestBots:
    EXPECTED_BOTS = {"Apex Prime", "Overkill", "Bastion", "Nightfall", "Colossus",
                     "Vanguard", "Warhound", "Gravitas", "Iron Sentinel", "Plate Prophet"}

    @pytest.mark.parametrize("board", ["strength", "xp", "ratio"])
    def test_leaderboard_includes_bots(self, board):
        tok = _login(ATHLETE)
        r = requests.get(f"{API}/leaderboard/{board}", headers=h(tok), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 10, f"expected >=10 rows on {board}, got {len(rows)}"
        names = {row.get("display_name") for row in rows}
        missing = self.EXPECTED_BOTS - names
        assert not missing, f"missing bots on {board}: {missing}"

    def test_cardio_leaderboard_run_includes_bots(self):
        tok = _login(ATHLETE)
        r = requests.get(f"{API}/cardio/leaderboard?board=overall&activity=run",
                         headers=h(tok), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        names = {row.get("display_name") for row in rows}
        # At least some bots have runs seeded
        seeded_run_bots = {"Plate Prophet", "Gravitas", "Warhound", "Vanguard",
                           "Nightfall", "Bastion", "Overkill", "Apex Prime"}
        overlap = seeded_run_bots & names
        assert len(overlap) >= 5, f"expected >=5 run bots, found: {overlap}"

    def test_cardio_leaderboard_bike_includes_bots(self):
        tok = _login(ATHLETE)
        r = requests.get(f"{API}/cardio/leaderboard?board=overall&activity=bike",
                         headers=h(tok), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        names = {row.get("display_name") for row in rows}
        seeded_bike_bots = {"Iron Sentinel", "Warhound", "Colossus", "Bastion", "Apex Prime"}
        overlap = seeded_bike_bots & names
        assert len(overlap) >= 3, f"expected >=3 bike bots, found: {overlap}"
