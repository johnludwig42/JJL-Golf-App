-- The Dye Ledger v30.3.75A: Course Library security foundation.
-- REVIEWED DEPLOYMENT ONLY. Do not execute against production before the
-- v30.3.75E backup, identity, staging, and policy-test gates are complete.

begin;

-- Production baseline guard. These counts describe this migration event, not
-- a permanent product invariant. A mismatch requires investigation and a new,
-- reviewed migration; it must never be "fixed" by deleting rows.
do $$
declare
  course_count bigint;
  tee_count bigint;
  hole_count bigint;
begin
  select count(*) into course_count from public.courses;
  select count(*) into tee_count from public.course_tees;
  select count(*) into hole_count from public.course_holes;
  if (course_count, tee_count, hole_count) <> (10::bigint, 54::bigint, 972::bigint) then
    raise exception 'Course Library preflight failed: expected 10/54/972, found %/%/%',
      course_count, tee_count, hole_count;
  end if;
  if exists (
    select 1 from public.course_tees t
    left join public.courses c on c.id = t.course_id where c.id is null
  ) then raise exception 'Course Library preflight failed: orphan tee'; end if;
  if exists (
    select 1 from public.course_holes h
    left join public.courses c on c.id = h.course_id
    left join public.course_tees t on t.id = h.tee_id
    where c.id is null or t.id is null or t.course_id <> h.course_id
  ) then raise exception 'Course Library preflight failed: orphan or cross-course hole'; end if;
  if exists (
    select 1 from public.course_tees t left join public.course_holes h on h.tee_id = t.id
    group by t.id having count(h.id) <> 18
  ) then raise exception 'Course Library preflight failed: expected 18 holes for each baseline tee'; end if;
end $$;

alter table public.courses
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists publication_status text,
  add column if not exists source text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

update public.courses
set publication_status = 'approved',
    source = coalesce(source, 'legacy'),
    approved_at = coalesce(approved_at, created_at, now())
where publication_status is null;

alter table public.courses
  alter column owner_user_id set default auth.uid(),
  alter column publication_status set default 'draft',
  alter column publication_status set not null,
  alter column source set default 'user',
  alter column source set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'courses_publication_status_check') then
    alter table public.courses add constraint courses_publication_status_check
      check (publication_status in ('draft', 'approved', 'rejected', 'archived'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_source_check') then
    alter table public.courses add constraint courses_source_check
      check (source in ('legacy', 'user', 'imported', 'maintainer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_publication_ownership_check') then
    alter table public.courses add constraint courses_publication_ownership_check check (
      (publication_status = 'draft' and owner_user_id is not null and approved_by is null and approved_at is null)
      or (publication_status <> 'draft')
    );
  end if;
end $$;

create index if not exists courses_owner_status_idx
  on public.courses(owner_user_id, publication_status);
create index if not exists courses_public_catalog_idx
  on public.courses(publication_status) where publication_status = 'approved';
create index if not exists course_tees_course_id_security_idx
  on public.course_tees(course_id);
create index if not exists course_holes_course_id_security_idx
  on public.course_holes(course_id);
create index if not exists course_holes_tee_id_security_idx
  on public.course_holes(tee_id);

-- Narrow Course Library authorization, managed only by service-role/dashboard.
-- This is not the v30.3.75B beta identity/allowlist model.
create table if not exists public.course_library_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_create_drafts boolean not null default true,
  is_maintainer boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.course_library_roles enable row level security;
-- Deliberately no browser policies: service_role/postgres administration only.
revoke all on table public.course_library_roles from public, anon, authenticated;

create or replace function public.course_library_is_permanent_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.course_library_roles r
      where r.user_id = auth.uid() and r.can_create_drafts
    );
$$;
revoke all on function public.course_library_is_permanent_user() from public;
grant execute on function public.course_library_is_permanent_user() to anon, authenticated;
alter function public.course_library_is_permanent_user() owner to postgres;

create or replace function public.course_library_is_maintainer()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.course_library_roles r
      where r.user_id = auth.uid() and r.is_maintainer
    );
$$;
revoke all on function public.course_library_is_maintainer() from public;
alter function public.course_library_is_maintainer() owner to postgres;

-- Maintainers publish through this narrow path. Direct canonical writes remain
-- unavailable to browser roles. Ownership and IDs are preserved.
create or replace function public.publish_course(p_course_id text)
returns public.courses language plpgsql security definer set search_path = '' as $$
declare result public.courses;
begin
  if not public.course_library_is_maintainer() then
    raise exception 'course maintainer authorization required' using errcode = '42501';
  end if;
  update public.courses
    set publication_status = 'approved', source = 'maintainer',
        approved_by = auth.uid(), approved_at = now(), updated_at = now()
    where id = p_course_id and publication_status = 'draft'
    returning * into result;
  if result.id is null then raise exception 'draft course not found'; end if;
  return result;
end $$;
revoke all on function public.publish_course(text) from public;
grant execute on function public.publish_course(text) to authenticated;
alter function public.publish_course(text) owner to postgres;

-- RLS filters rows only after PostgreSQL privileges permit an operation. Keep
-- Data API grants explicit and keep the authorization table inaccessible.
revoke all on table public.courses, public.course_tees, public.course_holes from public;
revoke all on table public.courses, public.course_tees, public.course_holes from anon, authenticated;
grant select on table public.courses, public.course_tees, public.course_holes to anon;
grant select, insert, update, delete on table public.courses, public.course_tees, public.course_holes to authenticated;

alter table public.courses enable row level security;
alter table public.course_tees enable row level security;
alter table public.course_holes enable row level security;

-- Remove every historical Course Library policy, including permissive policies
-- whose names are unknown, before installing the reviewed contract.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('courses','course_tees','course_holes')
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

create policy courses_read_visible on public.courses for select to anon, authenticated
using (publication_status = 'approved' or (
  public.course_library_is_permanent_user() and owner_user_id = auth.uid()
));
create policy courses_insert_owned_draft on public.courses for insert to authenticated
with check (public.course_library_is_permanent_user() and owner_user_id = auth.uid()
  and publication_status = 'draft' and source = 'user'
  and approved_by is null and approved_at is null);
create policy courses_update_owned_draft on public.courses for update to authenticated
using (public.course_library_is_permanent_user() and owner_user_id = auth.uid() and publication_status = 'draft')
with check (public.course_library_is_permanent_user() and owner_user_id = auth.uid()
  and publication_status = 'draft' and source = 'user'
  and approved_by is null and approved_at is null);
create policy courses_delete_owned_draft on public.courses for delete to authenticated
using (public.course_library_is_permanent_user() and owner_user_id = auth.uid() and publication_status = 'draft');

create policy course_tees_read_visible on public.course_tees for select to anon, authenticated
using (exists (select 1 from public.courses c where c.id = course_tees.course_id));
create policy course_tees_insert_owned_draft on public.course_tees for insert to authenticated
with check (exists (select 1 from public.courses c where c.id = course_tees.course_id
  and c.owner_user_id = auth.uid() and c.publication_status = 'draft'));
create policy course_tees_update_owned_draft on public.course_tees for update to authenticated
using (exists (select 1 from public.courses c where c.id = course_tees.course_id
  and c.owner_user_id = auth.uid() and c.publication_status = 'draft'))
with check (exists (select 1 from public.courses c where c.id = course_tees.course_id
  and c.owner_user_id = auth.uid() and c.publication_status = 'draft'));
create policy course_tees_delete_owned_draft on public.course_tees for delete to authenticated
using (exists (select 1 from public.courses c where c.id = course_tees.course_id
  and c.owner_user_id = auth.uid() and c.publication_status = 'draft'));

create policy course_holes_read_visible on public.course_holes for select to anon, authenticated
using (exists (select 1 from public.courses c where c.id = course_holes.course_id)
  and exists (select 1 from public.course_tees t where t.id = course_holes.tee_id
    and t.course_id = course_holes.course_id));
create policy course_holes_insert_owned_draft on public.course_holes for insert to authenticated
with check (exists (select 1 from public.courses c where c.id = course_holes.course_id
    and c.owner_user_id = auth.uid() and c.publication_status = 'draft')
  and exists (select 1 from public.course_tees t where t.id = course_holes.tee_id
    and t.course_id = course_holes.course_id));
create policy course_holes_update_owned_draft on public.course_holes for update to authenticated
using (exists (select 1 from public.courses c where c.id = course_holes.course_id
    and c.owner_user_id = auth.uid() and c.publication_status = 'draft'))
with check (exists (select 1 from public.courses c where c.id = course_holes.course_id
    and c.owner_user_id = auth.uid() and c.publication_status = 'draft')
  and exists (select 1 from public.course_tees t where t.id = course_holes.tee_id
    and t.course_id = course_holes.course_id));
create policy course_holes_delete_owned_draft on public.course_holes for delete to authenticated
using (exists (select 1 from public.courses c where c.id = course_holes.course_id
  and c.owner_user_id = auth.uid() and c.publication_status = 'draft'));

-- Postflight: no data loss, no orphaning, legacy IDs untouched by the migration.
do $$
declare c bigint; t bigint; h bigint;
begin
  select count(*) into c from public.courses;
  select count(*) into t from public.course_tees;
  select count(*) into h from public.course_holes;
  if (c,t,h) <> (10::bigint,54::bigint,972::bigint) then
    raise exception 'Course Library postflight failed: expected 10/54/972, found %/%/%', c,t,h;
  end if;
  if (select count(*) from public.courses where publication_status='approved' and source='legacy') <> 10 then
    raise exception 'Course Library postflight failed: legacy backfill incomplete';
  end if;
  if exists (select 1 from public.course_holes h join public.course_tees t on t.id=h.tee_id where t.course_id<>h.course_id)
    or exists (select 1 from public.course_tees t left join public.courses c on c.id=t.course_id where c.id is null)
    or exists (select 1 from public.course_holes h left join public.course_tees t on t.id=h.tee_id where t.id is null)
  then raise exception 'Course Library postflight failed: relationship inconsistency'; end if;
  if exists (select 1 from public.course_tees t left join public.course_holes h on h.tee_id=t.id
    group by t.id having count(h.id)<>18)
  then raise exception 'Course Library postflight failed: baseline tee hole count changed'; end if;
end $$;

commit;
