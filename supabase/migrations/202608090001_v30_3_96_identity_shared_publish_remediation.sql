-- The Dye Ledger v30.3.96: repair the partially activated production Identity
-- foundation and make initial Shared Match publication server-authoritative.
-- Additive/idempotent. Does not upload, claim, rewrite, or delete local records.
begin;

create extension if not exists pgcrypto;

create table if not exists public.accounts (
  account_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.golfer_identities (
  golfer_identity_id uuid primary key default gen_random_uuid(),
  claim_status text not null default 'unclaimed' check (claim_status in ('claimed','unclaimed')),
  claimed_by_account_id uuid unique references public.accounts(account_id) on delete restrict,
  display_name text,
  email text,
  phone text,
  ghin text,
  profile jsonb not null default '{}'::jsonb,
  created_by_account_id uuid references public.accounts(account_id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((claim_status = 'claimed') = (claimed_by_account_id is not null))
);
comment on table public.golfer_identities is
  'Permanent identity; mutable profile attributes are never identity keys.';
create table if not exists public.personal_golfer_library (
  account_id uuid not null references public.accounts(account_id) on delete cascade,
  golfer_identity_id uuid not null references public.golfer_identities(golfer_identity_id) on delete restrict,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (account_id, golfer_identity_id)
);
create table if not exists public.account_providers (
  account_id uuid not null references public.accounts(account_id) on delete cascade,
  provider text not null,
  provider_subject_hash text not null,
  verified_at timestamptz not null,
  primary key (provider, provider_subject_hash),
  unique (account_id, provider)
);
create table if not exists public.devices (
  device_id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(account_id) on delete set null,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create or replace function public.provision_durable_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.is_anonymous, false) = false
     and coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'anonymous' then
    insert into public.accounts(account_id) values (new.id)
    on conflict (account_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.provision_durable_account() from public, anon, authenticated;
drop trigger if exists provision_durable_account_after_auth_user on auth.users;
create trigger provision_durable_account_after_auth_user after insert on auth.users
for each row execute function public.provision_durable_account();
insert into public.accounts(account_id)
select id from auth.users
where coalesce(is_anonymous, false) = false
  and coalesce(raw_app_meta_data ->> 'provider', '') <> 'anonymous'
on conflict (account_id) do nothing;

alter table public.accounts enable row level security;
alter table public.golfer_identities enable row level security;
alter table public.personal_golfer_library enable row level security;
alter table public.account_providers enable row level security;
alter table public.devices enable row level security;

drop policy if exists accounts_self_select on public.accounts;
create policy accounts_self_select on public.accounts for select to authenticated
using (account_id = auth.uid());
drop policy if exists accounts_self_insert on public.accounts;
create policy accounts_self_insert on public.accounts for insert to authenticated
with check (account_id = auth.uid());
drop policy if exists accounts_self_update on public.accounts;
create policy accounts_self_update on public.accounts for update to authenticated
using (account_id = auth.uid()) with check (account_id = auth.uid());
drop policy if exists golfer_library_visible on public.golfer_identities;
create policy golfer_library_visible on public.golfer_identities for select to authenticated using (
  claimed_by_account_id = auth.uid() or exists (
    select 1 from public.personal_golfer_library l
    where l.account_id = auth.uid()
      and l.golfer_identity_id = golfer_identities.golfer_identity_id
  )
);
drop policy if exists golfer_unclaimed_insert on public.golfer_identities;
create policy golfer_unclaimed_insert on public.golfer_identities for insert to authenticated
with check (claim_status = 'unclaimed' and claimed_by_account_id is null
  and created_by_account_id = auth.uid());
drop policy if exists personal_library_owner_all on public.personal_golfer_library;
create policy personal_library_owner_all on public.personal_golfer_library for all to authenticated
using (account_id = auth.uid()) with check (account_id = auth.uid());
drop policy if exists account_providers_owner_select on public.account_providers;
create policy account_providers_owner_select on public.account_providers for select to authenticated
using (account_id = auth.uid());
drop policy if exists devices_owner_all on public.devices;
create policy devices_owner_all on public.devices for all to authenticated
using (account_id = auth.uid()) with check (account_id = auth.uid());

revoke all on public.accounts, public.golfer_identities,
  public.personal_golfer_library, public.account_providers, public.devices from public, anon;
grant select, insert, update on public.accounts to authenticated;
grant select, insert on public.golfer_identities to authenticated;
grant select, insert, update, delete on public.personal_golfer_library, public.devices to authenticated;
grant select on public.account_providers to authenticated;

create or replace function public.create_my_claimed_golfer_identity(
  p_display_name text,
  p_nickname text default null
) returns public.golfer_identities
language plpgsql security definer set search_path = '' as $$
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
  select u.id from auth.users u
  where u.id = v_account_id
    and coalesce(u.is_anonymous, false) = false
    and coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'anonymous'
  on conflict (account_id) do nothing;
  if not exists (select 1 from public.accounts a where a.account_id = v_account_id) then
    raise exception 'A durable authenticated Account is required.' using errcode = '42501';
  end if;
  select g.* into v_identity from public.golfer_identities g
  where g.claimed_by_account_id = v_account_id;
  if v_identity.golfer_identity_id is null then
    insert into public.golfer_identities(
      claim_status, claimed_by_account_id, display_name, profile, created_by_account_id
    ) values (
      'claimed', v_account_id, v_display_name,
      jsonb_strip_nulls(jsonb_build_object('nickname', v_nickname)), v_account_id
    ) returning * into v_identity;
  end if;
  insert into public.personal_golfer_library(account_id, golfer_identity_id)
  values (v_account_id, v_identity.golfer_identity_id)
  on conflict (account_id, golfer_identity_id) do nothing;
  return v_identity;
exception when unique_violation then
  select g.* into v_identity from public.golfer_identities g
  where g.claimed_by_account_id = v_account_id;
  if v_identity.golfer_identity_id is null then raise; end if;
  insert into public.personal_golfer_library(account_id, golfer_identity_id)
  values (v_account_id, v_identity.golfer_identity_id)
  on conflict (account_id, golfer_identity_id) do nothing;
  return v_identity;
end $$;
revoke all on function public.create_my_claimed_golfer_identity(text, text) from public, anon;
grant execute on function public.create_my_claimed_golfer_identity(text, text) to authenticated;

-- Creates only the Owner-controlled parent and organizer membership. Child rows
-- continue through membership-scoped RLS after this atomic authorization anchor.
create or replace function public.publish_shared_match_owner(
  p_match jsonb,
  p_device_id text,
  p_device_label text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches;
  v_existing_owner uuid;
  v_code text := upper(trim(coalesce(p_match ->> 'id', '')));
  v_device text := left(trim(coalesce(p_device_id, '')), 100);
begin
  if v_user is null then
    raise exception 'Authentication session required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = v_user
      and coalesce(u.is_anonymous, false) = false
      and coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'anonymous'
  ) then
    raise exception 'A durable authenticated Account is required' using errcode = '42501';
  end if;
  if v_code !~ '^DYE-[1-9][0-9]{5}$' and v_code !~ '^[A-Z0-9]{12}$' then
    raise exception 'Invalid Shared Match code' using errcode = '22023';
  end if;
  if v_device = '' then
    raise exception 'Device attribution required' using errcode = '22023';
  end if;
  select m.created_by into v_existing_owner from public.matches m where m.id = v_code;
  if found and v_existing_owner is distinct from v_user then
    raise exception 'Shared Match Owner authorization required' using errcode = '42501';
  end if;
  v_match := jsonb_populate_record(null::public.matches, p_match);
  v_match.id := v_code;
  v_match.created_by := v_user;
  insert into public.matches select (v_match).*
  on conflict (id) do nothing;
  insert into public.match_memberships(
    id, match_id, user_id, role, status, joined_at, last_seen_at, device_label
  ) values (
    v_code || ':member:' || v_user::text || ':' || v_device,
    v_code, v_user, 'organizer', 'active', now(), now(),
    left(p_device_label, 500)
  ) on conflict (id) do update set
    status = 'active', last_seen_at = now(), device_label = excluded.device_label;
  return v_code;
end $$;
revoke all on function public.publish_shared_match_owner(jsonb, text, text) from public, anon;
grant execute on function public.publish_shared_match_owner(jsonb, text, text) to authenticated;

commit;
