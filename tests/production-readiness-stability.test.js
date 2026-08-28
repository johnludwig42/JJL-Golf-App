import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const PRIMARY = 'the-dye-ledger-v20';
const BACKUP = `${PRIMARY}:last-known-good`;
const FINISH = `${PRIMARY}:finish-recovery`;
const DRAFT = `${PRIMARY}:setup-draft`;

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function memoryStorage(seed = {}, fail = () => false) {
  const rows = new Map(Object.entries(seed));
  return {
    getItem(key) { return rows.has(key) ? rows.get(key) : null; },
    setItem(key, value) {
      if (fail(key, value)) {
        const error = new Error('simulated storage failure');
        error.name = 'QuotaExceededError';
        throw error;
      }
      rows.set(key, String(value));
    },
    removeItem(key) { rows.delete(key); },
    value(key) { return rows.get(key); },
    has(key) { return rows.has(key); },
  };
}

function capacityStorage(seed = {}, capacity = Infinity) {
  const rows = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) { return rows.has(key) ? rows.get(key) : null; },
    setItem(key, value) {
      const next = String(value);
      const usedWithoutKey = [...rows.entries()].reduce((total, [rowKey, rowValue]) => total + (rowKey === key ? 0 : rowValue.length), 0);
      if (usedWithoutKey + next.length > capacity) {
        const error = new Error('simulated storage capacity exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      rows.set(key, next);
    },
    removeItem(key) { rows.delete(key); },
    value(key) { return rows.get(key); },
    has(key) { return rows.has(key); },
  };
}

function roundFixture(engine) {
  const holes = Array.from({ length: 9 }, (_, index) => ({ holeNumber: index + 1, par: 4, strokeIndex: index + 1, yardage: 390 }));
  const course = { id: 'course', name: 'Trust Club', tees: [{ id: 'tee', teeName: 'Ledger', par: 36, rating: 36, slope: 113, holes }] };
  const players = [{ id: 'p1', name: 'One', index: 0 }, { id: 'p2', name: 'Two', index: 0 }];
  const scores = gross => holes.map(hole => ({ holeNumber: hole.holeNumber, gross }));
  const match = engine.createEmptyMatch({
    id: 'round-1', courseId: course.id, teeId: 'tee', holeCount: 9,
    teamCount: 2, playersPerTeam: 1, teamNames: ['One', 'Two'],
    selectedGames: [{ key: 'skins', basis: 'gross', stake: 1 }],
    players: [
      { playerId: 'p1', team: 1, slot: 0, teeId: 'tee', scores: scores(4) },
      { playerId: 'p2', team: 2, slot: 1, teeId: 'tee', scores: scores(5) },
    ],
  });
  engine.seedState({ players, courses: [course], matches: [match], activeMatchId: match.id });
  return match;
}

test('current release identity is consistent across runtime, cache, manifest, and package metadata', () => {
  assert.equal(pkg.version, '31.0.10');
  assert.equal(manifest.version, 'v31.0.10');
  assert.match(app, /versionNumber:\s*'31\.0\.10'/);
  assert.match(worker, /v31\.0\.10/);
  assert.match(html, /id="appVersionLabel">v31\.0\.10/);
});

test('critical state writes are all-or-error and preserve the prior durable payload on failure', () => {
  const engine = loadLiveEngine();
  const prior = { matches: [{ id: 'active', status: 'active' }], activeMatchId: 'active' };
  const storage = memoryStorage({ [PRIMARY]: JSON.stringify(prior) }, key => key === PRIMARY);
  const next = { matches: [{ id: 'active', status: 'complete' }], activeMatchId: 'active' };
  const result = engine.persistStateSnapshot(next, storage);
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'primary-write-retry');
  assert.match(result.errorMessage, /quota/i);
  assert.deepEqual(JSON.parse(storage.value(PRIMARY)), prior);
  assert.equal(storage.has(BACKUP), false);
});

test('completed-round growth reclaims a redundant backup before reporting a quota failure', () => {
  const engine = loadLiveEngine();
  const prior = { matches: [{ id: 'active', status: 'active', scores: 'x'.repeat(800) }], activeMatchId: 'active' };
  const next = {
    matches: [{ id: 'active', status: 'complete', scores: 'x'.repeat(800), roundRecordSnapshot: { ledger: 'y'.repeat(350) } }],
    activeMatchId: 'active',
  };
  const priorPayload = JSON.stringify(prior);
  const nextPayload = JSON.stringify(next);
  const storage = capacityStorage({ [PRIMARY]: priorPayload, [BACKUP]: priorPayload }, nextPayload.length + 20);

  const result = engine.persistStateSnapshot(next, storage);

  assert.equal(result.ok, true);
  assert.equal(result.backupPruned, true);
  assert.deepEqual(JSON.parse(storage.value(PRIMARY)), next);
  assert.equal(storage.has(BACKUP), false, 'the redundant copy stays absent so it cannot immediately consume the reclaimed capacity');
});

test('quota retry still preserves the prior primary when even one completed-round copy cannot fit', () => {
  const engine = loadLiveEngine();
  const prior = { matches: [{ id: 'active', status: 'active' }], activeMatchId: 'active' };
  const next = { matches: [{ id: 'active', status: 'complete', roundRecordSnapshot: { ledger: 'z'.repeat(1000) } }], activeMatchId: 'active' };
  const priorPayload = JSON.stringify(prior);
  const storage = capacityStorage({ [PRIMARY]: priorPayload, [BACKUP]: priorPayload }, priorPayload.length + 50);

  const result = engine.persistStateSnapshot(next, storage);

  assert.equal(result.ok, false);
  assert.equal(result.stage, 'primary-write-retry');
  assert.deepEqual(JSON.parse(storage.value(PRIMARY)), prior, 'the active round remains the durable recovery copy');
});

test('finish transaction can reclaim both the backup and recovery marker while preserving atomic completion', () => {
  const engine = loadLiveEngine();
  const prior = { matches: [{ id: 'active', status: 'active', scores: 'x'.repeat(500) }], activeMatchId: 'active' };
  const next = { matches: [{ id: 'active', status: 'complete', scores: 'x'.repeat(500), roundRecordSnapshot: { ledger: 'y'.repeat(300) } }], activeMatchId: 'active' };
  const marker = { roundId: 'active', stage: 'prepared', snapshotRequired: true };
  const priorPayload = JSON.stringify(prior);
  const nextPayload = JSON.stringify(next);
  const storage = capacityStorage({ [PRIMARY]: priorPayload, [BACKUP]: priorPayload }, nextPayload.length + 5);

  const result = engine.persistFinishedStateSnapshot(next, marker, storage);

  assert.equal(result.ok, true);
  assert.equal(result.finishMarkerPruned, true);
  assert.deepEqual(JSON.parse(storage.value(PRIMARY)), next);
  assert.equal(storage.has(BACKUP), false);
  assert.equal(storage.has(FINISH), false);
});

test('failed finish transaction never replaces the durable active round', () => {
  const engine = loadLiveEngine();
  const prior = { matches: [{ id: 'active', status: 'active' }], activeMatchId: 'active' };
  const next = { matches: [{ id: 'active', status: 'complete', roundRecordSnapshot: { ledger: 'z'.repeat(1000) } }], activeMatchId: 'active' };
  const priorPayload = JSON.stringify(prior);
  const storage = capacityStorage({ [PRIMARY]: priorPayload, [BACKUP]: priorPayload }, priorPayload.length + 50);

  const result = engine.persistFinishedStateSnapshot(next, { roundId: 'active', stage: 'prepared' }, storage);

  assert.equal(result.ok, false);
  assert.deepEqual(JSON.parse(storage.value(PRIMARY)), prior);
});

test('state recovery falls back from malformed primary data and sanitizes partial records', () => {
  const engine = loadLiveEngine();
  const backup = {
    players: [{ id: 'p1' }, null, 'bad'],
    courses: [{ id: 'c1', tees: [{ id: 't1' }, null] }],
    matches: [{ id: 'dup', status: 'active', players: [null] }, { id: 'dup', status: 'complete', players: [{ playerId: 'p1' }] }, 'bad'],
    activeMatchId: 'missing', sharedMatchIds: ['s1', 's1', null], unknownFutureField: { keep: true },
  };
  const storage = memoryStorage({ [PRIMARY]: '{not-json', [BACKUP]: JSON.stringify(backup) });
  const recovered = json(engine.loadStateFromStorage(storage));
  assert.equal(recovered.players.length, 1);
  assert.equal(recovered.courses[0].tees.length, 1);
  assert.equal(recovered.matches.length, 1);
  assert.equal(recovered.matches[0].status, 'complete', 'the last duplicate is deterministic');
  assert.equal(recovered.activeMatchId, null, 'a dangling active pointer is discarded');
  assert.deepEqual(recovered.sharedMatchIds, ['s1']);
  assert.deepEqual(recovered.unknownFutureField, { keep: true });
});

test('interrupted finish reconciliation deterministically confirms durable completion or rolls back active', () => {
  const engine = loadLiveEngine();
  const marker = { roundId: 'r1', snapshotRequired: false };
  const active = engine.reconcileInterruptedFinishState({ matches: [{ id: 'r1', status: 'active' }] }, marker);
  assert.equal(active.status, 'active-rollback');
  const complete = engine.reconcileInterruptedFinishState({ matches: [{ id: 'r1', status: 'complete', completedAt: '2026-07-14T12:00:00Z' }] }, marker);
  assert.equal(complete.status, 'completed-confirmed');
  const storage = memoryStorage({
    [PRIMARY]: JSON.stringify({ matches: [{ id: 'r1', status: 'active' }], activeMatchId: 'r1' }),
    [FINISH]: JSON.stringify(marker),
  });
  assert.equal(engine.loadStateFromStorage(storage).matches[0].status, 'active');
  assert.equal(storage.has(FINISH), false);
});

test('setup drafts survive reload, reject malformed roots, and never preserve historical score state', () => {
  const engine = loadLiveEngine();
  const storage = memoryStorage();
  const result = engine.saveSetupDraft({
    id: 'draft', date: '2026-07-14', name: 'Tuesday group', holeCount: 9,
    players: [{ playerId: 'p1', team: 1, slot: 0 }], selectedGames: [{ key: 'skins', stake: 2 }],
    status: 'complete', completedAt: 'old', presses: [{ id: 'old' }], roundRecordSnapshot: { schemaVersion: 1 },
  }, storage);
  assert.equal(result.ok, true);
  const draft = json(engine.loadSetupDraft(storage));
  assert.equal(draft.status, 'active');
  assert.equal(draft.completedAt, null);
  assert.deepEqual(draft.presses, []);
  assert.equal(draft.roundRecordSnapshot, null);
  assert.equal(draft.players[0].playerId, 'p1');
  storage.setItem(DRAFT, '[]');
  assert.equal(engine.loadSetupDraft(storage), null);
});

test('Finish builds an immutable, repeatable completed candidate with a frozen balanced ledger', () => {
  const engine = loadLiveEngine();
  const match = roundFixture(engine);
  const before = JSON.stringify(match);
  const first = engine.buildFinishedMatchCandidate(match, '2026-07-14T18:00:00.000Z').candidate;
  const second = engine.buildFinishedMatchCandidate(match, '2026-07-14T18:00:00.000Z').candidate;
  assert.equal(JSON.stringify(match), before, 'preparation must not mutate the active round');
  assert.equal(first.status, 'complete');
  assert.equal(first.completedAt, '2026-07-14T18:00:00.000Z');
  assert.ok(first.roundRecordSnapshot, 'a fully scored round is frozen');
  const firstStable = json(first.roundRecordSnapshot);
  const secondStable = json(second.roundRecordSnapshot);
  delete firstStable.frozenAt;
  delete secondStable.frozenAt;
  assert.deepEqual(firstStable, secondStable, 'retry-derived ledger data is stable');
  const transactions = first.roundRecordSnapshot.transactions || [];
  assert.equal(new Set(transactions.map(row => row.transactionId)).size, transactions.length);
  assert.equal(first.roundRecordSnapshot.settlement.crossFoot, 0);
});

test('reopen preserves the prior frozen record in immutable history before edits resume', () => {
  const engine = loadLiveEngine();
  const match = engine.buildFinishedMatchCandidate(roundFixture(engine), '2026-07-14T18:00:00.000Z').candidate;
  const frozen = JSON.stringify(match.roundRecordSnapshot);
  assert.equal(engine.markRoundReopenedForEditing(match), true);
  assert.equal(match.status, 'active');
  assert.equal(match.completedAt, null);
  assert.equal(match.roundRecordSnapshot, null);
  assert.equal(JSON.stringify(match.roundRecordSnapshotHistory[0]).startsWith(frozen.slice(0, -1)), true);
  assert.equal(match.roundRecordSnapshotHistory[0].supersededReason, 'round-reopened-for-editing');
});

test('Start Another Round carries the group but clears scores, stats, games, presses, snapshots, and Shared transport credentials', () => {
  const engine = loadLiveEngine();
  const prior = roundFixture(engine);
  Object.assign(prior, {
    status: 'complete', completedAt: '2026-07-14T18:00:00Z', presses: [{ id: 'press' }],
    roundRecordSnapshot: { schemaVersion: 1 }, selectedGames: [{ key: 'skins' }], storageMode: 'shared',
    sharedMatchCode: 'OLD123', sharedDevices: [{ id: 'device' }], sharedPlayerAssignments: { p1: 'device' },
  });
  const next = json(engine.buildNextRoundDraft(prior));
  assert.deepEqual(next.players.map(player => player.playerId), ['p1', 'p2']);
  assert.ok(next.players.every(player => player.scores.every(score => score.gross == null)));
  assert.deepEqual(next.selectedGames, []);
  assert.deepEqual(next.presses, []);
  assert.equal(next.roundRecordSnapshot, null);
  assert.notEqual(next.sharedMatchCode, 'OLD123');
  assert.equal(next.sharedDevices.some(device => device.id === 'device'), false);
  assert.deepEqual(next.sharedPlayerAssignments, {});
  assert.notEqual(next.id, prior.id);
});

test('service worker updates are waiting-worker driven and never force a mid-round refresh', () => {
  assert.doesNotMatch(worker.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '', /skipWaiting/);
  assert.match(worker, /message[\s\S]*SKIP_WAITING[\s\S]*skipWaiting/);
  assert.match(worker, /request\.mode === 'navigate'[\s\S]*networkFirstNavigation\(event\.request\)/);
  assert.match(worker, /caches\.match\('\.\/index\.html'\)/);
  assert.match(app, /function triggerAppUpdate\(\)\s*\{\s*refreshPwaNow\(\{ force: false \}\);/);
  assert.doesNotMatch(app, /Refresh Now Anyway/);
});

test('technical diagnostics expose storage, recovery, active-round, Shared, preference, and frozen-record health', () => {
  for (const id of [
    'appStorageAvailabilityStatus', 'appStorageLoadedFrom', 'appFinishRecoveryStatus',
    'appLastLocalSave', 'appLastLocalSaveFailure', 'appActiveRoundDiagnostic',
    'appSharedMatchDiagnostic', 'appScoredHoleDiagnostic', 'appPreferenceSchemaDiagnostic',
    'appRoundRecordDiagnostic',
  ]) assert.match(html, new RegExp(`id="${id}"`));
});
