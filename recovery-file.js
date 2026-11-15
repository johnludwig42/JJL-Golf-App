(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DyeLedgerRecoveryFile = api;
})(globalThis, function () {
  'use strict';

  const format = 'dye-ledger-recovery';
  const schemaVersion = 1;
  const maxFileBytes = 16 * 1024 * 1024;
  const encoder = new TextEncoder();
  const topKeys = ['format', 'schemaVersion', 'meta', 'manifest', 'rounds', 'payload'];
  const metaKeys = ['appVersion', 'createdAt', 'sourceOrigin', 'fileId'];
  const sectionNames = [
    'state', 'outbox', 'reviewReceipts', 'finishRecovery', 'setupDraft',
    'coursePublishRecovery', 'pendingLedger', 'templates', 'preferences', 'deviceIdentity',
  ];
  // This is part of the v1 manifest. Preserve the v1 list when adding a format version.
  const excludedStores = [
    'dye-ledger-account-auth-v1*',
    'the-dye-ledger-cloud-match:*',
    'the-dye-ledger-shared-delivery-retry-v1',
    'dye-ledger-recent-app-errors',
    'the-dye-ledger-v20:shared-join-diagnostic',
    'sessionStorage',
  ];

  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const hasExactKeys = (value, keys) => isRecord(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const isNonemptyText = value => typeof value === 'string' && value.trim().length > 0;

  function sortKeys(value) {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.keys(value).sort()
      .filter(key => value[key] !== undefined).map(key => [key, sortKeys(value[key])]));
  }

  function canonical(value) {
    return JSON.stringify(sortKeys(value));
  }

  async function sha256Hex(text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function validRoundIds(matches) {
    const ids = new Set();
    for (const match of matches) {
      if (!isRecord(match) || !isNonemptyText(match.id) || ids.has(match.id)
        || !isNonemptyText(match.status) || !isNonemptyText(match.storageMode)) return false;
      ids.add(match.id);
    }
    return true;
  }

  function validMeta(meta) {
    return hasExactKeys(meta, metaKeys) && metaKeys.every(key => isNonemptyText(meta[key]));
  }

  function envelopeError(file) {
    if (!isRecord(file) || file.format !== format) return 'not-a-recovery-file';
    if (file.schemaVersion !== schemaVersion) return 'unsupported-schema-version';
    if (Object.keys(file).some(key => !topKeys.includes(key))) return 'forbidden-top-level-key';
    if (!isRecord(file.payload)) return 'missing-payload';
    if (!hasExactKeys(file.payload, sectionNames)) return 'invalid-payload-sections';
    const { state } = file.payload;
    if (!isRecord(state) || !Array.isArray(state.matches) || !Array.isArray(state.players)
      || !Array.isArray(state.courses) || !validRoundIds(state.matches)) return 'invalid-state';
    if (!validMeta(file.meta)) return 'invalid-meta';
    if (!hasExactKeys(file.manifest, ['sections', 'exclusions'])
      || !hasExactKeys(file.manifest.sections, sectionNames)
      || JSON.stringify(file.manifest.exclusions) !== JSON.stringify(excludedStores)
      || sectionNames.some(name => {
        const entry = file.manifest.sections[name];
        return !hasExactKeys(entry, ['bytes', 'sha256']) || !Number.isSafeInteger(entry.bytes)
          || entry.bytes < 0 || !isHash(entry.sha256);
      })) return 'invalid-manifest';
    if (!Array.isArray(file.rounds) || file.rounds.length !== state.matches.length
      || file.rounds.some((entry, index) => !hasExactKeys(entry, ['roundId', 'status', 'storageMode', 'canonicalSha256'])
        || entry.roundId !== state.matches[index].id || !isNonemptyText(entry.status)
        || !isNonemptyText(entry.storageMode) || !isHash(entry.canonicalSha256))) return 'invalid-round-index';
    return null;
  }

  async function buildRecoveryFile(sources, meta) {
    // Snapshot injected JSON values before hashing. Only named source sections are exported.
    const payload = JSON.parse(JSON.stringify(Object.fromEntries(
      sectionNames.map(name => [name, sources[name] ?? null]),
    )));
    const metadata = Object.fromEntries(metaKeys.map(key => [key, meta[key]]));
    if (!validMeta(metadata)) throw new TypeError('invalid-meta');
    if (!isRecord(payload.state) || !Array.isArray(payload.state.matches)
      || !Array.isArray(payload.state.players) || !Array.isArray(payload.state.courses)
      || !validRoundIds(payload.state.matches)) throw new TypeError('invalid-state');

    const sections = Object.fromEntries(await Promise.all(sectionNames.map(async name => {
      const text = canonical(payload[name]);
      return [name, { bytes: encoder.encode(text).byteLength, sha256: await sha256Hex(text) }];
    })));
    const rounds = await Promise.all(payload.state.matches.map(async match => ({
      roundId: match.id,
      status: match.status,
      storageMode: match.storageMode,
      canonicalSha256: await sha256Hex(canonical(match)),
    })));
    return {
      format, schemaVersion, meta: metadata, manifest: { sections, exclusions: [...excludedStores] },
      rounds, payload,
    };
  }

  function serialize(file) {
    return JSON.stringify(file);
  }

  function parseRecoveryFile(text, { maxBytes = maxFileBytes } = {}) {
    const refuse = error => ({ ok: false, errors: [error], file: null });
    if (typeof text !== 'string') return refuse('invalid-json');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return refuse('invalid-byte-limit');
    if (text.length > maxBytes || encoder.encode(text).byteLength > maxBytes) return refuse('file-too-large');
    let file;
    try { file = JSON.parse(text); }
    catch { return refuse('invalid-json'); }
    const error = envelopeError(file);
    return error ? refuse(error) : { ok: true, errors: [], file };
  }

  async function verifyRecoveryFile(file) {
    const error = envelopeError(file);
    if (error) return { ok: false, errors: [error], sections: [], rounds: [] };
    try {
      const sections = await Promise.all(sectionNames.map(async name => {
        const text = canonical(file.payload[name]);
        const { bytes, sha256: expected } = file.manifest.sections[name];
        const actual = await sha256Hex(text);
        return { name, expected, actual, ok: expected === actual && bytes === encoder.encode(text).byteLength };
      }));
      const rounds = await Promise.all(file.rounds.map(async ({ roundId, canonicalSha256: expected, status, storageMode }, index) => {
        const match = file.payload.state.matches[index];
        const actual = await sha256Hex(canonical(match));
        return { roundId, expected, actual, ok: expected === actual && status === match.status && storageMode === match.storageMode };
      }));
      const errors = [
        ...sections.filter(result => !result.ok).map(result => 'section-mismatch:' + result.name),
        ...rounds.filter(result => !result.ok).map(result => 'round-mismatch:' + result.roundId),
      ];
      return { ok: errors.length === 0, errors, sections, rounds };
    } catch {
      return { ok: false, errors: ['verification-failed'], sections: [], rounds: [] };
    }
  }

  const restoreKeys = Object.freeze({
    marker: 'dye-ledger-recovery-verification',
    scoreHold: 'the-dye-ledger-v20:recovered-score-hold:v1',
    startupHold: 'the-dye-ledger-v20:recovered-startup-hold:v1',
    state: 'the-dye-ledger-v20',
    backup: 'the-dye-ledger-v20:last-known-good',
    setupDraft: 'the-dye-ledger-v20:setup-draft',
    templates: 'dyeLedger.matchTemplates.v1',
    preferences: 'dyeLedger.playerPreferences',
  });
  const passiveNames = ['setupDraft', 'templates', 'preferences'];
  const queueFields = ['sharedScoreQueueRecovery', 'sharedDeliveryStorageFailure'];
  const nullableText = value => value === null || typeof value === 'string';
  const signature = record => sha256Hex(canonical(record));

  function acceptedLedgerReport(match) {
    const snapshot = match?.ledgerEntrySnapshot;
    if (snapshot?.status !== 'accepted' || !snapshot.acceptedAt || !snapshot.report) return null;
    const report = JSON.parse(JSON.stringify(snapshot.report));
    const reportRoundId = String(report?.meta?.roundId || snapshot.roundId || '');
    if (!reportRoundId || (match.id && reportRoundId !== String(match.id))) return null;
    const story = String(report?.meta?.story || snapshot.story || '').trim();
    if (!story || report.meta?.status !== 'final') return null;
    report.meta.story = story;
    report.meta.acceptanceStatus = 'accepted';
    report.meta.acceptedAt = snapshot.acceptedAt;
    return report;
  }

  function restorePriority(state) {
    return state.matches.filter(match => match.id !== state.activeMatchId).map(match => ({
      id: match.id,
      group: match.status !== 'complete' ? 0 : acceptedLedgerReport(match) ? 2 : 1,
      date: String(match.completedAt || match.date || ''),
    })).sort((a, b) => a.group - b.group || b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
      .map(round => round.id);
  }

  async function validateHoldRecord(record, kind) {
    if (!isRecord(record) || record.schemaVersion !== schemaVersion || !isNonemptyText(record.fileId)
      || !isHash(record.recordSha256)) return false;
    const { recordSha256, ...fields } = record;
    if (kind === 'startup') {
      if (!hasExactKeys(fields, ['schemaVersion', 'fileId', 'finishRecovery', 'pendingLedger', 'coursePublishRecovery'])
        || !nullableText(fields.finishRecovery) || !nullableText(fields.coursePublishRecovery)
        || !(fields.pendingLedger === null || (hasExactKeys(fields.pendingLedger, ['acceptance', 'revision'])
          && nullableText(fields.pendingLedger.acceptance) && nullableText(fields.pendingLedger.revision)))) return false;
    } else if (kind === 'score') {
      if (!hasExactKeys(fields, ['schemaVersion', 'fileId', 'fileSha256', 'restoredAt', 'sourceDeviceId',
        'heldMatchIds', 'operations', 'preservedForHostReview', 'queueRecovery'])
        || !isHash(fields.fileSha256) || !isNonemptyText(fields.restoredAt) || !nullableText(fields.sourceDeviceId)
        || !Array.isArray(fields.heldMatchIds) || !fields.heldMatchIds.every(isNonemptyText)
        || !Array.isArray(fields.operations) || !fields.operations.every(isRecord)
        || !Array.isArray(fields.preservedForHostReview) || !fields.preservedForHostReview.every(isRecord)
        || !isRecord(fields.queueRecovery) || Object.values(fields.queueRecovery).some(row => !isRecord(row)
          || Object.keys(row).some(key => !queueFields.includes(key)))) return false;
    } else return false;
    return recordSha256 === await signature(fields);
  }

  function validateMarker(marker) {
    if (!isRecord(marker) || marker.schemaVersion !== schemaVersion || !isNonemptyText(marker.fileId)
      || !isHash(marker.fileSha256) || !isNonemptyText(marker.profileNonce) || !isNonemptyText(marker.startedAt)
      || !isRecord(marker.expected)) return false;
    const required = [restoreKeys.scoreHold, restoreKeys.startupHold, restoreKeys.state, restoreKeys.backup];
    const allowed = required.concat(passiveNames.map(name => restoreKeys[name]));
    if (required.some(key => !Object.hasOwn(marker.expected, key))
      || Object.entries(marker.expected).some(([key, hash]) => !allowed.includes(key) || !isHash(hash))) return false;
    return marker.phase === 'restoring' || (marker.phase === 'restored-verified'
      && isNonemptyText(marker.completedAt) && isRecord(marker.results)
      && Number.isSafeInteger(marker.results.rounds) && marker.results.rounds >= 0
      && Number.isSafeInteger(marker.results.receipts) && marker.results.receipts >= 0
      && ['verified', 'quota-unavailable'].includes(marker.results.backup)
      && (!Object.hasOwn(marker.results, 'leftInFile') || (Array.isArray(marker.results.leftInFile)
        && marker.results.leftInFile.length > 0 && marker.results.leftInFile.every(isNonemptyText)
        && new Set(marker.results.leftInFile).size === marker.results.leftInFile.length)));
  }

  async function planRestore(text, { profileNonce, restoredAt } = {}) {
    if (!isNonemptyText(profileNonce) || !isNonemptyText(restoredAt)) throw new TypeError('invalid-restore-context');
    const parsed = parseRecoveryFile(text);
    if (!parsed.ok) throw new TypeError(parsed.errors[0]);
    const { file } = parsed;
    const verification = await verifyRecoveryFile(file);
    if (!verification.ok) throw new TypeError(verification.errors.join(', '));

    const { payload } = file;
    const fileId = file.meta.fileId;
    const fileSha256 = await sha256Hex(text);
    const queue = [];
    const heldMatchIds = new Set();
    for (const match of payload.state.matches) {
      if (match.storageMode === 'shared') {
        heldMatchIds.add(match.id);
        if (isNonemptyText(match.sharedMatchId)) heldMatchIds.add(match.sharedMatchId);
      }
      const fields = Object.fromEntries(queueFields.filter(key => Object.hasOwn(match, key)).map(key => [key, match[key]]));
      if (Object.keys(fields).length) queue.push([match.id, fields]);
      for (const key of queueFields) delete match[key];
    }
    const scoreHold = {
      schemaVersion, fileId, fileSha256, restoredAt, sourceDeviceId: payload.deviceIdentity?.deviceId ?? null,
      heldMatchIds: [...heldMatchIds], operations: payload.outbox?.operations ?? [],
      preservedForHostReview: payload.outbox?.preservedForHostReview ?? [], queueRecovery: Object.fromEntries(queue),
    };
    const startupHold = {
      schemaVersion, fileId, finishRecovery: payload.finishRecovery, pendingLedger: payload.pendingLedger,
      coursePublishRecovery: payload.coursePublishRecovery,
    };
    scoreHold.recordSha256 = await signature(scoreHold);
    startupHold.recordSha256 = await signature(startupHold);
    if (!await validateHoldRecord(scoreHold, 'score') || !await validateHoldRecord(startupHold, 'startup')) {
      throw new TypeError('invalid-hold-data');
    }

    const receipts = payload.reviewReceipts ?? [];
    if (!Array.isArray(receipts) || receipts.some(receipt => !isRecord(receipt) || !isNonemptyText(receipt.id))
      || new Set(receipts.map(receipt => receipt.id)).size !== receipts.length) throw new TypeError('invalid-receipts');
    const values = {
      [restoreKeys.scoreHold]: JSON.stringify(scoreHold),
      [restoreKeys.startupHold]: JSON.stringify(startupHold),
    };
    for (const name of passiveNames) {
      if (!nullableText(payload[name])) throw new TypeError('invalid-passive-data:' + name);
      if (payload[name] !== null) values[restoreKeys[name]] = payload[name];
    }
    values[restoreKeys.state] = values[restoreKeys.backup] = JSON.stringify(payload.state);
    const expected = Object.fromEntries(await Promise.all(Object.entries(values)
      .map(async ([key, value]) => [key, await sha256Hex(value)])));
    return {
      marker: { schemaVersion, phase: 'restoring', fileId, fileSha256, profileNonce, startedAt: restoredAt, expected },
      values, receipts, rounds: file.rounds,
    };
  }

  async function executeRestorePlan(plan, { storage, idb, preflight, isOffline, now, stopAfter } = {}) {
    let step = 'S0';
    const refuse = error => ({ ok: false, step, error });
    const stopped = () => step === stopAfter;
    const checkOffline = () => {
      if (isOffline() !== true) throw new Error('offline-required');
    };
    function write(key, value, previous = null) {
      checkOffline();
      if (storage.getItem(key) !== previous) throw new Error('restore-key-already-present');
      storage.setItem(key, value);
      if (storage.getItem(key) !== value) throw new Error('restore-readback-mismatch');
    }
    try {
      const { marker, values, receipts, rounds } = plan;
      if (!validateMarker(marker) || marker.phase !== 'restoring'
        || !hasExactKeys(values, Object.keys(marker.expected))) return refuse('invalid-restore-plan');
      for (const [key, value] of Object.entries(values)) {
        if (typeof value !== 'string' || await sha256Hex(value) !== marker.expected[key]) return refuse('invalid-restore-plan');
      }
      const scoreHold = JSON.parse(values[restoreKeys.scoreHold]);
      const startupHold = JSON.parse(values[restoreKeys.startupHold]);
      if (!await validateHoldRecord(scoreHold, 'score') || !await validateHoldRecord(startupHold, 'startup')
        || scoreHold.fileId !== marker.fileId || scoreHold.fileSha256 !== marker.fileSha256
        || startupHold.fileId !== marker.fileId) return refuse('invalid-restore-plan');
      if (await preflight() !== true || Object.values(restoreKeys).some(key => storage.getItem(key) !== null)) {
        return refuse('preflight-refused');
      }

      step = 'S1';
      // Reserve the serialized result space before attempting a quota-limited state write.
      const completionSpace = JSON.stringify({
        completedAt: marker.startedAt,
        results: { rounds: rounds.length, receipts: receipts.length, backup: 'quota-unavailable',
          leftInFile: rounds.map(round => round.roundId) },
      }).length + 32;
      const markerText = JSON.stringify({ ...marker, reserve: ' '.repeat(completionSpace) });
      write(restoreKeys.marker, markerText);
      if (stopped()) return refuse('interrupted');
      step = 'S2';
      write(restoreKeys.scoreHold, values[restoreKeys.scoreHold]);
      if (stopped()) return refuse('interrupted');
      step = 'S3';
      write(restoreKeys.startupHold, values[restoreKeys.startupHold]);
      if (stopped()) return refuse('interrupted');
      step = 'S4';
      checkOffline();
      for (const receipt of receipts) {
        checkOffline();
        await idb.put(receipt);
      }
      const readReceipts = await idb.listAll();
      const orderReceipts = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
      if (!Array.isArray(readReceipts) || await signature(orderReceipts(readReceipts)) !== await signature(orderReceipts(receipts))) {
        return refuse('receipt-readback-mismatch');
      }
      if (stopped()) return refuse('interrupted');
      step = 'S5';
      for (const name of passiveNames) {
        const key = restoreKeys[name];
        if (Object.hasOwn(values, key)) write(key, values[key]);
      }
      if (stopped()) return refuse('interrupted');
      step = 'S6';
      const originalState = JSON.parse(values[restoreKeys.state]);
      let stateText = values[restoreKeys.state];
      try { write(restoreKeys.state, stateText); }
      catch (error) {
        if (error?.name !== 'QuotaExceededError' || storage.getItem(restoreKeys.state) !== null) throw error;
        const priority = restorePriority(originalState);
        let stored = null;
        let low = 0;
        let high = priority.length - 1;
        while (low <= high) {
          const count = Math.floor((low + high) / 2);
          const ids = new Set(priority.slice(0, count));
          const candidate = JSON.stringify({
            ...originalState,
            matches: originalState.matches.filter(match => match.id === originalState.activeMatchId || ids.has(match.id)),
          });
          try {
            write(restoreKeys.state, candidate, stored);
            stored = candidate;
            low = count + 1;
          } catch (failure) {
            if (failure?.name !== 'QuotaExceededError' || storage.getItem(restoreKeys.state) !== stored) throw failure;
            high = count - 1;
          }
        }
        if (stored === null) throw error;
        stateText = stored;
      }
      const state = JSON.parse(storage.getItem(restoreKeys.state));
      const roundById = new Map(rounds.map(round => [round.roundId, round]));
      const restoredIds = new Set(state.matches.map(match => match.id));
      const leftInFile = rounds.filter(round => !restoredIds.has(round.roundId)).map(round => round.roundId);
      for (const match of state.matches) {
        const round = roundById.get(match.id);
        const fields = Object.hasOwn(scoreHold.queueRecovery, match.id) ? scoreHold.queueRecovery[match.id] : {};
        if (!round || await signature({ ...match, ...fields }) !== round.canonicalSha256) {
          return refuse('round-readback-mismatch');
        }
      }
      if (stopped()) return refuse('interrupted');
      step = 'S7';
      let backup = 'verified';
      try { write(restoreKeys.backup, stateText); }
      catch (error) {
        if (error?.name !== 'QuotaExceededError' || storage.getItem(restoreKeys.backup) !== null) throw error;
        backup = 'quota-unavailable';
      }
      if (stopped()) return refuse('interrupted');
      step = 'S8';
      const restoredValues = { ...values, [restoreKeys.state]: stateText, [restoreKeys.backup]: stateText };
      const stateHash = leftInFile.length ? await sha256Hex(stateText) : marker.expected[restoreKeys.state];
      if (Object.entries(restoredValues).some(([key, value]) => key === restoreKeys.backup && backup === 'quota-unavailable'
        ? storage.getItem(key) !== null : storage.getItem(key) !== value)) return refuse('restore-readback-mismatch');
      const completed = {
        ...marker, phase: 'restored-verified', completedAt: now(),
        expected: { ...marker.expected, [restoreKeys.state]: stateHash, [restoreKeys.backup]: stateHash },
        results: { rounds: state.matches.length, receipts: receipts.length, backup,
          ...(leftInFile.length ? { leftInFile } : {}) },
      };
      if (!validateMarker(completed)) return refuse('invalid-completion-marker');
      write(restoreKeys.marker, JSON.stringify(completed), markerText);
      return { ok: true, step, marker: completed };
    } catch (error) {
      return refuse(error?.name === 'QuotaExceededError' ? 'quota-exceeded' : error?.message || 'restore-failed');
    }
  }

  return {
    canonical, sha256Hex, buildRecoveryFile, serialize, parseRecoveryFile, verifyRecoveryFile,
    restoreKeys, planRestore, executeRestorePlan, validateHoldRecord, validateMarker, restorePriority, acceptedLedgerReport,
  };
});
