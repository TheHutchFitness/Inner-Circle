# ruff: noqa: F403, F405
"""Device push-token registration relay (Emergent managed push service)."""
from shared import *  # noqa: F401,F403


class RegisterPushBody(BaseModel):
    platform: str  # "android" | "ios"
    device_token: str


@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user: dict = Depends(get_current_user)):
    # Bind the device token to the authenticated caller only (prevents BOLA:
    # a client can no longer register a device against an arbitrary user_id).
    payload = {"user_id": user["user_id"], "platform": body.platform, "device_token": body.device_token}
    resp = await _push_client.post("/api/v1/push/users/register", json=payload)
    if resp.status_code == 401:
        raise HTTPException(status_code=500, detail="EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail="Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}
