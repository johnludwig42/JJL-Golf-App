-- Local-only smoke assertions. These do not validate Supabase Auth or Realtime.
DO $$ BEGIN
 IF current_database() NOT IN ('dye_staging_baseline_review_20261025','dye_staging_baseline_review_20261025_absent','dye_staging_baseline_review_20261025_present_v2')
 OR inet_server_addr()<>'127.0.0.1'::inet OR current_setting('port')<>'55477' THEN
  RAISE EXCEPTION 'Wrong disposable local database';
 END IF;
 IF has_table_privilege('anon','public.matches','INSERT')
 OR has_table_privilege('authenticated','public.matches','DELETE')
 OR has_function_privilege('anon','public.publish_shared_match_owner(jsonb,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'Broad inherited grants were not normalized';
 END IF;
 IF NOT has_table_privilege('anon','public.courses','SELECT')
 OR NOT has_table_privilege('authenticated','public.matches','UPDATE') THEN
  RAISE EXCEPTION 'Expected deployed browser grants missing';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity)<>17 THEN
  RAISE EXCEPTION 'Expected all application tables protected by RLS';
 END IF;
 IF current_database()='dye_staging_baseline_review_20261025_absent' THEN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
   RAISE EXCEPTION 'Absent provider helper was introduced';
  END IF;
 ELSE
  IF obj_description('public.rls_auto_enable()'::regprocedure,'pg_proc') IS DISTINCT FROM 'synthetic-provider-helper-preserve'
  OR has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
  OR has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE')
  OR has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE') THEN
   RAISE EXCEPTION 'Provider helper definition or grants changed';
  END IF;
 END IF;
 IF to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') IS NOT NULL
 OR to_regclass('public.authoritative_rounds') IS NOT NULL THEN
  RAISE EXCEPTION 'Unapproved foundations were introduced';
 END IF;
END $$;
BEGIN;
INSERT INTO auth.users VALUES('80000000-0000-0000-0000-000000000001',false,'{"provider":"email"}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE account_id='80000000-0000-0000-0000-000000000001') THEN
  RAISE EXCEPTION 'Application provisioning trigger did not create account';
 END IF;
END $$;
ROLLBACK;
