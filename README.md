# Forge — Personal Fitness & Lifestyle Command Center

A mobile-first, installable web app for running a fitness transformation day to day: workouts, nutrition, hydration, walking, sleep and recovery, habits, calendar scheduling, body progress, a transformation program, analytics and an AI coach. All of it is in one app, backed by a real Postgres database with per-user row-level security.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Data | Supabase (Postgres + Auth + Storage), `@supabase/supabase-js` |
| Client cache | TanStack Query, persisted to `localStorage` for offline reads |
| Offline writes | Ordered write queue in `localStorage`, replayed on reconnect (`src/lib/data.tsx`) |
| Charts | Recharts |
| AI | Anthropic Messages API via a server route (`src/app/api/assistant/route.ts`) |
| PWA | Web manifest + service worker (`public/sw.js`) |

## Architecture

```
src/
  app/
    login/                 email+password, sign-up, magic link
    (app)/                 authenticated shell (sidebar on desktop, bottom nav + quick-log FAB on mobile)
      page.tsx             Dashboard — daily score, workout, nutrition, water, activity, sleep, recovery, schedule, habits
      onboarding/          profile → training → targets (Mifflin–St Jeor suggestion) → habits/program/demo
      workout/             plans (reorder/duplicate/archive/schedule), history (repeat), exercise library, analytics
      workout/plan/[id]    plan editor + progressive-overload hints, "add to calendar"
      workout/session/[id] gym execution mode: steppers, auto rest timer, PR detection, skip/replace/add, pause, finish
      nutrition/           daily log, copy yesterday, saved meals (1-tap), weekly meal plan, recipes, custom foods, trends
      hydration/ activity/ sleep/   dedicated trackers (GPS walk tracker, readiness check-in)
      calendar/            day/week/month/agenda, drag-to-reschedule, recurrence, conflicts, day planner, .ics + Google
      habits/              checklist, streaks, heatmaps, weekly targets, auto-complete from logs, reminders
      progress/            weight (7-day rolling avg + least-squares trend), measurements, private photos + compare, program, goals
      analytics/           weekly/monthly report, fitness score breakdown, levers, calories-vs-weight, consistency-vs-progress
      assistant/           AI chat with confirm-to-apply proposals + offline "quick insights"
      settings/            profile, every target, score weights, units, theme, notifications/reminders, demo data, export, delete account
    api/assistant/         server-only AI route (key never reaches the browser)
  lib/
    calc.ts                ALL calculations (pure + unit-tested): macros, scores, streaks, PRs, overload, readiness, recurrence, conflicts…
    data.tsx               query cache, optimistic writes, offline queue
    hooks.ts               profile + range loaders + day scores
    templates.ts demo.ts   opt-in starter content and clearly-flagged demo data
    ics.ts gcal.ts         calendar import/export and Google Calendar connector
supabase/migrations/       schema, RLS, storage bucket, seed library
```

### Database

Tables (all user-owned rows carry `user_id` and are protected by RLS policies `auth.uid() = user_id` for select/insert/update/delete):

`profiles` (all targets & settings), `goals`, `exercises`*, `workout_plans`, `plan_exercises`, `workouts`, `workout_sets`, `exercise_history` (security-invoker view), `foods`*, `food_favorites`, `recipes`, `recipe_ingredients`, `meals`, `nutrition_logs`, `meal_plan_entries`, `hydration_logs`, `activity_logs`, `sleep_logs`, `recovery_logs`, `habits`, `habit_logs`, `calendar_events`, `body_measurements`, `progress_photos`, `reminders` (notifications), `transformation_programs`, `ai_messages`.

\* `exercises` and `foods` contain a shared, read-only starter library (`user_id is null`: 60 exercises, 71 foods) plus each user's private custom entries.

- `anon` has no table access; only signed-in users can query, and only their own rows.
- Progress photos live in the private `progress-photos` bucket under `<user_id>/…`, readable only by the owner through expiring signed URLs.
- `delete_my_account()` deletes the caller's auth user; every table cascades.
- Rows created by demo mode carry `is_demo = true`. They're labelled in the UI and removed in one click.

## Setup

1. **Supabase**: the schema is already applied to the project configured in `.env.example`. For a different project, run the files in `supabase/migrations/` in order (SQL editor or `supabase db push`).
2. **Auth URLs**: in Supabase → Authentication → URL Configuration, set the Site URL to your deployed origin and add it to the redirect URLs (needed for confirmation emails and magic links).
3. **Environment**:
   ```bash
   cp .env.example .env.local
   ```
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: public values. RLS protects the data.
   - `ANTHROPIC_API_KEY`: server-only; enables the AI assistant. Without it, the assistant page still shows locally computed insights.
   - `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (optional): OAuth web client with the Calendar API enabled; enables Google import/push.
4. **Run**:
   ```bash
   npm install
   ```
   ```bash
   npm run dev
   ```
5. **Checks**:
   ```bash
   npm test
   ```
   ```bash
   npm run typecheck
   ```
   ```bash
   npm run build
   ```
6. **Deploy**: any Node host that runs Next.js (e.g. Vercel). Set the same env vars there. Serve over HTTPS so the PWA installs and notifications work.

## Design principles kept in the code

- **No hardcoded personal targets.** Every target comes from `profiles` and is editable in Settings.
- **Honest numbers.** Days with nothing logged count as missed. Weight is shown as a 7-day rolling average with a least-squares trend. Charts never use a dual y-axis.
- **Confirm before change.** AI proposals (calendar events, food logs, plan edits, target changes) apply only when you tap Apply.
- **Not medical advice.** Readiness and AI guidance are framed as self-assessment, with a referral to professionals for anything clinical.

## Known limitations / integration-ready pieces

- **Notifications** fire while the app or installed PWA is open (in-app engine with quiet hours and an hourly cap). Background push needs a push server; the service worker already handles `push` events.
- **Step counts** are logged manually or with the GPS walk tracker. Apple Health / Google Fit sync needs a native bridge.
- **Google Calendar** needs `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. iCal (.ics) import/export works without it.
- **Gym weights** are logged in your chosen weight unit. Body weight is stored in kg and converted for display.
