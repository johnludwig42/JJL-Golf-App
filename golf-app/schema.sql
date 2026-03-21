create extension if not exists pgcrypto;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  handicap_index numeric(4,1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tee_name text not null,
  par integer not null,
  rating numeric(4,1) not null,
  slope integer not null,
  hole_ranks jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  course_id uuid not null references courses(id) on delete restrict,
  hole_count integer not null,
  allowance integer not null,
  team_mode text not null,
  games jsonb not null,
  players jsonb not null,
  scores jsonb not null,
  current_hole integer not null default 1,
  status text not null default 'active',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_updated_at before update on players
for each row execute function set_updated_at();

create trigger courses_updated_at before update on courses
for each row execute function set_updated_at();

create trigger matches_updated_at before update on matches
for each row execute function set_updated_at();

alter table players enable row level security;
alter table courses enable row level security;
alter table matches enable row level security;

create policy "allow anon read write players" on players for all using (true) with check (true);
create policy "allow anon read write courses" on courses for all using (true) with check (true);
create policy "allow anon read write matches" on matches for all using (true) with check (true);
