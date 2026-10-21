import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = fs.readFileSync('app.js', 'utf8');
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function shared(id, status = 'active') { return { id, sharedMatchId: `cloud-${id}`, storageMode: 'shared', status, sharedSyncDiagnostics: [] }; }

test('completed Shared Match drains with no active round', async () => {
  const engine = loadLiveEngine();
  const storage = memoryStorage();
  const match = shared('complete', 'complete');
  engine.queueSharedScoreOperation(match, 'p1', 18, { participantId: 'part', deviceId: 'device' }, storage);
  engine.seedState({ matches: [match], activeMatchId: null });
  const result = await engine.drainPendingSharedScoreOutboxes({
    storage, cloudAvailable: true, scheduleContinuation: false,
    delivery: async current => {
      const ids = engine.getSharedScoreOutboxOperations(current, storage).map(row => row.operationId);
      engine.acknowledgeSharedScoreOperations(current, ids, storage);
      return { ok: true, skipped: false, acknowledged: ids.length, pending: 0 };
    },
  });
  assert.equal(result.drained, 1);
  assert.equal(result.remaining, 0);
  assert.equal(engine.getSharedScoreOutboxOperations(match, storage).length, 0);
});

test('all pending matches drain independently regardless of active identity', async () => {
  const engine = loadLiveEngine();
  const storage = memoryStorage();
  const first = shared('first');
  const second = shared('second', 'complete');
  engine.queueSharedScoreOperation(first, 'p1', 1, {}, storage);
  engine.queueSharedScoreOperation(second, 'p2', 2, {}, storage);
  engine.seedState({ matches: [first, second], activeMatchId: first.id });
  const seen = [];
  const result = await engine.drainPendingSharedScoreOutboxes({
    storage, cloudAvailable: true, scheduleContinuation: false, matchLimit: 2,
    delivery: async current => {
      seen.push(current.id);
      const ids = engine.getSharedScoreOutboxOperations(current, storage).map(row => row.operationId);
      engine.acknowledgeSharedScoreOperations(current, ids, storage);
      return { ok: true, skipped: false, pending: 0 };
    },
  });
  assert.deepEqual(seen.sort(), ['first', 'second']);
  assert.equal(result.remaining, 0);
});

test('authorization failures require intervention but never permanently abandon delivery', () => {
  const engine = loadLiveEngine();
  assert.equal(engine.isPermanentSharedScoreDeliveryError({ status: 403 }), false);
  assert.equal(engine.isPermanentSharedScoreDeliveryError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(engine.sharedDeliveryCategory({code:'42501'}),'needs-action');
  assert.equal(engine.isPermanentSharedScoreDeliveryError({ status: 503, message: 'network unavailable' }), false);
});

test('a rejected match retries after durable backoff rather than being poisoned for the session', async () => {
  // The former test enforced session-long abandonment, including expired tokens.
  // Retain the queue, bound retries, and reconsider delivery when it becomes due.
  const engine = loadLiveEngine();
  const storage = memoryStorage();
  const match = shared('permanent');
  engine.queueSharedScoreOperation(match, 'p1', 1, {}, storage);
  let attempts = 0;
  const options = { matches: [match], storage, cloudAvailable: true, scheduleContinuation: false, delivery: async () => {
    attempts += 1;
    return { ok: false, pending: 1, error:{code:'42501',message:'Permission denied'} };
  } };
  await engine.drainPendingSharedScoreOutboxes(options);
  await engine.drainPendingSharedScoreOutboxes(options);
  assert.equal(attempts, 1);
  engine.saveSharedDeliveryRetry(match,{nextRetryAt:null},storage);
  await engine.drainPendingSharedScoreOutboxes(options);
  assert.equal(attempts,2);
  assert.equal(engine.getSharedScoreOutboxOperations(match, storage).length, 1);
});

test('startup, periodic refresh, reconnect, and focus invoke the multi-match drain', () => {
  assert.match(app, /function startSharedScoreRefresh\(\) \{[\s\S]*?void drainPendingSharedScoreOutboxes\(\)/);
  assert.match(app, /setInterval\(async \(\) => \{[\s\S]*?await drainPendingSharedScoreOutboxes\(\)/);
  assert.match(app, /addEventListener\('online',[\s\S]*?drainPendingSharedScoreOutboxes/);
  assert.match(app, /addEventListener\('focus',[\s\S]*?drainPendingSharedScoreOutboxes/);
});
