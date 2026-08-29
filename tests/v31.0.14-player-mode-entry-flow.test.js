import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function storageFixture() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function fourGolferFixture(overrides = {}) {
  const metricPlayers = Array.from({ length: 4 }, (_, index) => ({
    playerId: `p${index + 1}`,
    team: index < 2 ? 1 : 2,
    player: { id: `p${index + 1}`, name: `Golfer ${index + 1}` },
  }));
  const players = metricPlayers.map((row, index) => ({
    playerId: row.playerId,
    team: row.team,
    scores: [{ holeNumber: 1, gross: index === 0 ? 4 : null }],
    stats: [{ holeNumber: 1, putts: 2, puttsSource: index === 0 ? 'user' : 'default', fairwayResult: index === 0 ? 'HIT' : 'UNKNOWN', approachResult: 'UNKNOWN', recoveryLie: 'UNKNOWN', entryCompleted: index === 0 }],
  }));
  return {
    match: {
      id: 'four-golfer-match',
      status: 'active',
      storageMode: 'local',
      scoringAccessMode: 'single_device',
      playInputMode: 'PLAYER',
      statTrackingEnabled: true,
      statTrackingMode: 'ENHANCED',
      statTrackingPlayerIds: players.map(row => row.playerId),
      players,
      ...overrides,
    },
    metrics: { players: metricPlayers, tee: { id: 'tee-1', holes: [{ holeNumber: 1, par: 4, strokeIndex: 1 }] } },
    tee: { id: 'tee-1', holes: [{ holeNumber: 1, par: 4, strokeIndex: 1 }] },
    hole: { holeNumber: 1, par: 4, strokeIndex: 1 },
  };
}

test('v31.0.14 release identity and immutable PWA assets are complete', () => {
  assert.match(app, /version: 'v31\.0\.14'/);
  assert.match(html, /id="appVersionFooter">v31\.0\.14/);
  assert.equal(existsSync(new URL('../BUILD_NOTES_v31.0.14.md', import.meta.url)), true);
  for (const name of ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']) {
    assert.equal(existsSync(new URL(`../branding/${name}-v31.0.14.png`, import.meta.url)), true);
  }
});

test('More Detail defaults closed, is remembered only by device storage, and never mutates round data', () => {
  const engine = loadLiveEngine();
  const storage = storageFixture();
  const { match } = fourGolferFixture();
  const before = JSON.stringify(match);
  assert.equal(engine.isPlayerModeMoreDetailOpen(storage), false);
  assert.equal(engine.savePlayerModeMoreDetailOpen(true, storage), true);
  assert.equal(engine.isPlayerModeMoreDetailOpen(storage), true);
  assert.equal(engine.savePlayerModeMoreDetailOpen(false, storage), true);
  assert.equal(engine.isPlayerModeMoreDetailOpen(storage), false);
  assert.equal(JSON.stringify(match), before);
});

test('collapsed detail keeps every detailed stat control mounted in the DOM', () => {
  const renderer = app.slice(app.indexOf('function renderPlayerModeStatEntry'), app.indexOf('function renderPlayerPlayInputMode'));
  assert.match(renderer, /data-player-mode-more-detail/);
  assert.match(renderer, /class="player-mode-more-detail" \$\{detailOpen \? '' : 'hidden'\}/);
  for (const key of ['penaltyStrokes', 'fairwayResult', 'approachResult', 'recoveryLie', 'greenOverride']) {
    assert.match(renderer, new RegExp(`data-stat-key="${key}"`));
  }
  assert.match(renderer, /player-mode-core-readback/);
  assert.match(css, /\.player-mode-more-detail\[hidden\]\{display:none!important\}/);
});

test('Enhanced advancement waits for score and putts, then skips complete golfers in display order', () => {
  const engine = loadLiveEngine();
  const { match, metrics, tee, hole } = fourGolferFixture();
  let target = engine.getPlayerModeEntryAdvanceTarget(match, metrics, tee, hole, 'p1');
  assert.equal(target.currentComplete, true);
  assert.equal(target.nextPlayerId, 'p2');

  match.players[1].scores[0].gross = 5;
  target = engine.getPlayerModeEntryAdvanceTarget(match, metrics, tee, hole, 'p2');
  assert.equal(target.currentComplete, false, 'gross score alone must not advance while tracked putts are incomplete');

  match.players[1].stats[0] = { holeNumber: 1, putts: 2, puttsSource: 'user', fairwayResult: 'HIT', approachResult: '2', recoveryLie: 'ROUGH', entryCompleted: true };
  match.players[2].scores[0].gross = 4;
  match.players[2].stats[0] = { holeNumber: 1, putts: 2, puttsSource: 'user', fairwayResult: 'HIT', approachResult: 'UNKNOWN', recoveryLie: 'UNKNOWN', entryCompleted: true };
  target = engine.getPlayerModeEntryAdvanceTarget(match, metrics, tee, hole, 'p2');
  assert.equal(target.currentComplete, true);
  assert.equal(target.nextPlayerId, 'p4', 'already complete golfer p3 is skipped');
});

test('assigned-player advancement skips golfers this Shared Match device cannot edit', () => {
  const engine = loadLiveEngine();
  const fixture = fourGolferFixture({ storageMode: 'shared', scoringAccessMode: 'assigned_players', sharedHostDeviceId: 'other-host-device', sharedParticipants: [], sharedPlayerAssignments: {}, sharedShowOtherScores: true });
  engine.getEffectivePlayerStatTrackingMode(fixture.match, fixture.metrics);
  const thisParticipant = fixture.match.sharedParticipants.find(row => row.role === 'participant')?.participantId;
  assert.ok(thisParticipant);
  fixture.match.sharedPlayerAssignments = { p1: thisParticipant, p2: 'other-device', p3: thisParticipant, p4: thisParticipant };
  fixture.match.players[2].scores[0].gross = 4;
  fixture.match.players[2].stats[0] = { holeNumber: 1, putts: 2, puttsSource: 'user', fairwayResult: 'HIT', approachResult: 'UNKNOWN', recoveryLie: 'UNKNOWN', entryCompleted: true };
  const target = engine.getPlayerModeEntryAdvanceTarget(fixture.match, fixture.metrics, fixture.tee, fixture.hole, 'p1');
  assert.equal(target.nextPlayerId, 'p4');
});

test('the final editable golfer stops cleanly and collapses only when all editable entries are complete', () => {
  const engine = loadLiveEngine();
  const { match, metrics, tee, hole } = fourGolferFixture();
  match.players.forEach((player, index) => {
    player.scores[0].gross = 4 + index;
    const missed = index > 0;
    player.stats[0] = { holeNumber: 1, putts: 2, puttsSource: 'user', fairwayResult: 'HIT', approachResult: missed ? '2' : 'UNKNOWN', recoveryLie: missed ? 'ROUGH' : 'UNKNOWN', entryCompleted: true };
  });
  const target = engine.getPlayerModeEntryAdvanceTarget(match, metrics, tee, hole, 'p4');
  assert.equal(target.nextPlayerId, '');
  assert.equal(target.allEditableComplete, true);
});

test('four-golfer Grind stays Grind and uses the same mounted disclosure contract', () => {
  const engine = loadLiveEngine();
  const { match, metrics } = fourGolferFixture({ statTrackingMode: 'GRIND' });
  const mode = engine.getEffectivePlayerStatTrackingMode(match, metrics);
  assert.equal(mode.active, 'GRIND');
  assert.equal(mode.editableCount, 4);
  assert.equal(mode.grindRestricted, false);
  assert.match(app, /statTrackingModeIncludesApproachGrid\(mode\.active\)/);
  assert.match(app, /player-mode-more-detail/);
});

test('Player and Classic modes continue to share score, stat, GIR, and persistence contracts', () => {
  const detailRenderer = app.slice(app.indexOf('function renderPlayerModeStatEntry'), app.indexOf('function renderPlayerPlayInputMode'));
  const applyPath = app.slice(app.indexOf('function applyCurrentHoleDomToMatch'), app.indexOf('function persistCurrentHoleEntries'));
  assert.match(detailRenderer, /data-score-player=/);
  assert.match(detailRenderer, /data-stat-player=/);
  assert.match(detailRenderer, /deriveGreenInRegulation/);
  assert.match(app, /switchPlayInputMode/);
  assert.match(applyPath, /querySelectorAll\('input\[data-score-player\]'\)/);
  assert.match(applyPath, /input\[data-stat-player\]\[data-stat-key\]/);
  assert.doesNotMatch(app, /playerModeRoundSchema|playerModeScoreSchema|migratePlayerMode/);
});

test('auto-advance reuses the established device enablement and timing controls', () => {
  const scheduler = app.slice(app.indexOf('function schedulePlayerModeEntryAdvance'), app.indexOf('function getPlayerModeSavePresentation'));
  assert.match(scheduler, /isSmartScoreAdvanceEnabled\(match\)/);
  assert.match(scheduler, /getSmartScoreAdvanceDelay\(match\)/);
  assert.doesNotMatch(scheduler, /isPlayerModeMoreDetailOpen\(\)/);
  assert.match(scheduler, /focusPlayerModeAdvanceTarget/);
});

test('Enhanced requires directional detail before advancement while Casual remains unchanged', () => {
  const engine = loadLiveEngine();
  const enhanced = fourGolferFixture();
  enhanced.match.players[0].stats[0].fairwayResult = 'UNKNOWN';
  let target = engine.getPlayerModeEntryAdvanceTarget(enhanced.match, enhanced.metrics, enhanced.tee, enhanced.hole, 'p1');
  assert.equal(target.currentComplete, false, 'score and putts cannot skip an unknown par-4 fairway result');
  assert.deepEqual(JSON.parse(JSON.stringify(engine.getPlayerModeRequiredDetailState(enhanced.match, enhanced.metrics, enhanced.metrics.players[0], enhanced.tee, enhanced.hole))), {
    incomplete: true, fairway: true, approach: false, recoveryLie: false,
  });
  enhanced.match.players[0].stats[0].fairwayResult = 'HIT';
  target = engine.getPlayerModeEntryAdvanceTarget(enhanced.match, enhanced.metrics, enhanced.tee, enhanced.hole, 'p1');
  assert.equal(target.currentComplete, true);
  assert.equal(target.nextPlayerId, 'p2');

  const casual = fourGolferFixture({ statTrackingMode: 'CASUAL' });
  casual.match.players[0].stats[0].fairwayResult = 'UNKNOWN';
  target = engine.getPlayerModeEntryAdvanceTarget(casual.match, casual.metrics, casual.tee, casual.hole, 'p1');
  assert.equal(target.currentComplete, true, 'Casual has no required directional detail');
});

test('four-golfer Grind can advance with More Detail open once required facts are complete', () => {
  const engine = loadLiveEngine();
  const storage = storageFixture();
  const fixture = fourGolferFixture({ statTrackingMode: 'GRIND' });
  engine.savePlayerModeMoreDetailOpen(true, storage);
  assert.equal(engine.isPlayerModeMoreDetailOpen(storage), true);
  const target = engine.getPlayerModeEntryAdvanceTarget(fixture.match, fixture.metrics, fixture.tee, fixture.hole, 'p1');
  assert.equal(target.currentComplete, true);
  assert.equal(target.nextPlayerId, 'p2');
});

test('pending advancement rejects a different match or hole context', () => {
  const engine = loadLiveEngine();
  const { match } = fourGolferFixture();
  assert.equal(engine.isPlayerModeAdvanceContextCurrent(match, match.id, 1, 1), true);
  assert.equal(engine.isPlayerModeAdvanceContextCurrent({ ...match, id: 'replacement-match' }, match.id, 1, 1), false);
  assert.equal(engine.isPlayerModeAdvanceContextCurrent(match, match.id, 1, 2), false);
});

test('GIR provenance and detailed readback remain explicit without changing stored facts', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.getPlayerModeGirProvenance({ source: 'calculated' }), 'Calculated from gross score and putts');
  assert.equal(engine.getPlayerModeGirProvenance({ source: 'override' }), 'Manual correction');
  const stat = { approachResult: '7', putts: 2, puttsSource: 'user', penaltyStrokes: 1, recoveryLie: 'ROUGH' };
  const before = JSON.stringify(stat);
  const readback = engine.buildPlayerModeDetailedReadback({
    derived: { value: false, source: 'override' },
    stat,
    recovery: { opportunity: true, success: false },
    approachLabels: { '7': 'Deep Left' },
  });
  assert.equal(readback, 'Missed deep left · scramble not converted · 2 putts · 1 penalty stroke.');
  assert.equal(JSON.stringify(stat), before);
});

test('collapsed detail preference does not alter retained approach or recovery facts', () => {
  const engine = loadLiveEngine();
  const storage = storageFixture();
  const fixture = fourGolferFixture();
  fixture.match.players[0].scores[0].gross = 5;
  fixture.match.players[0].stats[0] = { holeNumber: 1, putts: 2, puttsSource: 'user', fairwayResult: 'LEFT', approachResult: '7', recoveryLie: 'ROUGH', entryCompleted: true };
  const before = JSON.stringify(fixture.match.players[0].stats[0]);
  engine.savePlayerModeMoreDetailOpen(false, storage);
  assert.equal(engine.isPlayerModeMoreDetailOpen(storage), false);
  engine.savePlayerModeMoreDetailOpen(true, storage);
  assert.equal(engine.isPlayerModeMoreDetailOpen(storage), true);
  const detail = engine.getPlayerModeRequiredDetailState(fixture.match, fixture.metrics, fixture.metrics.players[0], fixture.tee, fixture.hole);
  assert.equal(detail.incomplete, false);
  assert.equal(JSON.stringify(fixture.match.players[0].stats[0]), before);
});
