import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = fs.readFileSync('app.js', 'utf8');
const serviceWorker = fs.readFileSync('service-worker.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/202608100001_v31_0_01_shared_match_reliability.sql', 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

test('v31 identifies the release and uses a dedicated immutable cache', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.equal(pkg.version, '31.0.10');
  assert.equal(manifest.version, 'v31.0.10');
  assert.match(app, /function buildLedgerEntryReportModel/);
  assert.match(serviceWorker, /the-dye-ledger-v31\.0\.10/);
});

test('durable outbox replaces a superseded player-hole operation and survives reload', () => {
  const engine = loadLiveEngine();
  const storage = memoryStorage();
  const match = { id: 'DYE-310001', sharedMatchId: 'DYE-310001', storageMode: 'shared', sharedSyncDiagnostics: [] };
  const first = engine.queueSharedScoreOperation(match, 'p1', 3, { participantId: 'part-1', deviceId: 'device-1' }, storage);
  const second = engine.queueSharedScoreOperation(match, 'p1', 3, { participantId: 'part-1', deviceId: 'device-1' }, storage);
  const rows = engine.getSharedScoreOutboxOperations(match, storage);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].operationId, second.operationId);
  assert.notEqual(first.operationId, second.operationId);
  assert.equal(rows[0].clientRevision, 2);
  assert.equal(engine.readSharedScoreOutbox(storage).schemaVersion, 1);
});

test('only explicit server acknowledgements remove score operations', () => {
  const engine = loadLiveEngine();
  const storage = memoryStorage();
  const match = { id: 'DYE-310002', sharedMatchId: 'DYE-310002', storageMode: 'shared', sharedSyncDiagnostics: [] };
  const one = engine.queueSharedScoreOperation(match, 'p1', 1, { participantId: 'part-1', deviceId: 'device-1' }, storage);
  engine.queueSharedScoreOperation(match, 'p2', 1, { participantId: 'part-1', deviceId: 'device-1' }, storage);
  assert.equal(engine.acknowledgeSharedScoreOperations(match, ['unknown'], storage), 0);
  assert.equal(engine.getSharedScoreOutboxOperations(match, storage).length, 2);
  assert.equal(engine.acknowledgeSharedScoreOperations(match, [one.operationId], storage), 1);
  assert.equal(engine.getSharedScoreOutboxOperations(match, storage).length, 1);
});

test('1,000 delayed, duplicated, and reordered saves converge without silent loss', () => {
  const engine = loadLiveEngine();
  const storage = memoryStorage();
  const match = { id: 'DYE-310003', sharedMatchId: 'DYE-310003', storageMode: 'shared', sharedSyncDiagnostics: [] };
  const latest = new Map();
  for (let index = 0; index < 1000; index += 1) {
    const player = `p${index % 8}`;
    const hole = (index % 18) + 1;
    const operation = engine.queueSharedScoreOperation(match, player, hole, { participantId: `part-${index % 2}`, deviceId: `device-${index % 2}` }, storage);
    latest.set(`${player}:${hole}`, operation.operationId);
  }
  const queued = engine.getSharedScoreOutboxOperations(match, storage);
  assert.equal(queued.length, latest.size);
  const reorderedWithDuplicates = [...queued].reverse().flatMap((row, index) => index % 7 === 0 ? [row.operationId, row.operationId] : [row.operationId]);
  engine.acknowledgeSharedScoreOperations(match, reorderedWithDuplicates, storage);
  assert.equal(engine.getSharedScoreOutboxOperations(match, storage).length, 0);
});

test('the server boundary is atomic, idempotent, attributed, and assignment scoped', () => {
  assert.match(migration, /operation_id uuid primary key/);
  assert.match(migration, /update public\.matches set shared_revision = shared_revision \+ 1/);
  assert.match(migration, /on conflict \(id\) do update/);
  assert.match(migration, /v_entry\.updated_by := v_user/);
  assert.match(migration, /Active Device membership required/);
  assert.match(migration, /select mm\.role, mm\.id into v_role, v_participant/);
  assert.match(migration, /v_existing\.payload_hash <> v_payload_hash/);
  assert.match(migration, /Score entry identity collision/);
  assert.match(migration, /Scoring assignment required/);
  assert.match(migration, /grant execute on function public\.submit_shared_score_operations/);
  assert.doesNotMatch(migration, /delete from public\.(matches|score_entries)/i);
});

test('Realtime is a private wake-up signal and bounded polling remains as fallback', () => {
  assert.match(app, /channel\(`shared-match:\$\{matchId\}`,[\s\S]*?private: true/);
  assert.match(app, /onScoreChange = \(\) => refreshActiveSharedScores/);
  assert.match(app, /const SHARED_SCORE_REFRESH_MS = 10000/);
  assert.match(migration, /realtime\.broadcast_changes/);
  assert.match(migration, /shared_match_is_member|match_memberships/);
});

test('device heartbeat is independent from score synchronization', () => {
  assert.match(app, /const SHARED_PRESENCE_HEARTBEAT_MS = 30000/);
  assert.match(app, /async function heartbeatActiveSharedParticipant/);
  assert.match(app, /upsertSharedMembershipForCurrentDevice\(match\)/);
  assert.match(app, /PRESENCE_HEARTBEAT_FAILED/);
});

test('Shared Match status distinguishes local safety from server confirmation', () => {
  assert.match(app, /Saved on this device/);
  assert.match(app, /Sending \$\{queuedScores\} score/);
  assert.match(app, /safely queued and will send automatically/);
  assert.doesNotMatch(app.slice(app.indexOf('function getSharedSyncStatus'), app.indexOf('function getSharedPendingEntryCount')), /Scores may be lost/i);
});
