import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

test('escalation capabilities prevent incompatible mechanics', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.getGameEscalationCapability('nassau'), 'PRESS');
  assert.equal(engine.getGameEscalationCapability('singles_match'), 'PRESS');
  assert.equal(engine.getGameEscalationCapability('team_match'), 'PRESS');
  assert.equal(engine.getGameEscalationCapability('skins'), 'CARRYOVER');
  assert.equal(engine.getGameEscalationCapability('sneaky_sandy_poley'), 'BRIDGE');
  assert.equal(engine.getGameEscalationCapability('team_stroke'), 'NONE');
});

test('production config normalizes trigger, declaration, stake, count, depth, and Nassau lanes', () => {
  const engine = loadLiveEngine();
  const value = engine.normalizePressConfig({ pressesEnabled: true, pressType: 'PROMPT_AT_THRESHOLD', declaringSideRule: 'EITHER_SIDE', declarationWindow: 'BEFORE_HOLE_COMPLETED', pressValueRule: 'INHERIT_PARENT_STAKE', maxPressesPerRootGame: 4, maxPressDepth: 2, nassauBackEnabled: false });
  assert.equal(value.pressType, 'PROMPT_AT_THRESHOLD');
  assert.equal(value.declaringSideRule, 'EITHER_SIDE');
  assert.equal(value.declarationWindow, 'BEFORE_HOLE_COMPLETED');
  assert.equal(value.pressValueRule, 'INHERIT_PARENT_STAKE');
  assert.equal(value.maxPressesPerRootGame, 4);
  assert.equal(value.maxPressDepth, 2);
  assert.equal(value.nassauBackEnabled, false);
});

test('tree normalization preserves stable root, parent, depth and deduplicates sync replay', () => {
  const engine = loadLiveEngine();
  const match = { id: 'r1', presses: [] };
  const row = engine.normalizePressRecord({ pressId: 'p1', parentGameId: 'nassau_net', rootGameId: 'nassau_net', pressDepth: 1, parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 9, endingHole: 9, wagerAmount: 5 }, match);
  assert.equal(row.gameId, 'p1');
  assert.equal(row.rootGameId, 'nassau_net');
  assert.equal(row.holeStart, 9);
  assert.equal(engine.dedupePressRecords([row, structuredClone(row)]).length, 1);
  match.presses = [row, structuredClone(row)];
  assert.equal(engine.getPressTree(match).records.length, 1);
});

test('void is host-authoritative, requires a reason, and preserves the record', () => {
  const engine = loadLiveEngine();
  const match = { id: 'r1', presses: [{ pressId: 'p1', status: 'ACTIVE' }] };
  assert.equal(engine.voidPressRecord(match, 'p1', '', { isHost: true }), false);
  assert.equal(engine.voidPressRecord(match, 'p1', 'Created in error', { isHost: false }), false);
  assert.equal(engine.voidPressRecord(match, 'p1', 'Created in error', { isHost: true, at: '2026-07-12T12:00:00Z' }), true);
  assert.equal(match.presses[0].status, 'VOIDED');
  assert.equal(match.pressEvents[0].eventType, 'press_voided');
});

const players = [{ id: 'a', name: 'Alex', index: 0 }, { id: 'b', name: 'Alex', index: 0 }, { id: 'c', name: 'Casey', index: 0 }, { id: 'd', name: 'Drew', index: 0 }];
const course = { id: 'c', name: 'Course', tees: [{ id: 't', teeName: 'T', rating: 72, slope: 113, par: 72, holes: Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1 })) }] };
const scores = (count, value) => Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, gross: i < count ? value : null }));
function fixture(game = { key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true }, count = 5) {
  game = { pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', ...game };
  const match = { id: 'round', date: '2026-07-12', courseId: 'c', teeId: 't', holeCount: 18, format: 'teams', teamCount: 2, playersPerTeam: game.key === 'singles_match' ? 1 : 2, status: 'active', selectedGames: [game], presses: [], players: (game.key === 'singles_match' ? players.slice(0, 2) : players).map((p, i) => ({ playerId: p.id, team: game.key === 'singles_match' ? i + 1 : i < 2 ? 1 : 2, scores: scores(count, i < (game.key === 'singles_match' ? 1 : 2) ? 4 : 5) })) };
  const engine = loadLiveEngine();
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [match], activeMatchId: 'round' });
  return { engine, match: state.matches[0], metrics: engine.computeMatchMetrics(state.matches[0]) };
}

test('LOSING_SIDE_ONLY uses stable IDs for team and same-name singles declarations', () => {
  for (const key of ['team_match', 'singles_match']) {
    const f = fixture({ key, basis: 'net', stake: 10, pressesEnabled: true, declaringSideRule: 'LOSING_SIDE_ONLY' });
    assert.equal(f.engine.getPressEligibility(f.match, f.metrics, 'OVERALL', { gameKey: key, pressConfig: f.match.selectedGames[0], currentPosition: 5, declaringSideId: '2' }).eligible, true);
    assert.equal(f.engine.getPressEligibility(f.match, f.metrics, 'OVERALL', { gameKey: key, pressConfig: f.match.selectedGames[0], currentPosition: 5, declaringSideId: '1' }).reasonCode, 'DECLARING_SIDE_NOT_ALLOWED');
  }
});

test('confirmation revalidates the same declaring side and rejects tied or moved starting state without mutation', () => {
  const f = fixture();
  const before = JSON.stringify(f.match.selectedGames);
  const request = { gameKey: 'team_match', segment: 'OVERALL', parentGameId: 'team_match', declaredForHole: 6, declaringSideId: '2', pressConfig: f.match.selectedGames[0] };
  const ok = f.engine.createPressFromConfirmation(f.match, f.metrics, request, { currentPosition: 5, isHost: true, sourceDeviceId: 'host', createdAt: '2026-07-12T12:00:00Z' });
  assert.equal(ok.created, true);
  const stale = fixture();
  stale.match.players.slice(2).forEach(player => { player.scores = scores(5, 4); });
  stale.metrics = stale.engine.computeMatchMetrics(stale.match);
  assert.equal(stale.engine.createPressFromConfirmation(stale.match, stale.metrics, request, { currentPosition: 5, isHost: true }).reasonCode, 'DECLARING_SIDE_NOT_ALLOWED');
  const moved = fixture();
  assert.equal(moved.engine.createPressFromConfirmation(moved.match, moved.metrics, { ...request, pressConfig: moved.match.selectedGames[0], declaredForHole: 7 }, { currentPosition: 5, isHost: true }).reasonCode, 'DECLARATION_WINDOW_CLOSED');
  assert.equal(JSON.stringify(f.match.selectedGames), before);
});

test('prompt identity, dismissal persistence, confirmation suppression, and new opportunities are deterministic', () => {
  const f = fixture({ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true, pressType: 'PROMPT_AT_THRESHOLD', autoPressThreshold: 2 });
  const eligibility = f.engine.getPressEligibility(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', pressConfig: f.match.selectedGames[0], currentPosition: 5 });
  const first = f.engine.getPressPromptOpportunity(eligibility, f.match.selectedGames[0]);
  assert.equal(first.key, f.engine.getPressPromptOpportunity(eligibility, f.match.selectedGames[0]).key);
  assert.equal(f.engine.setPressPromptOpportunityState(f.match, first, 'DISMISSED'), true);
  assert.equal(f.engine.isPressPromptOpportunitySuppressed(f.match, first), true);
  const reloaded = fixture(); reloaded.match.pressPromptState = structuredClone(f.match.pressPromptState); f.engine.normalizeMatch(reloaded.match);
  assert.equal(f.engine.isPressPromptOpportunitySuppressed(reloaded.match, first), true);
  const next = { ...first, key: first.key.replace('|6|', '|7|'), declaredForHole: 7 };
  assert.equal(f.engine.isPressPromptOpportunitySuppressed(f.match, next), false);
});

test('Shared Match merge preserves host lifecycle, deduplicates replay, and orders distinct presses deterministically', () => {
  const engine = loadLiveEngine();
  const base = { parentGameId: 'team_match', parentSegmentId: 'team_match:overall', parentSegmentType: 'OVERALL', rootGameId: 'team_match', startingHole: 6, endingHole: 18, declaredForHole: 6, pressDepth: 1, hostDeviceId: 'host' };
  const host = { ...base, pressId: 'p1', status: 'VOIDED', auditReason: 'error', voidedAt: '2026-07-12T13:00:00Z' };
  const stale = { ...base, pressId: 'p1', status: 'ACTIVE', hostDeviceId: 'join' };
  const distinct = { ...base, pressId: 'p2', startingHole: 7, declaredForHole: 7, status: 'ACTIVE' };
  const before = JSON.stringify([host, stale, distinct]);
  const merged = engine.mergeAuthoritativePressRecords([host], [stale, stale, distinct], { hostDeviceId: 'host' });
  assert.equal(merged.length, 2);
  assert.equal(merged.find(row => row.pressId === 'p1').status, 'VOIDED');
  assert.equal(merged.find(row => row.pressId === 'p1').auditReason, 'error');
  assert.equal(JSON.stringify(merged.map(row => row.pressId)), JSON.stringify(['p1', 'p2']));
  assert.equal(JSON.stringify([host, stale, distinct]), before);
});

test('press audit is explicit, omits empty state, and frozen rendering is non-mutating', () => {
  const f = fixture();
  assert.equal(f.engine.buildPressAuditSection(f.match, f.metrics), '');
  const created = f.engine.createPressFromConfirmation(f.match, f.metrics, { gameKey: 'team_match', segment: 'OVERALL', parentGameId: 'team_match', declaredForHole: 6, declaringSideId: '2', pressConfig: f.match.selectedGames[0] }, { currentPosition: 5, isHost: true, sourceDeviceId: 'host' });
  assert.equal(created.created, true);
  const html = f.engine.buildPressAuditSection(f.match, f.metrics);
  assert.match(html, /Presses/); assert.match(html, /Declared by/); assert.match(html, /Holes 6–18/); assert.match(html, /Stake:/); assert.match(html, /Ledger impact:/);
  f.match.status = 'complete'; f.match.completedAt = '2026-07-12T20:00:00Z';
  const record = f.engine.buildRoundRecord(f.match, f.metrics); record.isFrozen = true; record.frozenAt = '2026-07-12T20:00:00Z';
  const before = JSON.stringify(record);
  f.engine.buildPressAuditSection(f.match, f.metrics, record);
  assert.equal(JSON.stringify(record), before);
  assert.equal(record.games.filter(game => game.type === 'press').length, 1);
});

test('contextual opportunities use only the authoritative active scoring hole and never shift forward', () => {
  const game = { key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', declarationWindow: 'BEFORE_HOLE_STARTED' };
  const untouched = fixture(game, 5);
  assert.equal(untouched.engine.getActiveScoringPosition(untouched.match), 6);
  const available = untouched.engine.getCurrentPressOpportunities(untouched.match, untouched.metrics, { viewedPosition: 6, isHost: true });
  assert.ok(available.length > 0);
  assert.ok(available.every(row => row.eligibility.nextStartingHole === 6));
  assert.equal(untouched.engine.getCurrentPressOpportunities(untouched.match, untouched.metrics, { viewedPosition: 4, isHost: true }).length, 0);
  assert.equal(untouched.engine.getCurrentPressOpportunities(untouched.match, untouched.metrics, { viewedPosition: 7, isHost: true }).length, 0);
  assert.equal(untouched.engine.getCurrentPressOpportunities(untouched.match, untouched.metrics, { viewedPosition: 6, isHost: false }).length, 0);

  untouched.match.players[0].scores[5].gross = 4;
  const partialMetrics = untouched.engine.computeMatchMetrics(untouched.match);
  assert.equal(untouched.engine.getCurrentPressOpportunities(untouched.match, partialMetrics, { viewedPosition: 6, isHost: true }).length, 0);
  assert.equal(untouched.match.presses.length, 0);

  const permissive = fixture({ ...game, declarationWindow: 'BEFORE_HOLE_COMPLETED' }, 5);
  permissive.match.players[0].scores[5].gross = 4;
  const permissiveMetrics = permissive.engine.computeMatchMetrics(permissive.match);
  const partial = permissive.engine.getCurrentPressOpportunities(permissive.match, permissiveMetrics, { viewedPosition: 6, isHost: true });
  assert.ok(partial.length > 0);
  assert.ok(partial.every(row => row.partialHole && row.eligibility.nextStartingHole === 6));
});

test('Player Score Summary is compact, stable-ID keyed, and precedes the scorecard', () => {
  const f = fixture(undefined, 5);
  const before = JSON.stringify(f.match);
  const summary = f.engine.buildQuickPlayerScoreSummary(f.match, f.metrics);
  assert.match(summary, /Player Score Summary/);
  assert.match(summary, /data-player-id="a"/);
  assert.match(summary, /data-player-id="b"/);
  assert.match(summary, /<th>Gross<\/th><th>Net<\/th><th>Net \+\/-<\/th>/);
  const html = f.engine.buildQuickScoreboardView(f.match, f.metrics);
  assert.ok(html.indexOf('Player Score Summary') < html.indexOf('Classic Scorecard'));
  assert.equal(JSON.stringify(f.match), before);
});

test('Game Summary uses native selected-game labels and omits unselected games', () => {
  const f = fixture({ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: false }, 5);
  const html = f.engine.buildQuickGameSummary(f.match, f.metrics);
  assert.match(html, /Game Summary/);
  assert.match(html, /Team Match Play/);
  assert.doesNotMatch(html, />Nassau</);
  assert.doesNotMatch(html, />SSP</);
  assert.doesNotMatch(html, /Base Game Results/);
});
