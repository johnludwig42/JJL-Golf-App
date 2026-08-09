import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = fs.readFileSync('app.js', 'utf8');

test('only an existing canonical Shared Match may reuse its code', () => {
  const engine = loadLiveEngine();
  const canonical = { storageMode: 'shared', sharedMatchCode: 'DYE-431315', sharedMatchId: 'DYE-431315' };
  const legacy = { storageMode: 'shared', sharedMatchCode: 'LONXZWE6EEZY', sharedMatchId: 'LONXZWE6EEZY' };
  const local = { storageMode: 'local', sharedMatchCode: 'LONXZWE6EEZY', sharedMatchId: 'LONXZWE6EEZY' };
  assert.equal(engine.getReusableCanonicalSharedMatchCode(canonical), 'DYE-431315');
  assert.equal(engine.getReusableCanonicalSharedMatchCode(legacy), '');
  assert.equal(engine.getReusableCanonicalSharedMatchCode(local), '');
});

test('legacy classification applies only to records already stored as Shared Matches', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.isLegacySharedMatchRecord({ storageMode: 'shared', sharedMatchCode: 'LONXZWE6EEZY' }), true);
  assert.equal(engine.isLegacySharedMatchRecord({ storageMode: 'local', sharedMatchCode: 'LONXZWE6EEZY' }), false);
  assert.equal(engine.isLegacySharedMatchRecord({ storageMode: 'shared', sharedMatchCode: 'DYE-431315' }), false);
});

test('new and newly converted Shared Matches generate canonical IDs instead of local IDs', () => {
  assert.match(app, /const reusableCode = getReusableCanonicalSharedMatchCode\(existing\)/);
  assert.match(app, /match\.sharedMatchCode = reusableCode \|\| await generateUniqueSharedMatchCode\(sharedMatchCodeExists\)/);
  assert.match(app, /match\.sharedMatchId = match\.sharedMatchCode/);
  assert.doesNotMatch(app, /match\.sharedMatchId = existing\?\.sharedMatchId \|\| match\.sharedMatchCode/);
});

test('editing a legacy Shared Match directs the user to Create New Match', () => {
  assert.match(app, /if \(isLegacySharedMatchRecord\(existing\)\)/);
  assert.match(app, /Legacy Shared Match codes cannot be reused\. Choose Create New Match to receive a DYE-###### code\./);
});
