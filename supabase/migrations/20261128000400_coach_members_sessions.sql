-- Coach ↔ member assignment, admin account deletion, group sessions with banners, avatars.

-- ---------------------------------------------------------------- profile additions
alter table public.profiles
  add column if not exists coach_id uuid references auth.users(id) on delete set null,
  add column if not exists avatar_emoji text,
  add column if not exists avatar_color text;
create index if not exists profiles_coach_idx on public.profiles (coach_id);

-- coach_id may only change through assign_coach() (or by an admin).
create or replace function private.guard_coach_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.coach_id is distinct from old.coach_id and (select auth.uid()) is not null
     and not private.is_admin() and coalesce(current_setting('app.assigning_coach', true), '') <> 'on' then
    raise exception 'Coach assignments are changed by admins or coaches from the Coach page';
  end if;
  return new;
end $$;
revoke execute on function private.guard_coach_change() from public, anon, authenticated;
drop trigger if exists t_guard_coach on public.profiles;
create trigger t_guard_coach before update on public.profiles for each row execute function private.guard_coach_change();

-- Rules: admin → any member to any coach (or none).
--        coach → may claim a FREE member for themselves, hand over THEIR OWN member to another coach, or release them.
--        coach may never take a member who belongs to another coach.
create or replace function public.assign_coach(p_member uuid, p_coach uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cur uuid; target_role text;
begin
  if not private.is_staff() then raise exception 'Only coaches and admins can assign members'; end if;
  select coach_id into cur from public.profiles where id = p_member;
  if not found then raise exception 'Member not found'; end if;
  if p_coach is not null then
    select role into target_role from public.profiles where id = p_coach;
    if target_role not in ('coach', 'admin') then raise exception 'That person is not a coach'; end if;
    if p_coach = p_member then raise exception 'A member cannot coach themselves'; end if;
  end if;
  if not private.is_admin() then
    if cur is null and p_coach is distinct from me then raise exception 'You can only claim free members for yourself'; end if;
    if cur is not null and cur <> me then raise exception 'This member belongs to another coach'; end if;
  end if;
  perform set_config('app.assigning_coach', 'on', true);
  update public.profiles set coach_id = p_coach where id = p_member;
  perform set_config('app.assigning_coach', '', true);
  if p_coach is not null and p_coach is distinct from cur then
    insert into public.notifications (user_id, sender_id, kind, title, body, link)
    values (p_member, me, 'info', 'Your coach is now ' || private.name_of(p_coach), 'Say hi in your inbox when they send your first session.', '/inbox');
    if p_coach <> me then
      insert into public.notifications (user_id, sender_id, kind, title, body, link)
      values (p_coach, me, 'info', 'New member: ' || private.name_of(p_member), 'Assigned to you by ' || private.name_of(me), '/coach');
    end if;
  end if;
end $$;

-- Admin: bulk assign + spread all free members evenly across coaches.
create or replace function public.assign_coach_bulk(p_members uuid[], p_coach uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare m uuid; n int := 0;
begin
  if not private.is_admin() then raise exception 'Admins only'; end if;
  foreach m in array p_members loop perform public.assign_coach(m, p_coach); n := n + 1; end loop;
  return n;
end $$;

create or replace function public.auto_divide_members()
returns int language plpgsql security definer set search_path = '' as $$
declare coaches uuid[]; m record; i int := 0; nc int;
begin
  if not private.is_admin() then raise exception 'Admins only'; end if;
  -- coaches ordered by current load so the split ends up even
  select array_agg(c.id order by (select count(*) from public.profiles x where x.coach_id = c.id), c.name) into coaches
    from public.profiles c where c.role = 'coach';
  nc := coalesce(array_length(coaches, 1), 0);
  if nc = 0 then raise exception 'There are no coaches yet — make someone a coach first'; end if;
  for m in select id from public.profiles where role = 'user' and coach_id is null and onboarded order by created_at loop
    perform public.assign_coach(m.id, coaches[(i % nc) + 1]); i := i + 1;
  end loop;
  return i;
end $$;

-- Admin: delete any account (and everything it owns). Admins can't delete themselves here.
create or replace function public.admin_delete_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only'; end if;
  if p_user = auth.uid() then raise exception 'Use Settings → Delete account to remove your own account'; end if;
  if (select role from public.profiles where id = p_user) = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Cannot delete the last admin';
  end if;
  begin
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects where bucket_id = 'progress-photos' and (storage.foldername(name))[1] = p_user::text;
  exception when others then null; -- photos are best-effort; the account and all rows are still removed
  end;
  delete from auth.users where id = p_user;
end $$;

-- ---------------------------------------------------------------- coach scope
create or replace function private.coaches(p_member uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_admin() or exists (select 1 from public.profiles where id = p_member and coach_id = (select auth.uid()))
$$;
grant execute on function private.coaches(uuid) to authenticated;

drop policy if exists "assignment create" on public.assignments;
create policy "assignment create" on public.assignments for insert to authenticated
  with check (private.is_staff() and coach_id = (select auth.uid()) and private.coaches(user_id));

create or replace function public.send_reminder(p_user uuid, p_title text, p_body text default null, p_link text default '/')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'Only coaches can send reminders'; end if;
  if not private.coaches(p_user) then raise exception 'You can only remind your own members'; end if;
  insert into public.notifications (user_id, sender_id, kind, title, body, link)
  values (p_user, auth.uid(), 'reminder', left(p_title, 200), left(p_body, 1000), coalesce(p_link, '/'));
end $$;

drop function if exists public.coach_overview(date);
create or replace function public.coach_overview(p_date date)
returns table (
  user_id uuid, name text, role text, coach_id uuid, coach_name text, avatar_emoji text, avatar_color text,
  steps int, walk_km numeric, water_ml int, water_target int, sleep_min int, sleep_target numeric,
  calories int, calorie_target int, protein numeric, protein_target int, walk_target numeric, steps_target int,
  workout_done boolean, resting_hr int, stress_avg int, open_assignments int, last_log date
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'Coaches only'; end if;
  return query
  select p.id, p.name, p.role, p.coach_id, (select c.name from public.profiles c where c.id = p.coach_id), p.avatar_emoji, p.avatar_color,
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
  where p.id <> auth.uid() and p.onboarded and (private.is_admin() or p.coach_id = auth.uid())
  order by p.name nulls last;
end $$;

-- Directory for coaches: who is free to claim, and which coaches exist (names only).
create or replace function public.coach_directory()
returns table (id uuid, name text, role text, coach_id uuid, coach_name text, avatar_emoji text, avatar_color text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'Coaches only'; end if;
  return query select p.id, p.name, p.role, p.coach_id, (select c.name from public.profiles c where c.id = p.coach_id), p.avatar_emoji, p.avatar_color
    from public.profiles p where p.onboarded order by p.name nulls last;
end $$;

drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (id uuid, email text, name text, role text, coach_id uuid, coach_name text, avatar_emoji text, avatar_color text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admins only'; end if;
  return query select u.id, u.email::text, p.name, p.role, p.coach_id, (select c.name from public.profiles c where c.id = p.coach_id), p.avatar_emoji, p.avatar_color, u.created_at, u.last_sign_in_at
    from auth.users u join public.profiles p on p.id = u.id order by p.name nulls last, u.email;
end $$;

-- ---------------------------------------------------------------- group sessions
create table if not exists public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creator_name text,
  title text not null check (length(title) between 1 and 120),
  description text check (length(description) <= 4000),
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  banner_path text,
  audience text not null default 'everyone' check (audience in ('everyone', 'my_members')),
  capacity int check (capacity between 1 and 10000),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz default now(),
  check (ends_at > starts_at)
);
create index if not exists group_sessions_time_idx on public.group_sessions (starts_at);
create index if not exists group_sessions_creator_idx on public.group_sessions (created_by);

create or replace function private.can_see_session(s public.group_sessions) returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_staff() or s.audience = 'everyone'
      or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.coach_id = s.created_by)
$$;
grant execute on function private.can_see_session(public.group_sessions) to authenticated;

alter table public.group_sessions enable row level security;
create policy "sessions read" on public.group_sessions for select to authenticated using (private.can_see_session(group_sessions));
create policy "sessions create" on public.group_sessions for insert to authenticated with check (private.is_staff() and created_by = (select auth.uid()));
create policy "sessions edit" on public.group_sessions for update to authenticated
  using (created_by = (select auth.uid()) or private.is_admin()) with check (created_by = (select auth.uid()) or private.is_admin());
create policy "sessions delete" on public.group_sessions for delete to authenticated using (created_by = (select auth.uid()) or private.is_admin());
grant select, insert, update, delete on public.group_sessions to authenticated;

create table if not exists public.session_rsvps (
  session_id uuid not null references public.group_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_name text,
  status text not null default 'going' check (status in ('going', 'maybe', 'not_going')),
  calendar_event_id uuid,
  created_at timestamptz default now(),
  primary key (session_id, user_id)
);
create index if not exists session_rsvps_user_idx on public.session_rsvps (user_id);
alter table public.session_rsvps enable row level security;
create policy "rsvp read" on public.session_rsvps for select to authenticated using (
  exists (select 1 from public.group_sessions s where s.id = session_id and private.can_see_session(s)));
create policy "rsvp own insert" on public.session_rsvps for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.group_sessions s where s.id = session_id and private.can_see_session(s) and s.status = 'scheduled'));
create policy "rsvp own update" on public.session_rsvps for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "rsvp own delete" on public.session_rsvps for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.session_rsvps to authenticated;

create or replace function private.session_defaults() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'group_sessions' then new.creator_name := private.name_of(new.created_by);
  else new.user_name := private.name_of(new.user_id); end if;
  return new;
end $$;
revoke execute on function private.session_defaults() from public, anon, authenticated;
drop trigger if exists t_session_defaults on public.group_sessions;
create trigger t_session_defaults before insert on public.group_sessions for each row execute function private.session_defaults();
drop trigger if exists t_rsvp_defaults on public.session_rsvps;
create trigger t_rsvp_defaults before insert on public.session_rsvps for each row execute function private.session_defaults();

-- Announce new sessions (and cancellations) to the audience.
create or replace function private.notify_session() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or (new.status = 'cancelled' and old.status <> 'cancelled') then
    insert into public.notifications (user_id, sender_id, kind, title, body, link)
    select p.id, new.created_by, 'session',
      case when tg_op = 'INSERT' then '📣 ' || new.title else 'Cancelled: ' || new.title end,
      to_char(new.starts_at at time zone coalesce((select nullif(timezone, '') from public.profiles where id = new.created_by), 'UTC'), 'Dy DD Mon, HH12:MI AM') || coalesce(' · ' || new.location, ''),
      '/sessions?s=' || new.id
    from public.profiles p
    where p.id <> new.created_by and p.onboarded
      and (new.audience = 'everyone' or p.coach_id = new.created_by)
      and (tg_op = 'INSERT' or exists (select 1 from public.session_rsvps r where r.session_id = new.id and r.user_id = p.id));
  end if;
  return new;
end $$;
revoke execute on function private.notify_session() from public, anon, authenticated;
drop trigger if exists t_notify_session on public.group_sessions;
create trigger t_notify_session after insert or update on public.group_sessions for each row execute function private.notify_session();

-- Banner images: public bucket (they are announcements), only staff can upload/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-banners', 'session-banners', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "banners upload by staff" on storage.objects for insert to authenticated with check (bucket_id = 'session-banners' and private.is_staff());
create policy "banners update by staff" on storage.objects for update to authenticated using (bucket_id = 'session-banners' and private.is_staff()) with check (bucket_id = 'session-banners' and private.is_staff());
create policy "banners delete by staff" on storage.objects for delete to authenticated using (bucket_id = 'session-banners' and private.is_staff());
create policy "banners list by staff" on storage.objects for select to authenticated using (bucket_id = 'session-banners' and private.is_staff());

revoke execute on function public.assign_coach(uuid, uuid), public.assign_coach_bulk(uuid[], uuid), public.auto_divide_members(), public.admin_delete_user(uuid), public.coach_directory(), public.admin_list_users(), public.coach_overview(date), public.send_reminder(uuid, text, text, text) from public, anon;
grant execute on function public.assign_coach(uuid, uuid), public.assign_coach_bulk(uuid[], uuid), public.auto_divide_members(), public.admin_delete_user(uuid), public.coach_directory(), public.admin_list_users(), public.coach_overview(date), public.send_reminder(uuid, text, text, text) to authenticated;

-- Coaches read full profiles only for their own members (and other staff); free members come via coach_directory().
drop policy if exists "staff read profiles" on public.profiles;
create policy "staff read profiles" on public.profiles for select to authenticated using (
  private.is_admin() or (private.is_staff() and (coach_id = (select auth.uid()) or role in ('coach', 'admin'))));
