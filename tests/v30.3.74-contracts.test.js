import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

function sspState({ validate = true, tracking = false, putts = null, validations = {}, proxPlayerId = '' } = {}) {
  const holes = [{ holeNumber: 1, par: 4, strokeIndex: 1, yardage: 380 }];
  const players = ['p1', 'p2', 'p3', 'p4'].map((id, idx) => ({ id, name: `Player ${idx + 1}`, index: 0 }));
  const matchPlayers = players.map((player, idx) => ({
    playerId: player.id, team: idx < 2 ? 1 : 2, teeId: 't',
    scores: [{ holeNumber: 1, gross: 4 }],
    stats: [{ holeNumber: 1, putts: putts?.[player.id] ?? 2, puttsSource: putts && player.id in putts ? 'user' : 'default' }],
  }));
  return {
    players,
    courses: [{ id: 'c', name: 'Contract Club', tees: [{ id: 't', teeName: 'Blue', rating: 4, slope: 113, par: 4, holes }] }],
    matches: [{ id: 'm', status: 'active', courseId: 'c', teeId: 't', holeCount: 9, teamCount: 2, playersPerTeam: 2, teamNames: ['Alpha', 'Beta'], statTrackingEnabled: tracking, statTrackingPlayerIds: tracking ? players.map(p => p.id) : [], selectedGames: [{ key: 'sneaky_sandy_poley', pointValue: 1, validateGreenyProx: validate }], players: matchPlayers, sneakySandyPoleyInputs: { 1: { players: { p1: { greeny: true, greenyValidation: validations.p1 }, p2: { greeny: true, greenyValidation: validations.p2 }, p3: { greeny: false }, p4: { greeny: false } }, proxPlayerId } } }],
    activeMatchId: 'm',
  };
}

test('Scores uses an outcome-first frozen-safe lifecycle contract', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="roundExecutiveSummary"') < html.indexOf('scoreboard-export-card'));
  assert.match(app, /function buildEffectiveScoresContext/);
  assert.match(app, /completed \? getEffectiveRoundRecord/);
  assert.match(app, /Reopened for Correction/);
  assert.match(app, /Clinched Early · Final/);
  assert.match(app, /Ended Early · Provisional/);
  assert.match(app, /would pay/);
  assert.match(app, /No money games configured\. Score results remain available\./);
});

test('completed desktop and mobile team facts share the frozen Scores context', () => {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1 }));
  const course = { id: 'team-course', name: 'Team Club', tees: [{ id: 'team-tee', teeName: 'Blue', par: 36, rating: 36, slope: 113, holes }] };
  const players = [{ id: 'p1', name: 'Alex', index: 0 }, { id: 'p2', name: 'Blake', index: 0 }];
  const scores = gross => holes.map(hole => ({ holeNumber: hole.holeNumber, gross }));
  const match = engine.createEmptyMatch({
    id: 'team-round', courseId: course.id, teeId: 'team-tee', holeCount: 9, teamCount: 2, playersPerTeam: 1, teamNames: ['North', 'South'],
    players: [{ playerId: 'p1', team: 1, teeId: 'team-tee', scores: scores(4) }, { playerId: 'p2', team: 2, teeId: 'team-tee', scores: scores(5) }], selectedGames: [],
  });
  engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id });
  const complete = engine.buildFinishedMatchCandidate(match, '2026-07-16T18:00:00.000Z').candidate;
  const before = JSON.stringify(complete.roundRecordSnapshot);
  assert.equal(JSON.stringify(complete.roundRecordSnapshot.teams.map(team => team.displayName)), JSON.stringify(['North', 'South']));
  complete.teamNames = ['Changed North', 'Changed South'];
  complete.players[0].scores.forEach(score => { score.gross = 9; });
  const context = engine.buildEffectiveScoresContext(complete, engine.computeMatchMetrics(complete));
  assert.equal(context.frozen, true);
  assert.equal(context.frozenTeamFallback, false);
  assert.equal(JSON.stringify(context.teamRows.map(team => [team.displayName, team.gross, team.net, team.netToPar, team.finality])), JSON.stringify([['North', 36, 36, 0, 'Final'], ['South', 45, 45, 9, 'Final']]));
  assert.equal(context.teamRows[0].result, 'Winner');
  assert.equal(JSON.stringify(complete.roundRecordSnapshot), before, 'Scores context must not sort or mutate the frozen record');

  const sharedComplete = structuredClone(complete);
  sharedComplete.storageMode = 'shared';
  assert.equal(engine.buildEffectiveScoresContext(sharedComplete, engine.computeMatchMetrics(sharedComplete)).teamRows[0].displayName, 'North');

  const legacy = structuredClone(complete);
  legacy.roundRecordSnapshot = null;
  const legacyContext = engine.buildEffectiveScoresContext(legacy, engine.computeMatchMetrics(legacy));
  assert.equal(legacyContext.legacyFallback, true);
  assert.equal(legacyContext.teamRows[0].displayName, 'Changed South', 'legacy completion explicitly falls back to current compatible metrics');

  const reopened = structuredClone(complete);
  engine.markRoundReopenedForEditing(reopened);
  reopened.players[0].scores.forEach(score => { score.gross = 5; });
  const reopenedContext = engine.buildEffectiveScoresContext(reopened, engine.computeMatchMetrics(reopened));
  assert.equal(reopenedContext.lifecycle, 'Reopened for Correction');
  assert.equal(reopenedContext.teamRows[0].finality, 'Provisional');

  const tied = structuredClone(match);
  tied.players[1].scores.forEach(score => { score.gross = 4; });
  const tiedContext = engine.buildEffectiveScoresContext(tied, engine.computeMatchMetrics(tied));
  assert.equal(tiedContext.teamRows.every(team => team.result === 'Tied' && team.rank === 1 && team.money === 0), true);
  tied.players[1].scores[8].gross = null;
  const incompleteContext = engine.buildEffectiveScoresContext(tied, engine.computeMatchMetrics(tied));
  assert.equal(incompleteContext.final, false);
  assert.equal(incompleteContext.teamRows.every(team => team.finality === 'Provisional'), true);
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /const sortedTeams = scoresContext\.teamRows/);
  assert.equal((app.match(/sortedTeams\.map/g) || []).length >= 2, true, 'desktop and mobile render the same team rows');
});

test('SSP validation off ignores putts and validation on supports deterministic manual resolution', () => {
  const engine = loadLiveEngine();
  const off = engine.seedState(sspState({ validate: false, tracking: true, putts: { p1: 4, p2: 4 }, proxPlayerId: 'p1' })).matches[0];
  let ledger = engine.buildSneakySandyPoleyLedger(off, { metrics: engine.computeMatchMetrics(off) });
  const offCategories = Object.values(ledger.holes['1'].categoriesByTeam).flat().map(row => row.category);
  assert.equal(offCategories.filter(value => value === 'greeny').length, 2);
  assert.equal(offCategories.filter(value => value === 'prox').length, 1);

  const manual = engine.seedState(sspState({ validate: true, tracking: false, validations: { p1: 'validated', p2: 'invalidated' }, proxPlayerId: 'p1' })).matches[0];
  assert.equal(manual.statTrackingEnabled, false);
  const state = engine.resolveSneakySandyPoleyValidation(manual, manual.sneakySandyPoleyInputs['1'], manual.players, 0);
  assert.deepEqual(state.eligiblePlayers.map(row => row.playerId), ['p1']);
  assert.equal(state.prox.mode, 'auto');
  ledger = engine.buildSneakySandyPoleyLedger(manual, { metrics: engine.computeMatchMetrics(manual) });
  const manualCategories = Object.values(ledger.holes['1'].categoriesByTeam).flat().map(row => row.category);
  assert.equal(manualCategories.filter(value => value === 'greeny').length, 1);
  assert.equal(manualCategories.filter(value => value === 'prox').length, 1);
});

test('putt edits recalculate the eligible Prox pool for zero, one, and multiple recipients', () => {
  const engine = loadLiveEngine();
  const match = engine.seedState(sspState({ validate: true, tracking: true, putts: { p1: 2, p2: 2 }, proxPlayerId: 'p1' })).matches[0];
  const input = match.sneakySandyPoleyInputs['1'];
  let state = engine.resolveSneakySandyPoleyValidation(match, input, match.players, 0);
  assert.equal(state.prox.mode, 'selected');
  match.players[0].stats[0].putts = 3;
  state = engine.resolveSneakySandyPoleyValidation(match, input, match.players, 0);
  assert.equal(state.prox.mode, 'auto');
  assert.equal(state.prox.proxPlayerId, 'p2');
  match.players[1].stats[0].putts = 3;
  state = engine.resolveSneakySandyPoleyValidation(match, input, match.players, 0);
  assert.equal(state.prox.mode, 'none');
});

test('every Memory is guaranteed in recap output without an empty section', () => {
  const engine = loadLiveEngine();
  const match = { memories: [{ id: 'a', text: 'Brian holed a bunker shot', holeNumber: 14, createdAt: '2026-07-16T12:00:00Z' }, { id: 'b', text: 'Phil made the long putt', holeNumber: 18, createdAt: '2026-07-16T13:00:00Z' }] };
  const covered = engine.ensureRoundRecapMemoryCoverage(match, 'Brian holed a bunker shot changed the match.');
  assert.match(covered, /Round Memories/);
  assert.match(covered, /Phil made the long putt/);
  assert.doesNotMatch(engine.ensureRoundRecapMemoryCoverage({ memories: [] }, 'Recap'), /Round Memories/);
  const payloadSource = engine.buildRoundRecapPayload.toString();
  assert.match(payloadSource, /Every item in memories is a high-intent user fact/);
  assert.match(payloadSource, /author: m\.createdByName/);
  const contextual = engine.ensureRoundRecapMemoryCoverage({ memories: [{ id: 'c', text: 'A long birdie putt', holeNumber: 7, category: 'Best Shot', createdByName: 'Alex', createdAt: '2026-07-16T14:00:00Z' }] }, 'Recap');
  assert.match(contextual, /Alex · Hole 7 · Best Shot: A long birdie putt/);
});
