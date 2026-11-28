-- Resting (BMR) calories per day, imported from Samsung Health calories_burned.details.
alter table public.activity_logs add column if not exists resting_calories int not null default 0;
comment on column public.activity_logs.resting_calories is 'Resting/BMR calories for the day (Samsung Health calories_burned.rest_calorie); 0 when unknown';
