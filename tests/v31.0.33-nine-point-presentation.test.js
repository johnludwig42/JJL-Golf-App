import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { currentVersionBare, currentVersionRegexEscaped } from './support/release-identity.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const reportSource = readFileSync(new URL('../ledger-report/report.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function fixture({ holesPlayed = 2, fourthGolfer = false, allTied = false } = {}) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 390 }));
  const players = [
    { id: 'john', name: 'John Longlastname', index: 0 },
    { id: 'phil', name: 'Phil Player', index: 0 },
    { id: 'tom', name: 'Tom Tester', index: 0 },
    ...(fourthGolfer ? [{ id: 'drew', name: 'Drew Observer', index: 0 }] : []),
  ];
  const course = { id: 'course', name: 'Nine Point Club', tees: [{ id: 'tee', teeName: 'Blue', rating: 36, slope: 113, par: 36, holes }] };
  const firstHole = allTied ? [4, 4, 4] : [4, 5, 6];
  const secondHole = allTied ? [4, 4, 4] : [5, 4, 6];
  const scores = { john: [firstHole[0], secondHole[0]], phil: [firstHole[1], secondHole[1]], tom: [firstHole[2], secondHole[2]], drew: [4, 4] };
  const match = {
    id: 'nine-point-round', date: '2026-09-02', courseId: course.id, teeId: 'tee', holeCount: 9,
    format: 'individual', teamCount: players.length, playersPerTeam: 1, featuredCompetition: 'nine_point', matchStatusGame: 'nine_point',
    selectedGames: [{ key: 'nine_point', basis: 'gross', stakePerPoint: 1, playerIds: ['john', 'phil', 'tom'] }],
    players: players.map((player, index) => ({
      playerId: player.id, team: index + 1, slot: index, teeId: 'tee',
      scores: holes.map((hole, holeIndex) => ({ holeNumber: hole.holeNumber, gross: holeIndex < holesPlayed ? scores[player.id][holeIndex] : null })),
    })),
  };
  const state = engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id });
  const live = state.matches[0];
  const metrics = engine.computeMatchMetrics(live);
  return { engine, match: live, metrics };
}

test('current release identity and report assets are aligned', () => {
  assert.equal(packageJson.version, currentVersionBare);
  assert.match(appSource, new RegExp(`version: '${currentVersionRegexEscaped}'`));
  assert.match(reportSource, new RegExp(`logic\\.js\\?v=${currentVersionBare.replaceAll('.', '\\.')}`));
});

test('authoritative 9-Point model preserves per-hole awards, blanks, and exactly three selected players', () => {
  const f = fixture({ holesPlayed: 2, fourthGolfer: true });
  const result = f.engine.computeNinePointResults(f.match, f.metrics, f.match.selectedGames[0]);
  const model = f.engine.buildLedgerEntryReportModel(f.match, f.metrics);
  const game = model.games.find(row => row.type === 'ninepoint');
  assert.equal(model.meta.primaryMatchStatus, f.engine.getPrimaryMatchStatusLine(f.match, f.metrics));
  assert.deepEqual(Array.from(game.playerIds), ['john', 'phil', 'tom']);
  assert.deepEqual(Array.from(game.pointsByHole.john), Array.from(result.holes, hole => hole.completed ? hole.points.john : null));
  assert.deepEqual(Array.from(game.pointsByHole.phil), Array.from(result.holes, hole => hole.completed ? hole.points.phil : null));
  assert.deepEqual(Array.from(game.pointsByHole.tom), Array.from(result.holes, hole => hole.completed ? hole.points.tom : null));
  assert.ok(game.pointsByHole.john.slice(2).every(value => value === null));
  assert.equal(game.pointsByHole.drew, undefined, 'a nonparticipant must never acquire zero-point awards');
});

test('featured 9-Point status ranks first names, groups ties, and handles an unstarted round', () => {
  const ranked = fixture({ holesPlayed: 1 });
  assert.equal(ranked.engine.getPrimaryMatchStatusLine(ranked.match, ranked.metrics), '9-Point Game: John 5 · Phil 3 · Tom 1');
  const tied = fixture({ holesPlayed: 1, allTied: true });
  assert.equal(tied.engine.getPrimaryMatchStatusLine(tied.match, tied.metrics), '9-Point Game: John, Phil and Tom 3');
  const unstarted = fixture({ holesPlayed: 0 });
  assert.equal(unstarted.engine.getPrimaryMatchStatusLine(unstarted.match, unstarted.metrics), '9-Point Game: Not started');
});

test('all Play and scoreboard headers consume the one primary status source', () => {
  assert.ok((appSource.match(/getPrimaryMatchStatusLine\(/g) || []).length >= 5);
  assert.match(appSource, /compactMatchStatus = metrics \? getPrimaryMatchStatusLine\(match, metrics\)/);
  assert.match(appSource, /savedStatusLine = getPrimaryMatchStatusLine\(match, savedMetrics\)/);
  assert.match(appSource, /primaryStatusLine = includesDraft \? getPrimaryMatchStatusLine/);
});

test('report presentation gives individual lines direct identity and a gated hole table', () => {
  assert.match(reportSource, /individualColors=\["#7A3E9D","#B35C00","#007C91"/);
  assert.match(reportSource, /data-player-line/);
  assert.match(reportSource, /data-player-label/);
  assert.match(reportSource, /FR\.series\.length<=4 \? FR\.series\.map/);
  assert.match(reportSource, /FR\.series\.length>4\?' · TOP THREE EMPHASISED':''/);
  assert.match(reportSource, /series\.raw\.some\(isNum\)/);
  assert.match(reportSource, /data-nine-point-hole-table/);
  assert.match(reportSource, /isNum\(value\)\?value:""/);
  assert.match(reportSource, /head=ROUND\.meta\.primaryMatchStatus/);
});
