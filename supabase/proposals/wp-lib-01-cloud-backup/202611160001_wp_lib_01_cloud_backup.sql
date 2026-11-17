-- C1 proposal for separate staging approval. Keep outside supabase/migrations
-- so a normal migration push cannot pick up these pilot objects.
begin;

create table public.round_backups (
  cloud_round_id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_account_id uuid not null,
  local_round_id text not null check (pg_catalog.btrim(local_round_id) <> '' and pg_catalog.char_length(local_round_id) <= 128),
  created_at timestamptz not null default now(),
  constraint round_backups_owner_local_key unique (owner_account_id, local_round_id)
);

create table public.round_backup_versions (
  cloud_round_id uuid not null references public.round_backups (cloud_round_id),
  version_number integer not null check (version_number = 1),
  round_canonical text not null,
  players_canonical text not null,
  round_sha256 char(64) not null check (round_sha256 ~ '^[0-9a-f]{64}$'),
  players_sha256 char(64) not null check (players_sha256 ~ '^[0-9a-f]{64}$'),
  app_version text not null check (pg_catalog.btrim(app_version) <> '' and pg_catalog.char_length(app_version) <= 32),
  created_at timestamptz not null default now(),
  primary key (cloud_round_id, version_number),
  unique (cloud_round_id, round_sha256)
);

alter table public.round_backups enable row level security;
alter table public.round_backup_versions enable row level security;

revoke all on table public.round_backups, public.round_backup_versions
  from public, anon, authenticated, service_role;
grant select on table public.round_backups, public.round_backup_versions to authenticated;

create policy round_backups_owner_read on public.round_backups
  for select to authenticated
  using (
    owner_account_id = (select auth.uid())
    -- A token without an is_anonymous claim is deliberately treated as anonymous and refused, stricter than earlier migrations that coalesce a missing claim to false.
    and (select auth.jwt() ->> 'is_anonymous') = 'false'
  );

create policy round_backup_versions_owner_read on public.round_backup_versions
  for select to authenticated
  using (
    exists (
      select 1
      from public.round_backups as backup
      where backup.cloud_round_id = round_backup_versions.cloud_round_id
        and backup.owner_account_id = (select auth.uid())
        and (select auth.jwt() ->> 'is_anonymous') = 'false'
    )
  );

create function public.reject_round_backup_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ROUND_BACKUP_IMMUTABLE' using errcode = '55000';
end;
$$;

revoke all on function public.reject_round_backup_version_mutation()
  from public, anon, authenticated, service_role;

create trigger round_backup_versions_immutable
  before update or delete on public.round_backup_versions
  for each row execute function public.reject_round_backup_version_mutation();

create trigger round_backups_immutable
  before update on public.round_backups
  for each row execute function public.reject_round_backup_version_mutation();

create trigger round_backups_no_truncate
  before truncate on public.round_backups
  for each statement execute function public.reject_round_backup_version_mutation();

create trigger round_backup_versions_no_truncate
  before truncate on public.round_backup_versions
  for each statement execute function public.reject_round_backup_version_mutation();

create function public.backup_round(
  local_round_id text,
  round_canonical text,
  players_canonical text,
  round_sha256 text,
  players_sha256 text,
  app_version text
)
returns table (cloud_round_id uuid, version_number integer, created boolean, stored_players_sha256 text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  backup_id uuid;
  stored_round_hash text;
  stored_players_hash text;
begin
  if owner_id is null or (auth.jwt() ->> 'is_anonymous') is distinct from 'false' then
    raise exception 'DURABLE_ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  if local_round_id is null or pg_catalog.btrim(local_round_id) = ''
     or app_version is null or pg_catalog.btrim(app_version) = ''
     or pg_catalog.char_length(local_round_id) > 128
     or pg_catalog.char_length(app_version) > 32
     or round_canonical is null or players_canonical is null
     or round_sha256 is null or round_sha256 !~ '^[0-9a-f]{64}$'
     or players_sha256 is null or players_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_BACKUP_INPUT' using errcode = '22023';
  end if;

  if pg_catalog.octet_length(pg_catalog.convert_to(round_canonical, 'UTF8'))::bigint
       + pg_catalog.octet_length(pg_catalog.convert_to(players_canonical, 'UTF8')) > 1048576 then
    raise exception 'BACKUP_TOO_LARGE' using errcode = '22023';
  end if;

  if pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(round_canonical, 'UTF8')), 'hex') <> round_sha256
     or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(players_canonical, 'UTF8')), 'hex') <> players_sha256 then
    raise exception 'BACKUP_HASH_MISMATCH' using errcode = '22023';
  end if;

  -- The unique owner/round key arbitrates concurrent first uploads. The
  -- winning insert and version insert commit together. A losing insert
  -- then reads the winning version in a separate statement. That re-read
  -- relies on READ COMMITTED (the PostgREST default) and this function being
  -- VOLATILE (the default), so the separate SELECT takes a fresh snapshot.
  insert into public.round_backups as backup (owner_account_id, local_round_id)
    values (owner_id, backup_round.local_round_id)
    on conflict on constraint round_backups_owner_local_key do nothing
    returning backup.cloud_round_id into backup_id;

  if backup_id is not null then
    insert into public.round_backup_versions (
      cloud_round_id, version_number, round_canonical, players_canonical,
      round_sha256, players_sha256, app_version
    ) values (
      backup_id, 1, backup_round.round_canonical, backup_round.players_canonical,
      backup_round.round_sha256, backup_round.players_sha256, backup_round.app_version
    );
    return query select backup_id, 1, true, backup_round.players_sha256;
    return;
  end if;

  select backup.cloud_round_id, version.round_sha256::text, version.players_sha256::text
    into backup_id, stored_round_hash, stored_players_hash
    from public.round_backups as backup
    join public.round_backup_versions as version
      on version.cloud_round_id = backup.cloud_round_id and version.version_number = 1
    where backup.owner_account_id = owner_id
      and backup.local_round_id = backup_round.local_round_id;

  if not found then
    raise exception 'BACKUP_VERSION_UNAVAILABLE' using errcode = '55000';
  end if;
  if stored_round_hash <> backup_round.round_sha256 then
    raise exception 'ROUND_CHANGED' using errcode = '22023';
  end if;

  return query select backup_id, 1, false, stored_players_hash;
end;
$$;

alter table public.round_backups owner to postgres;
alter table public.round_backup_versions owner to postgres;
alter function public.reject_round_backup_version_mutation() owner to postgres;
alter function public.backup_round(text, text, text, text, text, text) owner to postgres;
revoke all on function public.backup_round(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.backup_round(text, text, text, text, text, text)
  to authenticated;

commit;
