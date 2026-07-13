import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const players = [
  { id: 'p1', name: 'John Smith', index: 0 }, { id: 'p2', name: 'John Jones', index: 0 },
  { id: 'p3', name: 'Phil Longname', index: 0 }, { id: 'p4', name: 'Steve', index: 0 },
];
const course = { id: 'mobile-course', name: 'Mobile Club', tees: [{ id: 'blue', teeName: 'Blue', rating: 36, slope: 113, par: 36, holes: Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 390 })) }] };
const scoreRows = values => Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, gross: values?.[index] ?? null }));
function buildMatch({ id = 'mobile', selectedGames = [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }], scores = {}, inputs = {}, status = 'active', teamNames = ['Team 1', 'Team 2'], storageMode = 'local', sharedHostDeviceId = '' } = {}) {
  return { id, date: '2026-07-12', name: 'Mobile fixture', courseId: course.id, teeId: 'blue', format: 'teams', allowance: 100, holeCount: 9, teamCount: 2, playersPerTeam: 2, teamNames, selectedGames, status, completedAt: status === 'complete' ? '2026-07-12T20:00:00Z' : null, storageMode, sharedHostDeviceId,
    players: players.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, slot: index, teeId: 'blue', scores: scoreRows(scores[player.id]) })), sneakySandyPoleyInputs: inputs };
}
function render(match) {
  const engine = loadLiveEngine();
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [structuredClone(match)], activeMatchId: match.id });
  const live = state.matches[0];
  return { engine, match: live, metrics: engine.computeMatchMetrics(live) };
}
const winningScores = { p1: [4,4,4,4,4,4,4,4,4], p2: [4,4,4,4,4,4,4,4,4], p3: [5,5,5,5,5,5,5,5,5], p4: [5,5,5,5,5,5,5,5,5] };

test('truthful game status covers concrete live, final, tied, incomplete, and not-started states', () => {
  const liveNassau = render(buildMatch({ scores: Object.fromEntries(Object.entries(winningScores).map(([id, rows]) => [id, rows.slice(0, 4)])) }));
  assert.match(liveNassau.engine.getTruthfulGameStatus(liveNassau.match, liveNassau.metrics, 'nassau'), /Team|John|\+4|thru 4/i);
  assert.doesNotMatch(liveNassau.engine.getTruthfulGameStatus(liveNassau.match, liveNassau.metrics, 'nassau'), /^Live$/i);
  const finalNassau = render(buildMatch({ scores: winningScores, status: 'complete' }));
  assert.match(finalNassau.engine.getTruthfulGameStatus(finalNassau.match, finalNassau.metrics, 'nassau'), /^Final:/);
  const tied = render(buildMatch({ scores: Object.fromEntries(players.map(player => [player.id, [4,4,4]])) }));
  assert.match(tied.engine.getTruthfulGameStatus(tied.match, tied.metrics, 'nassau'), /Tied|All square/i);
  const notStarted = render(buildMatch());
  assert.equal(notStarted.engine.getTruthfulGameStatus(notStarted.match, notStarted.metrics, 'nassau'), 'Not started');

  const sspGames = [{ key: 'sneaky_sandy_poley', pointValue: 1 }];
  const sspScores = { p1: [4,3,4], p2: [4,4,4], p3: [5,6,5], p4: [5,6,5] };
  const sspInputs = { 2: { players: { p1: { sneaky: true } } } };
  const liveSsp = render(buildMatch({ selectedGames: sspGames, scores: sspScores, inputs: sspInputs }));
  assert.match(liveSsp.engine.getTruthfulGameStatus(liveSsp.match, liveSsp.metrics, 'sneaky_sandy_poley'), /\+\d+ thru/i);
  const incompleteSsp = render(buildMatch({ selectedGames: sspGames, scores: sspScores, inputs: sspInputs, status: 'complete' }));
  assert.match(incompleteSsp.engine.getTruthfulGameStatus(incompleteSsp.match, incompleteSsp.metrics, 'sneaky_sandy_poley'), /^Incomplete:/);
  const finalSsp = render(buildMatch({ selectedGames: sspGames, scores: winningScores, inputs: sspInputs, status: 'complete' }));
  assert.match(finalSsp.engine.getTruthfulGameStatus(finalSsp.match, finalSsp.metrics, 'sneaky_sandy_poley'), /^Final:/);
});

test('shared momentum presentation orients leader positive, labels sides, and preserves source data', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net', stake: 5 }], scores: winningScores, status: 'complete' }));
  const before = JSON.stringify(fixture.match);
  const model = fixture.engine.buildMomentumPresentation(fixture.match, fixture.metrics, 'team_match');
  assert.equal(model.perspective, 1);
  assert.ok(model.series.at(-1).value > 0);
  assert.equal(model.upperLabel, 'John / John');
  assert.equal(model.lowerLabel, 'Phil / Steve');
  const full = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match');
  const compact = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match', { compact: true });
  assert.match(full, /momentum-zero-baseline/);
  assert.match(compact, /momentum-zero-baseline/);
  assert.match(full, /momentum-side-label--upper/);
  assert.equal(JSON.stringify(fixture.match), before);
  const tied = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net' }], scores: Object.fromEntries(players.map(player => [player.id, [4,4,4]])) }));
  assert.equal(tied.engine.buildMomentumPresentation(tied.match, tied.metrics, 'team_match').perspective, 1);
});

test('momentum y-axis uses deterministic symmetric integer scales for full and compact charts', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net' }], scores: winningScores, status: 'complete' }));
  const small = fixture.engine.getMomentumYAxisScale([0, 1, 3, 5]);
  assert.deepEqual(JSON.parse(JSON.stringify(small.ticks)), [-6, -4, -2, 0, 2, 4, 6]);
  assert.equal(small.bound, 6);
  const medium = fixture.engine.getMomentumYAxisScale([-9, 4]);
  assert.equal(medium.bound, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(medium.ticks)), [-10, -5, 0, 5, 10]);
  const large = fixture.engine.getMomentumYAxisScale([-19, 8]);
  assert.equal(large.bound, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(large.ticks)), [-20, -10, 0, 10, 20]);
  const compactScale = fixture.engine.getMomentumYAxisScale([-19, 8], { compact: true });
  assert.deepEqual(JSON.parse(JSON.stringify(compactScale.ticks)), [-20, 0, 20]);
  assert.ok(compactScale.ticks.length < large.ticks.length);
  [...small.ticks, ...medium.ticks, ...large.ticks].forEach(value => assert.equal(Number.isInteger(value), true));

  const before = JSON.stringify(fixture.match);
  const full = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match');
  const compact = fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match', { compact: true });
  assert.match(full, /class="momentum-y-axis"/);
  assert.match(compact, /class="momentum-y-axis"/);
  const zeroTickY = full.match(/data-momentum-tick="0" data-tick-y="([^"]+)"/)?.[1];
  const zeroBaselineY = full.match(/class="momentum-zero-baseline" data-zero-y="([^"]+)"/)?.[1];
  assert.ok(zeroTickY);
  assert.equal(zeroTickY, zeroBaselineY);
  assert.match(full, />\+\d+<\/text>/);
  assert.match(full, />-\d+<\/text>/);
  assert.match(full, /class="momentum-axis-unit">holes<\/text>/);
  assert.equal(fixture.engine.renderMomentumChart(fixture.match, fixture.metrics, 'team_match'), full);
  assert.equal(JSON.stringify(fixture.match), before);

  const empty = render(buildMatch({ selectedGames: [{ key: 'team_match', basis: 'net' }] }));
  assert.equal(empty.engine.renderMomentumChart(empty.match, empty.metrics, 'team_match'), '');
});

test('Quick Scoreboard prioritizes Active Games, reconciles trusted money, removes redundant status, and renders eligible charts', () => {
  const fixture = render(buildMatch({ selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }, { key: 'team_match', basis: 'net', stake: 5 }], scores: winningScores, status: 'complete' }));
  const frozen = fixture.engine.buildFrozenRoundRecord(fixture.match, fixture.metrics, '2026-07-12T20:00:00Z');
  fixture.match.roundRecordSnapshot = structuredClone(frozen);
  const before = JSON.stringify(fixture.match.roundRecordSnapshot);
  const html = fixture.engine.buildQuickScoreboardView(fixture.match, fixture.metrics);
  assert.ok(html.indexOf('Active Games') < html.indexOf('<h4>Players</h4>'));
  assert.doesNotMatch(html, /quick-scoreboard-status/);
  assert.match(html, /quick-game-money-card/);
  assert.match(html, /Current combined total/);
  assert.match(html, /quick-momentum-card/);
  assert.equal(JSON.stringify(fixture.match.roundRecordSnapshot), before);
  const payout = fixture.engine.getPayoutReportContext(fixture.match, fixture.metrics);
  const perGame = Object.fromEntries(players.map(player => [player.id, 0]));
  payout.payoutGames.forEach(game => Object.entries(game.amounts || {}).forEach(([id, amount]) => { perGame[id] = Number(perGame[id] || 0) + Number(amount || 0); }));
  assert.equal(JSON.stringify(perGame), JSON.stringify(payout.finalTotals));
});

test('Catch-Up queue identifies only explicit missing holes and never fills blank scores', () => {
  const scores = { ...winningScores, p1: [4, null, 4, null, 4,4,4,4,4], p2: [4,4,4,null,4,4,4,4,4] };
  const fixture = render(buildMatch({ scores }));
  const before = JSON.stringify(fixture.match.players.map(player => player.scores));
  const queue = fixture.engine.getCatchUpMissingHoleQueue(fixture.match, fixture.metrics);
  assert.deepEqual(Array.from(queue, row => row.holeNumber), [2, 4]);
  assert.deepEqual(Array.from(queue[1].missingPlayerIds), ['p1', 'p2']);
  assert.equal(JSON.stringify(fixture.match.players.map(player => player.scores)), before);
  const complete = render(buildMatch({ scores: winningScores }));
  assert.equal(complete.engine.getCatchUpMissingHoleQueue(complete.match, complete.metrics).length, 0);
});
