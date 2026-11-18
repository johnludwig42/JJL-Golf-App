import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import '../recovery-file.js';
import '../cloud-backup.js';

const recoveryFile = globalThis.DyeLedgerRecoveryFile;
const cloud = globalThis.DyeLedgerCloudBackup;
const fixedNow = () => '2026-11-17T12:00:00.000Z';
const hash = text => createHash('sha256').update(text).digest('hex');

function makeRound(id = 'r1') {
  return {
    id,
    storageMode: 'local',
    status: 'complete',
    players: [{ playerId: 'p1' }, { playerId: 'p2' }],
    courseSnapshot: { tees: [{ id: 't1' }] },
    roundRecordSnapshot: {
      schemaVersion: 1,
      isFrozen: true,
      frozenAt: '2026-11-01T18:00:00.000Z',
      meta: {
        roundId: id,
        courseSnapshot: { id: 'c1' },
        teeSnapshot: { id: 't1' },
      },
      finalizationReceipt: { roundId: id },
    },
    ledgerEntrySnapshot: {
      status: 'accepted',
      acceptedAt: '2026-11-01T18:01:00.000Z',
      report: { meta: { roundId: id, status: 'final', story: 'x' } },
    },
  };
}

function makeState(match = makeRound()) {
  return {
    players: [
      { id: 'p1', name: 'Ada', index: 5 },
      { id: 'p2', name: 'Ben', index: 8 },
      { id: 'unused', name: 'Unused', index: 20 },
    ],
    playerRegistry: {
      schemaVersion: 1,
      players: [
        { playerId: 'p2', color: 'blue' },
        { playerId: 'p1', color: 'red' },
        { playerId: 'unused', color: 'gray' },
      ],
    },
    matches: [match],
  };
}

function makeCtx(match = makeRound(), user = { id: 'owner-1', is_anonymous: false }) {
  return {
    state: makeState(match),
    user,
    recoveryGuardActive: false,
    outbox: { operations: [], preservedForHostReview: [] },
    reviewReceiptRoundIds: [],
    pendingLedgerRoundIds: [],
  };
}

class Storage {
  constructor() {
    this.map = new Map();
    this.failSet = false;
    this.writes = [];
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    if (this.failSet) throw new Error('quota');
    this.writes.push(key);
    this.map.set(key, String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}

class FakeServer {
  constructor() {
    this.backups = [];
    this.versions = [];
    this.fault = null;
    this.hashMismatches = 0;
    this.sequence = 0;
    this.describeQueries = 0;
  }

  client(user) {
    const server = this;
    return {
      async rpc(name, params) {
        assert.equal(name, 'backup_round');
        if (server.fault === 'offline') {
          server.fault = null;
          throw new TypeError('Failed to fetch');
        }
        if (!user?.id || user.is_anonymous !== false) {
          return { data: null, error: { message: 'DURABLE_ACCOUNT_REQUIRED' } };
        }
        if (hash(params.round_canonical) !== params.round_sha256
          || hash(params.players_canonical) !== params.players_sha256) {
          server.hashMismatches++;
          return { data: null, error: { message: 'BACKUP_HASH_MISMATCH' } };
        }
        if (Buffer.byteLength(params.round_canonical) + Buffer.byteLength(params.players_canonical)
          > cloud.MAX_PAYLOAD_BYTES) {
          return { data: null, error: { message: 'BACKUP_TOO_LARGE' } };
        }
        let backup = server.backups.find(row => row.owner === user.id
          && row.local_round_id === params.local_round_id);
        let created = false;
        if (!backup) {
          if (server.backups.filter(row => row.owner === user.id).length >= 100) {
            return { data: null, error: { message: 'BACKUP_LIMIT_REACHED' } };
          }
          backup = {
            owner: user.id,
            cloud_round_id: 'cloud-' + (++server.sequence),
            local_round_id: params.local_round_id,
            created_at: '2026-11-16T12:00:00.000Z',
          };
          server.backups.push(backup);
          server.versions.push({
            owner: user.id,
            cloud_round_id: backup.cloud_round_id,
            version_number: 1,
            round_canonical: params.round_canonical,
            players_canonical: params.players_canonical,
            round_sha256: params.round_sha256,
            players_sha256: params.players_sha256,
          });
          created = true;
        }
        const version = server.versions.find(row => row.cloud_round_id === backup.cloud_round_id);
        if (version.round_sha256 !== params.round_sha256) {
          return { data: null, error: { message: 'ROUND_CHANGED' } };
        }
        const data = [{
          cloud_round_id: backup.cloud_round_id,
          version_number: 1,
          created,
          stored_players_sha256: version.players_sha256,
        }];
        if (server.fault === 'timeout-after-commit') {
          server.fault = null;
          throw new TypeError('timeout');
        }
        return { data, error: null };
      },
      from(table) {
        const filters = {};
        let ordered = false;
        const builder = {
          select() {
            return builder;
          },
          eq(column, value) {
            filters[column] = value;
            return builder;
          },
          in(column, values) {
            filters[column] = { in: values };
            return builder;
          },
          async maybeSingle() {
            if (server.fault === 'readback-offline' || server.fault === 'offline') {
              server.fault = null;
              throw new TypeError('Failed to fetch');
            }
            if (table !== 'round_backup_versions') return { data: null, error: null };
            const backup = server.backups.find(row => row.owner === user?.id
              && row.cloud_round_id === filters.cloud_round_id);
            if (!backup) return { data: null, error: null };
            const row = server.versions.find(value => value.cloud_round_id === filters.cloud_round_id
              && value.version_number === filters.version_number);
            return { data: row || null, error: null };
          },
          order() {
            ordered = true;
            return Promise.resolve({
              data: server.backups.filter(row => row.owner === user?.id)
                .slice().sort((a, b) => b.created_at.localeCompare(a.created_at)),
              error: null,
            });
          },
          then(resolve, reject) {
            if (!ordered) {
              if (table !== 'round_backup_versions') {
                return Promise.resolve({ data: [], error: null }).then(resolve, reject);
              }
              server.describeQueries++;
              if (server.fault === 'describe-error') {
                server.fault = null;
                return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve, reject);
              }
              const rows = server.versions.filter(row => row.owner === user?.id
                && Object.entries(filters).every(([key, value]) =>
                  value && Array.isArray(value.in)
                    ? value.in.includes(row[key])
                    : row[key] === value))
                .map(row => ({
                  cloud_round_id: row.cloud_round_id,
                  round_canonical: row.round_canonical,
                }));
              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            }
            return undefined;
          },
        };
        return builder;
      },
    };
  }
}

function backupArgs(server, match = makeRound(), ctx = makeCtx(match), storage = new Storage()) {
  return {
    match,
    ctx,
    client: server.client(ctx.user),
    storage,
    appVersion: '20.0.0',
    recoveryFile,
    getCurrentMatch: () => match,
    now: fixedNow,
  };
}

test('isFeatureEnabled allows only the explicit staging project', () => {
  const staging = {
    url: 'https://darbakmabpbkikisadop.supabase.co',
    accountAuth: { environment: 'staging', expectedProjectRef: 'DARBAKMABPBKIKISADOP' },
  };
  assert.equal(cloud.isFeatureEnabled({
    url: 'https://ueallqqmdyzwdlmoyxfo.supabase.co',
    cloudBackup: { enabled: true },
    accountAuth: { environment: 'production', expectedProjectRef: 'ueallqqmdyzwdlmoyxfo' },
  }), false);
  assert.equal(cloud.isFeatureEnabled(staging), false);
  assert.equal(cloud.isFeatureEnabled({ ...staging, cloudBackup: { enabled: true } }), true);
  assert.equal(cloud.isFeatureEnabled({
    ...staging,
    url: 'https://example.com',
    cloudBackup: { enabled: true },
  }), false);
});

test('eligibility returns all refusal codes in precedence order and accepts a valid round', () => {
  const cases = [
    ['SIGN_IN_REQUIRED', (match, ctx) => { ctx.user = null; }],
    ['RECOVERY_PROFILE', (match, ctx) => { ctx.recoveryGuardActive = true; }],
    ['NOT_LOCAL', match => { match.storageMode = 'cloud'; }],
    ['NOT_COMPLETE', match => { match.status = 'active'; }],
    ['TRIP_OR_EVENT_ROUND', match => { match.tripId = 'trip'; }],
    ['NOT_FROZEN', match => { match.roundRecordSnapshot.isFrozen = false; }],
    ['LEDGER_NOT_ACCEPTED', match => { match.ledgerEntrySnapshot.status = 'draft'; }],
    ['COURSE_SNAPSHOT_MISSING', match => { match.courseSnapshot.tees = []; }],
    ['PENDING_SYNC', (match, ctx) => { ctx.outbox.operations.push({ matchId: match.id }); }],
    ['PENDING_LEDGER', (match, ctx) => { ctx.pendingLedgerRoundIds.push(match.id); }],
    ['PLAYER_RECORD_MISSING', (match, ctx) => { ctx.state.players = ctx.state.players.slice(0, 1); }],
  ];
  for (const [code, mutate] of cases) {
    const match = makeRound();
    const ctx = makeCtx(match);
    mutate(match, ctx);
    assert.equal(cloud.checkEligibility(match, ctx).code, code);
  }
  assert.deepEqual(cloud.checkEligibility(makeRound(), makeCtx()), { ok: true });
});

test('buildPayload validates exact values, filtering, sorting, hashes, and size', async () => {
  for (const value of [NaN, Infinity]) {
    const match = makeRound();
    match.bad = value;
    assert.equal((await cloud.buildPayload(match, makeState(match), recoveryFile)).code, 'NON_FINITE_VALUE');
  }
  const match = makeRound();
  match.bad = [undefined];
  assert.equal((await cloud.buildPayload(match, makeState(match), recoveryFile)).code, 'NON_FINITE_VALUE');
  delete match.bad;
  const payload = await cloud.buildPayload(match, makeState(match), recoveryFile);
  assert.equal(payload.roundSha256, hash(payload.roundCanonical));
  assert.equal(payload.playersSha256, hash(payload.playersCanonical));
  const players = JSON.parse(payload.playersCanonical);
  assert.deepEqual(players.players.map(row => row.id), ['p1', 'p2']);
  assert.deepEqual(players.registry.map(row => row.playerId), ['p1', 'p2']);
  match.large = 'x'.repeat(cloud.MAX_PAYLOAD_BYTES);
  assert.equal((await cloud.buildPayload(match, makeState(match), recoveryFile)).code, 'BACKUP_TOO_LARGE');
});

test('backupRound verifies a fresh read and writes only the index without mutation', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const ctx = makeCtx(match);
  const storage = new Storage();
  const beforeMatch = structuredClone(match);
  const beforeState = structuredClone(ctx.state);
  const result = await cloud.backupRound(backupArgs(server, match, ctx, storage));
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(server.backups.length, 1);
  assert.equal(server.versions.length, 1);
  assert.deepEqual(storage.writes, [cloud.INDEX_KEY]);
  const index = cloud.readIndex(storage, ctx.user.id);
  assert.equal(Object.keys(index.entries).length, 1);
  assert.equal(cloud.computeStatus({
    indexResult: index,
    entry: index.entries[match.id],
    currentRoundSha256: result.entry.roundSha256,
  }).status, 'verified');
  assert.deepEqual(match, beforeMatch);
  assert.deepEqual(ctx.state, beforeState);
});

test('retry matrix remains idempotent across pre-commit and post-commit failures', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const ctx = makeCtx(match);
  const storage = new Storage();
  const faults = [null, 'offline', 'timeout-after-commit', 'readback-offline', null, null];
  const results = [];
  for (const fault of faults) {
    server.fault = fault;
    results.push(await cloud.backupRound(backupArgs(server, match, ctx, storage)));
  }
  assert.equal(results.at(-1).ok, true);
  assert.equal(results.at(-1).created, false);
  assert.equal(server.backups.length, 1);
  assert.equal(server.versions.length, 1);
  assert.equal(server.hashMismatches, 0);
  assert.equal(Object.keys(cloud.readIndex(storage, ctx.user.id).entries).length, 1);
});

test('players drift keeps the original server snapshot on retry', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const ctx = makeCtx(match);
  const storage = new Storage();
  const first = await cloud.backupRound(backupArgs(server, match, ctx, storage));
  ctx.state.players[0].index = 2;
  const second = await cloud.backupRound(backupArgs(server, match, ctx, storage));
  assert.equal(second.ok, true);
  assert.equal(second.playersDrift, true);
  assert.equal(second.entry.playersSha256, first.entry.playersSha256);
  assert.equal(server.versions.length, 1);
});

test('a changed round is refused and status reports changed', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const ctx = makeCtx(match);
  const storage = new Storage();
  const first = await cloud.backupRound(backupArgs(server, match, ctx, storage));
  const writes = storage.writes.length;
  match.extra = 'changed';
  const result = await cloud.backupRound(backupArgs(server, match, ctx, storage));
  assert.equal(result.code, 'ROUND_CHANGED');
  assert.equal(storage.writes.length, writes);
  assert.equal(cloud.computeStatus({
    indexResult: cloud.readIndex(storage, ctx.user.id),
    entry: cloud.readIndex(storage, ctx.user.id).entries[match.id],
    currentRoundSha256: hash(recoveryFile.canonical(match)),
  }).status, 'changed');
  assert.equal(first.ok, true);
});

test('the owner cap refuses new rounds but permits an existing retry', async () => {
  const server = new FakeServer();
  const owner = { id: 'owner-1', is_anonymous: false };
  for (let index = 0; index < 100; index++) {
    server.backups.push({
      owner: owner.id,
      cloud_round_id: 'seed-' + index,
      local_round_id: 'seed-round-' + index,
      created_at: fixedNow(),
    });
  }
  const existing = makeRound('seed-round-0');
  const payload = await cloud.buildPayload(existing, makeState(existing), recoveryFile);
  server.versions.push({
    owner: owner.id,
    cloud_round_id: 'seed-0',
    version_number: 1,
    round_canonical: payload.roundCanonical,
    players_canonical: payload.playersCanonical,
    round_sha256: payload.roundSha256,
    players_sha256: payload.playersSha256,
  });
  assert.equal((await cloud.backupRound(backupArgs(server, makeRound('new')))).code, 'BACKUP_LIMIT_REACHED');
  assert.equal((await cloud.backupRound(backupArgs(server, existing, makeCtx(existing)))).ok, true);
});

test('corrupt cloud text fails read-back integrity without an index write', async () => {
  const server = new FakeServer();
  const original = server.client({ id: 'owner-1', is_anonymous: false }).rpc;
  const client = server.client({ id: 'owner-1', is_anonymous: false });
  client.rpc = async (...args) => {
    const result = await original(...args);
    server.versions[0].round_canonical += ' ';
    return result;
  };
  const match = makeRound();
  const ctx = makeCtx(match);
  const storage = new Storage();
  const result = await cloud.backupRound({ ...backupArgs(server, match, ctx, storage), client });
  assert.equal(result.code, 'READBACK_MISMATCH');
  assert.equal(storage.length, 0);
});

test('source changes during backup are detected', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const changed = structuredClone(match);
  changed.extra = true;
  const result = await cloud.backupRound({
    ...backupArgs(server, match),
    getCurrentMatch: () => changed,
  });
  assert.equal(result.code, 'SOURCE_CHANGED_DURING_BACKUP');
});

test('index corruption, isolation, and write failure are handled', async () => {
  const storage = new Storage();
  storage.map.set(cloud.INDEX_KEY, '{bad');
  const corrupt = cloud.readIndex(storage, 'owner-1');
  assert.equal(corrupt.corrupt, true);
  assert.equal(cloud.computeStatus({ indexResult: corrupt }).status, 'unknown');
  storage.map.clear();
  cloud.writeIndexEntry(storage, 'owner-1', 'r1', { cloudRoundId: 'c1' });
  assert.deepEqual(cloud.readIndex(storage, 'owner-2').entries, {});
  const failing = new Storage();
  failing.failSet = true;
  assert.equal(cloud.writeIndexEntry(failing, 'owner-1', 'r1', {}).code, 'INDEX_WRITE_FAILED');
  const result = await cloud.backupRound(backupArgs(new FakeServer(), makeRound(), makeCtx(), failing));
  assert.equal(result.ok, true);
  assert.equal(result.indexWritten, false);
});

test('restore plans and executes a verified merge on a second device', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const firstCtx = makeCtx(match);
  const backed = await cloud.backupRound(backupArgs(server, match, firstCtx));
  const state = {
    players: [{ id: 'p1', name: 'Ada', index: 99 }],
    playerRegistry: { schemaVersion: 1, players: [{ playerId: 'p1', color: 'green' }] },
    matches: [],
  };
  const ctx = { ...makeCtx(match), state };
  const storage = new Storage();
  const planned = await cloud.planRestore({
    cloudRoundId: backed.entry.cloudRoundId,
    localRoundId: match.id,
    ctx,
    client: server.client(ctx.user),
    storage,
    recoveryFile,
  });
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.plan.playersToAdd.map(row => row.id), ['p2']);
  assert.deepEqual(planned.plan.registryToAdd.map(row => row.playerId), ['p2']);
  assert.deepEqual(planned.plan.notes, [{ playerId: 'p1', kind: 'kept-existing', differs: true }]);
  let saved = state;
  const executed = await cloud.executeRestore({
    plan: planned.plan,
    state,
    commit: next => { saved = structuredClone(next); return { ok: true }; },
    readBack: () => saved,
    storage,
    ownerId: ctx.user.id,
    recoveryFile,
    now: fixedNow,
  });
  assert.equal(executed.ok, true);
  assert.equal(hash(recoveryFile.canonical(saved.matches[0])), backed.entry.roundSha256);
  assert.equal(cloud.readIndex(storage, ctx.user.id).entries[match.id].verifiedAt, fixedNow());
});

test('restore refusals preserve device state and avoid index writes', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const owner = { id: 'owner-1', is_anonymous: false };
  const backed = await cloud.backupRound(backupArgs(server, match, makeCtx(match, owner)));
  const baseState = { players: [], playerRegistry: { schemaVersion: 1, players: [] }, matches: [] };
  const makePlanArgs = (state = structuredClone(baseState), storage = new Storage()) => ({
    cloudRoundId: backed.entry.cloudRoundId,
    localRoundId: match.id,
    ctx: { ...makeCtx(match, owner), state },
    client: server.client(owner),
    storage,
    recoveryFile,
  });
  const present = structuredClone(baseState);
  present.matches.push(match);
  assert.equal((await cloud.planRestore(makePlanArgs(present))).code, 'ALREADY_ON_DEVICE');
  const mappedStorage = new Storage();
  cloud.writeIndexEntry(mappedStorage, owner.id, 'mapped', { cloudRoundId: backed.entry.cloudRoundId });
  const mappedState = structuredClone(baseState);
  mappedState.matches.push({ id: 'mapped' });
  assert.equal((await cloud.planRestore(makePlanArgs(mappedState, mappedStorage))).code, 'ALREADY_ON_DEVICE');
  const conflict = structuredClone(baseState);
  conflict.players.push({ id: 'p1', name: 'Different' });
  assert.equal((await cloud.planRestore(makePlanArgs(conflict))).code, 'PLAYER_IDENTITY_CONFLICT');
  const version = server.versions[0];
  const original = version.round_canonical;
  version.round_canonical += ' ';
  assert.equal((await cloud.planRestore(makePlanArgs())).code, 'RESTORE_HASH_MISMATCH');
  version.round_canonical = original;
  assert.equal((await cloud.planRestore({
    ...makePlanArgs(),
    cloudRoundId: 'missing',
  })).code, 'VERSION_NOT_FOUND');
  server.fault = 'offline';
  assert.equal((await cloud.planRestore(makePlanArgs())).code, 'NETWORK_ERROR');
  assert.equal((await cloud.planRestore({
    ...makePlanArgs(),
    ctx: { ...makePlanArgs().ctx, user: { id: 'anon', is_anonymous: true } },
  })).code, 'SIGN_IN_REQUIRED');
  assert.equal((await cloud.planRestore({
    ...makePlanArgs(),
    ctx: { ...makePlanArgs().ctx, recoveryGuardActive: true },
  })).code, 'RECOVERY_PROFILE');
  const good = await cloud.planRestore(makePlanArgs());
  const before = JSON.stringify(baseState);
  const saveStorage = new Storage();
  assert.equal((await cloud.executeRestore({
    plan: good.plan,
    state: baseState,
    commit: () => ({ ok: false }),
    readBack: () => baseState,
    storage: saveStorage,
    ownerId: owner.id,
    recoveryFile,
    now: fixedNow,
  })).code, 'RESTORE_SAVE_FAILED');
  let calls = 0;
  assert.equal((await cloud.executeRestore({
    plan: good.plan,
    state: baseState,
    commit: () => { calls++; return { ok: true }; },
    readBack: () => ({ ...baseState, matches: [{ ...match, changed: true }] }),
    storage: saveStorage,
    ownerId: owner.id,
    recoveryFile,
    now: fixedNow,
  })).code, 'RESTORE_VERIFY_FAILED');
  assert.equal(calls, 2);
  assert.equal(JSON.stringify(baseState), before);
  assert.equal(saveStorage.length, 0);
});

test('describeCloudRounds labels only the owner’s readable rounds', async () => {
  const server = new FakeServer();
  const owner = { id: 'owner-1', is_anonymous: false };
  const r1 = makeRound('r1');
  const r2 = makeRound('r2');
  for (const [match, name, date] of [
    [r1, 'First Round', '2026-11-01'],
    [r2, 'Second Round', '2026-11-02'],
  ]) {
    match.name = name;
    match.date = date;
    match.teeId = 't1';
    Object.assign(match.courseSnapshot, {
      name: 'Synthetic Club',
      tees: [{ id: 't1', teeName: 'Blue' }],
    });
  }
  const first = await cloud.backupRound(backupArgs(server, r1, makeCtx(r1, owner)));
  const second = await cloud.backupRound(backupArgs(server, r2, makeCtx(r2, owner)));
  const described = await cloud.describeCloudRounds({
    client: server.client(owner),
    cloudRoundIds: [
      second.entry.cloudRoundId,
      first.entry.cloudRoundId,
      'cloud-unknown',
      second.entry.cloudRoundId,
    ],
  });
  assert.equal(described.ok, true);
  assert.deepEqual(described.rounds, [
    {
      cloudRoundId: second.entry.cloudRoundId,
      name: 'Second Round',
      date: '2026-11-02',
      courseName: 'Synthetic Club',
      teeName: 'Blue',
    },
    {
      cloudRoundId: first.entry.cloudRoundId,
      name: 'First Round',
      date: '2026-11-01',
      courseName: 'Synthetic Club',
      teeName: 'Blue',
    },
  ]);
  assert.equal(server.describeQueries, 1);
  assert.deepEqual((await cloud.describeCloudRounds({
    client: server.client({ id: 'owner-2', is_anonymous: false }),
    cloudRoundIds: [first.entry.cloudRoundId],
  })).rounds, []);
  const beforeEmpty = server.describeQueries;
  assert.deepEqual(await cloud.describeCloudRounds({ client: server.client(owner), cloudRoundIds: [] }), { ok: true, rounds: [] });
  assert.deepEqual(await cloud.describeCloudRounds({ client: server.client(owner) }), { ok: true, rounds: [] });
  assert.equal(server.describeQueries, beforeEmpty);
  server.versions.find(row => row.cloud_round_id === first.entry.cloudRoundId).round_canonical = 'not json';
  const readable = await cloud.describeCloudRounds({ client: server.client(owner), cloudRoundIds: [first.entry.cloudRoundId, second.entry.cloudRoundId] });
  assert.deepEqual(readable.rounds.map(row => row.cloudRoundId), [second.entry.cloudRoundId]);
  const beforeChunks = server.describeQueries;
  await cloud.describeCloudRounds({ client: server.client(owner), cloudRoundIds: [first.entry.cloudRoundId, second.entry.cloudRoundId, ...Array.from({ length: 43 }, (_, index) => 'unknown-' + index)] });
  assert.equal(server.describeQueries - beforeChunks, 3);
  server.fault = 'describe-error';
  const failed = await cloud.describeCloudRounds({ client: server.client(owner), cloudRoundIds: [second.entry.cloudRoundId] });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, cloud.mapServerError({ message: 'boom' }));
});

test('a second account cannot list or restore another owner’s round', async () => {
  const server = new FakeServer();
  const match = makeRound();
  const first = await cloud.backupRound(backupArgs(server, match));
  const other = { id: 'owner-2', is_anonymous: false };
  const listed = await cloud.listCloudRounds({ client: server.client(other) });
  assert.deepEqual(listed.rounds, []);
  const planned = await cloud.planRestore({
    cloudRoundId: first.entry.cloudRoundId,
    localRoundId: match.id,
    ctx: { ...makeCtx(match, other), state: { ...makeState(match), matches: [] } },
    client: server.client(other),
    storage: new Storage(),
    recoveryFile,
  });
  assert.equal(planned.code, 'VERSION_NOT_FOUND');
});

test('errorMessage covers every code returned by the module', () => {
  const codes = [
    'SIGN_IN_REQUIRED', 'RECOVERY_PROFILE', 'NOT_LOCAL', 'NOT_COMPLETE',
    'TRIP_OR_EVENT_ROUND', 'NOT_FROZEN', 'LEDGER_NOT_ACCEPTED',
    'COURSE_SNAPSHOT_MISSING', 'PENDING_SYNC', 'PENDING_LEDGER',
    'PLAYER_RECORD_MISSING', 'NON_FINITE_VALUE', 'BACKUP_TOO_LARGE',
    'BACKUP_LIMIT_REACHED', 'ROUND_CHANGED', 'NETWORK_ERROR',
    'READBACK_MISMATCH', 'READBACK_MISSING', 'SOURCE_CHANGED_DURING_BACKUP',
    'INVALID_SERVER_RESPONSE', 'SERVER_ERROR', 'DURABLE_ACCOUNT_REQUIRED',
    'INVALID_BACKUP_INPUT', 'BACKUP_HASH_MISMATCH', 'BACKUP_VERSION_UNAVAILABLE',
    'INDEX_WRITE_FAILED', 'ALREADY_ON_DEVICE', 'VERSION_NOT_FOUND',
    'RESTORE_HASH_MISMATCH', 'RESTORE_PAYLOAD_INVALID', 'ROUND_ID_MISMATCH',
    'PLAYER_IDENTITY_CONFLICT', 'RESTORE_SAVE_FAILED', 'RESTORE_VERIFY_FAILED',
  ];
  for (const code of codes) assert.ok(cloud.errorMessage(code).length > 0, code);
  assert.ok(cloud.errorMessage('UNKNOWN').length > 0);
});
