begin;
select plan(9);

insert into auth.users(id,is_anonymous,raw_app_meta_data) values
 ('92000000-0000-0000-0000-000000000001',false,'{"provider":"email"}'),
 ('92000000-0000-0000-0000-000000000002',false,'{"provider":"email"}'),
 ('92000000-0000-0000-0000-000000000003',true,'{"provider":"anonymous"}')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.create_my_claimed_golfer_identity('Alex Golfer', 'Ace')$$,
  'durable Account explicitly creates its own Golfer Identity'
);
select is(
  (select count(*) from public.golfer_identities where claimed_by_account_id='92000000-0000-0000-0000-000000000001'),
  1::bigint,
  'Account has exactly one claimed Golfer Identity'
);
select is(
  (select profile ->> 'nickname' from public.golfer_identities where claimed_by_account_id='92000000-0000-0000-0000-000000000001'),
  'Ace',
  'optional nickname is a profile attribute'
);
select is(
  (select count(*) from public.personal_golfer_library where account_id='92000000-0000-0000-0000-000000000001'),
  1::bigint,
  'own identity is added to the Account Personal Golfer Library'
);
select lives_ok(
  $$select public.create_my_claimed_golfer_identity('Different Name Must Not Rewrite', null)$$,
  'repeated onboarding is idempotent'
);
select is(
  (select display_name from public.golfer_identities where claimed_by_account_id='92000000-0000-0000-0000-000000000001'),
  'Alex Golfer',
  'idempotent retry does not rewrite the existing identity profile'
);

select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.create_my_claimed_golfer_identity('Alex Golfer', null)$$,
  'same display name creates a distinct identity for a different Account'
);
reset role;
select is(
  (select count(*) from public.golfer_identities where display_name='Alex Golfer' and claimed_by_account_id in ('92000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000002')),
  2::bigint,
  'mutable name never merges identities'
);

set local role anon;
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.create_my_claimed_golfer_identity('Anonymous Golfer', null)$$,
  '42501',
  null,
  'anonymous session cannot invoke identity onboarding'
);

select * from finish();
rollback;
