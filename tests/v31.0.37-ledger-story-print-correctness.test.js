import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const reportSource = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../ledger-report/shell.html', import.meta.url), 'utf8');

function marginReport(outcomes) {
  const holes = outcomes.map((_, index) => index + 1);
  const gross = winner => outcomes.map(outcome => outcome === winner ? 4 : outcome === null ? 4 : 5);
  return {
    meta: {}, holes, sides: { A: { name: 'Blue' }, B: { name: 'Gold' } },
    players: [
      { id: 'a', side: 'A', gross: gross(0), strokes: { featured: holes.map(() => 0) } },
      { id: 'b', side: 'B', gross: gross(1), strokes: { featured: holes.map(() => 0) } },
    ],
    games: [{ id: 'nassau', name: 'Nassau', type: 'nassau', featured: true, bestN: 1,
      allowance: { key: 'featured' }, sides: [{ key: 'A', playerIds: ['a'] }, { key: 'B', playerIds: ['b'] }] }],
  };
}

test('canonical featured turning point is the first permanent lead for the winning side', () => {
  const engine = loadLiveEngine();
  const report = marginReport([0, 1, 0, 1, 1]);
  const point = engine.resolveLedgerFeaturedTurningPoint(report);
  assert.equal(point.holeNumber, 5);
  assert.equal(point.winningSideName, 'Gold');
  assert.equal(point.rule, 'first-permanent-winning-lead');
});

test('tied featured match uses the last contested hole without inventing a winner', () => {
  const engine = loadLiveEngine();
  const point = engine.resolveLedgerFeaturedTurningPoint(marginReport([0, 1]));
  assert.equal(point.holeNumber, 2);
  assert.equal(point.tiedMatch, true);
  assert.equal(point.winningSideName, null);
});

test('Story validation rejects a conflicting defining turn and omitted joint winner', () => {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 5 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 400 }));
  const course = { id: 'course', name: 'Test Club', tees: [{ id: 'tee', teeName: 'Blue', rating: 20, slope: 113, par: 20, holes }] };
  const players = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, index) => ({ id: `p${index + 1}`, name, index: 0 }));
  const scores = {
    p1: [4, 5, 4, 5, 5], p2: [6, 6, 6, 6, 6],
    p3: [5, 4, 5, 4, 4], p4: [6, 6, 6, 6, 6],
  };
  const match = {
    id: 'round', date: '2026-09-02', courseId: 'course', teeId: 'tee', holeCount: 5,
    status: 'complete', format: 'teams', teamCount: 2, playersPerTeam: 2,
    teamNames: ['Blue', 'Gold'], featuredCompetition: 'nassau',
    selectedGames: [{ key: 'nassau', basis: 'gross', countingBalls: 1, stakesFront: 5, stakesOverall: 5 }],
    players: players.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, teeId: 'tee', scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: scores[player.id][holeIndex] })) })),
  };
  const state = engine.seedState({ courses: [course], players, matches: [match], activeMatchId: 'round' });
  const live = state.matches[0];
  const metrics = engine.computeMatchMetrics(live);
  const wrong = engine.validateRoundRecapContent(live, metrics, 'The turning point was Hole 3. Charlie finished $5 ahead.');
  assert.equal(wrong.issues.some(issue => issue.code === 'FALSE_DEFINING_TURN'), true);
  assert.equal(wrong.issues.some(issue => issue.code === 'MISSING_SETTLEMENT_WINNER'), true);
  const correct = engine.validateRoundRecapContent(live, metrics, 'The defining turn came on Hole 5. Charlie and Delta each finished $5 ahead.');
  assert.equal(correct.issues.some(issue => ['FALSE_DEFINING_TURN', 'MISSING_SETTLEMENT_WINNER'].includes(issue.code)), false);
});

test('report consumes the app-supplied canonical turn and scorecard omits SI totals', () => {
  assert.match(reportSource, /ROUND\.meta\?\.canonicalTurningPoint/);
  assert.match(reportSource, /FR\.turning = \{ \.\.\.\(FR\.turning \|\| \{\}\), i:canonicalIndex/);
  assert.match(reportSource, /metaRow\("SI",C\.si,\{totals:false\}\)/);
  assert.match(reportSource, /totals\?show\(sum\(arr\)/);
});

test('iOS print surface stays within the browser printable height', () => {
  assert.match(shellSource, /\.ios-print-surface \.page\{height:10in\}/);
  assert.doesNotMatch(shellSource, /\.ios-print-surface \.page\{height:10\.5in\}/);
  assert.match(shellSource, /\.page:last-child\{break-after:auto;page-break-after:auto\}/);
});
