-- v30.3.92 rollback removes only the onboarding RPC.
-- Account and Golfer Identity data deliberately remain preserved.
begin;

drop function if exists public.create_my_claimed_golfer_identity(text, text);

commit;
