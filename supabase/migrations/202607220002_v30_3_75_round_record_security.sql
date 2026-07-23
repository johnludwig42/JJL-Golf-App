-- v30.3.75 cloud-authoritative RoundRecord/version/amendment foundation.
begin;

create table if not exists public.authoritative_rounds (
  round_id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.accounts(account_id) on delete restrict,
  current_version_id uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.round_access (
  round_id uuid not null references public.authoritative_rounds(round_id) on delete cascade,
  account_id uuid not null references public.accounts(account_id) on delete restrict,
  role text not null check (role in ('participant','viewer')),
  created_at timestamptz not null default now(), primary key (round_id, account_id)
);
alter table public.round_access drop constraint if exists round_access_role_check;
alter table public.round_access add constraint round_access_role_check check(role in ('participant','viewer'));
create table if not exists public.round_participations (
  participation_id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.authoritative_rounds(round_id) on delete restrict,
  golfer_identity_id uuid not null references public.golfer_identities(golfer_identity_id) on delete restrict,
  historical_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(round_id, golfer_identity_id), unique(round_id, participation_id)
);
create unique index if not exists round_participations_round_id_participation_id_uidx on public.round_participations(round_id,participation_id);
create table if not exists public.scoring_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.authoritative_rounds(round_id) on delete cascade,
  participation_id uuid not null,
  device_id uuid references public.devices(device_id) on delete set null,
  capability text not null default 'score', created_at timestamptz not null default now()
);
create table if not exists public.round_record_versions (
  round_record_version_id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.authoritative_rounds(round_id) on delete restrict,
  version_number integer not null check (version_number > 0),
  prior_version_id uuid,
  record jsonb not null, published_by_account_id uuid not null references public.accounts(account_id) on delete restrict,
  reason text not null, impact text not null, published_at timestamptz not null default now(),
  unique(round_id, version_number), unique(round_id, round_record_version_id)
);
create unique index if not exists round_record_versions_round_id_version_id_uidx on public.round_record_versions(round_id,round_record_version_id);
alter table public.authoritative_rounds drop constraint if exists authoritative_round_current_version_fk;
alter table public.authoritative_rounds add constraint authoritative_round_current_version_fk foreign key (round_id,current_version_id) references public.round_record_versions(round_id,round_record_version_id) on delete restrict deferrable initially deferred;
alter table public.round_record_versions drop constraint if exists round_record_versions_prior_version_id_fkey;
alter table public.round_record_versions drop constraint if exists round_record_prior_same_round_fk;
alter table public.round_record_versions add constraint round_record_prior_same_round_fk foreign key (round_id,prior_version_id) references public.round_record_versions(round_id,round_record_version_id) on delete restrict;
alter table public.scoring_assignments drop constraint if exists scoring_assignments_participation_id_fkey;
alter table public.scoring_assignments drop constraint if exists scoring_assignment_participation_same_round_fk;
alter table public.scoring_assignments add constraint scoring_assignment_participation_same_round_fk foreign key (round_id,participation_id) references public.round_participations(round_id,participation_id) on delete cascade;
create table if not exists public.amendment_sessions (
  amendment_session_id uuid primary key default gen_random_uuid(), round_id uuid not null references public.authoritative_rounds(round_id) on delete restrict,
  base_version_id uuid not null,
  proposed_by_account_id uuid not null references public.accounts(account_id) on delete restrict,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','published')),
  reason text not null, impact text not null, created_at timestamptz not null default now(), published_version_id uuid
);
alter table public.amendment_sessions drop constraint if exists amendment_sessions_base_version_id_fkey;
alter table public.amendment_sessions drop constraint if exists amendment_sessions_published_version_id_fkey;
alter table public.amendment_sessions drop constraint if exists amendment_base_same_round_fk;
alter table public.amendment_sessions drop constraint if exists amendment_published_same_round_fk;
alter table public.amendment_sessions add constraint amendment_base_same_round_fk foreign key (round_id,base_version_id) references public.round_record_versions(round_id,round_record_version_id) on delete restrict;
alter table public.amendment_sessions add constraint amendment_published_same_round_fk foreign key (round_id,published_version_id) references public.round_record_versions(round_id,round_record_version_id) on delete restrict;
create table if not exists public.security_audit_log (
  audit_id bigint generated always as identity primary key, actor_account_id uuid references public.accounts(account_id) on delete restrict,
  device_id uuid references public.devices(device_id) on delete set null, action text not null, entity_type text not null, entity_id text not null,
  detail jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);
create or replace function public.prevent_round_record_mutation() returns trigger language plpgsql as $$ begin raise exception 'RoundRecord versions are immutable'; end $$;
drop trigger if exists round_record_versions_immutable on public.round_record_versions;
create trigger round_record_versions_immutable before update or delete on public.round_record_versions for each row execute function public.prevent_round_record_mutation();
create or replace function public.prevent_audit_mutation() returns trigger language plpgsql as $$ begin raise exception 'Security audit history is append-only'; end $$;
drop trigger if exists security_audit_log_immutable on public.security_audit_log;
create trigger security_audit_log_immutable before update or delete on public.security_audit_log for each row execute function public.prevent_audit_mutation();

alter table public.authoritative_rounds enable row level security; alter table public.round_access enable row level security;
alter table public.round_participations enable row level security; alter table public.scoring_assignments enable row level security;
alter table public.round_record_versions enable row level security; alter table public.amendment_sessions enable row level security; alter table public.security_audit_log enable row level security;
create or replace function public.is_round_member(target_round_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.authoritative_rounds r where r.round_id=target_round_id and r.owner_account_id=auth.uid())
    or exists(select 1 from public.round_access a where a.round_id=target_round_id and a.account_id=auth.uid());
$$;
create or replace function public.is_round_owner(target_round_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.authoritative_rounds r where r.round_id=target_round_id and r.owner_account_id=auth.uid());
$$;
revoke all on function public.is_round_member(uuid), public.is_round_owner(uuid) from public;
grant execute on function public.is_round_member(uuid), public.is_round_owner(uuid) to authenticated;
drop policy if exists round_access_visible on public.round_access;
create policy round_access_visible on public.round_access for select to authenticated using (public.is_round_member(round_id));
drop policy if exists round_access_owner_insert on public.round_access;
create policy round_access_owner_insert on public.round_access for insert to authenticated with check(public.is_round_owner(round_id));
drop policy if exists round_access_owner_update on public.round_access;
create policy round_access_owner_update on public.round_access for update to authenticated using(public.is_round_owner(round_id)) with check(public.is_round_owner(round_id));
drop policy if exists rounds_member_select on public.authoritative_rounds;
create policy rounds_member_select on public.authoritative_rounds for select to authenticated using (public.is_round_member(round_id) or owner_account_id=auth.uid());
drop policy if exists rounds_owner_insert on public.authoritative_rounds;
create policy rounds_owner_insert on public.authoritative_rounds for insert to authenticated with check(owner_account_id=auth.uid());
drop policy if exists rounds_owner_update on public.authoritative_rounds;
-- Direct pointer/ownership updates remain denied; publication and ownership transfer use reviewed functions.
drop policy if exists round_record_member_select on public.round_record_versions;
create policy round_record_member_select on public.round_record_versions for select to authenticated using(public.is_round_member(round_id));
drop policy if exists round_record_owner_insert on public.round_record_versions;
-- Direct version insertion remains denied; publish_round_record_version is the only browser path.
drop policy if exists participation_member_select on public.round_participations;
create policy participation_member_select on public.round_participations for select to authenticated using(public.is_round_member(round_id));
drop policy if exists participation_owner_insert on public.round_participations;
create policy participation_owner_insert on public.round_participations for insert to authenticated with check(public.is_round_owner(round_id));
drop policy if exists scoring_member_select on public.scoring_assignments;
create policy scoring_member_select on public.scoring_assignments for select to authenticated using(public.is_round_member(round_id));
drop policy if exists scoring_owner_all on public.scoring_assignments;
create policy scoring_owner_all on public.scoring_assignments for all to authenticated using(public.is_round_owner(round_id)) with check(public.is_round_owner(round_id));
drop policy if exists amendment_member_select on public.amendment_sessions;
create policy amendment_member_select on public.amendment_sessions for select to authenticated using(public.is_round_member(round_id));
drop policy if exists amendment_participant_propose on public.amendment_sessions;
create policy amendment_participant_propose on public.amendment_sessions for insert to authenticated with check(proposed_by_account_id=auth.uid() and (public.is_round_owner(round_id) or exists(select 1 from public.round_access a where a.round_id=amendment_sessions.round_id and a.account_id=auth.uid() and a.role='participant')));
drop policy if exists audit_round_member_select on public.security_audit_log;
create policy audit_round_member_select on public.security_audit_log for select to authenticated using(
  case
    when entity_type = 'round' and entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_round_member(entity_id::uuid)
    else false
  end
);

create or replace function public.create_authoritative_round() returns public.authoritative_rounds
language plpgsql security definer set search_path = '' as $$
declare created public.authoritative_rounds;
begin
  if auth.uid() is null or not exists(select 1 from public.accounts a where a.account_id=auth.uid()) then raise exception 'durable Account required' using errcode='42501'; end if;
  insert into public.authoritative_rounds(owner_account_id) values(auth.uid()) returning * into created;
  insert into public.security_audit_log(actor_account_id,action,entity_type,entity_id) values(auth.uid(),'round.created','round',created.round_id::text);
  return created;
end $$;
revoke all on function public.create_authoritative_round() from public,anon;
grant execute on function public.create_authoritative_round() to authenticated;

create or replace function public.set_round_access(target_round_id uuid,target_account_id uuid,target_role text) returns public.round_access
language plpgsql security definer set search_path = '' as $$
declare changed public.round_access;
begin
  if not public.is_round_owner(target_round_id) then raise exception 'Round Owner authorization required' using errcode='42501'; end if;
  if target_role not in ('participant','viewer') then raise exception 'invalid Round access role'; end if;
  insert into public.round_access(round_id,account_id,role) values(target_round_id,target_account_id,target_role)
    on conflict(round_id,account_id) do update set role=excluded.role returning * into changed;
  insert into public.security_audit_log(actor_account_id,action,entity_type,entity_id,detail) values(auth.uid(),'round.access_set','round',target_round_id::text,jsonb_build_object('accountId',target_account_id,'role',target_role));
  return changed;
end $$;
revoke all on function public.set_round_access(uuid,uuid,text) from public,anon;
grant execute on function public.set_round_access(uuid,uuid,text) to authenticated;

create or replace function public.publish_round_record_version(
  target_round_id uuid, expected_current_version_id uuid, next_record jsonb,
  publish_reason text, publish_impact text, target_amendment_session_id uuid default null
) returns public.round_record_versions
language plpgsql security definer set search_path = '' as $$
declare r public.authoritative_rounds; prior public.round_record_versions; created public.round_record_versions; next_number integer;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if next_record is null or btrim(coalesce(publish_reason,''))='' or btrim(coalesce(publish_impact,''))='' then raise exception 'record, reason, and impact are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_round_id::text, 0));
  select * into r from public.authoritative_rounds where round_id=target_round_id for update;
  if r.round_id is null or r.owner_account_id<>auth.uid() then raise exception 'Round Owner authorization required' using errcode='42501'; end if;
  if r.current_version_id is distinct from expected_current_version_id then raise exception 'stale current RoundRecord version'; end if;
  if r.current_version_id is null then next_number:=1; else
    select * into prior from public.round_record_versions where round_id=target_round_id and round_record_version_id=r.current_version_id;
    if prior.round_record_version_id is null then raise exception 'current RoundRecord version is invalid'; end if;
    next_number:=prior.version_number+1;
  end if;
  if target_amendment_session_id is not null and not exists(select 1 from public.amendment_sessions a where a.amendment_session_id=target_amendment_session_id and a.round_id=target_round_id and a.base_version_id is not distinct from r.current_version_id and a.status in ('proposed','accepted')) then raise exception 'valid Amendment Session required'; end if;
  insert into public.round_record_versions(round_id,version_number,prior_version_id,record,published_by_account_id,reason,impact)
    values(target_round_id,next_number,r.current_version_id,next_record,auth.uid(),btrim(publish_reason),btrim(publish_impact)) returning * into created;
  update public.authoritative_rounds set current_version_id=created.round_record_version_id where round_id=target_round_id;
  if target_amendment_session_id is not null then update public.amendment_sessions set status='published',published_version_id=created.round_record_version_id where amendment_session_id=target_amendment_session_id; end if;
  insert into public.security_audit_log(actor_account_id,action,entity_type,entity_id,detail) values(auth.uid(),'round_record.published','round',target_round_id::text,jsonb_build_object('versionId',created.round_record_version_id,'versionNumber',created.version_number,'priorVersionId',created.prior_version_id,'reason',created.reason,'impact',created.impact,'amendmentSessionId',target_amendment_session_id));
  return created;
end $$;
revoke all on function public.publish_round_record_version(uuid,uuid,jsonb,text,text,uuid) from public, anon;
grant execute on function public.publish_round_record_version(uuid,uuid,jsonb,text,text,uuid) to authenticated;

revoke all on public.authoritative_rounds, public.round_access, public.round_participations, public.scoring_assignments, public.round_record_versions, public.amendment_sessions, public.security_audit_log from anon;
revoke insert,update,delete on public.authoritative_rounds,public.round_access,public.round_record_versions,public.security_audit_log from authenticated;
grant select on public.authoritative_rounds, public.round_access to authenticated; grant select, insert, update on public.round_participations, public.scoring_assignments to authenticated; grant select on public.security_audit_log to authenticated;
grant select on public.round_record_versions to authenticated; grant select, insert on public.amendment_sessions to authenticated;

commit;
