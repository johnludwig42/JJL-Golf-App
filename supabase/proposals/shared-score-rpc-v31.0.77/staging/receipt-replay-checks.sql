-- SUPERSEDED: historical payload reconstruction failed at hosted revision 1.
-- Use known-payload-replay-checks.sql instead; do not rerun this old script.
-- Synthetic staging round only. No permanent writes; no schema changes.
-- SQL-role verification, not HTTP/session-refresh or private Realtime evidence.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
create temporary table replay_check_results(test text, result text) on commit drop;
do $checks$
declare
  code constant text := 'DYE-119214';
  r public.shared_score_operations; s public.score_entries;
  payload jsonb; ops jsonb; answer record; actual text;
  before_match jsonb; before_scores jsonb; before_receipts jsonb;
  replayed int:=0; total int; got int;
begin
  if current_user<>'postgres' then raise exception 'Expected operator postgres'; end if;
  select to_jsonb(m) into before_match from public.matches m where id=code;
  if before_match is null or before_match->>'status'<>'complete'
    or before_match->>'shared_scores_closed'<>'true' then
    raise exception 'Expected completed closed synthetic round';
  end if;
  select jsonb_agg(to_jsonb(x) order by x.id) into before_scores from public.score_entries x where match_id=code;
  select jsonb_agg(to_jsonb(x) order by x.operation_id), count(*) into before_receipts,total
    from public.shared_score_operations x where match_id=code;
  if total=0 then raise exception 'No receipts to replay'; end if;
  for r in select * from public.shared_score_operations where match_id=code order by match_revision loop
    select * into strict s from public.score_entries where id=r.score_entry_id;
    -- Reconstruct the v31.0.81 client wire shape, then REQUIRE its saved hash.
    -- Never treat an identical-current-value no-op as proof of original replay.
    payload:=to_jsonb(s)||jsonb_build_object('updated_by',null,
      'updated_at',to_char(r.queued_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    if encode(extensions.digest(payload::text,'sha256'),'hex')<>r.payload_hash then
      raise exception 'Original payload cannot be reconstructed for revision %. Stop; do not substitute a new operation ID.',r.match_revision;
    end if;
    ops:=jsonb_build_array(jsonb_build_object('operation_id',r.operation_id,
      'client_revision',r.client_revision,'participant_id',r.participant_id,
      'queued_at',r.queued_at,'score_entry',payload));
    perform set_config('request.jwt.claim.sub',r.actor_user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',r.actor_user_id::text,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    got:=0;
    for answer in select * from public.submit_shared_score_operations(code,r.device_id,ops) loop
      got:=got+1;
      if answer.operation_id is distinct from r.operation_id
        or answer.match_revision is distinct from r.match_revision
        or answer.accepted_at is distinct from r.accepted_at then
        raise exception 'Replayed receipt differs from original revision %',r.match_revision;
      end if;
    end loop;
    execute 'reset role';
    if got<>1 then raise exception 'Expected exactly one replay acknowledgement'; end if;
    replayed:=replayed+1;
  end loop;
  if before_match is distinct from (select to_jsonb(m) from public.matches m where id=code)
    or before_scores is distinct from (select jsonb_agg(to_jsonb(x) order by x.id) from public.score_entries x where match_id=code)
    or before_receipts is distinct from (select jsonb_agg(to_jsonb(x) order by x.operation_id) from public.shared_score_operations x where match_id=code) then
    raise exception 'Replay changed match facts, scores or receipts';
  end if;
  insert into replay_check_results values
    ('Hash-verified original payloads replayed',replayed::text||' / '||total::text),
    ('Original operation ID, revision and acceptance timestamp returned','PASS'),
    ('Match facts, scores and receipts unchanged','PASS');
end $checks$;
select * from replay_check_results;
rollback;
