-- Disposable identity/RLS fixture. Never run against production.
create extension if not exists pgtap;
create extension if not exists pgcrypto;
create schema if not exists auth;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create table if not exists auth.users(
  id uuid primary key, is_anonymous boolean not null default false,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
alter table auth.users add column if not exists is_anonymous boolean not null default false;
alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create table if not exists public.courses(id text primary key,name text not null);
create table if not exists public.course_tees(id text primary key,course_id text not null references public.courses(id));
create table if not exists public.course_holes(id text primary key,course_id text not null references public.courses(id),tee_id text not null references public.course_tees(id));
grant usage on schema public,auth to anon,authenticated;
grant select on auth.users to authenticated;
