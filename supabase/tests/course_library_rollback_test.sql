-- Execute after the Stage 1 rollback, in the disposable fixture database only.
begin;
do $$
declare c bigint; t bigint; h bigint;
begin
  select count(*) into c from public.courses;
  select count(*) into t from public.course_tees;
  select count(*) into h from public.course_holes;
  if (c,t,h) <> (10::bigint,54::bigint,972::bigint) then
    raise exception 'rollback changed baseline rows: %/%/%',c,t,h;
  end if;
  if exists (select 1 from public.course_holes h join public.course_tees t on t.id=h.tee_id where h.course_id<>t.course_id)
  then raise exception 'rollback introduced cross-course relationship'; end if;
  if exists (select 1 from pg_class where oid in ('public.courses'::regclass,'public.course_tees'::regclass,'public.course_holes'::regclass) and relrowsecurity)
  then raise exception 'Stage 1 rollback did not disable Course Library RLS'; end if;
end $$;
set local role anon;
insert into public.courses(id,name) values('rollback-availability-probe','Rollback Probe');
delete from public.courses where id='rollback-availability-probe';
reset role;
rollback;

