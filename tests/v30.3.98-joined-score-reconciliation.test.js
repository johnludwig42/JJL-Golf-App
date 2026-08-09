import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');

test('routine membership refresh is update-only and cannot admit a new member', () => {
  const start = app.indexOf('async function upsertSharedMembershipForCurrentDevice');
  const source = app.slice(start, start + 1800);
  assert.ok(start > 0);
  assert.match(source, /from\('match_memberships'\)\.update\(/);
  assert.match(source, /\.eq\('id', membershipId\)\.eq\('user_id', user\.id\)/);
  assert.doesNotMatch(source, /from\('match_memberships'\)\.upsert\(/);
  assert.doesNotMatch(source, /from\('match_memberships'\)\.insert\(/);
});

test('joined-device routine uploads cannot rewrite host-owned setup records', () => {
  const planStart = app.indexOf('function getSharedCloudWritePlan');
  const plan = app.slice(planStart, planStart + 500);
  assert.ok(planStart > 0);
  assert.match(plan, /match: isHost/);
  assert.match(plan, /membership: false/);
  assert.match(plan, /teams: isHost/);
  assert.match(plan, /players: isHost/);
  assert.match(plan, /scores: true/);
  assert.match(plan, /notes: isHost/);
});

test('pending score entries are uploaded before any host-only notes write', () => {
  const start = app.indexOf('async function uploadSharedMatch');
  const source = app.slice(start, start + 9000);
  const scores = source.indexOf("client.from('score_entries').upsert");
  const notes = source.indexOf("client.from('match_notes').upsert");
  assert.ok(scores > 0);
  assert.ok(notes > scores);
  assert.match(source, /if \(writePlan\.scores && payload\.scoreEntries\.length\)/);
  assert.match(source, /if \(writePlan\.notes\)/);
});

test('the secure server functions remain the only membership admission boundaries', () => {
  assert.match(app, /client\.rpc\('publish_shared_match_owner'/);
  assert.match(app, /client\.rpc\('join_shared_match'/);
  const uploadStart = app.indexOf('async function uploadSharedMatch');
  const upload = app.slice(uploadStart, uploadStart + 9000);
  assert.match(app, /function getSharedCloudWritePlan[\s\S]*?membership: false/);
  assert.match(upload, /if \(writePlan\.membership && payload\.membership\)/);
});
