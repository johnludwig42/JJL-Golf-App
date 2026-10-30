-- STAGING ONLY. Transient synthetic clone, all changes rolled back.
-- SQL role tests; does not validate HTTP JWTs, token refresh or private Realtime.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
create temporary table known_replay_results(test text, result text) on commit drop;
do $checks$
declare
  source_code constant text := 'DYE-119214';
  test_code constant text := 'DYE-980079';
  source_match public.matches; seed public.shared_score_operations;
  source_score public.score_entries; team public.match_teams;
  player public.match_players; member public.match_memberships;
  payload jsonb; corrected jsonb; first_ops jsonb; second_ops jsonb;
  first_id uuid := gen_random_uuid(); second_id uuid := gen_random_uuid();
  first_receipt record; second_receipt record; replay record;
  before_match jsonb; before_scores jsonb; before_receipts jsonb;
  new_team text; new_player text; new_score text; got int; err text;
begin
  if current_user<>'postgres' then raise exception 'Expected postgres operator'; end if;
  if exists(select 1 from public.matches where id=test_code) then
    raise exception 'Transient test code already exists; stop without overwriting';
  end if;
  select * into strict source_match from public.matches where id=source_code;
  if not source_match.shared_scores_closed or source_match.status<>'complete' then
    raise exception 'Expected original completed synthetic round';
  end if;
  before_match:=to_jsonb(source_match);
  select jsonb_agg(to_jsonb(x) order by id) into before_scores from public.score_entries x where match_id=source_code;
  select jsonb_agg(to_jsonb(x) order by operation_id) into before_receipts from public.shared_score_operations x where match_id=source_code;
  select r.* into seed from public.shared_score_operations r
    join public.match_memberships mm on mm.id=r.participant_id
    where r.match_id=source_code and mm.role='organizer' and mm.status='active'
    order by r.match_revision limit 1;
  if seed.operation_id is null then raise exception 'Missing host fixture'; end if;
  select * into strict source_score from public.score_entries where id=seed.score_entry_id;
  select * into strict team from public.match_teams where id=source_score.team_id;
  select * into strict player from public.match_players where id=source_score.match_player_id;
  select * into strict member from public.match_memberships where id=seed.participant_id;
  new_team:=test_code||':team:'||source_score.team_number;
  new_player:=test_code||':player:'||source_score.player_id;
  new_score:=new_player||':hole:1';
  -- Clone only synthetic fixture context; never reopen or alter the original.
  source_match.id:=test_code; source_match.status:='active'; source_match.completed_at:=null;
  source_match.shared_revision:=0; source_match.shared_scores_closed:=false;
  source_match.course_snapshot:=source_match.course_snapshot #- '{sharedMatchMeta,roundRecordSnapshot}';
  insert into public.matches select (source_match).*;
  team.id:=new_team; team.match_id:=test_code;
  insert into public.match_teams select (team).*;
  player.id:=new_player; player.match_id:=test_code; player.team_id:=new_team;
  insert into public.match_players select (player).*;
  member.id:=test_code||':member:'||seed.actor_user_id::text||':'||seed.device_id;
  member.match_id:=test_code;
  insert into public.match_memberships select (member).*;
  source_score.id:=new_score; source_score.match_id:=test_code;
  source_score.team_id:=new_team; source_score.match_player_id:=new_player;
  source_score.hole_number:=1;
  payload:=to_jsonb(source_score)||jsonb_build_object('updated_at','2026-10-29T12:00:00.000Z','updated_by',null);
  corrected:=payload||jsonb_build_object('gross',source_score.gross+1);
  first_ops:=jsonb_build_array(jsonb_build_object('operation_id',first_id,
    'client_revision',1,'participant_id',member.id,'score_entry',payload));
  second_ops:=jsonb_build_array(jsonb_build_object('operation_id',second_id,
    'client_revision',2,'participant_id',member.id,'score_entry',corrected));
  perform set_config('request.jwt.claim.sub',seed.actor_user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',seed.actor_user_id::text,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select * into strict first_receipt from public.submit_shared_score_operations(test_code,seed.device_id,first_ops);
  select * into strict second_receipt from public.submit_shared_score_operations(test_code,seed.device_id,second_ops);
  if first_receipt.match_revision<>1 or second_receipt.match_revision<>2 then
    raise exception 'Expected two committed-in-transaction score revisions';
  end if;
  select * into strict replay from public.submit_shared_score_operations(test_code,seed.device_id,first_ops);
  if to_jsonb(replay)<>to_jsonb(first_receipt) then raise exception 'Original receipt did not replay'; end if;
  if (select gross from public.score_entries where id=new_score)<>source_score.gross+1 then
    raise exception 'Old replay overwrote later correction';
  end if;
  execute 'reset role';
  insert into known_replay_results values('Original receipt replayed after correction; correction retained','PASS');
  update public.matches set status='complete',completed_at=now() where id=test_code;
  execute 'set local role authenticated';
  select * into strict replay from public.submit_shared_score_operations(test_code,seed.device_id,first_ops);
  if to_jsonb(replay)<>to_jsonb(first_receipt) then raise exception 'Closed original receipt differs'; end if;
  select * into strict replay from public.submit_shared_score_operations(test_code,seed.device_id,second_ops);
  if to_jsonb(replay)<>to_jsonb(second_receipt) then raise exception 'Closed correction receipt differs'; end if;
  err:='NO_ERROR';
  begin
    perform * from public.submit_shared_score_operations(test_code,seed.device_id,
      jsonb_set(first_ops,'{0,score_entry,gross}',to_jsonb(source_score.gross+2)));
  exception when others then get stacked diagnostics err=returned_sqlstate;
  end;
  if err<>'42501' then raise exception 'Changed reused ID expected 42501, got %',err; end if;
  execute 'reset role';
  insert into known_replay_results values('Both exact receipts replayed after closure','PASS'),
    ('Changed payload with reused operation ID denied','PASS');
  if (select gross from public.score_entries where id=new_score)<>source_score.gross+1
    or (select shared_revision from public.matches where id=test_code)<>2
    or (select count(*) from public.shared_score_operations where match_id=test_code)<>2 then
    raise exception 'Replay changed correction, revision or receipt count';
  end if;
  if exists(select 1 from public.shared_score_operations r where r.match_id=test_code
    and r.payload_hash<>encode(extensions.digest((case when r.operation_id=first_id then payload else corrected end)::text,'sha256'),'hex')) then
    raise exception 'Stored hashes differ from retained exact payloads';
  end if;
  insert into known_replay_results values('Exact payload hashes and two original receipts retained','PASS');
  if before_match is distinct from (select to_jsonb(m) from public.matches m where id=source_code)
    or before_scores is distinct from (select jsonb_agg(to_jsonb(x) order by id) from public.score_entries x where match_id=source_code)
    or before_receipts is distinct from (select jsonb_agg(to_jsonb(x) order by operation_id) from public.shared_score_operations x where match_id=source_code) then
    raise exception 'Original accepted fixture changed';
  end if;
  insert into known_replay_results values('Original accepted round, scores and receipts unchanged','PASS');
end $checks$;
select * from known_replay_results;
rollback;
select not exists(select 1 from public.matches where id='DYE-980079') as transient_round_removed;
