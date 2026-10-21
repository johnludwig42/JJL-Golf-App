-- DISPOSABLE LOCAL DATABASE ONLY. Run after contract.sql.
\set ON_ERROR_STOP on
do $$begin if current_database()<>'dye_rpc_review' or inet_server_addr()<>'127.0.0.1'::inet or current_setting('port')<>'55477' then raise exception 'Wrong review database';end if;end$$;
create table public.review_before_rollback as select
 (select jsonb_agg(to_jsonb(s) order by s.id) from public.score_entries s) scores,
 (select jsonb_agg(to_jsonb(s) order by s.operation_id) from public.shared_score_operations s) receipts,
 (select shared_revision from public.matches where id='DYE-REVIEW') revision,
 (select jsonb_agg(to_jsonb(s) order by s.id) from public.match_memberships s) memberships;
select set_config('dye.shared_rpc_review_authorized','reviewed-rollback',false);
\ir ../../proposals/shared-score-rpc-v31.0.77/rollback-review.sql
select public.review_assert(to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is null,'rollback removes exposed RPC');
select public.review_assert(not exists(select 1 from pg_trigger where tgname='broadcast_shared_score_change_after_write' and not tgisinternal),'rollback detaches broadcast trigger');
select public.review_assert((select jsonb_agg(to_jsonb(s) order by s.id) from public.score_entries s)=(select scores from public.review_before_rollback),'rollback preserves every score row');
select public.review_assert((select jsonb_agg(to_jsonb(s) order by s.operation_id) from public.shared_score_operations s)=(select receipts from public.review_before_rollback),'rollback preserves every receipt');
select public.review_assert((select shared_revision from public.matches where id='DYE-REVIEW')=(select revision from public.review_before_rollback),'rollback retains match revision');
select public.review_assert((select jsonb_agg(to_jsonb(s) order by s.id) from public.match_memberships s)=(select memberships from public.review_before_rollback),'rollback preserves memberships');
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',true);
update public.score_entries set gross=5 where id='score-0';
select public.review_assert((select gross from public.score_entries where id='score-0')=5,'legacy direct-table write remains usable after rollback');
commit;
begin;
update public.matches set status='complete' where id='DYE-REVIEW';
set local role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',true);
select public.review_error($q$update public.score_entries set gross=6 where id='score-0'$q$,'P7701','rollback retains DIRECT completion barrier');
update public.score_entries set gross=5 where id='score-0';
select public.review_assert((select gross from public.score_entries where id='score-0')=5,'rollback permits identical closed replay');
rollback;
select set_config('dye.shared_rpc_review_authorized','reviewed-restore',false);
\ir ../../proposals/shared-score-rpc-v31.0.77/restore-review.sql
select public.review_assert(to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is not null,'restore exposes the corrected RPC');
select public.review_assert((select count(*) from public.score_entries)=64,'restore preserves score count');
select public.review_assert((select jsonb_agg(to_jsonb(s) order by s.operation_id) from public.shared_score_operations s)=(select receipts from public.review_before_rollback),'restore preserves receipt history byte-for-byte as JSONB');
select public.review_assert((select shared_revision from public.matches where id='DYE-REVIEW')=64,'restore preserves revision');
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',true);
select public.review_assert((select match_revision from public.submit_shared_score_operations('DYE-REVIEW','host',public.review_ops(1)))=1,'receipt replay remains valid after restore');
select public.review_assert((select gross from public.score_entries where id='score-0')=5,'receipt replay does not overwrite a later direct-table correction');
select public.review_assert((select count(*) from public.submit_shared_score_operations('DYE-REVIEW','host',jsonb_set(jsonb_set(public.review_ops(1),'{0,operation_id}',to_jsonb(gen_random_uuid()::text)),'{0,score_entry,gross}','6')))=1,'new correction gets a new acknowledged operation');
select public.review_assert((select gross from public.score_entries where id='score-0')=6,'new correction updates the score after restore');
commit;
