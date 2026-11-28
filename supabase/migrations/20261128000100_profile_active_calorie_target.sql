-- Daily active-calorie goal (e.g. imported from Samsung Health active_calories.goal).
alter table public.profiles add column if not exists active_calorie_target int default 500 check (active_calorie_target between 0 and 5000);
