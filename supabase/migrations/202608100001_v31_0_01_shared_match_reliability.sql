-- The Dye Ledger v31.0.01: durable, idempotent Shared Match score delivery.
-- Additive/idempotent. Does not rewrite or delete existing matches or scores.
begin;

alter table public.matches add column if not exists shared_revision bigint not null default 0;

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
    v_payload_hash := encode(digest((v_operation -> 'score_entry')::text, 'sha256'), 'hex');
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

-- Broadcast is only a wake-up signal. Clients always pull authoritative rows.
create or replace function public.broadcast_shared_score_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'shared-match:' || new.match_id, tg_op, tg_op, tg_table_name, tg_table_schema,
    jsonb_build_object('match_id', new.match_id), null
  );
  return null;
end $$;
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

commit;
