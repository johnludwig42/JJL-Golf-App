-- DISPOSABLE LOCAL DATABASE ONLY. Never run this fixture against Supabase.
\set ON_ERROR_STOP on
do $$ begin
 if current_database() <> 'dye_rpc_review' or inet_server_addr() <> '127.0.0.1'::inet or current_setting('port') <> '55477' then
  raise exception 'This fixture is restricted to the disposable localhost review database';
 end if;
end $$;
begin;
create schema auth; create schema realtime; create schema extensions;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;end $$;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
create table realtime.messages(id bigint);
create table public.review_broadcasts(payload jsonb not null);
create function realtime.broadcast_changes(topic_name text,event_name text,operation text,table_name text,table_schema text,"new" record,"old" record,level text)
returns void language plpgsql as $$begin
 insert into public.review_broadcasts values(jsonb_build_object('topic',topic_name,'event',event_name,'level',level,'record',to_jsonb("new")));
end$$;
grant usage on schema auth,public,realtime to authenticated,anon;
create table public.matches (locked_after_start bool default false not null,
created_at timestamptz default now() not null,
updated_at timestamptz default now() not null,
created_by uuid,
match_date date not null,
course_snapshot jsonb default '{}'::jsonb not null,
allowance numeric default 100 not null,
hole_count int4 default 18 not null,
custom_start_hole int4 default 1 not null,
team_count int4 default 1 not null,
players_per_team int4 default 1 not null,
stat_tracking_enabled bool default false not null,
selected_games jsonb default '[]'::jsonb not null,
momentum_perspective int4 default 1 not null,
setup_locked_at timestamptz,
completed_at timestamptz,
last_touched_hole int4 default 0 not null,
last_fully_completed_hole int4 default 0 not null,
id text not null,
name text not null,
status text default 'active'::text not null,
course_id text,
reference_tee_id text,
format text default 'teams'::text not null,
nine_hole_segment text default 'front'::text not null,
scoring_access_mode text default 'team_codes'::text not null,
match_status_game text,
momentum_game text);
create table public.match_memberships (user_id uuid not null,
team_number int4,
joined_at timestamptz default now() not null,
last_seen_at timestamptz default now() not null,
id text not null,
match_id text not null,
role text not null,
team_id text,
status text default 'active'::text not null,
device_label text);
create table public.match_teams (team_number int4 not null,
created_at timestamptz default now() not null,
id text not null,
match_id text not null,
team_name text not null);
create table public.match_players (course_handicap numeric default 0 not null,
playing_handicap numeric default 0 not null,
handicap_snapshot jsonb default '{}'::jsonb not null,
created_at timestamptz default now() not null,
team_number int4 not null,
slot int4 not null,
player_index numeric default 0 not null,
tee_id text,
tee_name text,
id text not null,
match_id text not null,
player_id text not null,
team_id text not null,
player_name text not null);
create table public.score_entries (team_number int4 not null,
hole_number int4 not null,
gross int4,
putts int4,
fairway bool,
green bool,
up_and_down bool,
sandy bool,
updated_at timestamptz default now() not null,
updated_by uuid,
id text not null,
match_id text not null,
match_player_id text not null,
player_id text not null,
team_id text not null,
entry_status text default 'active'::text not null);
alter table public.matches add constraint matches_hole_count_check CHECK (hole_count = ANY (ARRAY[9, 18]));
alter table public.matches add constraint matches_pkey PRIMARY KEY (id);
alter table public.matches add constraint matches_scoring_access_mode_check CHECK (scoring_access_mode = ANY (ARRAY['single_device'::text, 'team_codes'::text, 'open_edit'::text]));
alter table public.matches add constraint matches_status_check CHECK (status = ANY (ARRAY['active'::text, 'complete'::text]));
alter table public.match_memberships add constraint match_memberships_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
alter table public.match_memberships add constraint match_memberships_pkey PRIMARY KEY (id);
alter table public.match_memberships add constraint match_memberships_role_check CHECK (role = ANY (ARRAY['organizer'::text, 'team_scorer'::text, 'viewer'::text]));
alter table public.match_memberships add constraint match_memberships_status_check CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text]));
alter table public.match_teams add constraint match_teams_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
alter table public.match_teams add constraint match_teams_match_id_team_number_key UNIQUE (match_id, team_number);
alter table public.match_teams add constraint match_teams_pkey PRIMARY KEY (id);
alter table public.match_players add constraint match_players_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
alter table public.match_players add constraint match_players_match_id_player_id_key UNIQUE (match_id, player_id);
alter table public.match_players add constraint match_players_pkey PRIMARY KEY (id);
alter table public.match_players add constraint match_players_team_id_fkey FOREIGN KEY (team_id) REFERENCES match_teams(id) ON DELETE CASCADE;
alter table public.score_entries add constraint score_entries_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;
alter table public.score_entries add constraint score_entries_match_id_match_player_id_hole_number_key UNIQUE (match_id, match_player_id, hole_number);
alter table public.score_entries add constraint score_entries_match_player_id_fkey FOREIGN KEY (match_player_id) REFERENCES match_players(id) ON DELETE CASCADE;
alter table public.score_entries add constraint score_entries_pkey PRIMARY KEY (id);
alter table public.score_entries add constraint score_entries_team_id_fkey FOREIGN KEY (team_id) REFERENCES match_teams(id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.shared_match_is_member(p_match_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and (
    exists (select 1 from public.matches m where m.id = p_match_id and m.created_by = auth.uid())
    or exists (select 1 from public.match_memberships mm
      where mm.match_id = p_match_id and mm.user_id = auth.uid() and mm.status = 'active')
  );
$function$
;
CREATE OR REPLACE FUNCTION public.shared_match_is_organizer(p_match_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select auth.uid() is not null and (
    exists (select 1 from public.matches m where m.id = p_match_id and m.created_by = auth.uid())
    or exists (select 1 from public.match_memberships mm
      where mm.match_id = p_match_id and mm.user_id = auth.uid()
        and mm.status = 'active' and mm.role = 'organizer')
  );
$function$
;
alter table public.matches enable row level security;
grant select,insert,update on public.matches to authenticated;
alter table public.match_memberships enable row level security;
grant select,insert,update on public.match_memberships to authenticated;
alter table public.match_teams enable row level security;
grant select,insert,update,delete on public.match_teams to authenticated;
alter table public.match_players enable row level security;
grant select,insert,update,delete on public.match_players to authenticated;
alter table public.score_entries enable row level security;
grant select,insert,update,delete on public.score_entries to authenticated;
create policy matches_owner_insert on public.matches for INSERT to authenticated with check ((created_by = auth.uid()));
create policy matches_member_update on public.matches for UPDATE to authenticated using (shared_match_is_member(id)) with check (shared_match_is_member(id));
create policy matches_member_select on public.matches for SELECT to authenticated using (shared_match_is_member(id));
create policy memberships_member_select on public.match_memberships for SELECT to authenticated using (shared_match_is_member(match_id));
create policy memberships_owner_insert on public.match_memberships for INSERT to authenticated with check (((user_id = auth.uid()) AND shared_match_is_organizer(match_id)));
create policy memberships_self_update on public.match_memberships for UPDATE to authenticated using (((user_id = auth.uid()) OR shared_match_is_organizer(match_id))) with check (((user_id = auth.uid()) OR shared_match_is_organizer(match_id)));
create policy teams_member_all on public.match_teams for ALL to authenticated using (shared_match_is_member(match_id)) with check (shared_match_is_member(match_id));
create policy players_member_all on public.match_players for ALL to authenticated using (shared_match_is_member(match_id)) with check (shared_match_is_member(match_id));
create policy scores_member_all on public.score_entries for ALL to authenticated using (shared_match_is_member(match_id)) with check ((shared_match_is_member(match_id) AND (COALESCE(updated_by, auth.uid()) = auth.uid())));

insert into auth.users values ('77000000-0000-0000-0000-000000000001'),('77000000-0000-0000-0000-000000000002'),('77000000-0000-0000-0000-000000000003');
insert into public.matches(id,created_by,match_date,name) values('DYE-REVIEW','77000000-0000-0000-0000-000000000001','2026-10-21','Review Round');
insert into public.match_memberships(id,match_id,user_id,role,status)
values ('DYE-REVIEW:member:77000000-0000-0000-0000-000000000001:host','DYE-REVIEW','77000000-0000-0000-0000-000000000001','organizer','active'),
('DYE-REVIEW:member:77000000-0000-0000-0000-000000000002:remote','DYE-REVIEW','77000000-0000-0000-0000-000000000002','team_scorer','active');
insert into public.match_teams(id,match_id,team_number,team_name) select 'team-'||i,'DYE-REVIEW',i,'Review Team '||i from generate_series(1,16)i;
insert into public.match_players(id,match_id,player_id,team_id,team_number,slot,player_name,handicap_snapshot)
select 'mp-'||i,'DYE-REVIEW','p'||i,'team-'||(i/2+1),(i/2+1),i,'Review Golfer '||i,jsonb_build_object('assignedDeviceId',case when i<4 then 'remote' else 'host' end) from generate_series(0,31)i;
create function public.review_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label;end if;raise notice 'PASS: %',label;
end$$;
create function public.review_error(command text,wanted text,label text) returns void language plpgsql as $$declare actual text;begin
 begin execute command; exception when others then get stacked diagnostics actual=returned_sqlstate;end;
 perform public.review_assert(actual=wanted,label||' (SQLSTATE '||coalesce(actual,'no error')||')');
end$$;
create function public.review_ops(n integer,start_at integer default 0) returns jsonb language sql as $$
 select jsonb_agg(jsonb_build_object('operation_id',md5('review-'||i)::uuid,'client_revision',1,'queued_at','2026-10-21T00:00:00Z','score_entry',jsonb_build_object(
 'id','score-'||i,'match_id','DYE-REVIEW','match_player_id','mp-'||(i/18),'player_id','p'||(i/18),'team_id','team-'||(i/36+1),'team_number',i/36+1,'hole_number',i%18+1,'gross',4,'putts',2,'fairway',false,'green',false,'up_and_down',false,'sandy',false,'entry_status','active','updated_at','2026-10-21T00:00:00Z','updated_by',null)) order by i)
 from generate_series(start_at,start_at+n-1)i;
$$;

commit;
