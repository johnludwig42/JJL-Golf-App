-- Emergency access rollback only. Preserves every row and additive column.
begin;
do $$ declare p record; begin
  for p in select policyname,tablename from pg_policies where schemaname='public'
    and tablename in ('courses','course_tees','course_holes','matches','match_memberships','match_teams','match_players','score_entries','match_notes','audit_log','team_access_codes')
  loop execute format('drop policy %I on public.%I',p.policyname,p.tablename); end loop;
end $$;
drop function if exists public.join_shared_match(text,text,text);
drop trigger if exists stamp_shared_match_owner_before_insert on public.matches;
drop function if exists public.stamp_shared_match_owner();
drop function if exists public.shared_match_is_member(text);
drop function if exists public.shared_match_is_organizer(text);
drop function if exists public.course_library_can_write();
drop function if exists public.course_library_is_maintainer();
-- Restore the legacy access contract only for emergency compatibility.
alter table public.courses disable row level security;
alter table public.course_tees disable row level security;
alter table public.course_holes disable row level security;
create policy matches_select_authenticated on public.matches for select to authenticated using (true);
create policy matches_insert_authenticated on public.matches for insert to authenticated with check (true);
create policy matches_update_owner on public.matches for update to authenticated
  using (created_by is null or created_by=auth.uid()) with check (created_by is null or created_by=auth.uid());
create policy match_memberships_all_authenticated on public.match_memberships for all to authenticated using (true) with check (true);
create policy match_teams_all_authenticated on public.match_teams for all to authenticated using (true) with check (true);
create policy match_players_all_authenticated on public.match_players for all to authenticated using (true) with check (true);
create policy score_entries_all_authenticated on public.score_entries for all to authenticated using (true) with check (true);
create policy match_notes_all_authenticated on public.match_notes for all to authenticated using (true) with check (true);
create policy audit_log_select_authenticated on public.audit_log for select to authenticated using (true);
create policy audit_log_insert_authenticated on public.audit_log for insert to authenticated with check (true);
create policy team_access_codes_select_authenticated on public.team_access_codes for select to authenticated using (true);
create policy team_access_codes_write_authenticated on public.team_access_codes for insert to authenticated with check (true);
grant select,insert,update,delete on public.courses,public.course_tees,public.course_holes to anon,authenticated;
grant select,insert,update,delete on public.matches,public.match_memberships,public.match_teams,
  public.match_players,public.score_entries,public.match_notes,public.team_access_codes to authenticated;
grant select,insert on public.audit_log to authenticated;
commit;
