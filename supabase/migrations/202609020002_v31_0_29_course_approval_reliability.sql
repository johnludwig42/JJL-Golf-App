-- v31.0.29: validate Course Library drafts and support UUID-backed course IDs
-- before changing publication status to approved.
begin;

create or replace function public.publish_course(p_course_id text)
returns public.courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.courses;
  v_course_id text := nullif(btrim(p_course_id), '');
begin
  if not public.course_library_is_maintainer() then
    raise exception 'Course maintainer authorization required' using errcode = '42501';
  end if;
  if v_course_id is null then
    raise exception 'Course id is required';
  end if;

  select * into result
  from public.courses
  where id::text = v_course_id
    and publication_status = 'draft'
  for update;
  if not found then
    raise exception 'Draft course not found';
  end if;

  if not exists (select 1 from public.course_tees tee where tee.course_id::text = v_course_id) then
    raise exception 'Course approval failed: at least one tee is required';
  end if;
  if exists (
    select 1
    from public.course_tees tee
    left join public.course_holes hole on hole.tee_id = tee.id
    where tee.course_id::text = v_course_id
    group by tee.id, tee.tee_name
    having count(hole.id) not in (9, 18)
  ) then
    raise exception 'Course approval failed: every tee must contain exactly 9 or 18 holes';
  end if;
  if exists (
    select 1
    from public.course_tees tee
    where tee.course_id::text = v_course_id
    group by lower(btrim(tee.tee_name)), tee.gender
    having count(*) > 1
  ) then
    raise exception 'Course approval failed: duplicate tee name and gender identities exist';
  end if;

  update public.courses
  set publication_status = 'approved',
      source = 'maintainer',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id::text = v_course_id
    and publication_status = 'draft'
  returning * into result;
  if result.id is null then
    raise exception 'Draft course not found';
  end if;
  return result;
end $$;

revoke all on function public.publish_course(text) from public, anon;
grant execute on function public.publish_course(text) to authenticated;
alter function public.publish_course(text) owner to postgres;

commit;
