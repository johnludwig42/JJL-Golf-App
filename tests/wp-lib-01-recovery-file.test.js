import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import '../recovery-file.js';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { visualFixture } from './support/design-browser.js';

const { canonical, sha256Hex, buildRecoveryFile, serialize, parseRecoveryFile, verifyRecoveryFile } =
  globalThis.DyeLedgerRecoveryFile;
const { planRestore, executeRestorePlan, restoreKeys, validateHoldRecord, validateMarker } =
  globalThis.DyeLedgerRecoveryFile;
const meta = {
  appVersion: 'synthetic-version',
  createdAt: '2026-10-10T18:00:00.000Z',
  sourceOrigin: 'http://127.0.0.1:12345',
  fileId: 'fixture-file',
};
const hashText = text => createHash('sha256').update(text, 'utf8').digest('hex');

function independentCanonical(value) {
  return JSON.stringify(value, (_key, row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    return Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key]]));
  });
}

function fixture() {
  const engine = loadLiveEngine();
  const state = engine.seedState(visualFixture().state);
  const active = state.matches[0];
  const completedInput = structuredClone(active);
  completedInput.id = 'completed-local';
  for (const [index, player] of completedInput.players.entries()) {
    for (const score of player.scores) score.gross = 4 + index;
  }
  const { candidate: completed } = engine.buildFinishedMatchCandidate(completedInput, '2026-10-10T17:00:00.000Z');
  assert.ok(completed.roundRecordSnapshot);
  completed.roundRecordSnapshotHistory = [structuredClone(completed.roundRecordSnapshot)];
  const report = engine.buildLedgerEntryReportModel(completed);
  Object.assign(report.meta, { status: 'final', story: 'Synthetic round Story.' });
  completed.ledgerEntrySnapshot = engine.normalizeAcceptedLedgerEntrySnapshot({
    status: 'accepted', roundId: completed.id, acceptedAt: meta.createdAt, report,
  }, completed.id);
  assert.ok(completed.ledgerEntrySnapshot);
  const operation = {
    operationId: 'fixture-operation', matchId: 'fixture-cloud', playerId: 'p0',
    holeNumber: 1, deviceId: 'fixture-device', participantId: 'fixture-participant',
    queuedAt: meta.createdAt,
  };
  const shared = {
    ...structuredClone(active), id: 'shared-round', storageMode: 'shared', sharedMatchId: operation.matchId,
    sharedScoreQueueRecovery: { 'p0:1': operation },
    sharedSyncDiagnostics: [{ occurredAt: meta.createdAt, detail: 'Embedded diagnostic — café 🏌️' }],
  };
  state.matches.push(completed, shared);
  return {
    state: JSON.parse(JSON.stringify(state)),
    outbox: { operations: [operation], preservedForHostReview: [] },
    reviewReceipts: [{ id: 'fixture-receipt', matchId: operation.matchId }],
    finishRecovery: '{"roundId":"completed-local"}',
    setupDraft: '{"name":"Fixture draft"}',
    coursePublishRecovery: '{"courseId":"fixture-course"}',
    pendingLedger: { acceptance: '{"roundId":"completed-local"}', revision: null },
    templates: '[{"id":"fixture-template"}]',
    preferences: '{"preferredPlayInputMode":"PLAYER"}',
    deviceIdentity: { deviceId: operation.deviceId, name: 'Fixture device', participantIds: {} },
  };
}

test('A1 round trip preserves completed, active and shared records and all selected sections', async () => {
  const sources = fixture();
  const file = await buildRecoveryFile(sources, meta);
  const parsed = parseRecoveryFile(serialize(file));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.file.payload, sources);
  assert.deepEqual(parsed.file.meta, meta);
  assert.equal(parsed.file.payload.state.matches[1].ledgerEntrySnapshot.report.meta.story, 'Synthetic round Story.');
  assert.equal(parsed.file.payload.state.matches[1].roundRecordSnapshotHistory.length, 1);
  assert.equal(parsed.file.payload.state.matches[2].sharedScoreQueueRecovery['p0:1'].operationId, 'fixture-operation');
  const verified = await verifyRecoveryFile(parsed.file);
  assert.equal(verified.ok, true);
  assert.equal(verified.sections.length, 10);
  assert.equal(verified.rounds.length, 3);
  assert.ok([...verified.sections, ...verified.rounds].every(result => result.ok));
});

test('A2 distinct format keeps all legacy import fields inside payload.state', async () => {
  const file = await buildRecoveryFile(fixture(), meta);
  assert.deepEqual(Object.keys(file), ['format', 'schemaVersion', 'meta', 'manifest', 'rounds', 'payload']);
  assert.equal(file.format, 'dye-ledger-recovery');
  assert.equal(file.schemaVersion, 1);
  for (const key of Object.keys(file.payload.state)) assert.equal(Object.hasOwn(file, key), false, key);
});

test('A3 parser refuses ordinary exports and extra top-level keys', async () => {
  const sources = fixture();
  const file = await buildRecoveryFile(sources, meta);
  assert.deepEqual(parseRecoveryFile(JSON.stringify(sources.state)), {
    ok: false, errors: ['not-a-recovery-file'], file: null,
  });
  assert.deepEqual(parseRecoveryFile(serialize({ ...file, matches: [] })), {
    ok: false, errors: ['forbidden-top-level-key'], file: null,
  });
});

test('A4 hashes independently reproduce whole rounds and UTF-8 section sizes', async () => {
  const sources = fixture();
  const file = await buildRecoveryFile(sources, meta);
  for (const [index, match] of sources.state.matches.entries()) {
    assert.equal(file.rounds[index].roundId, match.id);
    assert.equal(file.rounds[index].canonicalSha256, hashText(independentCanonical(match)));
  }
  const { sharedScoreQueueRecovery, ...withoutQueue } = sources.state.matches[2];
  assert.ok(sharedScoreQueueRecovery);
  assert.notEqual(file.rounds[2].canonicalSha256, hashText(independentCanonical(withoutQueue)));
  for (const [name, value] of Object.entries(sources)) {
    const text = independentCanonical(value);
    assert.deepEqual(file.manifest.sections[name], { bytes: Buffer.byteLength(text), sha256: hashText(text) });
  }
  assert.equal(canonical({ z: 2, a: { c: 1, b: [3, 2], a: undefined } }), '{"a":{"b":[3,2],"c":1},"z":2}');
  assert.equal(await sha256Hex('café 🏌️'), hashText('café 🏌️'));
});

test('A5 verification identifies each changed section and isolates a changed round', async () => {
  const file = await buildRecoveryFile(fixture(), meta);
  const changes = {
    state: payload => { payload.state.matches[1].name += '!'; },
    outbox: payload => { payload.outbox.operations[0].holeNumber = 2; },
    reviewReceipts: payload => { payload.reviewReceipts[0].id += '!'; },
    finishRecovery: payload => { payload.finishRecovery += '!'; },
    setupDraft: payload => { payload.setupDraft += '!'; },
    coursePublishRecovery: payload => { payload.coursePublishRecovery += '!'; },
    pendingLedger: payload => { payload.pendingLedger.acceptance += '!'; },
    templates: payload => { payload.templates += '!'; },
    preferences: payload => { payload.preferences += '!'; },
    deviceIdentity: payload => { payload.deviceIdentity.name += '!'; },
  };
  assert.deepEqual(Object.keys(file.payload), Object.keys(changes));
  for (const [name, change] of Object.entries(changes)) {
    const altered = structuredClone(file);
    change(altered.payload);
    const parsed = parseRecoveryFile(serialize(altered));
    assert.equal(parsed.ok, true, name);
    const result = await verifyRecoveryFile(parsed.file);
    assert.equal(result.ok, false, name);
    assert.deepEqual(result.sections.filter(section => !section.ok).map(section => section.name), [name]);
    assert.deepEqual(result.rounds.filter(round => !round.ok).map(round => round.roundId),
      name === 'state' ? ['completed-local'] : []);
  }
});

test('A5 parser refuses structural faults, unknown versions and oversized text', async () => {
  const file = await buildRecoveryFile(fixture(), meta);
  const { payload, ...missingPayload } = file;
  const { outbox, ...missingSection } = payload;
  const text = serialize(file);
  for (const [input, options, expected] of [
    [serialize(missingPayload), undefined, 'missing-payload'],
    [serialize({ ...file, payload: missingSection }), undefined, 'invalid-payload-sections'],
    [serialize({ ...file, schemaVersion: 2 }), undefined, 'unsupported-schema-version'],
    [text, { maxBytes: Buffer.byteLength(text) - 1 }, 'file-too-large'],
    ['{', undefined, 'invalid-json'],
  ]) {
    assert.deepEqual(parseRecoveryFile(input, options), { ok: false, errors: [expected], file: null });
  }
  assert.equal(parseRecoveryFile(text, { maxBytes: Buffer.byteLength(text) }).ok, true);
});

test('A6 excluded store values stay out and embedded round diagnostics survive exactly', async () => {
  const sources = fixture();
  const stores = [
    ['dye-ledger-account-auth-v1:fixture', 'dye-ledger-account-auth-v1*'],
    ['the-dye-ledger-cloud-match:fixture', 'the-dye-ledger-cloud-match:*'],
    ['the-dye-ledger-shared-delivery-retry-v1', 'the-dye-ledger-shared-delivery-retry-v1'],
    ['dye-ledger-recent-app-errors', 'dye-ledger-recent-app-errors'],
    ['the-dye-ledger-v20:shared-join-diagnostic', 'the-dye-ledger-v20:shared-join-diagnostic'],
    ['sessionStorage', 'sessionStorage'],
  ];
  for (const [key] of stores) sources[key] = 'excluded-fixture-' + randomUUID();
  const file = await buildRecoveryFile(sources, meta);
  const text = serialize(file);
  for (const [key] of stores) assert.equal(text.includes(sources[key]), false, key);
  assert.deepEqual(file.manifest.exclusions, stores.map(([, label]) => label));
  const originalRound = sources.state.matches[2];
  const parsedRound = parseRecoveryFile(text).file.payload.state.matches[2];
  assert.equal(JSON.stringify(parsedRound.sharedSyncDiagnostics), JSON.stringify(originalRound.sharedSyncDiagnostics));
  assert.equal(file.rounds[2].canonicalSha256, hashText(independentCanonical(originalRound)));
  const { sharedSyncDiagnostics, ...withoutDiagnostics } = originalRound;
  assert.ok(sharedSyncDiagnostics.length);
  assert.notEqual(file.rounds[2].canonicalSha256, hashText(independentCanonical(withoutDiagnostics)));
});

test('A7 identical injected inputs produce identical bytes and later changes to the source do not alter the file', async () => {
  const sources = fixture();
  const first = await buildRecoveryFile(sources, meta);
  const text = serialize(first);
  assert.equal(serialize(await buildRecoveryFile(sources, meta)), text);
  sources.state.matches[0].name = 'Changed after snapshot';
  assert.equal(serialize(first), text);
});

async function restoreFixture() {
  const sources = fixture();
  const text = serialize(await buildRecoveryFile(sources, meta));
  return {
    sources, text, plan: await planRestore(text, { profileNonce: 'fixture-nonce', restoredAt: meta.createdAt }),
  };
}

function restoreAdapters() {
  const values = new Map();
  const receipts = [];
  const writes = [];
  return {
    values, writes, options: {
      storage: {
        getItem: key => values.get(key) ?? null,
        setItem(key, value) { values.set(key, value); writes.push(key); },
      },
      idb: {
        put(receipt) { receipts.push(structuredClone(receipt)); writes.push('receipt:' + receipt.id); },
        listAll: () => structuredClone(receipts),
      },
      preflight: () => values.size === 0,
      isOffline: () => true,
      now: () => meta.createdAt,
    },
  };
}

test('R1-B restore planning splits the held data without writing live delivery, identity or startup keys', async () => {
  const { sources, text, plan } = await restoreFixture();
  const score = JSON.parse(plan.values[restoreKeys.scoreHold]);
  const startup = JSON.parse(plan.values[restoreKeys.startupHold]);
  const state = JSON.parse(plan.values[restoreKeys.state]);
  const shared = state.matches.find(match => match.storageMode === 'shared');
  assert.equal(validateMarker(plan.marker), true);
  assert.equal(plan.marker.fileSha256, hashText(text));
  assert.equal(await validateHoldRecord(score, 'score'), true);
  assert.equal(await validateHoldRecord(startup, 'startup'), true);
  assert.deepEqual(score.heldMatchIds, ['shared-round', 'fixture-cloud']);
  assert.deepEqual(score.operations, sources.outbox.operations);
  assert.deepEqual(score.preservedForHostReview, sources.outbox.preservedForHostReview);
  assert.equal(Object.hasOwn(shared, 'sharedScoreQueueRecovery'), false);
  assert.deepEqual({ ...shared, ...score.queueRecovery[shared.id] }, sources.state.matches[2]);
  for (const name of ['finishRecovery', 'pendingLedger', 'coursePublishRecovery']) {
    assert.deepEqual(startup[name], sources[name]);
  }
  assert.deepEqual(Object.keys(plan.values).sort(), [
    restoreKeys.scoreHold, restoreKeys.startupHold, restoreKeys.setupDraft, restoreKeys.templates,
    restoreKeys.preferences, restoreKeys.state, restoreKeys.backup,
  ].sort());
  assert.equal(await validateHoldRecord({ ...score, heldMatchIds: [] }, 'score'), false);
  assert.equal(await validateHoldRecord({ ...startup, pendingLedger: null }, 'startup'), false);
});

test('R1-B refuses a changed v1 exclusions list or mismatched round-index metadata', async () => {
  const { text } = await restoreFixture();
  const file = JSON.parse(text);
  file.manifest.exclusions.pop();
  assert.deepEqual(parseRecoveryFile(serialize(file)).errors, ['invalid-manifest']);
  const changedIndex = JSON.parse(text);
  changedIndex.rounds[0].status = 'complete';
  assert.deepEqual((await verifyRecoveryFile(changedIndex)).errors, ['round-mismatch:design-round']);
});

test('R1-B execution writes S1–S8 in order and refuses reuse without altering the profile', async () => {
  const { plan } = await restoreFixture();
  const { values, writes, options } = restoreAdapters();
  const result = await executeRestorePlan(plan, options);
  assert.equal(result.ok, true);
  assert.equal(result.marker.phase, 'restored-verified');
  assert.deepEqual(result.marker.results, { rounds: 3, receipts: 1, backup: 'verified' });
  assert.deepEqual(writes, [
    restoreKeys.marker, restoreKeys.scoreHold, restoreKeys.startupHold, 'receipt:fixture-receipt',
    restoreKeys.setupDraft, restoreKeys.templates, restoreKeys.preferences,
    restoreKeys.state, restoreKeys.backup, restoreKeys.marker,
  ]);
  assert.equal(values.get(restoreKeys.state), values.get(restoreKeys.backup));
  const before = [...values];
  assert.deepEqual(await executeRestorePlan(plan, options), { ok: false, step: 'S0', error: 'preflight-refused' });
  assert.deepEqual([...values], before);
});

test('R1-B fault stops S1–S7 retain a restoring marker and never resume', async () => {
  const { plan } = await restoreFixture();
  for (let index = 1; index <= 7; index++) {
    const { values, writes, options } = restoreAdapters();
    const stopAfter = 'S' + index;
    const result = await executeRestorePlan(plan, { ...options, stopAfter });
    assert.deepEqual(result, { ok: false, step: stopAfter, error: 'interrupted' });
    assert.equal(JSON.parse(values.get(restoreKeys.marker)).phase, 'restoring');
    assert.equal(values.has(restoreKeys.state), index >= 6);
    const before = [...writes];
    assert.equal((await executeRestorePlan(plan, options)).step, 'S0');
    assert.deepEqual(writes, before);
  }
});

test('R1-B faults stop on primary quota, receipt failure or going online; backup quota alone is nonfatal', async () => {
  const { plan } = await restoreFixture();
  for (const [key, step] of [[restoreKeys.state, 'S6'], [restoreKeys.backup, 'S7']]) {
    const { values, options } = restoreAdapters();
    const write = options.storage.setItem;
    options.storage.setItem = (target, value) => {
      if (target === key) throw new DOMException('Synthetic quota', 'QuotaExceededError');
      write(target, value);
    };
    const result = await executeRestorePlan(plan, options);
    if (step === 'S6') {
      assert.deepEqual(result, { ok: false, step, error: 'quota-exceeded' });
      assert.equal(values.has(restoreKeys.state), false);
      assert.equal(JSON.parse(values.get(restoreKeys.marker)).phase, 'restoring');
    } else {
      assert.equal(result.ok, true);
      assert.equal(result.marker.results.backup, 'quota-unavailable');
      assert.equal(values.has(restoreKeys.backup), false);
    }
  }
  for (const [error, step] of [['receipt-write-failed', 'S4'], ['offline-required', 'S5']]) {
    const { values, options } = restoreAdapters();
    let offline = true;
    options.isOffline = () => offline;
    options.idb.put = () => {
      if (step === 'S4') throw new Error(error);
      offline = false;
    };
    options.idb.listAll = () => structuredClone(plan.receipts);
    assert.deepEqual(await executeRestorePlan(plan, options), { ok: false, step, error });
    assert.equal(values.has(restoreKeys.state), false);
    assert.equal(JSON.parse(values.get(restoreKeys.marker)).phase, 'restoring');
  }
});
