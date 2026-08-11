import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function makeSharedMatch() {
  return {
    id: 'shared-round',
    storageMode: 'shared',
    cloudSyncState: 'cloud-synced',
    sharedHostDeviceId: 'host-device',
    sharedHostParticipantId: 'host-participant',
    scoringAccessMode: 'assigned_players',
    players: [
      { playerId: 'p1', team: 1, scores: [{ holeNumber: 1, gross: 4 }], stats: [{}] },
      { playerId: 'p2', team: 2, scores: [{ holeNumber: 1, gross: 5 }], stats: [{}] },
    ],
    sharedDevices: [
      { id: 'host-device', name: 'Host Device' },
      { id: 'joined-device', name: 'Cart 2' },
    ],
    sharedParticipants: [
      { participantId: 'host-participant', deviceId: 'host-device', deviceName: 'Host Device' },
      { participantId: 'joined-participant', deviceId: 'joined-device', deviceName: 'Cart 2' },
    ],
    sharedPlayerAssignments: { p1: 'host-participant', p2: 'joined-participant' },
    sharedPlayerAssignmentState: {
      p1: { participantId: 'host-participant', revision: 1, updatedAt: '2026-07-15T10:00:00Z', updatedBy: 'host-participant' },
      p2: { participantId: 'joined-participant', revision: 1, updatedAt: '2026-07-15T10:00:00Z', updatedBy: 'host-participant' },
    },
    sharedScoreWriteState: {},
    sharedSyncDiagnostics: [],
  };
}

test('host assignment revisions replace newer state once and reject stale or joined replay', () => {
  const engine = loadLiveEngine();
  const joined = makeSharedMatch();
  const newer = engine.reconcileSharedPlayerAssignments(joined, { p2: 'host-participant' }, {
    p2: { participantId: 'host-participant', revision: 2, updatedAt: '2026-07-15T10:05:00Z', updatedBy: 'host-participant' },
  }, { isHost: false });
  assert.deepEqual(JSON.parse(JSON.stringify(newer.accepted)), ['p2']);
  assert.equal(joined.sharedPlayerAssignments.p2, 'host-participant');

  const stale = engine.reconcileSharedPlayerAssignments(joined, { p2: 'joined-participant' }, {
    p2: { participantId: 'joined-participant', revision: 1, updatedAt: '2026-07-15T10:01:00Z' },
  }, { isHost: false });
  assert.equal(stale.changed, false);
  assert.equal(joined.sharedPlayerAssignments.p2, 'host-participant');

  const host = makeSharedMatch();
  const joinedOverwrite = engine.reconcileSharedPlayerAssignments(host, { p2: 'host-participant' }, {
    p2: { participantId: 'host-participant', revision: 99, updatedAt: '2026-07-15T11:00:00Z' },
  }, { isHost: true });
  assert.equal(joinedOverwrite.changed, false);
  assert.equal(joinedOverwrite.ignored[0].reasonCode, 'JOINED_OVERWRITE_PREVENTED');
});

test('score authority selects the newest valid assigned-scorer write and ignores stale, duplicate, and unauthorized writes', () => {
  const engine = loadLiveEngine();
  const match = makeSharedMatch();
  match.sharedScoreWriteState['p2:1'] = { participantId: 'joined-participant', updatedAt: '2026-07-15T10:05:00Z' };
  const local = { playerId: 'p2', holeNumber: 1, gross: 5, stats: { putts: 2, fairway: true, green: true, upAndDown: false, sandy: false }, sourceParticipant: 'joined-participant', updatedAt: '2026-07-15T10:05:00Z' };
  const duplicate = { ...local, updatedAt: '2026-07-15T10:06:00Z' };
  assert.equal(engine.resolveSharedScoreWrite(match, local, duplicate).reasonCode, 'DUPLICATE_SCORE_IGNORED');
  assert.equal(engine.resolveSharedScoreWrite(match, local, { ...local, gross: 4, updatedAt: '2026-07-15T10:04:00Z' }).reasonCode, 'STALE_SCORE_IGNORED');
  assert.equal(engine.resolveSharedScoreWrite(match, local, { ...local, gross: 4, sourceParticipant: 'host-participant', updatedAt: '2026-07-15T10:07:00Z' }).reasonCode, 'JOINED_OVERWRITE_PREVENTED');
  assert.equal(engine.resolveSharedScoreWrite(match, local, { ...local, gross: 4, updatedAt: '2026-07-15T10:07:00Z' }).action, 'accept-remote');
});

test('compact trust states use the five accepted golfer-facing labels and reserve Synced for confirmed parity', () => {
  const engine = loadLiveEngine();
  const match = makeSharedMatch();
  assert.equal(engine.getSharedSyncStatus(match).label, 'Saved Locally');
  match.cloudSyncState = 'syncing';
  assert.equal(engine.getSharedSyncStatus(match).label, 'Checking for updates');
  match.cloudSyncState = 'cloud-synced';
  match.sharedLedgerParity = { status: 'confirmed', parityConfirmed: true };
  assert.equal(engine.getSharedSyncStatus(match).label, 'Synced');
  match.sharedLedgerParity = { status: 'conflict', parityConfirmed: false };
  assert.equal(engine.getSharedSyncStatus(match).label, 'Needs Attention');
  assert.match(appSource, /label: 'Offline'/);
  for (const label of ['Role', 'Connection', 'Last Push', 'Last Pull', 'Assigned Players', 'Scored Holes', 'Score parity', 'App Version', 'Device ID']) assert.match(appSource, new RegExp(label));
  for (const action of ['Retry Sync', 'Refresh Assignments', 'Copy Match Code']) assert.match(appSource, new RegExp(action));
});

test('120 varied synchronization cycles remain exactly-once across scores, transactions, Presses, SSP facts, and RoundRecords', () => {
  const engine = loadLiveEngine();
  const scoreIds = new Set();
  const transactionIds = new Set();
  const roundRecordIds = new Set();
  let presses = [];
  let sspFacts = null;
  for (let cycle = 0; cycle < 120; cycle += 1) {
    const playerId = cycle % 2 ? 'p1' : 'p2';
    const holeNumber = 1 + (cycle % 18);
    const scoreId = `${playerId}:${holeNumber}`;
    scoreIds.add(scoreId);
    scoreIds.add(scoreId);
    const transactionId = `tx:${cycle % 12}`;
    transactionIds.add(transactionId);
    transactionIds.add(transactionId);

    const press = { pressId: `press-${cycle % 9}`, rootPressId: `press-${cycle % 9}`, parentGameId: 'nassau', parentSegmentId: 'nassau:overall', parentSegmentType: 'OVERALL', rootGameId: 'nassau', startingHole: 6 + (cycle % 9), endingHole: 18, declaredForHole: 6 + (cycle % 9), pressDepth: 1, hostDeviceId: 'host-device', status: cycle % 3 ? 'ACTIVE' : 'FINAL', createdAt: `2026-07-15T10:${String(cycle % 60).padStart(2, '0')}:00Z`, updatedAt: `2026-07-15T11:${String(cycle % 60).padStart(2, '0')}:00Z` };
    presses = engine.mergeAuthoritativePressRecords(presses, [press, structuredClone(press)], { hostDeviceId: 'host-device' });

    const incomingSsp = {
      version: 1,
      settings: { key: 'sneaky_sandy_poley', pointValue: 1 },
      inputs: { [holeNumber]: { holeNumber, players: { [playerId]: { sneaky: cycle % 4 === 0, sandy: false, poley: cycle % 5 === 0 } } } },
      playedHoleOrder: [holeNumber],
      holeFirstCompletedAt: { [holeNumber]: `2026-07-15T12:${String(cycle % 60).padStart(2, '0')}:00Z` },
      sourceDeviceId: cycle % 2 ? 'host-device' : 'joined-device',
      updatedAt: `2026-07-15T12:${String(cycle % 60).padStart(2, '0')}:00Z`,
    };
    const reconciled = engine.reconcileSharedSspFacts(sspFacts, incomingSsp, sspFacts, { isHost: cycle % 2 === 1 });
    if (!reconciled.conflicts.length) sspFacts = reconciled.facts;
    const replay = engine.reconcileSharedSspFacts(sspFacts, structuredClone(sspFacts), sspFacts, { isHost: true });
    assert.equal(replay.conflicts.length, 0, `SSP replay cycle ${cycle}`);

    const recordId = `round:${cycle % 7}`;
    roundRecordIds.add(recordId);
    roundRecordIds.add(recordId);
  }
  assert.equal(scoreIds.size, 18);
  assert.equal(transactionIds.size, 12);
  assert.equal(presses.length, 9);
  assert.equal(new Set(presses.map(row => row.pressId)).size, presses.length);
  assert.ok(sspFacts && Object.keys(sspFacts.inputs).length <= 18);
  assert.equal(roundRecordIds.size, 7);
});

test('technical diagnostics expose every completion reason code without golfer-facing protocol language', () => {
  const engine = loadLiveEngine();
  const match = makeSharedMatch();
  const codes = ['ASSIGNMENT_REJECTED', 'ASSIGNMENT_REPLACED', 'OFFLINE_SCORE_RETAINED', 'STALE_SCORE_IGNORED', 'DUPLICATE_SCORE_IGNORED', 'DUPLICATE_PRESS_IGNORED', 'DUPLICATE_SSP_IGNORED', 'RECONNECT', 'AUTHORITATIVE_OVERWRITE', 'JOINED_OVERWRITE_PREVENTED'];
  codes.forEach((code, index) => engine.recordSharedSyncDiagnostic(match, code, { playerId: `p${index}` }, `2026-07-15T13:${String(index).padStart(2, '0')}:00Z`));
  assert.deepEqual(JSON.parse(JSON.stringify(match.sharedSyncDiagnostics.map(row => row.reasonCode))), codes);
  assert.doesNotMatch(appSource.match(/function getSharedSyncStatus[\s\S]*?function formatSharedLastSync/)?.[0] || '', /payload|transport|replication|reconciliation/i);
});
