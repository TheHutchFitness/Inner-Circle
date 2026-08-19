# ruff: noqa: F403, F405
"""Device push-token registration relay (Emergent managed push service)."""
from shared import *  # noqa: F401,F403


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await _push_client.post("/api/v1/push/users/register", json=body.dict())
    if resp.status_code == 401:
        raise HTTPException(status_code=500, detail="EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail="Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}
