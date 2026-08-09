begin;
select plan(12);

select ok(to_regclass('public.accounts') is not null, 'Account foundation exists');
select ok(to_regclass('public.golfer_identities') is not null, 'Golfer Identity foundation exists');
select ok(to_regclass('public.personal_golfer_library') is not null, 'Personal Golfer Library exists');
select has_function('public', 'create_my_claimed_golfer_identity', array['text','text'], 'explicit identity creation RPC exists');
select has_function('public', 'publish_shared_match_owner', array['jsonb','text','text'], 'server-authoritative publication RPC exists');

select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select is(
  public.publish_shared_match_owner(
    '{"id":"DYE-960001","created_by":"93000000-0000-0000-0000-000000000001","status":"active"}'::jsonb,
    'host-device',
    '{"deviceName":"Host iPhone"}'
  ),
  'DYE-960001',
  'durable Account can publish a Shared Match'
);
select is(
  (select created_by::text from public.matches where id='DYE-960001'),
  '93000000-0000-0000-0000-000000000004',
  'server replaces forged Owner attribution with auth.uid()'
);
select is(
  (select role from public.match_memberships where match_id='DYE-960001' and user_id='93000000-0000-0000-0000-000000000004'),
  'organizer',
  'publication atomically creates organizer membership'
);
select lives_ok(
  $$select public.publish_shared_match_owner('{"id":"DYE-960001","status":"active"}'::jsonb,'host-device','Host iPhone')$$,
  'Owner retry is idempotent'
);
reset role;

select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select throws_ok(
  $$select public.publish_shared_match_owner('{"id":"DYE-960001","status":"active"}'::jsonb,'other-device','Other iPhone')$$,
  '42501', null, 'unrelated Account cannot claim an existing Shared Match'
);
select throws_ok(
  $$select public.publish_shared_match_owner('{"id":"BAD-CODE","status":"active"}'::jsonb,'other-device','Other iPhone')$$,
  '22023', null, 'invalid Shared Match code fails closed'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.publish_shared_match_owner('{"id":"DYE-960002","status":"active"}'::jsonb,'anon-device','Anonymous')$$,
  '42501', null, 'anonymous publication is denied'
);
reset role;

select * from finish();
rollback;
