-- =====================================================================
-- Forge — Personal Fitness & Lifestyle Command Center
-- Initial schema. Every user-owned table carries user_id and is protected
-- by row-level security so a user can only ever touch their own rows.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helpers --------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- profiles (settings + all personal targets) ----------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  age int check (age between 10 and 120),
  sex text,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  goal_weight_kg numeric(5,1),
  fitness_goal text default 'recomposition',
  experience text default 'intermediate',
  workout_days int[] default '{1,2,3,4,5}',          -- 0=Sun..6=Sat
  preferred_workout_time time default '18:00',
  dietary_prefs text[] default '{}',
  calorie_target int default 2200,
  protein_target int default 150,
  carbs_target int default 220,
  fat_target int default 70,
  fiber_target int default 30,
  rest_day_calorie_delta int default -200,
  fasting_enabled boolean default false,
  eating_window_start time default '12:00',
  eating_window_end time default '20:00',
  water_target_ml int default 3000,
  walk_target_km numeric(4,1) default 4,
  steps_target int default 8000,
  sleep_target_hours numeric(3,1) default 8,
  bedtime_target time default '23:00',
  unit_weight text default 'kg' check (unit_weight in ('kg','lbs')),
  unit_length text default 'cm' check (unit_length in ('cm','in')),
  unit_volume text default 'ml' check (unit_volume in ('ml','l','oz')),
  timezone text default 'UTC',
  theme text default 'dark' check (theme in ('dark','light','system')),
  score_weights jsonb default '{"workout":20,"nutrition":15,"protein":15,"water":15,"walk":10,"sleep":15,"habits":10}',
  notification_settings jsonb default '{"enabled":false,"quiet_start":"22:30","quiet_end":"07:00","max_per_hour":3}',
  google_calendar jsonb default '{}',
  onboarded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- goals ----------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  metric text,                      -- weight | waist | bench | custom
  start_value numeric,
  target_value numeric,
  target_date date,
  status text default 'active' check (status in ('active','achieved','abandoned')),
  is_demo boolean default false,
  created_at timestamptz default now()
);

-- ---------- exercises (global library user_id null + user custom) ----
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle_group text not null,
  secondary_muscles text[] default '{}',
  equipment text,
  category text default 'strength',   -- strength | cardio | mobility | bodyweight
  instructions text,
  default_sets int default 3,
  default_reps int default 10,
  default_weight numeric default 0,
  default_rest_seconds int default 90,
  tempo text,
  notes text,
  alternatives text[] default '{}',
  media_url text,
  created_at timestamptz default now()
);

-- ---------- workout plans / splits ----------------------------------
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  split_type text default 'custom',
  color text default '#f59e0b',
  scheduled_days int[] default '{}',
  estimated_minutes int default 60,
  position int default 0,
  notes text,
  archived boolean default false,
  is_demo boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  position int default 0,
  sets int default 3,
  reps int default 10,
  weight numeric default 0,
  rest_seconds int default 90,
  tempo text,
  notes text,
  is_demo boolean default false
);

-- ---------- workouts (sessions) + sets ------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  name text not null,
  date date not null default current_date,
  status text default 'in_progress' check (status in ('in_progress','paused','completed','skipped')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  paused_seconds int default 0,
  paused_at timestamptz,
  duration_seconds int,
  total_volume numeric default 0,
  notes text,
  is_demo boolean default false,
  created_at timestamptz default now()
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  muscle_group text,
  exercise_order int default 0,
  set_number int default 1,
  target_reps int,
  reps int,
  weight numeric default 0,
  rest_seconds int default 90,
  completed boolean default false,
  completed_at timestamptz,
  skipped boolean default false,
  is_pr boolean default false,
  notes text,
  is_demo boolean default false
);

-- exercise history: derived from completed sets (respects caller RLS)
create view public.exercise_history with (security_invoker = true) as
  select s.user_id, s.exercise_id, s.exercise_name, s.muscle_group, w.date, w.id as workout_id,
         count(*) filter (where s.completed) as sets,
         max(s.weight) filter (where s.completed) as top_weight,
         max(s.reps) filter (where s.completed) as top_reps,
         sum(s.weight * s.reps) filter (where s.completed) as volume,
         max(s.weight * (1 + s.reps / 30.0)) filter (where s.completed) as est_1rm
  from public.workout_sets s join public.workouts w on w.id = s.workout_id
  where w.status = 'completed'
  group by s.user_id, s.exercise_id, s.exercise_name, s.muscle_group, w.date, w.id;

-- ---------- foods / recipes / meals --------------------------------
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,   -- null = shared starter database
  name text not null,
  brand text,
  serving_size numeric not null default 100,
  serving_unit text not null default 'g',
  calories numeric not null default 0,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  fiber numeric not null default 0,
  created_at timestamptz default now()
);

create table public.food_favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, food_id)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  servings numeric not null default 1,
  prep_notes text,
  is_favorite boolean default false,
  is_demo boolean default false,
  created_at timestamptz default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  quantity numeric not null default 100,   -- in the food's serving_unit
  is_demo boolean default false
);

-- saved meals (meal library / one-tap meals)
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text default 'lunch',
  items jsonb not null default '[]',   -- [{name, quantity, unit, calories, protein, carbs, fat, fiber, food_id?}]
  notes text,
  is_favorite boolean default true,
  use_count int default 0,
  is_demo boolean default false,
  created_at timestamptz default now()
);

create table public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  meal_category text not null default 'lunch',
  food_id uuid references public.foods(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  meal_id uuid references public.meals(id) on delete set null,
  name text not null,
  quantity numeric default 1,
  unit text default 'serving',
  calories numeric default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fat numeric default 0,
  fiber numeric default 0,
  logged_at timestamptz default now(),
  is_demo boolean default false
);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  day_type text default 'any' check (day_type in ('any','training','rest')),
  meal_category text not null default 'lunch',
  time time default '13:00',
  name text not null,
  items jsonb not null default '[]',
  notes text,
  position int default 0,
  is_demo boolean default false
);

-- ---------- hydration / activity / sleep / recovery ----------------
create table public.hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  amount_ml int not null check (amount_ml > 0 and amount_ml <= 5000),
  logged_at timestamptz default now(),
  is_demo boolean default false
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  type text default 'walk' check (type in ('walk','run','cycle','cardio','swim','hike','other')),
  steps int default 0,
  distance_km numeric(6,2) default 0,
  duration_min int default 0,
  active_calories int default 0,
  source text default 'manual',
  notes text,
  logged_at timestamptz default now(),
  is_demo boolean default false
);

create table public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,   -- the morning you woke up
  bedtime timestamptz not null,
  wake_time timestamptz not null,
  duration_min int not null,
  quality int check (quality between 1 and 5),
  refreshed int check (refreshed between 1 and 5),
  notes text,
  is_demo boolean default false,
  unique (user_id, date)
);

create table public.recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  energy int check (energy between 1 and 10),
  soreness int check (soreness between 1 and 10),
  stress int check (stress between 1 and 10),
  motivation int check (motivation between 1 and 10),
  fatigue int check (fatigue between 1 and 10),
  notes text,
  is_demo boolean default false,
  unique (user_id, date)
);

-- ---------- habits --------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  icon text default 'check',
  color text default '#10b981',
  frequency text default 'daily' check (frequency in ('daily','weekly')),
  target_per_week int default 7 check (target_per_week between 1 and 7),
  days int[] default '{0,1,2,3,4,5,6}',
  reminder_time time,
  auto_metric text,   -- workout | protein | calories | water | walk | sleep (auto-complete from logs)
  position int default 0,
  archived boolean default false,
  is_demo boolean default false,
  created_at timestamptz default now()
);

create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  date date not null default current_date,
  completed boolean default true,
  is_demo boolean default false,
  unique (habit_id, date)
);

-- ---------- calendar ------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  type text default 'personal' check (type in ('workout','meal','water','walk','sleep','work','meeting','personal','recovery','study','other')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean default false,
  notes text,
  location text,
  recurrence text default 'none' check (recurrence in ('none','daily','weekdays','weekly','monthly')),
  recurrence_until date,
  recurrence_exceptions date[] default '{}',
  completed_dates date[] default '{}',
  reminder_minutes int,
  source text default 'manual',          -- manual | workout_plan | meal_plan | google | ai
  source_ref uuid,
  external_id text,
  is_demo boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (end_at >= start_at)
);

-- ---------- body / progress ----------------------------------------
create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  weight_kg numeric(5,2),
  waist_cm numeric(5,1),
  chest_cm numeric(5,1),
  arms_cm numeric(5,1),
  thighs_cm numeric(5,1),
  body_fat_pct numeric(4,1),
  notes text,
  is_demo boolean default false,
  created_at timestamptz default now()
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default current_date,
  storage_path text not null,
  pose text default 'front',
  notes text,
  created_at timestamptz default now()
);

-- ---------- reminders / notifications ------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null,   -- wake | water | meal | preworkout | workout | walk | protein | sleep | checkin | custom
  label text not null,
  time time,
  interval_minutes int,          -- for repeating reminders (e.g. water every 90 min)
  window_start time,
  window_end time,
  days int[] default '{0,1,2,3,4,5,6}',
  enabled boolean default true,
  snoozed_until timestamptz,
  last_fired_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- transformation programs --------------------------------
create table public.transformation_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null default current_date,
  duration_days int not null default 75 check (duration_days between 1 and 730),
  primary_goals text[] default '{}',
  secondary_goals text[] default '{}',
  daily_objectives text[] default '{workout,protein,calories,water,walk,sleep,habits}',
  milestones jsonb default '[]',   -- [{day, title}]
  status text default 'active' check (status in ('active','paused','completed','abandoned')),
  paused_at date,
  paused_days int default 0,
  is_demo boolean default false,
  created_at timestamptz default now()
);

-- ---------- AI assistant history -----------------------------------
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  proposals jsonb,
  created_at timestamptz default now()
);

-- =====================================================================
-- Indexes
-- =====================================================================
create index on public.goals (user_id);
create index on public.exercises (user_id);
create index on public.workout_plans (user_id);
create index on public.plan_exercises (plan_id);
create index on public.plan_exercises (exercise_id);
create index on public.plan_exercises (user_id);
create index on public.workouts (user_id, date desc);
create index on public.workouts (plan_id);
create index on public.workout_sets (workout_id);
create index on public.workout_sets (user_id, exercise_id);
create index on public.foods (user_id);
create index on public.foods using gin (to_tsvector('simple', name));
create index on public.food_favorites (food_id);
create index on public.recipes (user_id);
create index on public.recipe_ingredients (recipe_id);
create index on public.recipe_ingredients (food_id);
create index on public.recipe_ingredients (user_id);
create index on public.meals (user_id);
create index on public.nutrition_logs (user_id, date);
create index on public.nutrition_logs (food_id);
create index on public.nutrition_logs (recipe_id);
create index on public.nutrition_logs (meal_id);
create index on public.meal_plan_entries (user_id, weekday);
create index on public.hydration_logs (user_id, date);
create index on public.activity_logs (user_id, date);
create index on public.habits (user_id);
create index on public.habit_logs (user_id, date);
create index on public.calendar_events (user_id, start_at);
create index on public.body_measurements (user_id, date);
create index on public.progress_photos (user_id, date);
create index on public.reminders (user_id);
create index on public.transformation_programs (user_id);
create index on public.ai_messages (user_id, created_at);

-- =====================================================================
-- updated_at triggers
-- =====================================================================
create trigger t_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger t_plans_updated before update on public.workout_plans for each row execute function public.set_updated_at();
create trigger t_events_updated before update on public.calendar_events for each row execute function public.set_updated_at();

-- =====================================================================
-- Row-level security
-- =====================================================================
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own profile delete" on public.profiles for delete to authenticated using ((select auth.uid()) = id);

-- shared-library tables: anyone signed in can read the shared rows (user_id null) plus their own
do $$
declare t text;
begin
  foreach t in array array['exercises','foods'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read shared or own" on public.%I for select to authenticated using (user_id is null or (select auth.uid()) = user_id)', t);
    execute format('create policy "insert own" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "update own" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "delete own" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- private per-user tables
do $$
declare t text;
begin
  foreach t in array array['goals','workout_plans','plan_exercises','workouts','workout_sets','food_favorites',
    'recipes','recipe_ingredients','meals','nutrition_logs','meal_plan_entries','hydration_logs','activity_logs',
    'sleep_logs','recovery_logs','habits','habit_logs','calendar_events','body_measurements','progress_photos',
    'reminders','transformation_programs','ai_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows select" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows insert" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows update" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "own rows delete" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Data API grants (authenticated only; anon gets nothing)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select on public.exercise_history to authenticated;

-- =====================================================================
-- Account deletion (user deletes their own account + all data)
-- =====================================================================
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- photos are removed by the client through the Storage API before this call
  delete from auth.users where id = uid;   -- cascades to every user table
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =====================================================================
-- Private storage for progress photos: <user_id>/<file>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy "photos select own" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos update own" on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
