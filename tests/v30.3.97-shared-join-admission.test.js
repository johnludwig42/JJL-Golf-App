import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app.js', 'utf8');

test('initial Shared Match join uses the secure admission RPC exactly once', () => {
  const loadStart = app.indexOf('async function loadSharedMatchFromCloud');
  const loadSource = app.slice(loadStart, loadStart + 2600);
  assert.ok(loadStart > 0);
  assert.match(loadSource, /if \(requireRegistration\) cloudId = await authorizeSharedMatchJoin\(cloudId\)/);
  assert.match(loadSource, /registerSharedJoinDevice\(hydrated, \{ requireRegistration \}\)/);

  const registerStart = app.indexOf('async function registerSharedJoinDevice');
  const registerSource = app.slice(registerStart, registerStart + 1800);
  assert.ok(registerStart > 0);
  assert.match(registerSource, /const registered = requireRegistration \? true : await register\(match\)/);
  assert.doesNotMatch(registerSource, /const registered = await register\(match\)/);
});

test('ordinary post-join membership refresh remains available without weakening RLS', () => {
  assert.match(app, /async function upsertSharedMembershipForCurrentDevice/);
  assert.match(app, /if \(retrySync\)[\s\S]*?upsertSharedMembershipForCurrentDevice\(match\)/);
  assert.doesNotMatch(app, /memberships_self_insert|grant\s+insert\s+on\s+public\.match_memberships\s+to\s+anon/i);
});
