import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function sharedMatch(overrides = {}) {
  return {
    id: 'local-shared-round',
    sharedMatchId: 'cloud-shared-round',
    storageMode: 'shared',
    sharedParticipantId: 'participant-local',
    sharedHostParticipantId: 'participant-host',
    sharedScoreOutbox: [],
    sharedSyncDiagnostics: [],
    ...overrides,
  };
}

function failedAttempt(index) {
  return {
    attemptId: `attempt-${String(index).padStart(2, '0')}-${'x'.repeat(60)}`,
    occurredAt: `2026-08-31T12:${String(index).padStart(2, '0')}:00.000Z`,
    outcome: index % 2 ? 'partial' : 'failed',
    elapsedMs: 1000 + index,
    outboxBefore: 4,
    outboxAfter: 2,
    acknowledgedOperationIds: Array.from({ length: 8 }, (_, operation) => `operation-${index}-${operation}-${'y'.repeat(28)}`),
    parityStatus: 'mismatch',
    phases: {
      metadataPullBefore: { status: 'success', elapsedMs: 101 },
      upload: { status: 'success', elapsedMs: 202 },
      scorePull: { status: 'failed', elapsedMs: 303, errorCode: 'NETWORK_ERROR' },
      metadataPullAfter: { status: 'success', elapsedMs: 404 },
    },
  };
}

function quotaStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
    setItem() {
      const error = new Error('Storage quota exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    },
    removeItem: key => values.delete(String(key)),
    value: key => values.get(String(key)),
  };
}

test('whole-round aggregates survive bounded head-and-tail exceptional retention', () => {
  const engine = loadLiveEngine();
  const match = sharedMatch();
  for (let index = 0; index < 20; index += 1) engine.recordSharedSyncAttemptDiagnostic(match, failedAttempt(index));

  const aggregate = engine.getSharedSyncDiagnosticAggregate(match);
  assert.equal(aggregate.attempts, 20);
  assert.equal(aggregate.partials + aggregate.failures, 20);
  assert.equal(aggregate.phases.scorePull.failed, 20);
  assert.ok(engine.getSharedSyncDiagnosticsSerializedSize(match) <= 6144);

  const ids = Array.from(match.sharedSyncDiagnostics, row => row.attemptId);
  assert.deepEqual(ids.slice(0, 3), [0, 1, 2].map(index => failedAttempt(index).attemptId.slice(0, 48)));
  assert.deepEqual(ids.slice(-3), [17, 18, 19].map(index => failedAttempt(index).attemptId.slice(0, 48)));
  assert.ok(!ids.includes(failedAttempt(10).attemptId.slice(0, 48)), 'middle failures are evicted before first/last evidence');
});

test('routine successes remain aggregate-only across the whole round', () => {
  const engine = loadLiveEngine();
  const match = sharedMatch();
  for (let index = 0; index < 75; index += 1) {
    engine.recordSharedSyncAttemptDiagnostic(match, {
      ...failedAttempt(index % 20),
      attemptId: `success-${index}`,
      outcome: 'success',
      phases: { upload: { status: 'success', elapsedMs: 25 } },
    });
  }
  assert.equal(match.sharedSyncDiagnostics.length, 0);
  assert.equal(match.sharedSyncDiagnosticAggregate.attempts, 75);
  assert.equal(match.sharedSyncDiagnosticAggregate.successes, 75);
  assert.equal(match.sharedSyncDiagnosticAggregate.phases.upload.succeeded, 75);
});

test('dedicated export is sanitized, measurable, and included in broad app diagnostics', () => {
  const engine = loadLiveEngine();
  const match = sharedMatch({
    matchCode: 'PRIVATE-CODE',
    accountEmail: 'golfer@example.com',
    latitude: 39.123456,
    longitude: -86.123456,
    sharedSyncDiagnostics: [{
      reasonCode: 'SYNC_ATTEMPT_FAILED',
      occurredAt: '2026-08-31T12:00:00.000Z',
      attemptId: 'safe-attempt',
      playerId: 'private-player',
      sourceParticipant: 'private-participant',
      message: 'golfer@example.com at 39.123456,-86.123456',
    }],
  });
  engine.seedState({ matches: [match], activeMatchId: match.id });
  const canonical = engine.getCanonicalSharedMatch(match.id);
  const text = engine.getSharedSyncDiagnosticsExportText(canonical);
  const measurement = engine.getSharedSyncDiagnosticsExportMeasurement(canonical);
  assert.match(text, /Shared Match Sync Diagnostics/);
  assert.doesNotMatch(text, /PRIVATE-CODE|golfer@example\.com|39\.123456|-86\.123456|private-player/);
  assert.equal(measurement.characters, text.length);
  assert.ok(measurement.encodedCharacters >= measurement.characters);
  assert.match(engine.getAppDiagnosticsText(), /Shared Match Sync Diagnostics/);
});

test('troubleshooting technical view exposes clipboard retrieval without changing the normal trust indicator', () => {
  const engine = loadLiveEngine();
  const match = sharedMatch();
  const markup = engine.renderSharedAssignmentDiagnosticsPanel(match);
  assert.match(markup, /data-copy-shared-sync-diagnostics/);
  assert.match(markup, /Copy Sync Diagnostics/);
  assert.match(appSource, /data-copy-shared-sync-diagnostics/);
});

test('canonical lookup follows object replacement by local or cloud identity', () => {
  const engine = loadLiveEngine();
  const initial = sharedMatch({ cloudSyncState: 'syncing' });
  engine.seedState({ matches: [initial], activeMatchId: initial.id });
  const first = engine.getCanonicalSharedMatch(initial.id);
  const replacement = sharedMatch({ cloudSyncState: 'synced', sharedSyncRevision: 9 });
  engine.seedState({ matches: [replacement], activeMatchId: replacement.id });
  const currentByLocal = engine.getCanonicalSharedMatch(initial.id);
  const currentByCloud = engine.getCanonicalSharedMatch(initial.sharedMatchId);
  assert.notEqual(currentByLocal, first);
  assert.equal(currentByLocal.sharedSyncRevision, 9);
  assert.equal(currentByCloud, currentByLocal);
});

test('a quota failure remains recoverable and does not replace the last-known local round', () => {
  const engine = loadLiveEngine();
  const storageKey = 'the-dye-ledger-v20';
  const prior = { matches: [sharedMatch({ id: 'last-known-good' })], activeMatchId: 'last-known-good' };
  const storage = quotaStorage({ [storageKey]: JSON.stringify(prior) });
  const nextMatch = sharedMatch({ id: 'next' });
  for (let index = 0; index < 30; index += 1) engine.recordSharedSyncAttemptDiagnostic(nextMatch, failedAttempt(index % 20));
  const result = engine.persistStateSnapshot({ matches: [nextMatch], activeMatchId: 'next' }, storage);
  assert.equal(result.ok, false);
  assert.match(result.errorMessage, /quota/i);
  assert.deepEqual(JSON.parse(storage.value(storageKey)), prior);
  assert.ok(engine.getSharedSyncDiagnosticsSerializedSize(nextMatch) <= 6144);
});

test('coordinator re-resolves the canonical match around every awaited synchronization phase', () => {
  assert.match(appSource, /runPhase\('metadataPullBefore'[\s\S]*getCanonicalSharedMatch\(matchId\)/);
  assert.match(appSource, /runPhase\('upload'[\s\S]*getCanonicalSharedMatch\(matchId\)/);
  assert.match(appSource, /runPhase\('scorePull'[\s\S]*getCanonicalSharedMatch\(matchId\)/);
  assert.match(appSource, /runPhase\('metadataPullAfter'[\s\S]*getCanonicalSharedMatch\(matchId\)/);
  assert.match(appSource, /pullSharedScoreEntries\(match, \{ silent: true, render: false, strictResult: true \}\)/);
});
