-- Disposable PostgreSQL fixture. Never run against production.
begin;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
create table public.courses (
 id text primary key, name text not null, city text, state text, country text,
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.course_tees (
 id text primary key, course_id text not null references public.courses(id) on delete cascade,
 tee_name text not null, rating numeric, slope integer, total_yards integer,
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.course_holes (
 id text primary key, course_id text not null references public.courses(id) on delete cascade,
 tee_id text not null references public.course_tees(id) on delete cascade,
 hole_number integer not null, par integer, handicap_index integer, yardage integer,
 created_at timestamptz default now(), updated_at timestamptz default now(), unique(tee_id,hole_number)
);
insert into public.courses(id,name)
select 'legacy-'||c, 'Legacy '||c from generate_series(1,10) c;
insert into public.course_tees(id,course_id,tee_name)
select 'tee-'||t, 'legacy-'||(((t-1)%10)+1), 'Tee '||t from generate_series(1,54) t;
insert into public.course_holes(id,course_id,tee_id,hole_number)
select 'hole-'||t||'-'||h, 'legacy-'||(((t-1)%10)+1), 'tee-'||t, h
from generate_series(1,54) t cross join generate_series(1,18) h;
grant usage on schema public, auth to anon, authenticated;
grant select,insert,update,delete on public.courses,public.course_tees,public.course_holes to anon,authenticated;
grant select on auth.users to authenticated;
commit;
