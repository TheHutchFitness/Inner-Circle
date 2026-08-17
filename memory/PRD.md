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
