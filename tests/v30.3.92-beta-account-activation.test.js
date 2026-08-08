import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('identity-security.js', 'utf8');
const context = {
  globalThis: {}, Date, Math, JSON, URL,
  location: { href: 'https://example.test/app/' },
  navigator: { onLine: true },
  crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
};
context.globalThis = context;
vm.runInNewContext(source, context);
const api = context.DyeLedgerIdentitySecurity;

test('first-time identity load is scoped only to the authenticated Account id', async () => {
  const calls = [];
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    async maybeSingle() { return { data: null }; },
  };
  const controller = api.createIdentityProfileController({
    client: { from(table) { calls.push(['from', table]); return query; }, rpc() {} },
  });
  assert.equal(await controller.load('account-123'), null);
  assert.deepEqual(calls.map(call => call[0]), ['from', 'select', 'eq']);
  assert.deepEqual(calls.at(-1), ['eq', 'claimed_by_account_id', 'account-123']);
});

test('identity creation requires explicit confirmation and sends no merge attributes', async () => {
  const calls = [];
  const client = {
    from() { return {}; },
    async rpc(name, args) {
      calls.push([name, args]);
      return { data: { golfer_identity_id: 'golfer-1', claim_status: 'claimed', claimed_by_account_id: 'account-1', display_name: 'Alex Golfer', profile: { nickname: 'Ace' } } };
    },
  };
  const controller = api.createIdentityProfileController({ client });
  await assert.rejects(
    () => controller.create({ accountId: 'account-1', displayName: 'Alex Golfer', confirmed: false }),
    /Confirm that this permanent Golfer Identity represents you/,
  );
  const profile = await controller.create({ accountId: 'account-1', displayName: '  Alex   Golfer ', nickname: ' Ace ', confirmed: true });
  assert.equal(profile.golferIdentityId, 'golfer-1');
  assert.equal(JSON.stringify(calls), JSON.stringify([['create_my_claimed_golfer_identity', { p_display_name: 'Alex Golfer', p_nickname: 'Ace' }]]));
  assert.equal('email' in calls[0][1], false);
  assert.equal('phone' in calls[0][1], false);
  assert.equal('ghin' in calls[0][1], false);
});

test('identity onboarding failures preserve local-first guidance', async () => {
  const controller = api.createIdentityProfileController({ client: {}, online: () => false });
  await assert.rejects(() => controller.load('account-1'), /Local scoring remains available/);
  await assert.rejects(() => controller.create({ accountId: 'account-1', displayName: 'Alex Golfer', confirmed: true }), /Local scoring remains available/);
});

test('activation migration is transactional, least privilege, idempotent, and has a data-preserving rollback', () => {
  const migration = fs.readFileSync('supabase/migrations/202608060001_v30_3_92_beta_account_activation.sql', 'utf8');
  const rollback = fs.readFileSync('supabase/rollbacks/202608060001_v30_3_92_beta_account_activation_rollback.sql', 'utf8');
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /security definer/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /coalesce\(u\.is_anonymous, false\) = false/);
  assert.match(migration, /on conflict \(account_id, golfer_identity_id\) do nothing/i);
  assert.match(migration, /revoke all .* from public, anon/i);
  assert.match(migration, /grant execute .* to authenticated/i);
  assert.doesNotMatch(migration, /where\s+(email|phone|ghin|display_name)\s*=/i);
  assert.match(rollback, /drop function if exists/);
  assert.doesNotMatch(rollback, /delete from|drop table/i);
  const actorTest = fs.readFileSync('supabase/tests/v30_3_92_beta_account_activation_test.sql', 'utf8');
  assert.match(actorTest, /anonymous session cannot invoke identity onboarding/);
  assert.match(actorTest, /mutable name never merges identities/);
  const runner = fs.readFileSync('scripts/test-identity-security-rls.ps1', 'utf8');
  assert.equal((runner.match(/202608060001_v30_3_92_beta_account_activation\.sql/g) || []).length, 2);
  assert.match(runner, /v30_3_92_beta_account_activation_test\.sql/);
});

test('Account UX states the permanent-identity and no-local-upload boundaries', () => {
  assert.match(source, /permanent identity that represents you/);
  assert.match(source, /none of them is used to merge identities/);
  assert.match(source, /will not connect or upload existing players or rounds/);
  assert.match(source, /does not upload, claim, merge, rewrite, or delete them/);
});

test('OTP verification retains the destination email and supports an explicit change action', async () => {
  const controller = api.createAuthController({
    now: () => 1_000,
    client: {
      auth: {
        async signInWithOtp() { return { error: null }; },
        async verifyOtp() { return { error: { message: 'invalid' } }; },
      },
    },
  });
  await controller.requestOtp(' John.Test@DyeLedger.Local ');
  assert.equal(controller.getState().pendingEmail, 'john.test@dyeledger.local');
  await assert.rejects(() => controller.verifyOtp('000000'), /invalid or expired/);
  assert.equal(controller.getState().pendingEmail, 'john.test@dyeledger.local');
  assert.ok(controller.getState().resendAvailableAt > 1_000);
  controller.changeEmail();
  assert.equal(controller.getState().pendingEmail, '');
  assert.equal(controller.getState().resendAvailableAt, 0);
  assert.match(source, /Enter the six-digit code sent to/);
  assert.match(source, /Change email/);
  assert.match(source, /Resend code/);
});
