import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const course = {
  id: 'trip-course', name: 'Ledger Club',
  tees: [{ id: 'tee', teeName: 'Blue', rating: 72, slope: 113, par: 36, holes: Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 400 })) }]
};
const players = [
  { id: 'john-a', name: 'John', index: 0 },
  { id: 'john-b', name: 'John', index: 0 },
];
const scores = values => values.map((gross, index) => ({ holeNumber: index + 1, gross }));
function settledMatch(overrides = {}) {
  return {
    id: 'round-trip-1', date: '2026-07-12', name: 'Trip prep fixture', courseId: course.id, teeId: 'tee', holeCount: 9,
    format: 'teams', allowance: 100, teamCount: 2, playersPerTeam: 1, teamNames: ['A', 'B'],
    selectedGames: [{ key: 'nassau', basis: 'net', stakesFront: 5, stakesBack: 5, stakesOverall: 5 }],
    status: 'complete', completedAt: '2026-07-12T20:00:00.000Z', tripId: null, eventId: null,
    players: [
      { playerId: 'john-a', team: 1, slot: 0, teeId: 'tee', scores: scores([4, 4, 4, 4, 4, 4, 4, 4, 4]) },
      { playerId: 'john-b', team: 2, slot: 1, teeId: 'tee', scores: scores([5, 5, 5, 5, 5, 5, 5, 5, 5]) },
    ],
    ...overrides,
  };
}
function seed(match = settledMatch(), extra = {}) {
  const engine = loadLiveEngine();
  const state = engine.seedState({ players: structuredClone(players), courses: [structuredClone(course)], matches: [structuredClone(match)], activeMatchId: match.id, ...extra });
  return { engine, state, match: state.matches[0] };
}

test('frozen RoundRecord survives serialization, normalization, and report viewing unchanged', () => {
  const first = seed();
  const metrics = first.engine.computeMatchMetrics(first.match);
  const frozen = structuredClone(first.engine.freezeRoundRecordIfEligible(first.match, metrics));
  assert.equal(first.engine.isFrozenRoundRecord(frozen), true);
  assert.equal(first.engine.validateFrozenTransactions(frozen), true);
  assert.ok(frozen.transactions.length > 0);
  assert.ok(frozen.transactions.every(row => row.payerId === 'john-b' && row.payeeId === 'john-a'));

  const reloaded = seed(JSON.parse(JSON.stringify(first.match)));
  const beforeReport = JSON.stringify(reloaded.match.roundRecordSnapshot);
  reloaded.engine.buildSummaryExportBody(reloaded.match, reloaded.engine.computeMatchMetrics(reloaded.match));
  assert.equal(JSON.stringify(reloaded.match.roundRecordSnapshot), beforeReport);
  assert.equal(JSON.stringify(reloaded.engine.getEffectiveRoundRecord(reloaded.match).transactions), JSON.stringify(frozen.transactions));
});

test('historical effective records prefer frozen transactions over changed current derivation inputs', () => {
  const fixture = seed();
  fixture.engine.freezeRoundRecordIfEligible(fixture.match);
  const original = structuredClone(fixture.match.roundRecordSnapshot.transactions);
  fixture.match.selectedGames = [];
  fixture.match.players[0].scores.forEach(row => { row.gross = 9; });
  fixture.match.players[1].scores.forEach(row => { row.gross = 3; });
  assert.notEqual(JSON.stringify(fixture.engine.buildRoundRecord(fixture.match, fixture.engine.computeMatchMetrics(fixture.match)).transactions), JSON.stringify(original));
  assert.equal(JSON.stringify(fixture.engine.getEffectiveRoundRecord(fixture.match).transactions), JSON.stringify(original));
});

test('legacy identity, nullable grouping fields, registry, and rosters normalize additively', () => {
  const legacy = settledMatch({ tripId: undefined, eventId: undefined, ownerUserId: undefined });
  delete legacy.players[0].playerId;
  delete legacy.roundRecordSnapshot;
  const { engine, state, match } = seed(legacy, {
    savedRosters: { rosters: [{ rosterId: 'roster-1', name: 'Regulars', playerIds: ['john-a', 'john-b', 'john-a'] }] }
  });
  assert.equal(match.tripId, null);
  assert.equal(match.eventId, null);
  assert.equal(match.ownerUserId, null);
  assert.equal(match.roundRecordSnapshot, null);
  assert.equal(match.players[0].playerId, 'round:round-trip-1:player:1');
  const id = match.players[0].playerId;
  engine.normalizeMatch(match);
  assert.equal(match.players[0].playerId, id);
  assert.equal(state.playerRegistry.players.filter(row => row.displayName === 'John').length, 2);
  assert.notEqual(state.playerRegistry.players[0].playerId, state.playerRegistry.players[1].playerId);
  assert.equal(JSON.stringify(state.savedRosters.rosters[0].playerIds), JSON.stringify(['john-a', 'john-b']));
  assert.doesNotThrow(() => engine.buildSummaryExportBody(match, engine.computeMatchMetrics(match)));
});

test('trip/event references survive reload and flow into the frozen record', () => {
  const first = seed(settledMatch({ tripId: 'trip-2026', eventId: 'event-ryder', ownerUserId: 'future-user', createdBy: 'local-device', deviceId: 'device-a', hostDeviceId: 'device-a' }));
  first.engine.freezeRoundRecordIfEligible(first.match);
  const reloaded = seed(JSON.parse(JSON.stringify(first.match)));
  assert.equal(reloaded.match.tripId, 'trip-2026');
  assert.equal(reloaded.match.eventId, 'event-ryder');
  assert.equal(reloaded.match.roundRecordSnapshot.meta.tripId, 'trip-2026');
  assert.equal(reloaded.match.roundRecordSnapshot.meta.eventId, 'event-ryder');
});

test('joined Shared Match devices cannot create or replace a frozen snapshot', () => {
  const fixture = seed(settledMatch({ storageMode: 'shared', sharedHostDeviceId: 'other-device' }));
  assert.equal(fixture.engine.freezeRoundRecordIfEligible(fixture.match), null);
  assert.equal(fixture.match.roundRecordSnapshot, null);
});
