-- The Dye Ledger v27.33 Supabase course-library schema
-- Run this before using the Course Library refresh feature.

create table if not exists public.courses (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  city text null,
  state text null,
  country text not null default 'United States of America',
  external_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_tees (
  id text primary key default gen_random_uuid()::text,
  course_id text not null references public.courses(id) on delete cascade,
  tee_name text not null,
  gender text not null default 'M' check (gender in ('M','F')),
  rating numeric null,
  slope integer null,
  total_yards integer null,
  total_par integer null,
  display_order integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_holes (
  id text primary key default gen_random_uuid()::text,
  course_id text not null references public.courses(id) on delete cascade,
  tee_id text not null references public.course_tees(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer null,
  handicap_index integer null check (handicap_index between 1 and 18),
  yardage integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tee_id, hole_number)
);

create index if not exists idx_course_tees_course_id on public.course_tees(course_id);
create index if not exists idx_course_holes_course_id on public.course_holes(course_id);
create index if not exists idx_course_holes_tee_id on public.course_holes(tee_id);

alter table public.courses enable row level security;
alter table public.course_tees enable row level security;
alter table public.course_holes enable row level security;

-- Phase 1 course library is public read-only reference data for the PWA.
drop policy if exists courses_select_anon on public.courses;
create policy courses_select_anon on public.courses for select to anon using (true);
drop policy if exists course_tees_select_anon on public.course_tees;
create policy course_tees_select_anon on public.course_tees for select to anon using (true);
drop policy if exists course_holes_select_anon on public.course_holes;
create policy course_holes_select_anon on public.course_holes for select to anon using (true);

drop policy if exists courses_select_authenticated on public.courses;
create policy courses_select_authenticated on public.courses for select to authenticated using (true);
drop policy if exists course_tees_select_authenticated on public.course_tees;
create policy course_tees_select_authenticated on public.course_tees for select to authenticated using (true);
drop policy if exists course_holes_select_authenticated on public.course_holes;
create policy course_holes_select_authenticated on public.course_holes for select to authenticated using (true);

-- The Dye Ledger Pass 1 Supabase foundation schema

create table if not exists public.matches (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null,
  name text not null,
  match_date date not null,
  status text not null default 'active' check (status in ('active','complete')),
  course_id text,
  reference_tee_id text,
  course_snapshot jsonb not null default '{}'::jsonb,
  format text not null default 'teams',
  allowance numeric not null default 100,
  hole_count integer not null default 18 check (hole_count in (9,18)),
  nine_hole_segment text not null default 'front',
  custom_start_hole integer not null default 1,
  team_count integer not null default 1,
  players_per_team integer not null default 1,
  scoring_access_mode text not null default 'team_codes' check (scoring_access_mode in ('single_device','team_codes','open_edit')),
  stat_tracking_enabled boolean not null default false,
  selected_games jsonb not null default '[]'::jsonb,
  match_status_game text null,
  momentum_game text null,
  momentum_perspective integer not null default 1,
  locked_after_start boolean not null default false,
  setup_locked_at timestamptz null,
  completed_at timestamptz null,
  last_touched_hole integer not null default 0,
  last_fully_completed_hole integer not null default 0
);

create table if not exists public.match_teams (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  team_number integer not null,
  team_name text not null,
  created_at timestamptz not null default now(),
  unique(match_id, team_number)
);

create table if not exists public.match_players (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  player_id text not null,
  team_id text not null references public.match_teams(id) on delete cascade,
  team_number integer not null,
  slot integer not null,
  player_name text not null,
  player_index numeric not null default 0,
  tee_id text,
  tee_name text,
  course_handicap numeric not null default 0,
  playing_handicap numeric not null default 0,
  handicap_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(match_id, player_id)
);

create table if not exists public.match_memberships (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('organizer','team_scorer','viewer')),
  team_id text null,
  team_number integer null,
  status text not null default 'active' check (status in ('active','revoked')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  device_label text null
);

create table if not exists public.team_access_codes (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  team_id text not null references public.match_teams(id) on delete cascade,
  team_number integer not null,
  role text not null default 'team_scorer' check (role in ('team_scorer','viewer')),
  code_hash text not null,
  code_last4 text null,
  status text not null default 'active' check (status in ('active','revoked','expired','claimed')),
  created_at timestamptz not null default now(),
  created_by uuid null,
  expires_at timestamptz null,
  claimed_at timestamptz null,
  claimed_by_user_id uuid null,
  claimed_device_label text null,
  claimed_session_id text null
);

create table if not exists public.score_entries (
  id text primary key,
  match_id text not null references public.matches(id) on delete cascade,
  match_player_id text not null references public.match_players(id) on delete cascade,
  player_id text not null,
  team_id text not null references public.match_teams(id) on delete cascade,
  team_number integer not null,
  hole_number integer not null,
  gross integer null,
  putts integer null,
  fairway boolean null,
  green boolean null,
  up_and_down boolean null,
  sandy boolean null,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  entry_status text not null default 'active',
  unique(match_id, match_player_id, hole_number)
);

create table if not exists public.audit_log (
  id bigserial primary key,
  match_id text not null references public.matches(id) on delete cascade,
  entity_type text not null,
  entity_id text null,
  action text not null,
  actor_user_id uuid null,
  actor_role text null,
  actor_team_id text null,
  hole_number integer null,
  field_name text null,
  old_value jsonb null,
  new_value jsonb null,
  context jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_notes (
  match_id text primary key references public.matches(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

create index if not exists idx_match_teams_match_id on public.match_teams(match_id);
create index if not exists idx_match_players_match_id on public.match_players(match_id);
create index if not exists idx_match_memberships_match_id on public.match_memberships(match_id);
create index if not exists idx_score_entries_match_id on public.score_entries(match_id);
create index if not exists idx_audit_log_match_id on public.audit_log(match_id);

alter table public.matches enable row level security;
alter table public.match_teams enable row level security;
alter table public.match_players enable row level security;
alter table public.match_memberships enable row level security;
alter table public.team_access_codes enable row level security;
alter table public.score_entries enable row level security;
alter table public.audit_log enable row level security;
alter table public.match_notes enable row level security;

-- Pass 1 RLS is intentionally broad for authenticated users to support organizer-created shared round foundations
-- while the app is still pre-team-code and pre-role-enforcement. Tighten these in Pass 2 around match_memberships.

drop policy if exists matches_select_authenticated on public.matches;
create policy matches_select_authenticated on public.matches for select to authenticated using (true);

drop policy if exists matches_insert_authenticated on public.matches;
create policy matches_insert_authenticated on public.matches for insert to authenticated with check (true);

drop policy if exists matches_update_owner on public.matches;
create policy matches_update_owner on public.matches for update to authenticated using (created_by is null or created_by = auth.uid()) with check (created_by is null or created_by = auth.uid());

drop policy if exists match_teams_all_authenticated on public.match_teams;
create policy match_teams_all_authenticated on public.match_teams for all to authenticated using (true) with check (true);

drop policy if exists match_players_all_authenticated on public.match_players;
create policy match_players_all_authenticated on public.match_players for all to authenticated using (true) with check (true);

drop policy if exists match_memberships_all_authenticated on public.match_memberships;
create policy match_memberships_all_authenticated on public.match_memberships for all to authenticated using (true) with check (true);

drop policy if exists team_access_codes_select_authenticated on public.team_access_codes;
create policy team_access_codes_select_authenticated on public.team_access_codes for select to authenticated using (true);

drop policy if exists team_access_codes_write_authenticated on public.team_access_codes;
create policy team_access_codes_write_authenticated on public.team_access_codes for insert to authenticated with check (true);

drop policy if exists score_entries_all_authenticated on public.score_entries;
create policy score_entries_all_authenticated on public.score_entries for all to authenticated using (true) with check (true);

drop policy if exists audit_log_select_authenticated on public.audit_log;
create policy audit_log_select_authenticated on public.audit_log for select to authenticated using (true);

drop policy if exists audit_log_insert_authenticated on public.audit_log;
create policy audit_log_insert_authenticated on public.audit_log for insert to authenticated with check (true);

drop policy if exists match_notes_all_authenticated on public.match_notes;
create policy match_notes_all_authenticated on public.match_notes for all to authenticated using (true) with check (true);

-- Future Pass 2 / Pass 3 notes:
-- 1) tighten select/update policies to require a matching row in match_memberships
-- 2) add RPCs for redeem_team_code, revoke_team_code, and regenerate_team_code
-- 3) add audit triggers on score_entries and match_notes
