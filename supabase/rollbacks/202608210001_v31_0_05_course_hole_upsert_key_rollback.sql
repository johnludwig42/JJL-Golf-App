-- Roll back only the v31.0.05 upsert key. No Course Library rows are modified.
begin;

alter table public.course_holes
  drop constraint if exists course_holes_tee_id_hole_number_key;

commit;
