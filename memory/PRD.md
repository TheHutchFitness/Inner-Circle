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
