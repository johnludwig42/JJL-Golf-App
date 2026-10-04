-- Explicit maintainer revision; retains course/tee/hole identities and content.
begin;
create or replace function public.revise_approved_course(p_course_id text)
returns public.courses
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.courses;
begin
  if auth.uid() is null or not public.course_library_is_maintainer()
     or not public.course_library_can_write() then
    raise exception 'Course maintainer authorization required' using errcode = '42501';
  end if;
  -- Existing atomic publishing only accepts an Account's own user draft.
  -- Prior approval attribution remains available until reapproval.
  update public.courses
  set publication_status = 'draft', owner_user_id = auth.uid(),
      source = 'user', updated_at = now()
  where id::text = nullif(btrim(p_course_id), '')
    and publication_status = 'approved'
  returning * into result;
  if result.id is null then
    raise exception 'Approved course not found; refresh the Course Library';
  end if;
  return result;
end $$;
revoke all on function public.revise_approved_course(text) from public, anon;
grant execute on function public.revise_approved_course(text) to authenticated;
alter function public.revise_approved_course(text) owner to postgres;
commit;
