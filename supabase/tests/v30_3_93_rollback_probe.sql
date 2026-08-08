do $$ begin
  if (select count(*) from public.courses) <> 10
    or (select count(*) from public.course_tees) <> 54
    or (select count(*) from public.course_holes) <> 972
    or (select count(*) from public.matches) <> 2
    or (select count(*) from public.score_entries) <> 1
  then raise exception 'v30.3.93 rollback probe: baseline rows changed'; end if;
  if (select relrowsecurity from pg_class where oid='public.courses'::regclass) then
    raise exception 'v30.3.93 rollback probe: Course RLS was not restored to legacy state';
  end if;
end $$;
