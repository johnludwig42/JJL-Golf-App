import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('v31.0.07 release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, '31.0.07');
  assert.equal(manifest.version, 'v31.0.07');
  assert.match(app, /buildLabel: 'Player Mode Core Score Entry'/);
  for (const name of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(existsSync(new URL(`../branding/${name}-v31.0.07.png`, import.meta.url)), true);
  }
});

test('GIR derives only from known gross score, surface putts, and par', () => {
  const engine = loadLiveEngine();
  assert.deepEqual(structuredClone(engine.deriveGreenInRegulation({ gross: 5, putts: 2, par: 4, puttsSource: 'default' })), { value: null, source: 'unknown' });
  assert.deepEqual(structuredClone(engine.deriveGreenInRegulation({ gross: 4, putts: 2, par: 4, puttsSource: 'user' })), { value: true, source: 'calculated' });
  assert.deepEqual(structuredClone(engine.deriveGreenInRegulation({ gross: 5, putts: 2, par: 4, puttsSource: 'user' })), { value: false, source: 'calculated' });
  assert.deepEqual(structuredClone(engine.deriveGreenInRegulation({ gross: 5, putts: 2, par: 4, puttsSource: 'user', override: true })), { value: true, source: 'override' });
});

test('Player Mode and all four stat detail levels are selectable device preferences', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.normalizePlayInputMode('PLAYER'), 'PLAYER');
  for (const mode of ['NONE', 'CASUAL', 'ENHANCED', 'GRIND']) assert.equal(engine.normalizeStatTrackingMode(mode), mode);
  assert.match(html, /name="scoring\.playInputMode" value="PLAYER"/);
  for (const mode of ['NONE', 'CASUAL', 'ENHANCED', 'GRIND']) assert.match(html, new RegExp(`name="scoring\\.statTrackingMode" value="${mode}"`));
});

test('Player Mode delegates to shared inputs and preserves explicit directional facts', () => {
  assert.match(app, /function renderPlayerPlayInputMode/);
  assert.match(app, /data-score-player=/);
  assert.match(app, /data-stat-key="fairwayResult"/);
  assert.match(app, /data-stat-key="greenResult"/);
  assert.match(app, /data-stat-key="greenOverride"/);
  assert.match(app, /Grind requires this device to score no more than two golfers/);
  assert.match(css, /player-input-mode-active/);
  assert.doesNotMatch(app, /function computePlayerModeMetrics|function syncPlayerMode|function buildPlayerModeReport/);
});

test('Player Mode uses dedicated card markup instead of the Classic score table', () => {
  assert.match(html, /id="playerModeHoleHeader"/);
  assert.match(html, /id="playerModeScoreList"/);
  assert.match(html, /id="classicScoreGridWrap"/);
  assert.match(html, /id="playerModeBottomActions"/);
  const renderer = app.slice(app.indexOf('function renderPlayerModeScoreGrid'), app.indexOf('function renderPlayerModeStatEntry'));
  assert.match(renderer, /list\.innerHTML/);
  assert.match(renderer, /<section class="player-mode-team"/);
  assert.match(renderer, /<article class="player-mode-score-row/);
  assert.doesNotMatch(renderer, /<tr|<td/);
  assert.match(css, /player-mode-bottom-actions/);
  assert.match(css, /body\.player-mode-play-active \.app-footer\{display:none\}/);
});
