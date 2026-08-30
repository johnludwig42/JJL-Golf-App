import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentVersionRegexEscaped } from './support/release-identity.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function buildFixture() {
  const holes = Array.from({ length: 18 }, (_, index) => ({
    holeNumber: index + 1,
    par: 4,
    strokeIndex: index + 1,
    yardage: 380,
  }));
  const course = { id: 'summary-course', name: 'Summary Club', tees: [{ id: 'white', teeName: 'White', rating: 72, slope: 113, par: 72, holes }] };
  const players = [{ id: 'p1', name: 'Alex', index: 5 }, { id: 'p2', name: 'Blake', index: 10 }];
  const match = {
    id: 'summary-match', name: 'Summary Match', date: '2026-08-05', courseId: course.id, teeId: 'white', holeCount: 18,
    status: 'complete', format: 'singles', teamCount: 2, playersPerTeam: 1, allowance: 100,
    selectedGames: [{ key: 'nassau', basis: 'net', countingBalls: 1, handicapAllowancePercent: 100, stakesFront: 5, stakesBack: 5, stakesOverall: 5 }],
    players: players.map((player, index) => ({
      playerId: player.id,
      team: index + 1,
      teeId: 'white',
      scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: hole.par + (index === 0 && holeIndex === 0 ? 1 : 0) })),
    })),
  };
  const engine = loadLiveEngine();
  const state = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id });
  const live = state.matches[0];
  return { engine, live, metrics: engine.computeMatchMetrics(live) };
}

test('report keeps distinct Course Net and Featured Competition Match Net scorecards', () => {
  const { engine, live, metrics } = buildFixture();
  const html = engine.buildSummaryExportBody(live, metrics);
  assert.match(html, /Classic Scorecard — Course Net/);
  assert.match(html, /does not determine the Featured Competition/);
  assert.match(html, /Classic Scorecard — Match Net/);
  assert.match(html, /Featured Competition’s handicap allowance and stroke allocation/);
});

test('bogey-derived metric is truthfully labeled as double-bogey avoidance', () => {
  const { engine, live, metrics } = buildFixture();
  const insights = engine.computePlayerRoundInsights(live, metrics);
  assert.equal(insights[0].parOrBetterRate, 17 / 18);
  assert.equal(insights[0].doubleBogeyAvoidanceRate, 1);
  const html = engine.buildSummaryExportBody(live, metrics);
  assert.match(html, /Double-Bogey Avoidance/);
  assert.doesNotMatch(html, />Bogey Avoidance</);
});

test('Story contract separates Nassau components and forbids unsupported invention', () => {
  assert.match(app, /keep Front, Back, and Overall results distinct/);
  assert.match(app, /Do not invent shots, quotations, emotions, motives, swing mechanics/);
});

test('shared reconciliation is compact status content rather than a standalone report section', () => {
  assert.match(app, /class="export-shared-ledger-status/);
  assert.doesNotMatch(app, /<h2>Shared Match Reconciliation<\/h2>/);
});

test('current release identity is consistent in the application source', () => {
  assert.match(app, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.match(app, /buildLabel: '[^']+'/);
});
