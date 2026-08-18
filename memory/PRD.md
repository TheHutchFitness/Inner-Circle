# Hutch's Inner Circle — PRD

## Original Problem Statement
iOS/Android fitness app for strength/athleticism with cyberpunk/anime + hardcore powerlifting aesthetic (blue/black). Adaptive multi-structured workouts (PPL, Upper/Lower). Detailed logging (sets/reps/weight/RPE + rating/critique). 3 leaderboards (Consistency/XP, Absolute Strength, BW Ratio). Ranks Beginner→Freak. Milestone badges (135/225/315+). Anime avatars, bodyweight/age/sex, progress charts, rank, badges, Skool + Premium ($5/mo) badges. Community chatroom. Athlete's Center (AI workout builder) @ Advanced. The Room @ Elite. AI + chatrooms gated behind $5/mo premium OR verified Skool membership. Accounts, payments, Skool verification, persistent data.

## Architecture
- Backend: FastAPI + MongoDB (motor). Routes under /api.
- Frontend: Expo Router (tabs), React Native, cyberpunk dark theme.
- Auth: Email/password (bcrypt) + Emergent Google OAuth. 7-day bearer session tokens.
- AI: Claude Sonnet 4.6 via emergentintegrations (EMERGENT_LLM_KEY).
- Payments: RevenueCat (Emergent-managed), $5/mo `pro` entitlement, client-side gating.
- Skool: manual verification code (SKOOL_VERIFICATION_CODE).

## User Personas
- New lifter (Beginner) building consistency.
- Advanced/Elite athlete chasing PRs, uses AI programming + elite chat.
- Skool community member verifying membership for access.

## Core Requirements (static)
- Rank system by XP: Beginner<500, Intermediate<1500, Advanced<3500, Elite<8000, Freak+.
- Milestones per lift at 135,185,225,275,315,365,405,455,495,585,675.
- Chatrooms + AI require premium (RC `pro`) OR skool_verified.
- Athlete's Center: Advanced+. The Room: Elite+.

## Implemented (2026-05)
- Email/password + Google auth, sessions, /auth/me with rank.
- Dashboard: avatar, rank, XP bar, stats, PR vault, protocol CTAs, premium CTA.
- Adaptive "Next Mission" suggestion on dashboard (/api/workouts/next-suggestion) — rotates program + flags weakest lift.
- Unlockable Vault (/app/vault): XP/level-gated backgrounds (applied to dashboard gradient) + widgets. Endpoints: /api/unlockables, /api/profile/set-background.
- Progress "Strength Curve" chart on profile (SVG, per-lift tabs) via /api/progress/chart.
- Animated "NEW PR" celebration modal + shareable card (react-native-view-shot + expo-sharing) on PR hit.
- Workout logger: program library (PPL/Upper-Lower), plate steppers for reps/weight/RPE, add/remove sets, 5-star rating + critique, XP + PR + milestone badge awarding (returns pr_details).
- 3 leaderboards (podium top-3 + ranked list, "you" highlight).
- Profile: anime avatar picker, info grid, PR vault, milestone badges, premium/skool pills.
- Settings: edit profile + Skool code verification.
- Community chat (polling, gated). The Room (elite-only, gated read+write). Athlete's Center AI (Claude, rank+premium gated). Paywall (RevenueCat purchase/restore).
- Seed users: athlete/elite/freak @test.com. Backend: 19/19 pytest passing.

## Backlog / Remaining
- P1: XP/level-based unlockable app backgrounds & widgets (not yet built).
- P1: Adaptive program recommendation driven by leaderboard performance (currently static library).
- P2: Progress charts visual rendering on profile (data endpoint exists; chart UI pending).
- P2: PR/achievement badge expansion + push celebration.
- P2: Real store IAP go-live (user completes App Store/Play credentials).

## Next Tasks
- Add progress charts (victory-native) to profile using /api/progress/chart.
- Unlockable backgrounds/widgets tied to level.
- Adaptive next-workout suggestion.

## Implemented (2026-06 — Quests + Radar + Swipe)
- QUESTS tab (Daily/Weekly/Monthly/All sub-tabs): auto-generated quests from the athlete's workout logs/stats. Daily+weekly reward XP; monthly reward badges/backgrounds/player-card badge. Tap a quest → Solo-Leveling "QUEST INFO" modal with GOAL objectives, GLOBAL CLEARANCE (players + %), reward, and CLAIM. Backend: /api/quests, /api/quests/claim, quest_claims collection; progress computed live from workouts in day/7d/30d windows.
- Player-card COMBAT STATS radar (STR/PWR/SPD/END/GRT) from /api/profile/attributes — blends global lift benchmarks + in-app percentile — with a derived CLASS title and S/A/B/C/D/E class tier.
- Rank-based holographic card FRAMES (Steel→Crimson Prime).
- All 20 anime portrait avatars wired ("SELECT CLASS" picker).
- Swipe left/right to change tabs (react-native-gesture-handler + GestureHandlerRootView).
- 6-tab bar: HQ/TRAIN/RANK/QUESTS/SOCIAL/ME. Tests: 39/39 pytest passing.

## Implemented (2026-06 — Player Card + HUD polish)
- ME tab redesigned as a dynamic holographic PLAYER CARD (game character-card look): AI anime hero portrait, rank stamp, LV, class, PWR/XP/LOGS stat bars, premium/skool pills; tap card to open "SELECT FIGHTER" picker; STATS toggle + SHARE (capture card).
- 8 AI-generated full anime-hero portrait avatars (Nano Banana) replace emoji: ronin, kaido, titan, saiyan, demon, shinobi, phoenix, reaper; portraits also show on HQ hero avatar.
- Global animated CRT scanline/vignette overlay (ScanlineOverlay) for Pip-Boy HUD feel; non-interactive.
- Rest Timer: auto-starts on adding a set; floating REST countdown with -15/+15/SKIP.
- Verified: 28/28 pytest + full frontend flows (iteration_6).

## Implemented (2026-06 — HUD restyle + rank perks)
- Recap/Vault moved to a top HUD toolbar on the dashboard (fixed low/right placement); 44px tap targets.
- Pip-Boy / game-inventory HUD look: mono terminal status line, ▚ // section headers, corner-bracket HudFrame component, AI-generated anime hero/gym backgrounds behind dashboard + vault.
- Leaderboard "Consistency" board replaced with overall LEVEL leaderboard (metric = level).
- Circle tab renamed to SOCIAL (screen title "SOCIAL HUB").
- 20 anime-hero avatars (added Shinobi, Berserker, Phoenix, Oni, Samurai, Mecha, Reaper, Thunder God, Kraken, Ace, Star Saint).
- Multi-Day Send: AI returns full week; each day has its own SEND-to-logger button (build + history).
- Rank Perks: promotion auto-equips a rank-specific AI background, shown in the rank-up celebration.
- 6 anime backgrounds generated via Gemini Nano Banana (assets/images/bg_*.png). Tests: 28/28 pytest passing.

## Implemented (2026-06 — later)
- Program-to-Logger: AI build now returns a structured `sessions[]` (parsed from a delimited JSON block); "SEND TO LOGGER" button on generated + saved programs pushes a pre-filled active session into the workout logger (module store + useFocusEffect).
- Rank-Up Fanfare: full-screen animated RankUpCelebration modal fires when a logged workout crosses a rank threshold (shown after any PR modal).
- Leaderboard backgrounds: each board (Consistency/Strength/BW Ratio) has its own full-bleed lifter image with a dark gradient overlay.
- Seed accounts now reset to canonical stats on every startup (deterministic demo + tests). Tests use fresh registered users for mutation cases.
- Tests: 26/26 pytest passing.

## Implemented (2026-06)
- Login screen uses user-provided branded backdrop (assets/images/login-bg.png).
- Annual subscription plan on paywall: Monthly $5.00 + Annual $39.99 (SAVE 33%, ~$3.33/mo). Plan selector toggles the purchase button. RC products: monthly prodf8cdb8e2a3, annual prod850a4129b3.
- Weekly Recap (/app/recap): shareable card (XP gained, sessions, total volume, PR count, rank-up banner) from GET /api/recap/weekly (last 7 days). Workouts now persist xp_gained + pr_details.
- Program History in Athlete's Center: BUILD / HISTORY tabs; saved AI programs listed and re-openable (GET /api/ai/programs).
- Tests: 23/23 pytest passing.


## Implemented (2026-06 — Monetization + The Judge + Rank Overhaul)
- 1-ON-1 CUSTOM PROGRAM ($200 one-time, RevenueCat lifetime entitlement `custom_program`): exclusive screen (entry from paywall + HOME). Grants instant Athlete's Center + intake form (goals/injuries/schedule/contact) + confirmation. Backend: /api/custom-program/unlock|intake|status. Human-written program (not AI).
- FOUNDERS screen (HOME → below Cardio): first 100 members by signup (excludes bots) with join numbers + your standing; "Development Backers" tab lists backer names equally. Backer = RC entitlement `backer` ($25). Backend: GET /api/founders, POST /api/founders/back.
- THE JUDGE (HOME CTA; gated by Skool OR $5 premium): submit physique via camera/gallery → AI head-judge critique via OpenAI gpt-5.6-terra vision (overall/10 + Symmetry/Conditioning/Size/Posing + notes); shared feed where members comment. Backend: /api/judge/submit|feed|{id}/comments. Photos in Emergent Object Storage.
- RANK OVERHAUL: 8 ranks, each spanning exactly 10 app levels (level = 1 + xp//250). Added Vanguard/Warrior/Boss between Advanced and Elite. New card frames + rank colors + perk backgrounds (bg_vanguard/warrior/boss via Nano Banana) + 4 new HUD widgets. Athlete's Center = Advanced+, The Room = Elite+.
- PROGRESSION screen (HOME → RANKS button): full 8-tier ladder with frame previews + perks + level-gated background/widget rewards.
- HOME tab: renamed HQ→HOME; removed terminal/online status line; centered RECAP/INVENTORY/RANKS HUD buttons.
- Login cover: animated glitch (RGB-split displaced slices + scan sweep) + TV static overlay.

## Implemented (2026-06 — AI Coach)
- AI COACH chat (Home CTA -> /coach): multi-turn training & nutrition assistant on OpenAI GPT-5.4 via emergentintegrations (EMERGENT_LLM_KEY). History persisted per user in `coach_messages`; recent transcript replayed for context. Backend: GET/POST/DELETE /api/coach/messages. Replies constrained to plain text (no markdown) for clean chat bubbles.
- The Judge upload now requires email/phone verification (same gate as chat media).
- Login cover: glitch removed; kept TV static + Pip-Boy scan-line sweep.

## Implemented (2026-06 — Boss Reveal / Plan-to-Workout / Coach Voice / Female visuals)
- Boss Reward Reveal: claiming a Boss quest plays an animated "BOSS DEFEATED" unlock reveal (reanimated pop + pulsing glow) showing the earned frame/background.
- Plan to Workout: saved Coach Plans on Train have a "START WORKOUT" button that parses the plan text (Name SxR) into a live, editable logged workout.
- Coach Voice Reply: when a question is asked via the mic, the coach's answer is read aloud (OpenAI TTS tts-1 voice 'onyx'; backend /api/coach/tts + /api/coach/tts/{id}.mp3, played via expo-audio).
- Female visuals: `sex` set at sign-up (Male/Female/Prefer-not) and in ME/Profile. Female accounts get female versions of ALL avatars + ALL tier backgrounds (28 Nano-Banana images, *_f.png). Male/default keeps existing art. Gender-aware avatarImage(id,sex)/bgImage(id,sex) applied to current-user render spots (Home, Profile card + avatar picker, Vault, Progression, HeroIntro).

## Implemented (2026-06 — SECURITY: RevenueCat server-side purchase verification)
- P0 FIX: The $200 Custom Program (`custom_program`) and $25 Founder Backer (`backer`) grant endpoints previously trusted the client — any authed POST to /api/custom-program/unlock or /api/founders/back unlocked paid content for FREE. Now verified server-side.
- Added POST /api/revenuecat/webhook: RevenueCat POSTs a purchase event authenticated by the REVENUECAT_WEBHOOK_AUTH shared secret (backend/.env; raw Authorization header, not Bearer). This is the ONLY writer of the `verified_purchases` collection + paid flags (custom_program_purchased/athletes_center_access, founder_backer). Idempotent via `rc_webhook_events` (unique event id). REFUND events revoke access.
- /api/custom-program/unlock and /api/founders/back are now fail-closed: 402 unless a verified_purchases row exists. Frontend (custom-program.tsx, founders.tsx) retries the sync call briefly to cover webhook lag and shows a friendly "verifying" message.
- USER MANUAL STEP (post-deploy): configure the webhook in RevenueCat Dashboard → Integrations → Webhooks: URL = https://<deployed>/api/revenuecat/webhook, Authorization header = the REVENUECAT_WEBHOOK_AUTH value. Without it, real store purchases won't auto-grant server access.
- Also fixed RN Web deprecation warnings: moved `pointerEvents` prop into `style.pointerEvents` in ScanlineOverlay/HeroIntro/GlitchImage.
- Verified: 12/12 pytest (tests/test_revenuecat_security.py) — fail-closed 402, webhook 401 on bad/missing/Bearer auth, grant+unlock 200 & flags set (custom_program & backer), idempotent duplicate, refund-revoke.

## Implemented (2026-06 — Purchase Receipt Email + Backer Wall Polish)
- PURCHASE RECEIPT EMAIL: On a verified purchase (webhook INITIAL_PURCHASE / NON_RENEWING_PURCHASE), the backend sends a branded thank-you/receipt email via Emergent Resend (send_email). Custom Program email confirms the 1-on-1 order + reminds to complete the intake form + notes Athlete's Center unlocked (one-time payment). Backer email thanks the Development Backer. Fire-and-forget (wrapped in try/except so email failure never breaks the grant); sent once per purchase (verified_purchases.receipt_sent flag). Verified: 202 Accepted to Resend for delivered@resend.dev. (@test.com addresses are blocked by the email proxy — expected.)
- BACKER WALL POLISH (founders.tsx BACKERS tab): replaced flat chips with standout BackerCard rows — avatar, name, rank-colored label, and an animated pulsing ★ (react-native-reanimated). The current user's own backer card is pinned to the top with a golden highlight + glow + "YOU" tag; cards animate in with FadeInDown. Bots remain excluded from the backers list. Verified via screenshot (Kaido pinned as YOU).
- Also fixed RC_REVOKE_EVENTS: removed REFUND_REVERSED (was incorrectly revoking); only REFUND revokes now.

## Implemented (2026-06 — Backer Perks + Receipt In-App Copy + order numbers)
- BACKER PERKS: (1) Chat (ChatRoom.tsx) now shows a "★ BACKER" gold pill next to backers' names, a gold name color, and a subtle golden glow on their message row. Backer status is now recomputed on read in GET /api/chat/{room}/messages (accurate even for old messages). (2) Profile player card (profile.tsx): backers get a permanent golden glowing frame around the portrait + a "★ FOUNDING BACKER" corner ribbon + upgraded pill text.
- RECEIPT IN-APP COPY + ORDER NUMBERS: webhook now stamps a stable order_number ("HIC-XXXXXXXX") on each verified purchase ($setOnInsert). GET /api/custom-program returns receipt {order_number, purchased_at, product, amount}; GET /api/founders returns me.receipt likewise for backers. custom-program.tsx renders a branded ReceiptCard (order #, item, date, $ total, PAID badge) in both the intake and confirm views. founders.tsx shows the order number in the thanks card + celebrate modal. Verified end-to-end (receipt HIC-72A56737 rendered; 12/12 security pytest still green).

## Implemented (2026-06 — Backer Leaderboard Flair + Order History + Receipt Resend)
- BACKER LEADERBOARD FLAIR: leaderboard rows show a gold "★ BACKER" pill and podium shows a gold ★ next to backers. Backend adds founder_backer to cardio leaderboard entries; strength/xp/ratio boards already carry it. Verified (Kaido ★ at podium #2).
- ORDER HISTORY: new GET /api/purchases returns the user's verified (non-revoked) purchases [{order_number, entitlement, product, amount, store, purchased_at}]. New screen /app/purchases.tsx ("MY PURCHASES") lists each order as a card with order #, product, date, amount, PAID badge + a per-order resend button. Linked from Profile (testID open-purchases). Verified with 2 orders.
- RECEIPT RESEND: new POST /api/receipt/resend {entitlement} re-emails a formatted receipt (order #, item, date, total) via Emergent Resend; surfaces send errors to the client. Button added to the custom-program ReceiptCard ("✉ EMAIL ME THIS RECEIPT") and to each row in Order History. Verified 200 + email delivered.

## Implemented (2026-06 — Member Profiles + Backer Name Color + Coach Sales Recap)
- MEMBER PROFILE VIEW (Backer Badge on Others): new GET /api/users/{user_id}/public (safe fields; no email/phone) + reusable src/components/MemberSheet.tsx modal. Tapping any leaderboard podium card or row opens a member sheet with avatar, rank/level, PR grid, totals, and a "★ FOUNDING BACKER" badge (gold glowing frame) + "✓ SKOOL" when applicable. Verified.
- BACKER NAME COLOR: backer names now render gold (colors.warning) across leaderboard rows + podium, judge feed cards, judge board, and judge comments (chat + founders already gold). MemberSheet name is gold for backers.
- COACH SALES RECAP: owner-only GET /api/coach/sales aggregates verified_purchases (non-revoked) → {total_orders, total_revenue, by_product{custom_program,backer}, by_month[]}. Prices: custom_program=$200, backer=$25. New screen /app/coach-sales.tsx (hero total revenue, per-product cards, per-month breakdown), linked from the Coach Inbox area on custom-program.tsx (testID cp-coach-sales, owner-gated). Non-owners get 403. Verified ($225 total, 2 orders).

## Implemented (2026-06 — Tap Names → Member Profile + Coach Top Buyers)
- TAP NAMES IN CHAT/FOUNDERS: /api/founders now returns user_id on founders + backers. ChatRoom.tsx names are tappable → open MemberSheet. Founders rows and BackerCard are tappable → open MemberSheet (own pinned card included via user.user_id). Verified (chat name → member card).
- COACH TOP BUYERS: owner-only GET /api/coach/buyers lists everyone who bought custom_program (from verified_purchases) with {display_name, order_number, purchased_at, has_intake, intake_status, request_id}. Added a "CUSTOM PROGRAM BUYERS" section to /app/coach-sales.tsx: avatar + name + order # + intake status, with a "VIEW INTAKE" button routing to /coach-programs. Verified (Ronin buyer, intake submitted).

## Implemented (2026-06 — Tap Judge Names + Coach Delivery Alert)
- TAP JUDGE NAMES: judge board endpoint now returns user_id (feed/comments already had it). judge.tsx names in the board, feed cards, and comments are tappable → open MemberSheet. Verified.
- COACH DELIVERY ALERT: when Coach uploads a program (deliver endpoint) it sets delivered_seen=False. New GET /api/custom-program/alert -> {program_ready, unseen, file_name, delivered_at}; POST /api/custom-program/alert/seen clears it. Home (index.tsx) polls the alert and shows a green "PROGRAM READY" badge + updated subtitle on the 1-on-1 Custom Program CTA when unseen; opening the custom-program screen (delivered intake) auto-marks it seen so the badge clears. Verified full lifecycle (not-ready → ready+unseen → seen). No push notifications used (in-app only).
