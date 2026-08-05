import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function trackedFixture(entryCompleted = false) {
  const engine = loadLiveEngine();
  const holes = Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, strokeIndex: i + 1, yardage: 400 }));
  const course = { id: 'c', name: 'Test', tees: [{ id: 't', teeName: 'Club', par: 36, rating: 36, slope: 113, holes }] };
  const match = {
    id: 'm', courseId: 'c', teeId: 't', holeCount: 9, playersPerTeam: 1, teamCount: 1,
    status: 'active', statTrackingEnabled: true, statTrackingPlayerIds: ['p'], selectedGames: [],
    players: [{ playerId: 'p', team: 1, teeId: 't', scores: holes.map(h => ({ holeNumber: h.holeNumber, gross: 4 })), stats: holes.map(h => ({ holeNumber: h.holeNumber, putts: 2, puttsSource: 'default', entryCompleted })) }],
  };
  engine.seedState({ players: [{ id: 'p', name: 'Player', index: 0 }], courses: [course], matches: [match], activeMatchId: 'm' });
  return { engine, match };
}

test('gross completion preserves optional stat coverage without blocking explicit End Round', () => {
  const pending = trackedFixture(false);
  const state = pending.engine.getRoundDataCompletionState(pending.match);
  assert.equal(state.scoresComplete, true);
  assert.equal(state.statsComplete, false);
  assert.equal(state.isReadyToFinish, false);
  assert.equal(state.unresolved.find(item => item.type === 'stats')?.count, 9);
  const ready = trackedFixture(true);
  assert.equal(ready.engine.getRoundDataCompletionState(ready.match).isReadyToFinish, true);
});

test('Play stat matrix uses interaction provenance without a review checkbox', () => {
  assert.doesNotMatch(app, /data-stat-hole-reviewed/);
  assert.doesNotMatch(app, /Statistics reviewed for this hole/);
  assert.match(app, /Putts begin as editable suggestions/);
  assert.match(app, /entryCompleted = true/);
  assert.match(app, /puttsSource: normalizePuttsSource/);
  assert.match(app, /All scores entered\. Use End Round when ready\./);
});

test('active local Memories retain revisions while completed and Shared Match Memories are append-only', () => {
  assert.match(app, /data-edit-memory/);
  assert.match(app, /updatedAt/);
  assert.match(app, /revisionHistory/);
  assert.match(app, /priorText: existing\.text/);
  assert.match(app, /roundRecordPreserved: isFrozenRoundRecord\(match\.roundRecordSnapshot\)/);
  assert.match(app, /match\.status === 'completed' \|\| isFrozenRoundRecord\(match\.roundRecordSnapshot\)/);
  assert.match(app, /Shared Memories remain append-only until revision-safe, conflict-aware synchronization ships/);
});

test('destination navigation provides a second back control on long pages', () => {
  assert.match(app, /experienceBottomNavigation/);
  assert.match(app, /document\.documentElement\.scrollHeight > window\.innerHeight \+ 80/);
  assert.match(app, /data-experience-back/);
});

test('completed round makes recap generation a primary next step', () => {
  assert.match(html, /id="postRoundInlineGenerateRecapBtn"/);
  assert.match(app, /postRoundInlineGenerateRecapBtn/);
  assert.match(app, /await generateRoundRecapForActiveMatch\(\)/);
});

test('a round with no selected games remains eligible for an AI recap', () => {
  const fixture = trackedFixture(true);
  const metrics = fixture.engine.computeMatchMetrics(fixture.match);
  const payload = fixture.engine.buildRoundRecapPayload(fixture.match, metrics);
  assert.deepEqual(payload.games, []);
  assert.equal(payload.players.length, 1);
  assert.ok(payload.authoritativeFacts);
  assert.match(app, /AI Recap service is not deployed for this environment/);
});
