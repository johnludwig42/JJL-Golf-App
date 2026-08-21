-- Atomic v31.0.05 Course Library draft publishing.
begin;

create or replace function public.publish_course_draft_atomic(p_course jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    if jsonb_typeof(v_tee->'holes') <> 'array' then raise exception '% tee has no hole data', v_tee->>'tee_name'; end if;
    v_hole_count := jsonb_array_length(v_tee->'holes');
    if v_hole_count not in (9, 18) then raise exception '% tee must contain exactly 9 or 18 holes; found %', v_tee->>'tee_name', v_hole_count; end if;
    if (select count(distinct (value->>'hole_number')::integer) from jsonb_array_elements(v_tee->'holes')) <> v_hole_count then
      raise exception '% tee contains duplicate hole numbers', v_tee->>'tee_name';
    end if;

    v_tee_id := nullif(btrim(v_tee->>'cloud_tee_id'), '');
    if v_tee_id is not null and not exists (
      select 1 from public.course_tees where id::text = v_tee_id and course_id::text = v_course_id
    ) then v_tee_id := null; end if;
    if v_tee_id is null then
      select id::text into v_tee_id from public.course_tees
      where course_id::text = v_course_id
        and lower(btrim(tee_name)) = lower(btrim(v_tee->>'tee_name'))
      limit 1 for update;
    end if;
    if v_tee_id is null then
      insert into public.course_tees(course_id, tee_name, rating, slope, total_yards, updated_at)
      values (v_course_row.id, btrim(v_tee->>'tee_name'),
        nullif(v_tee->>'rating', '')::numeric, nullif(v_tee->>'slope', '')::integer,
        nullif(v_tee->>'total_yards', '')::integer, now())
      returning id::text into v_tee_id;
    else
      update public.course_tees set
        tee_name = btrim(v_tee->>'tee_name'),
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
      'tee_id', v_tee_id, 'tee_name', v_tee->>'tee_name', 'gender', coalesce(nullif(v_tee->>'gender', ''), 'M'), 'hole_count', v_hole_count
    ));
  end loop;

  delete from public.course_tees where course_id::text = v_course_id and not (id::text = any(v_tee_ids));
  return jsonb_build_object('course_id', v_course_id, 'owner_user_id', v_user_id, 'tees', v_tee_results);
end;
$$;

revoke all on function public.publish_course_draft_atomic(jsonb) from public, anon;
grant execute on function public.publish_course_draft_atomic(jsonb) to authenticated;

commit;
