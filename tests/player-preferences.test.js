import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

function makeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); },
  };
}

const key = 'dyeLedger.playerPreferences';

test('preference defaults and normalization are complete, deterministic, immutable, and future-safe', () => {
  const engine = loadLiveEngine();
  const defaults = engine.getDefaultPlayerPreferences();
  assert.deepEqual(structuredClone(defaults), {
    schemaVersion: 6,
    scoring: { playInputMode: 'CLASSIC', statTrackingMode: 'CASUAL', smartScoreAdvanceEnabled: true, smartScoreAdvancePreset: 'NORMAL', hapticsEnabled: true, statTrackingDefault: false },
    press: structuredClone(engine.normalizePressConfig({})),
    roundDefaults: { sharedMatchEnabled: false, captureWeatherContext: true },
    quickScoreboard: { classicScorecardExpanded: false, scoreDistributionExpanded: false, momentumExpanded: false },
  });
  for (const raw of [undefined, null, {}, { scoring: {} }, { schemaVersion: 'bad', scoring: { smartScoreAdvancePreset: 'turbo', hapticsEnabled: 'yes', statTrackingDefault: 1 }, quickScoreboard: { classicScorecardExpanded: null, scoreDistributionExpanded: 'no', momentumExpanded: 1 } }]) {
    const before = raw == null ? raw : JSON.stringify(raw);
    const normalized = engine.normalizePlayerPreferences(raw);
    assert.deepEqual(structuredClone(normalized), structuredClone(defaults));
    if (raw != null) assert.equal(JSON.stringify(raw), before);
    assert.deepEqual(structuredClone(engine.normalizePlayerPreferences(raw)), structuredClone(normalized));
  }
  const valid = { schemaVersion: 1, futureTop: { enabled: true }, scoring: { smartScoreAdvancePreset: 'fast', hapticsEnabled: false, statTrackingDefault: true, futureScoring: 9 }, quickScoreboard: { classicScorecardExpanded: true, scoreDistributionExpanded: true, momentumExpanded: true, futureView: 'x' } };
  const normalized = engine.normalizePlayerPreferences(valid);
  assert.equal(normalized.scoring.smartScoreAdvancePreset, 'FAST');
  assert.equal(normalized.futureTop.enabled, true);
  assert.equal(normalized.scoring.futureScoring, 9);
  assert.equal(normalized.quickScoreboard.futureView, 'x');
});

test('preference storage reads, saves, reloads, updates nested fields, survives corruption, and fails safely', () => {
  const engine = loadLiveEngine();
  const storage = makeStorage({ unrelated: 'keep' });
  const first = engine.getPlayerPreferences(storage);
  assert.equal(JSON.parse(storage.snapshot()[key]).schemaVersion, 6);
  const saved = engine.savePlayerPreferences({ ...first, scoring: { ...first.scoring, hapticsEnabled: false } }, storage);
  assert.equal(saved.scoring.hapticsEnabled, false);
  assert.equal(engine.getPlayerPreferences(storage).scoring.hapticsEnabled, false);
  engine.updatePlayerPreference('quickScoreboard.momentumExpanded', true, storage);
  const updated = engine.getPlayerPreferences(storage);
  assert.equal(updated.quickScoreboard.momentumExpanded, true);
  assert.equal(updated.scoring.hapticsEnabled, false);
  assert.equal(storage.snapshot().unrelated, 'keep');
  storage.setItem(key, '{broken');
  assert.deepEqual(structuredClone(engine.getPlayerPreferences(storage)), structuredClone(engine.getDefaultPlayerPreferences()));
  const failing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(engine.savePlayerPreferences(first, failing), null);
  assert.deepEqual(structuredClone(engine.getPlayerPreferences(failing)), structuredClone(first));
});

test('reset restores only known values while preserving unknown fields and unrelated storage', () => {
  const engine = loadLiveEngine();
  const storage = makeStorage({ unrelated: 'saved-match-data' });
  engine.savePlayerPreferences({ schemaVersion: 7, futureTop: 1, scoring: { smartScoreAdvancePreset: 'RELAXED', hapticsEnabled: false, statTrackingDefault: true, future: 'keep' }, quickScoreboard: { classicScorecardExpanded: true, scoreDistributionExpanded: true, momentumExpanded: true, future: 'keep' } }, storage);
  const reset = engine.resetPlayerPreferences(storage);
  assert.deepEqual(structuredClone({ scoring: reset.scoring, roundDefaults: reset.roundDefaults, quickScoreboard: reset.quickScoreboard }), structuredClone({ scoring: { playInputMode: 'CLASSIC', statTrackingMode: 'CASUAL', smartScoreAdvanceEnabled: true, smartScoreAdvancePreset: 'NORMAL', hapticsEnabled: true, statTrackingDefault: false, future: 'keep' }, roundDefaults: { sharedMatchEnabled: false, captureWeatherContext: true }, quickScoreboard: { classicScorecardExpanded: false, scoreDistributionExpanded: false, momentumExpanded: false, future: 'keep' } }));
  assert.equal(reset.futureTop, 1);
  assert.equal(storage.snapshot().unrelated, 'saved-match-data');
});

test('new-match defaults use preferences while explicit source, template, and current-match values win', () => {
  const engine = loadLiveEngine();
  const preferences = engine.normalizePlayerPreferences({ scoring: { smartScoreAdvancePreset: 'RELAXED', statTrackingDefault: true }, press: { pressesEnabled: true, pressType: 'PROMPT_AT_THRESHOLD', autoPressThreshold: 3, maxPressesPerRound: 4, maxRePresses: 2 }, roundDefaults: { sharedMatchEnabled: true } });
  const defaults = engine.getNewMatchDefaultsFromPreferences(preferences);
  assert.equal(defaults.smartScoreAdvancePreset, 'relaxed');
  assert.equal(defaults.statTrackingEnabled, true);
  assert.equal(defaults.pressConfig.pressesEnabled, true);
  assert.equal(defaults.pressConfig.maxPressesPerRound, 4);
  assert.equal(defaults.pressConfig.maxRePresses, 2);
  assert.equal(defaults.sharedMatchEnabled, true);
  const merged = engine.mergeNewMatchDefaults({}, preferences);
  assert.equal(merged.smartScoreAdvancePreset, 'relaxed');
  assert.equal(merged.statTrackingEnabled, true);
  assert.equal(merged.pressConfig.pressType, 'PROMPT_AT_THRESHOLD');
  const explicit = engine.mergeNewMatchDefaults({ smartScoreAdvancePreset: 'fast', statTrackingEnabled: false, pressConfig: { pressesEnabled: false, maxPressesPerRound: 7 }, sharedMatchEnabled: false }, preferences);
  assert.equal(explicit.smartScoreAdvancePreset, 'fast');
  assert.equal(explicit.statTrackingEnabled, false);
  assert.equal(explicit.pressConfig.pressesEnabled, false);
  assert.equal(explicit.pressConfig.maxPressesPerRound, 7);
  assert.equal(explicit.sharedMatchEnabled, false);
  const blank = engine.createBlankSetupDraft(preferences);
  assert.equal(blank.smartScoreAdvancePreset, 'relaxed');
  assert.equal(blank.statTrackingEnabled, true);
  assert.equal(blank.pressConfig.pressesEnabled, true);
  assert.equal(blank.pressConfig.maxRePresses, 2);
  assert.equal(blank.storageMode, 'shared');
  const preferencesBeforeRoundOverride = JSON.stringify(preferences);
  blank.pressConfig.maxPressesPerRound = 9;
  blank.pressConfig.pressesEnabled = false;
  assert.equal(JSON.stringify(preferences), preferencesBeforeRoundOverride);
  const source = engine.createEmptyMatch({ smartScoreAdvancePreset: 'fast', statTrackingEnabled: false, storageMode: 'local' });
  const before = JSON.stringify(source);
  engine.normalizePlayerPreferences({ scoring: { smartScoreAdvancePreset: 'RELAXED', statTrackingDefault: true } });
  assert.equal(source.smartScoreAdvancePreset, 'fast');
  assert.equal(source.statTrackingEnabled, false);
  assert.equal(JSON.stringify(source), before);
  const nextRound = engine.buildNextRoundDraft(source);
  assert.equal(nextRound.smartScoreAdvancePreset, 'fast');
  assert.equal(nextRound.statTrackingEnabled, false);
  assert.equal(nextRound.storageMode, 'local');
});

test('Smart Score Advance timing and haptic capability gates follow saved choices safely', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.getSmartScoreAdvanceDelay({ smartScoreAdvancePreset: 'fast' }), 750);
  assert.equal(engine.getSmartScoreAdvanceDelay({ smartScoreAdvancePreset: 'normal' }), 1000);
  assert.equal(engine.getSmartScoreAdvanceDelay({ smartScoreAdvancePreset: 'relaxed' }), 1250);
  assert.equal(engine.getSmartScoreAdvanceDelay({ smartScoreAdvancePreset: 'invalid' }), 1000);
  const calls = [];
  const device = { vibrate: value => calls.push(value) };
  assert.equal(engine.triggerSmartScoreHaptic({ scoring: { hapticsEnabled: true } }, device), true);
  assert.deepEqual(calls, [18]);
  assert.equal(engine.triggerSmartScoreHaptic({ scoring: { hapticsEnabled: false } }, device), false);
  assert.deepEqual(calls, [18]);
  assert.equal(engine.triggerSmartScoreHaptic({ scoring: { hapticsEnabled: true } }, {}), false);
});

test('Shared Match devices can override auto-advance locally without changing match facts', () => {
  const engine = loadLiveEngine();
  const storageA = makeStorage();
  const storageB = makeStorage();
  const match = { id: 'shared-round', storageMode: 'shared', smartScoreAdvanceEnabled: true, smartScoreAdvancePreset: 'normal' };
  assert.deepEqual(structuredClone(engine.getEffectiveDeviceScoreAdvanceSettings(match, storageA)), { enabled: true, preset: 'normal', deviceOverride: false });
  assert.equal(engine.saveDeviceScoreAdvanceOverride(match, { enabled: false, preset: 'relaxed' }, storageA), true);
  assert.deepEqual(structuredClone(engine.getEffectiveDeviceScoreAdvanceSettings(match, storageA)), { enabled: false, preset: 'relaxed', deviceOverride: true });
  assert.deepEqual(structuredClone(engine.getEffectiveDeviceScoreAdvanceSettings(match, storageB)), { enabled: true, preset: 'normal', deviceOverride: false });
  assert.equal(match.smartScoreAdvanceEnabled, true);
  assert.equal(match.smartScoreAdvancePreset, 'normal');
});

test('Quick Scoreboard disclosure defaults are personal, deterministic, and do not mutate round data', () => {
  const engine = loadLiveEngine();
  const players = [{ id: 'a', name: 'A', index: 0 }, { id: 'b', name: 'B', index: 0 }];
  const course = { id: 'c', name: 'C', tees: [{ id: 't', teeName: 'T', rating: 36, slope: 113, par: 36, holes: Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 })) }] };
  const match = { id: 'm', date: '2026-07-13', courseId: 'c', teeId: 't', holeCount: 9, teamCount: 2, playersPerTeam: 1, selectedGames: [{ key: 'team_match', basis: 'net' }], players: players.map((player, index) => ({ playerId: player.id, team: index + 1, teeId: 't', scores: Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, gross: i < 2 ? 4 + index : null })) })) };
  const live = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: 'm' }).matches[0];
  const metrics = engine.computeMatchMetrics(live);
  const before = JSON.stringify(live);
  const collapsed = engine.buildQuickScoreboardView(live, metrics, engine.getDefaultPlayerPreferences());
  assert.match(collapsed, /quick-score-distribution"><summary>Score Distribution/);
  assert.match(collapsed, /quick-classic-scorecard"><summary>Classic Scorecard/);
  assert.match(collapsed, /quick-scoreboard-momentum quick-disclosure"><summary>Momentum Charts/);
  const expandedPrefs = engine.normalizePlayerPreferences({ quickScoreboard: { classicScorecardExpanded: true, scoreDistributionExpanded: true, momentumExpanded: true } });
  const expanded = engine.buildQuickScoreboardView(live, metrics, expandedPrefs);
  assert.match(expanded, /quick-score-distribution" open><summary>Score Distribution/);
  assert.match(expanded, /quick-classic-scorecard" open><summary>Classic Scorecard/);
  assert.match(expanded, /quick-scoreboard-momentum quick-disclosure" open><summary>Momentum Charts/);
  assert.equal(JSON.stringify(live), before);
  assert.doesNotMatch(JSON.stringify(live), /quickScoreboard|playerPreferences/);
});

test('More UI exposes scoring, Press, and Quick Scoreboard preferences with feedback and reset confirmation', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const card = html.slice(html.indexOf('class="card tight-card player-preferences-card"'), html.indexOf('</section>', html.indexOf('class="card tight-card player-preferences-card"')));
  assert.match(card, /Player Preferences/);
  assert.equal((card.match(/data-preference-control=/g) || []).length, 16);
  for (const label of ['Scoring Preferences', 'Score Entry Mode', 'Smart Score Advance', 'Stat Tracking', 'Haptics', 'Press Preferences', 'Presses', 'Trigger', 'Prompt When Down', 'Who May Declare', 'Parent Availability', 'Declaration Timing', 'Maximum Presses', 'Maximum Re-Presses', 'Round Defaults', 'Shared Match default', 'Weather context', 'Classic Scorecard', 'Score Distribution', 'Momentum Charts', 'Reset to Defaults']) assert.match(card, new RegExp(label));
  assert.doesNotMatch(card, /Press Stake|Root Stake|Parent Stake/);
  assert.match(card, /These settings become the default for new rounds\. Any round may override them during Round Setup\./);
  assert.doesNotMatch(card, /custom|milliseconds|login|cloud/i);
  assert.match(html, /Reset Player Preferences\?/);
  assert.match(html, /Saved matches will not be changed/);
  assert.match(app, /Preference saved/);
  assert.match(app, /Preferences reset/);
  assert.match(app, /PLAYER_PREFERENCES_STORAGE_KEY = 'dyeLedger\.playerPreferences'/);
  assert.doesNotMatch(app.slice(app.indexOf('function buildRoundRecord('), app.indexOf('function buildFrozenRoundRecord(')), /playerPreferences|quickScoreboard/);
});
