import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadLiveEngine} from '../scripts/live-engine-adapter.js';

const app = fs.readFileSync('app.js', 'utf8');

test('initial Shared Match join uses the secure admission RPC exactly once', async () => {
  const engine=loadLiveEngine();let admissions=0,directWrites=0,published=0;
  await engine.fetchSharedJoinBundle('DYE-123456',{requireRegistration:true,authorize:async code=>{admissions++;return code;},fetchBundle:async()=>({})});
  await engine.registerSharedJoinDevice({id:'DYE-123456',sharedMatchId:'DYE-123456',storageMode:'shared'}, {requireRegistration:true,register:async()=>{directWrites++;return true;},publish:async()=>{published++;},merge:async()=>{},isHost:()=>false});
  assert.equal(admissions,1);assert.equal(directWrites,0);assert.equal(published,1);
});

test('ordinary post-join membership refresh remains available without weakening RLS', () => {
  assert.match(app, /async function upsertSharedMembershipForCurrentDevice/);
  assert.match(app, /if \(retrySync\)[\s\S]*?upsertSharedMembershipForCurrentDevice\(match\)/);
  assert.doesNotMatch(app, /memberships_self_insert|grant\s+insert\s+on\s+public\.match_memberships\s+to\s+anon/i);
});
