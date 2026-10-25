-- STAGING ONLY REVIEW: reproduce the supplied production automatic-RLS settings.
-- No application data, table grants or default privileges are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = '';
DO $guard$ BEGIN
 IF current_setting('dye.staging_settings_authorized',true) IS DISTINCT FROM 'darbakmabpbkikisadop' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'Use the pinned staging settings wrapper';
 END IF;
 IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_event_trigger WHERE evtname='ensure_rls') THEN
  RAISE EXCEPTION 'Expected absent helper/trigger; stop rather than overwrite';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p'))<>17
 OR to_regclass('public.shared_score_operations') IS NOT NULL THEN
  RAISE EXCEPTION 'Expected the verified pre-RPC application baseline';
 END IF;
END $guard$;
CREATE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO PUBLIC,postgres,anon,authenticated,service_role;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
 WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
 EXECUTE FUNCTION public.rls_auto_enable();
COMMIT;
