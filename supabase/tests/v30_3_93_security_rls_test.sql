begin;
select plan(23);

insert into public.course_library_roles(user_id,can_create_drafts,is_maintainer) values
 ('93000000-0000-0000-0000-000000000002',true,false),
 ('93000000-0000-0000-0000-000000000003',false,true);

set local role anon;
select is((select count(*)::int from public.courses),10,'anonymous can read approved catalog');
select throws_ok($$insert into public.courses(id,name) values ('anon-course','Denied')$$,'42501',null,'anonymous cannot create a Course');
select throws_ok($$select count(*) from public.matches$$,'42501',null,'anonymous cannot read Shared Matches');
reset role;

select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is((select count(*)::int from public.matches),0,'unrelated Account cannot enumerate Shared Matches');
select is(public.join_shared_match('DYE-930001','device-joiner','Joiner iPhone'),'DYE-930001','join RPC authorizes an active code');
select is((select count(*)::int from public.matches where id='DYE-930001'),1,'joined member can read its Shared Match');
select throws_ok($$select public.join_shared_match('DYE-930002','device-joiner','Joiner iPhone')$$,'P0002',null,'completed Shared Match cannot be joined');
select throws_ok($$select public.join_shared_match('BAD-CODE','device-joiner','Joiner iPhone')$$,'22023',null,'invalid join code fails closed');
select throws_ok($$insert into public.score_entries(id,match_id,updated_by) values ('score-forged','DYE-930001','93000000-0000-0000-0000-000000000001')$$,'42501',null,'member cannot forge score attribution');
select lives_ok($$insert into public.score_entries(id,match_id,updated_by) values ('score-member','DYE-930001','93000000-0000-0000-0000-000000000004')$$,'member can write an attributed score');
reset role;

select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select lives_ok($$insert into public.courses(id,name,owner_user_id,publication_status) values ('owner-draft-93','Owner Draft','93000000-0000-0000-0000-000000000002','draft')$$,'allowlisted contributor can create own draft');
select is((select count(*)::int from public.courses where id='owner-draft-93'),1,'contributor reads own draft');
select lives_ok($$update public.courses set name='Blocked' where id='legacy-1'$$,'unauthorized catalog update fails without leaking the row');
select is((select name from public.courses where id='legacy-1'),'Legacy 1','contributor cannot edit approved catalog');
reset role;

select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select lives_ok($$update public.courses set name='Maintained Legacy 1' where id='legacy-1'$$,'maintainer can update approved catalog');
reset role;

select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select is((select count(*)::int from public.matches where id='DYE-930001'),1,'host reads owned Shared Match');
select lives_ok($$insert into public.matches(id,created_by,status) values ('DYE-930003',null,'active')$$,'current client null owner is safely attributed by trigger');
select is((select created_by::text from public.matches where id='DYE-930003'),'93000000-0000-0000-0000-000000000001','new Shared Match owner is the authenticated host');
select lives_ok($$insert into public.audit_log(id,match_id,actor_user_id) values ('audit-host','DYE-930001','93000000-0000-0000-0000-000000000001')$$,'host writes attributed audit event');
select throws_ok($$insert into public.audit_log(id,match_id,actor_user_id) values ('audit-forged','DYE-930001','93000000-0000-0000-0000-000000000002')$$,'42501',null,'host cannot forge audit attribution');
reset role;

select ok(not has_table_privilege('anon','public.courses','INSERT'),'anonymous Course insert grant is removed');
select ok(not has_table_privilege('authenticated','public.team_access_codes','SELECT'),'Shared access codes have no browser read grant');
select is((select count(*)::int from pg_policies where schemaname='public' and policyname='legacy_permissive'),0,'legacy permissive policies are removed');

select * from finish();
rollback;
