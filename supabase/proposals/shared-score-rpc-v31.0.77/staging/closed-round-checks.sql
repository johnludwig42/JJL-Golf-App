-- STAGING ONLY: synthetic DYE-119214. No changes commit; stop on any failure.
-- Exercises authenticated SQL roles, not HTTP token validation or Realtime.
\set ON_ERROR_STOP on
\if :{?direct_only}
\else
\set direct_only false
\endif
begin;
set local dye.staging_direct_checks = :'direct_only';
set local statement_timeout = '30s';
set local lock_timeout = '5s';
create temporary table closure_check_results(test text, result text) on commit drop;
do $checks$
declare
  code constant text := 'DYE-119214';
  actor uuid; device text; score public.score_entries; receipt public.shared_score_operations;
  payload jsonb; op jsonb; batch jsonb; cmd text; expected text; actual text;
  i int; got int; before_scores jsonb; before_receipts jsonb; before_match jsonb;
  labels text[] := array['RPC identical value after closure','RPC late gross change',
    'RPC reused receipt ID with changed payload','RPC wrong device','RPC missing session',
    'RPC oversized batch','direct identical value','direct late gross change',
    'direct late statistics change','direct delete'];
begin
  if current_user <> 'postgres' then raise exception 'Expected operator postgres'; end if;
  if current_setting('dye.staging_direct_checks')::boolean
    and to_regprocedure('public.submit_shared_score_operations(text,text,jsonb)') is not null then
    raise exception 'Expected staging RPC absent for rolled-back direct checks';
  end if;
  select to_jsonb(m) into before_match from public.matches m where id=code;
  if before_match is null or before_match->>'status'<>'complete'
    or before_match->>'shared_scores_closed'<>'true' then
    raise exception 'Expected completed closed synthetic round; stop';
  end if;
  select r.* into receipt from public.shared_score_operations r
    join public.match_memberships mm on mm.id=r.participant_id
    where r.match_id=code and mm.role='organizer' and mm.status='active'
    order by r.match_revision limit 1;
  if receipt.operation_id is null then raise exception 'No host receipt fixture'; end if;
  actor:=receipt.actor_user_id; device:=receipt.device_id;
  select * into strict score from public.score_entries where id=receipt.score_entry_id;
  select jsonb_agg(to_jsonb(s) order by s.id) into before_scores from public.score_entries s where match_id=code;
  select jsonb_agg(to_jsonb(r) order by r.operation_id) into before_receipts from public.shared_score_operations r where match_id=code;
  payload:=to_jsonb(score);
  for i in (case when current_setting('dye.staging_direct_checks')::boolean then 7 else 1 end)..10 loop
    op:=jsonb_build_object('operation_id',gen_random_uuid(),'client_revision',1,'score_entry',payload);
    expected:=case when i in(1,7) then 'OK' when i in(2,8,9,10) then 'P7701'
      when i=6 then '22023' else '42501' end;
    if i=2 then op:=jsonb_set(op,'{score_entry,gross}',to_jsonb(score.gross+1)); end if;
    if i=3 then op:=op||jsonb_build_object('operation_id',receipt.operation_id);
      op:=jsonb_set(op,'{score_entry,gross}',to_jsonb(score.gross+1)); end if;
    batch:=jsonb_build_array(op);
    if i=6 then select jsonb_agg(op) into batch from generate_series(1,65); end if;
    perform set_config('request.jwt.claim.sub',case when i=5 then '' else actor::text end,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',case when i=5 then null else actor::text end,'role','authenticated')::text,true);
    if i<=6 then
      cmd:=format('select count(*) from public.submit_shared_score_operations(%L,%L,%L::jsonb)',code,
        case when i=4 then 'unregistered-test-device' else device end,batch::text);
    elsif i=7 then cmd:=format('update public.score_entries set gross=gross where id=%L',score.id);
    elsif i=8 then cmd:=format('update public.score_entries set gross=gross+1 where id=%L',score.id);
    elsif i=9 then cmd:=format('update public.score_entries set putts=coalesce(putts,0)+1 where id=%L',score.id);
    else cmd:=format('delete from public.score_entries where id=%L',score.id); end if;
    actual:='OK';
    execute 'set local role authenticated';
    begin
      if i<=6 then execute cmd into got;
      else execute cmd; end if;
    exception when others then get stacked diagnostics actual=returned_sqlstate;
    end;
    execute 'reset role';
    if actual<>expected then raise exception 'FAIL %: expected %, got %',labels[i],expected,actual; end if;
    if i=1 and got<>1 then raise exception 'Identical value was not acknowledged'; end if;
    insert into closure_check_results values(labels[i],'PASS: '||actual);
  end loop;
  if before_match is distinct from (select to_jsonb(m) from public.matches m where id=code)
    or before_scores is distinct from (select jsonb_agg(to_jsonb(s) order by s.id) from public.score_entries s where match_id=code)
    or before_receipts is distinct from (select jsonb_agg(to_jsonb(r) order by r.operation_id) from public.shared_score_operations r where match_id=code) then
    raise exception 'FAIL: match, scores or receipts changed';
  end if;
  insert into closure_check_results values('All match facts, scores and receipts unchanged','PASS');
end $checks$;
select * from closure_check_results;
rollback;
