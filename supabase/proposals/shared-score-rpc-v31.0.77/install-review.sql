-- REVIEW PROPOSAL ONLY: corrected v31.0.01 delivery contract. NOT APPROVED FOR PRODUCTION.
-- Guarded additive installation. Adds delivery metadata; preserves scores and frozen facts.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $guard$
begin
  if current_setting('dye.shared_rpc_review_authorized', true) is distinct from 'reviewed-install' then
    raise exception 'Review-only proposal: installation requires separate staging/production approval';
  end if;
  if current_user <> 'postgres' then raise exception 'Run reviewed installation as postgres'; end if;
  if to_regprocedure('extensions.digest(text,text)') is null
    or to_regprocedure('realtime.broadcast_changes(text,text,text,text,text,record,record,text)') is null
    or to_regprocedure('public.shared_match_is_member(text)') is null then
    raise exception 'Audited prerequisites differ; stop and re-audit';
  end if;
  if to_regclass('public.shared_score_operations') is not null
    or to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is not null
    or to_regprocedure('public.broadcast_shared_score_change()') is not null
    or to_regprocedure('public.protect_completed_shared_scores()') is not null
    or to_regprocedure('public.latch_shared_scores_closed()') is not null
    or to_regprocedure('public.shared_score_same_value(public.score_entries,public.score_entries)') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='matches' and column_name in ('shared_revision','shared_scores_closed'))
    or exists(select 1 from pg_trigger where tgrelid='public.score_entries'::regclass and tgname='broadcast_shared_score_change_after_write' and not tgisinternal)
    or exists(select 1 from pg_policies where schemaname='realtime' and policyname='dye_shared_match_broadcast_select') then
    raise exception 'Expected the audited absent delivery foundation; stop rather than overwrite partial/existing objects';
  end if;
end $guard$;

alter table public.matches add column if not exists shared_revision bigint not null default 0;

-- Completion is monotonic even if a legacy metadata upsert sends status=active.
alter table public.matches add column shared_scores_closed boolean not null default false;
update public.matches set shared_scores_closed=true
where status='complete' or completed_at is not null
  or course_snapshot #> '{sharedMatchMeta,roundRecordSnapshot,isFrozen}' = 'true'::jsonb;
create function public.latch_shared_scores_closed() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.shared_scores_closed := coalesce(new.shared_scores_closed,false)
    or (case when tg_op='UPDATE' then old.shared_scores_closed else false end)
    or new.status='complete' or new.completed_at is not null
    or coalesce(new.course_snapshot #> '{sharedMatchMeta,roundRecordSnapshot,isFrozen}' = 'true'::jsonb,false);
  return new;
end $$;
revoke all on function public.latch_shared_scores_closed() from public,anon,authenticated;
create trigger latch_shared_scores_closed_before_write before insert or update on public.matches
for each row execute function public.latch_shared_scores_closed();

create table if not exists public.shared_score_operations (
  operation_id uuid primary key,
  match_id text not null references public.matches(id) on delete cascade,
  score_entry_id text not null references public.score_entries(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  device_id text not null,
  participant_id text,
  client_revision bigint not null check (client_revision > 0),
  match_revision bigint not null check (match_revision > 0),
  payload_hash text not null,
  queued_at timestamptz,
  accepted_at timestamptz not null default now()
);
create index if not exists shared_score_operations_match_revision_idx
  on public.shared_score_operations(match_id, match_revision);
alter table public.shared_score_operations enable row level security;

drop policy if exists shared_score_operations_member_select on public.shared_score_operations;
create policy shared_score_operations_member_select on public.shared_score_operations
  for select to authenticated using (public.shared_match_is_member(match_id));
revoke all on public.shared_score_operations from public, anon, authenticated;
grant select on public.shared_score_operations to authenticated;

-- Included inside the guarded install transaction, never a standalone migration.
-- Only transport metadata is excluded; unknown future score fields stay protected.
create function public.shared_score_same_value(a public.score_entries, b public.score_entries)
returns boolean language sql immutable set search_path = '' as $$
  select (to_jsonb(a) - array['updated_at','updated_by'])
    = (to_jsonb(b) - array['updated_at','updated_by'])
$$;
revoke all on function public.shared_score_same_value(public.score_entries,public.score_entries) from public,anon,authenticated;

create function public.protect_completed_shared_scores() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_match public.matches;
  v_committed public.score_entries;
  v_closed boolean := false;
begin
  -- Serialize scoring with the UPDATE that closes/freezes the match. Check both
  -- parents on an identity move, so moving a closed row cannot evade the guard.
  for v_match in select m.* from public.matches m
    where m.id in (case when tg_op <> 'INSERT' then old.match_id end,
                   case when tg_op <> 'DELETE' then new.match_id end)
    order by m.id for update
  loop
    v_closed := v_closed or v_match.shared_scores_closed or v_match.status = 'complete' or v_match.completed_at is not null
      or v_match.course_snapshot #> '{sharedMatchMeta,roundRecordSnapshot,isFrozen}' = 'true'::jsonb;
  end loop;
  if not coalesce(v_closed,false) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if auth.uid() is not null and not public.shared_match_is_member(
    case when tg_op='DELETE' then old.match_id else new.match_id end) then
    -- RETURN NULL in a BEFORE INSERT precedes RLS WITH CHECK. A no-op must
    -- not turn an outsider's identical INSERT into an apparent acceptance.
    raise exception 'Active membership required' using errcode='42501';
  end if;
  if tg_op <> 'DELETE' then
    -- BEFORE INSERT also runs before ON CONFLICT: suppress an identical replay
    -- before it can update timestamps or fire a broadcast.
    select * into v_committed from public.score_entries s where s.id=new.id;
    if found and public.shared_score_same_value(v_committed,new) then return null; end if;
  end if;
  raise exception 'HOST_COMPLETED_WITH_LOCAL_SCORES: match closed; preserve scores for host review'
    using errcode='P7701';
end $$;
revoke all on function public.protect_completed_shared_scores() from public,anon,authenticated;
create trigger protect_completed_shared_scores_before_write
before insert or update or delete on public.score_entries for each row
execute function public.protect_completed_shared_scores();


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

-- Keep the notification metadata-only: adapt match_id to the installed RECORD signature.
-- Do not broadcast the complete score row. Clients pull authoritative rows.
create or replace function public.broadcast_shared_score_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_notice record;
begin
  select new.match_id as match_id into v_notice;
  perform realtime.broadcast_changes(
    'shared-match:' || new.match_id, tg_op, tg_op, tg_table_name, tg_table_schema,
    v_notice, null::record, tg_level
  );
  return null;
end $$;
revoke all on function public.broadcast_shared_score_change() from public, anon, authenticated;
drop trigger if exists broadcast_shared_score_change_after_write on public.score_entries;
create trigger broadcast_shared_score_change_after_write
after insert or update on public.score_entries for each row
execute function public.broadcast_shared_score_change();

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists dye_shared_match_broadcast_select on realtime.messages';
    execute $policy$
      create policy dye_shared_match_broadcast_select on realtime.messages
      for select to authenticated using (
        exists (
          select 1 from public.match_memberships mm
          where mm.match_id = replace(realtime.topic(), 'shared-match:', '')
            and mm.user_id = auth.uid() and mm.status = 'active'
        )
      )
    $policy$;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
