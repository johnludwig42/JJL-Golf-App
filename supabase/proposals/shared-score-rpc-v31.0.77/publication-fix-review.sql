-- STAGING ONLY. Owner-approved publication compatibility correction. No production approval.
-- Preserve existing function authority, signature, grants, owner and all delivery/closure objects.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $guard$
declare v_body text;
begin
  if current_user <> 'postgres' or current_setting('dye.staging_rpc_project',true) is distinct from 'darbakmabpbkikisadop'
    or current_setting('dye.shared_rpc_review_authorized',true) is distinct from 'reviewed-publication-fix' then
    raise exception 'Staging-only publication correction requires the guarded runner and approved target';
  end if;
  if to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is null
    or to_regprocedure('public.latch_shared_scores_closed()') is null
    or to_regclass('public.shared_score_operations') is null then
    raise exception 'Expected installed delivery foundation; stop and audit';
  end if;
  select md5(replace(p.prosrc,E'\r\n',E'\n')) into v_body from pg_proc p
    where p.oid=to_regprocedure('public.publish_shared_match_owner(jsonb,text,text)');
  if v_body is distinct from '1fbf9f729a18061a0d595807cf843f50' then
    raise exception 'Expected audited pre-correction publication body: stop and re-audit rather than replacing an unknown function';
  end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.publish_shared_match_owner(p_match jsonb, p_device_id text, p_device_label text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_match public.matches;
  v_existing_owner uuid;
  v_code text := upper(trim(coalesce(p_match ->> 'id', '')));
  v_device text := left(trim(coalesce(p_device_id, '')), 100);
begin
  if v_user is null then
    raise exception 'Authentication session required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = v_user
      and coalesce(u.is_anonymous, false) = false
      and coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'anonymous'
  ) then
    raise exception 'A durable authenticated Account is required' using errcode = '42501';
  end if;
  if v_code !~ '^DYE-[1-9][0-9]{5}$' and v_code !~ '^[A-Z0-9]{12}$' then
    raise exception 'Invalid Shared Match code' using errcode = '22023';
  end if;
  if v_device = '' then
    raise exception 'Device attribution required' using errcode = '22023';
  end if;
  select m.created_by into v_existing_owner from public.matches m where m.id = v_code;
  if found and v_existing_owner is distinct from v_user then
    raise exception 'Shared Match Owner authorization required' using errcode = '42501';
  end if;
  v_match := jsonb_populate_record(null::public.matches, p_match);
  v_match.id := v_code;
  v_match.created_by := v_user;
  -- Initialize server-owned delivery fields for INSERT; an existing row is never updated here.
  v_match.shared_revision := 0;
  v_match.shared_scores_closed := false;
  insert into public.matches select (v_match).*
  on conflict (id) do nothing;
  insert into public.match_memberships(
    id, match_id, user_id, role, status, joined_at, last_seen_at, device_label
  ) values (
    v_code || ':member:' || v_user::text || ':' || v_device,
    v_code, v_user, 'organizer', 'active', now(), now(),
    left(p_device_label, 500)
  ) on conflict (id) do update set
    status = 'active', last_seen_at = now(), device_label = excluded.device_label;
  return v_code;
end $function$;

do $guard$
declare v_body text;
begin
  if current_user <> 'postgres' or current_setting('dye.staging_rpc_project',true) is distinct from 'darbakmabpbkikisadop'
    or current_setting('dye.shared_rpc_review_authorized',true) is distinct from 'reviewed-publication-fix' then
    raise exception 'Staging-only publication correction requires the guarded runner and approved target';
  end if;
  if to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is null
    or to_regprocedure('public.latch_shared_scores_closed()') is null
    or to_regclass('public.shared_score_operations') is null then
    raise exception 'Expected installed delivery foundation; stop and audit';
  end if;
  select md5(replace(p.prosrc,E'\r\n',E'\n')) into v_body from pg_proc p
    where p.oid=to_regprocedure('public.publish_shared_match_owner(jsonb,text,text)');
  if v_body is distinct from '2a701ff34cbdd7605325975f27fac630' then
    raise exception 'Corrected publication body verification failed: stop and re-audit rather than replacing an unknown function';
  end if;
end $guard$;

notify pgrst, 'reload schema';
commit;
