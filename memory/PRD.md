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

## Implemented (2026-06 — Coach Delivery Note)
- DELIVERY NOTE: deliver endpoint now accepts an optional `note` form field (stored as program_note, ≤500 chars). Coach Inbox (coach-programs.tsx) has a per-request multiline "PERSONAL NOTE (shown to buyer)" input sent with the file upload. Buyer's custom-program confirm view shows a "✎ NOTE FROM COACH HUTCH" card above the download button when a note exists. Verified end-to-end (note stored + rendered to buyer).

## Implemented (2026-06 — Delivery Email + Program History + Buyer Search)
- DELIVERY EMAIL: deliver endpoint now emails the buyer (Emergent Resend) "Your custom program is ready 💪" with the coach's note embedded (fire-and-forget; failures logged, never block delivery). Verified 202 Accepted.
- PROGRAM HISTORY: each delivery is appended to a `deliveries` array [{media_id, file_name, note, delivered_at}] on the request (latest also stays as program_media_id). Buyer's custom-program screen shows a "📁 PROGRAM HISTORY" list (newest first, latest tagged) with re-download links for every past file. Verified (2 deliveries listed).
- BUYER SEARCH: Coach Sales Recap Top Buyers list now has a search box (testID buyer-search) that filters buyers by name client-side. Frontend-only.

## Implemented (2026-06 — Version Labels + Unread Download Dot + Intake Reminder)
- VERSION LABELS: deliver endpoint accepts optional `label` (≤60 chars), stored on request (program_label) + per delivery entry. Coach Inbox has a "VERSION LABEL" input; buyer's download button + Program History show the label (e.g. "Phase 2 — Hypertrophy"). Verified.
- UNREAD DOWNLOAD DOT: new POST /api/custom-program/downloaded {media_id} sets last_downloaded_media_id when the buyer taps a download (main or history). coach/buyers returns awaiting_download = delivered latest not yet downloaded; Coach Sales buyers list shows a red dot on those buyers. Verified true→false lifecycle.
- INTAKE REMINDER: GET /api/custom-program/alert now returns intake_pending (purchased but no intake). Home shows an amber "COMPLETE INTAKE" badge + updated subtitle. Coach Sales buyers with no intake show a "REMIND" button → POST /api/coach/buyers/remind-intake emails the buyer to finish their intake. Verified (email 200 sent).

## Implemented (2026-06 — Rank page background swap)
- Replaced the rank (leaderboard) page background images. Now driven by the mode toggle + user's gender:
  - STRENGTH mode -> cyberpunk deadlift athlete (rank-strength-male.png / rank-strength-female.png)
  - CARDIO mode -> cyberpunk running athlete (rank-cardio-male.png / rank-cardio-female.png)
  - Female variants shown when user.sex === "female" (generated from the uploaded male images via Nano Banana image-to-image, keeping pose/scene/composition). Generator: backend/gen_rank_female.py.
- Old BOARD_BG (board-xp/strength/ratio) usage removed from leaderboard.tsx. Verified male + female for both modes via screenshots.

## Implemented (2026-06 — Custom Profile Photos + Equippable Earned Items)
- PHOTO UPLOAD: POST /api/profile/photo (multipart, jpg/png/webp, <=12MB) -> Emergent Object Storage + chat_media; served via /api/chat/media/{id}?token=. use_photo toggle replaces the anime avatar EVERYWHERE (profile, member sheet, leaderboard, chat).
- COSMETICS: backend catalog COSMETICS {emblem, aura, title} unlocked by level (auto) + coach grants (granted_items). Endpoints: GET /api/cosmetics, POST /api/profile/loadout (emblem/aura/title/use_photo, ownership-validated), POST /api/coach/grant-item (owner). Frames reuse existing rank-based system.
- Shared component src/components/PlayerAvatar.tsx renders photo-or-avatar with aura glow ring + frame border + emblem badge. Wired into profile card, MemberSheet, leaderboard (podium+rows), chat. Title ribbon shown under name on profile/member sheet/leaderboard.
- New screen /app/loadout.tsx ("LOCKER") — photo upload, use-photo toggle, emblem/aura/title/frame pickers (locked items show 🔒Lxx). Linked from Profile (testID open-loadout). Loadout/photo fields added to /auth/me, /users/{id}/public, leaderboard, and chat message join.
- Verified: backend curl (equip owned OK, locked 403, upload 200, use_photo) + screenshots (Locker + profile photo). 12/12 security pytest still green.

## PENDING NEXT BUILD — "The Enhanced" room (requirements confirmed, NOT started)
- New chat room "The Enhanced" gated by: (1) ACTIVE PAID SUBSCRIPTION (monthly/annual RevenueCat), (2) age 20+ (DOB entry, self-attested, stored) + "I am 20+" checkbox, (3) consent popup warning of a PERMANENT "ENHANCED" profile banner -> Accept/Deny.
  - Accept: grant room access, apply permanent ENHANCED banner to profile, switch WHOLE APP color scheme to RED with a glitch transition.
  - Deny: no changes, reroute to Home.
- Room: red theme; no-medical-advice warning banner on entry; PED/enhancement tracker (manual input + dropdown from a CURATED list incl steroids + peptides, each with a short neutral educational description + disclaimer). ONE active regimen (dosage + timing); creating a new one archives the old to a History section.
- Rank tab: toggle to compare Enhanced-only / Natural-only / All (Enhanced = accepted the banner).
- NOTE: full app-wide red theming is a big refactor (StyleSheet snapshots) — plan a ThemeProvider/dynamic palette approach.

## Implemented (2026-06 — Train inputs + App-wide Red Theme + Owner reset)
- TRAIN TAB INPUTS: reps & weight are now typeable numeric TextInputs (reps=numeric keypad, weight=decimal-pad) instead of +/- steppers; RPE kept as a +/- Stepper. `Add Set` still copies the previous set's reps/weight/rpe (editable). New `NumInput` component in workout.tsx (commits on change, reformats on blur, focus-guarded to avoid cursor jumps). Verified via testing_agent (iteration_16).
- APP-WIDE RED THEME ("The Enhanced" crossover): solved the StyleSheet-snapshot problem via a persisted-flag + boot-order approach (no giant ThemeProvider refactor):
  - `src/lib/theme.ts`: added `ENHANCED_OVERRIDES` (crimson palette; warning stays gold for backer semantics) + `applyEnhancedPalette()` (mutates the shared `colors` object in place) + `isEnhancedPalette()`. Web-only sync bootstrap reads `localStorage['hic_enhanced_theme']` at module load.
  - `src/lib/enhancedTheme.ts`: `persistEnhancedFlag`, `loadEnhancedFlag`, `bootstrapEnhancedPalette`, `reloadApp` (web location.reload / native DevSettings/Updates).
  - NEW custom entry `/app/frontend/index.js` (package.json main → `index.js`): calls `bootstrapEnhancedPalette()` BEFORE `require('expo-router/entry')` so route StyleSheets create with the red palette already applied.
  - `enhanced.tsx` accept(): dramatic glitch → `applyEnhancedPalette()` + persist flag + refresh → `reloadApp()` after ~1.3s so the whole app boots red.
  - `_layout.tsx`: `EnhancedSync` (persists flag / reloads once when logged-in user's `enhanced` status mismatches runtime palette — self-heals on login/logout across devices) + `EnhancedTint` (subtle app-wide crimson wash). StatusBar/Stack bg now use `colors.surface`.
  - Known limitation: a few hardcoded cyan rgba/hex literals in some screens don't swap (dynamic per-user), and AI background images stay as-is; the crimson palette + tint dominate. Verified app-wide red for enhanced athlete (testing_agent iteration_16).
- PED TRACKER ("Monthly Protocol"): confirmed fully built + gated (client subscriber gate + backend `enhanced` gate; POST regimen 403 for non-enhanced). 15-compound curated PED_LIBRARY with neutral educational descriptions + PED_DISCLAIMER. Active/History archiving verified.
- OWNER RESET (the9hutch@gmail.com): zeroed xp/level/prs/badges/workouts_logged/streak, deleted workout logs + quest_claims, reset active_background; KEPT all_rooms_access (elite chat + Athlete's Center + The Room), skool_verified, and enhanced access + paid flags.

## Implemented (2026-06 — Enhanced Rank Filter / Protocol Reminders / Set Presets / Compound Notes)
- ENHANCED RANK FILTER: already present — leaderboard.tsx has an ALL / 🌿 NATURAL / ☣ ENHANCED toggle (testIDs pop-all/pop-natural/pop-enhanced) driving `/api/leaderboard/{board}?filter=`. Backend filters `enhanced:true` / `{$ne:true}`. (No new work needed.)
- PROTOCOL REMINDERS (Home): new GET `/api/enhanced/next-dose` returns the enhanced athlete's active regimen items with a `due_today` flag (heuristic on schedule text: weekday abbrev match or daily/morning/etc.) + due_count + today. Home (index.tsx) shows a red "⏱ TODAY'S PROTOCOL · <DAY>" card (testID protocol-reminder) just below THE ENHANCED CTA when enhanced + active regimen; due items get a lit dot + "<dose> · today", rest-day message when none due. Tapping opens /enhanced.
- SET PRESETS (Train): new `set_presets` collection + endpoints GET/POST `/api/presets`, DELETE `/api/presets/{id}` (auto-label "<lb> × <reps>"). workout.tsx: each set row has a ☆ save-star (testID save-preset-ei-si) that saves that set's reps/weight/rpe as a preset; a gold ★ button beside "+ ADD SET" (testID presets-ei) opens a bottom-sheet SET PRESETS modal listing saved combos — tap to add a new set pre-filled (testID use-preset-id), ✕ to delete (del-preset-id).
- COMPOUND NOTES (Enhanced): RegimenItem gained a `notes` field; new POST `/api/enhanced/regimen/note` {index, notes} edits the ACTIVE regimen item in place (no archive) so athletes can log week-to-week response. enhanced.tsx active-regimen card renders a per-compound multiline notes TextInput (testID note-i) + SAVE NOTE (save-note-i) with "Notes saved ✓". Gated by the existing subscriber gate.
- Verified: backend curl (next-dose due logic, presets CRUD, note update in place) + frontend screenshots (Home dose card, Train preset modal + save star, Enhanced notes save). tsc clean on all touched files.

## Implemented (2026-06 — Expanded Exercise Library + descriptions)
- EXERCISE_LIBRARY grown from ~72 to 112 exercises with new movements across every group (Chest 15, Back 19, Shoulders 13, Legs 22, Arms 20, Core 13, Olympic/Power 10) — e.g. Landmine Press, Meadows Row, Belt Squat, Nordic Curl, Adductor/Abductor Machine, Spider/Zottman Curl, Pallof Press, Toes-to-Bar, Hang Clean, Kettlebell Swing, Box Jump.
- Every library exercise now has a short neutral coaching `desc`. `/api/exercises` returns it unchanged; ExerciseLibraryModal.tsx renders the description under each name (Ex type + rowDesc style). Existing template/PR-alias names preserved so programs and PR tracking still resolve. Verified: 112/112 have desc; modal shows name + description.

## Implemented (2026-06 — Library UX: Muscle Filter / Demos / Custom Descriptions / Recent)
- MUSCLE FILTER: ExerciseLibraryModal shows horizontal category chips (ALL + Chest/Back/Shoulders/Legs/Arms/Core/Olympic + Custom when present, testID lib-cat-<Cat>) that filter the list to one muscle group.
- EXERCISE DEMOS: tap the ⓘ on any row (testID lib-info-<name>) to open a detail sheet (name + muscle badge + full description + "+ ADD TO WORKOUT"). Backend GET /api/exercises/demo?name= lazily generates a cyberpunk-anime form illustration via Nano Banana (gemini-3.1-flash-image-preview), stores it in Emergent Object Storage + chat_media, caches in `exercise_demos` (unique name index), and serves via the existing /api/chat/media/{id}?token= endpoint. First tap ~7s, cached thereafter (~2ms).
- CUSTOM DESCRIPTIONS: CustomExerciseIn gained `desc`; the create area has a second "Your own note / cue (optional)" field (testID lib-new-desc) sent with POST /api/exercises/custom and shown under the custom exercise like library items.
- RECENT & FAVOURITES: GET /api/exercises now returns `recent` (top ~6 most-logged exercises from the athlete's last 60 workouts). The modal surfaces a "★ RECENT & FAVOURITES" group at the top when browsing ALL with no search.
- Verified via curl (recent list, demo gen 200 + cache + media serve) and screenshots (chips filter to Legs, Recent group, demo sheet with generated bench-press art). Lint clean; new index exercise_demos.name added in seed().

## Implemented (2026-06 — Pin Favourites / Demo Regenerate / Muscle Map + Expo Go entry fix)
- EXPO GO CRASH FIX: the custom index.js previously deferred `require("expo-router/entry")` inside an async .finally(), which broke native root registration ("main has not been registered"). Now index.js imports `expo-router/entry` SYNCHRONOUSLY (registration on initial eval); web red palette still applies synchronously via theme.ts localStorage bootstrap, native applies best-effort after an async flag read. EnhancedSync now only hard-reloads on WEB (native applies the palette in-memory to avoid reload loops); enhanced accept() reload is web-only too.
- PIN FAVOURITES: user.favourite_exercises (list). POST /api/exercises/favourite {name,on}; GET /api/exercises returns `favourites`. Modal row has a ☆/★ star (testID lib-fav-<name>) to pin; a "★ Favourites" group shows above "Recent" when browsing ALL with no search.
- DEMO REGENERATE: GET /api/exercises/demo?name=&force=1 deletes the cached demo and regenerates with a randomized style variant (angle/lighting) so the art differs. Demo detail card has a "↻ REGENERATE ART" button (testID demo-regen); image URL cache-busted with &v=timestamp.
- MUSCLE MAP: new src/components/MuscleMap.tsx (react-native-svg front-body silhouette) highlights the target group by category (Chest/Back/Shoulders/Arms/Core/Legs/Olympic) with a "TARGET: <CATEGORY>" caption; shown beside the demo image on the detail card.
- Verified: favourite toggle on/off via curl; screenshot of demo card showing bench-press art + muscle map (CHEST highlighted) + regenerate button + row stars. Lint clean.

## Implemented (2026-06 — Front/Back Muscle Map + Share Demo)
- FRONT/BACK MAP: MuscleMap.tsx now renders BOTH a FRONT and a BACK silhouette (react-native-svg) side by side, each with its own highlight set so pulls/posterior work light up the BACK view (e.g. Back → traps/lats/lower-back on the back diagram; Legs → quads front + hams/glutes back; Chest → front only). Back silhouette adds a spine line. "TARGET: <CATEGORY>" caption retained.
- SHARE DEMO: exercise detail card has a "⤴ SHARE" button (testID demo-share) next to "↻ REGENERATE" that opens the native share sheet with the exercise name, category and how-to description ("shared from Hutch's Inner Circle"). Detail card relaid out: demo image on top, front/back maps below, action row, description, add button.
- Verified via screenshot (Barbell Row → BACK view highlighted, FRONT dim; Regenerate + Share row). Lint clean.

## Implemented (2026-06 — Share as Image + Rep-Range Tags; fixed enhanced-theme web race)
- SHARE AS IMAGE: installed expo-file-system (used via /legacy downloadAsync). Detail-card SHARE button now downloads the generated demo PNG to cache and opens the native share sheet via expo-sharing (Sharing.shareAsync, image/png); falls back to text Share (name + how-to) on web or if unavailable.
- REP-RANGE TAGS: detail card shows suggested rep-range chips derived by category (Chest/Back/Legs: STRENGTH 4-6 + HYPERTROPHY 8-12; Shoulders 5-8/10-15; Arms 8-12/12-15; Core ENDURANCE 12-20; Olympic POWER 2-5; default HYPERTROPHY 8-12).
- BUGFIX: EnhancedSync web reload previously fired before the localStorage flag persisted (fire-and-forget), causing enhanced athletes to boot cyan. Now awaits persistEnhancedFlag before reload, and persistEnhancedFlag writes web localStorage synchronously first. Red takeover restored (verified: athlete@test.com boots fully crimson).
- Verified via screenshot (rep-range chips + front/back map + demo art + Regenerate/Share on the card; red theme restored). Lint clean.

## Implemented (2026-06 — "The Journey" RPG map mini-game)
- FULL-SCREEN JOURNEY (app/journey.tsx) opened via "⚔ THE JOURNEY" button on the Quests screen (shown on both the goal-setup gate and the main quests view).
- Backend GET /api/journey: returns me {level, xp, rank_position/total, stats(str/pwr/spd/end/grt via refactored _compute_attributes helper), class_title, class_tier}, zone (rank-tier E→D→C→B→A→S → THE WASTES/IRON VALLEY/STORM RIDGE/EMBER PEAKS/CRIMSON CITADEL/ASCENSION with primary/accent colors), nodes (all daily/weekly/monthly/boss quests w/ complete+claimed+reward), neighbors (±5 leaderboard positions by XP, excl self).
- MAP: horizontal ScrollView, react-native-svg winding path (traveled portion in zone accent), quest nodes (⚔ ready / ✓ cleared / 🔒 locked / ☠ boss), generic anime HeroSprite (src/components/HeroSprite.tsx) at player progress, rivals placed along a lane by XP so you can pass them. Zone gradient (expo-linear-gradient) + stats bar.
- COMBAT (Reanimated): tap a ⚔ node → Combat overlay: hero dash + slash arc + screen shake + enemy HP depletion + floating damage numbers (crit) scaled by combat stats (POWER = str*.35+pwr*.3+grit*.15), haptics; bosses get 4 hits. Victory → CLAIM calls existing /api/quests/claim → Reward reveal card (reward_label/XP) → refresh.
- PR/MILESTONE CELEBRATION: "PRs ✦" opens MilestoneOverlay for the player's top lift's highest badge milestone (135/185/225/275/315/365/405…); GET /api/journey/similar?lift=&value= lists real members who also conquered that number (animated pulsing ring). Tied to the existing badge milestone weights.
- Verified via screenshots: map (ASCENSION/S, rivals, hero), combat (crit damage numbers), reward (250 XP), milestone overlay (405 deadlift + member list). Lint clean.

## Implemented (2026-06 — Journey: Boss cutscenes + Sound FX + Zone Reveal)
- SOUND FX: generated 3 bundled WAVs (assets/sfx/slash|hit|victory.wav) + src/lib/sfx.ts (expo-audio createAudioPlayer, playsInSilentMode, persisted mute in AsyncStorage 'hic_sfx'). Combat plays slash+hit per strike and victory on win; ZoneReveal plays victory. Header 🔊/🔇 toggle (testID journey-sfx) enables/disables and persists.
- BOSS CUTSCENES: Combat now multi-phase for node.boss — 5 normal hits with a mid-fight "PHASE II — ENRAGED" banner + flash + enemy glyph change (👹→😡), then a "FINISHER!" banner and a special heavy hit (2.6x damage, full-screen white flash, heavy haptic) before VICTORY. HP bar has a phase midpoint marker. Normal encounters unchanged (3 hits). NOTE: only shows in-app once a boss quest's objectives are actually complete.
- ZONE REVEAL: on Journey load, compares zone.index to AsyncStorage 'hic_zone_seen'; when the player enters a higher-tier zone, plays a full-screen "NEW ZONE UNLOCKED — <name> · TIER X" animation (scale/back easing + pulsing glow + victory sfx), then persists the new index (first-ever load just sets baseline, no popup).
- Verified: refactored normal combat still plays (regression), sfx toggle renders, victory reached. Lint clean.

## Implemented (2026-06 — Journey: Boss Loot + Zone Music + Rival Taunts)
- BOSS LOOT: Reward overlay now detects boss wins (or cosmetic reward labels: frame/aura/title/emblem/badge) and plays an animated LOOT DROP — item glyph (🎖️ boss / 🌀) drops with bounce + spin + pulsing glow, "★ LOOT DROP ★" header, "Equip it in your Locker / Loadout" hint, on top of the XP. Normal quests keep the standard reward burst. (reward state now {label, boss}.)
- AMBIENT ZONE MUSIC: 3 generated looping pad WAVs (assets/sfx/amb1-3.wav) mapped to zone bands (tiers 0-1/2-3/4-5) via sfx.ts startZoneMusic/stopMusic (expo-audio, loop, vol 0.5). Starts on Journey load, stops on unmount, and respects the SAME 🔊/🔇 toggle (disabling stops music; enabling restarts it). Persisted via 'hic_sfx'.
- RIVAL TAUNTS: rivals on the map lane are now tappable (testID rival-<id>) → a speech-bubble taunt appears above them (~2.6s). On load, the rival you most recently passed (highest-XP among those now behind you) auto-taunts ("You're leaving me behind…"). Tap taunts use encouraging/rivalry lines.
- Verified: Journey renders with all features (hero progressed to Grind Sets, rivals lane, header controls), no crash. Lint clean. NOTE pre-existing non-blocking Metro warning: react-native-health-connect (mocked) — unrelated.

## Implemented (2026-06 — Supplements finish + server.py refactor + launch cleanup + Founders free access + Social links)
- SUPPLEMENTS TAB (P0 finish): NutritionCard.tsx was missing ~16 StyleSheet entries (tabs/chips/dropdown/optRow) so the Supplements tab rendered broken. Added all styles. MACROS/SUPPLEMENTS toggle, ＋ ADD SUPPLEMENT dropdown (22 common supps), green chips, add/remove persist via GET/POST /api/supplements. Verified (curl + screenshot + testing_agent).
- BACKEND REFACTOR: split the 3760-line server.py into shared.py (env/db/app/api_router/models/data catalogs/helpers/seed/events/middleware) + routes/*.py (18 domain routers: auth, profile, cardio, verify, exercises, programs, quests, nutrition, enhanced, presets, workouts, leaderboard, chat, ai, payments, judge, coach, misc). Each route module does `from shared import *`; shared exposes everything via a dynamic __all__. server.py is now a thin composition root that imports routes then include_router. Behaviour-preserving (all 111 routes, registration order preserved within each path-prefix group). Route files carry `# ruff: noqa: F403, F405`. Verified: 31/31 pytest + full frontend regression (iteration_17).
- LAUNCH CLEANUP: removed ALL demo/test human accounts (athlete/elite/freak@test.com etc.) and ALL user-made/CI profiles (95 deleted + their user-keyed data). seed() no longer creates test users (idempotently purges the 4 legacy demo emails). DB now holds ONLY the 10 permanent AI bot athletes + owner. Bots given password 'BotPass123!' so they double as deterministic test logins. active-count already returns max(10, real). Leaderboards populated by the 10 bots.
- FOUNDING BETA FREE ACCESS: first FOUNDER_LIMIT(100) non-bot signups (by created_at) get is_founder=true (+ founder_number) via shared.founder_status(), surfaced in /auth/me, /profile/me, register & login responses. Frontend gates for subscription/Skool features (Judge, Community chat, Athlete's Center AI, The Room premium part, The Enhanced subscription part, workout AI) now also unlock on `user?.is_founder`. RANK gates (Advanced/Elite) still apply. Home premium badge shows "★ FOUNDER". New public GET /api/founders/spots {taken,limit,remaining}. Login screen shows a gold "★ FOUNDING BETA · FREE ACCESS · N spots left" banner (testID founder-banner).
- SOCIAL LINKS (TikTok/Instagram): ProfileUpdate gained social_tiktok/social_instagram; shared.social_handle() normalizes a pasted handle OR full URL to a bare username. Returned in /auth/me and /api/users/{id}/public. New src/components/SocialLinks.tsx: SocialLinksEditor (own player card, ME tab, below the card — inputs + SAVE LINKS) and SocialLinksBar (tappable chips on MemberSheet for other members). Chips open https://www.tiktok.com/@handle & https://www.instagram.com/handle (universal links open the installed app, else the website). Verified end-to-end.

## Implemented (2026-06 — Founder Spotlight + Creator badge + Referral Perks)
- FOUNDER SPOTLIGHT: first 100 non-bot members (is_founder) get a glowing gold "★ FOUNDING 100 · #N" ribbon on their player card (src/components/Badges.tsx FoundingRibbon, reanimated glow) — shown on own profile card (ME tab) and, as a compact badge, on other members' MemberSheet. /api/users/{id}/public now returns is_founder + founder_number. Founders wall (founders.tsx) upgraded: header + per-row creator/backer markers.
- CREATOR BADGE: any member who linked a TikTok/Instagram shows a "✔ CREATOR" badge (Badges.tsx CreatorBadge) on their card + MemberSheet (no follower counts per user choice). /api/users/{id}/public returns is_creator; /api/founders returns a creators[] list; founders.tsx gained a CREATORS tab listing creators with tappable social chips (SocialLinksBar).
- REFERRAL PERKS: new users get a referral_code (default_user_doc). RegisterInput accepts referral_code; shared.apply_referral() links referred_by, pays the friend +50 XP (REFERRED_XP) and the inviter +100 XP (REFERRER_XP) per referral, tallies referral_count, and grants the 'recruiter' badge at 3 (RECRUITER_BADGE_AT). New GET /api/referral -> {code,count,recruits,referrer_xp,referred_xp,badge_at,has_badge,to_badge}. Signup screen (index.tsx) has an optional 'Referral code' input (testID input-referral, signup-only); auth.tsx registerEmail passes it. Founders wall shows a RECRUIT card: code + Share (native share sheet) + "N RECRUITED" + progress to RECRUITER badge.
- Verified: iteration_18 — 13/13 backend pytest (test_founder_referral_creator.py) + full frontend flows (ribbon #N, creator badge, recruit card code+share, CREATORS tab, signup referral field). Test signups purged post-test; launch DB = 10 bots only, founders 0/100.

## Implemented (2026-06 — Creator/Admin account + Enhanced access without red theme)
- ADMIN ACCOUNT: the9hutch@gmail.com ("The Hutch") is the creator/admin. shared.OWNER_ADMIN_SET grants all_rooms_access + skool_verified + athletes_center_access + enhanced_access + is_admin. seed() upserts the owner (Google-only, no password) so it always exists as admin; ensure_owner_admin() re-applies the flags on /auth/me, login and google_session. Admin is EXCLUDED from founder counts (founder_status + /founders + /founders/spots skip is_admin) and from the level/strength/ratio leaderboards, so the launch board stays the 10 bots and spots stay 0/100.
- ENHANCED ACCESS WITHOUT RED: new `enhanced_access` flag unlocks The Enhanced room + PED tracker WITHOUT the global red takeover (the red theme only flips on the separate `enhanced` flag via EnhancedSync). Backend enhanced writes (regimen, regimen/note, next-dose) now allow `enhanced OR enhanced_access`; /enhanced/status returns enhanced_access. Frontend enhanced.tsx shows the tracker when enhanced_access is set and never calls applyEnhancedPalette for it, so the admin sees the room in-place with the app staying cyan. Verified: status enhanced=false/enhanced_access=true, POST regimen 200, /auth/me enhanced falsy. 44/44 regression pytest green.

## Implemented (2026-06 — Admin Panel: badges/verify/founders/featured, Enhanced toggle, rank control, bans, Judge moderation)
- ADMIN PANEL (/app/frontend/app/admin.tsx, admin-only route /admin; entry "⚙ ADMIN" button on Home shown when user.is_admin). Backend routes/admin.py (all gated by _require_admin / is_admin, non-admin → 403):
  - GET /admin/members?q= (search) returns member briefs + ADMIN_BADGE_OPTIONS (shared.py).
  - POST /admin/grant-badge {user_id,badge,on} add/remove badge.
  - POST /admin/verify-member {user_id,skool_verified/email_verified/phone_verified}.
  - POST /admin/founder {user_id,on} sets founder_grant → founder_status() honors it (is_founder true regardless of signup order).
  - POST /admin/set-rank {user_id,direction:up|down} snaps XP to the tier floor (RANK_ORDER + LEVELS_PER_RANK*250).
  - POST /admin/ban {user_id,scope:login|chat|all,minutes,reason} + POST /admin/unban. shared.ban_state() enforced in get_current_user (login/all → 403), auth login (login/all → 403), chat post_message (chat/all → 403). login/all bans also delete the user's sessions (force logout). Admins are never banned.
  - Featured/Spotlight: GET /featured (any authed user), POST /admin/featured {user_id,reason}, DELETE /admin/featured/{user_id} → featured_members collection.
- ENHANCED TOGGLE: POST /admin/enhanced-theme {on} flips the admin's own `enhanced` flag on/off; admin.tsx switch (admin-red-toggle) applies/removes the crimson palette (persistEnhancedFlag + applyEnhancedPalette + reload on web).
- HOME SPOTLIGHT: index.tsx fetches /featured and renders a "★ SPOTLIGHT" section (reason + tap → MemberSheet).
- JUDGE MODERATION: DELETE /judge/{submission_id}/comments/{comment_id} (admin OR comment author); judge.tsx shows an ✕ (del-comment-<id>) on eligible comments. FIX: added user?.is_admin to judge.tsx canJudge so the admin can enter The Judge to moderate.
- Verified: iteration_19 — backend 12/12 pytest (test_admin_features.py) + frontend flows (admin entry, spotlight, red toggle flips UI, member search, up-rank BEGINNER→INTERMEDIATE, mute pill, unban). Judge access fix confirmed via screenshot. The Hutch (the9hutch@gmail.com, Google) is the production admin; temp password admins purged → launch DB = 10 bots, founders 0/100.

## Verified/Hardened (2026-06 — Emergent-managed Google sign-in)
- Emergent Google OAuth was already integrated (frontend "CONTINUE WITH GOOGLE" in app/index.tsx via WebBrowser.openAuthSessionAsync + Linking; backend POST /api/auth/session exchanges session_id with demobackend.emergentagent.com/auth/v1/env/oauth/session-data via X-Session-ID). Reviewed against the current playbook — all core rules already satisfied: platform-specific redirect (Linking.createURL('') mobile / window.location.origin+'/' web), web uses window.location.href (not openAuthSessionAsync), hash-fragment regex parse, frontend never calls demobackend, token in SecureStore(mobile)/localStorage(web) (never AsyncStorage), Bearer auth, upsert-by-email (no dup user_id), timezone-aware 7-day sessions, unique indexes + expires_at TTL, 401 on invalid session_id, get_current_user returns 401 (not 403) on missing header.
- HARDENING applied this session:
  1) Hoisted the callback exchange into a guarded useCallback with a processedSessions Set ref so the same session_id is never POSTed twice (mobile fires openAuthSessionAsync result + url listener + getInitialURL for one deep link); on transient failure the id is un-marked to allow retry. google() now funnels its result through the same guarded exchangeSession.
  2) Added the temporary-ban check (ban_state) to POST /auth/session so a suspended member cannot obtain a session via Google (parity with email login); the just-minted session row is deleted and 403 returned.
- Not e2e testable in preview (needs a real Google account through auth.emergentagent.com); verified: invalid session_id→401, missing field→422, Google button renders, tsc clean.

## Implemented (2026-06 — Twilio SMS: phone OTP + admin announcements)
- Integration via integration_expert playbook (Twilio Python SDK v9). Credentials in backend/.env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (+13653348824). NOTE: user's provided "Verify Service SID" was actually their Account SID (invalid), so OTP uses the app's OWN codes (gen_verify_code/_store_code/_consume_code) sent via Twilio Messages API — NOT Twilio Verify. This needs only SID+Token+Number.
- shared.py: twilio_configured(), _twilio() (lazy Client), to_e164() (normalizes handles: adds +1 for 10-digit, + otherwise), async send_sms(to, body) via starlette run_in_threadpool (sync SDK off the event loop). twilio==9.11.0 added to requirements.txt.
- routes/verify.py: /verify/phone/send now sends the real code via send_sms when twilio_configured() (returns {mock:false}); 502 on Twilio failure; falls back to {mock:true, code} if Twilio not configured. /verify/phone/confirm unchanged (sets phone_verified + phone). VerifyPanel.tsx shows "Code texted to …" on real send and the dev-code box only in mock mode.
- routes/admin.py: GET /admin/sms-status {configured, from_number, reachable}; POST /admin/announce {message} broadcasts SMS to all phone-verified non-bot members (per-recipient try/except → {sent, failed, recipients}), logs to `announcements` collection. Admin Panel (admin.tsx) has a "📣 SMS ANNOUNCEMENT" card (input + send, gated on configured).
- Verified: credentials auth OK (account active), from-number owned by account, live Messages API returned 201 + SID (send path works end-to-end), sms-status configured:true, announce validation (empty→400), e164 normalization. TRIAL-ACCOUNT LIMIT: real delivery only to numbers verified in the Twilio console until the account is upgraded; messages carry a trial prefix.

## Changed (2026-06 — Twilio/phone verification hidden)
- Per user request, phone verification + Twilio SMS features are HIDDEN from the app UI (email verification kept). VerifyPanel.tsx: removed the PHONE status chip + "VERIFY PHONE" button (email-only now). admin.tsx: removed the "📣 SMS ANNOUNCEMENT" card + its state/handler.
- Backend endpoints (/verify/phone/*, /admin/announce, /admin/sms-status) and the Twilio env keys (TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER) are RETAINED in .env + code for future re-enable — just not surfaced in the UI.

## Implemented (2026-06 — One-time "Remove Enhanced Status")
- Settings/CONFIG screen (settings.tsx): new "ENHANCED STATUS" section (shown only if user.enhanced or enhanced_removal_used). Button "REMOVE ENHANCED STATUS" → POST /api/enhanced/remove (sets enhanced=false + enhanced_removal_used=true, unsets enhanced_since; reverts red theme via persistEnhancedFlag(false) + reload on web). After use the button greys out and reads "ONLY AVAILABLE ONCE" (disabled). Backend enforces one-time (2nd call → 400). /enhanced/status now returns enhanced_removal_used. Verified end-to-end.

## Implemented (2026-06 — The Vault store + SEC-001 fix)
- SEC-001 FIX (from security audit): removed hard-coded owner default password from source; seed now only sets owner password from OWNER_DEFAULT_PASSWORD env (strong value set in backend/.env), reset owner's live password. Old "HutchAdmin2026!" now rejected (401). New owner login in test_credentials.md.
- THE VAULT store: routes/store.py — store_items catalog (kind: avatar|banner|title|badge|background|aura; rarity; drop_month "YYYY-MM"; code-drawn visual spec colors/glow/motion/icon; $1). Endpoints: GET /store (this month's live drop + owned collection + equips), POST /store/purchase (grants item; validates active+current-month; records store_purchases), POST /store/equip (own+set store_equips[kind]). Admin: GET/POST /admin/store, DELETE /admin/store/{id}. Non-admin create → 403. Monthly rotation: items only live when drop_month==current month ("never available again").
- Frontend: app/store.tsx ("THE VAULT" — AUGUST 2026 DROP / MY VAULT tabs, item cards, UNLOCK $1 / EQUIP). src/components/StoreCosmetic.tsx renders animated code-drawn cosmetics (reanimated glow/pulse/orbit + expo-linear-gradient, rarity-colored). Home "🛒 STORE" entry button. Admin Panel "🛒 STORE DROPS" section: create/schedule drops (kind/rarity/motion/colors/icon chips + name/desc) + list/delete.
- PAYMENT: user chose RevenueCat IAP. Preview/web grants directly on UNLOCK (testable). PRODUCTION: real $1 charge requires configuring a RevenueCat consumable product + App Store/Play product and a device build — IAP cannot run in Expo Go/web. The /store/purchase grant is the post-purchase hook.
- Verified: admin create→member sees live→purchase→equip→owned reflected→non-admin 403; store screen renders with animated cosmetic. tsc clean.


## Implemented (2026-06 — Pets verified + Avatar art redesign)
- PETS VERIFIED: store `pet` kind + `equipped_pet` snapshot render correctly via src/components/PetCompanion.tsx on the Profile player card (below frame name) and on The Journey map beside the hero sprite. Verified with a seeded pet on a bot (screenshots: profile card + journey Lv45 hero with Cyber Wolf).
- AVATAR ART REDESIGN (user request): replaced ALL 19 anime hero avatars (both male av_*.png + female av_*_f.png = 38 images) with STYLIZED 3D VIDEO-GAME character renders (Fortnite/Overwatch/Valorant/Pixar look) of BASIC HUMANS in basic clothing (plain grey tee + dark joggers + sneakers), FULL BODY head-to-toe standing pose on a dark blue-rim background. The only differences between avatars are race/ethnicity + hair colour; gender preserved (male art for male users, female for female via avatarImage(id,sex)). Avatar IDs/labels UNCHANGED (no data migration). Generator: backend/gen_basic_humans.py (emergentintegrations gemini-3.1-flash-image-preview; LOOKS dict maps avatar_id→ethnicity+hair; writes av_<name>.png / av_<name>_f.png). NOTE: avatar_hutch ("Coach") intentionally KEPT as the original anime Hutch persona (branded owner avatar; no female variant). Verified via picker + profile card + HOME screenshots.

## Implemented (2026-06 — The Armory: full-body skins + weapons)
- CONCEPT (per user): ALL equipment = full-body SKINS that swap the whole avatar; WEAPONS are a separate prop beside the avatar. Three unlock tiers.
- BACKEND routes/gear.py: catalogs — PAID_SKINS (10 @ $1: Dragon Knight, Super Saiyan, Mecha Pilot, Spec-Ops/CoD, Space Warrior/Halo, Viking, Battle Valkyrie/Mercy, World's Strongest, Kombat Ninja, Scout Regiment/AoT), FREE_SKINS (7 by level: Anime L2, Steel Knight L6, Cyber L10, Astronaut L16, Gladiator L22, Iron Monk L30, Arcade L38), QUEST_SKINS (4, gated on boss/monthly quest claims: Shadow L=hard3, Flame hard6, Frost boss5, Celestial hard12), FREE_WEAPONS (4 by level), PAID_WEAPONS (4 @ $1), QUEST_WEAPONS (3). Endpoints: GET /gear (rows w/ source paid|level|quest + owned/unlocked/equipped + quest_counts), POST /gear/equip-skin, POST /gear/equip-weapon (fail-closed 403 if not owned/unlocked), POST /gear/purchase {kind,id} (grants paid item; RevenueCat post-purchase hook, web grants directly). Quest unlock computed from quest_claims quest_key prefix (boss:/monthly:). User fields: owned_skins[], owned_weapons[], equipped_skin, equipped_weapon. equipped_skin/weapon added to /users/{id}/public.
- ART: 21 full-body skins (assets/images/skins/skin_*.png, stylized video-game renders) + 11 weapon props (assets/images/weapons/w_*.png, transparent chroma-keyed props). Generators: gen_skins.py, gen_free_skins.py, gen_quest_gear.py, gen_weapons.py.
- FRONTEND: src/lib/theme.ts SKIN_IMAGES/WEAPON_IMAGES require maps + skinImage/weaponImage/bodyImage helpers (bodyImage = equipped skin overrides base human avatar). src/components/GearedAvatar.tsx stacks body + weapon overlay. Wired into profile card, HOME hero, Journey map hero. New screen app/gear.tsx "THE ARMORY" (SKINS/WEAPONS tabs; EQUIP/✓EQUIPPED, UNLOCK·$1 for paid, 🔒 lock text for level/quest). Entry from Profile (open-armory) + Vault/store (store-open-armory).
- NOTE: earlier layered per-slot gear approach (assets/images/gear/*) was abandoned per user pivot to full skins; those files are unreferenced/unbundled.
- Verified: GET /gear (21 skins/11 weapons), purchase+equip skin (Dragon Knight swaps avatar) + weapon (Plasma Katana prop) rendered on profile card via screenshot; lock gating curl (locked free/quest/unowned-paid → 403, unlocked → 200).

## Implemented (2026-06 — Rarity tiers + Gear everywhere + Monthly drops + Store expansion + Customize rename)
- RARITY (5 tiers): Common/Rare/Epic/Legendary/?????? (mythic secret tier, red). Central: frontend theme.ts RARITY map + rarityColor/rarityLabel/rarityKey/rarityFromLevel (legacy exalted→epic, eternal→mythic). Applied to Armory (skins/weapons rows + legend row) and Store cosmetics (badges/titles/auras/pets rarity label). gear.py skins/weapons rarities remapped to 5-tier.
- GEAR EVERYWHERE: equipped_skin now overrides base avatar via bodyImage() in PlayerAvatar (leaderboard/chat/loadout previews), MemberSheet, profile card, HOME hero, Journey map. chat.py join + posted msg include equipped_skin + sex; /users/{id}/public + leaderboard already carry it.
- MONTHLY SKIN DROP: paid skins carry drop_month; /api/gear skin rows add drop_month/drop_label/available/upcoming/vaulted; purchase gated to current-month (410 otherwise). Launch schedule: 2026-08 = dragonknight/dbz/mercy (mythic) live; 09 = mecha/halo/mk; 10 = cod/viking/wsm; 11 = aot. Past months = VAULTED (gone), future = DROPS <month>.
- ARMORY sections: THE ARMORY splits into ✓ UNLOCKED and 🔒 LOCKED groups per tab, rarity legend, monthly-drop buttons (UNLOCK $1 / 🗓 DROPS Mon / ⛔ VAULTED). Store nav button added (armory-open-store).
- STORE (renamed from THE VAULT → THE STORE; MY VAULT→MY ITEMS): now also shows current-month paid HERO SKINS + WEAPONS sections for $1 purchase (buy → /api/gear/purchase). Seeded 6 house BADGES + 6 TITLES (+ existing aura/pet) into store_items via seed() (rarity-tiered, code-drawn StoreCosmetic). Armory link at top.
- PHOTO UPLOAD REMOVED: loadout.tsx photo upload + USE PHOTO toggle removed (ImagePicker/upload code gone). Avatars/skins only. Profile card use_photo branch removed.
- LOCKER renamed → "CUSTOMIZE PROFILE" (loadout.tsx h1 + profile link). Locker/loadout now has STORE + ARMORY nav buttons.
- Verified: /api/gear (21 skins/11 weapons, monthly states), store live=14 (6 badge/6 title/aura/pet), lock gating 403, equip skin+weapon renders on card, Armory unlocked/locked + legend + ?????? tier, Store badges/titles + Armory link render (screenshots). tsc clean (only pre-existing revenuecat error).

## Implemented (2026-06 — Store expansion + Inventory merge)
- STORE now sells paid HERO SKINS (current-month drop) + WEAPONS ($1) plus seeded house BADGES (6) + TITLES (6) — all rarity-tiered. Armory link on Store; Store link on Armory + Inventory.
- HOME "INVENTORY" HUD button REMOVED (RECAP + RANKS remain). Vault contents (APP BACKGROUNDS + WIDGETS via /api/unlockables) MOVED into the customize-profile screen.
- customize-profile/loadout screen RENAMED to "INVENTORY" (h1 + eyebrow + profile link "◆ INVENTORY — GEAR, FRAMES & BACKGROUNDS"). It now has STORE + ARMORY nav buttons, EMBLEM/AURA/TITLE/FRAME customization, and APP BACKGROUNDS + WIDGETS. (/app/vault.tsx standalone still exists but is no longer linked from Home.)
- Verified: testing_agent iteration 20 — 22/22 backend pytest (tests/test_armory_gear_store.py) + full frontend flows PASS (equip skin+weapon swaps avatar + prop; store skins/weapons/badges/titles; inventory backgrounds+widgets; home INVENTORY btn gone; photo upload gone). NOTE: run that suite with `-n0` (xdist parallel causes false-positive races on shared bots).

## Implemented (2026-06 — Base avatars reduced to 5 per gender)
- Reduced base avatars from 20 to 5 per gender: White, Black, Asian, Native, Indian (IDs avatar_white/black/asian/native/indian). Male art for male users, female for female (avatarImage(id,sex)).
- Regenerated 10 images (av_<race>.png + _f) via gen_base5.py (same full-body stylized video-game style). theme.ts AVATARS + AVATAR_IMAGES + AVATAR_IMAGES_F trimmed to the 5.
- Backend: default_user_doc + all "avatar_ronin" fallbacks → "avatar_white"; seed bots + seed chat avatars remapped across the 5. DB migration remapped all existing users + chat_messages off old ids onto the 5.
- Verified: SELECT CLASS picker shows exactly the 5 (screenshot), tsc clean. Old avatar_* image files remain on disk but are unreferenced/unbundled.

## Implemented (2026-06 — Hair colour + Boss loot drops + Gear in feed)
- HAIR COLOUR: 5 colours per avatar (Black/Brown/Blonde/Red/White); skin tone = the 5 race avatars. 50 variant images av_{race}_{hair}(_f).png via gen_hair.py. theme.ts AVATAR_IMAGES/_F keyed `${race}_${hair}` + HAIR_COLORS + defaultHair + avatarImage(id,sex,hair) + bodyImage passes person.equipped_hair. Saved via equipped_hair (added to ProfileUpdate model → PATCH /profile/update). Profile SELECT AVATAR modal shows 5 races + HAIR COLOUR swatch row (testID hair-{color}); recolours thumbnails + card live. equipped_hair in /auth/me, public_user, chat join.
- BOSS LOOT DROPS: gear.quest_loot_for_claim(user_id,scope) returns quest-exclusive skins/weapons that JUST unlocked from a claim (compares counts before/after). POST /quests/claim now returns `loot` array. quests.tsx BossReveal shows LEGENDARY DROP reveal (skin/weapon image + rarity) for boss OR any claim returning loot.
- GEAR IN FEED: PlayerAvatar (chat/leaderboard/member sheet) renders equipped skin via bodyImage + gold 'geared' ring (#FFD24A) when equipped_skin set + ⚔️ weapon badge when equipped_weapon set. equipped_weapon+equipped_hair added to chat message join; leaderboard already returns full docs.
- Verified: testing_agent iteration 21 — 10/10 backend (tests/test_gear_hair_lootdrop.py, run -n0) + frontend (5-avatar picker + 5 hair swatches recolour live; loot/ring/badge code paths) all PASS. Bots reset.
- Minor known (non-blocking): PATCH equipped_hair:null ignored (no clear-to-default via API; frontend never sends null).

## Implemented (2026-06 — Rival Loadout Peek + Seasonal Boss Skin + Facial Hair)
- RIVAL LOADOUT PEEK: MemberSheet now renders the member's full equipped skin + weapon via GearedAvatar + a "⚔ SKIN/WEAPON EQUIPPED" loadout line. Journey map rival taunt bubble gained a "👁 LOADOUT" button (peek-<uid>) opening MemberSheet; leaderboard already opens it. Backend added equipped_skin/weapon/hair/beard to /users/{id}/public.
- SEASONAL BOSS SKIN: gear.py SEASON_SKINS (Void Overlord, mythic, season 2026-S3, unlock by defeating 6 bosses THIS season). _current_season()=YYYY-S{quarter}. gear list source "season" with active/vaulted flags; equip-skin grants+persists to owned_skins when earned in-season; quest_loot_for_claim drops it on the boss claim that crosses the threshold (during active season). Vaults (locked) after season ends unless owned. Armory lockText shows SEASONAL/VAULTED. Image skins/skin_season1.png (SKIN_IMAGES map).
- FACIAL HAIR: Beard toggle (Clean/Beard) for MALE avatars. 25 variant images av_{race}_{hair}_beard.png (gen_extras.py). theme.ts AVATAR_BEARD_IMAGES + BEARD_OPTIONS; avatarImage(id,sex,hair,beard) uses beard variant for males; bodyImage passes person.equipped_beard. Saved via equipped_beard (ProfileUpdate). Profile modal FACIAL HAIR row (male only, testID beard-{none|beard}); recolours live. equipped_beard in public_user + chat join.
- Verified: beard picker screenshot (all avatars + card show beard, Clean/Beard toggle), season skin row + beard PATCH via curl, tsc clean.

## Implemented (2026-06 — Season Board) + BLOCKED (Hairstyles)
- SEASON BOARD (DONE): new "🔥 SEASON" leaderboard board_type in routes/leaderboard.py — counts boss quest_claims (quest_key ^boss:) made during the current season (calendar quarter, claimed_at >= quarter start), sorts desc, metric_label "Bosses". Added SEASON board chip to leaderboard.tsx BOARDS. Verified: /api/leaderboard/season returns [] with 0 boss claims; SEASON tab renders + empty state. Vaults implicitly each quarter (window resets).
- HAIRSTYLES (BLOCKED — art not generated): prepared gen_styles.py to make 3 styles (long/buzz/pony) × 5 races × 5 colours × 2 genders = 150 images (av_{race}_{colour}_{style}(_f).png). Generation FAILED: Emergent LLM key hit "Daily spend limit reached" (litellm OpenAIException) after ~200 images generated today. NO hairstyle requires/picker/backend were wired (would break bundle with missing files). TO COMPLETE: add balance to Universal Key (Profile→Manage plan→Universal Key→Add Balance) or wait for daily reset, then run `cd /app/backend && for s in long buzz pony; do python gen_styles.py $s; done`, verify 150 files exist, then add AVATAR_IMAGES keys `${race}_${hair}_${style}` + a STYLE picker row + thread style through avatarImage(id,sex,hair,beard,style)+bodyImage + equipped_style field (mirror equipped_hair/beard plumbing in profile.py/chat.py/shared ProfileUpdate).

## Implemented (2026-06 — Season Countdown + Loadout Compare) · Hairstyles STILL BLOCKED
- SEASON COUNTDOWN (DONE): leaderboard.tsx seasonDaysLeft() computes days to end of current calendar quarter; orange banner "🔥 SEASON ENDS IN X DAYS — grind bosses before it vaults" shown when SEASON board active. Verified (43 days).
- LOADOUT COMPARE (DONE): MemberSheet now shows a "LOADOUT COMPARE" block (YOU vs RIVAL) with skin + weapon thumbnails side-by-side (from useAuth user vs the peeked member); hidden when viewing your own sheet (isMe). Verified via screenshot (my DBZ skin + katana vs rival dashes).
- HAIRSTYLES (STILL BLOCKED): Emergent LLM key still returns "Daily spend limit reached" — 150 style images cannot be generated. gen_styles.py ready. User must add Universal Key balance / wait for daily reset, then run generation + wiring (see prior PRD entry for steps).


## Implemented (2026-06 — Workout Logger fix + Manual Rest + Season History)
- WORKOUT LOGGER FIX (workout.tsx): removed the RPE column entirely (per user). Set rows now render SET · REPS · WEIGHT with clean manual `NumInput` text boxes (reps=number-pad, weight=decimal-pad) + save-preset ☆ + remove ✕. Removed the now-unused `Stepper` component. Verified via screenshot: reps=8 / weight=95 populate correctly in the input boxes; columns aligned.
- MANUAL REST TIMER (workout.tsx): removed `startRest()` auto-calls from `addSet` + `addSetFromPreset` so the rest timer NEVER auto-starts. Added a "⏱ REST" button (testID start-rest) in the session header beside the unit toggle — tapping it starts the floating countdown. Verified: adding a set does NOT show the rest bar; tapping REST shows the 1:59 countdown with -15/+15/SKIP.
- SEASON HISTORY / HALL OF FAME: backend GET /api/leaderboard/season/history (routes/leaderboard.py) buckets all boss quest_claims by calendar quarter (via _season_label), EXCLUDES the current season, and returns each PAST season's top boss-slayer champion {season "YYYY-SQ", bosses, display_name, avatar/skin/weapon/hair/beard, rank, level, founder_backer}, newest first. No cron/snapshot needed — derived live from real claim timestamps. Frontend leaderboard.tsx: SEASON board gained a "THIS SEASON / 🏆 PAST CHAMPIONS" toggle (testIDs season-live/season-history); PAST CHAMPIONS renders gold champion cards (trophy + season label + PlayerAvatar + rank + boss count), tap → MemberSheet. Verified: endpoint returns correct champions for 2026-S1/S2 (current S3 excluded) via inserted test claims; UI toggle + empty state render.

## Implemented (2026-06 — Workout Tracker rewrite + Season Trophy) · Hairstyles STILL BLOCKED
- WORKOUT TRACKER REWRITE (workout.tsx): user reported set inputs "still not working." Replaced the fragile controlled `NumInput` (had a focus-ref + useEffect prop-sync that caused invisible values / cursor jumps) with a self-contained `SetRow` component: SET number (auto-ascending badge from map index+1, high-contrast cyan box), plus fully INDEPENDENT REPS (number-pad) and WEIGHT (decimal-pad) TextInputs that each hold their OWN local text state and report up on every keystroke. Every set now carries a stable `id` (module `sid()` at addSet/addSetFromPreset + a normalization useEffect that injects ids into AI/monthly/template/repeat/plan sets). Rows keyed by `${set.id}-${unit}` so mid-list removal + unit toggle stay correct (remount re-inits from latest values). Removed the old `Stepper`/`NumInput` + `useRef` import. Header columns re-aligned (SET width40 · REPS flex · WEIGHT flex · actions width56). VERIFIED via automation: typed 12/185, 10/205, 8/225 into 3 sets → all independent + retained; removed MIDDLE set → remaining rows correctly show SET1=12/185, SET2=8/225; SET numbers render clearly; no auto rest timer; manual ⏱ REST works. tsc clean.
- SEASON TROPHY (permanent champion badge): shared.py added `season_label_for`, `season_champions_map()` (top boss-slayer per PAST season), `season_titles_for(user_id)`. `season_champ_titles` (list of "YYYY-SQ" won) now returned in /auth/me, /auth/login, /auth/register, /auth/session, and /users/{id}/public. leaderboard.py season_history refactored to reuse season_champions_map. Frontend Badges.tsx new `SeasonChampBadge` (gold glowing "🏆 SX YYYY CHAMP" pill, one per season won) rendered on the profile player card (profile.tsx, from user.season_champ_titles) and as gold chips in MemberSheet (from m.season_champ_titles). VERIFIED: badge "🏆 S1 2026 CHAMP" renders on ME card after seeding a past-season boss claim; test data cleaned up.
- HAIRSTYLES (STILL BLOCKED): Emergent LLM key STILL returns "Daily spend limit reached" (confirmed via a 1-image budget probe on gemini-3.1-flash-image-preview). Cannot generate the 150 style images (av_{race}_{colour}_{style}(_f).png) — wiring them without files would crash the bundle. gen_styles.py is ready. TO COMPLETE: user adds Universal Key balance (Profile→Manage plan→Universal Key→Add Balance) or waits for daily reset, then `cd /app/backend && for s in long buzz pony; do python gen_styles.py $s; done`, verify 150 files, then add AVATAR_IMAGES `${race}_${hair}_${style}` keys + a STYLE picker row + thread style through avatarImage/bodyImage + equipped_style field (mirror equipped_hair/beard plumbing).


## Implemented (2026-06 — Champion Spotlight on Home)
- HOME REIGNING CHAMPION card (index.tsx): fetches GET /api/leaderboard/season/history and shows the most recent past-season champion [0] in a gold card just below the hero — champion PlayerAvatar (geared), "👑 REIGNING CHAMPION · <SX YYYY>", name, "<n> bosses slain · <RANK>", and "Dethrone them this season →". Tap (testID reigning-champion) opens their MemberSheet. Hidden when there are no past seasons yet. Verified via screenshot (Apex Prime · S2 2026 · 3 bosses · WARRIOR); test claims cleaned up. New styles champCard/champAvatar/champEyebrow/champName/champMeta/champHint/champTrophy + module fmtSeason helper.

## Implemented (2026-06 — In-Person Clients room)
- NEW private coaching room for in-person clients (user request). ADMIN toggles a member as an in-person client + sets the gym they train at in the Admin Panel (POST /api/admin/inperson {user_id,on,gym}; _member_brief now returns inperson_client + inperson_gym). Only the admin + enrolled clients see the room (Home CTA open-inperson gated on user.is_admin || user.inperson_client, with an unread badge from GET /api/inperson/unread).
- BACKEND routes/inperson.py: private 1-on-1 threads keyed by client_id. GET /inperson/clients (admin list w/ last msg + unread), GET /inperson/thread/{client_id} (messages + assigned programs + client brief incl gym; admin any, client self-only → 403 otherwise; marks read), POST /inperson/thread/{cid}/message {text,media_id?}, POST /inperson/upload (images + PDF/doc/xls/txt/csv via ALLOWED_DOC_TYPES/MAX_DOC_BYTES 25MB → Emergent Object Storage/chat_media, served by existing /api/chat/media/{id}?token=), POST /inperson/thread/{cid}/assign {name,plan_text,note} (parses "Name SxR @weight" lines into exercises with explicit sets, stores inperson_programs + logs a program message), POST /inperson/programs/{id}/started, GET /inperson/unread. Registered in server.py.
- FRONTEND app/inperson.tsx: admin sees a client list → taps into a thread; client opens their own room directly. Chat bubbles (admin gold/right, client left), image inline + file chips (tap opens/downloads), assigned-workout cards. Files sent via expo-image-picker (images) + expo-document-picker (docs). Client taps "START WORKOUT" → setPendingWorkoutExact() loads the assigned program (explicit sets) into the logger (verified: Back Squat 4x6 @225 etc.). GYM NAME shown in the header + as a large rotated translucent watermark behind the room. Admin has an "ASSIGN A WORKOUT" modal (name + one-exercise-per-line plan + note). Added setPendingWorkoutExact to src/lib/pendingWorkout.ts. Admin Panel (admin.tsx) gained an IN-PERSON CLIENT toggle + gym input per member.
- VERIFIED: admin enroll+gym, clients list, message, assign (parsed 3 exercises), client thread + unread 2→0, privacy 403, START loads logger, admin thread + assign button + gym header/watermark, Home CTA both roles. Test data cleaned (launch DB = 10 bots + owner, no in-person artifacts).

## Implemented (2026-06 — In-Person room: Assign From Logger + Scheduling + Progress Peek)
- ASSIGN FROM LOGGER: workout.tsx active session shows an admin-only "🏋 ASSIGN TO IN-PERSON CLIENT" button (below FINISH). Opens a client picker (GET /inperson/clients) → assigns the current sessions structured exercises (name + explicit sets) via POST /inperson/thread/{cid}/assign {name, exercises}. Backend already accepts exercises directly. Verified: button + picker render, structured assign 200.
- SESSION SCHEDULING: user field inperson_next_session (free-text date/time). POST /inperson/thread/{cid}/schedule {next_session} (admin) stores it + logs a system message. _person_brief + clients list return next_session. inperson.tsx: admin sees an editable "📅 Next session" input + SET at the top of the room; client sees a read-only banner. Verified.
- CLIENT PROGRESS PEEK: GET /inperson/thread returns client_stats (admin only) = {prs, workouts_logged, streak_days, recent[6]{name,date,sets,volume,pr}} via _client_stats (aggregates db.workouts). inperson.tsx admin thread has a collapsible "📊 CLIENT PROGRESS" panel (PR grid BENCH/SQUAT/DEAD/OHP + workouts/streak + recent workout rows w/ 🏅 on PR days). Verified (185/275/315/115, 30 workouts, recents).
- system-kind messages render as centered lines. Test data cleaned (launch DB clean).

## Implemented (2026-06 — In-Person room: Weekly Check-In + Attendance Log)
- WEEKLY CHECK-IN: client logs progress between sessions. POST /inperson/thread/{cid}/checkin {text, media_id?} stores a kind="checkin" message (note + optional progress photo via /inperson/upload). Thread response returns checkin_due (true if no check-in in last 7 days). inperson.tsx: client sees a green "📝 LOG THIS WEEKS CHECK-IN" prompt at the top when due → CheckinModal (note + optional photo). Check-ins render as distinct green cards (date + photo + note) in the thread for both client and admin. Verified (checkin_due True→False, card renders).
- ATTENDANCE LOG: POST /inperson/thread/{cid}/attendance {note?} (admin) records an inperson_attendance entry + logs a "✅ Session completed" system message; thread returns attendance[] + attendance_count. inperson.tsx admin top panel shows "✅ N sessions logged" + a "MARK SESSION DONE" button. Verified (count 0→2, system messages render).
- Test data cleaned (launch DB clean).

## Implemented (2026-06 — In-Person: Check-In Reminders + Attendance Streak + Program Templates)
- CHECK-IN REMINDERS: GET /inperson/clients now returns checkin_due per client (helper _checkin_due, ≥7 days since last checkin) and floats overdue clients to the top of the admin list; inperson.tsx shows a yellow "⚠ CHECK-IN DUE" badge on those client rows.
- ATTENDANCE STREAK: helper _sessions_this_month (attendance since 1st of month) added to clients list (shown as "📅 N this month" per row) and thread (admin attendance line now reads "✅ N total · 📅 N this month").
- PROGRAM TEMPLATES: inperson_templates collection + endpoints GET/POST/DELETE /inperson/templates (admin-owned). Assign modal (inperson.tsx) shows saved template chips ("tap to assign" one-tap reuse via exercises; long-press to delete) and a "💾 Save as a reusable template" checkbox that saves the built plan (assign endpoint honors save_as_template; also accepts direct exercises). Verified: save-as-template on assign, template list, one-tap reuse to another client (Back Squat 4 sets/Leg Press 3 sets), reminders + monthly count in list & thread. Test data cleaned.

## Implemented (2026-06 — In-Person: Client Notes + Session Goal + Progress Photos Timeline)
- CLIENT NOTES: private coach-only notes per client (user.inperson_notes). POST /inperson/thread/{cid}/notes {notes} (admin). Thread returns coach_notes ONLY for admin (None for client — verified). inperson.tsx: admin sees an editable yellow "🔒 COACH NOTES · private" card at top with SAVE NOTES (+ transient saved ✓). Client never sees it.
- SESSION GOAL: attendance endpoint already stored note; now the "MARK SESSION DONE" button opens an AttendanceModal to capture a focus/goal, saved on the attendance entry + system message. inperson.tsx admin has a collapsible "📋 SESSION LOG (N)" listing each session date + focus note (training log). Verified.
- PROGRESS PHOTOS TIMELINE: thread returns checkin_photos = [{media_id,date}] (chronological, from image check-ins). inperson.tsx shows a horizontal "📸 PROGRESS PHOTOS · before → now" thumbnail strip (both roles) when photos exist; tap opens full image. Verified endpoint (populates from check-in image uploads).
- Test data cleaned (launch DB clean).

## Implemented (2026-06 — In-Person: Overdue Roundup + Body Metrics + Goals Dashboard)
- OVERDUE ROUNDUP: POST /inperson/nudge (admin) messages every client currently overdue on their weekly check-in (uses _checkin_due); returns {nudged}. inperson.tsx client list shows a "🔔 NUDGE N OVERDUE CLIENT(S)" button when any are due, with a confirmation toast. Verified (nudged only the overdue client, skipped the one who checked in).
- BODY METRICS: check-in now accepts metrics {weight, waist, arms} (sanitized via _clean_metrics), stored on the checkin message. Thread returns metrics_timeline (chronological). CheckinModal gained 3 optional numeric inputs (lb / waist" / arms"). Admin+client see a "📈 BODY METRICS" panel listing each entry date + weight (with Δ vs previous) + waist/arms. Verified (212.5→210 shows -2.5).
- GOALS DASHBOARD: new user field inperson_goal (set alongside coach notes via /notes endpoint, accepts goal). Thread returns goal to BOTH roles. inperson.tsx pins a cyan "🎯 GOAL · <goal>" banner at the very top of the room (client sees it too as motivation); admin edits it via a dedicated goal input in the Coach Notes card. Verified.
- Test data cleaned (launch DB clean).

## Implemented (2026-06 — In-Person: Goal Progress + Check-In Streak)
- GOAL PROGRESS: user field inperson_goal_progress (0-100, set via /notes endpoint accepting goal_progress). Thread returns goal_progress (both roles). inperson.tsx goal banner now shows a cyan progress bar + "N% there"; admin has −/+ (5%) nudge buttons that instantly save. Verified (40→45% persists).
- CHECK-IN STREAK: helper _checkin_streak counts consecutive ISO weeks with ≥1 check-in (alive if checked in this or last week). Thread + clients list return checkin_streak. inperson.tsx shows an orange "🔥 N WEEK CHECK-IN STREAK" chip in the room (both roles) and a "🔥 Nw" mini-badge on admin client rows. Verified (3-week streak).
- Test data cleaned (launch DB clean).

## Implemented (2026-06 — In-Person: Streak Milestones + Weight Chart)
- STREAK MILESTONES: when a check-in pushes the consecutive-week streak to a multiple of 4 (4/8/12...), inperson_checkin auto-posts a one-time celebratory system message (deduped via a milestone field): 4=🥉 LOCKED IN, 8=🥈 ELITE, 12+=🏆 LEGEND. inperson.tsx renders 🎉 system messages as a gold celebration pill, and the streak chip is now tiered (bronze/silver/gold color + label) via streakTier(). Verified (4-week streak triggered 🥉 message + badge).
- WEIGHT CHART: new MetricsChart component (react-native-svg) renders the body-metrics weights as a line graph (polyline + dots + min/max lb axis) above the metrics list, shown when ≥2 weight entries exist. Verified (220→211 lb downward trend renders).
- Test data cleaned (launch DB clean).

## Implemented (2026-06 — In-Person: Milestone Confetti)
- MILESTONE CONFETTI: thread returns milestone_celebrate (client-only) = streak when streak%4==0 AND greater than user.inperson_milestone_seen. POST /inperson/milestone-seen marks it acknowledged (dedupe). inperson.tsx: on opening the room with a fresh milestone, a reanimated Confetti overlay (70 colored pieces falling ~3.4s) plays once, then POSTs milestone-seen so it never replays. Admin never sees it. Verified (celebrate=4 first open → 0 after seen; confetti rendered).
- Test data cleaned (launch DB clean).

## Implemented (2026-06 — Milestone Share + Test Client account)
- MILESTONE SHARE: client room shows a branded share card (HUTCH'S INNER CIRCLE + 🔥N + tier + gym + Coached by @the9hutch) with a "📢 SHARE TO STORY" button when streak>0. Captures the card via react-native-view-shot captureRef → expo-sharing shareAsync (native share sheet / story). Web falls back gracefully. Verified rendering.
- TEST CLIENT ACCOUNT: created persistent real account testclient@hutch.com / TestClient123! (Test Client), enrolled as in-person client at gym "Hutch Performance Lab" so the owner can trial the whole in-person flow (assign programs, check-ins, etc.) before real users. Documented in test_credentials.md. NOT auto-seeded (survives restarts as a real signup).

## Implemented (2026-06 — Share Any Win)
- SHARE ANY WIN: reused the branded capture-and-share pattern (react-native-view-shot captureRef → expo-sharing) on two more celebrations so members promote the app:
  - RankUpCelebration.tsx: wrapped the rank-ascension card in a capture ref; added a "📢 SHARE TO STORY" button (rank-colored) above CONTINUE. Card already shows the new rank + unlocked background + HUTCHS INNER CIRCLE brand.
  - journey.tsx Reward modal: boss victories now titled "☠ BOSS DEFEATED ☠"; wrapped the reward/loot card (with a HUTCHS INNER CIRCLE brand line) in a capture ref + a "📢 SHARE TO STORY" button (shown for boss + loot drops), alongside EQUIP NOW / CONTINUE.
- tsc clean; app loads without crash. Share sheet works on real device / Expo Go (not web preview).

## 2026-06 Session — Gym, Lite/Full mode, Booking, Chat & Leaderboards (fork)
### Gym Association (frontend on existing backend)
- Signup gym typeahead (input-gym + chips) + "I train in-person & want coaching" checkbox (needs gym).
- Profile MY GYM: edit gym; request in-person coaching (needs gym). Admin approves via /admin (reqBanner) + /api/admin/inperson.
- GymWatermark component (faint bg text + header badge) on home/profile/quests/leaderboard. GET /api/gyms is public.
### Lite / Full app mode
- First-login AppModeIntro (pick-lite/pick-full); lite_mode+mode_selected on user; PATCH /api/profile/update {lite_mode}.
- Lite hides: SOCIAL tab, STORE, THE JUDGE, THE ROOM, THE ENHANCED, Armory, Inventory, cosmetics, paywall, THE JOURNEY (quests). Switchable anytime in Profile → APP MODE. src/lib/mode.ts helper. ModeGate in _layout.
### In-Person Session Booking
- Approved clients only: "Request a Session" in Profile + In-Person Room. BookingModal = react-native-calendars + half-hourly slots.
- Backend inperson.py: POST /booking/request, GET /bookings, POST /booking/{id}/approve|decline|cancel|reschedule. appt_at UTC via tz_offset.
- Reschedule: client/admin tap CONFIRMED session -> pending with new date/time (rescheduleId on BookingModal).
- Coach badge: /inperson/unread pending_requests (admin); /inperson/clients pending_requests per client (reqChip); home CTA badge sums it.
- Reminders: shared.py _booking_reminder_loop sends push 24h/1h before appt to client+coach via Emergent push (send_push). routes/push.py /register-push. src/lib/push.tsx (PushManager + handlers). app.json: expo-notifications plugin + android.googleServicesFile. EMERGENT_PUSH_KEY=placeholder (deploy-time). USER MUST add google-services.json before Android build; push only works after deploy+build.
### Gym Group Chat
- /api/chat/gym/messages resolves room "gym:<gym.lower()>" from user's inperson_gym (403 if none). community.tsx room toggle (chat-room-main/chat-room-gym). in-person clients bypass the chat paywall.
### Compound Lift Leaderboards
- /api/leaderboard/{squat|bench|deadlift|ohp} by PR. leaderboard.tsx BOARDS adds SQUAT/BENCH/DEADLIFT chips.
### Tests
- Backend pytest: iter23 (lite/gym 14/14), iter24 (booking 16/16), iter25 (chat/boards/reschedule 17/17) — all pass.

## Iteration 31 (2026-08) — UI reorg batch + 2 backend features
### Backend
- Google Places real gyms: GET /api/gyms/nearby?lat=&lng=&radius= -> {gyms:[{place_id,name,address,lat,lng,rating,source:"google"}]}. Server-side GOOGLE_PLACES_API_KEY in backend/.env (billing-enabled). Public.
- Chat Pin-a-Rule: GET /api/chat/{room}/pin, POST /api/chat/{room}/pin {text} (admin; empty text unpins), stored in db.chat_pins keyed by store_room. _resolve_store_room() helper added.
- Chat Clear: POST /api/chat/{room}/clear (admin) wipes db.chat_messages for that room.
### Frontend
- Home (index.tsx): removed PR Vault, Next Workout, Weekly Recap button + the 3 stat cards. Level display now shows OVR (fetched from /api/profile/attributes) + workouts + streak + badges inline. New CTAs GYM MAP + DIET & HEALTH above Cardio. New "GROUPS" top-bar button -> /clans.
- /clans.tsx: all clans sorted by member_count (from /api/groups). 
- /diet-health.tsx: new room holding Conditioning (HealthCard) + Today's Fuel (NutritionCard), moved off profile.
- Profile (profile.tsx): removed PR Vault, Gender, App Mode, Strength Curve, and the standalone Combat Stats section. Badges now via a "BADGES" chip beside class title (toggles panel). BW/AGE/TOTAL/STREAK + a small (130px) combat radar are built INTO the player card. Social links compacted. Gym Map link removed (now on home).
- NutritionCard.tsx: MACROS tab has a food picker (~55 foods) that adds cal/protein/carbs/fats to totals (food-add / food-opt-*).
- settings.tsx: APP MODE (FULL/LITE) toggle added.
- AppModeSwitch.tsx: global floating LITE/FULL pill top-right (mounted in _layout.tsx), visible once past onboarding. (Minor: slightly overlaps Me-screen CONFIG gear.)
- ChatRoom.tsx: admin Pin-a-Rule banner + Clear-Chat modal.
- leaderboard.tsx: desktop web (>=1280) shows STRENGTH + CARDIO side-by-side via LeaderboardColumn.tsx.
- HeroIntro.tsx: intro avatar uncropped on web (contentFit contain on web, cover on native).
- ExerciseLibraryModal.tsx: exercise demo images contentFit contain (fully visible).
### Tests
- iteration_31.json: backend 8/8 + frontend flows all pass.

## Iteration 32 (2026-08) — polish follow-ups
- Switch overlap: Me-screen topRow paddingRight:72 so ⚙ CONFIG clears the floating LITE/FULL switch.
- Save Meals: backend db.saved_meals + GET/POST/DELETE /api/nutrition/meals (per-user, empty name -> 400). NutritionCard "★ SAVE CURRENT AS A MEAL" (meal-name-input/meal-save-confirm) + MY MEALS chips (meal-add-/meal-del-) that add macros with one tap.
- Food Search: food-search box filters the ~55-item food list.
- Clan Preview: clans.tsx rows push /(tabs)/community?group=<id>; community starts on Groups tab; GroupsPanel reads useLocalSearchParams and auto-opens that clan once.
### Tests: iteration_32.json — backend 10/10 + frontend flows all pass.

## Iteration 32b — Food quantity + standardized units
- NutritionCard FOODS now standardized to GRAMS: each food has grams (default serving) + household hint (serving e.g. "≈6 oz"); macros scale linearly.
- Each food row has a −/＋ gram stepper (25g steps, min 5g) + ADD button; displayed macros update live and ADD logs the scaled macros. testIDs: food-minus-<name>, food-plus-<name>, food-opt-<name> (ADD).
- Self-verified: 220g Chicken -> 362 kcal / 67p / 8f added correctly.

## Iteration 33 — Meal Portions + Custom Foods + Daily Macro Goals
- Backend nutrition.py: GET/POST /api/nutrition/goals (macro_goals on user), GET/POST/DELETE /api/nutrition/foods (db.custom_foods, per-user, empty name -> 400).
- MacroRing.tsx: SVG progress ring (calories/protein vs goal; warning color when over).
- NutritionCard Macros tab: two goal rings + 'goal-edit'/goal-calories/goal-protein/goal-save. Meal rows have a ×portion multiplier (meal-minus-/meal-plus-, 0.5 steps) scaling logged macros. Custom Foods form (cf-add -> cf-name/cf-grams/cf-calories/cf-protein/cf-carbs/cf-fats -> cf-save), ★-tagged rows merged into food list with cf-del-<id>.
### Tests: iteration_33.json — backend 11/11 + frontend flows all pass.

## Iteration 34 — Social tab redesign (sleek/modern)
- design_guidelines.json generated by design agent (dark cyberpunk chat).
- community.tsx: header + pill segmented room control (ALL/gym/GROUPS), active = surface3 pill; removed clunky bordered boxes.
- ChatRoom.tsx: message bubbles (mine=right, accent-tinted translucent + border; theirs=left, surface2, 30px avatar). Consecutive same-user messages grouped (avatar/identity hidden, tighter spacing). Identity row condensed to inline name(rank-colored) · Lv.X · 👑/⭐/★ · F#N · ✓ (no boxed chips). Composer refactored to a single pill with inset 📷/🖼 icons + circular ➤ send. Kept sendBtn/sendText styles for pin/clear modals.

## Iteration 35 — Admin: remove a user's Enhanced access + red theme
- Backend admin.py: POST /api/admin/enhanced-remove {user_id} (admin-only) sets enhanced=False, enhanced_access=False, unsets enhanced_since. _member_brief now returns `enhanced`.
- admin.tsx: member card shows a red "☣ REMOVE ENHANCED" tag (active when enhanced, dim "NOT ENHANCED" otherwise) -> removeEnhanced() -> patchMember. testID enhanced-remove-<user_id>.
- Verified: brief enhanced True -> remove -> False; non-admin 403.

## Iteration 36 — Comprehensive onboarding tour + Enhanced admin grant/filter
- Admin: /api/admin/enhanced-set {user_id,on} replaces enhanced-remove (grant OR remove); /api/admin/members?enhanced_only=true filter. admin.tsx: button toggles GRANT/REMOVE ENHANCED; new filter chip (admin-filter-enhanced). Curl-verified grant->filter shows 1->remove->0.
- OnboardingTour.tsx rewritten: FULL = 10 steps (Home, Train, Rank, Quests, Social, Me, Home Rooms, level-locked rooms [Athlete's Center Advanced+, The Room Elite+, The Judge members], LITE/FULL switch, Config+replay). LITE = 6 steps (Home, Train, Diet&Health, Cardio, switch, Config). Added step counter. Replay from Settings still works (tour_seen=false).

## Iteration 37 — Tour Highlights (point at real tabs)
- OnboardingTour: each Step has a `target` (home/train/rank/quests/social/me/topright). A faux 6-tab strip renders above the footer mirroring the real bottom bar; the target tab glows (cyan) with a ▼ arrow. For the LITE/FULL switch step (target topright) an "UP HERE ↗" pill points to the top-right. TABS constant added. Verified via screenshots (Home highlighted; mode step top-right pointer).

## Iteration 38 — Replay updated tour for existing members
- Added tour versioning. OnboardingTour exports TOUR_VERSION=2; done() PATCHes {tour_seen:true, tour_version:2}. ProfileUpdate model gained tour_version:int.
- _layout gates use tourComplete(user) = tour_seen && tour_version>=TOUR_VERSION. Existing members (tour_version unset/old) are re-shown the tour once on next login; FounderGate waits for tourComplete.
- Returning members (tour_seen already true) get a leading "✨ WHAT'S NEW — THE APP GOT AN UPGRADE" step + eyebrow "THINGS HAVE CHANGED · UPDATED TOUR" so they know why it reappeared. Brand-new members skip that step. Verified via screenshot (owner, tour_seen=true/version unset -> 11-step updated tour).

## Iteration 39 — Live tour tap + Leaderboard declutter
- OnboardingTour: highlighted tab in the strip is now tappable (tour-tab-<key>) -> jumpTo() stamps tour done + router.push to that tab. Non-target tabs disabled; "TAP TO GO" hint under the glowing tab.
- leaderboard.tsx: decluttered. Top row = STRENGTH/CARDIO parents (show current board + ▾); tapping a parent opens a dropdown of that mode's sub-filters (strength: board list + gym scope; cardio: activity/board/distance). ALL/NATURAL/ENHANCED stays as a segmented row underneath. Gym header/roster + season banner render below when relevant. Desktop split view unchanged.

## Iteration 40 — Consistent sleek composers across all chat surfaces
- coach.tsx (AI Coach) & inperson.tsx: replaced boxed input + rectangular SEND with the unified pill composer (inset ghost icons/mic + circular ➤ send). Softened coach bubble border (border vs borderStrong).
- The Room (the-room.tsx), Social Hub, and clan chats already use the redesigned ChatRoom (bubbles + pill composer) from iteration 34, so all chat rooms now share one modern look.

## Iteration 41 — Composer alignment/slimming fix
- ChatRoom/coach/inperson composers: alignItems flex-end -> center so camera/photo/mic icons + send button vertically center with the text (were dropped to bottom). Reduced paddingVertical (5->4), input padding (8->6) + minHeight 30, icons 34->30, send 38->36. Bubble padding trimmed (9/13 -> 7/12) to feel less bulky.

## Iteration 42 — Composer glyph centering
- Emoji/arrow glyphs sat low due to font metrics. Added lineHeight + textAlign/textAlignVertical:"center" + includeFontPadding:false to inputIconTxt/iconText, input, and sendArrow across ChatRoom, coach, inperson. Composer stays alignItems center; icons/send now optically centered with the text line.

## Implemented (2026-08 — Deep-link fix + Chat timestamps + Recent Foods)
- DEEP-LINK FIX (P0): community.tsx now has a useEffect on params.group that switches the active view to "groups" when a clan deep-link arrives while the Social tab is already mounted (previously room state only initialized once on mount, landing users on the wrong chat). GroupsPanel already reacts to the param to open the clan.
- CHAT GROUP TIMESTAMPS: GET /api/groups now returns last_message_at per clan via a single aggregation over db.chat_messages (max created_at for group:{id} rooms). _brief() gained the field. GroupsPanel group cards show a subtle relative time (now/m/h/d/w, testID group-last-{id}) above the arrow; hidden when null. Verified via curl (aggregation returns latest created_at).
- RECENT FOODS: NutritionCard.tsx tracks the last 8 logged foods in AsyncStorage (key hic_recent_foods; scaled macros + grams). A horizontal "⏱ RECENT · tap to log again" chip row (testID recent-food-{name}) appears above the ADD A FOOD button; tapping re-adds the exact logged amount. Verified end-to-end via screenshot (Chicken Breast chip re-adds 280 kcal / 52p).

## Implemented (2026-08 — Water Tracker)
- WATER TRACKER in Diet & Health (NutritionCard.tsx): a blue goal ring (reuses MacroRing) showing today's intake vs goal (ml) + "💧 X L of Y L" line + quick ＋250 / ＋500 / −250 ml buttons. Persists per day.
- Backend: water stored on the same nutrition_logs day doc (water_ml). GET /api/nutrition/today now returns water_ml; new POST /api/nutrition/water {ml} upserts it (clamped 0–20000). Water goal stored in user.macro_goals.water_goal (default 3000); GET/POST /api/nutrition/goals now include water_goal (POST preserves existing water_goal when not sent, so saving macro goals won't wipe it). Goal editor gained a "water ml" input (testID goal-water).
- Verified via curl (set 750 → today returns 750; goal 3500 persists) and screenshot (750/3000 ring after ＋500 then ＋250). Test artifacts on bot1 cleaned.

## Security fixes (2026-08 — post-audit, all verified)
- SEC-001 (Skool code brute force): POST /api/profile/skool-verify now throttled via auth_throttle.consume_bucket (kind="skool_verify", 10/hour per user) → 429 after 10 bad attempts. Verified.
- SEC-002 (media BOLA): GET /api/chat/media/{id} now runs _authorize_media(rec, user). Public segments (/pfp/, /gym-logo/, /exercise_demos/, /legal/) open to any authed user; everything else requires uploader OR admin OR membership of the chat room / in-person thread that references the media. Verified: owner 200(→502 missing bytes), other user 403, no-auth 401, public exercise_demo 200.
- SEC-003 (Places billing drain): GET /api/gyms/nearby now serves from db.gym_places_cache (rounded lat/lng/radius grid, 6h TTL index) and, on cache miss, enforces consume_bucket (kind="gyms_nearby", 40/hour per user). Verified cache hit + throttle.
- SEC-004 (token in URL): New POST /api/chat/media-ticket issues a ~120s HMAC-signed ticket (MEDIA_TICKET_SECRET/AUTH_THROTTLE_SECRET) after _authorize_media; GET media accepts ?t=<ticket>. custom-program.tsx now calls openProgram() → fetches a ticket → opens ?t= URL (no long-lived session token in URL). ?token= fallback still works for other media (with authz). Verified ticket accept + bad-ticket 401.
- Indexes added (shared.py): chat_messages.media_id (sparse), inperson_messages.media_id (sparse), gym_places_cache.expires_at (TTL).

## Security re-audit (2026-08) — SEC-001..004 verified RESOLVED; SEC-005 fixed
- Re-audit confirmed SEC-001 (skool throttle), SEC-002 (media BOLA authz), SEC-003 (Places cache+throttle), SEC-004 (media tickets) all RESOLVED.
- SEC-005 (MEDIUM, new): media-ticket HMAC fell back to a source-code literal key when MEDIA_TICKET_SECRET/AUTH_THROTTLE_SECRET were unset. Fix: (1) appended strong random MEDIA_TICKET_SECRET + AUTH_THROTTLE_SECRET to backend/.env; (2) hardened chat.py _MEDIA_TICKET_SECRET and auth_throttle.py _KEY_SECRET to fall back to a per-process secrets.token_urlsafe(48) instead of any hard-coded literal. Verified: a ticket forged with the OLD default key now returns 401; freshly-issued tickets still validate.

## Bug fix (2026-08) — Founders list empty in production ("No founders yet")
- Symptom: production APK showed "No founders yet" despite 3 real signups; preview worked.
- Root cause: GET /api/founders calls rank_from_xp on each candidate; level_from_xp did `1 + xp // 250` which throws TypeError if a founder-eligible user's xp is None/non-int → 500. founders.tsx load() swallows fetch errors (try/catch {}) so data stays null and the screen renders the "No founders yet" empty state — masking the 500. Reproduced in preview by inserting a real (non-bot/non-admin/non-test-email) user with xp=None → /api/founders returned 500.
- Fix: hardened level_from_xp (shared.py) to coerce None/invalid/negative xp to 0. This fixes rank_from_xp app-wide (leaderboard/chat/profile/founders). Verified: /api/founders now 200 and lists founders even with a null-xp user present. Sim user cleaned up.
- NOTE: fix is in preview; user must REDEPLOY to push to production.

## Change (2026-08) — Include admins/owner in Founders + diagnosis
- Diagnosed via direct PRODUCTION API calls: GET /api/founders returned 200 and listed founders (backend crash fix confirmed live). Real signups that were ADMIN accounts were being hidden by the `is_admin: {$ne: True}` filter.
- Per user request, removed the is_admin exclusion from founders_list query, founder_spots count, and creators query in routes/payments.py (bots + test/example emails still excluded). Verified in preview: founders list now includes "The Hutch" (owner/admin).
- Created a throwaway PRODUCTION account diag_1787260262@gmail.com (display "DiagCheck") to test; no delete-user endpoint exists so it remains and will show as a founder in prod until removed.
- NOTE: backend change — user must REDEPLOY for production to reflect it.

## Big batch (2026-08) — verified
- HeroIntro launch animation lengthened (signup 4.6s→6s, login 1.6s→2.4s).
- Founders: admins/owner now INCLUDED (founder_status + founders_list + spots + creators). Permanent 'founder' badge granted idempotently in profile_me. FounderWelcome popup now reaches admins; added "★ FOUNDER BADGE UNLOCKED" line.
- Water Streak: nutrition/water computes consecutive-day streak + awards badges water_streak_3 / water_streak_7; nutrition/today returns water_streak; UI shows 🔥 Xd + celebratory msg. (backend tested 23/23)
- Admin Delete Member: POST /api/admin/members/{id}/delete (admin-only, blocks admins/self, wipes owned data + pulls from clans). Frontend DANGER ZONE button in admin member card with confirm. (backend tested)
- Gym Maps: auto-locate on open (mobile centers map immediately if granted; web auto-loads nearby list); web now renders a nearby LIST instead of native map. LocationPrimer: one-time first-login location permission prompt (native), mounted via LocationGate in _layout after founder welcome.
- Heart rate: added current_bpm to model + log + today.
- Diet & Health redesign: removed CONDITIONING/HealthCard + 40/100yd boxes; top ECG HeartRateStrip shows CURRENT/RESTING/AVG bpm + steps counter with [⌁ SYNC] and [✎ ENTER] buttons (sync + manual entry modal moved into the strip). Nutrition: clean "Calories hero + carbs/protein/fat rings" (left) with Water tracker beside it (right); manual macro grid collapsed behind a toggle.
- Diet type filter: Normal / Vegetarian / Keto toggle in food picker (veg excludes meat/fish; keto = carbs<=10g), persisted in AsyncStorage (hic_diet_pref); also a DIET PREFERENCE toggle in settings.
- Cardio: distance PRs (1K/5K/10K/HALF) computed on /api/cardio/log (returns new_prs); GET /api/cardio/prs; new HISTORY tab (personal bests cards + recent activities list, Strava-style); post-run summary Modal with route map snapshot + stats + new-PR badges; map opens immediately on mobile when granted. (backend tested)

## QUEUED (requested, NOT yet built)
- Judge section redesign: declutter, more professional, easy navigation for new members.
- Timers tab in Cardio: a stopwatch (separate from sprint test) + an interval/HIIT timer, in a new "TIMERS" tab.

## Batch 2 (2026-08)
- Cardio TIMERS tab: TimersTab component (Stopwatch with laps + Interval/HIIT timer with Work/Rest/Rounds steppers, phase countdown, vibrate on phase change). Wired as 4th tab in cardio.tsx (TRACK/HISTORY/TIMERS/SPRINT). Verified via screenshot.
- Diet-at-signup: DietPrimer one-time modal (Normal/Vegetarian/Keto) shown to members first use (AsyncStorage diet_primer_done_v1 + hic_diet_pref); mounted via DietGate in _layout (after mode/tour/founder). Feeds the food-picker diet filter + settings toggle.
- REBRAND to "The Circle": bulk-replaced all "Hutch's Inner Circle"/"Inner Circle" display text across app/ + src/ with "The Circle"/"THE CIRCLE". app.json expo.name -> "The Circle". Added a "WELCOME TO / THE CIRCLE" text wordmark on the login screen. NOTE: login hero (assets/images/login-bg.png) still has the OLD logo baked into the artwork — needs a new image asset to fully rebrand the login visual. Coach's name "Coach Hutch" left intact (person, not app brand).

## STILL QUEUED
- Coaching-by-gym: NEEDS clarification (how access works + how members pick gym). Asked but user pivoted.
- Judge section cleanup (declutter for new members).
- "Purge Test Data" admin tool (remove test groups/gyms/chats + diag prod account) — decide whether to also remove the 10 AI leaderboard bots.

## Batch 3 (2026-08)
- New login background art generated (Gemini Nano Banana, textless cyberpunk gym) -> assets/images/login-bg.png (1408x768). Old baked-in "Hutch's Inner Circle" logo removed; "WELCOME TO THE CIRCLE" text wordmark overlays it.
- Coaching-by-gym (admin approves each person; members pick own gym): gyms gained coaching_enabled flag. Admin: POST /api/admin/gyms/{id}/coaching toggle + "🏋 COACHING" tag in admin gyms list (toggleGymCoaching). GET /api/gyms now returns coaching_enabled. profile/me returns coaching_available (member's inperson_gym matches a coaching_enabled gym). profile.tsx MY GYM: the "REQUEST IN-PERSON COACHING" button now only shows when coaching_available; otherwise shows a note. Admin approval (inperson_client) flow unchanged. Verified: profile coaching_available works, non-admin toggle 403.

## STILL QUEUED
- Judge section cleanup (declutter for new members).
- "Purge Test Data" admin tool (test groups/gyms/chats + diag prod account) — decide whether to also remove the 10 AI leaderboard bots.

## Batch 4 (2026-08)
- NeonButton component (src/components/NeonButton.tsx): on-brand blue→orange LinearGradient CTA with glowing border + press scale, matching the reference button sheet. Applied to the login ENTER/ENLIST CTA (index.tsx). Reusable — variant "blueOrange"/"orangeBlue", label/onPress/loading/disabled props.
- FIRST PASS only: rollout to all primary buttons across screens + bottom tab-bar restyle is a larger design pass still pending.

## Batch 5 (2026-08)
- Bottom tab bar neon restyle ((tabs)/_layout.tsx): active tab now has a blue→orange LinearGradient glow pill behind it, orange icon (blue text-shadow glow) + orange bold label, and a blue→orange gradient underline. Verified via screenshot.
- STILL PENDING: full NeonButton rollout to every primary button across ~15 screens (large multi-file pass); Judge cleanup; Purge Test Data tool.

## Batch 6 (2026-08 — Neon button system + Admin tabs + Clan rename/delete)
- BUTTON SYSTEM (all 4 reference families recreated as reusable code components so wording swaps freely):
  - NeonButton.tsx (family 1, primary CTA): upgraded to angled/chamfered neon hexagon via react-native-svg polygon + blue↔orange gradient fill + glow + bold italic label. onLayout-measured SVG (unique gradient id per instance). Fixed a temporal-dead-zone bug (used h before declaration).
  - ActionButton.tsx (family 2, action w/ states): electric-bordered slab, tones blue|orange|gold|fire|red, active/loading + flat grey "inactive"(disabled) state.
  - NavButton.tsx (family 3, secondary nav): rounded dark slab + thin tinted neon border + icon + label, glow lifts on press. tones blue|gold|orange|red.
  - CircleIconButton.tsx (family 4): circular metallic core + glowing energy ring (blue|orange|gold), for composer icons.
  - Rollout: login ENTER/ENLIST (NeonButton); settings SAVE PROFILE + VERIFY (NeonButton), REPLAY TOUR + PRIVACY (NavButton), REMOVE ENHANCED + DELETE ACCOUNT (ActionButton red); profile REQUEST COACHING + REQUEST SESSION (NeonButton), INVENTORY/ARMORY/PREMIUM/PURCHASES/SIGN OUT (NavButton); workout FINISH WORKOUT (NeonButton); coach send + inperson composer icons (CircleIconButton).
  - FIXED: settings.tsx crashed last session (used NeonButton without importing it).
- ADMIN PANEL TABS (admin.tsx): split the long panel into 4 tabs — 👥 USERS (security + spotlight + members), 🛡 CLANS (clan challenge + clan directory), 🏋 GYMS (gym directory), 🛒 COSMETICS (store drops). tab state + tabBar pills (testID admin-tab-users/groups/gyms/cosmetics). Enhanced-red toggle stays global above tabs.
- FIXED BLACK-TEXT BUG: st.searchInput was USED (gym name/address inputs) but never DEFINED in the StyleSheet → text rendered black. Added the style with color: colors.text.
- GROUPS → CLANS rebrand: renamed every user-facing "Group(s)" label to "Clan(s)" across Social tab (title/tab/create/list/empty), Home CLANS button, Profile MY CLANS, Clans leaderboard, GroupsPanel (create/leave/all clans), community gate copy, admin. Kept internal routes (/api/groups), room ids ("groups"), nav param (params.group), testIDs and variable names unchanged.
- DELETE CLANS (admin): backend GET /api/admin/groups (list all clans w/ member_count/level/creator_name) + DELETE /api/admin/groups/{gid} (removes clan + its group:{gid} chat messages), both admin-gated via _require_admin_u. Frontend: CLANS tab "ALL CLANS (n)" list with per-clan DELETE (testID clan-del-{id}) + web/native confirm. Verified: list renders (test + Powerlifters), delete confirm wired.
- COACHING TOGGLE: user reported "coaching button not working properly". Verified the ADMIN toggle WORKS end-to-end (POST /api/admin/gyms/{id}/coaching flips coaching_enabled; UI COACHING↔🏋 COACHING persists across reload). Suspected the real issue is member-side coaching_available (profile.py matches gyms by name_lower + coaching_enabled). NEEDS user clarification on exactly what fails.

## Batch 6b (2026-08 — Coaching-available bug fix)
- BUG: ME/profile screen showed "This gym doesn't offer in-person coaching yet" even when the gym had coaching enabled in admin. ROOT CAUSE: the app's user object comes from GET /api/auth/me, but `coaching_available` was ONLY computed in GET /api/profile/me — so /auth/me never set it → always falsy on the profile screen.
- FIX: added the same coaching_available computation to /auth/me (routes/auth.py): look up the member's inperson_gym by name_lower with coaching_enabled=True. Verified via curl: owner (gym "The Fit Effect", coaching_enabled) now returns coaching_available:true. Admin toggle itself was already working.

## Batch 6c (2026-08 — Spotlight fix + media, catalog expansions)
- SPOTLIGHT "not showing" FIX: Home only fetched /featured on mount. Added useFocusEffect refetch in (tabs)/index.tsx so newly featured members appear when Home regains focus.
- SPOTLIGHT MEDIA (admin can attach photo/video + reason): backend POST /api/admin/featured/media (multipart user_id+reason+file; images jpg/png/webp ≤12MB, video mp4/mov/webm ≤60MB; stored via Emergent Object Storage under /spotlight/ path; media_id+spotlight_media_type saved on featured_members) + DELETE /api/admin/featured/{uid}/media to clear. Added "/spotlight/" to PUBLIC_MEDIA_SEGMENTS (chat.py) so all members can view. GET /featured now returns media_id+media_type. Frontend: admin USERS tab member cards have 🖼 ADD PHOTO / 🎬 ADD VIDEO (ImagePicker upload), spotlight list shows 🖼/🎬 marker + "remove media". Home renders via new src/components/SpotlightMedia.tsx (expo-image for photos, expo-video useVideoPlayer/VideoView autoplay-muted-loop for video). Verified end-to-end (uploaded image renders on Home).
- CATALOG EXPANSIONS (all served directly from constants, no DB re-seed):
  - Exercises 171→209 (shared.py EXERCISE_LIBRARY): added chest/back/legs/shoulders/arms/core/glutes movements (hack squat, RDL variants, meadows row, arnold press, preacher curl, hip thrust, ab wheel, etc.).
  - Foods (frontend NutritionCard.tsx FOODS): +46 items (more proteins, dairy, grains, fruits, veg, nuts, plant proteins) + updated NON_VEG set so veg filter still excludes new meats.
  - PEDs 39→85 (shared.py PED_LIBRARY): added test esters, tren esters, orals, AIs, SERMs, HCG, GH secretagogues (MK-677, GHRPs, sermorelin/tesamorelin), fat-loss (tirzepatide, retatrutide, cardarine), SARMs (research), thyroid (T3/T4), etc.
- PENDING (not started): Journey tab Fallout-style RPG redesign (bottom HUD w/ weapon + stats always on screen, quest info panel on tap) — user requested with reference image; Purge Test Data admin tool.

## Batch 6d (2026-08 — Video fix, spotlight resize, PR Room + Form Lab, Journey Fallout HUD)
- VIDEO "just blue" FIX: chat_media_get (routes/chat.py) served whole file with no HTTP Range support → video players rendered only the background. Added Range parsing → 206 Partial Content + Accept-Ranges/Content-Range/Content-Length (416 on bad range). Verified 200 w/ accept-ranges + 206 partials against a real 21MB mp4.
- SPOTLIGHT MEDIA BOX (SpotlightMedia.tsx): smaller fixed box (height 190), contentFit="contain" so nothing is cropped; photos open a fullscreen tap-to-close modal; videos keep nativeControls + allowsFullscreen.
- NEW ROOMS — PR ROOM + FORM LAB (above The Judge on Home): shared engine.
  - Backend routes/critique.py (registered in server.py) — collection critique_posts + critique_comments keyed by room ("pr"|"form"). Endpoints: POST /api/rooms/{room}/submit (multipart file image/video + exercise/weight/reps/bodyweight/caption; image→GPT-5.6-terra vision, video→text coaching from details; Emergent key; parses JSON {call,form,programming,level}); GET /api/rooms/{room}/feed (adds liked); POST /api/rooms/{room}/{id}/like (toggle); GET/POST/DELETE comments; DELETE post. Images ≤15MB, video ≤80MB, stored under /pr/ and /form/ (public media segments already cover? NO — media served via ?token= with per-user auth; ownership check passes for uploader; feed viewers use their own token — media_type image/video). Gate: same as Judge on frontend + email/phone verify to post.
  - Frontend: src/components/CritiqueRoom.tsx (reusable), screens app/pr-room.tsx (orange accent, "Coach") + app/form-lab.tsx (blue accent). Feed cards: media (SpotlightMedia), AI coach block (call/form/programming/level), like ♥ + comments modal. Home cards open-pr-room + open-form-lab added above open-judge. Verified PR Room renders + gated.
- JOURNEY FALLOUT HUD (app/journey.tsx): 
  - Persistent bottom Pip-Boy HUD (styles.hud): green terminal "▸ You see: <zone> — <class/toast>" log, center WEAPON slot (weaponImage thumb + weaponLabel(equipped_weapon) or UNARMED + AP), right HP/AC readouts (derived from endurance/speed/level). Top stat chips (STR/PWR/SPD/END/GRT) remain always-on.
  - Quest info panel on tap: onNodePress now opens a QuestInfo modal (title, desc, REWARD, STATUS, boss flag) with ENGAGE (→ existing Combat) / LOCKED / CLEARED states; engageQuest() gates by complete/claimed. Verified HUD + quest panel via screenshots.
- weaponLabel() helper added in journey.tsx (formats equipped_weapon id → readable name).

## Batch 6e (2026-08 — Full name signup, weapon HUD art, room boards, quest objectives)
- FULL LEGAL NAME at signup: RegisterInput.full_name added (shared.py); /auth/register now REQUIRES it (400 if blank) and stores doc["full_name"][:80]. Frontend index.tsx signup adds "Full Legal Name" input (testID input-full-name) above display name, validates non-empty; auth.tsx registerEmail takes fullName and sends full_name. Verified: register w/o full_name → 400; field renders.
- CLAN INVITE by full name: groups.py invite_member now matches display_name OR full_name (case-insensitive exact). GroupsPanel placeholder updated to "Invite by display name or full name…".
- WEAPON ART IN HUD: theme.ts adds WEAPON_NAMES map + weaponName() (mirrors gear.py FREE/PAID/QUEST weapon names). journey.tsx HUD weaponLabel() now uses real name (e.g. "PLASMA KATANA"/"UNARMED") + weaponImage() icon.
- ROOM LEADERBOARDS: backend GET /api/rooms/{room}/leaderboard (top-20 most-liked posts last 7 days). CritiqueRoom.tsx adds FEED / 🏆 WEEKLY TOP tabs; board rows show medal/rank, name, exercise+weight, ♥ like_count; tapping opens the post's comments. Verified endpoint 200.
- QUEST OBJECTIVES in panel: quests.py /journey nodes now include objectives (label/current/target), flavor, global_percent. journey.tsx quest panel renders an OBJECTIVES list with per-objective progress bars (green when met) + flavor text. Verified panel shows "Move total lb today 0/8,000" with bar.

## Batch 6f (2026-08 — multi-gym, home 3-tab row, journey textures, room prizes, admin purge/full-name, quest popup, exercise packs)
- MULTI-GYM (up to 5): backend inperson.py GET/POST/DELETE /api/gyms/mine + POST /api/gyms/mine/primary (MAX_GYMS=5; user.gyms array, keeps inperson_gym as primary/coaching; dedupe + limit enforced; leaving reassigns primary). Frontend app/my-gyms.tsx (add/leave/set-primary, coaching/verified/primary badges, discover link). Home top row reordered to CLANS | RANK(center, highlighted) | 🏋 GYMS (open-my-gyms → /my-gyms); removed GymBadge from row.
- EXERCISE PACKS: EXERCISE_LIBRARY 209→247 — Olympic weightlifting (snatch/clean&jerk variants, OHS, snatch balance…), Stretch/mobility (couch, pigeon, WGS, 90/90…), Plyometric (box/depth/broad jump, MB slams, clap push-up…). New categories: Olympic, Stretch, Plyometric.
- ROOM BOARD PRIZES: critique.py leaderboard now returns {board, prize_label, prize_xp} and idempotently awards last completed week's #1 a badge (pr_champion/form_master) + 300 XP via room_awards ledger. CritiqueRoom shows a prize banner + medals.
- ADMIN FULL NAMES: _member_brief returns full_name; admin_members search matches display_name OR full_name; admin.tsx member card shows 🪪 full name. (Testing agent fixed a CRITICAL bug: purge-preview insert had displaced the admin_members return → now returns [_member_brief…].)
- PURGE TEST DATA: admin.py GET /admin/purge-preview + POST /admin/purge-test-data (deletes bots + @test/@example non-admin accounts + their per-user data across ~25 collections + test-named clans/gyms + their chat; pulls users from clan arrays). admin.tsx Users tab has a 🧹 PURGE card w/ live counts + confirm. Verified preview (10 bots) renders; POST not executed on live data.
- QUEST READY POPUP: Home focus-effect fetches /api/journey; if any node complete&&!claimed shows a small dismissible orange pill "⚔ N quests ready to claim" → /journey.
- JOURNEY ZONE TEXTURES: journey.tsx map canvas now has a zone-tinted LinearGradient (primary→accent) + scattered low-opacity building/gym/barbell emoji themed by zone name (zoneDecor keyword match: iron/storm/waste/citadel/neon/default). hexA() alpha helper added.
- BACKEND TESTED: /app/test_reports/iteration_35.json — 20/20 passed (register full_name, rooms submit/feed/like/comment/leaderboard, multi-gym limit/dedupe/primary, journey objectives, purge-preview, admin members full_name). Cleanup done (owner gyms restored, test data removed).

## Batch 6g (2026-08 — Legacy full-name prompt)
- LEGACY NAME PROMPT: backend POST /api/profile/full-name (validates >=2 chars, stores full_name[:80]). Frontend src/components/LegalNamePrompt.tsx — blocking modal mounted on Home (index.tsx) that shows for any non-admin user whose full_name is empty; on save it refreshes auth. Verified endpoint (400 too-short, 200 valid) + Home renders (hidden for admin).
- REFERENCE IMAGES: user provided 4 painted zone-background references for the Journey ("Zone Art Upgrade") — NOT yet implemented (needs generated/painted per-zone image assets; deferred to next session to avoid partial work).
- STILL PENDING from user's list: Zone Art Upgrade (custom painted gym/city backdrops per zone using the provided refs), Gym Chat Rooms (per-gym chat for each of a member's up to 5 gyms).

## Batch 6h (2026-08 — admin users bugfix, gyms dropdown, name on profile, What's New intro)
- BUGFIX (admin users not showing): iteration_35 testing agent had changed admin_members to return a BARE LIST, but frontend expects {members, badge_options}. Restored: return {"members": [_member_brief…], "badge_options": ADMIN_BADGE_OPTIONS}. Verified 8 members + 10 badges; admin Users tab now populates.
- MY GYMS DROPDOWN: my-gyms.tsx now fetches /api/gyms (directory) and shows a ▾ dropdown of existing gyms (filtered by input, excludes already-joined) to pick from, alongside free-text add.
- NAME ON PROFILE: /api/users/{id}/public now returns full_name; MemberSheet shows 🪪 full legal name under the display name on the public card.
- WHAT'S NEW INTRO: src/components/WhatsNew.tsx — one-time (AsyncStorage key thecircle_whatsnew_v3) scrollable rundown of every feature/room (PR Room, Form Lab, Judge, Journey, Clans, My Gyms, Diet, Cardio, Exercise Library, Enhanced) INCLUDING the Lite Toggle explanation. Mounted on Home; Settings has a ✨ "WHAT'S NEW & FEATURES" replay button (clears the key + returns home). Bump SEEN_KEY to re-show everyone. Verified renders.
- STILL DEFERRED (larger / need assets): 24h gym check-in (once per day, reset 12:01am); Zone Art Upgrade (painted per-zone backdrops from user's reference images); per-gym Gym Chat Rooms.

## Batch 6i (2026-08 — Journey crash fix + What's New v0.2)
- CRASH FIX (Journey tab "Rendered more hooks than during the previous render"): the decor computation used useMemo() placed AFTER the loading early-return in journey.tsx → hook-count changed between renders. Converted `decor` to a plain IIFE (no hook) and removed the useMemo import. Journey now loads reliably (verified HUD + nodes + textures render).
- WHAT'S NEW v0.2: added an "UPDATE 0.2" pill to the WhatsNew modal header; bumped SEEN_KEY to thecircle_whatsnew_v4 (re-shows to everyone) and updated the Settings replay button key to match.

## Implemented (2026-06 — Per-gym chat, Journey story/skill-checks, Home reorder)
- PER-GYM CHAT: each of a member's up-to-5 gyms has its own room. chat.py `_resolve_store_room(room,user,gym)` + `_user_gyms()`; GET/POST/pin/clear `/api/chat/gym/*?gym=<name>` (membership checked vs gyms[]; non-member 403). ChatRoom.tsx gymName prop → `?gym=` on all calls. community.tsx GYMS tab + horizontal gym switcher (testID gym-chat-<name>).
- GYM CHECK-IN: user first asked simple tap, then reverted to 500m GPS proximity. Backend /api/gyms/check-in requires lat/lng + gym pin, enforces <=0.5km, once/day/gym, streak+bonus. My Gyms cards have per-gym CHECK IN (requests device location, testID gym-checkin-<name>) + streak banner. gyms/mine returns id + checked_in_today. gyms-map keeps inRange 500m gate.
- WHAT'S NEW CHANGELOG: WhatsNew.tsx now stacks CHANGELOG (v0.3, v0.2) above the feature rundown. SEEN_KEY bumped to v5.
- THE ROOM moved OFF Home → Social tab (community.tsx new THE ROOM tab, gated Elite rank + premium/skool/founder). Home CTA + canRoom removed.
- HOME ROOMS REORDER: Founders (bright red hero, styles.foundersCta) → Athlete's Center → Diet → Cardio → Gym Map → AI Coach → Form Lab → PR Room → The Judge → The Enhanced(+dose) → In-Person → Custom Program. Renamed "1-ON-1 CUSTOM PROGRAM" → "CUSTOM PROGRAM".
- JOURNEY RPG STORY (src/components/JourneyStory.tsx): LitRPG/Solo-Leveling narrative. "The System" is branded **THE CIRCLE**. SystemAwakening one-time prologue (blue system windows, shows first Journey entry). Chronicle (📜 header btn, testID journey-story) = 6 chapters (one per zone E→S), body unlocks when reached, `after` aftermath unlocks once section CLEARED (i<zoneIndex). Villain = **THE ATROPHY** (existential decay) threaded through intro + codex card + chapter VI finale.
- JOURNEY ANIMATIONS connected to story: SystemWindow (Solo-Leveling blue notif, corner brackets, snap-in) fires on quest ACCEPT/BOSS ENCOUNTER (initiate) and QUEST CLEARED (finish). ZoneReveal (leaving area) now shows THE CIRCLE + story lore line.
- ZONE ART: 6 AI-painted backdrops assets/images/zones/zone_0..5.png (gen_zones.py, Nano Banana) replace gradient/emoji textures. theme.ts ZONE_IMAGES + zoneImage(index). Rendered full-screen + behind map in journey.tsx.
- D&D SKILL-CHECK COMBAT (journey.tsx Combat): interactive d20 roll + stat modifier (STR/PWR/AGI/END/GRT) vs DC. Per-zone skill themes (ZONE_SKILLS), boss = higher DC/HP + phase II. Crit on nat20. Story flavor per outcome. Non-punishing (misses still chip HP). testID combat-roll.
- LOGIN/SIGNUP ↔ STORY: login wordmark tagline "◇ THE CIRCLE IS ONLINE · RISE BEFORE THE ATROPHY"; HeroIntro reworded to THE CIRCLE ("YOU HAVE BEEN CHOSEN" / "RISE — BEFORE THE ATROPHY").
- Backend tested iteration_36 (10/10) for per-gym chat + check-in (pre-proximity-revert). Frontend: login tagline + SystemAwakening prologue verified via screenshot. tsc clean on all touched files.

## Story rewrite to canonical lore + admin quest tool (2026-06 cont.)
- CANONICAL STORY = "THE CIRCLE — Book One: The First Turn" (Gates opened, humanity Awakened, ranks F→S, user is the Empty Vessel / Unranked / Combat Rating 7; the Circle records what you DO so training = leveling). Hero = the user (uses display_name).
- JourneyIntro.tsx motion-comic rewritten to this origin (6 panels: Prologue/ranks → Unranked/CR7 → Empty Vessel/ALL PATHS → First Law/records adaptation → Gates & Trials → Rank S). Final CTA: "THE CIRCLE HAS RECOGNIZED YOU / WOULD YOU LIKE TO BEGIN? / Designation: Unranked · Level 0 · YES—BEGIN THE FIRST TURN". Key hic_journey_intro_v3.
- Chronicle chapters rewritten (Zero, The First Law, Danger Sense, Break the Ceiling, Gauntlet of Champions, The Empty Vessel) with tier E→S + cleared aftermaths. Threat card reframed THE ATROPHY → REGRESSION (Circle un-writes the idle; ancient entity beyond the Gates).
- All "Atrophy" UI reframed to REGRESSION: journey meter label (⚠ REGRESSION), sysWin (REGRESSION SETS IN), backend _atrophy notes, zone-reveal lore. Meter still driven by days_idle from last_workout/checkin.
- Login screen: journey key-art bg (login-journey.png) + tagline "◇ THE CIRCLE HAS RECOGNIZED YOU · AN EMPTY VESSEL CAN BECOME ANYTHING". HeroIntro signup sub → "AN EMPTY VESSEL — ALL PATHS OPEN" / "YOU HAVE BEEN CHOSEN".
- NEW 📖 "STORY SO FAR" button in Journey header (testID journey-storybook) → StoryBook modal: coming-soon placeholder ("story is being written, Chapter One coming soon"). Separate from 📜 Chronicle (in-game progression).
- ADMIN QUEST TOOL (admin.py): GET/POST /api/admin/quests/user|override|custom|custom/mark, DELETE custom/{id}. Overrides applied in shared._build_quests; custom quests appear as journey nodes (id custom:*) + claimable via /api/quests/claim. Admin panel 🗺 QUESTS tab (search member, force complete/incomplete, create/mark/delete custom). Backend curl+pytest verified (iteration_37 8/8).
- Bots excluded from XP + cardio leaderboards (is_bot filter). What's New Settings button fixed (key v4→v5). Per-gym unread dots (/api/chat/unread-gyms + read markers).
- KNOWN: testing_agent iteration_37 couldn't drive journey-node tap in web automation (nodes render on mobile viewport fine per screenshots) — verify d20 combat on device. journey.tsx ~1020 lines (candidate for split).

## Enhanced lore + Rank Reveal + Clans↔Journey + Admin self-reset/Journey Lab + deeper detail (2026-06 cont.)
- ENHANCED lore ("The Illegal Shortcut to Power") woven in: borrowed power / debt, The Alchemist, Second Turn, "the last world did not survive". Enhanced users (user.enhanced) get a distinct Journey: extra intro panel, Chronicle Enhanced codex card (purple), one-time "DESIGNATION: ENHANCED" debt system window (hic_enh_seen), and a lore banner on the Enhanced tab (routes to /journey).
- RANK REVEAL: ZoneReveal upgraded to a hunter-promotion cinematic (rank badge tier letter, "RANK X ATTAINED"). Fires on tier change (E→S).
- CLANS↔JOURNEY: new GET /api/journey/clans (clans ranked by combined xp). Journey shows a "🛡 <clan> · Circle Rank #N of M · XP" banner (or "Join a Clan…") → community clans (testID clan-circle-rank).
- ADMIN SELF-RESET / JOURNEY LAB (admin QUESTS tab): POST /api/admin/self/reset (xp=0 + wipe quest claims/overrides/custom state + streak) and /api/admin/self/xp {xp}. UI: RESET ME TO ZERO, UNLOCK EVERYTHING (500k xp), REPLAY INTRO CINEMATIC (clears AsyncStorage intro/zone/stats/atrophy/enh keys), and preview buttons E–S → /journey?preview=<idx> (non-destructive display override of zone art + story unlock via previewZone).
- FULL/LITE toggle (AppModeSwitch) now hidden on /journey (usePathname) so it stops covering the HUD buttons.
- ADMIN ACCOUNT the9hutch was deep-reset to a fresh state: xp=0, is_admin kept; wiped workouts/cardio/quests/checkins/coach/judge/critique/store/inperson/etc (12+ docs), removed from clans, unset progression/stat/streak/access fields. Onboarding (diet/mode) re-triggers as intended.
- MORE DETAILED QUEST MAP: each journey node now shows scope tag (DAILY/WEEKLY/MONTHLY/BOSS/CUSTOM), reward (🎁), and objective progress (n/target) beneath a 2-line title.
- All tsc-clean; backend endpoints curl-verified. journey.tsx now ~1055 lines (split candidate).

## Implemented (2026-08 — Subscription tuning + Baseline signup stats + Journey rival/challenge polish)
- PRICING: paywall now $9.00/mo + $90.00/yr (fallback strings + amounts updated; SAVE% + $/mo recompute). All "$5/mo" copy → "$9/mo" (paywall, index.tsx premium CTA, judge, athletes-center, CritiqueRoom). NOTE: real charge amount must ALSO be set in RevenueCat dashboard + App Store Connect / Play Console — code only controls displayed fallback/copy.
- ACCESS MODEL: only 5 things require the subscription now — THE JUDGE, ATHLETE'S CENTER, PR ROOM, FORM ROOM, and THE ENHANCED. Everything else is free.
  - Community/Social chat → FREE (canChat=true; removed useSubscription from community.tsx). The Room → Elite RANK only (payment requirement removed in community.tsx tab + the-room.tsx; copy "no membership needed"). The Enhanced KEEPS the $9 paywall (hasSub) + age-20 + consent.
  - The 4 paid rooms keep existing bypasses (skool_verified / all_rooms_access / is_founder / is_admin) and AC keeps its Advanced-rank requirement.
- $200 Custom Program + $25 Backer: already active/purchasable (paywall → custom-program; founders → back). Pop-culture cosmetics (DBZ etc.) already $1 (gear.py SKIN_PRICE_USD=1, store.py STORE_PRICE_USD=1).
- BASELINE STATS ON SIGNUP: new one-time screen (src/components/BaselineStats.tsx) shown after Lite/Full pick, before the tour (BaselineGate in _layout.tsx; needsBaseline() skips admins/bots/anyone with existing PRs). Captures Bench/Squat/Deadlift/OHP (lb) + fastest 5K/10K (mm:ss) + 100m (sec). Skippable. Backend POST /api/onboarding/baseline sets prs + sprints["100m"] + inserts 5k/10k cardio docs (baseline:true) + awards milestone badges + baseline_set:true. default_user_doc gains baseline_set:false. Result: differentiated STR/PWR/SPD/END on the player card + leaderboards from day one. Verified via curl (prs/sprints/16 badges/attributes STR71 PWR86 SPD57 END18 tier B; skip path 200).
- JOURNEY RIVAL/CHALLENGE POLISH (journey.tsx): rivals sorted by XP + staggered into two rows (top 14/74) so 38px markers never overlap; readable name chip (9.5px on dark bg) + Lv; real rivals get a ⚔ corner tag, rivals ahead get a red ring, NPC "wanderers" are subtle (opacity, no dashed "unfinished" look). Tapping a rival now opens a proper bottom SHEET (rivalSheet) with big 50px CHALLENGE + VIEW LOADOUT buttons (was a tiny 8px-text button hidden in a speech bubble). Taunt bubble kept for flavor only.

## Implemented (2026-08 — Launch: bots removed + founder free-premium confirmed)
- BOTS REMOVED: seed() no longer creates the 10 AI bot athletes. On startup it now PURGES any is_bot users + their keyed data (cardio/workouts/quest_claims/steps/chat/store/checkins/coach/critiques/judge/inperson/verified_purchases/presets/supplements/nutrition/sessions). Idempotent. Leaderboards now show ONLY real members. Deleted 3 leftover baselineqa*@test.com QA accounts. DB = 9 real users (owner the9hutch [admin, hidden] + 8 real Google members).
- active-count: returns the REAL 30-min session count (removed the max(10,·) fake floor).
- FOUNDER FREE PREMIUM (production): confirmed all 5 paid gates bypass on user.is_founder — The Judge (canJudge), Athlete's Center (canAI), PR/Form Room (CritiqueRoom canAccess), The Enhanced (hasSub), and workout AI build. is_founder is a backend flag from founder_status() (first 100 real signups by created_at, excludes bots/admin/@test|@example), independent of RevenueCat — so it keeps working in Google Play / App Store builds. Existing members retain founder status + free premium.

## Implemented (2026-08 — Price update + Baseline reward + Rival Race)
- PRICES SET IN REVENUECAT: updated $rc_monthly $5->$9.00 and $rc_annual $39.99->$90.00 via the integration proxy /products endpoint (proj93f78c96; products prodf8cdb8e2a3 / prod850a4129b3). Persisted to /app/memory/revenuecat.md. NOTE: the RevenueCat offering the SDK reads is CDN-cached, so the in-app paywall reflects the new price after RC's cache refresh (a few minutes) and always in fresh store/dev builds; code fallbacks are already $9/$90.
- BASELINE REWARD: POST /api/onboarding/baseline now grants a one-time BASELINE_REWARD_XP=150 + 'calibrated' badge the first time a member logs REAL baseline lifts/times (not skip; guarded by prior baseline_set). Returns reward_xp. BaselineStats.tsx shows a "CALIBRATED +150 XP" overlay for ~1.6s before continuing. Verified via curl (reward_xp 150, calibrated badge, xp 150).
- RIVAL RACE ("catch me" bar): POST /api/journey/challenge now upserts a single ACTIVE race per pair in rival_challenges with a start-XP snapshot (starts:{uid:xp}); GET /api/journey/races returns each active race with {other_name, my_xp, other_xp, i_lead, gap, gap_start, progress(0-1), overtaken}. progress = how much the trailing racer has closed the starting gap; on overtake the race auto-completes (status=complete, winner_id) and is shown once as DONE. journey.tsx fetches races on load + after sending a challenge and renders an "⚔ ACTIVE RACES" section: per-race card with YOU vs NAME, a filling gap bar (🏁), status (CLOSING/AHEAD/DONE) and a label (NNN XP behind/ahead / caught!). Verified via curl (gap 500->250 progress 0->0.5->overtaken).

## Implemented (2026-08 — Race Rewards + Baseline Recap + Race Nudge)
- RACE REWARDS: when a rival race is won (overtake), GET /api/journey/races completes it via a guarded single-writer update and awards the WINNER RACE_WINNER_XP=200 + a 'race_winner' badge exactly once (rewarded flag). Response adds won_by_me + reward_xp. Journey race card shows "🏆 WON +200 XP" (green) for the winner and "🏁 LOST" (red) for the loser. Verified via curl (winner xp 600->800, race_winner badge, reward_xp 200).
- BASELINE RECAP: POST /api/onboarding/baseline now returns recap {percentile, position, total_members, big4} = where the member's starting Big-4 total ranks vs all non-admin members. BaselineStats overlay shows "Stronger than N% of The Circle · you enter at #P of M" alongside the +150 XP. Verified (percentile 100, #1 of 12, big4 1080).
- RACE NUDGE: races track a per-user seen_gap map. When YOUR lead shrinks by >= RACE_NUDGE_STEP(20) XP since you last viewed, that race returns nudge:true. Journey renders the card in amber with "⚠ CLOSING" status + "⚠ <rival> is closing — only <gap> XP behind!". Verified (nudge false on first view, true after the trailing rival closed 500->250). In-app only (no push).

## Implemented (2026-08 — Race History + Streak Shields + Baseline Retest)
- RACE HISTORY: GET /api/journey/races/history returns the caller's completed races [{other_name, won, completed_at}] (last 30). journey.tsx renders a "📜 PAST RACES" list under Active Races (🏆 Caught NAME / ☠ NAME caught you + WON/LOST). Verified.
- STREAK SHIELDS: races track defends.{uid} + shield_rewarded[]. When your lead survives SHIELD_STREAK(3) "closing" nudges without being overtaken, the leader gets SHIELD_XP(120) + a 'lead_defender' badge once (guarded). races response adds shield_awarded/shield_xp; race card shows "🛡 LEAD DEFENDED · +120 XP". Verified (3rd nudge -> shield True, B xp 1000->1120, badge).
- BASELINE RETEST: BaselineStats now takes a `manual` prop; new route app/baseline.tsx (<BaselineStats manual/>) with a BACK button + "RETEST YOUR MAXES / UPDATE YOUR STATS" copy; on submit it refreshes + router.back(). Settings ("MY STATS" section) has a "RETEST MY MAXES" NavButton (testID retest-maxes) -> /baseline. Backend POST /api/onboarding/baseline now MERGES: a blank/0 lift keeps the existing PR (never zeroes a skipped lift); reward only first time (already gives 0), recap always returned when something is provided. Verified (bench-only retest kept squat/deadlift/ohp; recap present).

## Implemented (2026-08 — Stat Trend + Defender Tiers)
- STAT TREND: POST /api/onboarding/baseline persists baseline_percentile + baseline_big4 each submit and returns recap.trend = {first} on first test or {first:false, percentile_delta, big4_delta} on retest. BaselineStats recap overlay shows "↑ +N% since last test · +NNN lb total" (green up / red down / dim no-change). Verified (first->true, retest -> +18% / +1350 lb).
- DEFENDER TIERS: shield awards now escalate by lifetime user.shield_count — bronze(1-2)=+120XP, silver(3-5)=+180XP, gold(6+)=+250XP; grants 'lead_defender' + 'shield_<tier>' badges. races response returns shield_tier + shield_xp. Journey race card shows "🛡 LEAD DEFENDED · <TIER> · +<xp> XP" color-coded (gold/silver/bronze). Verified (shield_count 5 -> next shield = gold +250, shield_gold badge).
- NOTE: recurring stale Metro "SyntaxError CritiqueRoom.tsx (240:24)" on restart is a FALSE cache artifact — babel parseSync of the file returns PARSE OK and pr-room/form-room render fine. Ignore it.

## Implemented (2026-08 — Defender Wall + Trend Chart)
- DEFENDER WALL: shield_tier_for(count) helper in shared.py (gold>=6, silver>=3, bronze>=1). Leaderboard _safe entries now include shield_tier; leaderboard row shows a color-coded 🛡 next to the name (gold/silver/bronze). Profile (tabs)/profile.tsx shows a "🛡 <TIER> DEFENDER" pill in the player-card pill row (computed client-side from user.shield_count). Verified (shield_count 7 -> leaderboard shield_tier 'gold').
- TREND CHART: baseline endpoint $push percentile_history {p,big4,at} capped to last 12 (on user doc, surfaced via /auth/me). New component src/components/PercentileTrend.tsx (react-native-svg sparkline of percentile across retests, shows ↑+N% delta + last point label; returns null with <2 points). Rendered on Profile below the FoundingRibbon. Verified (2 baseline submits -> percentile_history has 2 entries).
- NOTE: automation login click collides with the "LOGIN" segmented tab label (submit vs tab) — not an app bug; use a more specific submit locator when testing.

## Implemented (2026-08 — Weekly Digest + Defender Leaderboard)
- WEEKLY DIGEST: GET /api/digest/weekly returns {week, is_new_week, level, rank, xp, xp_gained, level_up, workouts, cardio_km, races:{won,lost}, trend:{percentile_delta}, shield_tier, shield_count}. Uses a per-ISO-week weekly_snap on the user (rolls forward like gym_rank_snap) so xp_gained reflects gains since the week started; workouts/cardio/races counted over last 7 days. New component src/components/WeeklyDigestCard.tsx renders a compact "📊 YOUR WEEK" grid on Home (full mode only, above Spotlight): XP this week, races W-L, workouts, distance, trend %, + a defender line. Verified via curl.
- DEFENDER LEADERBOARD: leaderboard.py adds board_type "defender" (metric=shield_count, label "Shields", sorted desc, shield_count>0). Added "🛡 DEFENDERS" chip to BOARDS in leaderboard.tsx (uses the generic non-season row rendering). Verified (returns members by shields; currently empty as no real member has earned a shield yet).
- LAUNCH DATA CLEANUP: purged 13 leftover QA junk accounts (@qa.com). ROOT CAUSE of earlier failed cleanups: emails are stored LOWERCASED on register, so delete-by-mixed-case-email didn't match — always match/delete test accounts case-insensitively. DB now = 9 real users (owner hidden + 8 real members); leaderboards clean.

## Implemented (2026-08 — Big-4 settings + login prompt, Your Week relocation, paywall price fix, security audit)
- BIG-4 IN SETTINGS: settings.tsx has a "MY BIG 4 LIFTS" inline editor (s-bench/s-squat/s-deadlift/s-ohp + save-lifts) POSTing to /api/onboarding/baseline (blank keeps existing PR), plus "FULL RETEST (INCL. RUN TIMES)" -> /baseline.
- BIG-4 LOGIN PROMPT: _layout.tsx OnboardingGates now prompts ANY non-admin/non-bot member whose Big-4 total is 0 (new signups AND existing skippers) on app open; skip dismisses for the session (re-asks next login); entering lifts hides it; then the tour shows. (needsBaseline is now prs-based, not baseline_set-based.)
- YOUR WEEK: removed the big card from Home; WeeklyDigestCard is now a SUBTLE one-line strip ("THIS WEEK · +XP · WW·LL · ↑N% · 🛡G") shown on the Journey header, only when there's activity. Backend /api/digest/weekly still tracks in background.
- PAYWALL PRICE FIX (was HIGH bug 3 iterations): paywall.tsx now displays fixed MONTHLY_PRICE=$9.00 / ANNUAL_PRICE=$90.00 (SAVE 17%, $7.50/mo) instead of the RC test-store priceString which stayed cached at $5/$39.99. Real purchase still uses the live RC package. RC dashboard products were also set to $9/$90 via the integration proxy. Screenshot-confirmed $9.00/$90.00.
- FOUNDERS: now 10 taken / 90 remaining — all 10 are REAL members (0 bots, 0 @test/@qa/@example); a real member (streetfighter2131@gmail.com) joined during QA, so 10 is correct (spec of 9 predated that signup).
- SECURITY AUDIT (iteration, read-only): CONDITIONAL PASS. No Critical/High. 2 MEDIUM: (SEC-001) POST /api/register-push has no auth + trusts body user_id (BOLA) -> require get_current_user + bind to user["user_id"]; (SEC-002) AI endpoints (coach.py chat/TTS/whisper, judge.py, critique.py) have no rate limit -> add consume_bucket per-user/day. P3 hardening: CORS wildcard+credentials (shared.py ~2149), verify.py mock OTP leak, unauth coach TTS fetch, account enumeration/login timing, hardcoded Maps key in app.json, web token in localStorage. NOT yet fixed — pending user go-ahead.

## Implemented (2026-08 — Delete/Edit own posts, comments & chats)
- JUDGE: added DELETE /api/judge/{submission_id} (owner/admin; also deletes its judge_comments) + a 🗑 delete button on own submission cards in judge.tsx. Comment EDIT-ONCE: PATCH /api/judge/{submission_id}/comments/{comment_id} + ✎ edit button (own, not-yet-edited) beside the existing ✕ delete; composer switches to SAVE/cancel; "· edited" tag shown.
- PR ROOM / FORM ROOM (CritiqueRoom): post delete already existed. Added comment EDIT-ONCE: PATCH /api/rooms/{room}/{post_id}/comments/{comment_id} + ✎/✕ on own comments, composer SAVE/cancel + "· edited" tag. (Comment delete already existed.)
- CHATS (ChatRoom — community/The Room/gym rooms): added PATCH + DELETE /api/chat/{room}/messages/{message_id} (owner/admin; edit blocked after first edit for non-admins). UI: Edit/Delete actions on own bubbles, an "Editing message (one-time)" banner with CANCEL over the composer, send button shows ✓ in edit mode, "edited" tag on edited messages.
- EDIT-ONCE RULE: server sets edited=true + edited_at; second edit -> 403 "You can only edit ... once." Admins bypass the once-limit. Verified via curl (regular user edit1 ok, edit2 403, delete ok; admin bypasses).

## Implemented (2026-08 — 3 new quest skins + security fixes)
- QUEST-UNLOCK SKINS: added 3 new quest-exclusive skins to gear.py QUEST_SKINS (now 7 total): Venom Warden (epic, clear 9 Boss/Monthly), Storm Reaver (legendary, defeat 8 Bosses), Abyss Leviathan (legendary, clear 6 Monthly). Art generated via Nano Banana (assets/images/skins/skin_venom|storm|abyss.png), wired into theme.ts SKIN_IMAGES. Auto-wired into /gear list, equip validation, and boss-loot reveal (quest_loot_for_claim iterates QUEST_SKINS). A 4th (Solar Titan) was skipped — Emergent LLM key budget exhausted mid-gen. Verified: /gear returns all 7 quest skins; app bundles + login renders.
- SEC-001 FIX (push BOLA): POST /api/register-push now requires get_current_user and binds the device token to the authenticated caller's user_id (RegisterPushBody no longer takes user_id). Frontend push.tsx sends the bearer token (readToken exported from auth.tsx). Verified: unauth register-push -> 401.
- SEC-002 FIX (AI cost cap): new shared.ai_daily_cap(user, feature) using auth_throttle.consume_bucket with a 1-day window (admins exempt). Wired into coach chat (80/day), coach TTS (80), voice transcribe (80), judge submit (25), critique submit (25). Over quota -> 429.
- NOTE: Emergent LLM key budget is EXHAUSTED (cost 28.49 / max 28.4) — Judge/Coach/TTS/image-gen will fail until the user tops up (Profile → Manage plan → Universal Key → Add Balance).

## Peer Critique Rewards + Top Critic + Founder-run AI messaging (2026-08)
- AI outage banner copy now frames the pause as intentional: "AI critiques are paused during the Founder run — they switch on once the beta wraps and paid members start joining. Post your lifts and critique each other." (src/components/AiStatusBanner.tsx). Backed by GET /api/ai/status (shared.ai_is_degraded, mark_ai_outage/mark_ai_ok wired into judge/critique/coach).
- Peer Critique Boost: leaving a critique on someone else's Judge/Form/PR post awards CRITIQUE_XP=20, daily-capped at CRITIQUE_DAILY_CAP=5 (db.critique_daily). Self-comments award 0. comment POST returns awarded_xp; frontend shows a green "+20 XP for critiquing 🔥" note.
- Comment likes: NEW endpoints POST /api/judge/{sid}/comments/{cid}/like and POST /api/rooms/{room}/{pid}/comments/{cid}/like (toggle). Comment GET now returns like_count + liked. Frontend: ♥ like button on each comment in judge.tsx + CritiqueRoom.tsx.
- Top Critic: when a critic's comment gets a fresh like they earn CRITIQUE_LIKE_XP=10 and critic_likes++ (rolled back on unlike, no XP deduct). At TOP_CRITIC_LIKES=20 total received likes, user gets top_critic:true + "top_critic" badge. Exposed in /users/{id}/public; MemberSheet shows a "🎖 TOP CRITIC" chip. Verified end-to-end via curl (comment +20, like +10/critic_like, unlike rollback, self=0, badge flips at 20).
- NOTE: Emergent LLM key budget still exhausted (28.50/28.40) — AI verdicts + Solar Titan skin gen blocked until user tops up.

## Admin AI Gate (2026-08) — AI OFF for members until admin enables
- Global gate in db.app_state key "ai_gate" {enabled:bool}, DEFAULT FALSE. Helpers: ai_globally_enabled(), set_ai_enabled(), require_ai_access(user) (admins always allowed).
- Coach chat/tts/voice: require_ai_access → 403 for members when gate OFF ("AI features aren't active yet…").
- Judge submit & Form/PR critique: still POST normally when gate OFF; the LLM critique block is skipped (critique=null) so rooms stay open for peer critique. Admins get real AI verdicts.
- GET /api/ai/status now returns {enabled, is_admin, active(=enabled or admin), degraded}.
- Admin endpoints: GET/POST /api/admin/ai-gate {enabled}. Admin UI: admin.tsx Users tab → "🤖 AI FEATURES" Switch (testID ai-gate-switch).
- AiStatusBanner: members see "🔒 {label} isn't active yet" (founder-run copy) when !active; admins see "🛠️ AI is admin-only right now — enable in Admin ▸ AI Features" when gate OFF; degraded notice only when enabled+failing.
- Verified via curl: gate OFF → member coach 403, member judge posts with critique null, member admin-endpoint 403; gate ON → member active=true, coach passes gate (502 only due to exhausted budget). Banner text confirmed present in Judge room DOM.
