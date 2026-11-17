-- Separate approval required. Pause pilot writes before running.
-- Any retained pilot rows require separately approved admin cleanup.
-- Use admin-delete-owner-backups.sql for per-owner deletion; a full pilot cleanup must likewise disable the immutability triggers inside its own transaction.
begin;

lock table public.round_backups, public.round_backup_versions in access exclusive mode;

do $$
begin
  if exists (select 1 from public.round_backups)
     or exists (select 1 from public.round_backup_versions) then
    raise exception 'ROUND_BACKUP_PILOT_ROWS_RETAINED' using errcode = '55000';
  end if;
end;
$$;

drop function public.backup_round(text, text, text, text, text, text);
drop table public.round_backup_versions;
drop table public.round_backups;
drop function public.reject_round_backup_version_mutation();

commit;
