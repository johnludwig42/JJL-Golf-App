-- Included only by publication-local.mjs in its guarded disposable local database.
create function public.review_publication_payload(code text) returns jsonb language sql as $$
 select (to_jsonb(m)-array['shared_revision','shared_scores_closed']) ||
   jsonb_build_object('id',code,'name','Publication compatibility test','status','active',
     'completed_at',null,'course_snapshot','{}'::jsonb)
 from public.matches m where id='DYE-REVIEW'
$$;

-- Exercise the actual original publication body against the expanded matches type.
set role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',false);
do $$ declare col text; begin
 begin
  perform public.publish_shared_match_owner(public.review_publication_payload('DYE-900001'),'publication-host','Host');
  raise exception 'Expected the reproduced failure';
 exception when not_null_violation then
  get stacked diagnostics col=column_name;
  perform public.review_assert(col='shared_revision','publication reproduces 23502 on shared_revision');
 end;
end $$;
reset role;
select public.review_assert(not exists(select 1 from public.matches where id='DYE-900001'),'failed publication creates no partial match');
select public.review_assert((select count(*) from public.shared_score_operations)>0,'preservation test contains real synthetic receipts');
create temporary table publication_before as select
 (select jsonb_agg(to_jsonb(m) order by m.id) from public.matches m) matches,
 (select jsonb_agg(to_jsonb(s) order by s.id) from public.score_entries s) scores,
 (select jsonb_agg(to_jsonb(o) order by o.operation_id) from public.shared_score_operations o) receipts,
 (select p.proacl::text from pg_proc p where p.oid='public.publish_shared_match_owner(jsonb,text,text)'::regprocedure) acl,
 (select jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
    and p.proname in ('submit_shared_score_operations','latch_shared_scores_closed','protect_completed_shared_scores','shared_score_same_value','broadcast_shared_score_change')) delivery;

select set_config('dye.staging_rpc_project','darbakmabpbkikisadop',false);
select set_config('dye.shared_rpc_review_authorized','reviewed-publication-fix',false);
\ir ../../proposals/shared-score-rpc-v31.0.77/publication-fix-review.sql

select public.review_assert((select jsonb_agg(to_jsonb(m) order by m.id) from public.matches m)=(select matches from publication_before),'correction changes no existing match or frozen metadata');
select public.review_assert((select jsonb_agg(to_jsonb(s) order by s.id) from public.score_entries s)=(select scores from publication_before),'correction preserves every score');
select public.review_assert((select jsonb_agg(to_jsonb(o) order by o.operation_id) from public.shared_score_operations o)=(select receipts from publication_before),'correction preserves every receipt');
select public.review_assert((select p.proacl::text from pg_proc p where p.oid='public.publish_shared_match_owner(jsonb,text,text)'::regprocedure)=(select acl from publication_before),'publication ACL remains unchanged');
select public.review_assert((select jsonb_agg(jsonb_build_object('oid',p.oid,'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text) order by p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
 and p.proname in ('submit_shared_score_operations','latch_shared_scores_closed','protect_completed_shared_scores','shared_score_same_value','broadcast_shared_score_change'))=(select delivery from publication_before),'all five delivery functions remain identical');

set role authenticated;
select public.review_assert(public.publish_shared_match_owner(public.review_publication_payload('DYE-900001'),'publication-host','Host')='DYE-900001','fresh owner publication succeeds without delivery fields in client JSON');
select public.review_assert((select shared_revision=0 and not shared_scores_closed from public.matches where id='DYE-900001'),'new active match has server defaults zero and open');
select public.review_assert(exists(select 1 from public.match_memberships where match_id='DYE-900001' and user_id=auth.uid() and role='organizer' and status='active'),'new owner membership is active');
select public.publish_shared_match_owner(public.review_publication_payload('DYE-900002')||'{"shared_revision":999,"shared_scores_closed":true}'::jsonb,'publication-host','Host');
select public.review_assert((select shared_revision=0 and not shared_scores_closed from public.matches where id='DYE-900002'),'client cannot supply initial server revision or closure');
reset role;
update public.matches set shared_revision=17 where id='DYE-900001';
update public.matches set shared_revision=23,status='complete',completed_at=now(),course_snapshot='{"sharedMatchMeta":{"roundRecordSnapshot":{"isFrozen":true,"audit":"retained"}}}' where id='DYE-900002';
create temporary table publication_existing as select id,to_jsonb(m) as row from public.matches m where id in ('DYE-900001','DYE-900002');
set role authenticated;
select public.publish_shared_match_owner(public.review_publication_payload('DYE-900001')||'{"shared_revision":0,"name":"must not overwrite"}'::jsonb,'publication-host','Host');
select public.publish_shared_match_owner(public.review_publication_payload('DYE-900002')||'{"shared_revision":0,"shared_scores_closed":false}'::jsonb,'publication-host','Host');
reset role;
select public.review_assert((select to_jsonb(m) from public.matches m where id='DYE-900001')=(select row from publication_existing where id='DYE-900001'),'active republish preserves every field including revision 17');
select public.review_assert((select to_jsonb(m) from public.matches m where id='DYE-900002')=(select row from publication_existing where id='DYE-900002'),'closed republish preserves every field including frozen metadata and revision 23');
set role authenticated;
select public.publish_shared_match_owner(public.review_publication_payload('DYE-900003')||'{"status":"complete","completed_at":"2026-10-25T20:00:00Z"}'::jsonb,'publication-host','Host');
select public.review_assert((select shared_revision=0 and shared_scores_closed from public.matches where id='DYE-900003'),'new completed publication still triggers closure');
select public.review_error($q$select public.publish_shared_match_owner(public.review_publication_payload('DYE-900004'),'','Host')$q$,'22023','missing device remains rejected');
select public.review_error($q$select public.publish_shared_match_owner(public.review_publication_payload('invalid'),'publication-host','Host')$q$,'22023','invalid code remains rejected');
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000002',false);
select public.review_error($q$select public.publish_shared_match_owner('{"id":"DYE-900001"}','wrong-owner','Other')$q$,'42501','another account cannot take over existing match');
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000004',false);
select public.review_error($q$select public.publish_shared_match_owner('{"id":"DYE-900005"}','guest','Guest')$q$,'42501','anonymous account cannot publish');
select set_config('request.jwt.claim.sub','',false);
select public.review_error($q$select public.publish_shared_match_owner('{"id":"DYE-900005"}','guest','Guest')$q$,'42501','signed-out caller cannot publish');
reset role;
select public.review_assert((select shared_scores_closed and shared_revision=23 from public.matches where id='DYE-900002'),'negative authority checks leave completed round unchanged');
