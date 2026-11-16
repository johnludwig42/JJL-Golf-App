import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import '../recovery-file.js';
import { chrome, startServer, visualFixture } from './support/design-browser.js';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';

const { buildRecoveryFile, serialize, planRestore, restoreKeys, canonical, sha256Hex } =
  globalThis.DyeLedgerRecoveryFile;
const now = '2026-10-10T18:00:00.000Z';
const otherCanary = '12345678-1234-1234-1234-123456789abc';
const canaryKey = 'dye-ledger-recovery-isolation-canary';
const outboxKey = 'the-dye-ledger-v20:shared-score-outbox:v1';
const stateKey = 'the-dye-ledger-v20';
const deviceKey = 'the-dye-ledger-shared-device-id';
const deviceId = 'recovery-test-device';
const sdk = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

function shared(base, id, cloudId, extra = {}) {
  return {
    ...structuredClone(base), id, storageMode: 'shared', sharedMatchId: cloudId,
    sharedMatchRef: cloudId, sharedHostDeviceId: deviceId, sharedHostParticipantId: 'host',
    createdAt: now, lastCloudSyncAt: now, sharedScoreOutboxInitialized: true, ...extra,
  };
}

function operation(matchId, operationId, holeNumber = 1) {
  return {
    operationId, matchId, key: 'p0:' + holeNumber, playerId: 'p0', holeNumber,
    deviceId, participantId: 'host', queuedAt: now, attempts: 0, clientRevision: 1,
  };
}

async function makeRecovery() {
  const state = visualFixture().state;
  const active = shared(state.matches[0], 'held-active', 'DYE-200001');
  const op = operation(active.sharedMatchId, 'held-recovery-operation');
  active.sharedScoreQueueRecovery = { [op.key]: op };
  const completedInput = shared(state.matches[0], 'held-complete', 'DYE-200002', {
    sharedScoreOutboxInitialized: false, lastCloudSyncAt: null, lastSharedScorePullAt: null,
  });
  for (const player of completedInput.players) {
    for (const score of player.scores) score.gross = 4 + player.team;
  }
  const engine = loadLiveEngine();
  engine.seedState(state);
  const completed = engine.buildFinishedMatchCandidate(completedInput, now).candidate;
  state.matches = [active, completed];
  state.activeMatchId = active.id;
  const text = serialize(await buildRecoveryFile({
    state, outbox: { operations: [op], preservedForHostReview: [] },
    reviewReceipts: [{ id: 'recovery-receipt', matchId: op.matchId, note: 'Synthetic only' }],
    setupDraft: '{"name":"Recovery fixture draft"}', finishRecovery: '{"roundId":"held-active"}',
    pendingLedger: { acceptance: '{"roundId":"held-complete"}', revision: null },
    coursePublishRecovery: '{"courseId":"synthetic-draft"}', deviceIdentity: { deviceId },
  }, { appVersion: 'synthetic', createdAt: now, sourceOrigin: 'loopback-fixture', fileId: 'recovery-file' }));
  const plan = await planRestore(text, { profileNonce: otherCanary, restoredAt: now });
  const marker = {
    ...plan.marker, phase: 'restored-verified', completedAt: now,
    results: { rounds: 2, receipts: 1, backup: 'verified' },
  };
  return { text, plan, marker, active, completed };
}

async function withBrowser(run) {
  assert.ok(chrome, 'Set CHROME_PATH for the required recovery browser tests.');
  const server = await startServer();
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, protocolTimeout: 10000,
      args: ['--no-sandbox', '--disable-gpu'] });
    await run(browser, origin);
  } finally {
    try { await browser?.close(); }
    finally { await new Promise(resolve => server.close(resolve)); }
  }
}

async function instrument(page, origin, opts = {}) {
  const requests = [];
  const pageErrors = [];
  const errorStacks = [];
  const sockets = [];
  page.on('pageerror', error => { pageErrors.push(error.message); errorStacks.push(error.stack); });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', event => sockets.push(event.url));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (opts.missingScript && new URL(url).pathname === '/' + opts.missingScript && url.startsWith(origin + '/')) {
      return request.respond({ status: 404, body: 'Synthetic missing script' });
    }
    if (url.startsWith(origin + '/')) return request.continue();
    requests.push(url);
    if (url === sdk && opts.cloud) {
      return request.respond({ status: 200, contentType: 'application/javascript', body: 'window.testSdkLoaded = true;' });
    }
    return request.abort();
  });
  await page.evaluateOnNewDocument((origin, options) => {
    if (options.fixedClock) {
      const NativeDate = window.Date;
      const timestamp = NativeDate.parse(options.fixedClock);
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [timestamp])); }
        static now() { return timestamp; }
      };
    }
    window.testOnline = options.online ?? false;
    window.testVisibility = 'visible';
    Object.defineProperty(navigator, 'onLine', { get: () => window.testOnline });
    Object.defineProperty(document, 'visibilityState', { get: () => window.testVisibility });
    const store = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    window.testStorageWrites = [];
    const once = 'test-recovery-seeded';
    if (options.seed && !sessionStorage.getItem(once)) {
      for (const [key, value] of Object.entries(options.seed)) localStorage.setItem(key, value);
      sessionStorage.setItem(once, 'yes');
    }
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) {
        window.testStorageWrites.push([String(key), String(value)]);
        if (key === options.quotaKey) throw new DOMException('Synthetic storage fault', 'QuotaExceededError');
      }
      return store.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (this === localStorage) window.testStorageWrites.push([String(key), null]);
      return remove.call(this, key);
    };
    if (options.unavailableStorage) {
      Storage.prototype.getItem = function () {
        throw new DOMException('Synthetic unavailable storage', 'SecurityError');
      };
    }
    if (options.stopAfter) {
      Object.defineProperty(window, 'DyeLedgerRecoveryFile', {
        configurable: true,
        set(api) {
          const execute = api.executeRestorePlan;
          api.executeRestorePlan = (plan, args) => execute(plan, { ...args, stopAfter: options.stopAfter });
          Object.defineProperty(window, 'DyeLedgerRecoveryFile', { value: api, configurable: true });
        },
      });
    }
    if (options.failReceipts) {
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === 'receipts') throw new Error('Synthetic receipt write fault');
        return add.apply(this, args);
      };
    }
    if (options.idbFallback) {
      window.testListDatabases = indexedDB.databases.bind(indexedDB);
      Object.defineProperty(indexedDB, 'databases', { value: undefined });
    }
    if (options.cloud || options.stubWorker) {
      Object.defineProperty(navigator, 'serviceWorker', { value: {
        controller: null, ready: Promise.resolve({ active: null }), addEventListener() {},
        register: async () => ({ active: null, addEventListener() {}, update: async () => {} }),
        getRegistrations: async () => options.workerPresent ? [{ scope: origin + '/' }] : [],
      } });
    }
    if (!options.cloud) return;
    const intervals = new Map();
    const readRpcs = new Set(['course_library_can_write', 'course_library_is_maintainer']);
    const readTables = new Set(['courses', 'course_tees', 'course_holes', 'golfer_identities', 'matches',
      'match_teams', 'match_players', 'score_entries', 'match_notes', 'match_memberships', 'shared_score_operations']);
    const nativeInterval = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
      if ([10000, 30000].includes(delay)) {
        if (!intervals.has(delay)) intervals.set(delay, []);
        intervals.get(delay).push(() => callback(...args));
        return -intervals.get(delay).length;
      }
      return nativeInterval(callback, delay, ...args);
    };
    window.testIntervals = intervals;
    window.testCloud = { clients: 0, writes: [], reads: [], authCallbacks: [], subscriptions: 0, clientOptions: [], teardown: [],
      retry: null, failNextScore: false, bundles: {} };
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => {
      if (window.testCloud.captureRetry && String(callback).includes('sharedOutboxDrainContinuationTimer = null')) {
        window.testCloud.retry = () => callback(...args);
        return -1;
      }
      return nativeTimeout(callback, delay, ...args);
    };
    window.__DYE_SUPABASE_CONFIG__ = {
      url: origin, anonKey: 'synthetic',
      accountAuth: { enabled: options.accountAuth ?? false, expectedProjectRef: 'local', environment: 'local' },
      roundRecapUrl: origin + '/fake-story', scorecardImportUrl: origin + '/fake-import',
    };
    window.supabase = { createClient(_url, _key, config) {
      const cloud = window.testCloud;
      cloud.clients++;
      cloud.clientOptions.push(config);
      const user = { id: 'synthetic-owner', is_anonymous: false };
      const session = { user, expires_at: 100 };
      const ok = data => Promise.resolve({ data, error: null });
      return {
        realtime: { disconnect: () => cloud.teardown.push('disconnect') },
        auth: {
          getSession: () => ok({ session }), refreshSession: () => ok({ session }), getUser: () => ok({ user }),
          stopAutoRefresh: () => cloud.teardown.push('stopAutoRefresh'),
          signOut: () => { cloud.teardown.push('signOut'); return ok(null); },
          signInAnonymously() { cloud.writes.push({ kind: 'auth', name: 'signInAnonymously' }); return ok({ user }); },
          onAuthStateChange(callback) {
            cloud.authCallbacks.push(callback);
            callback('INITIAL_SESSION', session);
            return { data: { subscription: { unsubscribe: () => cloud.teardown.push('unsubscribe') } } };
          },
        },
        channel() {
          const channel = { on: () => channel, subscribe: () => {
            cloud.subscriptions++;
            cloud.onSubscribe?.();
            return channel;
          }, unsubscribe() {} };
          return channel;
        },
        removeChannel: () => ok(null),
        rpc(name, args) {
          const ops = args?.p_operations || [];
          if (readRpcs.has(name)) { cloud.reads.push({ rpc: name }); return ok(false); }
          if (name !== 'submit_shared_score_operations' || ops.length) cloud.writes.push({ kind: 'rpc', name, args });
          if (ops.length && cloud.failNextScore) {
            cloud.failNextScore = false;
            return Promise.resolve({ data: null, error: { code: 'TEST_RETRY', message: 'Synthetic transient delivery failure' } });
          }
          return ok(ops.map(op => ({ operation_id: op.operation_id, match_revision: 1 })));
        },
        from(table) {
          const filters = {};
          let verb = 'select';
          let single = false;
          let args;
          const query = {
            select: () => query, eq: (key, value) => { filters[key] = value; return query; },
            in: () => query, order: () => query, limit: () => query, is: () => query, neq: () => query,
            maybeSingle: () => { single = true; return query; }, single: () => { single = true; return query; },
            then(resolve, reject) {
              if (verb === 'select' && readTables.has(table)) cloud.reads.push({ table, filters });
              else cloud.writes.push({ kind: verb, name: table, args, filters });
              const bundle = cloud.bundles[filters.id || filters.match_id];
              const tables = bundle && {
                matches: bundle.matchRow, match_teams: bundle.teams, match_players: bundle.players,
                score_entries: bundle.scoreEntries, match_notes: [bundle.notesRow], match_memberships: [],
              };
              const data = tables?.[table] ?? (table === 'matches' && single
                ? { id: filters.id, status: 'active', course_snapshot: {} } : single ? null : []);
              return ok(data).then(resolve, reject);
            },
          };
          for (const method of ['insert', 'update', 'upsert', 'delete']) {
            query[method] = value => { verb = method; args = value; return query; };
          }
          return query;
        },
      };
    } };
  }, origin, opts);
  return { requests, pageErrors, errorStacks, sockets };
}

async function go(page, origin, path) {
  await page.goto(origin + '/' + path, { waitUntil: 'domcontentloaded', timeout: 8000 });
}

async function bootApp(page, origin) {
  const errors = [];
  const diagnostics = [];
  const responses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warn'].includes(message.type())) diagnostics.push(message.text()); });
  page.on('response', response => {
    if (response.request().resourceType() === 'script') responses.push([response.url(), response.status()]);
  });
  try {
    await go(page, origin, 'index.html');
    await page.waitForFunction(() => typeof state !== 'undefined' || document.querySelector('[role="alert"]')?.textContent.includes('Restore incomplete'), { timeout: 8000, polling: 50 });
  } catch (error) {
    throw new Error('App boot failed: ' + JSON.stringify({ errors, diagnostics: diagnostics.slice(-10), responses }), { cause: error });
  }
}

async function waitForStatus(page, text) {
  await page.waitForFunction(expected => document.getElementById('recoveryStatus')?.textContent.includes(expected), { timeout: 5000 }, text);
}

async function approveIsolation(page) {
  await page.click('#checkIsolation');
  await waitForStatus(page, 'Local checks passed');
  assert.equal(await page.$('input[type=file]'), null);
  await page.click('#canaryAbsent');
  await page.type('#originalCanary', otherCanary);
  await page.click('#confirmIsolation');
  await page.waitForSelector('input[type=file]', { timeout: 5000 });
}

async function selectFile(page, text, selector = 'input[type=file]') {
  await page.evaluate(({ text, selector }) => {
    const input = document.querySelector(selector);
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'synthetic-recovery.json', { type: 'application/json' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { text, selector });
}

async function census(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
}

test('RC2 ordinary startup keeps its storage and missing-script failure behavior', { timeout: 20000 }, async () => {
  await withBrowser(async (browser, origin) => {
    for (const options of [{ unavailableStorage: true }, { missingScript: 'identity-security.js' }]) {
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        const trace = await instrument(page, origin, { ...options, cloud: true });
        const warnings = [];
        page.on('console', message => { if (message.type() === 'warn') warnings.push(message.text()); });
        await bootApp(page, origin);
        await page.waitForFunction(() => document.getElementById('appVersionFooter')?.textContent.startsWith('v'));
        const observed = await page.evaluate(() => ({
          guard: !!window.__DYE_RECOVERY_GUARD__,
          storageAvailable: localPersistenceDiagnostics.storageAvailable,
          alert: document.querySelector('[role=alert]')?.textContent || '',
        }));
        assert.equal(observed.guard, false);
        assert.doesNotMatch(observed.alert, /recovery|restore/i);
        if (options.unavailableStorage) assert.equal(observed.storageAvailable, false);
        else assert.ok(warnings.some(line => line.includes('identity-security.js')), warnings.join('\n'));
        assert.deepEqual(trace.pageErrors, []);
      } finally { await context.close(); }
    }
  });
});

test('RC3 stale Shared Match and account clients cannot mutate the restored storage census', { timeout: 25000 }, async t => {
  const { plan } = await makeRecovery();
  await withBrowser(async (browser, origin) => {
    for (const accountAuth of [false, true]) {
      await t.test(accountAuth ? 'identity client' : 'Shared Match client', async () => {
        const context = await browser.createBrowserContext();
        try {
          const page = await context.newPage();
          const trace = await instrument(page, origin, {
            cloud: true, accountAuth, fixedClock: now,
            seed: { [stateKey]: JSON.stringify(visualFixture().state), [deviceKey]: deviceId },
          });
          await bootApp(page, origin);
          if (!accountAuth) await page.evaluate(() => ensureSupabaseClient({ anonymousAuth: false }));
          const observed = await page.evaluate(async ({ marker, values }) => {
            const options = testCloud.clientOptions[0];
            const auth = options.auth.storage;
            const authKey = options.auth.storageKey;
            auth.setItem(authKey, 'synthetic-saved-session');
            if (auth.getItem(authKey) !== 'synthetic-saved-session') throw new Error('Normal SDK persistence did not work');
            auth.setItem(authKey + ':test', 'synthetic-key');
            auth.removeItem(authKey + ':test');
            if (auth.getItem(authKey + ':test') !== null) throw new Error('Normal SDK removal did not work');
            sessionStorage.setItem('synthetic-existing-tab-key', 'keep');
            const audit = DyeLedgerPreservedReview.auditStore();
            await audit.put({ id: 'synthetic-receipt', matchId: 'synthetic-match', note: 'keep' });
            const cacheName = 'the-dye-ledger-synthetic-stale-tab';
            const cache = await caches.open(cacheName);
            const cacheUrl = location.origin + '/synthetic-cached-file';
            await cache.put(cacheUrl, new Response('keep cached content'));
            for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
            localStorage.setItem('dye-ledger-recovery-verification', JSON.stringify(marker));
            const storageValues = storage => Object.fromEntries(
              Object.keys(storage).sort().map(key => [key, storage.getItem(key)]));
            const census = async () => ({
              local: storageValues(localStorage), session: storageValues(sessionStorage),
              databases: await indexedDB.databases(), receipts: await audit.list('synthetic-match'),
              caches: await caches.keys(), cachedValue: await (await caches.match(cacheUrl))?.text(),
            });
            const before = await census();
            testStorageWrites.length = 0;
            auth.setItem(authKey, 'stale refresh');
            auth.removeItem(authKey);
            auth.setItem(authKey + ':new', 'stale new storage');
            const save = persist({ skipRender: true });
            savePlayerPreferences({});
            resetPlayerPreferences();
            clearSetupDraft();
            writeMatchTemplates([]);
            setStoredSharedDeviceName('stale device');
            cacheCloudMatchBundle('DYE-200003', {});
            writeRecentAppErrors([{ message: 'stale error' }]);
            consumePendingLedgerEntryAcceptance();
            consumePendingLedgerEntryRevision();
            writeJsonStorageRecord(localStorage, 'synthetic-stale-write', {});
            let transferDenied = false;
            try { storeLedgerReportTransfer({}); }
            catch (error) { transferDenied = error.message === 'Recovery profile changed.'; }
            await resetDyeLedgerAppCache();
            for (const callback of testCloud.authCallbacks) callback('TOKEN_REFRESHED', { user: { id: 'synthetic-owner' } });
            const fetchDenied = await options.global.fetch(location.origin + '/synthetic-stale-request')
              .then(() => false, () => true);
            return { before, after: await census(), attemptedWrites: testStorageWrites, save, fetchDenied, transferDenied,
              teardown: testCloud.teardown, clientCount: testCloud.clients, tag: options.global.headers?.['X-Client-Info'] || '',
              alert: document.querySelector('[role=alert]')?.textContent };
          }, { marker: plan.marker, values: plan.values });
          assert.equal(observed.clientCount, 1);
          assert.equal(observed.tag.includes('account'), accountAuth);
          assert.deepEqual(observed.after, observed.before);
          assert.deepEqual(observed.attemptedWrites, []);
          assert.equal(observed.save, false);
          assert.equal(observed.fetchDenied, true);
          assert.equal(observed.transferDenied, true);
          assert.deepEqual(observed.teardown.sort(), ['disconnect', 'stopAutoRefresh', 'unsubscribe']);
          assert.match(observed.alert, /Recovery started/);
          assert.deepEqual(trace.pageErrors, []);
          console.log('RC3 unchanged storage census', JSON.stringify({
            local: Object.keys(observed.after.local), session: Object.keys(observed.after.session),
            databases: observed.after.databases, caches: observed.after.caches,
            hash: await sha256Hex(canonical(observed.after)), teardown: observed.teardown,
          }));
        } finally { await context.close(); }
      });
    }
  });
});

test('recovery page checks isolation before opening a file, restores in order, and boots G1 without cloud', { timeout: 35000 }, async () => {
  const { text, plan } = await makeRecovery();
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      const trace = await instrument(page, origin);
      await go(page, origin, 'recovery.html');
      assert.equal(await page.$('input[type=file]'), null);
      await approveIsolation(page);
      const before = await census(page);
      assert.deepEqual(Object.keys(before), [canaryKey]);
      await selectFile(page, text);
      await waitForStatus(page, 'File verified');
      assert.deepEqual(await census(page), before, 'inspection does not write round data');
      assert.match(await page.$eval('#recoverySummary', node => node.textContent), /2 rounds.*1 pending score writes/);
      await page.click('#restoreRecovery');
      await waitForStatus(page, 'Verified recovery: 2 rounds, 1 review receipts');
      const restored = await census(page);
      const scoreFields = raw => {
        const { restoredAt, recordSha256, ...fields } = JSON.parse(raw);
        assert.ok(restoredAt && recordSha256);
        return fields;
      };
      assert.deepEqual(scoreFields(restored[restoreKeys.scoreHold]), scoreFields(plan.values[restoreKeys.scoreHold]));
      assert.equal(restored[restoreKeys.startupHold], plan.values[restoreKeys.startupHold]);
      assert.deepEqual(JSON.parse(restored[stateKey]), JSON.parse(plan.values[stateKey]));
      for (const key of [outboxKey, deviceKey, 'dye-ledger:pending-ledger-entry-acceptance',
        'the-dye-ledger-v20:finish-recovery', 'the-dye-ledger-v20:course-publish-recovery:v1']) {
        assert.equal(Object.hasOwn(restored, key), false, key);
      }
      const writes = await page.evaluate(() => testStorageWrites.map(([key]) => key));
      assert.deepEqual(writes, [canaryKey, restoreKeys.marker, restoreKeys.scoreHold,
        restoreKeys.startupHold, restoreKeys.setupDraft, stateKey, restoreKeys.backup, restoreKeys.marker]);
      assert.equal(await page.$('input[type=file]'), null);
      const app = await context.newPage();
      const appTrace = await instrument(app, origin, { cloud: true, online: true });
      await bootApp(app, origin);
      await app.waitForFunction(() => window.__DYE_RECOVERY_GUARD__?.state === 'G1' && typeof state !== 'undefined');
      const observed = await app.evaluate(async () => {
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('online'));
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));
        await testIntervals.get(10000)?.[0]?.();
        await drainPendingSharedScoreOutboxes();
        scheduleSharedMatchSync(getActiveMatch(), { immediate: true });
        const blocked = await Promise.allSettled([
          fetchOpenMeteoCurrentWeather(0, 0), requestAiScorecardExtraction([]), ensureSupabaseClient(),
        ]);
        return { count: state.matches.length, clients: testCloud.clients, sdk: !!window.testSdkLoaded,
          subscriptions: testCloud.subscriptions, sharedClient: !!window.__DYE_SUPABASE_CLIENT__,
          cloud: hasSupabaseConfig(), blocked: blocked.map(result => result.status) };
      });
      assert.deepEqual(observed, { count: 2, clients: 0, sdk: false, subscriptions: 0,
        sharedClient: false, cloud: false, blocked: ['rejected', 'rejected', 'fulfilled'] });
      assert.deepEqual(appTrace.requests, []);
      assert.deepEqual(appTrace.sockets, []);
      assert.deepEqual([...trace.pageErrors, ...appTrace.pageErrors], []);
      assert.equal((await census(app))[restoreKeys.scoreHold], restored[restoreKeys.scoreHold]);
      assert.match(await app.$eval('#matchesList', node => node.textContent), /Restored: 1 score held, not sent/);
      assert.equal(await app.evaluate(async () => {
        const match = getMatch('held-active');
        const audit = { list() { throw new Error('A held receipt must not enter startup processing.'); } };
        return (await recoverPreservedScoreResolutions(match, { audit })).cleared;
      }), 0);
    } finally { await context.close(); }
  });
});

test('preflight refuses contamination and online selection, but accepts its own canary after reload', { timeout: 45000 }, async () => {
  await withBrowser(async (browser, origin) => {
    for (const [label, opts, status] of [
      ['ordinary local data', { seed: { 'dyeLedger.matchTemplates.v1': '[]' } }, 'already contains data'],
      ['auth only', { seed: { 'dye-ledger-account-auth-v1': 'fixture-session' } }, 'already contains data'],
      ['online', { online: true }, 'Disconnect from the network'],
      ['prior restore', { seed: { [restoreKeys.marker]: '{}' } }, 'Restore incomplete'],
      ['database', {}, 'IndexedDB database'],
      ['cache', {}, 'cache data'],
      ['service worker', { stubWorker: true, workerPresent: true }, 'has a service worker'],
    ]) {
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        await instrument(page, origin, opts);
        await go(page, origin, 'recovery.html');
        if (label === 'database') await page.evaluate(() => new Promise(resolve => {
          const request = indexedDB.open('synthetic-contamination', 1);
          request.onsuccess = () => { request.result.close(); resolve(); };
        }));
        if (label === 'cache') await page.evaluate(() => caches.open('the-dye-ledger-fixture').then(() => null));
        if (label !== 'prior restore') await page.click('#checkIsolation');
        await waitForStatus(page, status);
        assert.equal(await page.$('input[type=file]'), null, label);
      } finally { await context.close(); }
    }
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      await instrument(page, origin);
      await go(page, origin, 'recovery.html');
      await page.click('#checkIsolation');
      await waitForStatus(page, 'Local checks passed');
      const first = (await census(page))[canaryKey];
      await go(page, origin, 'recovery.html');
      await page.click('#checkIsolation');
      await waitForStatus(page, 'Local checks passed');
      await page.click('#canaryAbsent');
      await page.type('#originalCanary', first);
      await page.click('#confirmIsolation');
      await waitForStatus(page, 'enter a different');
      assert.equal(await page.$('input[type=file]'), null);
      await page.$eval('#originalCanary', node => { node.value = ''; });
      await page.type('#originalCanary', otherCanary);
      await page.click('#confirmIsolation');
      await page.waitForSelector('input[type=file]');
      assert.equal((await census(page))[canaryKey], first);
      await page.evaluate(() => { testOnline = true; window.dispatchEvent(new Event('online')); });
      assert.equal(await page.$('input[type=file]'), null);
    } finally { await context.close(); }
    const fallback = await browser.createBrowserContext();
    try {
      const page = await fallback.newPage();
      await instrument(page, origin, { idbFallback: true });
      await go(page, origin, 'recovery.html');
      await approveIsolation(page);
      assert.deepEqual(await page.evaluate(() => testListDatabases()), [], 'fallback abort leaves no database');
    } finally { await fallback.close(); }
  });
});

test('FT-1–7 and FT-13–14: every browser interruption leaves the profile blocked and unusable for another restore', { timeout: 90000 }, async () => {
  const { text } = await makeRecovery();
  await withBrowser(async (browser, origin) => {
    const faults = [
      ...[1, 2, 3, 4, 5, 6, 7].map(step => ({ stopAfter: 'S' + step, hasState: step >= 6 })),
      { quotaKey: stateKey, hasState: false }, { failReceipts: true, hasState: false },
    ];
    for (const fault of faults) {
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        await instrument(page, origin, fault);
        await go(page, origin, 'recovery.html');
        await approveIsolation(page);
        await selectFile(page, text);
        await waitForStatus(page, 'File verified');
        await page.click('#restoreRecovery');
        await waitForStatus(page, 'Restore incomplete');
        const before = await census(page);
        assert.equal(JSON.parse(before[restoreKeys.marker]).phase, 'restoring');
        assert.equal(Object.hasOwn(before, stateKey), fault.hasState);
        await go(page, origin, 'recovery.html');
        await waitForStatus(page, 'Restore incomplete');
        assert.equal(await page.$('input[type=file]'), null);
        assert.equal(await page.$eval('#checkIsolation', button => button.disabled), true);
        const app = await context.newPage();
        const trace = await instrument(app, origin, { cloud: true, online: true });
        await bootApp(app, origin);
        assert.deepEqual(await census(app), before);
        assert.equal(await app.evaluate(() => testStorageWrites.length), 0);
        assert.equal(await app.evaluate(() => testCloud.clients), 0);
        assert.deepEqual(trace.requests, []);
        assert.deepEqual(trace.pageErrors, []);
      } finally { await context.close(); }
    }
  });
});

test('FT-8–10: absent or corrupt score holds fail closed, and G5 still allows local persistence', { timeout: 45000 }, async () => {
  const { plan, marker } = await makeRecovery();
  const score = JSON.parse(plan.values[restoreKeys.scoreHold]);
  const cases = [
    ['G3', null], ['G3', '{'], ['G3', JSON.stringify({ ...score, schemaVersion: 2 })],
    ['G3', JSON.stringify({ ...score, heldMatchIds: [] })], ['G3', JSON.stringify({ ...score, heldMatchIds: 3 })],
    ['G3', JSON.stringify({ ...score, operations: undefined })], ['G5', '{'],
  ];
  await withBrowser(async (browser, origin) => {
    for (const [expected, raw] of cases) {
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        const seed = { [stateKey]: plan.values[stateKey] };
        if (expected === 'G3') seed[restoreKeys.marker] = JSON.stringify(marker);
        if (raw !== null) seed[restoreKeys.scoreHold] = raw;
        const trace = await instrument(page, origin, { seed, cloud: true, online: true });
        await bootApp(page, origin);
        assert.equal(await page.evaluate(() => window.__DYE_RECOVERY_GUARD__.state), expected);
        if (expected === 'G3') {
          assert.deepEqual(await census(page), seed);
          assert.equal(await page.evaluate(() => testStorageWrites.length), 0);
        } else {
          assert.equal(await page.evaluate(() => { state.notes = 'local-only fixture'; return persist({ skipRender: true }); }), true);
          assert.equal(JSON.parse((await census(page))[stateKey]).notes, 'local-only fixture');
        }
        assert.equal(await page.evaluate(() => testCloud.clients), 0);
        assert.deepEqual(trace.requests, []);
        assert.deepEqual(trace.pageErrors, []);
      } finally { await context.close(); }
    }
  });
});

test('FT-11–12: contamination after inspection refuses restore and stale app saves cannot overwrite restored state', { timeout: 25000 }, async () => {
  const { text, plan } = await makeRecovery();
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    try {
      const recovery = await context.newPage();
      await instrument(recovery, origin);
      await go(recovery, origin, 'recovery.html');
      await approveIsolation(recovery);
      await selectFile(recovery, text);
      await waitForStatus(recovery, 'File verified');
      // Commit re-check must reject a profile written after the file was inspected.
      await recovery.evaluate(() => {
        localStorage.setItem('dyeLedger.playerPreferences', '{}');
        document.getElementById('restoreRecovery').click();
      });
      await waitForStatus(recovery, 'Restore refused');
      assert.equal(Object.hasOwn(await census(recovery), restoreKeys.marker), false);
      const oldTab = await context.newPage();
      await instrument(oldTab, origin, { stubWorker: true });
      await bootApp(oldTab, origin);

      // A marker appearing after the old tab loaded must stop even a save attempted
      // before that tab has acted on the storage event.
      await oldTab.evaluate(({ keys, pending, restored }) => {
        localStorage.setItem(keys.marker, JSON.stringify(pending));
        localStorage.setItem(keys.state, restored);
        state.notes = 'stale overwrite';
        window.staleSave = persist({ skipRender: true });
      }, { keys: restoreKeys, pending: plan.marker, restored: plan.values[stateKey] });
      assert.equal(await oldTab.evaluate(() => window.staleSave), false);
      assert.match(await oldTab.$eval('[role=alert]', node => node.textContent), /Recovery started/);
      assert.equal((await census(oldTab))[stateKey], plan.values[stateKey]);
    } finally { await context.close(); }
    const sibling = await browser.createBrowserContext();
    try {
      const app = await sibling.newPage();
      await instrument(app, origin, { stubWorker: true });
      await bootApp(app, origin);
      const writer = await sibling.newPage();
      await go(writer, origin, 'recovery.html');
      await writer.evaluate(({ keys, marker, state }) => {
        localStorage.setItem(keys.marker, JSON.stringify(marker));
        localStorage.setItem(keys.state, state);
      }, { keys: restoreKeys, marker: plan.marker, state: plan.values[stateKey] });
      await app.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('Recovery started'));
      assert.equal(await app.evaluate(() => { state.notes = 'old sibling'; return persist({ skipRender: true }); }), false);
      assert.equal((await census(writer))[stateKey], plan.values[stateKey]);
    } finally { await sibling.close(); }
  });
});

const eligibleId = 'DYE-200003';
const seedId = 'DYE-200004';
const heldIds = ['DYE-200001', 'DYE-200002'];
const scoreWrites = (writes, id) => writes.filter(row => row.name === 'submit_shared_score_operations'
  && row.args.p_match_id === id && row.args.p_operations.length);
const matchWrites = (writes, id) => writes.filter(row =>
  (row.name === 'publish_shared_match_owner' && row.args?.p_match?.id === id)
  || (row.name === 'matches' && (row.filters?.id === id || row.args?.id === id)));

function assertNoHeldWrites(writes, held = heldIds) {
  for (const row of writes) {
    const text = JSON.stringify(row);
    assert.ok(held.every(id => !text.includes(id)), text);
    assert.notEqual(row.kind, 'auth', text);
    assert.ok(['publish_shared_match_owner', 'submit_shared_score_operations', 'matches', 'match_memberships',
      'match_teams', 'match_players', 'score_entries', 'match_notes'].includes(row.name), 'Unexpected write ' + text);
  }
}

async function g4Fixture(heldActive) {
  const { plan } = await makeRecovery();
  const state = JSON.parse(plan.values[stateKey]);
  const e1 = shared(state.matches[0], 'eligible-active', eligibleId);
  const e2 = shared(state.matches[1], 'eligible-seed', seedId, {
    sharedScoreOutboxInitialized: false, lastCloudSyncAt: null, lastSharedScorePullAt: null,
  });
  state.matches.push(e1, e2, { ...structuredClone(visualFixture().state.matches[0]), id: 'local-control', status: 'complete' });
  state.activeMatchId = heldActive ? 'held-active' : e1.id;
  const seed = {
    [stateKey]: JSON.stringify(state), [deviceKey]: deviceId,
    [restoreKeys.scoreHold]: plan.values[restoreKeys.scoreHold],
    [restoreKeys.startupHold]: plan.values[restoreKeys.startupHold],
    [outboxKey]: JSON.stringify({ schemaVersion: 1, operations: [operation(eligibleId, 'boot-control')] }),
  };
  return { state, seed };
}

async function waitScore(page, operationId) {
  await page.waitForFunction(id => testCloud.writes.some(row => row.name === 'submit_shared_score_operations'
    && row.args.p_operations.some(op => op.operation_id === id)), { timeout: 3500 }, operationId);
}

async function settledWrites(page) {
  await page.waitForFunction(() => !sharedOutboxDrainInflight && !sharedForegroundInflight
    && !sharedMatchSyncInflight.size && !sharedMatchSyncTimers.size, { timeout: 3500 });
  return page.evaluate(() => structuredClone(testCloud.writes));
}

async function queueEligible(page, suffix) {
  return page.evaluate(suffix => {
    testCloud.writes.length = 0;
    const match = getMatch('eligible-active');
    const op = queueSharedScoreOperation(match, 'p0', 1);
    if (!op) throw new Error('Eligible control could not queue ' + suffix);
    return op.operationId;
  }, suffix);
}

test('AC-R8 G4 holds both restored matches across boot and delivery triggers while eligible controls still write', { timeout: 90000 }, async t => {
  await withBrowser(async (browser, origin) => {
    for (const heldActive of [true, false]) {
      await t.test(heldActive ? 'held match active' : 'eligible match active', async () => {
        const context = await browser.createBrowserContext();
        try {
          const { state: seeded, seed } = await g4Fixture(heldActive);
          const page = await context.newPage();
          const trace = await instrument(page, origin, { seed, cloud: true, online: true, fixedClock: now });
          await bootApp(page, origin);
          await page.waitForFunction(() => window.__DYE_RECOVERY_GUARD__?.state === 'G4' && typeof state !== 'undefined');
          await waitScore(page, 'boot-control');
          const boot = await settledWrites(page);
          assertNoHeldWrites(boot);
          assert.ok(scoreWrites(boot, eligibleId).length);
          assert.equal(await page.evaluate(() => state.activeMatchId), seeded.activeMatchId);
          console.log('T1 W1 boot control, active:', seeded.activeMatchId);

          const hiddenOp = await queueEligible(page, 'T2h');
          const hidden = await page.evaluate(() => {
            testVisibility = 'hidden';
            document.dispatchEvent(new Event('visibilitychange'));
            return { status: getMatch('eligible-active').cloudSyncState, writes: structuredClone(testCloud.writes) };
          });
          assert.deepEqual(hidden.writes, []);
          if (!heldActive) assert.equal(hidden.status, 'pending-sync');
          assert.deepEqual(await settledWrites(page), []);
          await page.evaluate(() => {
            testVisibility = 'visible';
            document.dispatchEvent(new Event('visibilitychange'));
          });
          await waitScore(page, hiddenOp);
          const visible = await settledWrites(page);
          assertNoHeldWrites(visible);
          assert.ok(scoreWrites(visible, eligibleId).length);
          if (!heldActive) {
            assert.ok(matchWrites(visible, eligibleId).length);
            assert.ok(visible.some(row => row.name === 'match_memberships' && row.kind === 'update'));
          }
          console.log('T2h zero writes; T2 visible W1 and eligible-active W3/W5');

          for (const trigger of ['focus', 'online', 'sign-in', 'poll', 'pagehide', 'direct']) {
            const id = await queueEligible(page, trigger);
            await page.evaluate(async trigger => {
              switch (trigger) {
                case 'focus': window.dispatchEvent(new Event('focus')); break;
                case 'online':
                  testOnline = false;
                  window.dispatchEvent(new Event('offline'));
                  testOnline = true;
                  window.dispatchEvent(new Event('online'));
                  break;
                case 'sign-in':
                  testCloud.authCallbacks.at(-1)('SIGNED_IN', { user: { id: 'synthetic-owner' }, expires_at: 200 });
                  break;
                case 'poll':
                  // A second score becomes pending as the active poll subscribes.
                  // This exercises the poll's flush after its initial W1 drain.
                  testCloud.onSubscribe = () => {
                    const match = getActiveMatch();
                    if (match?.id === 'eligible-active') queueSharedScoreOperation(match, 'p0', 2);
                  };
                  try { await testIntervals.get(10000)[0](); }
                  finally { delete testCloud.onSubscribe; }
                  break;
                case 'pagehide': window.dispatchEvent(new Event('pagehide')); break;
                case 'direct': await drainPendingSharedScoreOutboxes(); break;
              }
            }, trigger);
            await waitScore(page, id);
            const writes = await settledWrites(page);
            assertNoHeldWrites(writes);
            assert.ok(scoreWrites(writes, eligibleId).length, trigger);
            if (!heldActive && ['focus', 'online', 'sign-in', 'poll', 'pagehide'].includes(trigger)) {
              assert.ok(matchWrites(writes, eligibleId).length, trigger + ' W3');
            }
            if (!heldActive && ['focus', 'online', 'sign-in'].includes(trigger)) {
              assert.ok(writes.some(row => row.name === 'match_memberships' && row.kind === 'update'), trigger + ' W5');
            }
            console.log(trigger + ': W1 and expected active-match control');
          }

          const retryId = await queueEligible(page, 'retry');
          await page.evaluate(async () => {
            testCloud.captureRetry = true;
            testCloud.failNextScore = true;
            await drainPendingSharedScoreOutboxes();
            if (!testCloud.retry) throw new Error('Retry continuation was not scheduled');
            const match = getMatch('eligible-active');
            saveSharedDeliveryRetry(match, { nextRetryAt: null });
            testCloud.captureRetry = false;
            testCloud.retry();
          });
          await waitScore(page, retryId);
          const retried = await settledWrites(page);
          assertNoHeldWrites(retried);
          assert.equal(scoreWrites(retried, eligibleId).filter(row =>
            row.args.p_operations.some(op => op.operation_id === retryId)).length, 2);
          console.log('T8 retry delivered the same eligible operation on the continuation');

          await page.evaluate(() => {
            testCloud.writes.length = 0;
            for (const id of ['held-active', 'held-complete', 'eligible-seed']) {
              scheduleSharedMatchSync(getMatch(id), { immediate: true, silent: true });
            }
          });
          const sync = await settledWrites(page);
          assertNoHeldWrites(sync);
          assert.ok(matchWrites(sync, seedId).length, 'T10 W3');
          assert.ok(sync.some(row => row.name === 'score_entries' && row.kind === 'upsert'
            && row.args.some(score => score.match_id === seedId)), 'T10 INITIAL_SEED W2');
          console.log('T10 real immediate sync reached INITIAL_SEED and match publication for eligible completed match');

          await page.evaluate(() => {
            testCloud.writes.length = 0;
            const match = getActiveMatch();
            testCloud.bundles[match.sharedMatchId] = buildCloudMatchPayload(match);
            document.getElementById('refreshSharedMatchBtn').click();
          });
          if (!heldActive) {
            await page.waitForFunction(() => testCloud.writes.some(row => row.name === 'match_memberships'), { timeout: 3500 });
          }
          const refreshed = await settledWrites(page);
          assertNoHeldWrites(refreshed);
          if (!heldActive) {
            assert.ok(refreshed.some(row => row.name === 'match_memberships'), 'T11 eligible refresh registration');
            assert.ok(matchWrites(refreshed, eligibleId).length, 'T11 eligible refresh metadata write');
          }
          console.log('T11 real refresh control, held active:', heldActive);
          const stored = await census(page);
          assert.equal(stored[restoreKeys.scoreHold], seed[restoreKeys.scoreHold]);
          assert.equal(stored[restoreKeys.startupHold], seed[restoreKeys.startupHold]);
          assert.ok(heldIds.every(id => !stored[outboxKey]?.includes(id)));
          assert.deepEqual(trace.pageErrors, []);
          assert.ok(trace.requests.every(url => url === sdk), 'no actual outbound requests');
        } finally { await context.close(); }
      });
    }
  });
});

test('AC-R2 the unchanged legacy importer installs no rounds or keys and sends no restored operations', { timeout: 20000 }, async () => {
  const { text } = await makeRecovery();
  const recovery = JSON.parse(text);
  const sources = recovery.payload;
  sources.state.players = [{ id: 'recovery-only-player', name: 'Recovery only' }];
  sources.state.courses = [{ id: 'recovery-only-course', name: 'Recovery only' }];
  const file = serialize(await buildRecoveryFile(sources, recovery.meta));
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      const existing = visualFixture().state;
      existing.matches.push(shared(existing.matches[0], 'eligible-active', eligibleId));
      const seedControl = await g4Fixture(false);
      existing.matches.push(seedControl.state.matches.find(match => match.id === 'eligible-seed'));
      const trace = await instrument(page, origin, {
        seed: { [stateKey]: JSON.stringify(existing), [deviceKey]: deviceId },
        cloud: true, fixedClock: now,
      });
      await bootApp(page, origin);
      const getCollections = () => page.evaluate(() => {
        const { players, courses, matches, activeMatchId } = state;
        return { players, courses, matches, activeMatchId };
      });
      await page.evaluate(() => normalizeState());
      const before = await getCollections();
      const storage = await census(page);
      await selectFile(page, file, '#importFile');
      console.log('AC-R2 waiting for legacy import');
      await page.waitForFunction(() => document.body.textContent.includes('Backup imported.'));
      const after = await getCollections();
      assert.equal(await sha256Hex(canonical(before)), await sha256Hex(canonical(after)));
      assert.ok(!JSON.stringify(after).includes('recovery-only-') && !JSON.stringify(after).includes('held-active'));
      const importedStorage = await census(page);
      for (const key of [outboxKey, restoreKeys.scoreHold, restoreKeys.startupHold, restoreKeys.marker]) {
        assert.equal(importedStorage[key], storage[key], key);
      }
      const writes = await page.evaluate(async () => {
        testOnline = true;
        testVisibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        testVisibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        window.dispatchEvent(new Event('online'));
        await testIntervals.get(10000)[0]();
        window.dispatchEvent(new Event('pagehide'));
        await drainPendingSharedScoreOutboxes();
        scheduleSharedMatchSync('held-active', { immediate: true });
        return structuredClone(testCloud.writes);
      });
      assertNoHeldWrites(writes);
      assert.ok(!JSON.stringify(writes).includes('held-recovery-operation'));
      const eligibleOp = await page.evaluate(async () => {
        await ensureSupabaseClient();
        const match = getMatch('eligible-active');
        const op = queueSharedScoreOperation(match, 'p0', 1);
        testCloud.authCallbacks.at(-1)('SIGNED_IN', { user: { id: 'synthetic-owner' }, expires_at: 200 });
        return op.operationId;
      });
      console.log('AC-R2 waiting for eligible auth delivery');
      await waitScore(page, eligibleOp);
      assertNoHeldWrites(await settledWrites(page));
      const retryOp = await page.evaluate(async () => {
        const match = getMatch('eligible-active');
        window.clearTimeout(sharedOutboxDrainContinuationTimer);
        sharedOutboxDrainContinuationTimer = null;
        testCloud.captureRetry = true;
        testCloud.failNextScore = true;
        const op = queueSharedScoreOperation(match, 'p0', 2);
        await drainPendingSharedScoreOutboxes();
        if (!testCloud.retry) throw new Error('Retry continuation was not scheduled');
        saveSharedDeliveryRetry(match, { nextRetryAt: null });
        testCloud.captureRetry = false;
        testCloud.retry();
        return op.operationId;
      });
      console.log('AC-R2 waiting for eligible retry');
      await waitScore(page, retryOp);
      const retried = await settledWrites(page);
      assertNoHeldWrites(retried);
      assert.equal(scoreWrites(retried, eligibleId).filter(row =>
        row.args.p_operations.some(op => op.operation_id === retryOp)).length, 2);
      await page.evaluate(() => scheduleSharedMatchSync(getMatch('eligible-seed'), { immediate: true, silent: true }));
      const seeded = await settledWrites(page);
      assertNoHeldWrites(seeded);
      assert.ok(matchWrites(seeded, seedId).length, 'T10 W3');
      assert.ok(seeded.some(row => row.name === 'score_entries' && row.kind === 'upsert'
        && row.args.some(score => score.match_id === seedId)), 'T10 INITIAL_SEED W2');
      const bootOp = await page.evaluate(() => {
        testOnline = false;
        const match = state.matches.find(row => row.sharedMatchId === 'DYE-200003');
        const op = queueSharedScoreOperation(match, 'p0', 3);
        if (!getSharedScoreOutboxOperations(match).some(row => row.operationId === op.operationId)) {
          throw new Error('Eligible reboot operation was not persisted');
        }
        return op.operationId;
      });
      console.log('AC-R2 rebooting with the eligible operation queued');
      await page.close();
      const reopened = await context.newPage();
      const rebootTrace = await instrument(reopened, origin, { cloud: true, online: true, fixedClock: now });
      await bootApp(reopened, origin);
      try { await waitScore(reopened, bootOp); }
      catch (error) {
        const diagnostic = await reopened.evaluate(() => {
          const match = getMatch('eligible-active');
          return { online: navigator.onLine, cloud: hasSupabaseConfig(), match: match?.id,
            candidates: getSharedMatchesWithPendingScoreOperations().map(row => row.id),
            eligible: canAttemptSharedDelivery(match), active: state.activeMatchId, timer: sharedScoreRefreshTimer,
            course: getMatchCourse(getActiveMatch())?.id, tee: getMatchTee(getActiveMatch())?.id,
            assignedError: getAssignedTeamIndexError(getActiveMatch()), scrambleError: getScrambleSetupError(getActiveMatch()),
            pending: readSharedScoreOutbox().operations, retry: match && getSharedDeliveryRetry(match),
            writes: testCloud.writes };
        });
        throw new Error('Eligible boot operation did not reach the RPC: '
          + JSON.stringify({ ...diagnostic, errors: rebootTrace.errorStacks }), { cause: error });
      }
      assertNoHeldWrites(await settledWrites(reopened));
      await reopened.evaluate(() => {
        testCloud.writes.length = 0;
        const match = getMatch('eligible-active');
        state.activeMatchId = match.id;
        testCloud.bundles[match.sharedMatchId] = buildCloudMatchPayload(match);
        document.getElementById('refreshSharedMatchBtn').click();
      });
      await reopened.waitForFunction(() => testCloud.writes.some(row => row.name === 'match_memberships'), { timeout: 3500 });
      const refreshed = await settledWrites(reopened);
      assertNoHeldWrites(refreshed);
      assert.ok(matchWrites(refreshed, eligibleId).length, 'T11 eligible refresh metadata write');
      assert.deepEqual(rebootTrace.pageErrors, []);
      assert.deepEqual(trace.pageErrors, []);
    } finally { await context.close(); }
  });
});

test('AC-R13 verification skips the CDN, both client entry points, subscriptions and all four fetch paths', { timeout: 26000 }, async () => {
  const { plan, marker } = await makeRecovery();
  const { seed: eligibleSeed } = await g4Fixture(false);
  delete eligibleSeed[restoreKeys.scoreHold];
  delete eligibleSeed[restoreKeys.startupHold];
  await withBrowser(async (browser, origin) => {
    for (const verification of [true, false]) {
      const context = await browser.createBrowserContext();
      try {
        const page = await context.newPage();
        const seed = verification ? { ...plan.values, [restoreKeys.marker]: JSON.stringify(marker) } : eligibleSeed;
        const trace = await instrument(page, origin, { seed, cloud: true, online: true, fixedClock: now, accountAuth: true });
        await bootApp(page, origin);
        if (!verification) await waitScore(page, 'boot-control');
        const observed = await page.evaluate(async () => {
          const calls = [];
          window.fetch = async (url, init) => {
            const body = init?.body ? JSON.parse(init.body) : {};
            calls.push([String(url), body.purpose || '']);
            return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
          };
          const match = getActiveMatch();
          if (window.__DYE_RECOVERY_GUARD__?.cloudOff) {
            testVisibility = 'hidden';
            document.dispatchEvent(new Event('visibilitychange'));
            testVisibility = 'visible';
            document.dispatchEvent(new Event('visibilitychange'));
            window.dispatchEvent(new Event('focus'));
            testOnline = false;
            window.dispatchEvent(new Event('offline'));
            testOnline = true;
            window.dispatchEvent(new Event('online'));
            await testIntervals.get(10000)[0]();
            window.dispatchEvent(new Event('pagehide'));
            await drainPendingSharedScoreOutboxes();
            scheduleSharedMatchSync(match, { immediate: true });
            document.getElementById('refreshSharedMatchBtn').click();
            if (testCloud.authCallbacks.length || testCloud.retry) throw new Error('Verification created cloud callbacks');
          }
          await ensureSupabaseClient();
          DyeLedgerIdentitySecurity.mountAccountSecurity();
          await ensureSharedRealtimeSubscription(match);
          await fetchOpenMeteoCurrentWeather(0, 0).catch(() => {});
          await prepareLedgerEntryStory(match, computeMatchMetrics(match));
          const story = await runRoundRecapGeneration(match, { silent: true });
          await requestAiScorecardExtraction(new File(['synthetic'], 'fixture.pdf', { type: 'application/pdf' })).catch(() => {});
          return {
            calls, clients: testCloud.clients, subscriptions: testCloud.subscriptions,
            sharedClient: !!window.__DYE_SUPABASE_CLIENT__, sdk: !!window.testSdkLoaded,
            writes: testCloud.writes, storyReason: story?.reason,
          };
        });
        if (verification) {
          assert.deepEqual(observed, { calls: [], clients: 0, subscriptions: 0, sharedClient: false,
            sdk: false, writes: [], storyReason: 'recovery-cloud-off' });
          assert.deepEqual(trace.requests, []);
          assert.deepEqual(trace.sockets, []);
        } else {
          assert.ok(observed.clients > 0 && observed.sharedClient && observed.sdk);
          assert.ok(observed.subscriptions > 0);
          assert.ok(scoreWrites(observed.writes, eligibleId).length);
          assert.ok(observed.calls.some(([url]) => url.startsWith('https://api.open-meteo.com/')));
          assert.ok(observed.calls.some(([url, purpose]) => url.endsWith('/round-recap') && purpose === 'ledger-story'));
          assert.ok(observed.calls.some(([url, purpose]) => url.endsWith('/round-recap') && !purpose));
          assert.ok(observed.calls.some(([url]) => url.endsWith('/scorecard-import')));
          assert.ok(trace.requests.includes(sdk));
        }
        assert.deepEqual(trace.pageErrors, []);
      } finally { await context.close(); }
    }
  });
});
