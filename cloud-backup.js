/* Pure cloud backup and restore support for The Dye Ledger. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DyeLedgerCloudBackup = api;
})(globalThis, function () {
  'use strict';

  const INDEX_KEY = 'the-dye-ledger-v20:cloud-backup-index:v1';
  const MAX_PAYLOAD_BYTES = 1048576;
  const STAGING_PROJECT_REF = 'darbakmabpbkikisadop';
  const encoder = new TextEncoder();
  const messages = {
    SIGN_IN_REQUIRED: 'Sign in with your account to use cloud backup.',
    RECOVERY_PROFILE: 'Cloud backup is unavailable in a recovery profile.',
    NOT_LOCAL: 'Only rounds saved on this device can be backed up.',
    NOT_COMPLETE: 'Only completed rounds can be backed up.',
    TRIP_OR_EVENT_ROUND: 'Trip and event rounds cannot be backed up yet.',
    NOT_FROZEN: 'This round has no final record yet.',
    LEDGER_NOT_ACCEPTED: 'Accept the Ledger Entry before backing up.',
    COURSE_SNAPSHOT_MISSING: 'This round is missing its course details.',
    PENDING_SYNC: 'This round still has scores waiting to sync or for review.',
    PENDING_LEDGER: 'This round has a Ledger Entry change waiting.',
    PLAYER_RECORD_MISSING: 'A golfer in this round is missing from this device.',
    NON_FINITE_VALUE: 'This round contains a value that cannot be backed up exactly.',
    BACKUP_TOO_LARGE: 'This round is too large to back up.',
    BACKUP_LIMIT_REACHED: 'Cloud backup limit reached (100 rounds).',
    ROUND_CHANGED: 'This round changed after it was backed up.',
    NETWORK_ERROR: 'Network problem. Check the connection and tap Back up again.',
    READBACK_MISMATCH: 'The cloud copy could not be verified.',
    READBACK_MISSING: 'The cloud copy was not found during verification.',
    SOURCE_CHANGED_DURING_BACKUP: 'This round changed while it was being backed up.',
    INVALID_SERVER_RESPONSE: 'The cloud service returned an invalid response.',
    SERVER_ERROR: 'The cloud service could not complete the request.',
    DURABLE_ACCOUNT_REQUIRED: 'Sign in with a permanent account to use cloud backup.',
    INVALID_BACKUP_INPUT: 'This round could not be accepted for cloud backup.',
    BACKUP_HASH_MISMATCH: 'The cloud service rejected the backup integrity check.',
    BACKUP_VERSION_UNAVAILABLE: 'The cloud backup version is unavailable.',
    INDEX_WRITE_FAILED: 'The verified backup could not be recorded on this device.',
    ALREADY_ON_DEVICE: 'This round is already on this device.',
    VERSION_NOT_FOUND: 'This cloud backup version was not found.',
    RESTORE_HASH_MISMATCH: 'The cloud restore failed its integrity check.',
    RESTORE_PAYLOAD_INVALID: 'The cloud restore contains invalid round data.',
    ROUND_ID_MISMATCH: 'The cloud round ID does not match the requested round.',
    PLAYER_IDENTITY_CONFLICT: 'A golfer on this device has the same ID but a different name.',
    RESTORE_SAVE_FAILED: 'The restored round could not be saved.',
    RESTORE_VERIFY_FAILED: 'The restored round could not be verified after saving.',
  };

  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const failure = code => ({ ok: false, code, message: errorMessage(code) });

  function errorMessage(code) {
    return messages[code] || 'Cloud backup could not complete the request.';
  }

  function isFeatureEnabled(config) {
    try {
      return config?.cloudBackup?.enabled === true
        && config?.accountAuth?.environment === 'staging'
        && String(config?.accountAuth?.expectedProjectRef).toLowerCase() === STAGING_PROJECT_REF
        && new URL(config?.url).hostname === STAGING_PROJECT_REF + '.supabase.co';
    } catch {
      return false;
    }
  }

  function structureCode(match) {
    if (match?.storageMode !== 'local') return 'NOT_LOCAL';
    if (match?.status !== 'complete') return 'NOT_COMPLETE';
    if (match?.tripId || match?.eventId) return 'TRIP_OR_EVENT_ROUND';
    const record = match?.roundRecordSnapshot;
    if (!record?.schemaVersion || record.isFrozen !== true || !record.frozenAt
      || record?.meta?.roundId !== match?.id
      || record?.finalizationReceipt?.roundId !== match?.id) return 'NOT_FROZEN';
    const ledger = match?.ledgerEntrySnapshot;
    if (ledger?.status !== 'accepted' || !ledger.acceptedAt
      || ledger?.report?.meta?.roundId !== match?.id
      || ledger?.report?.meta?.status !== 'final') return 'LEDGER_NOT_ACCEPTED';
    if (!match?.courseSnapshot || !Array.isArray(match.courseSnapshot.tees)
      || match.courseSnapshot.tees.length === 0
      || !record?.meta?.courseSnapshot || !record?.meta?.teeSnapshot) {
      return 'COURSE_SNAPSHOT_MISSING';
    }
    return null;
  }

  function checkEligibility(match, ctx) {
    if (!ctx?.user?.id || ctx.user.is_anonymous !== false) return failure('SIGN_IN_REQUIRED');
    if (ctx?.recoveryGuardActive === true) return failure('RECOVERY_PROFILE');
    const structural = structureCode(match);
    if (structural) return failure(structural);
    const id = match.id;
    const rows = [...(ctx?.outbox?.operations || []), ...(ctx?.outbox?.preservedForHostReview || [])];
    if (rows.some(row => String(row?.matchId) === id)
      || (ctx?.reviewReceiptRoundIds || []).includes(id)) return failure('PENDING_SYNC');
    if ((ctx?.pendingLedgerRoundIds || []).includes(id)) return failure('PENDING_LEDGER');
    const ids = (match.players || []).map(row => row?.playerId)
      .filter(value => typeof value === 'string' && value.length > 0);
    if (ids.some(playerId => !(ctx?.state?.players || []).some(row => row?.id === playerId))) {
      return failure('PLAYER_RECORD_MISSING');
    }
    return { ok: true };
  }

  function containsUnsupported(value, inArray, seen) {
    const type = typeof value;
    if (type === 'number') return !Number.isFinite(value);
    if (type === 'function' || type === 'symbol' || type === 'bigint') return true;
    if (value === undefined) return inArray;
    if (value === null || type !== 'object') return false;
    if (seen.has(value)) return true;
    seen.add(value);
    const invalid = Array.isArray(value)
      ? value.some(item => containsUnsupported(item, true, seen))
      : Object.keys(value).some(key => containsUnsupported(value[key], false, seen));
    seen.delete(value);
    return invalid;
  }

  function selectedPlayers(match, state) {
    const ids = new Set((match?.players || []).map(row => row?.playerId)
      .filter(value => typeof value === 'string' && value.length > 0));
    return {
      players: (state?.players || []).filter(row => ids.has(row?.id))
        .slice().sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)),
      registry: (state?.playerRegistry?.players || []).filter(row => ids.has(row?.playerId))
        .slice().sort((a, b) => (String(a.playerId) < String(b.playerId) ? -1 : String(a.playerId) > String(b.playerId) ? 1 : 0)),
    };
  }

  async function buildPayload(match, state, recoveryFile) {
    const players = selectedPlayers(match, state);
    if (containsUnsupported(match, false, new Set())
      || containsUnsupported(players, false, new Set())) return failure('NON_FINITE_VALUE');
    const roundCanonical = recoveryFile.canonical(match);
    const playersCanonical = recoveryFile.canonical(players);
    const bytes = encoder.encode(roundCanonical).byteLength + encoder.encode(playersCanonical).byteLength;
    if (bytes > MAX_PAYLOAD_BYTES) return failure('BACKUP_TOO_LARGE');
    const [roundSha256, playersSha256] = await Promise.all([
      recoveryFile.sha256Hex(roundCanonical),
      recoveryFile.sha256Hex(playersCanonical),
    ]);
    return { ok: true, roundCanonical, playersCanonical, roundSha256, playersSha256, bytes };
  }

  function emptyIndex() {
    return { schemaVersion: 1, accounts: {} };
  }

  function readIndex(storage, ownerId) {
    let text;
    try {
      text = storage.getItem(INDEX_KEY);
    } catch {
      return { ok: false, unavailable: true, entries: {} };
    }
    if (text === null) return { ok: true, entries: {} };
    try {
      const index = JSON.parse(text);
      if (!isRecord(index) || index.schemaVersion !== 1 || !isRecord(index.accounts)) throw new Error();
      const account = index.accounts[ownerId];
      if (account !== undefined && !isRecord(account)) throw new Error();
      return { ok: true, entries: account || {} };
    } catch {
      return { ok: false, corrupt: true, entries: {} };
    }
  }

  function writeIndexEntry(storage, ownerId, localRoundId, entry) {
    let index = emptyIndex();
    try {
      const text = storage.getItem(INDEX_KEY);
      if (text !== null) {
        const parsed = JSON.parse(text);
        if (isRecord(parsed) && parsed.schemaVersion === 1 && isRecord(parsed.accounts)) index = parsed;
      }
    } catch {
      index = emptyIndex();
    }
    const account = isRecord(index.accounts[ownerId]) ? index.accounts[ownerId] : {};
    index.accounts[ownerId] = { ...account, [localRoundId]: entry };
    try {
      storage.setItem(INDEX_KEY, JSON.stringify(index));
      return { ok: true };
    } catch {
      return { ok: false, code: 'INDEX_WRITE_FAILED' };
    }
  }

  function findIndexEntryByCloudRoundId(storage, ownerId, cloudRoundId) {
    const result = readIndex(storage, ownerId);
    if (!result.ok) return null;
    const found = Object.entries(result.entries)
      .find(([, entry]) => entry?.cloudRoundId === cloudRoundId);
    return found ? found[0] : null;
  }

  function computeStatus({ indexResult, entry, currentRoundSha256, inProgress, lastFailure }) {
    if (inProgress) return { status: 'in-progress', label: 'Backing up…' };
    if (lastFailure) {
      return { status: 'failed', label: 'Backup not verified: ' + errorMessage(lastFailure) };
    }
    if (!indexResult?.ok) return { status: 'unknown', label: 'Unknown, check cloud' };
    if (!entry) return { status: 'not-backed-up', label: 'Not backed up' };
    if (entry.roundSha256 === currentRoundSha256) {
      return { status: 'verified', label: 'Backed up (verified)' };
    }
    return { status: 'changed', label: 'Changed since backup' };
  }

  function mapServerError(error) {
    const message = String(error?.message || '');
    const text = message + ' ' + String(error?.details || '') + ' ' + String(error?.hint || '');
    const tokens = [
      'DURABLE_ACCOUNT_REQUIRED', 'INVALID_BACKUP_INPUT', 'BACKUP_TOO_LARGE',
      'BACKUP_HASH_MISMATCH', 'BACKUP_LIMIT_REACHED', 'ROUND_CHANGED',
      'BACKUP_VERSION_UNAVAILABLE',
    ];
    const token = tokens.find(value => text.includes(value));
    if (token) return token;
    if (error?.code === 'PGRST301' || /JWT/i.test(message)) return 'SIGN_IN_REQUIRED';
    if (error?.name === 'TypeError' || /fetch|network|Failed to fetch|timeout/i.test(message)) {
      return 'NETWORK_ERROR';
    }
    return 'SERVER_ERROR';
  }

  async function request(operation) {
    try {
      const result = await operation();
      if (result?.error) return failure(mapServerError(result.error));
      return { ok: true, data: result?.data };
    } catch (error) {
      return failure(mapServerError(error));
    }
  }

  function versionQuery(client, cloudRoundId, version) {
    return client.from('round_backup_versions')
      .select('cloud_round_id,version_number,round_canonical,players_canonical,round_sha256,players_sha256')
      .eq('cloud_round_id', cloudRoundId).eq('version_number', version).maybeSingle();
  }

  async function backupRound(args) {
    const eligible = checkEligibility(args.match, args.ctx);
    if (!eligible.ok) return eligible;
    const payload = await buildPayload(args.match, args.ctx.state, args.recoveryFile);
    if (!payload.ok) return payload;
    const rpc = await request(() => args.client.rpc('backup_round', {
      local_round_id: args.match.id,
      round_canonical: payload.roundCanonical,
      players_canonical: payload.playersCanonical,
      round_sha256: payload.roundSha256,
      players_sha256: payload.playersSha256,
      app_version: args.appVersion,
    }));
    if (!rpc.ok) return rpc;
    const row = Array.isArray(rpc.data) ? rpc.data[0] : null;
    if (!row?.cloud_round_id || row.version_number === undefined) {
      return failure('INVALID_SERVER_RESPONSE');
    }
    const readback = await request(() => versionQuery(args.client, row.cloud_round_id, row.version_number));
    if (!readback.ok) return readback;
    if (!readback.data) return failure('READBACK_MISSING');
    const downloaded = readback.data;
    const [roundHash, playersHash] = await Promise.all([
      args.recoveryFile.sha256Hex(downloaded.round_canonical),
      args.recoveryFile.sha256Hex(downloaded.players_canonical),
    ]);
    const current = args.getCurrentMatch();
    if (!current) return failure('SOURCE_CHANGED_DURING_BACKUP');
    const currentHash = await args.recoveryFile.sha256Hex(args.recoveryFile.canonical(current));
    if (currentHash !== payload.roundSha256) return failure('SOURCE_CHANGED_DURING_BACKUP');
    if (roundHash !== downloaded.round_sha256 || roundHash !== payload.roundSha256
      || playersHash !== downloaded.players_sha256
      || playersHash !== row.stored_players_sha256) return failure('READBACK_MISMATCH');
    const entry = {
      cloudRoundId: row.cloud_round_id,
      version: row.version_number,
      roundSha256: payload.roundSha256,
      playersSha256: row.stored_players_sha256,
      verifiedAt: args.now(),
      appVersion: args.appVersion,
    };
    const written = writeIndexEntry(args.storage, args.ctx.user.id, args.match.id, entry);
    return {
      ok: true,
      entry,
      created: row.created === true,
      playersDrift: row.stored_players_sha256 !== payload.playersSha256,
      indexWritten: written.ok,
    };
  }

  async function listCloudRounds({ client }) {
    const result = await request(() => client.from('round_backups')
      .select('cloud_round_id,local_round_id,created_at')
      .order('created_at', { ascending: false }));
    if (!result.ok) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      ok: true,
      rounds: rows.map(row => ({
        cloudRoundId: row.cloud_round_id,
        localRoundId: row.local_round_id,
        createdAt: row.created_at,
      })),
    };
  }

  // These display labels are not hash-verified; restore (planRestore) still verifies hashes in full.
  async function describeCloudRounds({ client, cloudRoundIds }) {
    const ids = [];
    const seen = new Set();
    for (const value of Array.isArray(cloudRoundIds) ? cloudRoundIds : []) {
      if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
    }
    if (!ids.length) return { ok: true, rounds: [] };
    const labels = new Map();
    for (let index = 0; index < ids.length; index += 20) {
      const chunk = ids.slice(index, index + 20);
      const result = await request(() => client.from('round_backup_versions')
        .select('cloud_round_id,round_canonical')
        .eq('version_number', 1)
        .in('cloud_round_id', chunk));
      if (!result.ok) return result;
      for (const row of Array.isArray(result.data) ? result.data : []) {
        if (!chunk.includes(row?.cloud_round_id)) continue;
        let match;
        try {
          match = JSON.parse(row.round_canonical);
        } catch {
          continue;
        }
        if (!isRecord(match)) continue;
        const text = value => typeof value === 'string' ? value.trim() : '';
        const tee = Array.isArray(match.courseSnapshot?.tees)
          ? match.courseSnapshot.tees.find(value => value?.id === match.teeId)
          : null;
        labels.set(row.cloud_round_id, {
          cloudRoundId: row.cloud_round_id,
          name: text(match.name),
          date: text(match.date),
          courseName: text(match.courseSnapshot?.name),
          teeName: text(tee?.teeName),
        });
      }
    }
    return { ok: true, rounds: ids.map(id => labels.get(id)).filter(Boolean) };
  }

  async function planRestore(args) {
    if (!args?.ctx?.user?.id || args.ctx.user.is_anonymous !== false) return failure('SIGN_IN_REQUIRED');
    if (args.ctx.recoveryGuardActive === true) return failure('RECOVERY_PROFILE');
    const matches = args.ctx?.state?.matches || [];
    const mapped = findIndexEntryByCloudRoundId(args.storage, args.ctx.user.id, args.cloudRoundId);
    if (matches.some(match => match?.id === args.localRoundId)
      || (mapped && matches.some(match => match?.id === mapped))) return failure('ALREADY_ON_DEVICE');
    const result = await request(() => versionQuery(args.client, args.cloudRoundId, 1));
    if (!result.ok) return result;
    if (!result.data) return failure('VERSION_NOT_FOUND');
    const row = result.data;
    const [roundHash, playersHash] = await Promise.all([
      args.recoveryFile.sha256Hex(row.round_canonical),
      args.recoveryFile.sha256Hex(row.players_canonical),
    ]);
    if (roundHash !== row.round_sha256 || playersHash !== row.players_sha256) {
      return failure('RESTORE_HASH_MISMATCH');
    }
    let match;
    let payload;
    try {
      match = JSON.parse(row.round_canonical);
      payload = JSON.parse(row.players_canonical);
      if (args.recoveryFile.canonical(match) !== row.round_canonical) throw new Error();
    } catch {
      return failure('RESTORE_PAYLOAD_INVALID');
    }
    if (match?.id !== args.localRoundId) return failure('ROUND_ID_MISMATCH');
    if (structureCode(match)) return failure('RESTORE_PAYLOAD_INVALID');
    if (!isRecord(payload) || !Array.isArray(payload.players) || !Array.isArray(payload.registry)) {
      return failure('RESTORE_PAYLOAD_INVALID');
    }
    const devicePlayers = args.ctx?.state?.players || [];
    const deviceRegistry = args.ctx?.state?.playerRegistry?.players || [];
    const playersToAdd = [];
    const registryToAdd = [];
    const notes = [];
    for (const player of payload.players) {
      if (!player || typeof player.id !== 'string' || player.id.length === 0) {
        return failure('RESTORE_PAYLOAD_INVALID');
      }
      const existing = devicePlayers.find(row => row?.id === player.id);
      if (!existing) {
        playersToAdd.push(player);
        const registry = payload.registry.find(row => row?.playerId === player.id);
        if (registry && !deviceRegistry.some(row => row?.playerId === player.id)) registryToAdd.push(registry);
      } else if (String(existing.name) !== String(player.name)) {
        return failure('PLAYER_IDENTITY_CONFLICT');
      } else {
        notes.push({
          playerId: player.id,
          kind: 'kept-existing',
          differs: args.recoveryFile.canonical(existing) !== args.recoveryFile.canonical(player),
        });
      }
    }
    const covered = new Set([...devicePlayers, ...payload.players].map(player => player?.id));
    if ((match.players || []).some(player => !covered.has(player?.playerId))) {
      return failure('RESTORE_PAYLOAD_INVALID');
    }
    return {
      ok: true,
      plan: {
        match,
        roundCanonical: row.round_canonical,
        roundSha256: row.round_sha256,
        playersToAdd,
        registryToAdd,
        notes,
        entry: {
          cloudRoundId: args.cloudRoundId,
          version: 1,
          roundSha256: row.round_sha256,
          playersSha256: row.players_sha256,
          verifiedAt: null,
          appVersion: null,
        },
      },
    };
  }

  function applyRestorePlan(state, plan) {
    const next = JSON.parse(JSON.stringify(state));
    next.matches = [...(next.matches || []), plan.match];
    next.players = [...(next.players || []), ...plan.playersToAdd];
    if (!isRecord(next.playerRegistry)) next.playerRegistry = { schemaVersion: 1, players: [] };
    next.playerRegistry.players = [
      ...(Array.isArray(next.playerRegistry.players) ? next.playerRegistry.players : []),
      ...plan.registryToAdd,
    ];
    return next;
  }

  async function executeRestore(args) {
    const next = applyRestorePlan(args.state, args.plan);
    let saved;
    try {
      saved = await args.commit(next);
    } catch {
      return failure('RESTORE_SAVE_FAILED');
    }
    if (!saved?.ok) return failure('RESTORE_SAVE_FAILED');
    let reread;
    try {
      reread = await args.readBack();
    } catch {
      reread = null;
    }
    const restored = reread?.matches?.find(match => match?.id === args.plan.match.id);
    const hash = restored
      ? await args.recoveryFile.sha256Hex(args.recoveryFile.canonical(restored))
      : null;
    if (hash !== args.plan.roundSha256) {
      try {
        await args.commit(args.state);
      } catch {
      }
      return failure('RESTORE_VERIFY_FAILED');
    }
    const written = writeIndexEntry(args.storage, args.ownerId, args.plan.match.id, {
      ...args.plan.entry,
      verifiedAt: args.now(),
    });
    return { ok: true, notes: args.plan.notes, indexWritten: written.ok };
  }

  return Object.freeze({
    INDEX_KEY,
    MAX_PAYLOAD_BYTES,
    STAGING_PROJECT_REF,
    isFeatureEnabled,
    checkEligibility,
    buildPayload,
    readIndex,
    writeIndexEntry,
    findIndexEntryByCloudRoundId,
    computeStatus,
    backupRound,
    mapServerError,
    listCloudRounds,
    describeCloudRounds,
    planRestore,
    applyRestorePlan,
    executeRestore,
    errorMessage,
  });
});
