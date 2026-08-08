-- v30.3.92 beta Account activation. Additive and idempotent.
-- Do not apply to production without separate Product Owner approval.
begin;

create or replace function public.create_my_claimed_golfer_identity(
  p_display_name text,
  p_nickname text default null
) returns public.golfer_identities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := auth.uid();
  v_display_name text := regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  v_nickname text := nullif(regexp_replace(trim(coalesce(p_nickname, '')), '\s+', ' ', 'g'), '');
  v_identity public.golfer_identities;
begin
  if v_account_id is null then
    raise exception 'A durable authenticated Account is required.' using errcode = '42501';
  end if;
  if char_length(v_display_name) < 2 or char_length(v_display_name) > 120 then
    raise exception 'Full name must contain between 2 and 120 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_nickname, '')) > 80 then
    raise exception 'Nickname must contain 80 characters or fewer.' using errcode = '22023';
  end if;

  insert into public.accounts(account_id)
  select u.id
  from auth.users u
  where u.id = v_account_id
    and coalesce(u.is_anonymous, false) = false
    and coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'anonymous'
  on conflict (account_id) do nothing;

  if not exists (select 1 from public.accounts a where a.account_id = v_account_id) then
    raise exception 'A durable authenticated Account is required.' using errcode = '42501';
  end if;

  select g.* into v_identity
  from public.golfer_identities g
  where g.claimed_by_account_id = v_account_id;

  if v_identity.golfer_identity_id is null then
    insert into public.golfer_identities(
      claim_status,
      claimed_by_account_id,
      display_name,
      profile,
      created_by_account_id
    ) values (
      'claimed',
      v_account_id,
      v_display_name,
      jsonb_strip_nulls(jsonb_build_object('nickname', v_nickname)),
      v_account_id
    )
    returning * into v_identity;
  end if;

  insert into public.personal_golfer_library(account_id, golfer_identity_id)
  values (v_account_id, v_identity.golfer_identity_id)
  on conflict (account_id, golfer_identity_id) do nothing;

  return v_identity;
exception
  when unique_violation then
    select g.* into v_identity
    from public.golfer_identities g
    where g.claimed_by_account_id = v_account_id;
    if v_identity.golfer_identity_id is null then raise; end if;
    insert into public.personal_golfer_library(account_id, golfer_identity_id)
    values (v_account_id, v_identity.golfer_identity_id)
    on conflict (account_id, golfer_identity_id) do nothing;
    return v_identity;
end
$$;

revoke all on function public.create_my_claimed_golfer_identity(text, text) from public, anon;
grant execute on function public.create_my_claimed_golfer_identity(text, text) to authenticated;

comment on function public.create_my_claimed_golfer_identity(text, text) is
  'Explicitly creates the caller own permanent claimed Golfer Identity and library relationship. Never searches or merges by mutable attributes.';

commit;
