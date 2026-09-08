import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentVersionBare } from './support/release-identity.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function makeFixture({ mode = 'points', basis = 'gross', scoresByPlayer = null, playedHoleOrder = null, indexes = [0, 0, 0, 0] } = {}) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 18 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 400 }));
  const players = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, name: `Player ${id.toUpperCase()}`, index: indexes[index] }));
  const course = { id: 'course', name: 'Sixes Club', tees: [{ id: 'tee', teeName: 'Blue', rating: 72, slope: 113, par: 72, holes }] };
  const defaults = {
    a: Array(18).fill(4),
    b: Array(18).fill(5),
    c: Array(18).fill(6),
    d: Array(18).fill(7),
  };
  const scores = scoresByPlayer || defaults;
  const match = {
    id: 'sixes-round', date: '2026-09-07', courseId: course.id, teeId: 'tee', holeCount: 18,
    format: 'teams', teamCount: 2, playersPerTeam: 2, featuredCompetition: 'sixes', matchStatusGame: 'sixes',
    playedHoleOrder: playedHoleOrder || holes.map(hole => hole.holeNumber),
    selectedGames: [{ key: 'sixes', mode, basis, playerIds: ['a', 'b', 'c', 'd'], teamScoringMode: 'best_ball', segmentResultMode: 'match', pointsPerHoleWin: 1, pointValue: 1, stakePerSegment: 5, handicapAllowanceMode: 'recommended', handicapAllowancePercent: 90 }],
    players: players.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, slot: index, teeId: 'tee', scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: scores[player.id]?.[holeIndex] ?? null })) })),
  };
  const state = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id });
  const live = state.matches[0];
  return { engine, match: live, metrics: engine.computeMatchMetrics(live) };
}

test('release identity and selectable Sixes surfaces are present', () => {
  assert.equal(packageJson.version, currentVersionBare);
  assert.match(appSource, /key: 'sixes', label: 'Sixes \(6-6-6\)'/);
  assert.match(appSource, /label: 'Rotating Partnerships', keys: \['sixes'\]/);
  assert.match(indexSource, /id="sixesScorecardCard"/);
});

test('rotation gives every golfer each partner exactly once', () => {
  const fixture = makeFixture();
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.segments.map(segment => [Array.from(segment.sideA.playerIds), Array.from(segment.sideB.playerIds)]))), [
    [['a', 'b'], ['c', 'd']],
    [['a', 'c'], ['b', 'd']],
    [['a', 'd'], ['b', 'c']],
  ]);
});

test('segments follow played position rather than numerical hole number', () => {
  const order = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6];
  const fixture = makeFixture({ playedHoleOrder: order });
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.segments.map(segment => Array.from(segment.holeNumbers)))), [order.slice(0, 6), order.slice(6, 12), order.slice(12, 18)]);
});

test('Best Ball compares the lower score on each partnership', () => {
  const fixture = makeFixture();
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.equal(result.segments[0].holes[0].aScore, 4);
  assert.equal(result.segments[0].holes[0].bScore, 6);
  assert.equal(result.segments[0].holes[0].winner, 'A');
});

test('a partial four-player hole stays unknown and outside the result', () => {
  const scores = { a: Array(18).fill(4), b: Array(18).fill(5), c: Array(18).fill(6), d: Array(18).fill(7) };
  scores.d[0] = null;
  const fixture = makeFixture({ scoresByPlayer: scores });
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.equal(result.segments[0].holes[0].completed, false);
  assert.equal(result.segments[0].holes[0].winner, null);
  assert.equal(result.completedHoles, 17);
});

test('Net Game Handicaps use one four-player low reference for every segment', () => {
  const fixture = makeFixture({ basis: 'net', indexes: [0, 10, 20, 30] });
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.deepEqual({ ...result.gameHandicaps }, { a: 0, b: 9, c: 18, d: 27 });
  assert.equal(result.lowGameHandicap, 0);
  assert.equal(result.segments[0].holes[0].values.d, 5);
  assert.equal(result.segments[2].holes[5].values.d, 6);
});

test('a 4-and-2 segment is decided before all six holes are entered', () => {
  const scores = { a: Array(18).fill(null), b: Array(18).fill(null), c: Array(18).fill(null), d: Array(18).fill(null) };
  for (let index = 0; index < 4; index += 1) { scores.a[index] = 4; scores.b[index] = 5; scores.c[index] = 6; scores.d[index] = 7; }
  const fixture = makeFixture({ scoresByPlayer: scores });
  const segment = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]).segments[0];
  assert.equal(segment.decided, true);
  assert.equal(segment.complete, false);
  assert.equal(segment.winner, 'A');
});

test('halved segments pay nothing and settlement remains zero-sum', () => {
  const tied = { a: Array(18).fill(4), b: Array(18).fill(4), c: Array(18).fill(4), d: Array(18).fill(4) };
  const fixture = makeFixture({ mode: 'segments', scoresByPlayer: tied });
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.ok(result.segments.every(segment => segment.winner === 'halved'));
  assert.ok(result.segments.every(segment => Object.values(segment.amounts).every(amount => amount === 0)));
  assert.equal(Object.values(result.amounts).reduce((sum, amount) => sum + amount, 0), 0);
  assert.equal(result.settlements.length, 0);
});

test('settlement is per losing golfer and optimized to zero-sum payments', () => {
  const fixture = makeFixture({ mode: 'segments' });
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.equal(Object.values(result.amounts).reduce((sum, amount) => sum + amount, 0), 0);
  result.segments.forEach(segment => assert.equal(Object.values(segment.amounts).reduce((sum, amount) => sum + amount, 0), 0));
  result.playerIds.forEach(playerId => {
    const segmentTotal = result.segments.reduce((sum, segment) => sum + segment.amounts[playerId], 0);
    assert.equal(segmentTotal, result.amounts[playerId]);
  });
  assert.deepEqual(result.settlements, fixture.engine.optimalSettlementRows(result.amounts));
});

test('Ledger model carries authoritative per-segment amounts for report cross-footing', () => {
  const fixture = makeFixture({ mode: 'segments' });
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  const game = fixture.engine.buildLedgerEntryReportModel(fixture.match, fixture.metrics).games.find(row => row.type === 'sixes');
  assert.deepEqual(game.segments.map(segment => ({ ...segment.amounts })), result.segments.map(segment => ({ ...segment.amounts })));
});

test('all three segments must be decided before early completion is reported', () => {
  const scores = { a: Array(18).fill(null), b: Array(18).fill(null), c: Array(18).fill(null), d: Array(18).fill(null) };
  for (let index = 0; index < 10; index += 1) { scores.a[index] = 4; scores.b[index] = 5; scores.c[index] = 6; scores.d[index] = 7; }
  const fixture = makeFixture({ mode: 'segments', scoresByPlayer: scores });
  assert.equal(fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]).segments[0].decided, true);
  assert.equal(fixture.engine.areAllGamesFinal(fixture.match, fixture.metrics), false);
  for (let index = 10; index < 18; index += 1) fixture.match.players.forEach(player => { player.scores[index].gross = ({ a: 4, b: 5, c: 6, d: 7 })[player.playerId]; });
  const completeMetrics = fixture.engine.computeMatchMetrics(fixture.match);
  assert.equal(fixture.engine.areAllGamesFinal(fixture.match, completeMetrics), true);
});

test('cloud round-trip preserves the exact ordered config and defaults', () => {
  const fixture = makeFixture();
  const cloud = fixture.engine.buildSelectedGamesForCloud(fixture.match);
  const hydrated = fixture.engine.hydrateSelectedGamesFromCloud(cloud);
  const sixes = hydrated.find(game => game.key === 'sixes');
  assert.deepEqual(Array.from(sixes.playerIds), ['a', 'b', 'c', 'd']);
  assert.equal(sixes.teamScoringMode, 'best_ball');
  assert.equal(sixes.segmentResultMode, 'match');
  assert.equal(sixes.mode, 'points');
  assert.equal(sixes.pointValue, 1);
  assert.equal(sixes.pointsPerHoleWin, 1);
});

test('points mode awards both winning partners and settles all six head-to-head pairs', () => {
  const fixture = makeFixture({ mode: 'points' });
  const result = fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]);
  assert.equal(Object.values(result.totals).reduce((sum, value) => sum + value, 0), 36);
  assert.deepEqual({ ...result.totals }, { a: 18, b: 6, c: 6, d: 6 });
  assert.deepEqual({ ...result.amounts }, { a: 36, b: -12, c: -12, d: -12 });
});

test('each scoring mode ignores the other mode stake', () => {
  const pointsLow = makeFixture({ mode: 'points', pointValue: 2, stakePerSegment: 1 });
  const pointsHigh = makeFixture({ mode: 'points', pointValue: 2, stakePerSegment: 999 });
  const segmentsLow = makeFixture({ mode: 'segments', pointValue: 1, stakePerSegment: 7 });
  const segmentsHigh = makeFixture({ mode: 'segments', pointValue: 999, stakePerSegment: 7 });
  const amounts = fixture => ({ ...fixture.engine.computeSixesResults(fixture.match, fixture.metrics, fixture.match.selectedGames[0]).amounts });
  assert.deepEqual(amounts(pointsLow), amounts(pointsHigh));
  assert.deepEqual(amounts(segmentsLow), amounts(segmentsHigh));
});

test('points mode cannot clinch before hole 18', () => {
  const scores = { a: Array(18).fill(4), b: Array(18).fill(5), c: Array(18).fill(6), d: Array(18).fill(7) };
  scores.a[17] = scores.b[17] = scores.c[17] = scores.d[17] = null;
  const fixture = makeFixture({ mode: 'points', scoresByPlayer: scores });
  assert.equal(fixture.engine.areAllGamesFinal(fixture.match, fixture.metrics), false);
});

test('both modes consume the identical per-hole winners', () => {
  const pointsFixture = makeFixture({ mode: 'points' });
  const segmentFixture = makeFixture({ mode: 'segments' });
  const points = pointsFixture.engine.computeSixesResults(pointsFixture.match, pointsFixture.metrics, pointsFixture.match.selectedGames[0]);
  const segments = segmentFixture.engine.computeSixesResults(segmentFixture.match, segmentFixture.metrics, segmentFixture.match.selectedGames[0]);
  assert.equal(JSON.stringify(points.holes.map(hole => hole.winner)), JSON.stringify(segments.holes.map(hole => hole.winner)));
});

test('rules contract is mode-aware and unsupported scoring branches are not exposed', () => {
  const fixture = makeFixture();
  const points = fixture.engine.getCompetitionRulesContract('sixes', { ...fixture.match.selectedGames[0], mode: 'points' });
  const segments = fixture.engine.getCompetitionRulesContract('sixes', { ...fixture.match.selectedGames[0], mode: 'segments' });
  ['scoringMethod', 'allowance', 'tieTreatment', 'stakeMeaning', 'escalation', 'finality'].forEach(field => {
    assert.ok(points[field]);
    assert.ok(segments[field]);
  });
  assert.match(points.stakeMeaning, /point/i);
  assert.match(points.finality, /all 18 holes/i);
  assert.match(segments.stakeMeaning, /segment/i);
  assert.match(segments.finality, /three segments/i);
  assert.doesNotMatch(appSource, /data-game-config="\$\{game\.key\}" data-field="teamScoringMode"><option/);
  assert.doesNotMatch(appSource, /data-game-config="\$\{game\.key\}" data-field="segmentResultMode"><option/);
});
