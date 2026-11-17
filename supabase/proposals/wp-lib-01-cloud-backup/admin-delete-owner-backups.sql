-- Separate approval is required for every use.
-- Run as the database owner (postgres) in the Supabase SQL editor or psql.
-- Replace the placeholder UUID exactly once.
-- Everything runs in one transaction, so any error leaves triggers and rows unchanged.
begin;

lock table public.round_backups, public.round_backup_versions in exclusive mode;

create temporary table wp_lib_01_admin_target (
  owner_account_id uuid not null
) on commit drop;

insert into wp_lib_01_admin_target (owner_account_id)
values ('00000000-0000-0000-0000-000000000000');

do $$
begin
  if exists (
    select 1
    from wp_lib_01_admin_target as target
    where target.owner_account_id::text =
      pg_catalog.repeat('0', 8) || '-' ||
      pg_catalog.repeat('0', 4) || '-' ||
      pg_catalog.repeat('0', 4) || '-' ||
      pg_catalog.repeat('0', 4) || '-' ||
      pg_catalog.repeat('0', 12)
  ) then
    raise exception 'ADMIN_TARGET_NOT_SET' using errcode = '22023';
  end if;
end;
$$;

create temporary table wp_lib_01_admin_delete_count (
  backup_count bigint not null
) on commit drop;

insert into wp_lib_01_admin_delete_count (backup_count)
select pg_catalog.count(*)
from public.round_backups as backup
join wp_lib_01_admin_target as target
  on target.owner_account_id = backup.owner_account_id;

alter table public.round_backup_versions disable trigger round_backup_versions_immutable;
alter table public.round_backups disable trigger round_backups_immutable;

delete from public.round_backup_versions as version
using public.round_backups as backup, wp_lib_01_admin_target as target
where backup.cloud_round_id = version.cloud_round_id
  and backup.owner_account_id = target.owner_account_id;

delete from public.round_backups as backup
using wp_lib_01_admin_target as target
where backup.owner_account_id = target.owner_account_id;

alter table public.round_backup_versions enable trigger round_backup_versions_immutable;
alter table public.round_backups enable trigger round_backups_immutable;

do $$
declare
  deleted_count bigint;
begin
  if exists (
    select 1
    from public.round_backups as backup
    join wp_lib_01_admin_target as target
      on target.owner_account_id = backup.owner_account_id
  ) then
    raise exception 'ADMIN_DELETE_INCOMPLETE' using errcode = '55000';
  end if;

  select deletion.backup_count into strict deleted_count
  from wp_lib_01_admin_delete_count as deletion;
  raise notice 'Deleted % backups', deleted_count;
end;
$$;

commit;
