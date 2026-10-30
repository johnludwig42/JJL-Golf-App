-- Read-only evidence for synthetic staging round DYE-119214 only.
-- Run through the pinned staging command; never use this as a write test.
begin read only;
set local statement_timeout = '15s';
with target as (
  select id, status, shared_revision, shared_scores_closed, course_snapshot
  from public.matches where id = 'DYE-119214'
), scores as (
  select s.* from public.score_entries s join target t on t.id = s.match_id
), receipts as (
  select r.* from public.shared_score_operations r join target t on t.id = r.match_id
), devices as (
  select row_number() over(order by device_id) as device_number,
    count(*) as receipt_count, count(distinct score_entry_id) as distinct_score_cells,
    min(match_revision) as first_revision, max(match_revision) as last_revision,
    min(accepted_at) as first_accepted_at, max(accepted_at) as last_accepted_at,
    count(*) filter(where payload_hash !~ '^[0-9a-f]{64}$') as malformed_hashes
  from receipts group by device_id
), holes as (
  select team_number, hole_number, count(*) as partner_cells,
    count(distinct gross) as distinct_gross, min(gross) as gross
  from scores group by team_number, hole_number
)
select jsonb_build_object(
  'kind', 'staging-synthetic-round-receipts-v1',
  'captured_at', now(),
  'match_found', exists(select 1 from target),
  'match', (select jsonb_build_object('id',id,'status',status,
    'revision',shared_revision,'scores_closed',shared_scores_closed,
    'frozen',course_snapshot #> '{sharedMatchMeta,roundRecordSnapshot,isFrozen}',
    'snapshot_md5',md5(course_snapshot::text)) from target),
  'score_cells', (select count(*) from scores),
  'team_holes', (select count(*) from holes),
  'invalid_team_holes', (select count(*) from holes where partner_cells<>2
    or distinct_gross<>1 or gross is distinct from team_number+3),
  'score_cells_without_receipt', (select count(*) from scores s where not exists
    (select 1 from receipts r where r.score_entry_id=s.id)),
  'receipt_count', (select count(*) from receipts),
  'receipt_devices', (select coalesce(jsonb_agg(to_jsonb(d) order by device_number),'[]'::jsonb) from devices d),
  'score_rows_md5', (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb)::text) from scores s),
  'receipt_rows_md5', (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.operation_id),'[]'::jsonb)::text) from receipts r)
) as round_receipt_audit;
rollback;
