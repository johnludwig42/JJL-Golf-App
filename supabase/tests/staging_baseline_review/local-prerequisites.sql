-- SYNTHETIC LOCAL PREREQUISITES ONLY. Never execute on Supabase.
DO $$ BEGIN
 IF current_database() NOT IN ('dye_staging_baseline_review_20261025','dye_staging_baseline_review_20261025_absent','dye_staging_baseline_review_20261025_present_v2')
 OR inet_server_addr()<>'127.0.0.1'::inet OR current_setting('port')<>'55477' THEN
  RAISE EXCEPTION 'Wrong disposable local database';
 END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, is_anonymous boolean, raw_app_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT null::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '{}'::jsonb$$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;
 END IF;
END $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
-- Deliberately broad defaults prove the installer normalizes NEW object grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated,service_role;
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql
 AS $$BEGIN RETURN; END$$;
COMMENT ON FUNCTION public.rls_auto_enable() IS 'synthetic-provider-helper-preserve';
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF current_database()='dye_staging_baseline_review_20261025_absent' THEN
  DROP FUNCTION public.rls_auto_enable();
 END IF;
END $$;
