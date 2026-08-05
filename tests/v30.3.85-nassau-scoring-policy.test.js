import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function roster(a, b) {
  return { allowance: 100, players: [
    ...Array.from({ length: a }, (_, index) => ({ playerId: `a${index + 1}`, team: 1 })),
    ...Array.from({ length: b }, (_, index) => ({ playerId: `b${index + 1}`, team: 2 })),
  ] };
}

test('Nassau policy version is initialized before persisted state normalization', () => {
  const policyDeclaration = app.indexOf('const NASSAU_SCORING_POLICY_VERSION = 1;');
  const stateInitialization = app.indexOf('const state = DYE_LEDGER_ADAPTER_MODE');
  assert.ok(policyDeclaration >= 0, 'Nassau policy version declaration must exist');
  assert.ok(stateInitialization >= 0, 'application state initialization must exist');
  assert.ok(policyDeclaration < stateInitialization, 'startup normalization must not access the Nassau policy version in its temporal dead zone');
});

test('Nassau allowance recommendations follow the approved matrix', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.getRecommendedNassauAllowance(roster(1, 1), 1).percent, 100);
  assert.equal(engine.getRecommendedNassauAllowance(roster(2, 2), 1).percent, 90);
  assert.equal(engine.getRecommendedNassauAllowance(roster(2, 2), 2).percent, 100);
  assert.equal(engine.getRecommendedNassauAllowance(roster(4, 4), 1).percent, 75);
  assert.equal(engine.getRecommendedNassauAllowance(roster(4, 4), 2).percent, 85);
  assert.equal(engine.getRecommendedNassauAllowance(roster(4, 4), 3).percent, 100);
  assert.equal(engine.getRecommendedNassauAllowance(roster(3, 2), 1).authority, 'dye-ledger');
});

test('Best N sums the same number of low balls for both teams', () => {
  const engine = loadLiveEngine();
  const hole = { strokeIndex: 1, playerScores: [
    { playerId: 'a1', team: 1, gross: 4, strokeIndex: 1 }, { playerId: 'a2', team: 1, gross: 6, strokeIndex: 1 },
    { playerId: 'a3', team: 1, gross: 5, strokeIndex: 1 }, { playerId: 'b1', team: 2, gross: 3, strokeIndex: 1 },
    { playerId: 'b2', team: 2, gross: 7, strokeIndex: 1 }, { playerId: 'b3', team: 2, gross: 6, strokeIndex: 1 },
  ] };
  const policy = { basis: 'gross', countingBalls: 2, scoringPolicyVersion: 1 };
  assert.equal(engine.resolveTeamHoleScore(hole, 1, policy).total, 9);
  assert.equal(engine.resolveTeamHoleScore(hole, 2, policy).total, 9);
});

test('any missing active team score keeps the Nassau hole unresolved', () => {
  const engine = loadLiveEngine();
  const hole = { playerScores: [{ playerId: 'a1', team: 1, gross: 4 }, { playerId: 'a2', team: 1, gross: null }] };
  assert.equal(engine.resolveTeamHoleScore(hole, 1, { basis: 'gross', countingBalls: 1, scoringPolicyVersion: 1 }).status, 'incomplete');
});

test('legacy Nassau remains Best 1 and preserves Gross & Net', () => {
  const engine = loadLiveEngine();
  const normalized = engine.normalizeNassauConfig({ key: 'nassau', basis: 'both' }, roster(2, 2));
  assert.equal(normalized.scoringPolicyVersion, 0);
  assert.equal(normalized.countingBalls, 1);
  assert.equal(normalized.basis, 'both');
  assert.match(engine.formatNassauPolicyLabel(normalized, roster(2, 2)), /Gross & Net Nassau/);
});

test('plus Course Handicaps allocate upward strokes without clamping to scratch', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.holeCourseNetStrokeAllowance(1, -2), 0);
  assert.equal(engine.holeCourseNetStrokeAllowance(17, -2), -1);
  assert.equal(engine.holeCourseNetStrokeAllowance(18, -2), -1);
});

test('new Nassau cloud key fails closed for older clients and hydrates for current clients', () => {
  const engine = loadLiveEngine();
  const saved = engine.buildSelectedGamesForCloud({ selectedGames: [{ key: 'nassau', basis: 'net', scoringPolicyVersion: 1, countingBalls: 2 }] });
  assert.equal(saved[0].key, 'nassau_policy_v1');
  assert.equal(engine.hydrateSelectedGamesFromCloud(saved)[0].key, 'nassau');
});

test('Play and Match Net use the saved Featured Competition stroke basis', () => {
  const engine = loadLiveEngine();
  const match = {
    id: 'featured-nassau',
    allowance: 100,
    featuredCompetition: 'nassau',
    players: [
      { playerId: 'john', team: 1 }, { playerId: 'brian', team: 1 }, { playerId: 'sullivan', team: 1 }, { playerId: 'mark', team: 1 },
      { playerId: 'michael', team: 2 }, { playerId: 'bill', team: 2 }, { playerId: 'isiah', team: 2 }, { playerId: 'bob', team: 2 },
    ],
    selectedGames: [
      { key: 'team_match', basis: 'net' },
      { key: 'nassau', basis: 'net', countingBalls: 2, scoringPolicyVersion: 1, handicapAllowanceMode: 'recommended', handicapAllowancePercent: 85 },
    ],
  };
  const metrics = { players: [
    { playerId: 'michael', unroundedCourseHdcp: 7, courseHdcp: 7, playHdcp: 7 },
    { playerId: 'bill', unroundedCourseHdcp: 12, courseHdcp: 12, playHdcp: 12 },
  ] };
  const bill = metrics.players[1];
  assert.equal(engine.getFeaturedCompetitionStrokeAllowance(match, metrics, bill, 4), 1);
  assert.equal(engine.getFeaturedCompetitionStrokeAllowance(match, metrics, bill, 5), 0);
  assert.equal(engine.getFeaturedCompetitionStrokeNote(match, metrics), 'Game strokes: Nassau · Net · Best 2 · 85% · Off lowest Game HCP');
  const options = engine.getFeaturedMatchNetScorecardOptions(match, metrics);
  assert.equal(options.length, 1);
  assert.equal(options[0].key, 'nassau');
  assert.equal(options[0].config.handicapAllowancePercent, 85);
});

test('gross or absent Featured Competitions show no game strokes or Match Net basis', () => {
  const engine = loadLiveEngine();
  const player = { playerId: 'bill', unroundedCourseHdcp: 12, courseHdcp: 12, playHdcp: 12 };
  const metrics = { players: [{ playerId: 'low', unroundedCourseHdcp: 7, courseHdcp: 7, playHdcp: 7 }, player] };
  const gross = { featuredCompetition: 'stroke_gross', selectedGames: [], players: [] };
  assert.equal(engine.getFeaturedCompetitionStrokeAllowance(gross, metrics, player, 1), 0);
  assert.equal(engine.getFeaturedMatchNetScorecardOptions(gross, metrics).length, 0);
  assert.match(engine.getFeaturedCompetitionStrokeNote(gross, metrics), /No handicap strokes apply/);
});

test('setup and scorecard UX expose the approved model without altering the classic table', () => {
  assert.match(html, /id="matchSetupFormWrap" class="card tight-card hidden"/);
  assert.match(html, /data-setup-destination="games"><span>Default handicap allowance/);
  assert.match(html, /<option value="6">6 players<\/option>/);
  assert.match(app, /toggleButton\('course', 'Course Net'\)/);
  assert.match(app, /toggleButton\('match', 'Match Net'/);
  assert.match(app, /aria-pressed="\$\{active \? 'true' : 'false'\}"/);
  assert.match(app, /Individual totals use Course Net based on each player’s full Course Handicap\./);
  assert.match(css, /scorecard-view-controls \.segmented-control button\.active\{background:var\(--accent,#0b5d3b\);color:#fff/);
  assert.doesNotMatch(css, /scorecard-view-controls[^\n]*(?:--green|--ink|--surface-soft)/);
  assert.match(app, /scorecard-sticky-name/);
  assert.match(app, /scorecard-sticky-team/);
  assert.match(html, /id="setupFeaturedHandicapPreview"/);
  assert.match(html, /id="playStrokeBasisNote"/);
  assert.match(html, /<th>Strokes<\/th>/);
  assert.match(html, /data-setup-destination="games"[\s\S]*data-open-setup-destination=""[^>]*aria-label="Return to Match Setup"/);
  assert.match(app, /Featured Competition to show its handicap basis/);
  assert.match(app, /Featured Competition handicap preview is temporarily unavailable\. Match setup and scoring are unaffected\./);
  assert.match(app, /Game HCP/);
});
