-- Rollback guidance for v31.0.01. Back up first. Existing score rows are retained.
begin;
drop trigger if exists broadcast_shared_score_change_after_write on public.score_entries;
drop function if exists public.broadcast_shared_score_change();
drop function if exists public.submit_shared_score_operations(text, text, jsonb);
drop table if exists public.shared_score_operations;
-- Keep public.matches.shared_revision because dropping it is unnecessary and destructive.
commit;
