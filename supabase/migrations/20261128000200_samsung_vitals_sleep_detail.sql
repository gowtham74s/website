-- Rich Samsung Health data: sleep detail, workout heart rate, and a daily vitals table.

alter table public.sleep_logs
  add column if not exists source text not null default 'manual',
  add column if not exists score int,
  add column if not exists efficiency numeric(5,1),
  add column if not exists deep_min int,
  add column if not exists light_min int,
  add column if not exists rem_min int,
  add column if not exists awake_min int,
  add column if not exists snoring_min int,
  add column if not exists spo2_avg numeric(4,1),
  add column if not exists spo2_min numeric(4,1),
  add column if not exists sessions int not null default 1,
  add column if not exists physical_recovery numeric(5,1),
  add column if not exists mental_recovery numeric(5,1);

alter table public.activity_logs
  add column if not exists avg_hr int,
  add column if not exists max_hr int;

create table if not exists public.health_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  resting_hr int,          -- estimate: mean of the lowest 10% of the day's readings
  avg_hr int,
  min_hr int,
  max_hr int,
  hr_samples int,
  stress_avg int,
  stress_min int,
  stress_max int,
  stress_samples int,
  spo2_avg numeric(4,1),
  spo2_min numeric(4,1),
  floors int,
  source text not null default 'samsung',
  is_demo boolean default false,
  created_at timestamptz default now(),
  unique (user_id, date)
);

alter table public.health_daily enable row level security;
create policy "own rows select" on public.health_daily for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on public.health_daily for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows update" on public.health_daily for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows delete" on public.health_daily for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.health_daily to authenticated;
