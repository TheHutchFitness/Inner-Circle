#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Hutch's Inner Circle fitness app. This session: (1) Sprint testing 40yd/100m on cardio screen with stopwatch + best-time logging (+40 XP on PR). (2) Cardio runs/rides award XP. (3) Wire sprints/cardio/steps into Player Card radar (SPD/END). (4) 10 permanent milestone bots on leaderboards + live ACTIVE PLAYERS counter (min 10) on RANK screen. (5) Rename ◈ VAULT unlockables screen/button to INVENTORY (keep PR VAULT). (6) CONDITIONING card on ME page: daily steps + heart rate with manual entry + Apple Health/Health Connect sync (native only). (7) Purge ghost test accounts. (8) Hero leveling cinematic intro: ~4.5s HERO AWAKENED on first signup, ~1.5s WELCOME BACK flash on each login."

backend:
  - task: "SECURITY FIX: RevenueCat server-side purchase verification for lifetime tiers ($200 custom_program, $25 backer)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "P0 fix. Previously POST /api/custom-program/unlock and POST /api/founders/back blindly granted paid privileges to any authed request (free-unlock exploit). Added POST /api/revenuecat/webhook (auth via REVENUECAT_WEBHOOK_AUTH shared secret in backend/.env; raw Authorization header, NOT Bearer). Webhook is the ONLY writer of verified_purchases collection + paid flags; idempotent via rc_webhook_events unique event id; REFUND revokes. Hardened unlock/back to fail-closed (402) unless a verified_purchases row exists. Self-tested with curl: exploit now 402, wrong webhook auth 401, correct webhook grants (200 granted), duplicate event skipped, REFUND revokes, unlock after refund 402. Needs testing_agent confirmation."

  - task: "Sprint log/me endpoints (40yd/100m), best time, +40 XP on PR"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/sprint/log stores best time and awards 40 XP on new best; GET /api/sprint/me returns bests. Curl verified."
  - task: "Heart rate log/today endpoints"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "POST /api/heart-rate/log upserts resting/avg/max bpm by day; GET /api/heart-rate/today returns today's. Curl verified. Steps endpoints already existed."
  - task: "profile/attributes blends sprint + cardio distance + daily steps into SPEED/ENDURANCE"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Speed blends 40yd/100m sprint scores; endurance blends cardio km + avg daily steps. Curl showed speed rose to 82 after logging a 4.8s sprint."
  - task: "10 permanent milestone bots seeded on leaderboards + active-count endpoint"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "seed() upserts 10 bots (bot1..10@circle.ai, is_bot=True) spanning ranks with prs/sprints/cardio; reset each startup. GET /api/active-count returns max(10, sessions in last 30min). Verified 14 users, 10 bots, leaderboards populated."
  - task: "Purge ghost test accounts from DB"
    implemented: true
    working: true
    file: "backend/server.py (one-off script)"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Deleted 53 ghost users (test_/fresh_/rankup_/perk_/quest_/cardio_/pr* + @example.com/@ex.com) and their workouts/cardio/claims/sessions. Kept 3 seeds + real user the9hutch + bots."

frontend:
  - task: "Cardio SPRINT TEST screen (40yd/100m stopwatch + best times, GPS/SPRINT mode toggle)"
    implemented: true
    working: true
    file: "frontend/app/cardio.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Mode toggle GPS TRACK / SPRINT TEST. Stopwatch start/stop logs to /api/sprint/log; shows NEW BEST +40 XP. Smoke-tested: logged 1.25s new best."
  - task: "ACTIVE PLAYERS pill on RANK screen (polls /api/active-count)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/leaderboard.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Green ACTIVE pill polls every 20s. Verified '22 ACTIVE' and 10 bots render on boards."
  - task: "CONDITIONING card on ME page (steps + heart rate + sprints; manual entry + Health sync)"
    implemented: true
    working: true
    file: "frontend/src/components/HealthCard.tsx, frontend/app/(tabs)/profile.tsx, frontend/src/lib/health.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Steps progress vs goal, resting/avg HR, sprint bests. Manual entry modal logs steps + HR. SYNC HEALTH tries native Apple Health/Health Connect (device build only) else shows fallback msg. Smoke-tested steps-value visible."
  - task: "Rename VAULT unlockables to INVENTORY (keep PR VAULT)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/index.tsx, frontend/app/vault.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "HUD button '⬡ INVENTORY' + screen title 'INVENTORY'. PR VAULT sections unchanged."
  - task: "Hero leveling cinematic intro (signup ~4.5s HERO AWAKENED, login ~1.5s WELCOME BACK flash)"
    implemented: true
    working: true
    file: "frontend/src/components/HeroIntro.tsx, frontend/src/lib/auth.tsx, frontend/app/_layout.tsx, frontend/app/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Auth context exposes intro/showIntro/clearIntro; login+register+google trigger it. HeroIntro overlay (Reanimated portrait/glow/sweep/rank stamp/XP fill). Smoke-tested login flash showed RONIN WELCOME BACK LV6. NOTE: real Fal.ai mp4 video for signup pending user's FAL key."

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Cardio SPRINT TEST screen (40yd/100m stopwatch + best times, GPS/SPRINT mode toggle)"
    - "CONDITIONING card on ME page (steps + heart rate + sprints; manual entry + Health sync)"
    - "Sprint log/me endpoints (40yd/100m), best time, +40 XP on PR"
    - "profile/attributes blends sprint + cardio distance + daily steps into SPEED/ENDURANCE"
    - "10 permanent milestone bots seeded on leaderboards + active-count endpoint"
    - "Hero leveling cinematic intro (signup ~4.5s HERO AWAKENED, login ~1.5s WELCOME BACK flash)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "Session batch done. Test all backend endpoints (sprint, steps, heart-rate, active-count, attributes blend, leaderboard bots) and frontend flows (cardio SPRINT stopwatch+log, CONDITIONING manual entry, ACTIVE pill, INVENTORY rename, login/signup cinematic intro). Login: athlete@test.com / TestPass123! (also elite@ and freak@). Register a NEW user to verify signup cinematic (HERO AWAKENED). Health native sync is device-only; manual entry must work everywhere. Do NOT test the Fal.ai signup video (not yet built)."

  - task: "Workout revamp: split templates (Push/Pull/Legs/Upper/Lower/Arnold/Full Body/Custom) + blank sessions"
    implemented: true
    working: true
    file: "backend/server.py, frontend/app/(tabs)/workout.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/workout/templates returns 8 templates. TRAIN landing shows template cards; picking one opens a blank session (exercises with 0 sets); Custom starts empty and auto-opens the library."
  - task: "Exercise library (73 built-in grouped) + custom exercises; add-exercise modal"
    implemented: true
    working: true
    file: "backend/server.py, frontend/src/components/ExerciseLibraryModal.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/exercises returns {library, custom}; POST /api/exercises/custom adds a user exercise. Modal: search, grouped by muscle, multi-select, create custom. + ADD EXERCISE in session appends them."
  - task: "Per-exercise stats page STATS/LOG/GRAPHS with 1W/1M/3M/ALL + lb/kg toggle"
    implemented: true
    working: true
    file: "backend/server.py, frontend/app/exercise-stats.tsx, frontend/src/lib/units.tsx"
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/exercise/stats|log|graph. Screen matches reference: Total/Avg/Max/AvgMax for Sets/Wt/Reps/Vol with max dates; LOG lists every set; GRAPHS shows top-set weight curve. Opens from active session, finish summary, and history. lb/kg toggle via UnitsProvider (persisted)."
  - task: "Session finish summary + workout history (tap workout -> exercises -> stats)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/workout.tsx"
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "After FINISH, SESSION COMPLETE summary lists exercises (tap -> stats). TRAIN HISTORY lists past workouts; expand to see exercises; tap exercise -> stats page."
  - task: "Skool verification code changed to 4-digit (4882)"
    implemented: true
    working: true
    file: "backend/.env, backend/server.py, frontend/app/settings.tsx"
    priority: "low"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "SKOOL_VERIFICATION_CODE=4882. POST /api/profile/skool-verify with 4882 -> verified True; 0000 -> 400. Settings input now number-pad, maxLength 4."

agent_communication:
    -agent: "main"
    -message: "SECOND batch (workout revamp): Test the new workout system. Backend: GET /api/workout/templates (8), GET /api/exercises (library+custom), POST /api/exercises/custom, GET /api/exercise/stats?name=Bench Press&rng=all (athlete@ has history under 'Bench Press'), /api/exercise/log, /api/exercise/graph, and POST /api/profile/skool-verify code 4882 (valid) vs 0000 (400). Frontend: TRAIN shows 8 templates + HISTORY; start a template -> blank exercises with + ADD FIRST SET and + ADD EXERCISE (opens library: search, multi-select, create custom); add a set, FINISH -> SESSION COMPLETE summary; tap an exercise (in session/summary/history) -> exercise-stats screen with STATS/LOG/GRAPHS tabs + 1W/1M/3M/ALL + lb/kg toggle (values convert). Login athlete@test.com / TestPass123!. Do NOT test the Fal.ai signup video (account balance exhausted; in-app HERO AWAKENED cinematic is the fallback)."


#==================== SESSION: Custom Program + Founders + The Judge + Rank Overhaul ====================
backend:
  - task: "1-on-1 Custom Program endpoints (unlock/intake/status)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/custom-program/unlock sets custom_program_purchased+athletes_center_access; POST /api/custom-program/intake stores goals/injuries/contact (requires purchased); GET /api/custom-program returns {purchased, athletes_center_access, intake}. Quick python test passed."
  - task: "Founders endpoints (first 100 members + development backers)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "GET /api/founders returns founders (first 100 non-bot by created_at, with number+is_backer), backers list, and me {number,is_founder,is_backer}. POST /api/founders/back flags user as backer. Quick python test passed (elite=#2, backers increment)."
  - task: "The Judge: AI physique critique (GPT-5.6 vision) + shared feed + comments"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/judge/submit (multipart image, optional caption) stores photo in Object Storage (chat_media) + runs GPT-5.6-terra vision via emergentintegrations returning JSON {overall,symmetry,conditioning,size,posing,notes}; GET /api/judge/feed; GET/POST /api/judge/{id}/comments. Image served via existing /api/chat/media/{id}?token=. NEEDS a real physique-like JPEG to validate critique parsing."
  - task: "Rank overhaul: 8 ranks, each = 10 app levels (added Vanguard/Warrior/Boss)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "rank_from_xp now level-based: RANK_ORDER=[Beginner,Intermediate,Advanced,Vanguard,Warrior,Boss,Elite,Freak], idx=(level-1)//10. level=1+xp//250. New RANK_PERK_BG + BACKGROUNDS (bg_vanguard/warrior/boss L31/41/51) + 4 new WIDGETS. Seed XP bumped (athlete 3000=Intermediate L13, elite 15500=Elite L63, freak 18500=Freak L75). next-suggestion uses RANK_ORDER index. Verified via python."

frontend:
  - task: "Custom Program screen (offer -> RC lifetime purchase -> intake form -> confirmation)"
    implemented: true
    working: "NA"
    file: "frontend/app/custom-program.tsx, frontend/src/lib/revenuecat.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Entry from paywall + HQ. Offer shows $200 benefits. Purchase uses RC 'custom_program' entitlement (needs RC dashboard product; NOT purchasable on web/Expo Go). After purchase -> unlock -> intake form -> confirmation. Test screen render + backend endpoints only."
  - task: "Founders screen (First 100 tab + Backers tab + Back the Build)"
    implemented: true
    working: "NA"
    file: "frontend/app/founders.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Entry from HQ (below Cardio). Lists first 100 members w/ numbers + your standing; Backers tab lists names equally. BECOME A BACKER uses RC 'backer' entitlement ($25; not purchasable on web). Verify list renders + tabs switch."
  - task: "The Judge screen (gated; camera/gallery upload; AI score card; member comments)"
    implemented: true
    working: "NA"
    file: "frontend/app/judge.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Gated by isSubscribed||skool_verified||all_rooms_access. Lock screen for non-members. Upload via gallery (web file input) -> submit -> AI score card (overall/10 + Symmetry/Conditioning/Size/Posing bars + notes). Comments modal add/list. Use elite@test.com (skool_verified) to access."
  - task: "HQ tweaks: HOME tab label, centered RECAP/INVENTORY/RANKS, Founders+Judge+CustomProgram CTAs"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/_layout.tsx, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Tab renamed HQ->HOME. Removed 'HQ TERMINAL ONLINE'; three HUD buttons centered (RECAP/INVENTORY/RANKS). Added Founders + The Judge + 1-on-1 Custom Program CTA cards."
  - task: "Progression screen (ranks & rewards ladder) + login glitch/static cover"
    implemented: true
    working: "NA"
    file: "frontend/app/progression.tsx, frontend/src/components/GlitchImage.tsx, frontend/app/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "RANKS button on HQ opens progression (8 rank tiers with frame previews + perks; level-reward backgrounds/widgets from /api/unlockables). Login cover now has animated glitch slices + TV static overlay (visual only)."

metadata:
  created_by: "main_agent"
  version: "3.0"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "The Judge: AI physique critique (GPT-5.6 vision) + shared feed + comments"
    - "Founders endpoints (first 100 members + development backers)"
    - "1-on-1 Custom Program endpoints (unlock/intake/status)"
    - "The Judge screen (gated; camera/gallery upload; AI score card; member comments)"
    - "Founders screen (First 100 tab + Backers tab + Back the Build)"
    - "Custom Program screen (offer -> RC lifetime purchase -> intake form -> confirmation)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "NEW batch. Test BACKEND: (1) /api/custom-program/unlock+intake+status, (2) /api/founders + /api/founders/back, (3) /api/judge/submit (multipart JPEG physique image + caption) then /api/judge/feed and /api/judge/{id}/comments GET+POST — verify critique JSON has overall+4 categories+notes (uses GPT-5.6-terra vision via emergentintegrations, EMERGENT_LLM_KEY already set), (4) rank system already verified. Use a REAL physique-like JPEG per /app/image_testing.md rules (real features, not blank). FRONTEND: login=elite@test.com/TestPass123! (elite is skool_verified => can access The Judge). Verify HOME tab label, centered RECAP/INVENTORY/RANKS buttons, and CTAs open Founders/Judge/Custom-Program/Progression screens. On The Judge: upload a physique photo (web file input), submit, confirm AI score card renders, add a comment. Founders: list renders + tabs switch. Progression: 8 ranks render. IMPORTANT: RevenueCat purchases CANNOT complete on web/Expo Go — do NOT attempt to complete a purchase; only verify offer screens render and the backend unlock/back endpoints (call them directly with a bearer token) grant access. Do NOT retest older sprint/cardio/workout tasks."

#==================== SESSION: Boss Quests + Backer Perks + Judge Leaderboard + Program Delivery ====================
backend:
  - task: "Boss Quests (rare high-reward: unlock Boss frame + Boss background)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "QUEST_TEMPLATES['boss'] with 2 quests; /api/quests?scope=boss and scope=all include boss. Claim awards reward_xp + typed reward (frame->extra_unlocks 'frame_boss'; background->bg_boss). Verified list returns 2 boss quests."
  - task: "Judge weekly leaderboard endpoint"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET /api/judge/leaderboard returns last-7-day submissions with critique.overall>0 sorted desc top 20. Verified 200."
  - task: "Program Delivery (coach uploads file -> buyer downloads)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Owner-only GET /api/custom-program/requests + POST /api/custom-program/requests/{id}/deliver (multipart file -> Object Storage). GET /api/custom-program returns program_media_id/program_file_name. Verified full flow with temp owner grant; file served via /api/chat/media/{id}."
  - task: "Backer flag on chat + judge docs"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "post_message + judge submit/comment docs include founder_backer for ★ rendering."

frontend:
  - task: "Boss Quests tab (☠ BOSS) in Quests"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/quests.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added ☠ BOSS scope chip + included in ALL. Smoke screenshot shows chip selected; boss quests render below personal goals."
  - task: "Judge leaderboard toggle (THE LINEUP / TOP THIS WEEK) + backer star"
    implemented: true
    working: "NA"
    file: "frontend/app/judge.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Segmented toggle; board lists rank_pos medal + thumb + name + score. ★ shown for backer names in feed/comments/board."
  - task: "Backer ★ on player card + chat name; Boss frame on player card"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/profile.tsx, frontend/src/components/ChatRoom.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "★ BACKER pill on player card when founder_backer; ★ next to chat names. Boss frame used on card if extra_unlocks has frame_boss and rank<Boss."
  - task: "Program Delivery UI (coach inbox screen + buyer download button)"
    implemented: true
    working: "NA"
    file: "frontend/app/coach-programs.tsx, frontend/app/custom-program.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Owner-only /coach-programs lists intakes + upload via expo-document-picker -> deliver. Buyer confirmation shows DOWNLOAD YOUR PROGRAM when delivered, else 'Coach is writing' note. COACH INBOX link on custom-program for owners (all_rooms_access)."

agent_communication:
    -agent: "main"
    -message: "THIRD batch. Backend already verified by main via python (boss quests list, judge leaderboard, program deliver full flow with temp owner grant, backer flags). Please FRONTEND-test: (1) Quests -> ☠ BOSS tab shows 2 boss quests (SLAY THE GATEKEEPER, CLAIM THE THRONE) with big rewards; ALL tab also includes a BOSS section. (2) The Judge (login elite@test.com, skool_verified) -> toggle 'TOP THIS WEEK' renders leaderboard (may be empty if no scored subs in last 7 days — empty state text is OK; if you submit a real physique JPEG it should appear). (3) Player card (ME tab): to see ★ BACKER pill, set founder_backer=true on elite via mongo then reload. (4) Coach inbox: set all_rooms_access=true on elite via mongo, open /custom-program -> COACH INBOX button -> /coach-programs lists requests + upload a file (web file chooser) -> delivers; then buyer download button appears in custom-program confirmation. Revert temp mongo flags after. Do NOT attempt RevenueCat purchases. Do NOT retest prior batches."

#==================== SESSION: Frame Vault + Judge History + Backer Thank-You + Boss Alert ====================
backend:
  - task: "Frame Vault endpoints (GET /api/profile/frames, POST /api/profile/set-frame)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "frames returns all frames up to rank + quest-unlocked (frame_boss). set-frame validates unlocked (200 valid Elite, 403 invalid). Verified via python."
  - task: "Judge personal history (GET /api/judge/my-history)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Returns {history[asc by date with all category scores], best, count}. Verified 200."
frontend:
  - task: "Frame Vault (equip any unlocked card frame on player card)"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "Tap ◈ frame name on player card -> FRAME VAULT modal lists all unlocked frames with swatches. Verified modal renders via screenshot. Selecting a frame POSTs set-frame + refresh; card uses user.active_frame."
  - task: "Judge History MY SCORES (trend line + per-submission list)"
    implemented: true
    working: "NA"
    file: "frontend/app/judge.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "3rd toggle 'MY SCORES' shows stat tiles (best/latest/trend/judged) + react-native-svg trend polyline of overall scores + list. Needs a scored submission to populate."
  - task: "Backer Thank-You celebration modal"
    implemented: true
    working: "NA"
    file: "frontend/app/founders.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Full-screen celebration modal shown once immediately after a successful Backer purchase (back() success). Tied to RevenueCat purchase; cannot complete on web — verify modal markup only if triggerable."
  - task: "Boss Alert dot on Quests tab"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/_layout.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Tab bar polls /api/quests?scope=boss every 30s; shows a warning dot (testID boss-alert-dot) on QUESTS when any boss quest is complete && !claimed. Boss quests have huge objectives so hard to complete in test; verify tab bar renders normally without the dot (no crash)."

agent_communication:
    -agent: "main"
    -message: "FOURTH batch. Backend verified by main (frames/set-frame/my-history). FRONTEND-test the two testable ones: (1) Frame Vault: login freak@test.com (all frames unlocked), ME tab, tap the frame name under the player card (testID open-frame-vault) -> modal lists frames -> tap testID frame-Cobalt -> modal closes and player card frame border/name update; reload and confirm it persisted. (2) Judge History: login elite@test.com (skool_verified), open THE JUDGE, submit a real physique JPEG (per /app/image_testing.md), then tap 'MY SCORES' (testID judge-view-mine) -> a trend line + a history row with the score appears. For Boss Alert: just confirm the bottom tab bar renders fine (no crash) — the warning dot only appears when a boss quest is claimable (huge grind, skip). For Backer Thank-You: purchase can't complete on web, skip E2E. Do NOT retest prior batches."

#==================== SESSION: Verify Nudge + Score Share + Boss Countdown + Coach Memory + Save Plan + Voice Ask ====================
backend:
  - task: "Coach Memory (inject PRs + recent workouts into coach prompt)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "coach_send now prepends athlete PRs + last 5 workout summaries. Verified: asked working weight, coach cited real 315lb bench PR and computed loads."
  - task: "Save Plan endpoints (coach_plans CRUD)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "GET/POST/DELETE /api/coach/plans verified (save auto-titles from first line)."
  - task: "Voice Ask transcription (Whisper whisper-1)"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "POST /api/voice/transcribe (multipart audio) -> OpenAISpeechToText.transcribe whisper-1. Rejects bad formats (400 verified). Real audio transcription needs a device mic; web/native record via VoiceButton."
frontend:
  - task: "Verify Nudge banner on Judge for unverified members"
    implemented: true
    working: "NA"
    file: "frontend/app/judge.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Banner shows when member can access Judge (skool/premium) but is NOT email/phone verified; tap opens Verify modal."
  - task: "Score Share button on Judge submissions"
    implemented: true
    working: "NA"
    file: "frontend/app/judge.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "↗ SHARE button next to CRITIQUES on scored submissions -> RN Share.share with score breakdown text."
  - task: "Boss Countdown on boss quest cards"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/quests.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Boss quest cards show '⏳ Nd left' (days to end of month) instead of global stat when unclaimed."
  - task: "Save Plan button (coach) + COACH PLANS section (Train)"
    implemented: true
    working: "NA"
    file: "frontend/app/coach.tsx, frontend/app/(tabs)/workout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Each coach reply has 'SAVE TO TRAIN'; saved plans appear as COACH PLANS cards on Train (with delete)."
  - task: "Voice Ask mic button on coach input"
    implemented: true
    working: "NA"
    file: "frontend/src/components/VoiceButton.tsx, frontend/app/coach.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "🎤 button records (expo-audio native / MediaRecorder web) -> /api/voice/transcribe -> fills composer. Real mic needed; headless web may lack mic."

agent_communication:
    -agent: "main"
    -message: "SECURITY FIX (P0) — RevenueCat server-side purchase verification. BACKEND-ONLY test requested. The two lifetime-tier grant endpoints used to hand out paid content to any authed request; now they fail-closed. Please verify: (login test users from /app/memory/test_credentials.md; webhook secret REVENUECAT_WEBHOOK_AUTH is in that file too). Tests: (1) POST /api/custom-program/unlock and POST /api/founders/back WITHOUT any verified purchase -> expect 402. (2) POST /api/revenuecat/webhook with WRONG Authorization -> 401; with MISSING Authorization -> 401. (3) POST /api/revenuecat/webhook with correct Authorization header (raw secret value, NOT 'Bearer') and body {\"event\":{\"id\":\"<unique>\",\"type\":\"INITIAL_PURCHASE\",\"app_user_id\":\"<that user's user_id from /api/auth/me>\",\"entitlement_ids\":[\"custom_program\"],\"product_id\":\"custom_program_lifetime\",\"store\":\"APP_STORE\",\"environment\":\"SANDBOX\"}} -> 200 processed granted; THEN POST /api/custom-program/unlock -> 200 and user shows custom_program_purchased + athletes_center_access. (4) Same for backer entitlement -> then POST /api/founders/back -> 200 and user is founder_backer. (5) Duplicate webhook (same event id) -> {duplicate:true}. (6) REFUND event for custom_program -> then /api/custom-program/unlock -> 402 again. Use a throwaway test user (e.g. athlete@test.com) so grants don't pollute elite. Do NOT test frontend. Do NOT attempt real RevenueCat purchases."
