import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('game handicap allowance rounds each handicap before allocating relative strokes', () => {
  const engine = loadLiveEngine();
  const metrics = { players: [
    { playerId: 'low', unroundedCourseHdcp: 2.0 },
    { playerId: 'high', unroundedCourseHdcp: 2.6 },
  ] };
  const policy = { scoringPolicyVersion: 1, handicapAllowancePercent: 85 };
  assert.equal(engine.getGameRelativeStrokeAllowance(1, metrics.players[1], metrics, policy), 0);

  const plusMetrics = { players: [
    { playerId: 'plus', unroundedCourseHdcp: -1.6 },
    { playerId: 'other', unroundedCourseHdcp: 2.6 },
  ] };
  assert.equal(engine.getGameRelativeStrokeAllowance(3, plusMetrics.players[1], plusMetrics, policy), 1);
  assert.equal(engine.getGameRelativeStrokeAllowance(4, plusMetrics.players[1], plusMetrics, policy), 0);
});

test('every Nassau summary path uses the authoritative Best N engine', () => {
  const executive = app.slice(app.indexOf('function buildExecutiveDriverRows'), app.indexOf('const ROUND_RECORD_SCHEMA_VERSION'));
  const recap = app.slice(app.indexOf('function summarizeSelectedGamesForRecap'), app.indexOf('function sortRecapLeaderboard'));
  const scores = app.slice(app.indexOf('function buildSelectedGamesSummary'), app.indexOf('function buildSettlementBreakdown'));
  [executive, recap, scores].forEach(source => {
    assert.match(source, /cfg\.key === 'nassau'[\s\S]{0,180}computeNassauDiffsForBasis/);
  });
});

test('unequal-team Nassau stake is per losing player and split equally among winners', () => {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 400 }));
  const course = { id: 'course', name: 'Audit Course', tees: [{ id: 'tee', teeName: 'Audit', rating: 36, slope: 113, par: 36, holes }] };
  const players = [
    { id: 'w1', name: 'Winner 1', index: 0 }, { id: 'w2', name: 'Winner 2', index: 0 },
    { id: 'l1', name: 'Loser 1', index: 0 }, { id: 'l2', name: 'Loser 2', index: 0 }, { id: 'l3', name: 'Loser 3', index: 0 },
  ];
  const match = {
    id: 'unequal', courseId: 'course', teeId: 'tee', holeCount: 9, teamCount: 2, playersPerTeam: 3,
    teamNames: ['Winners', 'Losers'], featuredCompetition: 'nassau',
    selectedGames: [{ key: 'nassau', basis: 'gross', countingBalls: 1, scoringPolicyVersion: 1, stakesFront: 5, stakesBack: 0, stakesOverall: 0 }],
    players: players.map((player, index) => ({
      playerId: player.id, team: index < 2 ? 1 : 2, teeId: 'tee',
      scores: holes.map(hole => ({ holeNumber: hole.holeNumber, gross: index < 2 ? 4 : 5 })),
    })),
  };
  engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id });
  const metrics = engine.computeMatchMetrics(match);
  const game = engine.computeLivePayoutGames(match, metrics).find(row => row.key === 'nassau_gross');
  assert.deepEqual({ ...game.amounts }, { w1: 7.5, w2: 7.5, l1: -5, l2: -5, l3: -5 });
});

test('completed-round history and Shared Match Memories cannot be directly edited', () => {
  assert.match(app, /if \(match\.status === 'completed' \|\| isFrozenRoundRecord\(match\.roundRecordSnapshot\)\) return false/);
  assert.match(app, /if \(match\.storageMode === 'shared'\) return false/);
  assert.match(app, /Corrections will use Amendment Sessions/);
});

test('diagnostics are opt-in and redact Memory and participant content', () => {
  assert.doesNotMatch(app, /console\.debug\('\[SharedMemories\]'[^\n]*memory: entry/);
  const diagnostics = app.slice(app.indexOf('function logMatchFinalizationDiagnostics'), app.indexOf("document.getElementById('matchForm').addEventListener"));
  assert.match(diagnostics, /window\.dyeLedgerDebugDiagnostics !== true/);
  assert.match(diagnostics, /Player Count/);
  assert.doesNotMatch(diagnostics, /console\.log\('Players:'/);
  assert.doesNotMatch(diagnostics, /console\.log\('Assignments:'/);
  assert.doesNotMatch(diagnostics, /console\.error\('Match finalization failed:', payload\.error, payload\)/);
});

test('iPhone installation dialog has balanced structural tags', () => {
  assert.equal((html.match(/<details\b/g) || []).length, (html.match(/<\/details>/g) || []).length);
  assert.equal((html.match(/<div\b/g) || []).length, (html.match(/<\/div>/g) || []).length);
  assert.match(html, /id="iosInstallDialog"[\s\S]*id="dismissIosInstallBtn"[\s\S]*<\/div>\s*<\/div>\s*<\/div>/);
});

test('current release metadata is immutable and consistently labeled', () => {
  assert.match(app, /version: 'v30\.3\.99'/);
  assert.match(app, /buildDate: '2026-08-09T12:18:24\.564Z'/);
  assert.match(app, /buildLabel: 'Canonical Shared Match Code Hotfix'/);
  assert.doesNotMatch(app.slice(0, 1000), /new Date\(\)\.toISOString\(\)/);
});
