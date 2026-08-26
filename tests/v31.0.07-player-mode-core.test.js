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

test('Match Setup inherits but can override score keeping and stat tracking modes per round', () => {
  const engine = loadLiveEngine();
  const defaults = engine.getNewMatchDefaultsFromPreferences({ scoring: { playInputMode: 'PLAYER', statTrackingMode: 'ENHANCED', statTrackingDefault: true } });
  assert.equal(defaults.playInputMode, 'PLAYER');
  assert.equal(defaults.statTrackingMode, 'ENHANCED');
  const overridden = engine.mergeNewMatchDefaults({ playInputMode: 'CLASSIC', statTrackingMode: 'GRIND' }, { scoring: { playInputMode: 'PLAYER', statTrackingMode: 'CASUAL' } });
  assert.equal(overridden.playInputMode, 'CLASSIC');
  assert.equal(overridden.statTrackingMode, 'GRIND');
  assert.match(html, /id="roundPlayInputModeSelect" name="roundPlayInputMode"/);
  assert.match(html, /id="roundStatTrackingModeSelect" name="roundStatTrackingMode"/);
  assert.match(app, /match\.playInputMode = normalized/);
  assert.match(app, /match\.statTrackingMode = normalizeStatTrackingMode\(e\.target\.value\)/);
  assert.equal(engine.getEffectivePlayInputMode({ playInputMode: 'PLAYER' }), 'PLAYER');
  const holeSelector = app.slice(app.indexOf('function renderHoleSelector'), app.indexOf('function renderSneakySandyPoleyEntry'));
  assert.match(holeSelector, /getEffectivePlayInputMode\(match\)/);
  assert.doesNotMatch(holeSelector, /getPreferredPlayInputMode\(\)/);
});

test('Player Mode delegates to shared inputs and preserves explicit directional facts', () => {
  assert.match(app, /function renderPlayerPlayInputMode/);
  assert.match(app, /data-score-player=/);
  assert.match(app, /data-stat-key="fairwayResult"/);
  assert.match(app, /data-stat-key="greenOverride"/);
  assert.match(app, /data-stat-key="approachResult"/);
  assert.match(app, /Grind requires this device to score no more than two golfers/);
  assert.match(css, /player-input-mode-active/);
  assert.doesNotMatch(app, /function computePlayerModeMetrics|function syncPlayerMode|function buildPlayerModeReport/);
});

test('Player Mode keeps par centered and uses consistent six-choice score and putt controls', () => {
  assert.match(app, /\[par - 2, par - 1, par, par \+ 1, par \+ 2\]/);
  assert.match(app, /\[0,1,2,3,4\]\.map\(value => choice\('putts'/);
  assert.match(app, /player-mode-more-stat/);
  assert.match(css, /box-shadow:0 4px 10px rgba\(0,55,35,.22\),inset 0 0 0 2px/);
  assert.match(app, /class="fairway-hit-icon"/);
  assert.doesNotMatch(app, /🌲\s+Hit/);
});

test('Enhanced and Grind preserve nine-position approach dispersion for reports and story facts', () => {
  const engine = loadLiveEngine();
  assert.deepEqual(structuredClone(engine.getApproachDispersionSummary({
    approachOpps: 6,
    approachMisses: 5,
    approachPositions: { '1': 1, '2': 1, '3': 0, '4': 2, '5': 1, '6': 0, '7': 1, '8': 0, '9': 0 },
  })), { tracked: 6, misses: 5, short: 2, left: 4, right: 0, long: 1, dominant: ['left'] });
  assert.match(app, /\['7','8','9','4','5','6','1','2','3'\]\.map\(approachChoice\)/);
  assert.match(app, /function getApproachDispersionSummary/);
  assert.match(app, /Approach Misses/);
  assert.match(app, /most common recorded approach miss/);
  assert.match(app, /Unknown approach locations remain outside dispersion denominators|approachResult/);
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
  assert.match(css, /body\.player-mode-play-active \.app-footer-version\{display:none\}/);
  const playerModeStyles = css.split(/\r?\n/).filter(line => /player-mode|play-input-mode-bar/.test(line)).join('\n');
  assert.doesNotMatch(playerModeStyles, /var\(--(?:ink|panel|line)\)/);
});
