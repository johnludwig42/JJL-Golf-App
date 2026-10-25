-- STAGING BASELINE REVIEW ONLY. Do not paste the raw source dump into Supabase.
-- Execute only using run-baseline-review.ps1 after reviewing BASELINE_PACKAGE.md.
-- Source SHA-256: fe9f0ab2825feb1bda658bf35e8e44eaedb01cb4f00843950dc9362139bb7f73
-- SQL guard is operator confirmation, not independent database-project detection.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL check_function_bodies = false;
SET LOCAL search_path = '';
DO $guard$
BEGIN
 IF current_setting('dye.staging_baseline_authorized',true) IS DISTINCT FROM 'darbakmabpbkikisadop' OR current_user <> 'postgres' THEN
  RAISE EXCEPTION 'Staging baseline requires the pinned staging wrapper and postgres';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S'))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('revise_approved_course','publish_course_draft_atomic','publish_shared_match_owner','publish_course','course_library_can_write','course_library_is_maintainer','stamp_shared_match_owner','shared_match_is_member','join_shared_match','shared_match_is_organizer','provision_durable_account','create_my_claimed_golfer_identity'))
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('auth.users') AND tgname='provision_durable_account_after_auth_user') THEN
  RAISE EXCEPTION 'Expected empty application baseline; stop rather than overwrite existing objects';
 END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL THEN
  RAISE EXCEPTION 'Supabase Auth prerequisites absent';
 END IF;
END $guard$;
CREATE FUNCTION public.course_library_can_write() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.course_library_roles r
      where r.user_id = auth.uid() and (r.can_create_drafts or r.is_maintainer));
$$;

CREATE FUNCTION public.course_library_is_maintainer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.course_library_roles r
      where r.user_id = auth.uid() and r.is_maintainer);
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.golfer_identities (
    golfer_identity_id uuid DEFAULT gen_random_uuid() NOT NULL,
    claim_status text DEFAULT 'unclaimed'::text NOT NULL,
    claimed_by_account_id uuid,
    display_name text,
    email text,
    phone text,
    ghin text,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by_account_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT golfer_identities_check CHECK (((claim_status = 'claimed'::text) = (claimed_by_account_id IS NOT NULL))),
    CONSTRAINT golfer_identities_claim_status_check CHECK ((claim_status = ANY (ARRAY['claimed'::text, 'unclaimed'::text])))
);

COMMENT ON TABLE public.golfer_identities IS 'Permanent identity; mutable profile attributes are never identity keys.';

CREATE FUNCTION public.create_my_claimed_golfer_identity(p_display_name text, p_nickname text DEFAULT NULL::text) RETURNS public.golfer_identities
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_account_id uuid := auth.uid();
  v_display_name text := regexp_replace(trim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  v_nickname text := nullif(regexp_replace(trim(coalesce(p_nickname, '')), '\s+', ' ', 'g'), '');
  v_identity public.golfer_identities;
begin
  if v_account_id is null then
    raise exception 'A durable authenticated Account is required.' using errcode = '42501';
  end if;
  if char_length(v_display_name) < 2 or char_length(v_display_name) > 120 then
    raise exception 'Full name must contain between 2 and 120 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_nickname, '')) > 80 then
    raise exception 'Nickname must contain 80 characters or fewer.' using errcode = '22023';
  end if;
  insert into public.accounts(account_id)
  select u.id from auth.users u
  where u.id = v_account_id
    and coalesce(u.is_anonymous, false) = false
    and coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'anonymous'
  on conflict (account_id) do nothing;
  if not exists (select 1 from public.accounts a where a.account_id = v_account_id) then
    raise exception 'A durable authenticated Account is required.' using errcode = '42501';
  end if;
  select g.* into v_identity from public.golfer_identities g
  where g.claimed_by_account_id = v_account_id;
  if v_identity.golfer_identity_id is null then
    insert into public.golfer_identities(
      claim_status, claimed_by_account_id, display_name, profile, created_by_account_id
    ) values (
      'claimed', v_account_id, v_display_name,
      jsonb_strip_nulls(jsonb_build_object('nickname', v_nickname)), v_account_id
    ) returning * into v_identity;
  end if;
  insert into public.personal_golfer_library(account_id, golfer_identity_id)
  values (v_account_id, v_identity.golfer_identity_id)
  on conflict (account_id, golfer_identity_id) do nothing;
  return v_identity;
exception when unique_violation then
  select g.* into v_identity from public.golfer_identities g
  where g.claimed_by_account_id = v_account_id;
  if v_identity.golfer_identity_id is null then raise; end if;
  insert into public.personal_golfer_library(account_id, golfer_identity_id)
  values (v_account_id, v_identity.golfer_identity_id)
  on conflict (account_id, golfer_identity_id) do nothing;
  return v_identity;
end $$;

CREATE FUNCTION public.join_shared_match(p_match_code text, p_device_id text, p_device_label text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_code text := upper(trim(coalesce(p_match_code,''))); v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication session required' using errcode='42501'; end if;
  if v_code !~ '^DYE-[1-9][0-9]{5}$' and v_code !~ '^[A-Z0-9]{12}$' then
    raise exception 'Invalid Shared Match code' using errcode='22023';
  end if;
  if not exists (select 1 from public.matches where id=v_code and status='active') then
    raise exception 'Shared Match not found' using errcode='P0002';
  end if;
  if nullif(trim(coalesce(p_device_id,'')),'') is null then
    raise exception 'Device attribution required' using errcode='22023';
  end if;
  insert into public.match_memberships(id,match_id,user_id,role,status,joined_at,last_seen_at,device_label)
  values (v_code||':member:'||v_user::text||':'||left(trim(p_device_id),100), v_code, v_user, 'team_scorer', 'active', now(), now(), left(p_device_label,500))
  on conflict (id) do update set status='active', last_seen_at=now(), device_label=excluded.device_label;
  return v_code;
end $_$;

CREATE FUNCTION public.provision_durable_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if coalesce(new.is_anonymous, false) = false
     and coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'anonymous' then
    insert into public.accounts(account_id) values (new.id)
    on conflict (account_id) do nothing;
  end if;
  return new;
end $$;

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    city text,
    state text,
    country text DEFAULT 'USA'::text,
    hole_count integer DEFAULT 18,
    par_total integer,
    source text DEFAULT 'user'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    owner_user_id uuid DEFAULT auth.uid(),
    publication_status text DEFAULT 'draft'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    CONSTRAINT courses_publication_status_check CHECK ((publication_status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text, 'archived'::text])))
);

CREATE FUNCTION public.publish_course(p_course_id text) RETURNS public.courses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  result public.courses;
  v_course_id text := nullif(btrim(p_course_id), '');
begin
  if not public.course_library_is_maintainer() then
    raise exception 'Course maintainer authorization required' using errcode = '42501';
  end if;
  if v_course_id is null then
    raise exception 'Course id is required';
  end if;

  select * into result
  from public.courses
  where id::text = v_course_id
    and publication_status = 'draft'
  for update;
  if not found then
    raise exception 'Draft course not found';
  end if;

  if not exists (select 1 from public.course_tees tee where tee.course_id::text = v_course_id) then
    raise exception 'Course approval failed: at least one tee is required';
  end if;
  if exists (
    select 1
    from public.course_tees tee
    left join public.course_holes hole on hole.tee_id = tee.id
    where tee.course_id::text = v_course_id
    group by tee.id, tee.tee_name
    having count(hole.id) not in (9, 18)
  ) then
    raise exception 'Course approval failed: every tee must contain exactly 9 or 18 holes';
  end if;
  if exists (
    select 1
    from public.course_tees tee
    where tee.course_id::text = v_course_id
    group by lower(btrim(tee.tee_name)), tee.gender
    having count(*) > 1
  ) then
    raise exception 'Course approval failed: duplicate tee name and gender identities exist';
  end if;

  update public.courses
  set publication_status = 'approved',
      source = 'maintainer',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
  where id::text = v_course_id
    and publication_status = 'draft'
  returning * into result;
  if result.id is null then
    raise exception 'Draft course not found';
  end if;
  return result;
end $$;

CREATE FUNCTION public.publish_course_draft_atomic(p_course jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_course_id text := nullif(btrim(p_course->>'cloud_course_id'), '');
  v_course_row public.courses%rowtype;
  v_tee jsonb;
  v_tee_id text;
  v_tee_ids text[] := array[]::text[];
  v_hole jsonb;
  v_hole_count integer;
  v_tee_results jsonb := '[]'::jsonb;
  v_gender text;
  v_expected_tee_count integer;
begin
  if v_user_id is null or not public.course_library_can_write() then
    raise exception 'Course Library draft publishing is not authorized';
  end if;
  if nullif(btrim(p_course->>'name'), '') is null then
    raise exception 'Course name is required';
  end if;
  if jsonb_typeof(p_course->'tees') <> 'array' or jsonb_array_length(p_course->'tees') = 0 then
    raise exception 'At least one complete tee is required';
  end if;
  v_expected_tee_count := jsonb_array_length(p_course->'tees');
  if exists (
    select 1
    from jsonb_array_elements(p_course->'tees') as payload_tees(tee)
    group by lower(btrim(tee->>'tee_name')),
      case when upper(btrim(coalesce(tee->>'gender', 'M'))) = 'F' then 'F' else 'M' end
    having count(*) > 1
  ) then
    raise exception 'The course contains duplicate tee name and gender identities';
  end if;

  if v_course_id is not null then
    select * into v_course_row from public.courses where id::text = v_course_id for update;
    if not found then raise exception 'The selected cloud course draft no longer exists'; end if;
    if v_course_row.owner_user_id is distinct from v_user_id or v_course_row.publication_status <> 'draft' then
      raise exception 'Only the owning Account may update its draft course';
    end if;
    update public.courses set
      name = btrim(p_course->>'name'),
      city = nullif(btrim(p_course->>'city'), ''),
      state = nullif(btrim(p_course->>'state'), ''),
      country = coalesce(nullif(btrim(p_course->>'country'), ''), country),
      updated_at = now()
    where id::text = v_course_id
    returning * into v_course_row;
  else
    insert into public.courses(name, city, state, country, owner_user_id, publication_status, updated_at)
    values (
      btrim(p_course->>'name'), nullif(btrim(p_course->>'city'), ''), nullif(btrim(p_course->>'state'), ''),
      coalesce(nullif(btrim(p_course->>'country'), ''), 'United States of America'), v_user_id, 'draft', now()
    ) returning * into v_course_row;
    v_course_id := v_course_row.id::text;
  end if;

  for v_tee in select value from jsonb_array_elements(p_course->'tees')
  loop
    if nullif(btrim(v_tee->>'tee_name'), '') is null then raise exception 'Every tee requires a name'; end if;
    v_gender := case when upper(btrim(coalesce(v_tee->>'gender', 'M'))) = 'F' then 'F' else 'M' end;
    if jsonb_typeof(v_tee->'holes') <> 'array' then raise exception '% tee has no hole data', v_tee->>'tee_name'; end if;
    v_hole_count := jsonb_array_length(v_tee->'holes');
    if v_hole_count not in (9, 18) then raise exception '% tee must contain exactly 9 or 18 holes; found %', v_tee->>'tee_name', v_hole_count; end if;
    if (select count(distinct (value->>'hole_number')::integer) from jsonb_array_elements(v_tee->'holes')) <> v_hole_count then
      raise exception '% tee contains duplicate hole numbers', v_tee->>'tee_name';
    end if;

    v_tee_id := nullif(btrim(v_tee->>'cloud_tee_id'), '');
    if v_tee_id is not null and not exists (
      select 1 from public.course_tees
      where id::text = v_tee_id
        and course_id::text = v_course_id
        and lower(btrim(tee_name)) = lower(btrim(v_tee->>'tee_name'))
        and gender = v_gender
    ) then v_tee_id := null; end if;
    if v_tee_id is null then
      select id::text into v_tee_id from public.course_tees
      where course_id::text = v_course_id
        and lower(btrim(tee_name)) = lower(btrim(v_tee->>'tee_name'))
        and gender = v_gender
      limit 1 for update;
    end if;
    if v_tee_id is null then
      insert into public.course_tees(course_id, tee_name, gender, rating, slope, total_yards, updated_at)
      values (v_course_row.id, btrim(v_tee->>'tee_name'),
        v_gender,
        nullif(v_tee->>'rating', '')::numeric, nullif(v_tee->>'slope', '')::integer,
        nullif(v_tee->>'total_yards', '')::integer, now())
      returning id::text into v_tee_id;
    else
      update public.course_tees set
        tee_name = btrim(v_tee->>'tee_name'),
        gender = v_gender,
        rating = nullif(v_tee->>'rating', '')::numeric, slope = nullif(v_tee->>'slope', '')::integer,
        total_yards = nullif(v_tee->>'total_yards', '')::integer, updated_at = now()
      where id::text = v_tee_id;
    end if;
    v_tee_ids := array_append(v_tee_ids, v_tee_id);

    for v_hole in select value from jsonb_array_elements(v_tee->'holes')
    loop
      insert into public.course_holes(course_id, tee_id, hole_number, par, handicap_index, yardage, updated_at)
      values (v_course_row.id, (select id from public.course_tees where id::text = v_tee_id),
        (v_hole->>'hole_number')::integer, nullif(v_hole->>'par', '')::integer,
        nullif(v_hole->>'handicap_index', '')::integer, nullif(v_hole->>'yardage', '')::integer, now())
      on conflict (tee_id, hole_number) do update set
        course_id = excluded.course_id, par = excluded.par, handicap_index = excluded.handicap_index,
        yardage = excluded.yardage, updated_at = excluded.updated_at;
    end loop;
    delete from public.course_holes
    where tee_id::text = v_tee_id
      and hole_number not in (select (value->>'hole_number')::integer from jsonb_array_elements(v_tee->'holes'));
    v_tee_results := v_tee_results || jsonb_build_array(jsonb_build_object(
      'tee_id', v_tee_id, 'tee_name', v_tee->>'tee_name', 'gender', v_gender, 'hole_count', v_hole_count
    ));
  end loop;

  delete from public.course_tees where course_id::text = v_course_id and not (id::text = any(v_tee_ids));
  if cardinality(v_tee_ids) <> v_expected_tee_count
    or (select count(distinct tee_id) from unnest(v_tee_ids) as ids(tee_id)) <> v_expected_tee_count
    or (select count(*) from public.course_tees where course_id::text = v_course_id) <> v_expected_tee_count
  then
    raise exception 'Cloud tee verification failed: expected % distinct tees', v_expected_tee_count;
  end if;
  if exists (
    select 1
    from public.course_tees tee
    where tee.course_id::text = v_course_id
      and (select count(*) from public.course_holes hole where hole.tee_id = tee.id) not in (9, 18)
  ) then
    raise exception 'Cloud hole verification failed: every tee must retain 9 or 18 holes';
  end if;
  return jsonb_build_object('course_id', v_course_id, 'owner_user_id', v_user_id, 'tees', v_tee_results);
end;
$$;

CREATE FUNCTION public.publish_shared_match_owner(p_match jsonb, p_device_id text, p_device_label text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user uuid := auth.uid();
  v_match public.matches;
  v_existing_owner uuid;
  v_code text := upper(trim(coalesce(p_match ->> 'id', '')));
  v_device text := left(trim(coalesce(p_device_id, '')), 100);
begin
  if v_user is null then
    raise exception 'Authentication session required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = v_user
      and coalesce(u.is_anonymous, false) = false
      and coalesce(u.raw_app_meta_data ->> 'provider', '') <> 'anonymous'
  ) then
    raise exception 'A durable authenticated Account is required' using errcode = '42501';
  end if;
  if v_code !~ '^DYE-[1-9][0-9]{5}$' and v_code !~ '^[A-Z0-9]{12}$' then
    raise exception 'Invalid Shared Match code' using errcode = '22023';
  end if;
  if v_device = '' then
    raise exception 'Device attribution required' using errcode = '22023';
  end if;
  select m.created_by into v_existing_owner from public.matches m where m.id = v_code;
  if found and v_existing_owner is distinct from v_user then
    raise exception 'Shared Match Owner authorization required' using errcode = '42501';
  end if;
  v_match := jsonb_populate_record(null::public.matches, p_match);
  v_match.id := v_code;
  v_match.created_by := v_user;
  insert into public.matches select (v_match).*
  on conflict (id) do nothing;
  insert into public.match_memberships(
    id, match_id, user_id, role, status, joined_at, last_seen_at, device_label
  ) values (
    v_code || ':member:' || v_user::text || ':' || v_device,
    v_code, v_user, 'organizer', 'active', now(), now(),
    left(p_device_label, 500)
  ) on conflict (id) do update set
    status = 'active', last_seen_at = now(), device_label = excluded.device_label;
  return v_code;
end $_$;

CREATE FUNCTION public.revise_approved_course(p_course_id text) RETURNS public.courses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  result public.courses;
begin
  if auth.uid() is null or not public.course_library_is_maintainer()
     or not public.course_library_can_write() then
    raise exception 'Course maintainer authorization required' using errcode = '42501';
  end if;
  -- Existing atomic publishing only accepts an Account's own user draft.
  -- Prior approval attribution remains available until reapproval.
  update public.courses
  set publication_status = 'draft', owner_user_id = auth.uid(),
      source = 'user', updated_at = now()
  where id::text = nullif(btrim(p_course_id), '')
    and publication_status = 'approved'
  returning * into result;
  if result.id is null then
    raise exception 'Approved course not found; refresh the Course Library';
  end if;
  return result;
end $$;

CREATE FUNCTION public.shared_match_is_member(p_match_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select auth.uid() is not null and (
    exists (select 1 from public.matches m where m.id = p_match_id and m.created_by = auth.uid())
    or exists (select 1 from public.match_memberships mm
      where mm.match_id = p_match_id and mm.user_id = auth.uid() and mm.status = 'active')
  );
$$;

CREATE FUNCTION public.shared_match_is_organizer(p_match_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select auth.uid() is not null and (
    exists (select 1 from public.matches m where m.id = p_match_id and m.created_by = auth.uid())
    or exists (select 1 from public.match_memberships mm
      where mm.match_id = p_match_id and mm.user_id = auth.uid()
        and mm.status = 'active' and mm.role = 'organizer')
  );
$$;

CREATE FUNCTION public.stamp_shared_match_owner() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end $$;

CREATE TABLE public.account_providers (
    account_id uuid NOT NULL,
    provider text NOT NULL,
    provider_subject_hash text NOT NULL,
    verified_at timestamp with time zone NOT NULL
);

CREATE TABLE public.accounts (
    account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    match_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    action text NOT NULL,
    actor_user_id uuid,
    actor_role text,
    actor_team_id text,
    hole_number integer,
    field_name text,
    old_value jsonb,
    new_value jsonb,
    context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;

CREATE TABLE public.course_holes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    hole_number integer NOT NULL,
    par integer,
    handicap_index integer,
    yards integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tee_id uuid NOT NULL,
    yardage integer
);

CREATE TABLE public.course_library_roles (
    user_id uuid NOT NULL,
    can_create_drafts boolean DEFAULT true NOT NULL,
    is_maintainer boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.course_tees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    tee_name text NOT NULL,
    rating numeric,
    slope integer,
    total_yards integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    gender text DEFAULT 'M'::text NOT NULL,
    CONSTRAINT course_tees_gender_check CHECK ((gender = ANY (ARRAY['M'::text, 'F'::text])))
);

CREATE TABLE public.devices (
    device_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone
);

CREATE TABLE public.match_memberships (
    id text NOT NULL,
    match_id text NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    team_id text,
    team_number integer,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    device_label text,
    CONSTRAINT match_memberships_role_check CHECK ((role = ANY (ARRAY['organizer'::text, 'team_scorer'::text, 'viewer'::text]))),
    CONSTRAINT match_memberships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);

CREATE TABLE public.match_notes (
    match_id text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);

CREATE TABLE public.match_players (
    id text NOT NULL,
    match_id text NOT NULL,
    player_id text NOT NULL,
    team_id text NOT NULL,
    team_number integer NOT NULL,
    slot integer NOT NULL,
    player_name text NOT NULL,
    player_index numeric DEFAULT 0 NOT NULL,
    tee_id text,
    tee_name text,
    course_handicap numeric DEFAULT 0 NOT NULL,
    playing_handicap numeric DEFAULT 0 NOT NULL,
    handicap_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.match_teams (
    id text NOT NULL,
    match_id text NOT NULL,
    team_number integer NOT NULL,
    team_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.matches (
    id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    name text NOT NULL,
    match_date date NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    course_id text,
    reference_tee_id text,
    course_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    format text DEFAULT 'teams'::text NOT NULL,
    allowance numeric DEFAULT 100 NOT NULL,
    hole_count integer DEFAULT 18 NOT NULL,
    nine_hole_segment text DEFAULT 'front'::text NOT NULL,
    custom_start_hole integer DEFAULT 1 NOT NULL,
    team_count integer DEFAULT 1 NOT NULL,
    players_per_team integer DEFAULT 1 NOT NULL,
    scoring_access_mode text DEFAULT 'team_codes'::text NOT NULL,
    stat_tracking_enabled boolean DEFAULT false NOT NULL,
    selected_games jsonb DEFAULT '[]'::jsonb NOT NULL,
    match_status_game text,
    momentum_game text,
    momentum_perspective integer DEFAULT 1 NOT NULL,
    locked_after_start boolean DEFAULT false NOT NULL,
    setup_locked_at timestamp with time zone,
    completed_at timestamp with time zone,
    last_touched_hole integer DEFAULT 0 NOT NULL,
    last_fully_completed_hole integer DEFAULT 0 NOT NULL,
    CONSTRAINT matches_hole_count_check CHECK ((hole_count = ANY (ARRAY[9, 18]))),
    CONSTRAINT matches_scoring_access_mode_check CHECK ((scoring_access_mode = ANY (ARRAY['single_device'::text, 'team_codes'::text, 'open_edit'::text]))),
    CONSTRAINT matches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'complete'::text])))
);

CREATE TABLE public.personal_golfer_library (
    account_id uuid NOT NULL,
    golfer_identity_id uuid NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.score_entries (
    id text NOT NULL,
    match_id text NOT NULL,
    match_player_id text NOT NULL,
    player_id text NOT NULL,
    team_id text NOT NULL,
    team_number integer NOT NULL,
    hole_number integer NOT NULL,
    gross integer,
    putts integer,
    fairway boolean,
    green boolean,
    up_and_down boolean,
    sandy boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    entry_status text DEFAULT 'active'::text NOT NULL
);

CREATE TABLE public.team_access_codes (
    id text NOT NULL,
    match_id text NOT NULL,
    team_id text NOT NULL,
    team_number integer NOT NULL,
    role text DEFAULT 'team_scorer'::text NOT NULL,
    code_hash text NOT NULL,
    code_last4 text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    expires_at timestamp with time zone,
    claimed_at timestamp with time zone,
    claimed_by_user_id uuid,
    claimed_device_label text,
    claimed_session_id text,
    CONSTRAINT team_access_codes_role_check CHECK ((role = ANY (ARRAY['team_scorer'::text, 'viewer'::text]))),
    CONSTRAINT team_access_codes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text, 'claimed'::text])))
);

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);

ALTER TABLE ONLY public.account_providers
    ADD CONSTRAINT account_providers_account_id_provider_key UNIQUE (account_id, provider);

ALTER TABLE ONLY public.account_providers
    ADD CONSTRAINT account_providers_pkey PRIMARY KEY (provider, provider_subject_hash);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (account_id);

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.course_holes
    ADD CONSTRAINT course_holes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.course_holes
    ADD CONSTRAINT course_holes_tee_id_hole_number_key UNIQUE (tee_id, hole_number);

ALTER TABLE ONLY public.course_library_roles
    ADD CONSTRAINT course_library_roles_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.course_tees
    ADD CONSTRAINT course_tees_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);

ALTER TABLE ONLY public.golfer_identities
    ADD CONSTRAINT golfer_identities_claimed_by_account_id_key UNIQUE (claimed_by_account_id);

ALTER TABLE ONLY public.golfer_identities
    ADD CONSTRAINT golfer_identities_pkey PRIMARY KEY (golfer_identity_id);

ALTER TABLE ONLY public.match_memberships
    ADD CONSTRAINT match_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.match_notes
    ADD CONSTRAINT match_notes_pkey PRIMARY KEY (match_id);

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_match_id_player_id_key UNIQUE (match_id, player_id);

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.match_teams
    ADD CONSTRAINT match_teams_match_id_team_number_key UNIQUE (match_id, team_number);

ALTER TABLE ONLY public.match_teams
    ADD CONSTRAINT match_teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.personal_golfer_library
    ADD CONSTRAINT personal_golfer_library_pkey PRIMARY KEY (account_id, golfer_identity_id);

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_match_id_match_player_id_hole_number_key UNIQUE (match_id, match_player_id, hole_number);

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.team_access_codes
    ADD CONSTRAINT team_access_codes_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX course_holes_course_tee_hole_unique_idx ON public.course_holes USING btree (course_id, tee_id, hole_number);

CREATE UNIQUE INDEX course_tees_course_name_gender_key ON public.course_tees USING btree (course_id, lower(btrim(tee_name)), gender);

CREATE UNIQUE INDEX courses_name_unique_idx ON public.courses USING btree (lower(name));

CREATE INDEX idx_audit_log_match_id ON public.audit_log USING btree (match_id);

CREATE INDEX idx_match_memberships_match_id ON public.match_memberships USING btree (match_id);

CREATE INDEX idx_match_players_match_id ON public.match_players USING btree (match_id);

CREATE INDEX idx_match_teams_match_id ON public.match_teams USING btree (match_id);

CREATE INDEX idx_score_entries_match_id ON public.score_entries USING btree (match_id);

CREATE TRIGGER stamp_shared_match_owner_before_insert BEFORE INSERT ON public.matches FOR EACH ROW EXECUTE FUNCTION public.stamp_shared_match_owner();

ALTER TABLE ONLY public.account_providers
    ADD CONSTRAINT account_providers_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.course_holes
    ADD CONSTRAINT course_holes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.course_holes
    ADD CONSTRAINT course_holes_tee_id_fkey FOREIGN KEY (tee_id) REFERENCES public.course_tees(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.course_library_roles
    ADD CONSTRAINT course_library_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.course_tees
    ADD CONSTRAINT course_tees_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id) ON DELETE SET NULL;

ALTER TABLE ONLY public.golfer_identities
    ADD CONSTRAINT golfer_identities_claimed_by_account_id_fkey FOREIGN KEY (claimed_by_account_id) REFERENCES public.accounts(account_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.golfer_identities
    ADD CONSTRAINT golfer_identities_created_by_account_id_fkey FOREIGN KEY (created_by_account_id) REFERENCES public.accounts(account_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.match_memberships
    ADD CONSTRAINT match_memberships_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.match_notes
    ADD CONSTRAINT match_notes_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.match_teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.match_teams
    ADD CONSTRAINT match_teams_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.personal_golfer_library
    ADD CONSTRAINT personal_golfer_library_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(account_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.personal_golfer_library
    ADD CONSTRAINT personal_golfer_library_golfer_identity_id_fkey FOREIGN KEY (golfer_identity_id) REFERENCES public.golfer_identities(golfer_identity_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_match_player_id_fkey FOREIGN KEY (match_player_id) REFERENCES public.match_players(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.score_entries
    ADD CONSTRAINT score_entries_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.match_teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_access_codes
    ADD CONSTRAINT team_access_codes_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_access_codes
    ADD CONSTRAINT team_access_codes_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.match_teams(id) ON DELETE CASCADE;

ALTER TABLE public.account_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_providers_owner_select ON public.account_providers FOR SELECT TO authenticated USING ((account_id = auth.uid()));

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_self_insert ON public.accounts FOR INSERT TO authenticated WITH CHECK ((account_id = auth.uid()));

CREATE POLICY accounts_self_select ON public.accounts FOR SELECT TO authenticated USING ((account_id = auth.uid()));

CREATE POLICY accounts_self_update ON public.accounts FOR UPDATE TO authenticated USING ((account_id = auth.uid())) WITH CHECK ((account_id = auth.uid()));

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_member_insert ON public.audit_log FOR INSERT TO authenticated WITH CHECK ((public.shared_match_is_member(match_id) AND (actor_user_id = auth.uid())));

CREATE POLICY audit_member_select ON public.audit_log FOR SELECT TO authenticated USING (public.shared_match_is_member(match_id));

ALTER TABLE public.course_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_holes_authorized_write ON public.course_holes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE ((c.id = course_holes.course_id) AND (public.course_library_is_maintainer() OR (public.course_library_can_write() AND (c.owner_user_id = auth.uid()) AND (c.publication_status = 'draft'::text))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE ((c.id = course_holes.course_id) AND (public.course_library_is_maintainer() OR (public.course_library_can_write() AND (c.owner_user_id = auth.uid()) AND (c.publication_status = 'draft'::text)))))) AND (EXISTS ( SELECT 1
   FROM public.course_tees t
  WHERE ((t.id = course_holes.tee_id) AND (t.course_id = course_holes.course_id))))));

CREATE POLICY course_holes_public_read ON public.course_holes FOR SELECT TO authenticated, anon USING (((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE (c.id = course_holes.course_id))) AND (EXISTS ( SELECT 1
   FROM public.course_tees t
  WHERE ((t.id = course_holes.tee_id) AND (t.course_id = course_holes.course_id))))));

ALTER TABLE public.course_library_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.course_tees ENABLE ROW LEVEL SECURITY;

CREATE POLICY course_tees_authorized_write ON public.course_tees TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE ((c.id = course_tees.course_id) AND (public.course_library_is_maintainer() OR (public.course_library_can_write() AND (c.owner_user_id = auth.uid()) AND (c.publication_status = 'draft'::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE ((c.id = course_tees.course_id) AND (public.course_library_is_maintainer() OR (public.course_library_can_write() AND (c.owner_user_id = auth.uid()) AND (c.publication_status = 'draft'::text)))))));

CREATE POLICY course_tees_public_read ON public.course_tees FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.courses c
  WHERE (c.id = course_tees.course_id))));

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_authorized_delete ON public.courses FOR DELETE TO authenticated USING ((public.course_library_is_maintainer() OR (public.course_library_can_write() AND (owner_user_id = auth.uid()) AND (publication_status = 'draft'::text))));

CREATE POLICY courses_authorized_insert ON public.courses FOR INSERT TO authenticated WITH CHECK ((public.course_library_can_write() AND (owner_user_id = auth.uid()) AND (publication_status = 'draft'::text)));

CREATE POLICY courses_authorized_update ON public.courses FOR UPDATE TO authenticated USING ((public.course_library_is_maintainer() OR (public.course_library_can_write() AND (owner_user_id = auth.uid()) AND (publication_status = 'draft'::text)))) WITH CHECK ((public.course_library_is_maintainer() OR (public.course_library_can_write() AND (owner_user_id = auth.uid()) AND (publication_status = 'draft'::text))));

CREATE POLICY courses_public_read ON public.courses FOR SELECT TO authenticated, anon USING (((publication_status = 'approved'::text) OR (owner_user_id = auth.uid())));

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY devices_owner_all ON public.devices TO authenticated USING ((account_id = auth.uid())) WITH CHECK ((account_id = auth.uid()));

ALTER TABLE public.golfer_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY golfer_library_visible ON public.golfer_identities FOR SELECT TO authenticated USING (((claimed_by_account_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.personal_golfer_library l
  WHERE ((l.account_id = auth.uid()) AND (l.golfer_identity_id = golfer_identities.golfer_identity_id))))));

CREATE POLICY golfer_unclaimed_insert ON public.golfer_identities FOR INSERT TO authenticated WITH CHECK (((claim_status = 'unclaimed'::text) AND (claimed_by_account_id IS NULL) AND (created_by_account_id = auth.uid())));

ALTER TABLE public.match_memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.match_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.match_teams ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY matches_member_select ON public.matches FOR SELECT TO authenticated USING (public.shared_match_is_member(id));

CREATE POLICY matches_member_update ON public.matches FOR UPDATE TO authenticated USING (public.shared_match_is_member(id)) WITH CHECK (public.shared_match_is_member(id));

CREATE POLICY matches_owner_insert ON public.matches FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));

CREATE POLICY memberships_member_select ON public.match_memberships FOR SELECT TO authenticated USING (public.shared_match_is_member(match_id));

CREATE POLICY memberships_owner_insert ON public.match_memberships FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.shared_match_is_organizer(match_id)));

CREATE POLICY memberships_self_update ON public.match_memberships FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.shared_match_is_organizer(match_id))) WITH CHECK (((user_id = auth.uid()) OR public.shared_match_is_organizer(match_id)));

CREATE POLICY notes_member_all ON public.match_notes TO authenticated USING (public.shared_match_is_member(match_id)) WITH CHECK ((public.shared_match_is_member(match_id) AND (COALESCE(updated_by, auth.uid()) = auth.uid())));

ALTER TABLE public.personal_golfer_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY personal_library_owner_all ON public.personal_golfer_library TO authenticated USING ((account_id = auth.uid())) WITH CHECK ((account_id = auth.uid()));

CREATE POLICY players_member_all ON public.match_players TO authenticated USING (public.shared_match_is_member(match_id)) WITH CHECK (public.shared_match_is_member(match_id));

ALTER TABLE public.score_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY scores_member_all ON public.score_entries TO authenticated USING (public.shared_match_is_member(match_id)) WITH CHECK ((public.shared_match_is_member(match_id) AND (COALESCE(updated_by, auth.uid()) = auth.uid())));

ALTER TABLE public.team_access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_member_all ON public.match_teams TO authenticated USING (public.shared_match_is_member(match_id)) WITH CHECK (public.shared_match_is_member(match_id));

-- Normalize inherited client-role grants on NEW application objects only.
REVOKE ALL ON TABLE public.golfer_identities FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.courses FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.account_providers FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.accounts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.course_holes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.course_library_roles FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.course_tees FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.devices FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.match_memberships FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.match_notes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.match_players FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.match_teams FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.matches FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.personal_golfer_library FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.score_entries FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.team_access_codes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.audit_log_id_seq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revise_approved_course(p_course_id text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_course_draft_atomic(p_course jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_shared_match_owner(p_match jsonb, p_device_id text, p_device_label text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_course(p_course_id text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.course_library_can_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.course_library_is_maintainer() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stamp_shared_match_owner() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.shared_match_is_member(p_match_id text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.join_shared_match(p_match_code text, p_device_id text, p_device_label text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.shared_match_is_organizer(p_match_id text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.provision_durable_account() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_my_claimed_golfer_identity(p_display_name text, p_nickname text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.course_library_can_write() FROM PUBLIC;
GRANT ALL ON FUNCTION public.course_library_can_write() TO authenticated;
GRANT ALL ON FUNCTION public.course_library_can_write() TO service_role;

REVOKE ALL ON FUNCTION public.course_library_is_maintainer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.course_library_is_maintainer() TO authenticated;
GRANT ALL ON FUNCTION public.course_library_is_maintainer() TO service_role;

GRANT ALL ON TABLE public.golfer_identities TO authenticated;
GRANT ALL ON TABLE public.golfer_identities TO service_role;

REVOKE ALL ON FUNCTION public.create_my_claimed_golfer_identity(p_display_name text, p_nickname text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_my_claimed_golfer_identity(p_display_name text, p_nickname text) TO authenticated;
GRANT ALL ON FUNCTION public.create_my_claimed_golfer_identity(p_display_name text, p_nickname text) TO service_role;

REVOKE ALL ON FUNCTION public.join_shared_match(p_match_code text, p_device_id text, p_device_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_shared_match(p_match_code text, p_device_id text, p_device_label text) TO authenticated;
GRANT ALL ON FUNCTION public.join_shared_match(p_match_code text, p_device_id text, p_device_label text) TO service_role;

REVOKE ALL ON FUNCTION public.provision_durable_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.provision_durable_account() TO service_role;

GRANT ALL ON TABLE public.courses TO service_role;
GRANT SELECT ON TABLE public.courses TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courses TO authenticated;

REVOKE ALL ON FUNCTION public.publish_course(p_course_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_course(p_course_id text) TO authenticated;
GRANT ALL ON FUNCTION public.publish_course(p_course_id text) TO service_role;

REVOKE ALL ON FUNCTION public.publish_course_draft_atomic(p_course jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_course_draft_atomic(p_course jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.publish_course_draft_atomic(p_course jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.publish_shared_match_owner(p_match jsonb, p_device_id text, p_device_label text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_shared_match_owner(p_match jsonb, p_device_id text, p_device_label text) TO authenticated;
GRANT ALL ON FUNCTION public.publish_shared_match_owner(p_match jsonb, p_device_id text, p_device_label text) TO service_role;

REVOKE ALL ON FUNCTION public.revise_approved_course(p_course_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revise_approved_course(p_course_id text) TO authenticated;
GRANT ALL ON FUNCTION public.revise_approved_course(p_course_id text) TO service_role;

REVOKE ALL ON FUNCTION public.shared_match_is_member(p_match_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.shared_match_is_member(p_match_id text) TO authenticated;
GRANT ALL ON FUNCTION public.shared_match_is_member(p_match_id text) TO service_role;

REVOKE ALL ON FUNCTION public.shared_match_is_organizer(p_match_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.shared_match_is_organizer(p_match_id text) TO authenticated;
GRANT ALL ON FUNCTION public.shared_match_is_organizer(p_match_id text) TO service_role;

REVOKE ALL ON FUNCTION public.stamp_shared_match_owner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_shared_match_owner() TO service_role;

GRANT ALL ON TABLE public.account_providers TO authenticated;
GRANT ALL ON TABLE public.account_providers TO service_role;

GRANT ALL ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO service_role;

GRANT ALL ON TABLE public.audit_log TO service_role;
GRANT SELECT,INSERT ON TABLE public.audit_log TO authenticated;

GRANT ALL ON SEQUENCE public.audit_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;

GRANT ALL ON TABLE public.course_holes TO service_role;
GRANT SELECT ON TABLE public.course_holes TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.course_holes TO authenticated;

GRANT ALL ON TABLE public.course_library_roles TO service_role;

GRANT ALL ON TABLE public.course_tees TO service_role;
GRANT SELECT ON TABLE public.course_tees TO anon;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.course_tees TO authenticated;

GRANT ALL ON TABLE public.devices TO authenticated;
GRANT ALL ON TABLE public.devices TO service_role;

GRANT ALL ON TABLE public.match_memberships TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.match_memberships TO authenticated;

GRANT ALL ON TABLE public.match_notes TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.match_notes TO authenticated;

GRANT ALL ON TABLE public.match_players TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.match_players TO authenticated;

GRANT ALL ON TABLE public.match_teams TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.match_teams TO authenticated;

GRANT ALL ON TABLE public.matches TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.matches TO authenticated;

GRANT ALL ON TABLE public.personal_golfer_library TO authenticated;
GRANT ALL ON TABLE public.personal_golfer_library TO service_role;

GRANT ALL ON TABLE public.score_entries TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.score_entries TO authenticated;

GRANT ALL ON TABLE public.team_access_codes TO service_role;
CREATE TRIGGER provision_durable_account_after_auth_user AFTER INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.provision_durable_account();
DO $verify$
BEGIN
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) <> 17
 OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public') <> 169
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public') <> 28 THEN
  RAISE EXCEPTION 'Unexpected baseline inventory; rollback rather than accept a partial installation';
 END IF;
END $verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;
