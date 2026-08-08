-- Disposable v30.3.93 Shared Match fixture. Never run against production.
begin;

create table if not exists public.matches (
  id text primary key,
  created_by uuid references auth.users(id),
  status text not null default 'active'
);
create table if not exists public.match_memberships (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null,
  status text not null,
  joined_at timestamptz,
  last_seen_at timestamptz,
  device_label text
);
create table if not exists public.match_teams (
  id text primary key, match_id text not null references public.matches(id) on delete cascade
);
create table if not exists public.match_players (
  id text primary key, match_id text not null references public.matches(id) on delete cascade
);
create table if not exists public.score_entries (
  id text primary key, match_id text not null references public.matches(id) on delete cascade,
  updated_by uuid references auth.users(id)
);
create table if not exists public.match_notes (
  id text primary key, match_id text not null references public.matches(id) on delete cascade,
  updated_by uuid references auth.users(id)
);
create table if not exists public.audit_log (
  id text primary key, match_id text not null references public.matches(id) on delete cascade,
  actor_user_id uuid references auth.users(id)
);
create table if not exists public.team_access_codes (
  id text primary key, match_id text not null references public.matches(id) on delete cascade
);

insert into auth.users(id) values
 ('93000000-0000-0000-0000-000000000001'),
 ('93000000-0000-0000-0000-000000000002'),
 ('93000000-0000-0000-0000-000000000003'),
 ('93000000-0000-0000-0000-000000000004')
on conflict do nothing;
insert into public.matches(id,created_by,status) values
 ('DYE-930001','93000000-0000-0000-0000-000000000001','active'),
 ('DYE-930002','93000000-0000-0000-0000-000000000001','complete')
on conflict do nothing;
insert into public.match_teams(id,match_id) values ('team-baseline','DYE-930001') on conflict do nothing;
insert into public.match_players(id,match_id) values ('player-baseline','DYE-930001') on conflict do nothing;
insert into public.score_entries(id,match_id,updated_by)
 values ('score-baseline','DYE-930001','93000000-0000-0000-0000-000000000001') on conflict do nothing;

grant usage on schema public, auth to anon, authenticated;
grant select on auth.users to authenticated;
grant select,insert,update,delete on public.matches,public.match_memberships,public.match_teams,
 public.match_players,public.score_entries,public.match_notes,public.audit_log,public.team_access_codes
 to anon,authenticated;

-- Model the unsafe live starting point so the migration must remove it.
alter table public.matches enable row level security;
alter table public.match_memberships enable row level security;
alter table public.match_teams enable row level security;
alter table public.match_players enable row level security;
alter table public.score_entries enable row level security;
alter table public.match_notes enable row level security;
alter table public.audit_log enable row level security;
alter table public.team_access_codes enable row level security;
do $$ declare t text; begin
  foreach t in array array['matches','match_memberships','match_teams','match_players','score_entries','match_notes','audit_log','team_access_codes']
  loop execute format('create policy legacy_permissive on public.%I for all to authenticated using (true) with check (true)',t); end loop;
end $$;

commit;
