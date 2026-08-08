-- The Dye Ledger v30.3.93: production security activation.
-- Additive/idempotent. Apply only through the reviewed production runbook.
begin;

create temporary table v30_3_93_baseline on commit drop as
select (select count(*) from public.courses) courses,
       (select count(*) from public.course_tees) tees,
       (select count(*) from public.course_holes) holes,
       (select count(*) from public.matches) matches,
       (select count(*) from public.score_entries) scores;
do $$ begin
  if exists (select 1 from public.course_tees t left join public.courses c on c.id=t.course_id where c.id is null)
    or exists (select 1 from public.course_holes h left join public.courses c on c.id=h.course_id
      left join public.course_tees t on t.id=h.tee_id
      where c.id is null or t.id is null or t.course_id<>h.course_id)
    or exists (select 1 from public.course_tees t left join public.course_holes h on h.tee_id=t.id
      group by t.id having count(h.id)<>18)
  then raise exception 'v30.3.93 preflight failed: Course Catalog integrity'; end if;
end $$;

-- Course Catalog: retain public reads, require a durable allowlisted Account for writes.
alter table public.courses
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists publication_status text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

update public.courses set publication_status = 'approved',
  approved_at = coalesce(approved_at, created_at, now())
where publication_status is null;
alter table public.courses alter column publication_status set default 'draft';
alter table public.courses alter column publication_status set not null;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.courses'::regclass
      and conname = 'courses_publication_status_check'
  ) then
    alter table public.courses
      add constraint courses_publication_status_check
      check (publication_status in ('draft', 'approved', 'rejected', 'archived'));
  end if;
end $$;
alter table public.courses alter column owner_user_id set default auth.uid();
alter table public.course_holes alter column tee_id set not null;

create table if not exists public.course_library_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_create_drafts boolean not null default true,
  is_maintainer boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.course_library_roles enable row level security;
revoke all on public.course_library_roles from public, anon, authenticated;

create or replace function public.course_library_can_write()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.course_library_roles r
      where r.user_id = auth.uid() and (r.can_create_drafts or r.is_maintainer));
$$;
create or replace function public.course_library_is_maintainer()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.course_library_roles r
      where r.user_id = auth.uid() and r.is_maintainer);
$$;
revoke all on function public.course_library_can_write() from public, anon;
revoke all on function public.course_library_is_maintainer() from public, anon;
grant execute on function public.course_library_can_write() to authenticated;
grant execute on function public.course_library_is_maintainer() to authenticated;

alter table public.courses enable row level security;
alter table public.course_tees enable row level security;
alter table public.course_holes enable row level security;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('courses','course_tees','course_holes')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

create policy courses_public_read on public.courses for select to anon, authenticated
  using (publication_status = 'approved' or owner_user_id = auth.uid());
create policy courses_authorized_insert on public.courses for insert to authenticated
  with check (public.course_library_can_write() and owner_user_id = auth.uid() and publication_status = 'draft');
create policy courses_authorized_update on public.courses for update to authenticated
  using (public.course_library_is_maintainer() or
    (public.course_library_can_write() and owner_user_id=auth.uid() and publication_status='draft'))
  with check (public.course_library_is_maintainer() or
    (public.course_library_can_write() and owner_user_id=auth.uid() and publication_status='draft'));
create policy courses_authorized_delete on public.courses for delete to authenticated
  using (public.course_library_is_maintainer() or
    (public.course_library_can_write() and owner_user_id=auth.uid() and publication_status='draft'));
create policy course_tees_public_read on public.course_tees for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_tees.course_id));
create policy course_tees_authorized_write on public.course_tees for all to authenticated
  using (exists (select 1 from public.courses c where c.id=course_tees.course_id and
    (public.course_library_is_maintainer() or (public.course_library_can_write() and c.owner_user_id=auth.uid() and c.publication_status='draft'))))
  with check (exists (select 1 from public.courses c where c.id=course_tees.course_id and
    (public.course_library_is_maintainer() or (public.course_library_can_write() and c.owner_user_id=auth.uid() and c.publication_status='draft'))));
create policy course_holes_public_read on public.course_holes for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_holes.course_id)
    and exists (select 1 from public.course_tees t where t.id = course_holes.tee_id and t.course_id = course_holes.course_id));
create policy course_holes_authorized_write on public.course_holes for all to authenticated
  using (exists (select 1 from public.courses c where c.id=course_holes.course_id and
    (public.course_library_is_maintainer() or (public.course_library_can_write() and c.owner_user_id=auth.uid() and c.publication_status='draft'))))
  with check (exists (select 1 from public.courses c where c.id=course_holes.course_id and
      (public.course_library_is_maintainer() or (public.course_library_can_write() and c.owner_user_id=auth.uid() and c.publication_status='draft')))
    and exists (select 1 from public.course_tees t where t.id=course_holes.tee_id and t.course_id=course_holes.course_id));

revoke all on public.courses, public.course_tees, public.course_holes from public, anon, authenticated;
grant select on public.courses, public.course_tees, public.course_holes to anon, authenticated;
grant insert, update, delete on public.courses, public.course_tees, public.course_holes to authenticated;

-- Shared Match membership boundary. SECURITY DEFINER avoids recursive RLS checks.
create or replace function public.shared_match_is_member(p_match_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.matches m where m.id = p_match_id and m.created_by = auth.uid())
    or exists (select 1 from public.match_memberships mm
      where mm.match_id = p_match_id and mm.user_id = auth.uid() and mm.status = 'active')
  );
$$;
create or replace function public.shared_match_is_organizer(p_match_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.matches m where m.id = p_match_id and m.created_by = auth.uid())
    or exists (select 1 from public.match_memberships mm
      where mm.match_id = p_match_id and mm.user_id = auth.uid()
        and mm.status = 'active' and mm.role = 'organizer')
  );
$$;
revoke all on function public.shared_match_is_member(text), public.shared_match_is_organizer(text) from public, anon;
grant execute on function public.shared_match_is_member(text), public.shared_match_is_organizer(text) to authenticated;

create or replace function public.join_shared_match(p_match_code text, p_device_id text, p_device_label text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(trim(coalesce(p_match_code,''))); v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication session required' using errcode='42501'; end if;
  if v_code !~ '^DYE-[1-9][0-9]{5}$' and v_code !~ '^[A-Z0-9]{12}$' then
    raise exception 'Invalid Shared Match code' using errcode='22023';
  end if;
  if not exists (select 1 from public.matches where id=v_code and status='active') then
    raise exception 'Shared Match not found' using errcode='P0002';
  end if;
  if nullif(trim(coalesce(p_device_id,'')),'') is null then
    raise exception 'Device attribution required' using errcode='22023';
  end if;
  insert into public.match_memberships(id,match_id,user_id,role,status,joined_at,last_seen_at,device_label)
  values (v_code||':member:'||v_user::text||':'||left(trim(p_device_id),100), v_code, v_user, 'team_scorer', 'active', now(), now(), left(p_device_label,500))
  on conflict (id) do update set status='active', last_seen_at=now(), device_label=excluded.device_label;
  return v_code;
end $$;
revoke all on function public.join_shared_match(text,text,text) from public, anon;
grant execute on function public.join_shared_match(text,text,text) to authenticated;

alter table public.matches enable row level security;
alter table public.match_memberships enable row level security;
alter table public.match_teams enable row level security;
alter table public.match_players enable row level security;
alter table public.score_entries enable row level security;
alter table public.match_notes enable row level security;
alter table public.audit_log enable row level security;
alter table public.team_access_codes enable row level security;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname='public'
    and tablename in ('matches','match_memberships','match_teams','match_players','score_entries','match_notes','audit_log','team_access_codes')
  loop execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
end $$;

create policy matches_member_select on public.matches for select to authenticated using (public.shared_match_is_member(id));
create policy matches_owner_insert on public.matches for insert to authenticated with check (created_by = auth.uid());
-- Transitional compatibility: active members may merge device/memory metadata; host authority remains application-enforced.
create policy matches_member_update on public.matches for update to authenticated
  using (public.shared_match_is_member(id)) with check (public.shared_match_is_member(id));
create policy memberships_member_select on public.match_memberships for select to authenticated using (public.shared_match_is_member(match_id));
create policy memberships_owner_insert on public.match_memberships for insert to authenticated
  with check (user_id=auth.uid() and public.shared_match_is_organizer(match_id));
create policy memberships_self_update on public.match_memberships for update to authenticated
  using (user_id=auth.uid() or public.shared_match_is_organizer(match_id))
  with check (user_id=auth.uid() or public.shared_match_is_organizer(match_id));

create policy teams_member_all on public.match_teams for all to authenticated
  using (public.shared_match_is_member(match_id)) with check (public.shared_match_is_member(match_id));
create policy players_member_all on public.match_players for all to authenticated
  using (public.shared_match_is_member(match_id)) with check (public.shared_match_is_member(match_id));
create policy scores_member_all on public.score_entries for all to authenticated
  using (public.shared_match_is_member(match_id))
  with check (public.shared_match_is_member(match_id) and coalesce(updated_by,auth.uid())=auth.uid());
create policy notes_member_all on public.match_notes for all to authenticated
  using (public.shared_match_is_member(match_id))
  with check (public.shared_match_is_member(match_id) and coalesce(updated_by,auth.uid())=auth.uid());
create policy audit_member_select on public.audit_log for select to authenticated using (public.shared_match_is_member(match_id));
create policy audit_member_insert on public.audit_log for insert to authenticated
  with check (public.shared_match_is_member(match_id) and actor_user_id=auth.uid());

revoke all on public.matches, public.match_memberships, public.match_teams, public.match_players,
  public.score_entries, public.match_notes, public.audit_log, public.team_access_codes from public, anon, authenticated;
grant select,insert,update on public.matches, public.match_memberships, public.match_teams, public.match_players,
  public.score_entries, public.match_notes to authenticated;
grant delete on public.match_teams, public.match_players, public.score_entries, public.match_notes to authenticated;
grant select,insert on public.audit_log to authenticated;
-- team_access_codes intentionally has no browser grants; join_shared_match is the only join surface.

do $$ declare b record; begin
  select * into b from v30_3_93_baseline;
  if b.courses<>(select count(*) from public.courses)
    or b.tees<>(select count(*) from public.course_tees)
    or b.holes<>(select count(*) from public.course_holes)
    or b.matches<>(select count(*) from public.matches)
    or b.scores<>(select count(*) from public.score_entries)
  then raise exception 'v30.3.93 postflight failed: row counts changed'; end if;
end $$;

commit;
