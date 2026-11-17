-- C1 contract for an approved staging database with pgTAP available.
-- All claims and data are synthetic; ROLLBACK removes the fixture.
begin;
select plan(40);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}', true);
set local role authenticated;

select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  repeat('0', 64),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '22023', 'BACKUP_HASH_MISMATCH', 'rejects a wrong round hash');
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  repeat('0', 64), '31.0.88'
)$sql$,
  '22023', 'BACKUP_HASH_MISMATCH', 'rejects a wrong players hash');
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-uppercase', '{"id":"wp-lib-c1-uppercase"}', '[]',
  upper(encode(sha256(convert_to('{"id":"wp-lib-c1-uppercase"}', 'UTF8')), 'hex')),
  encode(sha256(convert_to('[]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '22023', 'INVALID_BACKUP_INPUT', 'rejects an uppercase-hex round hash');
select throws_ok($sql$select * from public.backup_round(
  '   ', '{"id":"whitespace-local-id"}', '[]',
  encode(sha256(convert_to('{"id":"whitespace-local-id"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '22023', 'INVALID_BACKUP_INPUT', 'rejects a whitespace-only local round ID');
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-empty-version', '{"id":"wp-lib-c1-empty-version"}', '[]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-empty-version"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[]', 'UTF8')), 'hex'), ''
)$sql$,
  '22023', 'INVALID_BACKUP_INPUT', 'rejects an empty app version');
select throws_ok($sql$select * from public.backup_round(
  repeat('l', 129), '{"id":"long-local-id"}', '[]',
  encode(sha256(convert_to('{"id":"long-local-id"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '22023', 'INVALID_BACKUP_INPUT', 'rejects a 129-character local round ID');
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-long-version', '{"id":"long-app-version"}', '[]',
  encode(sha256(convert_to('{"id":"long-app-version"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[]', 'UTF8')), 'hex'), repeat('v', 33)
)$sql$,
  '22023', 'INVALID_BACKUP_INPUT', 'rejects a 33-character app version');
select ok((
  with input as (
    select '{"id":"wp-lib-c1-max"}'::text as round_text
  ), payload as (
    select round_text,
      repeat('a', 1048576 - octet_length(convert_to(round_text, 'UTF8'))) as players_text
    from input
  )
  select created from payload, lateral public.backup_round(
    'wp-lib-c1-max', round_text, players_text,
    encode(sha256(convert_to(round_text, 'UTF8')), 'hex'),
    encode(sha256(convert_to(players_text, 'UTF8')), 'hex'), '31.0.88'
  )
), 'accepts a backup whose two texts total exactly 1048576 UTF-8 bytes');
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  repeat('é', 524288),
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to(repeat('é', 524288), 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '22023', 'BACKUP_TOO_LARGE', 'size limit counts combined UTF-8 bytes');
select is((select count(*) from public.round_backups where local_round_id = 'wp-lib-c1-fixture'),
  0::bigint, 'invalid submissions create no backup row');

select ok((
  select created and version_number = 1 from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)
), 'first backup creates version 1');
select is((
  select stored_players_sha256 from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
  )
), encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'),
  'fixture backup returns its submitted players hash');
select is((select owner_account_id from public.round_backups where local_round_id = 'wp-lib-c1-fixture'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'ownership comes from the authenticated session');

-- Separate statements model duplicate requests after a lost response.
do $$
declare
  expected_id uuid;
  trial record;
begin
  select cloud_round_id into strict expected_id from public.round_backups
    where local_round_id = 'wp-lib-c1-fixture';
  for attempt in 1..5 loop
    select * into strict trial from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
);
    if trial.cloud_round_id is distinct from expected_id or trial.created is distinct from false
       or trial.version_number is distinct from 1 then
      raise exception 'Same-round retry returned a different version';
    end if;
  end loop;
end;
$$;

select is((select count(*) from public.round_backups where local_round_id = 'wp-lib-c1-fixture'),
  1::bigint, 'five retries leave one backup row');
select is((
  select count(*) from public.round_backup_versions v join public.round_backups b using (cloud_round_id)
  where b.local_round_id = 'wp-lib-c1-fixture'
), 1::bigint, 'five retries leave one immutable version');
select ok((
  select not created and version_number = 1 and cloud_round_id = (
    select b.cloud_round_id from public.round_backups b where b.local_round_id = 'wp-lib-c1-fixture'
  ) from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":15,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":15,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)
), 'same-round retry with player drift returns the original version');
select is((
  select stored_players_sha256 from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":15,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":15,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
  )
), encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'),
  'player-drift retry returns the original players hash');

select results_eq(
  $sql$select v.round_canonical, v.players_canonical, v.round_sha256::text, v.players_sha256::text
    from public.round_backup_versions v join public.round_backups b using (cloud_round_id)
    where b.local_round_id = 'wp-lib-c1-fixture'$sql$,
  $sql$select '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}'::text, '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]'::text,
    encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'), encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex')$sql$,
  'read-back returns the original round and original players snapshot exactly'
);
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local","syntheticRevision":2}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local","syntheticRevision":2}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '22023', 'ROUND_CHANGED', 'a changed round cannot create a second version');
select is((
  select count(*) from public.round_backup_versions v join public.round_backups b using (cloud_round_id)
  where b.local_round_id = 'wp-lib-c1-fixture'
), 1::bigint, 'changed-round refusal leaves the existing version alone');
select throws_ok(
  $$insert into public.round_backups (owner_account_id, local_round_id)
    values ('11111111-1111-4111-8111-111111111112', 'wp-lib-c1-forged')$$,
  '42501', null, 'client cannot insert with another owner ID'
);
select throws_ok(
  $sql$select * from public.backup_round(
    local_round_id => 'wp-lib-c1-spoof',
    round_canonical => '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
    players_canonical => '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
    round_sha256 => encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
    players_sha256 => encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'),
    app_version => '31.0.88',
    owner_account_id => '11111111-1111-4111-8111-111111111112'
  )$sql$,
  '42883', null, 'RPC exposes no owner override'
);
select throws_ok($$update public.round_backup_versions set app_version = 'forged'$$,
  '42501', null, 'owner cannot update the immutable version via the API role');
select throws_ok($$delete from public.round_backup_versions$$,
  '42501', null, 'owner cannot delete the immutable version via the API role');
select throws_ok($$update public.round_backups set local_round_id = 'forged'$$,
  '42501', null, 'owner cannot update the immutable backup via the API role');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111"}', true);
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '42501', 'DURABLE_ACCOUNT_REQUIRED', 'owner token without an anonymity claim cannot call the write RPC');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":false}', true);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111112","is_anonymous":false}', true);
select is((select count(*) from public.round_backups where local_round_id = 'wp-lib-c1-fixture'),
  0::bigint, 'other durable account cannot read the backup row');
select is((select count(*) from public.round_backup_versions),
  0::bigint, 'other durable account cannot read the version');
select throws_ok(
  $$select * from public.backup_round(cloud_round_id => '11111111-1111-4111-8111-111111111111')$$,
  '42883', null, 'write RPC exposes no cloud ID selector'
);

-- Use the same subject to exercise the JWT anonymity check independently.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","is_anonymous":true}', true);
select is((select count(*) from public.round_backups), 0::bigint, 'anonymous-auth session sees no backups');
select is((select count(*) from public.round_backup_versions), 0::bigint, 'anonymous-auth session sees no versions');
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '42501', 'DURABLE_ACCOUNT_REQUIRED', 'anonymous-auth session cannot call the write RPC');

select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '42501', 'DURABLE_ACCOUNT_REQUIRED', 'authenticated role without a subject cannot write');
reset role;
set local role anon;
select throws_ok($$select * from public.round_backups$$, '42501', null, 'signed-out requests cannot read backups');
select throws_ok($$select * from public.round_backup_versions$$, '42501', null, 'signed-out requests cannot read versions');
select throws_ok($sql$select * from public.backup_round(
  'wp-lib-c1-fixture', '{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}',
  '[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]',
  encode(sha256(convert_to('{"id":"wp-lib-c1-fixture","status":"complete","storageMode":"local"}', 'UTF8')), 'hex'),
  encode(sha256(convert_to('[{"id":"player-1","index":12,"name":"Synthetic Golfer"}]', 'UTF8')), 'hex'), '31.0.88'
)$sql$,
  '42501', null, 'anon API role cannot execute the RPC');

reset role;
select throws_ok(
  $$update public.round_backups set local_round_id = 'forged'
    where local_round_id = 'wp-lib-c1-fixture'$$,
  '55000', 'ROUND_BACKUP_IMMUTABLE', 'backup trigger rejects privileged updates'
);
select throws_ok(
  $$truncate public.round_backup_versions$$,
  '55000', 'ROUND_BACKUP_IMMUTABLE', 'version trigger rejects privileged truncation'
);
select throws_ok(
  $$update public.round_backup_versions v set app_version = 'forged'
    from public.round_backups b where b.cloud_round_id = v.cloud_round_id
      and b.local_round_id = 'wp-lib-c1-fixture'$$,
  '55000', 'ROUND_BACKUP_IMMUTABLE', 'version trigger also rejects privileged updates'
);
select throws_ok(
  $$delete from public.round_backup_versions v using public.round_backups b
    where b.cloud_round_id = v.cloud_round_id and b.local_round_id = 'wp-lib-c1-fixture'$$,
  '55000', 'ROUND_BACKUP_IMMUTABLE', 'version trigger also rejects privileged deletes'
);

select * from finish();
rollback;
