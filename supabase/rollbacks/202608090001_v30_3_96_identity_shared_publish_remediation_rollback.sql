-- Data-preserving rollback for v30.3.96. Identity tables and any created
-- identities remain intact. This only disables the newly exposed RPC surfaces.
begin;
revoke all on function public.publish_shared_match_owner(jsonb, text, text)
  from public, anon, authenticated;
drop function if exists public.publish_shared_match_owner(jsonb, text, text);
revoke all on function public.create_my_claimed_golfer_identity(text, text)
  from public, anon, authenticated;
drop function if exists public.create_my_claimed_golfer_identity(text, text);
commit;
