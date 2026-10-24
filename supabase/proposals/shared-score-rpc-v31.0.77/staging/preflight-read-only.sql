-- Run on the selected STAGING project after confirming its Dashboard reference.
-- Also usable read-only on production for comparison; it installs/changes nothing.
begin transaction read only;
select jsonb_pretty(jsonb_build_object(
  'kind','shared-match-staging-prerequisites',
  'captured_at',current_timestamp,
  'database',current_database(),
  'server_version',current_setting('server_version'),
  'operator_role',current_user,
  'digest_text_signature',to_regprocedure('extensions.digest(text,text)')::text,
  'broadcast_record_signature',to_regprocedure('realtime.broadcast_changes(text,text,text,text,text,record,record,text)')::text,
  'member_helper',to_regprocedure('public.shared_match_is_member(text)')::text,
  'owner_publication',to_regprocedure('public.publish_shared_match_owner(jsonb,text,text)')::text,
  'score_rpc',to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)')::text,
  'operation_ledger',to_regclass('public.shared_score_operations')::text,
  'delivery_function_definitions',(select coalesce(jsonb_agg(jsonb_build_object(
    'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
    'owner',pg_get_userbyid(p.proowner),'privileges',p.proacl::text,
    'definition',pg_get_functiondef(p.oid)) order by p.proname),'[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname in (
      'submit_shared_score_operations','broadcast_shared_score_change',
      'protect_completed_shared_scores','latch_shared_scores_closed','shared_score_same_value')),
  'delivery_columns',(select coalesce(jsonb_agg(column_name order by column_name),'[]'::jsonb)
    from information_schema.columns where table_schema='public' and table_name='matches'
    and column_name in ('shared_revision','shared_scores_closed')),
  'delivery_triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) order by t.tgname),'[]'::jsonb)
    from pg_trigger t where t.tgrelid in (to_regclass('public.matches'),to_regclass('public.score_entries'))
    and not t.tgisinternal and t.tgname in ('broadcast_shared_score_change_after_write','protect_completed_shared_scores_before_write','latch_shared_scores_closed_before_write')),
  'account_provisioning_trigger',(select coalesce(jsonb_agg(jsonb_build_object('enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true))),'[]'::jsonb)
    from pg_trigger t where t.tgrelid=to_regclass('auth.users') and t.tgname='provision_durable_account_after_auth_user' and not t.tgisinternal),
  'realtime_application_policies',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from pg_policies p
    where schemaname='realtime' and policyname='dye_shared_match_broadcast_select')
)) as staging_preflight;
commit;
