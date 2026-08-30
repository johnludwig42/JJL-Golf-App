import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const report = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');

function fixture(holesPlayed = 9) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1, yardage: 400 }));
  const course = { id: 'c18', name: 'Rating Club', tees: [{ id: 't18', teeName: 'Blue', rating: 36, slope: 113, par: 36, holes }] };
  const players = ['A', 'B', 'C', 'D'].map((name, i) => ({ id: `r${i + 1}`, name, index: 0 }));
  const values = {
    r1: [4,6,4,6,4,6,4,6,4], r2: [5,4,4,4,5,4,5,4,5],
    r3: [4,6,4,6,4,6,4,6,4], r4: [5,4,4,4,5,4,5,4,5],
  };
  const match = {
    id: 'm18', date: '2026-08-30', courseId: 'c18', teeId: 't18', holeCount: 9,
    status: holesPlayed === 9 ? 'complete' : 'active', format: 'teams', teamCount: 2, playersPerTeam: 2,
    teamNames: ['Blue', 'Gold'], featuredCompetition: 'nassau',
    selectedGames: [{ key: 'nassau', basis: 'gross', countingBalls: 1, stakesFront: 5 }],
    players: players.map((player, p) => ({
      playerId: player.id, team: p < 2 ? 1 : 2, teeId: 't18',
      scores: holes.map((hole, i) => ({ holeNumber: hole.holeNumber, gross: i < holesPlayed ? values[player.id][i] : null })),
    })),
  };
  const state = engine.seedState({ courses: [course], players, matches: [match], activeMatchId: 'm18' });
  const live = state.matches[0];
  return { engine, live, metrics: engine.computeMatchMetrics(live) };
}

test('fixed-denominator rating preserves the Hand-Off opportunity statistic', () => {
  const f = fixture();
  const side = f.engine.computeBestBallPartnershipStatistics(f.live, f.metrics).sides[0];
  assert.equal(side.alternations, 6);
  assert.equal(side.alternationOpportunities, 6);
  assert.equal(side.possibleRoundTransitions, 8);
  assert.equal(side.rating, 75);
  assert.equal('best' in side, false);
  assert.equal('worst' in side, false);
});

test('incomplete rounds do not publish a Ham & Egg Rating', () => {
  const f = fixture(5);
  const side = f.engine.computeBestBallPartnershipStatistics(f.live, f.metrics).sides[0];
  assert.equal(side.rating, null);
  assert.equal(side.possibleRoundTransitions, 8);
});

test('the Ledger explains the fixed denominator and omits alignment constructs', () => {
  assert.match(report, /17 possible for 18 holes; 8 for nine/);
  assert.match(report, /round is incomplete/);
  assert.doesNotMatch(report, /Best alignment|Stacked alignment|side\.best|side\.worst/);
});

test('the app exposes one saved Story workflow and no Match Summary report choice', () => {
  assert.match(index, /Story of the Round/);
  assert.match(index, /Create \/ Review Story/);
  assert.doesNotMatch(index, /value="summary">Match Summary/);
  assert.doesNotMatch(index, /id="postRoundInlineViewSummaryBtn"/);
  assert.match(source, /const savedStory = getFinalRoundRecap\(match\)/);
  assert.match(source, /reportModel\.meta\.story = savedStory/);
  assert.match(source, /audited-user-approved-story/);
  assert.match(source, /no headings or bullet lists/);
  assert.match(source, /two or three facts/);
});
