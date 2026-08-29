# The Circle

Gamified fitness app — RPG-style journey, physique judging, form/PR critique rooms,
multi-gym chat, nutrition & PED tracking, quests, cosmetics, and seasonal leaderboards.

**Stack:** Expo (React Native + RN Web) · FastAPI · MongoDB

## Structure
```
backend/    FastAPI app (routes/*.py, shared.py = models/helpers/seed, server.py)
frontend/   Expo Router app (app/ = screens, src/ = components + lib)
```

## Run locally
**Backend**
```bash
cd backend
pip install -r requirements.txt
# set backend/.env (see below), then:
uvicorn server:app --host 0.0.0.0 --port 8001
```
**Frontend**
```bash
cd frontend
yarn install
yarn expo start        # press w for web, or scan QR with Expo Go
```

## Environment
- `backend/.env` → `MONGO_URL`, `DB_NAME`, and integration keys (LLM, email, push,
  Twilio, Places, fal.ai, RevenueCat, Apple). See `PROJECT_HANDOFF_REFERENCE.md`.
- `frontend/.env` → `EXPO_PUBLIC_BACKEND_URL` (backend host; app appends `/api`).

## API
- Base URL: `<host>/api` — all routes are `/api/*`.
- Auth: `Authorization: Bearer <session_token>`.
- Sign-in methods: email/password, Emergent-managed Google OAuth, Apple Sign-In.
- Full endpoint list + data model: **`PROJECT_HANDOFF_REFERENCE.md`**.

## Notes
- Google auth, LLM, email, and push are **Emergent-managed** — swap in your own
  credentials if moving off the Emergent platform.
- AI features are gated by an admin toggle (`app_state.ai_gate`, off by default).
