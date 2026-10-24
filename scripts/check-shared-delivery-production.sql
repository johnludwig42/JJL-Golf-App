-- v31.0.77: READ-ONLY audit of all 13 repository migrations.
-- Original production audit: ueallqqmdyzwdlmoyxfo; also reusable on staging.
-- Confirm the intended project in Dashboard first. This SELECT does not choose it.
-- No golfer/account rows or credentials are selected.
-- One result row: download/export CSV and share the full result for comparison.
with relations as (
 select c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,pg_get_userbyid(c.relowner) as owner
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where (n.nspname='public' and c.relkind in ('r','p'))
    or (n.nspname='auth' and c.relname='users')
    or (n.nspname='realtime' and c.relname='messages')
), functions as (
 select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
   pg_get_function_result(p.oid) as result,p.prosecdef as security_definer,p.proconfig,
   p.proacl::text as privileges,pg_get_userbyid(p.proowner) as owner,
   case when n.nspname='public' then pg_get_functiondef(p.oid) else null end as definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and ((n.nspname='public' and p.proname in (
   'broadcast_shared_score_change',
   'course_library_can_write',
   'course_library_is_maintainer',
   'course_library_is_permanent_user',
   'create_authoritative_round',
   'create_my_claimed_golfer_identity',
   'is_round_member',
   'is_round_owner',
   'join_shared_match',
   'prevent_audit_mutation',
   'prevent_round_record_mutation',
   'provision_durable_account',
   'publish_course',
   'publish_course_draft_atomic',
   'publish_round_record_version',
   'publish_shared_match_owner',
   'revise_approved_course',
   'set_round_access',
   'shared_match_is_member',
   'shared_match_is_organizer',
   'stamp_shared_match_owner',
   'submit_shared_score_operations'
 )) or (n.nspname='realtime' and p.proname='broadcast_changes') or (p.proname='digest' and n.nspname in ('public','extensions','pg_catalog')))
)
select jsonb_pretty(jsonb_build_object(
 'audit_version','v31.0.77/all-13/read-only',
 'captured_at',current_timestamp,
 'tables',(select coalesce(jsonb_agg(to_jsonb(r)-'oid'),'[]'::jsonb) from relations r),
 'columns',(select coalesce(jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',udt_name,'max_length',character_maximum_length,'precision',numeric_precision,'scale',numeric_scale,'nullable',is_nullable,'default',column_default)),'[]'::jsonb) from information_schema.columns where table_schema='public'),
 'functions',(select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from functions f),
 'policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from pg_policies p where schemaname in ('public','realtime')),
 'constraints',(select coalesce(jsonb_agg(jsonb_build_object('schema',r.nspname,'table',r.relname,'name',c.conname,'definition',pg_get_constraintdef(c.oid,true))),'[]'::jsonb) from pg_constraint c join relations r on r.oid=c.conrelid),
 'indexes',(select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from pg_indexes i where schemaname='public'),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('schema',r.nspname,'table',r.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true))),'[]'::jsonb) from pg_trigger t join relations r on r.oid=t.tgrelid where not t.tgisinternal),
 'extensions',(select coalesce(jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname)),'[]'::jsonb) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto'),
 'migration_history',case
   when to_regclass('supabase_migrations.schema_migrations') is null then 'No migration ledger table'::text
   when has_table_privilege(current_user,to_regclass('supabase_migrations.schema_migrations'),'SELECT') then query_to_xml('select version::text from supabase_migrations.schema_migrations order by version',true,false,'')::text
   else 'Migration ledger is not readable'::text end
)) as schema_audit;
