-- Target-state closure of anonymous catalog mutation. Shared Match guest behavior remains transitional.
begin;

drop policy if exists courses_insert_anon on public.courses; drop policy if exists courses_update_anon on public.courses; drop policy if exists courses_delete_anon on public.courses;
drop policy if exists course_tees_insert_anon on public.course_tees; drop policy if exists course_tees_update_anon on public.course_tees; drop policy if exists course_tees_delete_anon on public.course_tees;
drop policy if exists course_holes_insert_anon on public.course_holes; drop policy if exists course_holes_update_anon on public.course_holes; drop policy if exists course_holes_delete_anon on public.course_holes;
revoke insert, update, delete on public.courses, public.course_tees, public.course_holes from anon;
-- Public reads remain for backward-compatible cached Course Library transition; authorization-only reads are staged separately after installed-PWA acceptance.

commit;
