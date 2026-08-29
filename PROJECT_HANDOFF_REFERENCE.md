# The Circle — Project Reference (for migrating to a new project)

A gamified fitness app. Stack: **Expo (React Native + RN Web)** frontend, **FastAPI** backend, **MongoDB**.
This file is a carry-over reference to rebuild/move the project (e.g. into a new web/full-stack project).

---

## 1. Backend API Base URL

```
Preview:    https://powerup-arena.preview.emergentagent.com/api
Production: <get from the Deployment panel after you publish>
```

- Host + `/api` prefix on ALL routes (e.g. `/api/auth/login`).
- Frontend reads the host from `EXPO_PUBLIC_BACKEND_URL` and appends `/api`.
- Auth: send `Authorization: Bearer <session_token>` on protected routes.

---

## 2. Authentication

Three sign-in methods are implemented. All return `{ session_token, user }`.

### a) Email / Password (custom JWT-style session)
- `POST /api/auth/register`  body: `{ email, password, display_name, full_name, sex }`
- `POST /api/auth/login`     body: `{ email, password }`
- `GET  /api/auth/me`        (Bearer token) → current user
- `POST /api/auth/logout`

### b) Google — **Emergent-managed OAuth** (NO Google keys in this project)
- `POST /api/auth/session`   body: `{ session_id }`
- Backend exchanges `session_id` with Emergent:
  `GET https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data`
  header `X-Session-ID: <session_id>` → returns `{ email, name, picture, session_token }`.
- **There is NO Google Client ID / secret stored here** — Emergent holds the OAuth
  credentials. This ONLY works inside the Emergent environment.
- **To move off Emergent:** create your own OAuth client in Google Cloud Console
  (APIs & Services → Credentials → OAuth client ID) for Web/iOS/Android, then wire
  standard Google OAuth into the new project.

### c) Sign in with Apple (iOS)
- `POST /api/auth/apple`  body: `{ identity_token, email?, name? }`
- Verifies the Apple identity token against `https://appleid.apple.com/auth/keys`.
- Env needed: `APPLE_AUDIENCES` (your iOS bundle id / service id).

### Verification (email + phone)
- Email: `POST /api/verify/email/send`, `POST /api/verify/email/confirm` (Emergent email key)
- Phone: `POST /api/verify/phone/send`, `POST /api/verify/phone/confirm` (Twilio)

---

## 3. Keys / Integrations (env vars in backend/.env)

| Env var | Used for | Notes / where to get for a new project |
|---|---|---|
| `MONGO_URL`, `DB_NAME` | MongoDB connection | Provided by host env |
| `EMERGENT_LLM_KEY` | AI: OpenAI/Gemini/Claude via emergentintegrations | **Emergent-managed** universal key. Off-platform: use your own OpenAI/Gemini/Anthropic keys |
| `EMERGENT_EMAIL_KEY`, `EMAIL_FROM_NAME` | Transactional email (Resend via Emergent) | Emergent-managed. Off-platform: your own Resend key |
| `EMERGENT_PUSH_KEY` | Push notifications (Emergent) | Set at deploy time. Off-platform: your own FCM/APNs |
| `GOOGLE_PLACES_API_KEY` | Gyms map / place lookup | Google Cloud Console → Places API (this IS a real key you own) |
| `FAL_KEY` | fal.ai image/media | fal.ai dashboard |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS phone verification | Twilio console |
| `REVENUECAT_WEBHOOK_AUTH` | RevenueCat subscription webhook auth | RevenueCat dashboard |
| `APPLE_AUDIENCES` | Apple Sign-In audience (bundle/service id) | Apple Developer |
| `SKOOL_VERIFICATION_CODE` | Skool community verify | app-defined |
| `AUTH_THROTTLE_SECRET`, `MEDIA_TICKET_SECRET` | Internal HMAC signing | generate random secrets |
| `OWNER_DEFAULT_PASSWORD` | Seeds the owner/admin account | set your own |

> Google auth uses Emergent OAuth (no key here). The only Google key is Places (maps).

Frontend `frontend/.env`: `EXPO_PUBLIC_BACKEND_URL` (API host). Do not hardcode URLs.

---

## 4. Core data model (MongoDB collections)

- `users` — { user_id, email, display_name, full_name, sex, xp, level, rank, prs{bench,squat,deadlift,ohp}, sprints{"100m"}, baseline_set, baseline_runs{t_5k,t_10k}, badges[], critic_likes, top_critic, is_admin, is_founder, founder_backer, equipped_skin, equipped_weapon, ... }
- `user_sessions` — { session_token, user_id, created_at, expires_at }
- `judge_submissions` / `judge_comments` — physique judging feed + comments (comments: likes[], like_count)
- `critique_posts` / `critique_comments` — Form Room & PR Room (same shape as judge)
- `critique_likes` — per-like events { author_id, liker_id, comment_id, created_at } (powers weekly Top Critics)
- `notifications` — { notif_id, user_id, type, text, ref, read, created_at }
- `chat_messages` — multi-gym chat rooms (edited flag, 1-time edit for members)
- `coach_messages`, `coach_plans` — AI Coach chat + programs
- `cardio`, `sprints`, `steps`, `heart_rate` — conditioning logs (baseline flag)
- `nutrition_logs`, foods/meals/goals — diet tracker
- `enhanced_*` — "The Enhanced" PED protocol tracking
- `gyms`, `groups`/clans, `quests`/custom quests, `store` items, `purchases`
- `app_state` — global flags: `ai_gate {enabled}`, `ai_health {last_fail_at,last_ok_at}`, enhanced theme, etc.

---

## 5. Notable app-specific systems

- **Admin AI gate** (`app_state.ai_gate`, default OFF): AI off for members, on for admin;
  toggle at `GET/POST /api/admin/ai-gate`. Judge/critique still post (AI verdict skipped);
  Coach fully blocked for members (403).
- **Peer critique rewards:** +20 XP/critique (5/day cap), +10 XP when your critique is liked,
  `top_critic` badge at 20 received likes. Weekly board: `GET /api/leaderboard/critics_week`.
- **Baseline stats:** `POST /api/onboarding/baseline`; live percentile via `GET /api/onboarding/big4-distribution`.
- **Subscriptions:** RevenueCat ($9/mo, $90/yr) — webhook `POST /api/revenuecat/webhook`.
- **In-app notifications bell:** `GET /api/notifications`, `/unread-count`, `POST /mark-read`.

---

## 6. Full endpoint list
Run this in the backend to regenerate the complete route list:
```
grep -rhn '@api_router\.\(get\|post\|put\|delete\|patch\)' routes/*.py
```
(~230 endpoints across: auth, profile, judge, critique/rooms, chat, coach, cardio,
nutrition, enhanced, gear, groups, gyms, inperson, journey, leaderboard, quests,
notifications, admin, verify, revenuecat, push.)
