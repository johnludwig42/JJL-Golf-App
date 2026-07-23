begin;
select plan(40);
insert into auth.users(id,is_anonymous,raw_app_meta_data) values
 ('10000000-0000-0000-0000-000000000001',false,'{"provider":"email"}'),
 ('10000000-0000-0000-0000-000000000002',false,'{"provider":"email"}'),
 ('10000000-0000-0000-0000-000000000003',false,'{"provider":"email"}'),
 ('10000000-0000-0000-0000-000000000004',false,'{"provider":"email"}'),
 ('10000000-0000-0000-0000-000000000005',true,'{"provider":"anonymous"}') on conflict do nothing;
select is((select count(*) from public.accounts),4::bigint,'only durable Auth users provision Accounts');
insert into public.golfer_identities(golfer_identity_id,claim_status,claimed_by_account_id,created_by_account_id) values
 ('20000000-0000-0000-0000-000000000001','claimed','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','unclaimed',null,'10000000-0000-0000-0000-000000000001');
insert into public.personal_golfer_library(account_id,golfer_identity_id) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002');
insert into public.authoritative_rounds(round_id,owner_account_id) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004');
insert into public.round_access(round_id,account_id,role) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','participant'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','viewer');
insert into public.round_participations(participation_id,round_id,golfer_identity_id) values('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.authoritative_rounds),1::bigint,'Owner reads own Round only');
select lives_ok($$select public.create_authoritative_round()$$,'durable Account creates an authoritative Round through the audited function');
select is((select count(*) from public.security_audit_log where action='round.created'),1::bigint,'Round creation appends audit history');
select lives_ok($$select public.set_round_access('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','viewer')$$,'Owner grants Viewer access through audited function');
select lives_ok($$select public.publish_round_record_version('30000000-0000-0000-0000-000000000001',null,'{"scores":[]}'::jsonb,'initial publication','initial',null)$$,'Owner atomically publishes first version');
select is((select version_number from public.round_record_versions),1,'published version is sequential');
select is((select count(*) from public.security_audit_log where action='round_record.published'),1::bigint,'publication appends audit history');
select throws_ok($$insert into public.round_record_versions(round_id,version_number,record,published_by_account_id,reason,impact) values('30000000-0000-0000-0000-000000000001',9,'{}','10000000-0000-0000-0000-000000000001','bypass','bad')$$,'42501',null,'direct version insert is denied');
select throws_ok($$select public.publish_round_record_version('30000000-0000-0000-0000-000000000001',null,'{}','stale write','bad',null)$$,'P0001','stale current RoundRecord version','stale publication is rejected');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.authoritative_rounds),1::bigint,'Participant reads its Round');
select lives_ok($$insert into public.amendment_sessions(round_id,base_version_id,proposed_by_account_id,reason,impact) select round_id,current_version_id,'10000000-0000-0000-0000-000000000002','score correction','material' from public.authoritative_rounds where round_id='30000000-0000-0000-0000-000000000001'$$,'Participant proposes correction');
select throws_ok($$select public.publish_round_record_version('30000000-0000-0000-0000-000000000001',null,'{}','unauthorized','bad',null)$$,'42501',null,'Participant cannot publish');
select throws_ok($$select public.set_round_access('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','viewer')$$,'42501',null,'Participant cannot administer Round access');
select throws_ok($$insert into public.personal_golfer_library(account_id,golfer_identity_id) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')$$,'42501',null,'Account cannot mutate another Personal Golfer Library');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.authoritative_rounds),1::bigint,'Viewer reads its Round');
select throws_ok($$insert into public.amendment_sessions(round_id,base_version_id,proposed_by_account_id,reason,impact) select round_id,current_version_id,'10000000-0000-0000-0000-000000000003','viewer edit','material' from public.authoritative_rounds where round_id='30000000-0000-0000-0000-000000000001'$$,'42501',null,'Viewer cannot propose');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.authoritative_rounds),1::bigint,'Unrelated Account sees only its own Round');
select is((select count(*) from public.round_record_versions where round_id='30000000-0000-0000-0000-000000000001'),0::bigint,'Unrelated Account cannot read another RoundRecord');

reset role;
insert into public.security_audit_log(action,entity_type,entity_id) values('future.event','future_entity','not-a-uuid');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select lives_ok($$select * from public.security_audit_log$$,'future non-Round audit identifiers do not break Round audit reads');
reset role;
select throws_ok($$insert into public.scoring_assignments(round_id,participation_id) values('30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001')$$,'23503',null,'scoring assignment cannot cross Rounds');
select throws_ok($$update public.round_record_versions set reason='rewrite'$$,'P0001','RoundRecord versions are immutable','versions reject update');
select throws_ok($$update public.security_audit_log set action='rewrite'$$,'P0001','Security audit history is append-only','audit rejects update');

set local role anon;
select throws_ok($$select * from public.accounts$$,'42501',null,'anonymous cannot read Accounts');
select throws_ok($$insert into public.courses(id,name) values('anon-write','Denied')$$,'42501',null,'anonymous catalog insert is denied');
reset role;
select ok((select count(*) from public.round_access where role not in ('participant','viewer'))=0,'Owner is not duplicated in Round access roles');
select ok((select current_version_id is not null from public.authoritative_rounds where round_id='30000000-0000-0000-0000-000000000001'),'current-version pointer advances');
select ok(not exists(select 1 from public.accounts where account_id='10000000-0000-0000-0000-000000000005'),'anonymous Auth user has no Account');
select ok(has_table_privilege('anon','public.courses','select'),'anonymous retains public Course reads');
select ok(has_table_privilege('anon','public.course_tees','select'),'anonymous retains public Tee reads');
select ok(has_table_privilege('anon','public.course_holes','select'),'anonymous retains public Hole reads');
select ok(not has_table_privilege('anon','public.courses','insert'),'anonymous lacks Course insert privilege');
select ok(not has_table_privilege('anon','public.courses','update'),'anonymous lacks Course update privilege');
select ok(not has_table_privilege('anon','public.courses','delete'),'anonymous lacks Course delete privilege');
select ok(not has_table_privilege('anon','public.course_tees','insert'),'anonymous lacks Tee insert privilege');
select ok(not has_table_privilege('anon','public.course_tees','update'),'anonymous lacks Tee update privilege');
select ok(not has_table_privilege('anon','public.course_tees','delete'),'anonymous lacks Tee delete privilege');
select ok(not has_table_privilege('anon','public.course_holes','insert'),'anonymous lacks Hole insert privilege');
select ok(not has_table_privilege('anon','public.course_holes','update'),'anonymous lacks Hole update privilege');
select ok(not has_table_privilege('anon','public.course_holes','delete'),'anonymous lacks Hole delete privilege');
select * from finish();
rollback;
