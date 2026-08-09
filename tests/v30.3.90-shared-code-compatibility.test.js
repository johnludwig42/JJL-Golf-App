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

test('normal Match join accepts canonical and exact legacy codes without conversion', async () => {
  const engine = await loadLiveEngine();
  assert.equal(engine.normalizeJoinMatchCode(' dye-532835 '), 'DYE-532835');
  assert.equal(engine.normalizeJoinMatchCode(' laqjk22w43v5 '), 'LAQJK22W43V5');
  for (const invalid of ['532835', 'DYE-502835', 'TOO-SHORT', 'LAQJ K22W 43V5', 'LAQJK22W43V5EXTRA', 'DYE-A23456']) {
    assert.equal(engine.normalizeJoinMatchCode(invalid), '');
  }
});

test('legacy compatibility is limited to joining and does not replace new-code generation', () => {
  assert.match(app, /if \(\/\^\[A-Z0-9\]\{12\}\$\/\.test\(compact\)\) return compact/);
  assert.match(app, /existing\s*\?\s*normalizeMatchCode\(existing\.sharedMatchCode/);
  assert.match(app, /:\s*await generateUniqueSharedMatchCode\(sharedMatchCodeExists\)/);
  assert.doesNotMatch(app, /sharedMatchId\s*=\s*generateSharedMatchCode/);
});

test('join and host UI explain both formats without presenting legacy as the new standard', () => {
  assert.match(html, /placeholder="DYE-532835 or existing legacy code"/);
  assert.match(app, /Legacy Match Code/);
  assert.match(app, /This existing match keeps its original code\. Enter it exactly as shown to join\./);
  assert.match(app, /Enter a code like DYE-532835, or the 12-character legacy code shown by the host\./);
});

test('current release identity is consistent in the app shell', () => {
  assert.match(app, /version: 'v30\.3\.96'/);
  assert.match(html, /id="appVersionFooter">v30\.3\.96</);
});
