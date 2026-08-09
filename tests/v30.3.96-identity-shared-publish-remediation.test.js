import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202608090001_v30_3_96_identity_shared_publish_remediation.sql', 'utf8');
const rollback = fs.readFileSync('supabase/rollbacks/202608090001_v30_3_96_identity_shared_publish_remediation_rollback.sql', 'utf8');
const sqlTest = fs.readFileSync('supabase/tests/v30_3_96_identity_shared_publish_remediation_test.sql', 'utf8');

test('remediation is additive, transactional, and restores the missing Identity foundation', () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /create table if not exists public\.accounts/i);
  assert.match(migration, /create table if not exists public\.golfer_identities/i);
  assert.match(migration, /create table if not exists public\.personal_golfer_library/i);
  assert.match(migration, /create_my_claimed_golfer_identity/i);
  assert.doesNotMatch(migration, /delete from|truncate|drop table/i);
});

test('Shared Match publication derives Owner authority server-side and fails closed', () => {
  assert.match(migration, /function public\.publish_shared_match_owner/i);
  assert.match(migration, /v_user uuid := auth\.uid\(\)/i);
  assert.match(migration, /v_match\.created_by := v_user/i);
  assert.match(migration, /v_existing_owner is distinct from v_user/i);
  assert.match(migration, /role[^;]*'organizer'/is);
  assert.match(migration, /revoke all on function public\.publish_shared_match_owner[^;]*from public, anon/is);
  assert.match(migration, /grant execute on function public\.publish_shared_match_owner[^;]*to authenticated/is);
  assert.doesNotMatch(migration, /security invoker/i);
});

test('application establishes the server Owner anchor before ordinary RLS writes', () => {
  const uploadStart = app.indexOf('async function uploadSharedMatch');
  const upload = app.slice(uploadStart, uploadStart + 8500);
  assert.ok(uploadStart > 0);
  assert.ok(upload.indexOf("client.rpc('publish_shared_match_owner'") > 0);
  assert.ok(upload.indexOf("client.rpc('publish_shared_match_owner'") < upload.indexOf("client.from('matches').upsert"));
  assert.match(upload, /p_device_id: getSharedDeviceId\(\)/);
  assert.match(upload, /p_device_label: getSharedDeviceLabelPayload\(match\)/);
});

test('explicit cloud failures enter safe local diagnostics without raw server detail', () => {
  assert.match(app, /function getSharedSafeErrorCode/);
  assert.match(app, /recordSharedCloudFailure\(match, err, \{ explicit: !silent/);
  assert.match(app, /recordAppError\(safeError, 'Shared Match Cloud Sync'\)/);
  assert.match(app, /CLOUD_SYNC_FAILED/);
  assert.doesNotMatch(app, /recordAppError\(err, 'Shared Match Cloud Sync'\)/);
});

test('rollback removes callable surfaces without deleting Identity or match data', () => {
  assert.match(rollback, /drop function if exists public\.publish_shared_match_owner/i);
  assert.match(rollback, /drop function if exists public\.create_my_claimed_golfer_identity/i);
  assert.doesNotMatch(rollback, /delete from|truncate|drop table/i);
  assert.match(sqlTest, /server replaces forged Owner attribution with auth\.uid\(\)/i);
  assert.match(sqlTest, /unrelated Account cannot claim an existing Shared Match/i);
  assert.match(sqlTest, /anonymous publication is denied/i);
});
