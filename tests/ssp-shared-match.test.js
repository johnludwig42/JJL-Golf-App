import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const settings = { key: 'sneaky_sandy_poley', pointValue: 2, validateGreenyProx: true, allowBridgeRebridge: true, allowUmbee: true, allowUmbeeWithBridge: true, sspSequenceMode: 'entry' };
function facts(overrides = {}) {
  return {
    version: 1,
    settings,
    inputs: { '5': { holeNumber: 5, players: { p1: { sneaky: true, sandy: false, poley: false, greeny: true }, p2: { sneaky: false, sandy: false, poley: false, greeny: false } }, proxPlayerId: 'p1', bridge: true, rebridge: true, notes: 'Shared note' } },
    playedHoleOrder: [5, 4], holeFirstCompletedAt: { 5: '2026-07-10T10:00:00Z', 4: '2026-07-10T10:05:00Z' }, sourceDeviceId: 'device-a', updatedAt: '2026-07-10T10:06:00Z', ...overrides,
  };
}

test('SSP settings, player facts, Prox, Bridge/Re-Bridge, notes, and entry order sync as one fact envelope', () => {
  const engine = loadLiveEngine();
  const remote = facts();
  const result = engine.reconcileSharedSspFacts(null, remote, null);
  assert.deepEqual(JSON.parse(JSON.stringify(result.facts.settings)), settings);
  assert.equal(result.facts.inputs['5'].players.p1.greeny, true);
  assert.equal(result.facts.inputs['5'].proxPlayerId, 'p1');
  assert.equal(result.facts.inputs['5'].rebridge, true);
  assert.equal(result.facts.inputs['5'].notes, 'Shared note');
  assert.deepEqual(JSON.parse(JSON.stringify(result.facts.playedHoleOrder)), [5, 4]);
});

test('opposite-device edits to different SSP fields reconcile deterministically through the shared envelope', () => {
  const engine = loadLiveEngine();
  const base = facts();
  const local = facts({ inputs: structuredClone(base.inputs), sourceDeviceId: 'device-a' });
  local.inputs['5'].players.p1.sneaky = false;
  const remote = facts({ inputs: structuredClone(base.inputs), sourceDeviceId: 'device-b' });
  remote.inputs['5'].players.p2.sandy = true;
  const result = engine.reconcileSharedSspFacts(local, remote, base);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.facts.inputs['5'].players.p1.sneaky, false);
  assert.equal(result.facts.inputs['5'].players.p2.sandy, true);
});

test('overlapping SSP edits are detected and local value is not silently overwritten', () => {
  const engine = loadLiveEngine();
  const base = facts();
  const local = facts({ inputs: structuredClone(base.inputs), sourceDeviceId: 'device-a' });
  local.inputs['5'].proxPlayerId = 'p2';
  const remote = facts({ inputs: structuredClone(base.inputs), sourceDeviceId: 'device-b' });
  remote.inputs['5'].proxPlayerId = '';
  const result = engine.reconcileSharedSspFacts(local, remote, base);
  assert.equal(result.conflicts.length, 1);
  assert.match(result.conflicts[0].field, /proxPlayerId/);
  assert.equal(result.facts.inputs['5'].proxPlayerId, 'p2');
});

test('matches without SSP facts remain unaffected', () => {
  const engine = loadLiveEngine();
  assert.deepEqual(JSON.parse(JSON.stringify(engine.reconcileSharedSspFacts(null, null, null))), { facts: null, conflicts: [] });
});

test('Sandy-only shared facts normalize Sneaky without creating a false conflict', () => {
  const engine = loadLiveEngine();
  const local = facts({ sourceDeviceId: 'local' });
  const remote = facts({ sourceDeviceId: 'remote', inputs: structuredClone(local.inputs) });
  remote.inputs['5'].players.p1.sandy = true;
  remote.inputs['5'].players.p1.sneaky = false;
  local.inputs['5'].players.p1.sandy = true;
  local.inputs['5'].players.p1.sneaky = true;
  const result = engine.reconcileSharedSspFacts(local, remote, local, { isHost: true });
  assert.equal(result.conflicts.length, 0);
});
