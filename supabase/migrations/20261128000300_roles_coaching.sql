-- Roles (user / coach / admin), coach → user assignments with a feedback thread, and in-app notifications.
-- Security model:
--   * Only admins can change roles (trigger + set_user_role()).
--   * Coaches/admins ("staff") can read every profile (names, targets) but NOT users' raw logs; they get
--     per-user daily summaries through coach_overview(), a SECURITY DEFINER function that checks the caller.
--   * An assignee can only change an assignment's status; content changes go back to the coach as a proposal
--     in the message thread.
--   * Notifications are only written by triggers / definer functions, never directly by clients.

create schema if not exists private;

alter table public.profiles add column if not exists role text not null default 'user' check (role in ('user', 'coach', 'admin'));

create or replace function private.my_role() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = (select auth.uid())), 'user')
$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select private.my_role() = 'admin'
$$;
create or replace function private.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select private.my_role() in ('coach', 'admin')
$$;
grant usage on schema private to authenticated;
grant execute on function private.my_role(), private.is_admin(), private.is_staff() to authenticated;

-- Nobody but an admin may change a role (also blocks users promoting themselves).
create or replace function private.guard_role_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and not private.is_admin() and (select auth.uid()) is not null then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_role on public.profiles;
create trigger t_guard_role before update on public.profiles for each row execute function private.guard_role_change();

-- Staff can read all profiles (to pick users and see their targets).
create policy "staff read profiles" on public.profiles for select to authenticated using (private.is_staff());

-- ---------------------------------------------------------------- assignments
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  type text not null default 'workout' check (type in ('workout','meal','water','walk','sleep','work','meeting','personal','recovery','study','other')),
  details text,
  date date not null,
  start_time time,
  duration_min int check (duration_min between 1 and 1440),
  status text not null default 'assigned' check (status in ('assigned','accepted','done','change_requested','declined','cancelled')),
  calendar_event_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists assignments_user_idx on public.assignments (user_id, date);
create index if not exists assignments_coach_idx on public.assignments (coach_id, date);

alter table public.assignments enable row level security;
create policy "assignment read" on public.assignments for select to authenticated
  using ((select auth.uid()) in (coach_id, user_id) or private.is_admin());
create policy "assignment create" on public.assignments for insert to authenticated
  with check (private.is_staff() and coach_id = (select auth.uid()));
create policy "assignment update" on public.assignments for update to authenticated
  using ((select auth.uid()) in (coach_id, user_id) or private.is_admin())
  with check ((select auth.uid()) in (coach_id, user_id) or private.is_admin());
create policy "assignment delete" on public.assignments for delete to authenticated
  using (coach_id = (select auth.uid()) or private.is_admin());
grant select, insert, update, delete on public.assignments to authenticated;

-- The assignee may only change status (and link the calendar event they created); everything else is the coach's.
create or replace function private.guard_assignment_update() returns trigger language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  new.updated_at := now();
  if uid = old.user_id and uid <> old.coach_id and not private.is_admin() then
    if new.coach_id <> old.coach_id or new.user_id <> old.user_id or new.title <> old.title or new.type <> old.type
       or new.details is distinct from old.details or new.date <> old.date or new.start_time is distinct from old.start_time
       or new.duration_min is distinct from old.duration_min then
      raise exception 'Only the coach can edit an assignment — send a change request instead';
    end if;
    if new.status not in ('accepted','done','change_requested','declined') then
      raise exception 'Invalid status for the assignee';
    end if;
  elsif new.user_id <> old.user_id or new.coach_id <> old.coach_id then
    raise exception 'Assignee and coach cannot be changed';
  end if;
  return new;
end $$;
drop trigger if exists t_guard_assignment on public.assignments;
create trigger t_guard_assignment before update on public.assignments for each row execute function private.guard_assignment_update();

-- ---------------------------------------------------------------- thread (feedback + change proposals)
create table if not exists public.assignment_messages (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text check (length(body) <= 2000),
  proposal jsonb,            -- {date, start_time, duration_min, title?, details?} proposed by the user
  rating int check (rating between 1 and 5),
  created_at timestamptz default now()
);
create index if not exists assignment_messages_a_idx on public.assignment_messages (assignment_id, created_at);
create index if not exists assignment_messages_author_idx on public.assignment_messages (author_id);
alter table public.assignment_messages enable row level security;
create policy "thread read" on public.assignment_messages for select to authenticated using (
  exists (select 1 from public.assignments a where a.id = assignment_id and ((select auth.uid()) in (a.coach_id, a.user_id) or private.is_admin())));
create policy "thread write" on public.assignment_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (select 1 from public.assignments a where a.id = assignment_id and ((select auth.uid()) in (a.coach_id, a.user_id) or private.is_admin())));
grant select, insert on public.assignment_messages to authenticated;

-- ---------------------------------------------------------------- notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,     -- recipient
  sender_id uuid references auth.users(id) on delete set null,
  kind text not null default 'info',     -- assignment | update | feedback | change_request | reminder | info
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_sender_idx on public.notifications (sender_id);
alter table public.notifications enable row level security;
create policy "own notifications read" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "own notifications mark read" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own notifications delete" on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
grant select, update, delete on public.notifications to authenticated;

create or replace function private.name_of(p uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(name, ''), 'Someone') from public.profiles where id = p
$$;

create or replace function private.notify_assignment() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, sender_id, kind, title, body, link)
    values (new.user_id, new.coach_id, 'assignment', 'New from ' || private.name_of(new.coach_id) || ': ' || new.title,
            to_char(new.date, 'Dy DD Mon') || coalesce(' at ' || to_char(new.start_time, 'HH24:MI'), ''), '/inbox?a=' || new.id);
  elsif new.status is distinct from old.status and auth.uid() = new.user_id then
    insert into public.notifications (user_id, sender_id, kind, title, body, link)
    values (new.coach_id, new.user_id, case when new.status = 'change_requested' then 'change_request' else 'update' end,
            private.name_of(new.user_id) || ' ' || case new.status when 'accepted' then 'accepted' when 'done' then 'completed' when 'declined' then 'declined' when 'change_requested' then 'requested a change to' else 'updated' end || ': ' || new.title,
            null, '/coach?a=' || new.id);
  elsif auth.uid() = new.coach_id and (new.date, new.start_time, new.title, new.details, new.duration_min) is distinct from (old.date, old.start_time, old.title, old.details, old.duration_min) then
    insert into public.notifications (user_id, sender_id, kind, title, body, link)
    values (new.user_id, new.coach_id, 'update', private.name_of(new.coach_id) || ' updated: ' || new.title,
            to_char(new.date, 'Dy DD Mon') || coalesce(' at ' || to_char(new.start_time, 'HH24:MI'), ''), '/inbox?a=' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists t_notify_assignment on public.assignments;
create trigger t_notify_assignment after insert or update on public.assignments for each row execute function private.notify_assignment();

create or replace function private.notify_message() returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.assignments;
begin
  select * into a from public.assignments where id = new.assignment_id;
  insert into public.notifications (user_id, sender_id, kind, title, body, link)
  values (case when new.author_id = a.coach_id then a.user_id else a.coach_id end, new.author_id,
          case when new.proposal is not null then 'change_request' else 'feedback' end,
          private.name_of(new.author_id) || case when new.proposal is not null then ' proposed a change: ' else ' replied: ' end || a.title,
          left(new.body, 200),
          case when new.author_id = a.coach_id then '/inbox?a=' else '/coach?a=' end || a.id);
  return new;
end $$;
drop trigger if exists t_notify_message on public.assignment_messages;
create trigger t_notify_message after insert on public.assignment_messages for each row execute function private.notify_message();

-- ---------------------------------------------------------------- staff functions
create or replace function public.send_reminder(p_user uuid, p_title text, p_body text default null, p_link text default '/')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'Only coaches can send reminders'; end if;
  insert into public.notifications (user_id, sender_id, kind, title, body, link)
  values (p_user, auth.uid(), 'reminder', left(p_title, 200), left(p_body, 1000), coalesce(p_link, '/'));
end $$;

create or replace function public.set_user_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Only an admin can change roles'; end if;
  if p_role not in ('user', 'coach', 'admin') then raise exception 'Unknown role'; end if;
  if p_user = auth.uid() and p_role <> 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'You are the last admin — make someone else admin first';
  end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create or replace function public.admin_list_users()
returns table (id uuid, email text, name text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only'; end if;
  return query select u.id, u.email::text, p.name, p.role, u.created_at, u.last_sign_in_at
    from auth.users u join public.profiles p on p.id = u.id order by p.name nulls last, u.email;
end $$;

-- Per-user summary of one day for the coach board. Totals only — never raw entries.
create or replace function public.coach_overview(p_date date)
returns table (
  user_id uuid, name text, role text, steps int, walk_km numeric, water_ml int, water_target int, sleep_min int, sleep_target numeric,
  calories int, calorie_target int, protein numeric, protein_target int, walk_target numeric, steps_target int,
  workout_done boolean, resting_hr int, stress_avg int, open_assignments int, last_log date
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'Coaches only'; end if;
  return query
  select p.id, p.name, p.role,
    coalesce((select case when bool_or(a.source = 'samsung') then max(a.steps) filter (where a.source = 'samsung') else sum(a.steps) end
              from public.activity_logs a where a.user_id = p.id and a.date = p_date), 0)::int,
    coalesce((select case when bool_or(a.source = 'samsung') then max(a.distance_km) filter (where a.source = 'samsung')
                     else sum(a.distance_km) filter (where a.type in ('walk','run','hike')) end
              from public.activity_logs a where a.user_id = p.id and a.date = p_date), 0)::numeric,
    coalesce((select sum(h.amount_ml) from public.hydration_logs h where h.user_id = p.id and h.date = p_date), 0)::int, p.water_target_ml,
    (select s.duration_min from public.sleep_logs s where s.user_id = p.id and s.date = p_date), p.sleep_target_hours,
    coalesce((select sum(n.calories) from public.nutrition_logs n where n.user_id = p.id and n.date = p_date), 0)::int, p.calorie_target,
    coalesce((select sum(n.protein) from public.nutrition_logs n where n.user_id = p.id and n.date = p_date), 0)::numeric, p.protein_target,
    p.walk_target_km, p.steps_target,
    exists (select 1 from public.workouts w where w.user_id = p.id and w.date = p_date and w.status = 'completed'),
    (select v.resting_hr from public.health_daily v where v.user_id = p.id and v.date = p_date),
    (select v.stress_avg from public.health_daily v where v.user_id = p.id and v.date = p_date),
    (select count(*) from public.assignments x where x.user_id = p.id and x.status in ('assigned','accepted','change_requested'))::int,
    greatest((select max(a2.date) from public.activity_logs a2 where a2.user_id = p.id), (select max(h2.date) from public.hydration_logs h2 where h2.user_id = p.id),
             (select max(n2.date) from public.nutrition_logs n2 where n2.user_id = p.id), (select max(s2.date) from public.sleep_logs s2 where s2.user_id = p.id))
  from public.profiles p
  where p.id <> auth.uid() and p.onboarded
  order by p.name nulls last;
end $$;

revoke execute on function public.send_reminder(uuid, text, text, text), public.set_user_role(uuid, text), public.admin_list_users(), public.coach_overview(date) from public, anon;
grant execute on function public.send_reminder(uuid, text, text, text), public.set_user_role(uuid, text), public.admin_list_users(), public.coach_overview(date) to authenticated;
revoke execute on function private.guard_role_change(), private.guard_assignment_update(), private.notify_assignment(), private.notify_message(), private.name_of(uuid) from public, anon, authenticated;

-- Bootstrap: first admin chosen by the project owner.
update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'mclteamiim@gmail.com');

-- Users can't read their coach's profile, so the coach's display name is stored on the assignment.
alter table public.assignments add column if not exists coach_name text;
create or replace function private.set_coach_name() returns trigger language plpgsql security definer set search_path = '' as $$
begin new.coach_name := private.name_of(new.coach_id); return new; end $$;
revoke execute on function private.set_coach_name() from public, anon, authenticated;
drop trigger if exists t_set_coach_name on public.assignments;
create trigger t_set_coach_name before insert on public.assignments for each row execute function private.set_coach_name();
