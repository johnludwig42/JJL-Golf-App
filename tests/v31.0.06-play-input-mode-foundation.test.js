import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test('v31.0.06 release identity and immutable assets are complete', () => {
  assert.equal(pkg.version, '31.0.06');
  assert.equal(manifest.version, 'v31.0.06');
  assert.match(app, /buildLabel: 'Play Input-Mode Foundation'/);
  for (const name of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(existsSync(new URL(`../branding/${name}-v31.0.06.png`, import.meta.url)), true);
  }
});

test('Classic is the safe default and unavailable future modes fail closed', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.normalizePlayInputMode(), 'CLASSIC');
  assert.equal(engine.normalizePlayInputMode('CLASSIC'), 'CLASSIC');
  assert.equal(engine.normalizePlayInputMode('PLAYER'), 'CLASSIC');
  assert.equal(engine.normalizePlayInputMode('PLAYER', { requireAvailable: false }), 'PLAYER');
  assert.equal(engine.normalizePlayInputMode('invented'), 'CLASSIC');
});

test('Play input mode is a device preference and legacy preferences migrate to Classic', () => {
  const engine = loadLiveEngine();
  const store = storage({ 'dyeLedger.playerPreferences': JSON.stringify({ schemaVersion: 4, scoring: { hapticsEnabled: false } }) });
  assert.equal(engine.getPlayerPreferences(store).schemaVersion, 5);
  assert.equal(engine.getPlayerPreferences(store).scoring.playInputMode, 'CLASSIC');
  const saved = engine.updatePlayerPreference('scoring.playInputMode', 'CLASSIC', store);
  assert.equal(saved.scoring.playInputMode, 'CLASSIC');
});

test('shared controller reads the authoritative Round score and stat arrays without copying them', () => {
  const engine = loadLiveEngine();
  const match = { id: 'round-1', holeCount: 18, players: [{ playerId: 'p1', scores: [{ holeNumber: 1, gross: 5 }], stats: [{ holeNumber: 1, putts: 2 }] }] };
  const controller = engine.createPlayInputController(match, { scoringHoles: [{ holeNumber: 1, par: 4 }] });
  assert.equal(controller.schemaVersion, 1);
  assert.equal(controller.roundId, 'round-1');
  assert.equal(controller.readGross('p1', 1), 5);
  assert.equal(controller.readStat('p1', 1).putts, 2);
  assert.equal(controller.holeCount, 1);
});

test('rendering delegates to Classic while score mutation, calculations, sync, and reports stay shared', () => {
  const renderStart = app.indexOf('function renderCurrentMatch()');
  const renderEnd = app.indexOf('function getShortStatusName', renderStart);
  const renderSource = app.slice(renderStart, renderEnd);
  assert.match(renderSource, /renderPlayInputMode\(\{ match, tee, metrics, scoringHoles, hole \}\)/);
  assert.doesNotMatch(renderSource, /renderScoreGrid\(/);
  assert.match(app, /function renderClassicPlayInputMode/);
  assert.match(app, /function createPlayInputController/);
  assert.match(app, /await persistCurrentMatch\(\{ applyDom: true, silent: true \}\)/);
  assert.match(html, /id="playInputModeSelect"/);
  assert.match(html, /Player · Soon/);
  assert.doesNotMatch(app, /function computePlayerModeMetrics|function syncPlayerMode|function buildPlayerModeReport/);
});
