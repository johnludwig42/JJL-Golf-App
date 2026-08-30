import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const reportSource = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../ledger-report/shell.html', import.meta.url), 'utf8');

function partnershipFixture(values) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 400 }));
  const course = { id: 'c', name: 'Test Club', tees: [{ id: 't', teeName: 'Blue', rating: 36, slope: 113, par: 36, holes }] };
  const players = ['A', 'B', 'C', 'D'].map((name, index) => ({ id: `p${index + 1}`, name, index: 0 }));
  const match = {
    id: 'm', date: '2026-08-29', courseId: 'c', teeId: 't', holeCount: 9, format: 'teams', teamCount: 2, playersPerTeam: 2,
    teamNames: ['Blue', 'Gold'], featuredCompetition: 'nassau',
    selectedGames: [{ key: 'nassau', basis: 'gross', countingBalls: 1, stakesFront: 5 }],
    players: players.map((player, index) => ({ playerId: player.id, team: index < 2 ? 1 : 2, teeId: 't', scores: holes.map((hole, i) => ({ holeNumber: hole.holeNumber, gross: values[player.id][i] })) })),
  };
  const state = engine.seedState({ courses: [course], players, matches: [match], activeMatchId: 'm' });
  const live = state.matches[0];
  return { engine, match: live, metrics: engine.computeMatchMetrics(live) };
}

test('Partnership Gain uses the better individual card and remains distinct from rating', () => {
  const f = partnershipFixture({
    p1: [4,5,4,6,4,5,4,5,4], p2: [5,4,6,4,5,4,6,4,5],
    p3: [4,5,4,6,4,5,4,5,4], p4: [5,4,6,4,5,4,6,4,5],
  });
  const side = f.engine.computeBestBallPartnershipStatistics(f.match, f.metrics).sides[0];
  assert.equal(side.betterPartnerTotal, 41);
  assert.equal(side.actual, 36);
  assert.equal(side.partnershipGain, 5);
  assert.equal(side.rating, 100);
  assert.equal('strokesSaved' in side, false);
});

test('hand-off opportunity denominator counts only adjacent sole-contributor pairs', () => {
  const f = partnershipFixture({
    p1: [4,6,4,6,4,6,4,6,4], p2: [5,4,4,4,5,4,5,4,5],
    p3: [4,6,4,6,4,6,4,6,4], p4: [5,4,4,4,5,4,5,4,5],
  });
  const side = f.engine.computeBestBallPartnershipStatistics(f.match, f.metrics).sides[0];
  assert.equal(side.redundancy, 1);
  assert.equal(side.alternations, 6);
  assert.equal(side.alternationOpportunities, 6);
});

test('Ledger presentation uses the refined names, denominators, postable score, and print-safe spacing', () => {
  assert.match(reportSource, /Bird\+/);
  assert.match(reportSource, /Postable/);
  assert.match(reportSource, /Partnership Gain/);
  assert.match(reportSource, /Ham &amp; Egg<br>Rating \/100/);
  assert.match(reportSource, /Counted shows how often each partner supplied the team’s counting score/);
  assert.match(reportSource, /Hand-offs/);
  assert.match(reportSource, /Tied/);
  assert.match(reportSource, /A Rescue occurs when a player supplies the counting score/);
  assert.match(reportSource, /lowest individual \$\{partnershipBasis\} total/);
  assert.match(reportSource, /BEST-BALL CARD TOTAL/);
  assert.match(reportSource, /INFORMATIONAL AGGREGATE/);
  assert.doesNotMatch(reportSource, /side\.strokesSaved/);
  assert.match(reportSource, /partners\.map\(player=>`\$\{player\.name\}/, 'both partners remain visible in rescue output');
  assert.match(reportSource, /page-overflow-diagnostic/);
  assert.match(shellSource, /\.page-overflow-diagnostic\{display:none!important\}/);
  assert.match(shellSource, /outline:none!important/);
  assert.match(shellSource, /appendix-scorecard-separator/);
});

test('Story payload and deterministic fallback receive Partnership Performance facts', () => {
  const f = partnershipFixture({
    p1: [4,5,4,6,4,5,4,5,4], p2: [5,4,6,4,5,4,6,4,5],
    p3: [4,5,4,6,4,5,4,5,4], p4: [5,4,6,4,5,4,6,4,5],
  });
  const payload = f.engine.buildLedgerEntryStoryPayload(f.match, f.metrics);
  assert.ok(payload.partnershipPerformance?.sides?.length);
  assert.match(payload.partnershipPerformanceInstruction, /Partnership Gain/);
  const fallback = f.engine.buildLedgerEntryFactsOnlyStory(f.engine.buildRoundRecord(f.match, f.metrics), f.match, f.metrics);
  assert.match(fallback, /Partnership Gain/);
  assert.match(fallback, /Ham & Egg Rating/);
});
