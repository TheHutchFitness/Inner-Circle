"""E2E smoke test: verification (phone mock + email send), chat media upload/fetch, room access."""
import io, os, sys, requests

BASE = "https://powerup-arena.preview.emergentagent.com/api"

def main():
    s = requests.Session()
    # login as elite test user
    r = s.post(f"{BASE}/auth/login", json={"email": "elite@test.com", "password": "TestPass123!"})
    assert r.ok, f"login failed {r.status_code} {r.text}"
    tok = r.json()["session_token"]
    H = {"Authorization": f"Bearer {tok}"}

    # 1. upload should be blocked before verification
    png = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000 1f15c4890000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082".replace(" ", ""))
    r = s.post(f"{BASE}/chat/upload", headers=H, files={"file": ("t.png", io.BytesIO(png), "image/png")})
    assert r.status_code == 403, f"expected 403 pre-verification, got {r.status_code} {r.text}"
    print("PASS: upload gated pre-verification")

    # 2. phone verification (mock)
    r = s.post(f"{BASE}/verify/phone/send", headers=H, json={"phone": "+1 555 000 1234"})
    assert r.ok, f"phone send failed {r.text}"
    body = r.json()
    assert body.get("mock") and body.get("code"), f"mock code missing: {body}"
    code = body["code"]
    print(f"PASS: phone mock code returned ({code})")

    # wrong code rejected
    bad = "000000" if code != "000000" else "111111"
    r = s.post(f"{BASE}/verify/phone/confirm", headers=H, json={"code": bad})
    assert r.status_code == 400, f"expected 400 wrong code, got {r.status_code}"
    r = s.post(f"{BASE}/verify/phone/confirm", headers=H, json={"code": code})
    assert r.ok, f"phone confirm failed {r.text}"
    assert r.json().get("phone_verified") is True
    print("PASS: phone verified")

    # 3. upload now works
    r = s.post(f"{BASE}/chat/upload", headers=H, files={"file": ("t.png", io.BytesIO(png), "image/png")})
    assert r.ok, f"upload failed {r.status_code} {r.text}"
    media_id = r.json()["media_id"]
    assert r.json()["media_type"] == "image"
    print(f"PASS: image uploaded ({media_id})")

    # reject non-media
    r = s.post(f"{BASE}/chat/upload", headers=H, files={"file": ("t.txt", io.BytesIO(b"hello"), "text/plain")})
    assert r.status_code == 400, f"expected 400 for txt, got {r.status_code}"
    print("PASS: non-media rejected")

    # 4. post message with media to main + the_room (elite user)
    for room in ("main", "the_room"):
        r = s.post(f"{BASE}/chat/upload", headers=H, files={"file": ("t.png", io.BytesIO(png), "image/png")})
        mid = r.json()["media_id"]
        r = s.post(f"{BASE}/chat/{room}/messages", headers=H, json={"text": f"media test {room}", "media_id": mid})
        assert r.ok, f"post to {room} failed {r.text}"
        assert r.json()["media_id"] == mid and r.json()["media_type"] == "image"
        # appears in feed
        r = s.get(f"{BASE}/chat/{room}/messages", headers=H)
        assert any(m.get("media_id") == mid for m in r.json()), f"media msg missing in {room}"
    print("PASS: media messages posted to main + the_room")

    # empty message rejected
    r = s.post(f"{BASE}/chat/main/messages", headers=H, json={"text": "  "})
    assert r.status_code == 400, f"expected 400 empty msg, got {r.status_code}"
    print("PASS: empty message rejected")

    # 5. fetch media via header auth and query token
    r = s.get(f"{BASE}/chat/media/{media_id}", headers=H)
    assert r.ok and r.headers["content-type"].startswith("image/png") and r.content == png, "header fetch failed"
    r = s.get(f"{BASE}/chat/media/{media_id}?token={tok}")
    assert r.ok and r.content == png, "query-token fetch failed"
    r = s.get(f"{BASE}/chat/media/{media_id}")
    assert r.status_code == 401, "unauthenticated fetch should 401"
    print("PASS: media fetch (header + query token, 401 unauth)")

    # 6. email verification send (real Resend send)
    r = s.post(f"{BASE}/verify/email/send", headers=H)
    assert r.ok, f"email send failed {r.status_code} {r.text}"
    print(f"PASS: email code sent to {r.json()['email']}")
    # rate limit on immediate resend
    r = s.post(f"{BASE}/verify/email/send", headers=H)
    assert r.status_code == 429, f"expected 429 rate limit, got {r.status_code}"
    print("PASS: email resend rate-limited")

    # 7. owner account full access flag
    import subprocess
    out = subprocess.run(["mongosh", "--quiet", "hutchs_inner_circle", "--eval",
                          "db.users.findOne({email:'the9hutch@gmail.com'},{_id:0,all_rooms_access:1}).all_rooms_access"],
                         capture_output=True, text=True).stdout.strip()
    assert out == "true", f"owner flag missing: {out}"
    print("PASS: owner all_rooms_access flag set")

    print("\nALL BACKEND SMOKE TESTS PASSED")

if __name__ == "__main__":
    main()
