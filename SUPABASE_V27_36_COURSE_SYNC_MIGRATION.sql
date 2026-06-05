-- The Dye Ledger v27.36 Course Sync compatibility migration
-- Run this if your course_holes table was created from the earlier simplified schema.
-- It adds tee-level hole support required for syncing tee yardage/par/handicap detail.

alter table public.course_holes
  add column if not exists tee_id text;

-- If tee_id is blank on existing rows, leave those legacy rows untouched.
-- New v27.36 synced rows include tee_id and use one row per tee/hole.

alter table public.course_holes
  add column if not exists yardage integer;

-- Some early schemas used yards instead of yardage. Copy values where available.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'course_holes' and column_name = 'yards'
  ) then
    execute 'update public.course_holes set yardage = coalesce(yardage, yards)';
  end if;
end $$;

-- Ensure write policies exist when RLS is enabled. If you disabled RLS for testing, these are harmless.
alter table public.courses enable row level security;
alter table public.course_tees enable row level security;
alter table public.course_holes enable row level security;

drop policy if exists courses_select_anon on public.courses;
create policy courses_select_anon on public.courses for select to anon using (true);
drop policy if exists course_tees_select_anon on public.course_tees;
create policy course_tees_select_anon on public.course_tees for select to anon using (true);
drop policy if exists course_holes_select_anon on public.course_holes;
create policy course_holes_select_anon on public.course_holes for select to anon using (true);

drop policy if exists courses_insert_anon on public.courses;
create policy courses_insert_anon on public.courses for insert to anon with check (true);
drop policy if exists courses_update_anon on public.courses;
create policy courses_update_anon on public.courses for update to anon using (true) with check (true);
drop policy if exists course_tees_insert_anon on public.course_tees;
create policy course_tees_insert_anon on public.course_tees for insert to anon with check (true);
drop policy if exists course_tees_update_anon on public.course_tees;
create policy course_tees_update_anon on public.course_tees for update to anon using (true) with check (true);
drop policy if exists course_holes_insert_anon on public.course_holes;
create policy course_holes_insert_anon on public.course_holes for insert to anon with check (true);
drop policy if exists course_holes_update_anon on public.course_holes;
create policy course_holes_update_anon on public.course_holes for update to anon using (true) with check (true);
