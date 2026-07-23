-- Plain-psql RLS integration tests. Run only after fixture + forward migration.
-- Any unexpected result raises and makes psql exit nonzero.
begin;
insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.course_library_roles(user_id,can_create_drafts,is_maintainer) values
 ('00000000-0000-0000-0000-000000000001',true,false),
 ('00000000-0000-0000-0000-000000000002',true,false),
 ('00000000-0000-0000-0000-000000000003',true,true);

create schema test;
create function test.ok(value boolean, message text) returns void language plpgsql as $$
begin if not coalesce(value,false) then raise exception 'FAIL: %',message; end if; end $$;
create function test.denied(statement text, message text) returns void language plpgsql as $$
begin execute statement; raise exception 'FAIL: %',message;
exception when insufficient_privilege or check_violation then null; end $$;
create function test.zero_rows(statement text, message text) returns void language plpgsql as $$
declare affected bigint;
begin execute statement; get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: %',message; end if;
end $$;
grant usage on schema test to anon,authenticated;
grant execute on all functions in schema test to anon,authenticated;

-- Public: canonical hierarchy readable; draft invisible; every write denied.
set local role anon;
select test.ok((select count(*) from public.courses)=10,'public reads canonical courses');
select test.ok((select count(*) from public.course_tees)=54,'public reads canonical tees');
select test.ok((select count(*) from public.course_holes)=972,'public reads canonical holes');
select test.denied($q$insert into public.courses(id,name) values('public-draft','No')$q$,'public course insert denied');
select test.denied($q$update public.courses set name='No' where id='legacy-1'$q$,'public course update denied');
select test.denied($q$delete from public.courses where id='legacy-1'$q$,'public course delete denied');
select test.denied($q$insert into public.course_tees(id,course_id,tee_name) values('public-tee','legacy-1','No')$q$,'public tee insert denied');
select test.denied($q$insert into public.course_holes(id,course_id,tee_id,hole_number) values('public-hole','legacy-1','tee-1',19)$q$,'public hole insert denied');
select test.denied($q$update public.course_tees set tee_name='No' where id='tee-1'$q$,'public tee update denied');
select test.denied($q$delete from public.course_tees where id='tee-1'$q$,'public tee delete denied');
select test.denied($q$update public.course_holes set par=9 where id='hole-1-1'$q$,'public hole update denied');
select test.denied($q$delete from public.course_holes where id='hole-1-1'$q$,'public hole delete denied');
reset role;

-- Anonymous Auth still has the authenticated DB role but no draft privileges.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","is_anonymous":true}',true);
set local role authenticated;
select test.ok((select count(*) from public.courses)=10,'anonymous Auth reads canonical');
select test.denied($q$insert into public.courses(id,name) values('anonymous-draft','No')$q$,'anonymous Auth insert denied');
select test.zero_rows($q$update public.courses set name='No' where id='legacy-1'$q$,'anonymous Auth course update denied');
select test.zero_rows($q$delete from public.courses where id='legacy-1'$q$,'anonymous Auth course delete denied');
select test.denied($q$insert into public.course_tees(id,course_id,tee_name) values('anonymous-tee','legacy-1','No')$q$,'anonymous Auth tee insert denied');
select test.zero_rows($q$update public.course_tees set tee_name='No' where id='tee-1'$q$,'anonymous Auth tee update denied');
select test.zero_rows($q$delete from public.course_tees where id='tee-1'$q$,'anonymous Auth tee delete denied');
select test.denied($q$insert into public.course_holes(id,course_id,tee_id,hole_number) values('anonymous-hole','legacy-1','tee-1',19)$q$,'anonymous Auth hole insert denied');
select test.zero_rows($q$update public.course_holes set par=9 where id='hole-1-1'$q$,'anonymous Auth hole update denied');
select test.zero_rows($q$delete from public.course_holes where id='hole-1-1'$q$,'anonymous Auth hole delete denied');
reset role;

-- Permanent owner creates a private draft and hierarchy.
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","is_anonymous":false}',true);
set local role authenticated;
insert into public.courses(id,name) values('owner-draft','Owner Draft');
insert into public.course_tees(id,course_id,tee_name) values('owner-tee','owner-draft','Blue');
insert into public.course_holes(id,course_id,tee_id,hole_number) values('owner-hole','owner-draft','owner-tee',1);
update public.courses set name='Updated Draft' where id='owner-draft';
update public.course_tees set tee_name='Gold' where id='owner-tee';
update public.course_holes set par=4 where id='owner-hole';
select test.ok((select count(*) from public.courses where id='owner-draft')=1,'owner reads draft');
select test.denied($q$update public.courses set publication_status='approved' where id='owner-draft'$q$,'owner cannot approve');
select test.denied($q$update public.courses set owner_user_id='00000000-0000-0000-0000-000000000002' where id='owner-draft'$q$,'owner cannot transfer');
select test.denied($q$update public.courses set approved_by='00000000-0000-0000-0000-000000000001' where id='owner-draft'$q$,'owner cannot set approved_by');
select test.denied($q$update public.courses set approved_at=now() where id='owner-draft'$q$,'owner cannot set approved_at');
select test.denied($q$update public.courses set source='maintainer' where id='owner-draft'$q$,'owner cannot escalate source');
select test.zero_rows($q$update public.courses set name='No' where id='legacy-1'$q$,'owner cannot modify canonical');
select test.zero_rows($q$update public.courses set publication_status='draft',owner_user_id='00000000-0000-0000-0000-000000000001' where id='legacy-1'$q$,'owner cannot seize canonical');
select test.denied($q$select public.publish_course('owner-draft')$q$,'non-maintainer cannot publish');
insert into public.courses(id,name) values('owner-delete','Owner Delete');
insert into public.course_tees(id,course_id,tee_name) values('owner-delete-tee','owner-delete','Blue');
insert into public.course_holes(id,course_id,tee_id,hole_number) values('owner-delete-hole','owner-delete','owner-delete-tee',1);
delete from public.course_holes where id='owner-delete-hole';
delete from public.course_tees where id='owner-delete-tee';
delete from public.courses where id='owner-delete';
select test.ok((select count(*) from public.courses where id='owner-delete')=0,'owner deletes own hierarchy');
reset role;

-- Non-owner cannot see/mutate or cross-link to the private draft.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","is_anonymous":false}',true);
set local role authenticated;
select test.ok((select count(*) from public.courses where id='owner-draft')=0,'non-owner cannot read draft');
select test.zero_rows($q$update public.courses set name='No' where id='owner-draft'$q$,'non-owner update denied');
select test.zero_rows($q$delete from public.course_tees where id='owner-tee'$q$,'non-owner child delete denied');
insert into public.courses(id,name) values('other-draft','Other Draft');
insert into public.course_tees(id,course_id,tee_name) values('other-tee','other-draft','Red');
select test.denied($q$insert into public.course_holes(id,course_id,tee_id,hole_number) values('cross-hole','other-draft','owner-tee',2)$q$,'cross-course hole denied');
select test.denied($q$update public.course_tees set course_id='owner-draft' where id='other-tee'$q$,'cross-owner tee move denied');
reset role;

-- Maintainer publishes only through protected RPC and cannot self-assign roles.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","is_anonymous":false}',true);
set local role authenticated;
select test.denied($q$insert into public.course_library_roles(user_id,is_maintainer) values('00000000-0000-0000-0000-000000000001',true)$q$,'role self-assignment denied');
select public.publish_course('owner-draft');
select test.ok((select publication_status from public.courses where id='owner-draft')='approved','maintainer RPC publishes');
reset role;

select test.ok(not has_table_privilege('anon','public.course_library_roles','select'),'anon cannot read role table');
select test.ok(not has_table_privilege('authenticated','public.course_library_roles','select'),'authenticated cannot read role table');
select test.ok(has_table_privilege('anon','public.courses','select'),'anon has policy-filtered course select');
select test.ok(not has_table_privilege('anon','public.courses','insert'),'anon lacks course insert grant');
select test.ok(has_table_privilege('authenticated','public.courses','insert'),'authenticated insert is policy-filtered');
select test.ok(not exists (
  select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid='public.publish_course(text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'
),'PUBLIC cannot execute publisher');
select test.ok(not has_function_privilege('anon','public.publish_course(text)','execute'),'anon cannot execute publisher');
select test.ok(has_function_privilege('authenticated','public.publish_course(text)','execute'),'authenticated may call checked publisher');
select test.ok(not has_function_privilege('authenticated','public.course_library_is_maintainer()','execute'),'authenticated cannot call maintainer helper directly');
select test.ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.publish_course(text)'::regprocedure),'publisher pins empty search_path');
select test.ok((select count(*) from public.courses where id like 'legacy-%')=10,'legacy IDs retained');
select test.ok((select count(*) from public.course_tees where id like 'tee-%')=54,'legacy tees retained');
select test.ok((select count(*) from public.course_holes where id like 'hole-%')=972,'legacy holes retained');
rollback;
