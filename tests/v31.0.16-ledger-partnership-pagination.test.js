import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentVersionBare } from './support/release-identity.js';
import '../ledger-report/pack.js';

const reportSource = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fixture({ countingBalls = 1, holesPlayed = 9, featuredCompetition = 'nassau', basis = 'gross', customValues = null, indexes = [0, 0, 0, 0], selectedGames = null } = {}) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 400 }));
  const course = { id: 'partnership-course', name: 'Partnership Club', tees: [{ id: 'blue', teeName: 'Blue', rating: 36, slope: 113, par: 36, holes }] };
  const players = ['Alex', 'Blake', 'Casey', 'Drew'].map((name, index) => ({ id: `p${index + 1}`, name, index: indexes[index] }));
  const values = customValues || {
    p1: [4, 6, 4, 6, 4, 5, 4, 6, 4],
    p2: [5, 4, 4, 4, 6, 5, 6, 4, 4],
    p3: [4, 5, 4, 5, 4, 5, 4, 5, 4],
    p4: [5, 4, 4, 4, 5, 4, 5, 4, 4],
  };
  const match = {
    id: 'partnership-round', date: '2026-08-29', courseId: course.id, teeId: 'blue', holeCount: 9,
    format: 'teams', teamCount: 2, playersPerTeam: 2, teamNames: ['Blue', 'Gold'], featuredCompetition,
    selectedGames: selectedGames || [{ key: 'nassau', basis, countingBalls, handicapAllowancePercent: 100, stakesFront: 5, stakesOverall: 5 }],
    players: players.map((player, index) => ({
      playerId: player.id, team: index < 2 ? 1 : 2, teeId: 'blue',
      scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: holeIndex < holesPlayed ? values[player.id][holeIndex] : null })),
    })),
  };
  const state = engine.seedState({ courses: [course], players, matches: [match], activeMatchId: match.id });
  const live = state.matches[0];
  const metrics = engine.computeMatchMetrics(live);
  return { engine, match: live, metrics };
}

test('best-ball partnership statistics reuse complete one-ball team results without mutating the round', () => {
  const { engine, match, metrics } = fixture();
  const before = JSON.stringify(match);
  const result = engine.computeBestBallPartnershipStatistics(match, metrics);
  assert.equal(JSON.stringify(match), before);
  assert.equal(result.gameId, 'nassau');
  assert.equal(result.basis, 'gross');
  assert.equal(result.holes.length, 9);
  assert.equal(result.sides.length, 2);
  assert.deepEqual(result.sides[0].playerContributions.map(player => player.count), [6, 6]);
  assert.equal(result.sides[0].redundancy, 3);
  assert.equal(result.sides[0].alternations, 3);
  assert.ok(result.sides[0].partnershipGain >= 0);
  assert.equal('strokesSaved' in result.sides[0], false);
  assert.ok(Number.isInteger(result.sides[0].rating));
  const model = engine.buildLedgerEntryReportModel(match, metrics);
  assert.equal(model.games[0].basis, 'gross');
  assert.deepEqual(model.partnership, result);
});

test('partnership eligibility fails closed and excludes incomplete holes', () => {
  const bestTwo = fixture({ countingBalls: 2 });
  assert.equal(bestTwo.engine.computeBestBallPartnershipStatistics(bestTwo.match, bestTwo.metrics), null);
  const partial = fixture({ holesPlayed: 5 });
  const result = partial.engine.computeBestBallPartnershipStatistics(partial.match, partial.metrics);
  assert.equal(result.holes.length, 5);
  assert.ok(result.sides.every(side => side.rating === null));

  const missing = fixture();
  missing.match.players[0].scores[1].gross = null;
  missing.match.players[0].scores[7].gross = null;
  const missingMetrics = missing.engine.computeMatchMetrics(missing.match);
  const missingResult = missing.engine.computeBestBallPartnershipStatistics(missing.match, missingMetrics);
  assert.equal(missingResult.sides[0].holes, 7);
  assert.deepEqual(Array.from(missingResult.holes), [1,3,4,5,6,7,9]);
});

test('perfectly complementary and fully stacked cards produce exact 100 and 0 ratings', () => {
  const complement = fixture({ basis: 'net', customValues: {
    p1: [4,5,4,6,4,5,4,5,4], p2: [5,4,6,4,5,4,6,4,5],
    p3: [4,5,4,6,4,5,4,5,4], p4: [5,4,6,4,5,4,6,4,5],
  }});
  const perfect = complement.engine.computeBestBallPartnershipStatistics(complement.match, complement.metrics).sides[0];
  assert.equal(perfect.worst, 41);
  assert.equal(perfect.best, 36);
  assert.equal(perfect.actual, 36);
  assert.equal(perfect.rating, 100);
  assert.equal(perfect.partnershipGain, 5);

  const stacked = fixture({ customValues: {
    p1: [4,4,4,4,4,4,4,4,4], p2: [4,4,4,4,4,4,4,4,4],
    p3: [4,4,4,4,4,4,4,4,4], p4: [4,4,4,4,4,4,4,4,4],
  }});
  const stackedSide = stacked.engine.computeBestBallPartnershipStatistics(stacked.match, stacked.metrics).sides[0];
  assert.equal(stackedSide.rating, null, 'identical cards have no exploitable range');

  const aligned = fixture({ customValues: {
    p1: [4,4,4,5,5,5,6,6,6], p2: [3,3,3,5,5,5,7,7,7],
    p3: [4,4,4,5,5,5,6,6,6], p4: [3,3,3,5,5,5,7,7,7],
  }});
  assert.equal(aligned.engine.computeBestBallPartnershipStatistics(aligned.match, aligned.metrics).sides[0].rating, 0);
});

test('ties credit both partners, break alternation, and keep one hole denominator', () => {
  const tied = fixture({ customValues: {
    p1: [4,6,4,6,4,6,4,6,4], p2: [5,4,4,4,5,4,5,4,5],
    p3: [4,6,4,6,4,6,4,6,4], p4: [5,4,4,4,5,4,5,4,5],
  }});
  const side = tied.engine.computeBestBallPartnershipStatistics(tied.match, tied.metrics).sides[0];
  assert.equal(side.holes, 9);
  assert.equal(side.redundancy, 1);
  assert.equal(side.playerContributions[0].count + side.playerContributions[1].count - side.redundancy, side.holes);
  assert.equal(side.alternations, 6);
  assert.equal(side.alternationOpportunities, 6);
});

test('gross and net bases exactly match the authoritative hole resolver', () => {
  const gross = fixture({ basis: 'gross', indexes: [0, 18, 0, 18] });
  const grossStats = gross.engine.computeBestBallPartnershipStatistics(gross.match, gross.metrics);
  const grossHole = gross.engine.resolveTeamHoleScore(gross.metrics.holeResults[0], 1, gross.match.selectedGames[0], { metrics: gross.metrics });
  assert.equal(grossStats.basis, 'gross');
  assert.ok(grossHole.eligibleScores.every(score => score.strokes === 0 && score.value === score.gross));

  const net = fixture({ basis: 'net', indexes: [0, 18, 0, 18] });
  const policy = { ...net.match.selectedGames[0], scoringPolicyVersion: 1 };
  const authoritative = net.engine.resolveTeamHoleScore(net.metrics.holeResults[0], 1, policy, { metrics: net.metrics });
  const result = net.engine.computeBestBallPartnershipStatistics(net.match, net.metrics);
  assert.equal(result.basis, 'net');
  assert.ok(authoritative.eligibleScores.some(score => score.strokes > 0));
  const authoritativeTotal = net.metrics.holeResults.reduce((sum, hole) => sum + net.engine.resolveTeamHoleScore(hole, 1, policy, { metrics: net.metrics }).total, 0);
  assert.equal(result.sides[0].actual, authoritativeTotal);
});

test('three-player sides are skipped rather than approximated', () => {
  const result = fixture();
  result.match.players.push({ playerId: 'p5', team: 1, teeId: 'blue', scores: [] });
  assert.equal(result.engine.computeBestBallPartnershipStatistics(result.match, result.metrics), null);
});

test('a nonqualifying featured game falls back to the first qualifying configured game', () => {
  const result = fixture({ featuredCompetition: 'greenies', selectedGames: [
    { key: 'greenies', stake: 1 },
    { key: 'nassau', basis: 'gross', countingBalls: 1, stakesFront: 5 },
  ] });
  const stats = result.engine.computeBestBallPartnershipStatistics(result.match, result.metrics);
  assert.equal(stats.gameId, 'nassau');
  assert.match(stats.gameName, /Nassau/i);
  assert.equal(stats.sides.length, 2, 'Nassau emits one whole-round result per side');
});

test('statistics categories stay intact when they fit a fresh page and oversized groups still split', () => {
  const blocks = [
    { id: 'prior' },
    { id: 'category', splittable: true, minRows: 2, keepTogetherWhenFits: true },
    { id: 'oversized', splittable: true, minRows: 2, keepTogetherWhenFits: true },
  ];
  const measurements = {
    prior: { height: 70, headerH: 70, rows: [] },
    category: { height: 45, headerH: 15, rows: [10, 10, 10] },
    oversized: { height: 120, headerH: 20, rows: Array(10).fill(10) },
  };
  const packed = globalThis.packPages(blocks, 100, block => measurements[block.id]);
  assert.equal(packed.pages[1][0].block.id, 'category');
  assert.equal(packed.pages[1][0].rowEnd, 3);
  const oversizedFragments = packed.pages.flat().filter(fragment => fragment.block.id === 'oversized');
  assert.ok(oversizedFragments.length > 1);
  assert.ok(oversizedFragments.every(fragment => fragment.rowEnd - fragment.rowStart >= 2));
});

test('Ledger renderer exposes independent stat-category blocks and partnership output', () => {
  assert.equal(packageJson.version, currentVersionBare);
  assert.match(reportSource, /trackedStatisticsGroups\("performance"\)/);
  assert.match(reportSource, /keepTogetherWhenFits:true/);
  assert.match(reportSource, /Partnership performance/);
  assert.match(reportSource, /Ham &amp; Egg/);
  assert.match(reportSource, /Partnership Gain/);
  assert.match(reportSource, /Rating \/100/);
});
