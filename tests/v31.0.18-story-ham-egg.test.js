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
  assert.match(index, /Review Story/);
  assert.doesNotMatch(index, /value="summary">Match Summary/);
  assert.doesNotMatch(index, /id="postRoundInlineViewSummaryBtn"/);
  assert.match(source, /const savedStory = getFinalRoundRecap\(match\)/);
  assert.match(source, /reportModel\.meta\.story = savedStory \|\| previewStory\.text/);
  assert.match(source, /audited-user-approved-story/);
  assert.match(source, /no headings or bullet lists/);
  assert.match(source, /two or three facts/);
});

test('Story validation blocks impossible and Nassau-only closed-match notation', () => {
  const f = fixture();
  for (const notation of ['2 & 0', '6 & 0', '3 & 2']) {
    const validation = f.engine.validateRoundRecapContent(f.live, f.metrics, `Blue won the Front ${notation}.`);
    const notationIssues = validation.issues.filter(issue => /NOTATION/.test(issue.code));
    assert.equal(notationIssues.length, 1, `${notation} should produce one notation issue`);
    assert.match(notationIssues[0].code, /^FALSE_/);
  }
  const clean = f.engine.validateRoundRecapContent(f.live, f.metrics, 'Blue finished the Front 2 up, Gold finished the Back 2 down, and Overall was halved.');
  assert.equal(clean.issues.some(issue => /NOTATION/.test(issue.code)), false);
});

test('legitimate closed-match notation remains available outside Nassau', () => {
  const f = fixture();
  f.live.selectedGames = [{ key: 'team_match', basis: 'gross' }];
  const metrics = f.engine.computeMatchMetrics(f.live);
  const validation = f.engine.validateRoundRecapContent(f.live, metrics, 'Blue closed the team match 3 & 2.');
  assert.equal(validation.issues.some(issue => /NOTATION/.test(issue.code)), false);
});

test('both Story payloads consume the shared Nassau content rule', () => {
  const f = fixture();
  const canonical = f.engine.buildRoundRecapPayload(f.live, f.metrics).recapInstructions;
  const ledger = f.engine.buildLedgerEntryStoryPayload(f.live, f.metrics).recapInstructions;
  for (const instructions of [canonical, ledger]) {
    assert.match(instructions, /“2 up”/);
    assert.match(instructions, /“2 down”/);
    assert.match(instructions, /never use closed-match notation/);
    assert.match(instructions, /Front, Back, and Overall/);
  }
  assert.equal((source.match(/const STORY_SHARED_CONTENT_RULES\s*=/g) || []).length, 1);
  assert.equal((source.match(/\$\{STORY_SHARED_CONTENT_RULES\}/g) || []).length, 2);
});

test('saved Story opens the Ledger automatically from the guided post-round workflow', () => {
  assert.doesNotMatch(source, /function routeLedgerRequestThroughStory\(match\)/);
  assert.match(source, /pendingLedgerOpenMatchId[\s\S]*openUnifiedExport\(match, 'ledger'\)/);
  assert.match(source, /const previewStory = savedStory \? null : buildDeterministicLedgerEntryStory\(match, refreshedMetrics, 'story-not-saved'\)/);
  assert.match(source, /const fallback = buildDeterministicLedgerEntryStory\(match, metrics, 'verification-failed'\)/);
  assert.equal((source.match(/const repaired = await requestRecap/g) || []).length >= 1, true);
});
