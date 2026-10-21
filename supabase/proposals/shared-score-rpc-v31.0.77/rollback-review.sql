-- REVIEW ONLY. Requires a separately approved rollback. Keeps all data and revisions.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $guard$ begin
 if current_setting('dye.shared_rpc_review_authorized', true) is distinct from 'reviewed-rollback' then
  raise exception 'Review-only proposal: rollback requires separate approval';
 end if;
 if current_user <> 'postgres' then raise exception 'Run reviewed rollback as postgres'; end if;
end $guard$;
drop trigger if exists broadcast_shared_score_change_after_write on public.score_entries;
drop function if exists public.submit_shared_score_operations(text,text,jsonb);
-- Intentionally retain both completion triggers and the one-way closed flag.
-- RPC rollback must never reopen direct score delivery.
-- Keep receipt history, score rows, memberships, policies, shared_revision and
-- the corrected detached broadcast function. Do not run the historical rollback.
notify pgrst, 'reload schema';
commit;
