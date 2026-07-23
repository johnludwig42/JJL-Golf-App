-- v30.3.75A two-stage rollback. Stage 1 is the default availability rollback.
-- It preserves every row and every new schema value.
begin;
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('courses','course_tees','course_holes')
  loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;
alter table public.courses disable row level security;
alter table public.course_tees disable row level security;
alter table public.course_holes disable row level security;
grant select, insert, update, delete on table
  public.courses, public.course_tees, public.course_holes to anon, authenticated;
-- WARNING: this restores the pre-migration public Data API exposure. Use only
-- as an incident response measure while a corrected policy migration is built.
commit;

-- STAGE 2 IS INTENTIONALLY NOT AUTOMATIC.
-- Only after an approved backup and proof that no drafts/role assignments exist:
-- drop function public.publish_course(text);
-- drop function public.course_library_is_maintainer();
-- drop function public.course_library_is_permanent_user();
-- drop table public.course_library_roles;
-- drop index public.course_holes_tee_id_security_idx;
-- drop index public.course_holes_course_id_security_idx;
-- drop index public.course_tees_course_id_security_idx;
-- drop index public.courses_public_catalog_idx;
-- drop index public.courses_owner_status_idx;
-- alter table public.courses drop constraint courses_publication_ownership_check;
-- alter table public.courses drop constraint courses_source_check;
-- alter table public.courses drop constraint courses_publication_status_check;
-- alter table public.courses drop columns owner_user_id, publication_status,
--   source, approved_by, approved_at;
-- Stage 2 destroys security metadata and may destroy draft meaning. It must
-- never drop courses, course_tees, course_holes, or any rows in those tables.
