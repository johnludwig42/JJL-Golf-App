-- The Dye Ledger v27.38 Course Sync compatibility migration
-- Run this if your course tables were created from an earlier simplified schema.
-- It keeps course syncing login-free for this phase and enables tee-level hole uploads.

alter table public.course_holes
  add column if not exists tee_id text;

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

-- Early schemas used unique(course_id, hole_number), which prevents tee-level hole detail.
alter table public.course_holes
  drop constraint if exists course_holes_course_id_hole_number_key;

create unique index if not exists course_holes_tee_hole_unique_idx
on public.course_holes (tee_id, hole_number)
where tee_id is not null;

create index if not exists idx_course_tees_course_id on public.course_tees(course_id);
create index if not exists idx_course_holes_course_id on public.course_holes(course_id);
create index if not exists idx_course_holes_tee_id on public.course_holes(tee_id);

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
