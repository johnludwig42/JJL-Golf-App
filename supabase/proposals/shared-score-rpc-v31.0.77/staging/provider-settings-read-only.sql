-- READ ONLY. Run in each project's SQL Editor to compare provider-owned settings.
-- No table rows, passwords, access tokens or Auth user records are selected.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
 'captured_at',current_timestamp,
 'public_schema',(SELECT jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'privileges',n.nspacl::text)
   FROM pg_namespace n WHERE n.nspname='public'),
 'public_default_privileges',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'role',pg_get_userbyid(d.defaclrole),'object_type',d.defaclobjtype,'privileges',d.defaclacl::text)
   ORDER BY d.defaclrole,d.defaclobjtype),'[]'::jsonb)
   FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='public'),
 'rls_auto_enable',(SELECT jsonb_build_object('owner',pg_get_userbyid(p.proowner),
   'privileges',p.proacl::text,'definition',pg_get_functiondef(p.oid))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rls_auto_enable' AND p.pronargs=0),
 'public_event_triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,'tags',e.evttags,
   'function',e.evtfoid::regprocedure::text)),'[]'::jsonb)
   FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid
   JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
)) AS provider_settings;
COMMIT;
