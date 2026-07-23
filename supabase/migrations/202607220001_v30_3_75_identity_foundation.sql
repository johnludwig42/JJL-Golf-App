-- v30.3.75 identity foundation. Idempotent and additive; do not run against production without approval.
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
comment on table public.golfer_identities is 'Permanent identity; mutable profile attributes are never identity keys.';
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
    insert into public.accounts(account_id) values (new.id) on conflict (account_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.provision_durable_account() from public, anon, authenticated;
drop trigger if exists provision_durable_account_after_auth_user on auth.users;
create trigger provision_durable_account_after_auth_user after insert on auth.users
for each row execute function public.provision_durable_account();
insert into public.accounts(account_id)
select id from auth.users
where coalesce(is_anonymous, false) = false and coalesce(raw_app_meta_data ->> 'provider', '') <> 'anonymous'
on conflict (account_id) do nothing;

alter table public.accounts enable row level security;
alter table public.golfer_identities enable row level security;
alter table public.personal_golfer_library enable row level security;
alter table public.account_providers enable row level security;
alter table public.devices enable row level security;

drop policy if exists accounts_self_select on public.accounts;
create policy accounts_self_select on public.accounts for select to authenticated using (account_id = auth.uid());
drop policy if exists accounts_self_insert on public.accounts;
create policy accounts_self_insert on public.accounts for insert to authenticated with check (account_id = auth.uid());
drop policy if exists accounts_self_update on public.accounts;
create policy accounts_self_update on public.accounts for update to authenticated using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists golfer_library_visible on public.golfer_identities;
create policy golfer_library_visible on public.golfer_identities for select to authenticated using (
  claimed_by_account_id = auth.uid() or exists (select 1 from public.personal_golfer_library l where l.account_id = auth.uid() and l.golfer_identity_id = golfer_identities.golfer_identity_id)
);
drop policy if exists golfer_unclaimed_insert on public.golfer_identities;
create policy golfer_unclaimed_insert on public.golfer_identities for insert to authenticated with check (claim_status = 'unclaimed' and claimed_by_account_id is null and created_by_account_id = auth.uid());

drop policy if exists personal_library_owner_all on public.personal_golfer_library;
create policy personal_library_owner_all on public.personal_golfer_library for all to authenticated using (account_id = auth.uid()) with check (account_id = auth.uid());
drop policy if exists account_providers_owner_select on public.account_providers;
create policy account_providers_owner_select on public.account_providers for select to authenticated using (account_id = auth.uid());
drop policy if exists devices_owner_all on public.devices;
create policy devices_owner_all on public.devices for all to authenticated using (account_id = auth.uid()) with check (account_id = auth.uid());

revoke all on public.accounts, public.golfer_identities, public.personal_golfer_library, public.account_providers, public.devices from anon;
grant select, insert, update on public.accounts to authenticated;
grant select, insert on public.golfer_identities to authenticated;
grant select, insert, update, delete on public.personal_golfer_library, public.devices to authenticated;
grant select on public.account_providers to authenticated;

commit;
