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
  assert.match(html, /Press Activity/); assert.match(html, /Declared by/); assert.match(html, /Holes 6–18/); assert.match(html, /Original wager:/); assert.match(html, /Result:/);
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

test('Maximum Presses is enforced across the entire round and counts original Presses plus Re-Presses', () => {
  const f = fixture({ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', maxPressesPerRound: 4, declaringSideRule: 'EITHER_SIDE' }, 5);
  f.match.presses = [
    { pressId: 'front-1', parentGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', rootGameId: 'nassau_net', startingHole: 2, endingHole: 9, outcomeGameKey: 'nassau', status: 'ACTIVE' },
    { pressId: 'back-1', parentGameId: 'nassau_net', parentSegmentId: 'nassau_net:back', parentSegmentType: 'BACK', rootGameId: 'nassau_net', startingHole: 10, endingHole: 18, outcomeGameKey: 'nassau', status: 'ACTIVE' },
    { pressId: 'overall-1', parentGameId: 'team_match', parentSegmentId: 'team_match:overall', parentSegmentType: 'OVERALL', rootGameId: 'team_match', startingHole: 3, endingHole: 18, outcomeGameKey: 'team_match', status: 'ACTIVE' },
    { pressId: 'overall-repress', parentGameId: 'overall-1', parentSegmentId: 'team_match:overall', parentSegmentType: 'OVERALL', rootGameId: 'team_match', pressDepth: 2, startingHole: 4, endingHole: 18, outcomeGameKey: 'team_match', status: 'ACTIVE' },
  ].map(row => f.engine.normalizePressRecord({ ...row, wagerAmount: 10 }, f.match));
  const eligibility = f.engine.getPressEligibility(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', pressConfig: f.match.selectedGames[0], currentPosition: 5, declaringSideId: '2', isHost: true });
  assert.equal(eligibility.currentPressCount, 4);
  assert.equal(eligibility.reasonCode, 'PRESS_LIMIT_REACHED');
  assert.match(eligibility.reasonText, /entire round/i);
});

test('Maximum Re-Presses limits each Press chain without creating an additive wager pool', () => {
  const f = fixture({ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', maxPressesPerRound: 4, maxRePresses: 2, declaringSideRule: 'EITHER_SIDE' }, 5);
  const root = f.engine.buildPressRecordDraft(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', pressConfig: f.match.selectedGames[0], currentPosition: 2, declaringSideId: '2' });
  assert.ok(root);
  f.match.presses = [root];
  const first = f.engine.buildPressRecordDraft(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', parentPressId: root.pressId, pressConfig: f.match.selectedGames[0], currentPosition: 5, declaringSideId: '2' });
  assert.equal(first.pressDepth, 2);
  f.match.presses.push(first);
  f.match.players.forEach((player, index) => { player.scores[5].gross = index < 2 ? 4 : 5; player.scores[6].gross = index < 2 ? 4 : 5; });
  f.metrics = f.engine.computeMatchMetrics(f.match);
  const second = f.engine.buildPressRecordDraft(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', parentPressId: first.pressId, pressConfig: f.match.selectedGames[0], currentPosition: 7, declaringSideId: '2' });
  assert.equal(second.pressDepth, 3);
  f.match.presses.push(second);
  const blocked = f.engine.getRePressEligibility(f.match, f.metrics, second, { gameKey: 'team_match', pressConfig: f.match.selectedGames[0], currentPosition: 7, declaringSideId: '2', isHost: true });
  assert.equal(blocked.reasonCode, 'RE_PRESS_LIMIT_REACHED');
  assert.equal(f.match.presses.length, 3);
});

test('Press chooser exposes root and Re-Press opportunities without creating a wager', () => {
  const f = fixture({ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN', maxPressesPerRound: 4, maxRePresses: 2, declaringSideRule: 'EITHER_SIDE' }, 5);
  const root = f.engine.buildPressRecordDraft(f.match, f.metrics, 'OVERALL', { gameKey: 'team_match', pressConfig: f.match.selectedGames[0], currentPosition: 2, declaringSideId: '2' });
  f.match.presses = [root];
  const before = JSON.stringify(f.match.presses);
  const opportunities = f.engine.getCurrentPressOpportunities(f.match, f.metrics, { viewedPosition: 6, isHost: true });
  assert.ok(opportunities.some(row => !row.parentPressId));
  assert.ok(opportunities.some(row => row.parentPressId === root.pressId));
  assert.equal(JSON.stringify(f.match.presses), before);
});

test('shared player summary reuses trusted Postable values, stable ranking, accessible compact markup, and frozen data', () => {
  const active = fixture(undefined, 5);
  active.metrics.players[0].player.name = 'Alexandria Very Long Duplicate Player Name';
  const before = JSON.stringify({ match: active.match, metrics: active.metrics });
  const rows = active.engine.buildPlayerSummaryRows(active.match, active.metrics);
  assert.equal(rows.length, active.metrics.players.length);
  rows.forEach(row => {
    const metric = active.metrics.players.find(player => String(player.playerId) === row.playerId);
    assert.equal(row.postableScore, metric.postableTotal);
    assert.equal(row.gross, metric.grossTotal);
    assert.equal(row.net, metric.leaderboardNetTotal);
    assert.equal(row.netToPar, metric.leaderboardNetDiff);
  });
  assert.equal(new Set(rows.map(row => row.playerId)).size, rows.length);
  const table = active.engine.buildPlayerSummaryTable(rows, 'Player Leaderboard');
  assert.match(table, /aria-label="Player Leaderboard"/);
  assert.match(table, /aria-label="Postable Score"/);
  assert.match(table, />Post\.<\/span>/);
  assert.match(table, /title="Alexandria Very Long Duplicate Player Name"/);
  const quick = active.engine.buildQuickPlayerScoreSummary(active.match, active.metrics);
  assert.match(quick, /Player Score Summary/);
  assert.match(quick, /player-summary-table/);
  assert.equal(JSON.stringify({ match: active.match, metrics: active.metrics }), before);

  const blank = fixture(undefined, 0);
  const blankTable = blank.engine.buildPlayerSummaryTable(blank.engine.buildPlayerSummaryRows(blank.match, blank.metrics));
  assert.match(blankTable, /<td>—<\/td>/);

  const completed = fixture(undefined, 18);
  completed.match.status = 'complete'; completed.match.completedAt = '2026-07-12T20:00:00Z';
  const frozen = completed.engine.buildFrozenRoundRecord(completed.match, completed.metrics, completed.match.completedAt);
  const frozenBefore = JSON.stringify(frozen);
  const frozenRows = completed.engine.buildPlayerSummaryRows(completed.match, completed.metrics, frozen);
  frozenRows.forEach(row => assert.equal(row.postableScore, frozen.players.find(player => String(player.playerId) === row.playerId).postable));
  assert.match(completed.engine.buildQuickPlayerScoreSummary(completed.match, completed.metrics, frozen), /Postable Score/);
  assert.equal(JSON.stringify(frozen), frozenBefore);
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

test('local Nassau visibility resolves legacy match config and survives normalization reload', () => {
  const game = { key: 'nassau', basis: 'net', stakesFront: 10, stakesBack: 10, stakesOverall: 10 };
  const match = { id: 'legacy-nassau', date: '2026-07-12', courseId: 'c', teeId: 't', holeCount: 18, format: 'teams', teamCount: 2, playersPerTeam: 2, status: 'active', storageMode: 'local', selectedGames: [game], pressConfig: { pressesEnabled: true, nassauFrontEnabled: true, declarationWindow: 'BEFORE_HOLE_STARTED', pressAvailabilityRule: 'FUTURE_HOLES_REMAIN' }, presses: [], players: players.map((p, i) => ({ playerId: p.id, team: i < 2 ? 1 : 2, slot: i, scores: scores(5, i < 2 ? 4 : 5) })) };
  const engine = loadLiveEngine();
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [structuredClone(match)], activeMatchId: match.id });
  const live = state.matches[0];
  const before = JSON.stringify(live.selectedGames);
  assert.equal(engine.getPressConfigForGame(live, live.selectedGames[0]).pressesEnabled, true);
  assert.ok(engine.getCurrentPressOpportunities(live, engine.computeMatchMetrics(live), { viewedPosition: 6, isHost: true }).some(row => row.segment === 'FRONT'));
  const reloaded = structuredClone(live);
  engine.normalizeMatch(reloaded);
  assert.equal(engine.getPressConfigForGame(reloaded, reloaded.selectedGames[0]).pressesEnabled, true);
  assert.ok(engine.getCurrentPressOpportunities(reloaded, engine.computeMatchMetrics(reloaded), { viewedPosition: 6, isHost: true }).length > 0);
  assert.equal(JSON.stringify(live.selectedGames), before);
});

test('active Nassau press shows projected Quick Scoreboard impact without creating settlement transactions', () => {
  const f = fixture({ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5, pressesEnabled: true }, 5);
  f.match.players = [f.match.players[0], f.match.players[2]];
  f.match.playersPerTeam = 1;
  f.metrics = f.engine.computeMatchMetrics(f.match);
  const press = f.engine.normalizePressRecord({ pressId: 'press-live', parentGameId: 'nassau', rootGameId: 'nassau', parentSegmentId: 'nassau:front', parentSegmentType: 'FRONT', startingHole: 3, endingHole: 9, wagerAmount: 5, status: 'ACTIVE', initiatedByPlayerId: 'c' }, f.match);
  f.match.presses = [press];
  const settlement = f.engine.buildPressSettlementShape(f.match, f.metrics, press);
  assert.equal(settlement.status, 'ACTIVE');
  assert.equal(settlement.transactions.length, 0);
  const html = f.engine.buildQuickNassauResults(f.match, f.metrics);
  assert.match(html, /ACTIVE[^<]*\+\$5/);
  assert.equal(settlement.transactions.length, 0);
});

test('complete payout context includes active and final Press contributions exactly once before hero netting', () => {
  const f = fixture({ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 0, stakesOverall: 0, pressesEnabled: true }, 5);
  f.match.players = [f.match.players[0], f.match.players[2]];
  f.match.playersPerTeam = 1;
  f.metrics = f.engine.computeMatchMetrics(f.match);
  const press = f.engine.normalizePressRecord({ pressId: 'hero-press', parentGameId: 'nassau_net', rootGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 3, endingHole: 9, wagerAmount: 5, status: 'ACTIVE' }, f.match);
  const base = f.engine.getPayoutReportContext(f.match, f.metrics);
  f.match.presses = [press, structuredClone(press)];
  const before = JSON.stringify(f.match);
  const previewShape = f.engine.buildPressSettlementShape(f.match, f.metrics, press, { includeActivePreview: true });
  assert.equal(previewShape.status, 'ACTIVE');
  assert.ok(previewShape.transactions.length > 0);
  const complete = f.engine.getPayoutReportContext(f.match, f.metrics);
  assert.equal(complete.payoutGames.filter(game => game.key === 'press:hero-press').length, 1);
  Object.keys(complete.finalTotals).forEach(playerId => {
    assert.equal(Number(complete.finalTotals[playerId] || 0) - Number(base.finalTotals[playerId] || 0), Number(previewShape.amounts[playerId] || 0));
  });
  const obligations = f.engine.optimalSettlementRows(complete.finalTotals);
  const positiveLedger = Object.values(complete.finalTotals).filter(amount => Number(amount) > 0).reduce((sum, amount) => sum + Number(amount), 0);
  assert.equal(obligations.reduce((sum, row) => sum + Number(row.amount), 0), positiveLedger);
  const provisional = f.engine.buildQuickSettlementHero(f.match, f.metrics, complete);
  assert.match(provisional, /Provisional Settlement/);
  assert.match(provisional, /would pay/);
  assert.match(provisional, /\$10/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.engine.getPayoutReportContext(f.match, f.metrics).finalTotals)), JSON.parse(JSON.stringify(complete.finalTotals)));
  assert.equal(JSON.stringify(f.match), before);

  f.match.players.forEach(player => { for (let index = 5; index < 9; index += 1) player.scores[index].gross = player.team === 1 ? 4 : 5; });
  f.metrics = f.engine.computeMatchMetrics(f.match);
  f.match.status = 'complete'; f.match.completedAt = '2026-07-12T20:00:00Z';
  const finalContext = f.engine.getPayoutReportContext(f.match, f.metrics);
  assert.equal(finalContext.payoutGames.filter(game => game.key === 'press:hero-press').length, 1);
  const finalHero = f.engine.buildQuickSettlementHero(f.match, f.metrics, finalContext);
  assert.match(finalHero, /Final Settlement/);
  assert.match(finalHero, / pays /);
  const frozen = f.engine.buildFrozenRoundRecord(f.match, f.metrics, f.match.completedAt);
  const frozenBefore = JSON.stringify(frozen);
  const frozenHero = f.engine.buildQuickSettlementHero(f.match, f.metrics, finalContext, frozen);
  assert.match(frozenHero, /Final Settlement/);
  assert.match(frozenHero, / pays /);
  assert.equal(JSON.stringify(frozen), frozenBefore);
});

test('Press-inclusive context handles multiple, standalone, halved, incomplete, voided, and superseded records', () => {
  const multiple = fixture({ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5, pressesEnabled: true }, 9);
  const front = multiple.engine.normalizePressRecord({ pressId: 'front-final', parentGameId: 'nassau_net', rootGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 7, endingHole: 9, wagerAmount: 5, status: 'ACTIVE' }, multiple.match);
  const overall = multiple.engine.normalizePressRecord({ pressId: 'overall-live', parentGameId: 'nassau_net', rootGameId: 'nassau_net', parentSegmentId: 'nassau_net:overall', parentSegmentType: 'OVERALL', startingHole: 7, endingHole: 18, wagerAmount: 5, status: 'ACTIVE' }, multiple.match);
  multiple.match.presses = [front, overall, structuredClone(front)];
  const multipleContext = multiple.engine.getPayoutReportContext(multiple.match, multiple.metrics);
  assert.equal(JSON.stringify(multipleContext.payoutGames.filter(game => game.meta?.press).map(game => game.key).sort()), JSON.stringify(['press:front-final', 'press:overall-live']));

  const standalone = fixture({ key: 'team_match', basis: 'net', stake: 10, pressesEnabled: true }, 9);
  const matchPress = standalone.engine.normalizePressRecord({ pressId: 'match-press', parentGameId: 'team_match', rootGameId: 'team_match', parentSegmentId: 'team_match:overall', parentSegmentType: 'OVERALL', startingHole: 7, endingHole: 9, wagerAmount: 10, outcomeGameKey: 'team_match', status: 'ACTIVE' }, standalone.match);
  standalone.match.presses = [matchPress];
  const standaloneContext = standalone.engine.getPayoutReportContext(standalone.match, standalone.metrics);
  assert.equal(standaloneContext.payoutGames.filter(game => game.key === 'press:match-press').length, 1);
  assert.equal(Object.values(standaloneContext.payoutGames.find(game => game.key === 'press:match-press').amounts).reduce((sum, amount) => sum + Number(amount), 0), 0);

  const excluded = fixture({ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 0, stakesOverall: 0, pressesEnabled: true }, 5);
  const raw = { parentGameId: 'nassau_net', rootGameId: 'nassau_net', parentSegmentId: 'nassau_net:front', parentSegmentType: 'FRONT', startingHole: 3, endingHole: 9, wagerAmount: 5 };
  excluded.match.presses = [
    excluded.engine.normalizePressRecord({ ...raw, pressId: 'voided', status: 'VOIDED' }, excluded.match),
    excluded.engine.normalizePressRecord({ ...raw, pressId: 'superseded', status: 'SUPERSEDED' }, excluded.match),
  ];
  assert.equal(excluded.engine.getPayoutReportContext(excluded.match, excluded.metrics).payoutGames.filter(game => game.meta?.press).length, 0);
  excluded.match.status = 'complete'; excluded.match.completedAt = '2026-07-12T20:00:00Z';
  excluded.match.presses = [excluded.engine.normalizePressRecord({ ...raw, pressId: 'incomplete', status: 'ACTIVE' }, excluded.match)];
  assert.equal(excluded.engine.getPayoutReportContext(excluded.match, excluded.metrics).payoutGames.filter(game => game.meta?.press).length, 0);

  const halved = fixture({ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 0, stakesOverall: 0, pressesEnabled: true }, 9);
  halved.match.players.forEach(player => { player.scores = scores(9, 4); });
  halved.metrics = halved.engine.computeMatchMetrics(halved.match);
  halved.match.presses = [halved.engine.normalizePressRecord({ ...raw, pressId: 'halved', endingHole: 9, status: 'ACTIVE' }, halved.match)];
  const halvedGame = halved.engine.getPayoutReportContext(halved.match, halved.metrics).payoutGames.find(game => game.key === 'press:halved');
  assert.ok(halvedGame);
  assert.ok(Object.values(halvedGame.amounts).every(amount => Number(amount) === 0));
});

test('shared Classic Scorecard scroller preserves 18-hole and 9-hole final columns without source mutation', () => {
  const full = fixture(undefined, 5);
  const fullBefore = JSON.stringify(full.match);
  const fullHtml = full.engine.buildQuickScoreboardView(full.match, full.metrics);
  assert.match(fullHtml, /<details class="[^"]*quick-classic-scorecard"><summary>Classic Scorecard<\/summary><div class="scorecard-sub tiny">/);
  assert.match(fullHtml, /<div class="scorecard-wrap table-scroll-region" data-scroll-table="classic-scorecard" tabindex="0" role="region"/);
  assert.match(fullHtml, />H18<\/th>/);
  assert.match(fullHtml, /<th>Out<\/th><th>In<\/th><th>Total<\/th>/);
  assert.doesNotMatch(fullHtml, /quick-classic-scorecard[^]*quick-scroll-panel/);
  assert.equal(JSON.stringify(full.match), fullBefore);

  const short = fixture(undefined, 5);
  short.match.holeCount = 9;
  short.metrics = short.engine.computeMatchMetrics(short.match);
  const shortBefore = JSON.stringify(short.match);
  const shortHtml = short.engine.buildQuickScoreboardView(short.match, short.metrics);
  assert.match(shortHtml, />H9<\/th>/);
  assert.doesNotMatch(shortHtml, />H10<\/th>/);
  assert.match(shortHtml, /<th>Out<\/th><th>Total<\/th>/);
  assert.equal(JSON.stringify(short.match), shortBefore);
});

test('nested legacy config normalizes safely and local authority is not treated as joined denial', () => {
  const engine = loadLiveEngine();
  const normalized = engine.normalizePressConfig({ pressConfig: { pressesEnabled: true, nassauFrontEnabled: false }, nassauOverallEnabled: true });
  assert.equal(normalized.pressesEnabled, true);
  assert.equal(normalized.nassauFrontEnabled, false);
  assert.equal(normalized.nassauOverallEnabled, true);
  const local = fixture({ key: 'team_match', basis: 'net', stake: 10, pressConfig: { pressesEnabled: true }, pressAvailabilityRule: 'FUTURE_HOLES_REMAIN' }, 5);
  assert.ok(local.engine.getCurrentPressOpportunities(local.match, local.metrics, { viewedPosition: 6 }).length > 0);
});
