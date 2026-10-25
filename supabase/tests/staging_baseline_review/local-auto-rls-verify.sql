-- Local-only test: uses the already-installed disposable absent-helper baseline.
DO $$ BEGIN
 IF current_database()<>'dye_staging_baseline_review_20261025_absent'
 OR inet_server_addr()<>'127.0.0.1'::inet OR current_setting('port')<>'55477' THEN
  RAISE EXCEPTION 'Wrong disposable local database';
 END IF;
END $$;
BEGIN;
CREATE TABLE public.review_auto_rls_probe(id integer);
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.review_auto_rls_probe'::regclass) THEN
  RAISE EXCEPTION 'DDL trigger did not enable RLS';
 END IF;
END $$;
CREATE TABLE public.review_auto_rls_as_probe AS SELECT 1 AS id;
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.review_auto_rls_as_probe'::regclass) THEN
  RAISE EXCEPTION 'CREATE TABLE AS did not enable RLS';
 END IF;
END $$;
SELECT 1 AS id INTO public.review_auto_rls_select_probe;
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.review_auto_rls_select_probe'::regclass) THEN
  RAISE EXCEPTION 'SELECT INTO did not enable RLS';
 END IF;
END $$;
ROLLBACK;
DO $$ BEGIN
 IF to_regclass('public.review_auto_rls_probe') IS NOT NULL
 OR (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>17 THEN
  RAISE EXCEPTION 'Probe cleanup/application inventory mismatch';
 END IF;
END $$;
