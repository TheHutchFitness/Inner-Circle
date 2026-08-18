"""Smoke test: templates change, monthly programs, personal goal quests, workout source tagging."""
import requests, subprocess

BASE = "https://powerup-arena.preview.emergentagent.com/api"

def main():
    r = requests.post(f"{BASE}/auth/login", json={"email": "elite@test.com", "password": "TestPass123!"})
    tok = r.json()["session_token"]
    H = {"Authorization": f"Bearer {tok}"}

    # 1. templates: no arnold, has arms/core/back
    tpls = requests.get(f"{BASE}/workout/templates", headers=H).json()
    ids = [t["id"] for t in tpls]
    assert "arnold" not in ids, ids
    for want in ("arms", "core", "back"):
        assert want in ids, f"missing {want}: {ids}"
    print("PASS: templates — arnold removed, arms/core/back added")

    # 2. monthly program generate + current
    r = requests.post(f"{BASE}/programs/monthly/generate", headers=H, json={"split": "ppl"})
    assert r.ok, r.text
    prog = r.json()
    assert len(prog["days"]) == 28 and prog["days"][0]["template_id"] == "push"
    assert prog["days"][6]["template_id"] == "rest"
    r = requests.get(f"{BASE}/programs/monthly/current", headers=H)
    cur = r.json()
    assert cur["active"] and cur["today"]["day"] == 1 and cur["today"]["name"] == "Push"
    assert len(cur["today"]["exercises"]) > 0
    print("PASS: monthly generate + current (today = Push, 28 days)")

    # invalid split
    r = requests.post(f"{BASE}/programs/monthly/generate", headers=H, json={"split": "nope"})
    assert r.status_code == 400
    print("PASS: invalid split rejected")

    # 3. log workout with monthly source -> completed_days ticks + history has source
    r = requests.post(f"{BASE}/workouts/log", headers=H, json={
        "workout_name": "Push", "split_type": "push",
        "exercises": [{"name": "Barbell Bench Press", "sets": [{"reps": 5, "weight_lb": 225, "rpe": 8}]}],
        "source": "monthly", "monthly_day": 1,
    })
    assert r.ok, r.text
    cur = requests.get(f"{BASE}/programs/monthly/current", headers=H).json()
    assert 1 in cur["completed_days"], cur["completed_days"]
    hist = requests.get(f"{BASE}/workouts/history", headers=H).json()
    assert hist[0].get("source") == "monthly"
    print("PASS: monthly workout logged, day ticked, source in history")

    # ai source too
    r = requests.post(f"{BASE}/workouts/log", headers=H, json={
        "workout_name": "AI Push Day", "split_type": "custom",
        "exercises": [{"name": "Overhead Press", "sets": [{"reps": 5, "weight_lb": 135, "rpe": 7}]}],
        "source": "ai",
    })
    assert r.ok
    hist = requests.get(f"{BASE}/workouts/history", headers=H).json()
    assert hist[0].get("source") == "ai"
    print("PASS: AI workout stored in history with source tag")

    # 4. cancel program
    r = requests.delete(f"{BASE}/programs/monthly/current", headers=H)
    assert not requests.get(f"{BASE}/programs/monthly/current", headers=H).json()["active"]
    print("PASS: monthly program cancel")

    # 5. personal quests: needs_setup then AI generation
    p = requests.get(f"{BASE}/quests/personal", headers=H).json()
    print(f"needs_setup={p['needs_setup']} (existing quests: {len(p['quests'])})")
    r = requests.post(f"{BASE}/quests/goals", headers=H,
                      json={"goals": "Lose 5 lb and sign up for my first powerlifting meet"}, timeout=90)
    assert r.ok, r.text
    quests = r.json()["quests"]
    assert 4 <= len(quests) <= 6, len(quests)
    for q in quests:
        assert q["title"] and q["description"] and 50 <= q["xp"] <= 500 and q["status"] == "active"
    print(f"PASS: AI curated {len(quests)} personal quests:")
    for q in quests:
        print(f"   - {q['title']} ({q['xp']} XP, {q['timeframe']})")

    p = requests.get(f"{BASE}/quests/personal", headers=H).json()
    assert p["needs_setup"] is False and len([q for q in p["quests"] if q["status"] == "active"]) == len(quests)

    # 6. complete one -> xp awarded
    me_before = requests.get(f"{BASE}/auth/me", headers=H).json()["xp"]
    q0 = quests[0]
    r = requests.post(f"{BASE}/quests/personal/complete", headers=H, json={"quest_id": q0["quest_id"]})
    assert r.ok and r.json()["xp_gained"] == q0["xp"]
    me_after = requests.get(f"{BASE}/auth/me", headers=H).json()["xp"]
    assert me_after == me_before + q0["xp"], (me_before, me_after, q0["xp"])
    # double complete blocked
    r = requests.post(f"{BASE}/quests/personal/complete", headers=H, json={"quest_id": q0["quest_id"]})
    assert r.status_code == 404
    print("PASS: personal quest complete awards XP once")

    print("\nALL NEW-FEATURE SMOKE TESTS PASSED")

if __name__ == "__main__":
    main()
