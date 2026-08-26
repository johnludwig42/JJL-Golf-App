import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('new Shared Matches continue to generate only canonical DYE codes', async () => {
  const engine = await loadLiveEngine();
  for (const random of [0, 0.1, 0.5, 0.999999]) {
    assert.match(engine.generateSharedMatchCode(() => random), /^DYE-[1-9]{6}$/);
  }
});

test('normal Match join accepts only canonical DYE codes', async () => {
  const engine = await loadLiveEngine();
  assert.equal(engine.normalizeJoinMatchCode(' dye-532835 '), 'DYE-532835');
  for (const invalid of ['532835', 'DYE-502835', 'TOO-SHORT', 'LAQJK22W43V5', 'LAQJ K22W 43V5', 'LAQJK22W43V5EXTRA', 'DYE-A23456']) {
    assert.equal(engine.normalizeJoinMatchCode(invalid), '');
  }
});

test('legacy codes are excluded from joining and new-code generation', () => {
  assert.doesNotMatch(app, /if \(\/\^\[A-Z0-9\]\{12\}\$\/\.test\(compact\)\) return compact/);
  assert.match(app, /const reusableCode = getReusableCanonicalSharedMatchCode\(existing\)/);
  assert.match(app, /reusableCode \|\| await generateUniqueSharedMatchCode\(sharedMatchCodeExists\)/);
  assert.doesNotMatch(app, /sharedMatchId\s*=\s*generateSharedMatchCode/);
});

test('join and host UI present DYE codes as the sole supported format', () => {
  assert.match(html, /placeholder="DYE-532835"/);
  assert.match(app, /Unsupported Legacy Code/);
  assert.match(app, /This pre-beta code is no longer joinable/);
  assert.match(app, /Enter a Shared Match code like DYE-532835\./);
});

test('current release identity is consistent in the app shell', () => {
  assert.match(app, /version: 'v31\.0\.06'/);
  assert.match(html, /id="appVersionFooter">v31\.0\.06</);
});
