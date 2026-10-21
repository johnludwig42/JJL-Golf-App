-- REVIEW ONLY. Restore the same RPC after the reviewed non-destructive rollback.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $guard$ begin
 if current_setting('dye.shared_rpc_review_authorized', true) is distinct from 'reviewed-restore' then
  raise exception 'Review-only proposal: restoration requires separate approval';
 end if;
 if current_user <> 'postgres' or to_regclass('public.shared_score_operations') is null
  or to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is not null
  or to_regprocedure('public.broadcast_shared_score_change()') is null
  or to_regprocedure('public.protect_completed_shared_scores()') is null
  or to_regprocedure('public.latch_shared_scores_closed()') is null then
  raise exception 'Expected the reviewed retained-ledger rollback state; stop and inspect';
 end if;
end $guard$;
create or replace function public.submit_shared_score_operations(
  p_match_id text,
  p_device_id text,
  p_operations jsonb
) returns table(operation_id uuid, match_revision bigint, accepted_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_match_id text := upper(trim(coalesce(p_match_id, '')));
  v_device_id text := left(trim(coalesce(p_device_id, '')), 100);
  v_operation jsonb;
  v_operation_id uuid;
  v_entry public.score_entries;
  v_existing public.shared_score_operations;
  v_revision bigint;
  v_role text;
  v_assignment jsonb;
  v_participant text;
  v_payload_hash text;
  v_match public.matches;
  v_committed public.score_entries;
begin
  if v_user is null then raise exception 'Authentication session required' using errcode = '42501'; end if;
  if v_device_id = '' then raise exception 'Device attribution required' using errcode = '22023'; end if;
  if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) < 1 or jsonb_array_length(p_operations) > 64 then
    raise exception 'Score operation batch must contain 1 through 64 operations' using errcode = '22023';
  end if;
  select mm.role, mm.id into v_role, v_participant from public.match_memberships mm
  where mm.match_id = v_match_id and mm.user_id = v_user and mm.status = 'active'
    and mm.id = v_match_id || ':member:' || v_user::text || ':' || v_device_id
  limit 1;
  if v_role is null then raise exception 'Active Device membership required' using errcode = '42501'; end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_operation_id := nullif(v_operation ->> 'operation_id', '')::uuid;
    v_payload_hash := encode(extensions.digest((v_operation -> 'score_entry')::text, 'sha256'), 'hex');
    select * into v_existing from public.shared_score_operations s where s.operation_id = v_operation_id;
    if found then
      if v_existing.match_id <> v_match_id or v_existing.actor_user_id <> v_user
         or v_existing.device_id <> v_device_id or v_existing.payload_hash <> v_payload_hash then
        raise exception 'Operation attribution mismatch' using errcode = '42501';
      end if;
      operation_id := v_existing.operation_id;
      match_revision := v_existing.match_revision;
      accepted_at := v_existing.accepted_at;
      return next;
      continue;
    end if;

    v_entry := jsonb_populate_record(null::public.score_entries, v_operation -> 'score_entry');
    if v_entry.match_id is distinct from v_match_id or nullif(v_entry.id, '') is null
       or nullif(v_entry.match_player_id, '') is null or v_entry.hole_number < 1 or v_entry.hole_number > 18 then
      raise exception 'Invalid score operation' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.score_entries se where se.id = v_entry.id
        and (se.match_id is distinct from v_match_id
          or se.match_player_id is distinct from v_entry.match_player_id
          or se.hole_number is distinct from v_entry.hole_number)
    ) then
      raise exception 'Score entry identity collision' using errcode = '23505';
    end if;
    select to_jsonb(mp) -> 'handicap_snapshot' into v_assignment
      from public.match_players mp where mp.id = v_entry.match_player_id and mp.match_id = v_match_id;
    if not found then raise exception 'Match player not found' using errcode = 'P0002'; end if;
    if v_role <> 'organizer'
       and coalesce(v_assignment ->> 'assignedDeviceId', '') <> v_device_id
       and coalesce(v_assignment ->> 'assignedParticipantId', '') <> coalesce(v_participant, '') then
      raise exception 'Scoring assignment required' using errcode = '42501';
    end if;

    select * into v_match from public.matches where id=v_match_id for update;
    if v_match.shared_scores_closed or v_match.status='complete' or v_match.completed_at is not null
      or v_match.course_snapshot #> '{sharedMatchMeta,roundRecordSnapshot,isFrozen}' = 'true'::jsonb then
      select * into v_committed from public.score_entries where id=v_entry.id;
      if found and public.shared_score_same_value(v_committed,v_entry) then
        -- No score, revision, timestamp or receipt mutation. A new operation ID
        -- on an identical closed row is acknowledged as a value no-op, not as
        -- a newly ledgered write. Existing receipt replays returned above.
        operation_id := v_operation_id;
        match_revision := v_match.shared_revision;
        accepted_at := now();
        return next;
        continue;
      end if;
      raise exception 'HOST_COMPLETED_WITH_LOCAL_SCORES: match closed; preserve scores for host review'
        using errcode='P7701';
    end if;

    update public.matches set shared_revision = shared_revision + 1, updated_at = now()
      where id = v_match_id returning shared_revision into v_revision;
    if v_revision is null then raise exception 'Shared Match not found' using errcode = 'P0002'; end if;
    v_entry.updated_by := v_user;
    v_entry.updated_at := now();
    insert into public.score_entries select (v_entry).*
      on conflict (id) do update set
        gross = excluded.gross, putts = excluded.putts, fairway = excluded.fairway,
        green = excluded.green, up_and_down = excluded.up_and_down, sandy = excluded.sandy,
        entry_status = excluded.entry_status, updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
    insert into public.shared_score_operations(
      operation_id, match_id, score_entry_id, actor_user_id, device_id,
      participant_id, client_revision, match_revision, payload_hash, queued_at
    ) values (
      v_operation_id, v_match_id, v_entry.id, v_user, v_device_id,
      v_participant, greatest(1, (v_operation ->> 'client_revision')::bigint), v_revision,
      v_payload_hash,
      nullif(v_operation ->> 'queued_at', '')::timestamptz
    ) returning shared_score_operations.operation_id,
      shared_score_operations.match_revision, shared_score_operations.accepted_at
      into operation_id, match_revision, accepted_at;
    return next;
  end loop;
end $$;
revoke all on function public.submit_shared_score_operations(text, text, jsonb) from public, anon;
grant execute on function public.submit_shared_score_operations(text, text, jsonb) to authenticated;

create trigger broadcast_shared_score_change_after_write
after insert or update on public.score_entries for each row
execute function public.broadcast_shared_score_change();
notify pgrst, 'reload schema';
commit;
