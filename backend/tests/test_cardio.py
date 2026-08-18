"""Cardio endpoints tests: /api/cardio/log, /api/cardio/history, /api/cardio/leaderboard"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://powerup-arena.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ELITE = {"email": "elite@test.com", "password": "TestPass123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def auth_h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def elite_token():
    return _login(ELITE)


@pytest.fixture(scope="module")
def fresh_token():
    email = f"cardio_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "display_name": "Cardio"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


class TestCardioLog:
    def test_log_run_awards_xp_and_stores(self, elite_token):
        me_pre = requests.get(f"{API}/auth/me", headers=auth_h(elite_token), timeout=15).json()
        xp_pre = me_pre["xp"]
        payload = {
            "activity_type": "run",
            "distance_km": 5.2,
            "duration_s": 1560,  # 26 min
            "elevation_gain_m": 42.5,
            "temperature_c": 18.0,
            "avg_pace_min_km": 5.0,
            "route": [{"lat": 40.0, "lon": -74.0, "t": 0}, {"lat": 40.001, "lon": -74.001, "t": 60}],
        }
        r = requests.post(f"{API}/cardio/log", json=payload, headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "cardio" in body and "user" in body and "xp_gained" in body
        c = body["cardio"]
        assert c["activity_type"] == "run"
        assert c["distance_km"] == 5.2
        assert c["duration_s"] == 1560
        # avg_speed_kmh = 5.2 / (1560/3600) = 12.0
        assert abs(c["avg_speed_kmh"] - 12.0) < 0.05, f"speed wrong: {c['avg_speed_kmh']}"
        assert "cardio_id" in c
        assert "_id" not in c
        # XP: 30 + 5.2*10 = 82
        assert body["xp_gained"] == 82
        assert body["user"]["xp"] == xp_pre + 82

    def test_log_bike(self, elite_token):
        payload = {
            "activity_type": "bike",
            "distance_km": 12.0,
            "duration_s": 1800,  # 30 min
            "elevation_gain_m": 100.0,
            "temperature_c": 22.0,
            "avg_pace_min_km": 2.5,
            "route": [],
        }
        r = requests.post(f"{API}/cardio/log", json=payload, headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()["cardio"]
        assert c["activity_type"] == "bike"
        assert c["distance_km"] == 12.0
        # speed = 12 / 0.5 = 24 km/h
        assert abs(c["avg_speed_kmh"] - 24.0) < 0.05


class TestCardioHistory:
    def test_history_no_route(self, elite_token):
        r = requests.get(f"{API}/cardio/history", headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 2  # from previous tests
        # verify no route field in any row
        for row in rows:
            assert "route" not in row, f"route leaked in history: {row}"
            assert "_id" not in row
            assert "cardio_id" in row
            assert "activity_type" in row
            assert "distance_km" in row


class TestCardioLeaderboard:
    def test_overall_run(self, elite_token):
        r = requests.get(f"{API}/cardio/leaderboard", params={"board": "overall", "activity": "run"},
                         headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        # sorted desc by metric
        metrics = [row["metric"] for row in rows]
        assert metrics == sorted(metrics, reverse=True)
        top = rows[0]
        for key in ("display_name", "avatar_id", "metric", "metric_label"):
            assert key in top, f"missing {key}"
        assert "total" in top["metric_label"].lower()

    def test_single_run(self, elite_token):
        r = requests.get(f"{API}/cardio/leaderboard", params={"board": "single", "activity": "run"},
                         headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        metrics = [row["metric"] for row in rows]
        assert metrics == sorted(metrics, reverse=True)
        assert "single" in rows[0]["metric_label"].lower()

    def test_speed_run_dist_5_filters(self, fresh_token, elite_token):
        # Log a 3km run for a fresh user -> should NOT show in speed@5 board
        payload = {
            "activity_type": "run",
            "distance_km": 3.0,
            "duration_s": 900,  # 12 km/h
            "elevation_gain_m": 5,
            "temperature_c": 20,
        }
        r = requests.post(f"{API}/cardio/log", json=payload, headers=auth_h(fresh_token), timeout=15)
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/auth/me", headers=auth_h(fresh_token), timeout=15).json()
        fresh_user_id = me["user_id"]

        # Speed @ 5km -> fresh user's only 3km run should not qualify
        r5 = requests.get(f"{API}/cardio/leaderboard", params={"board": "speed", "activity": "run", "dist": 5},
                          headers=auth_h(elite_token), timeout=15)
        assert r5.status_code == 200
        rows5 = r5.json()
        uids5 = {row.get("user_id") for row in rows5}
        assert fresh_user_id not in uids5, f"3km user leaked into speed@5: {rows5}"

        # sorted desc (fastest first)
        metrics = [row["metric"] for row in rows5]
        assert metrics == sorted(metrics, reverse=True)
        for row in rows5:
            assert "5k+" in row["metric_label"] or "km/h" in row["metric_label"]

    def test_speed_run_dist_1_includes_short(self, fresh_token, elite_token):
        me = requests.get(f"{API}/auth/me", headers=auth_h(fresh_token), timeout=15).json()
        fresh_user_id = me["user_id"]
        r1 = requests.get(f"{API}/cardio/leaderboard", params={"board": "speed", "activity": "run", "dist": 1},
                          headers=auth_h(elite_token), timeout=15)
        assert r1.status_code == 200
        rows1 = r1.json()
        uids1 = {row.get("user_id") for row in rows1}
        assert fresh_user_id in uids1, "3km run should qualify for dist=1 speed board"

    def test_bike_boards(self, elite_token):
        r = requests.get(f"{API}/cardio/leaderboard", params={"board": "overall", "activity": "bike"},
                         headers=auth_h(elite_token), timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        assert rows[0]["metric"] > 0
