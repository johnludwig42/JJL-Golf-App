-- Safe rollback: disable atomic publishing without deleting tee gender data.
-- The gender column and its values are intentionally retained so men's and
-- women's tees cannot be silently collapsed by an older publishing function.
begin;
drop function if exists public.publish_course_draft_atomic(jsonb);
drop index if exists public.course_tees_course_name_gender_key;
alter table public.course_tees drop constraint if exists course_tees_gender_check;
commit;
