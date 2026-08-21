-- Additive/idempotent support for v31.0.05 batched Course Library hole uploads.
-- This migration never modifies or deletes Course Library rows.
begin;

do $$
begin
  if exists (
    select 1
    from public.course_holes
    group by tee_id, hole_number
    having count(*) > 1
  ) then
    raise exception 'v31.0.05 preflight failed: duplicate course_holes rows exist for the same tee_id and hole_number';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.course_holes'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.course_holes'::regclass and attname = 'tee_id'),
        (select attnum from pg_attribute where attrelid = 'public.course_holes'::regclass and attname = 'hole_number')
      ]::smallint[]
  ) then
    alter table public.course_holes
      add constraint course_holes_tee_id_hole_number_key
      unique (tee_id, hole_number);
  end if;
end $$;

commit;
