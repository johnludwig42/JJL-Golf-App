import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { chrome, startServer, visualFixture } from './support/design-browser.js';
import { currentVersionBare } from './support/release-identity.js';
import '../recovery-file.js';

const api = globalThis.DyeLedgerRecoveryFile;
const stateKey = 'the-dye-ledger-v20';
const draftKey = stateKey + ':setup-draft';
const outboxKey = stateKey + ':shared-score-outbox:v1';
const databaseName = 'the-dye-ledger-score-review-v1';
const statusSelector = '#recoveryToolsStatus';
const saveButton = '#saveRecoveryFileBtn';
const toolsButton = '#settings [data-experience-target="utilities"]';
const canaryKey = 'dye-ledger-recovery-isolation-canary';
const receipt = { id: 'synthetic-review', matchId: 'DYE-230001', note: 'Synthetic decision' };
const deviceId = 'synthetic-source-device';
const operation = { operationId: 'synthetic-op', matchId: 'DYE-230001', playerId: 'p0',
  holeNumber: 1, key: 'p0:1', deviceId, participantId: 'synthetic-participant',
  queuedAt: '2026-10-10T18:00:00.000Z', attempts: 0, clientRevision: 1 };
const rawValues = {
  [outboxKey]: JSON.stringify({ schemaVersion: 1, operations: [operation], preservedForHostReview: [] }),
  [stateKey + ':finish-recovery']: '{"roundId":"synthetic-finish"}',
  [stateKey + ':setup-draft']: '{"name":"Synthetic draft"}',
  [stateKey + ':course-publish-recovery:v1']: '{"courseId":"synthetic-course"}',
  'dye-ledger:pending-ledger-entry-acceptance': '{"roundId":"synthetic-acceptance"}',
  'dye-ledger:pending-ledger-entry-revision': '{"roundId":"synthetic-revision"}',
  'dyeLedger.matchTemplates.v1': '[]',
  'dyeLedger.playerPreferences': '{}',
  'the-dye-ledger-shared-device-id': deviceId,
};
const excluded = {
  'dye-ledger-account-auth-v1-test': 'excluded-synthetic-auth',
  'the-dye-ledger-cloud-match:DYE-230001': 'excluded-synthetic-cache',
  'the-dye-ledger-shared-delivery-retry-v1': 'excluded-synthetic-retry',
  'dye-ledger-recent-app-errors': 'excluded-synthetic-errors',
  [stateKey + ':shared-join-diagnostic']: 'excluded-synthetic-diagnostic',
  'the-dye-ledger-shared-device-name': 'excluded-synthetic-name',
  [canaryKey]: 'a12d5800-59a6-41f8-8b40-ff3a2ca4bf11',
};

function sourceState() {
  const fixture = visualFixture().state;
  fixture.matches.push({
    ...structuredClone(fixture.matches[0]), id: 'synthetic-shared', storageMode: 'shared',
    sharedMatchId: 'DYE-230001', sharedMatchRef: 'DYE-230001', sharedHostDeviceId: deviceId,
    sharedScoreQueueRecovery: { [operation.key]: operation },
    sharedSyncDiagnostics: [{ code: 'SYNTHETIC_ROUND_DIAGNOSTIC' }],
  });
  return fixture;
}

async function withBrowser(run) {
  assert.ok(chrome, 'Set CHROME_PATH for the required recovery export checks.');
  const server = await startServer();
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, protocolTimeout: 15000,
      args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'] });
    await run(browser, origin);
  } finally {
    try { await browser?.close(); }
    finally { await new Promise(resolve => server.close(resolve)); }
  }
}

async function observe(page, origin, options = {}) {
  const requests = [];
  const sockets = [];
  const errors = [];
  let heldModule;
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', event => sockets.push(event.url));
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    requests.push(url);
    if (!url.startsWith(origin + '/')) return request.abort();
    if (new URL(url).pathname === '/recovery-file.js') {
      if (options.missingModule) return request.respond({ status: 404, body: 'Synthetic missing module' });
      if (options.holdModule) {
        heldModule = request;
        return;
      }
    }
    return request.continue();
  });
  await page.evaluateOnNewDocument(({ seed, unsupportedHash, fallbackDatabase }) => {
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    Object.defineProperty(navigator, 'serviceWorker', { value: {
      controller: null, ready: Promise.resolve({ active: null }), addEventListener() {},
      register: async () => ({ active: null, addEventListener() {}, update: async () => {} }),
      getRegistrations: async () => [],
    } });
    if (seed) for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
    if (unsupportedHash) Object.defineProperty(crypto, 'subtle', { value: undefined });
    if (fallbackDatabase) Object.defineProperty(indexedDB, 'databases', { value: undefined });
    window.recoveryTestStorageWrites = [];
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.recoveryTestStorageWrites.push([this === localStorage ? 'local' : 'session', method, args[0]]);
        return original.apply(this, args);
      };
    }
    window.recoveryTestDatabaseWrites = [];
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
      if (mode === 'readwrite') window.recoveryTestDatabaseWrites.push(stores);
      return transaction.call(this, stores, mode, ...args);
    };
    const open = indexedDB.open.bind(indexedDB);
    window.recoveryTestDatabaseOpens = [];
    indexedDB.open = (...args) => {
      window.recoveryTestDatabaseOpens.push(args);
      return open(...args);
    };
  }, options);
  return { requests, sockets, errors, cdp, releaseModule: () => heldModule.continue() };
}

async function openDataTools(page) {
  await page.click(toolsButton);
  await page.waitForSelector(saveButton, { visible: true });
}

async function waitModuleState(page, ...states) {
  await page.waitForFunction((selector, states) => states.includes(document.querySelector(selector)?.dataset.recoveryFileState),
    { timeout: 5000, polling: 50 }, saveButton, states);
}

async function openSource(context, origin, options = {}) {
  const page = await context.newPage();
  const seed = options.seed ?? { [stateKey]: JSON.stringify(sourceState()) };
  const trace = await observe(page, origin, { ...options, seed });
  await page.goto(origin + '/index.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.getElementById('appVersionFooter')?.textContent.startsWith('v'));
  await page.click('[data-tab="settings"]');
  if (!options.deferTools) {
    await openDataTools(page);
    await waitModuleState(page, 'ready', 'unavailable', 'blocked');
  }
  return { page, trace };
}

async function downloads(browser, context) {
  const folder = await mkdtemp(join(tmpdir(), 'dye-recovery-export-'));
  const session = await browser.target().createCDPSession();
  const started = [];
  const finished = new Set();
  session.on('Browser.downloadWillBegin', event => started.push(event));
  session.on('Browser.downloadProgress', event => {
    if (event.state === 'completed') finished.add(event.guid);
  });
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', browserContextId: context.id,
    downloadPath: folder, eventsEnabled: true });
  return {
    async file() {
      const deadline = Date.now() + 5000;
      while ((!started.length || !finished.has(started[0].guid)) && Date.now() < deadline) await delay(25);
      assert.equal(started.length, 1, 'exactly one real download');
      assert.ok(finished.has(started[0].guid), 'Chrome completed the download');
      const name = started[0].suggestedFilename;
      const path = join(folder, name);
      return { name, path, bytes: await readFile(path) };
    },
    async assertNone() {
      assert.deepEqual(started, []);
      assert.deepEqual(await readdir(folder), []);
    },
    close: () => session.detach(),
  };
}

async function databaseCensus(page) {
  return page.evaluate(async () => ({
    db: typeof indexedDB.databases === 'function' ? await indexedDB.databases() : null,
    caches: await caches.keys(),
    storage: [localStorage, sessionStorage].map(store => Object.fromEntries(
      Object.keys(store).sort().map(key => [key, store.getItem(key)]))),
  }));
}

async function seedSections(page) {
  return page.evaluate(async ({ raw, excluded, receipt }) => {
    Object.entries({ ...raw, ...excluded }).forEach(([key, value]) => localStorage.setItem(key, value));
    sessionStorage.setItem('synthetic-session-key', 'excluded-synthetic-session');
    await DyeLedgerPreservedReview.auditStore().put(receipt);
    return JSON.parse(JSON.stringify(state));
  }, { raw: rawValues, excluded, receipt });
}

async function resetTracking(page, trace) {
  await page.evaluate(() => {
    recoveryTestStorageWrites.length = 0;
    recoveryTestDatabaseWrites.length = 0;
    recoveryTestDatabaseOpens.length = 0;
  });
  trace.requests.length = 0;
  trace.sockets.length = 0;
}

async function waitStatus(page, match) {
  await page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent.includes(text),
    { timeout: 5000 }, statusSelector, match);
  return page.$eval(statusSelector, node => node.textContent);
}

async function assertNoSaveWrites(page, trace) {
  const observed = await page.evaluate(() => [recoveryTestStorageWrites, recoveryTestDatabaseWrites]);
  assert.deepEqual(observed, [[], []]);
  assert.deepEqual(trace.requests, []);
  assert.deepEqual(trace.sockets, []);
  assert.deepEqual(trace.errors, []);
}

test('T-A1–A4 downloads and verifies the actual recovery bytes without writes or requests', { timeout: 30000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    const download = await downloads(browser, context);
    try {
      const { page, trace } = await openSource(context, origin);
      const expectedState = await seedSections(page);
      const before = await databaseCensus(page);
      await resetTracking(page, trace);
      await page.click(saveButton);
      const status = await waitStatus(page, 'SHA-256');
      const { name, bytes } = await download.file();
      assert.match(name, /^the-dye-ledger-recovery-\d{4}-\d{2}-\d{2}\.json$/);
      const text = bytes.toString('utf8');
      const parsed = api.parseRecoveryFile(text);
      assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
      const verification = await api.verifyRecoveryFile(parsed.file);
      assert.equal(verification.ok, true, JSON.stringify(verification.errors));
      assert.equal(Object.keys(parsed.file.manifest.sections).length, 10);
      assert.equal(parsed.file.rounds.length, expectedState.matches.length);
      assert.deepEqual(parsed.file.payload, {
        state: expectedState, outbox: JSON.parse(rawValues[outboxKey]), reviewReceipts: [receipt],
        finishRecovery: rawValues[stateKey + ':finish-recovery'], setupDraft: rawValues[stateKey + ':setup-draft'],
        coursePublishRecovery: rawValues[stateKey + ':course-publish-recovery:v1'],
        pendingLedger: { acceptance: rawValues['dye-ledger:pending-ledger-entry-acceptance'],
          revision: rawValues['dye-ledger:pending-ledger-entry-revision'] },
        templates: rawValues['dyeLedger.matchTemplates.v1'], preferences: rawValues['dyeLedger.playerPreferences'],
        deviceIdentity: { deviceId },
      });
      const shared = parsed.file.payload.state.matches.find(match => match.id === 'synthetic-shared');
      assert.equal(shared.sharedSyncDiagnostics[0].code, 'SYNTHETIC_ROUND_DIAGNOSTIC');
      assert.deepEqual(shared.sharedScoreQueueRecovery[operation.key], operation);
      for (const value of [...Object.values(excluded), 'excluded-synthetic-session']) assert.ok(!text.includes(value));
      assert.ok(status.includes(parsed.file.meta.fileId));
      assert.ok(status.includes(createHash('sha256').update(bytes).digest('hex')));
      assert.deepEqual(await databaseCensus(page), before);
      await assertNoSaveWrites(page, trace);
    } finally {
      await download.close();
      await context.close();
    }
  });
});

test('T-A4 an absent receipt database stays absent with and without database enumeration', { timeout: 30000 }, async () => {
  await withBrowser(async (browser, origin) => {
    for (const fallbackDatabase of [false, true]) {
      const context = await browser.createBrowserContext();
      const download = await downloads(browser, context);
      try {
        const { page, trace } = await openSource(context, origin, { fallbackDatabase });
        const list = () => page.evaluate(() => IDBFactory.prototype.databases.call(indexedDB));
        assert.deepEqual(await list(), []);
        await resetTracking(page, trace);
        await page.click(saveButton);
        await waitStatus(page, 'SHA-256');
        const { bytes } = await download.file();
        assert.deepEqual(api.parseRecoveryFile(bytes.toString('utf8')).file.payload.reviewReceipts, []);
        assert.deepEqual(await list(), []);
        assert.deepEqual(await page.evaluate(() => recoveryTestDatabaseOpens),
          fallbackDatabase ? [[databaseName], [databaseName]] : []);
        await assertNoSaveWrites(page, trace);
      } finally {
        await download.close();
        await context.close();
      }
    }
  });
});

async function restoredFixture({ active = true, setupDraft = null, preferences = null } = {}) {
  const fixture = sourceState();
  if (!active) fixture.activeMatchId = null;
  const file = await api.buildRecoveryFile({ state: fixture, setupDraft, preferences, outbox: JSON.parse(rawValues[outboxKey]),
    reviewReceipts: [], deviceIdentity: { deviceId } }, {
    appVersion: 'synthetic', createdAt: '2026-10-10T18:00:00.000Z',
    sourceOrigin: 'loopback-fixture', fileId: 'synthetic-recovery',
  });
  const plan = await api.planRestore(api.serialize(file), {
    profileNonce: excluded[canaryKey], restoredAt: '2026-10-10T18:00:00.000Z',
  });
  assert.equal(plan.marker.phase, 'restoring');
  assert.ok(plan.values[api.restoreKeys.state], 'fixture has a planned primary state');
  return { ...plan.values, [api.restoreKeys.marker]: JSON.stringify({
    ...plan.marker, phase: 'restored-verified', completedAt: '2026-10-10T18:00:00.000Z',
    results: { rounds: file.rounds.length, receipts: 0, backup: 'verified' },
  }) };
}

test('T-A5 G1, G4 and G5 block both recovery tools', { timeout: 30000 }, async t => {
  const g1 = await restoredFixture();
  const { [api.restoreKeys.marker]: ignoredMarker, ...g4 } = g1;
  const g5 = { ...g4, [api.restoreKeys.scoreHold]: '{' };
  await withBrowser(async (browser, origin) => {
    for (const [mode, seed] of Object.entries({ G1: g1, G4: g4, G5: g5 })) {
      await t.test(mode, async () => {
        const context = await browser.createBrowserContext();
        const download = await downloads(browser, context);
        try {
          const { page, trace } = await openSource(context, origin, { seed });
          assert.equal(await page.evaluate(() => window.__DYE_RECOVERY_GUARD__?.state), mode);
          await waitModuleState(page, 'blocked');
          assert.deepEqual(trace.requests.filter(url => url.startsWith(origin + '/recovery-file.js')),
            [origin + '/recovery-file.js']);
          const before = await databaseCensus(page);
          await resetTracking(page, trace);
          await page.click(saveButton);
          await waitStatus(page, 'only in an ordinary app profile');
          await page.click('#showRecoveryIsolationCodeBtn');
          await waitStatus(page, 'Could not show the isolation code');
          assert.deepEqual(await databaseCensus(page), before);
          await assertNoSaveWrites(page, trace);
          await download.assertNone();
        } finally {
          await download.close();
          await context.close();
        }
      });
    }
  });
});

test('T-A5 an in-flight review or a malformed outbox refuses the export', { timeout: 25000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    const download = await downloads(browser, context);
    try {
      const { page, trace } = await openSource(context, origin);
      await page.evaluate(() => preservedReviewInflight.set('synthetic', new Promise(() => {})));
      await resetTracking(page, trace);
      await page.click(saveButton);
      await waitStatus(page, 'Wait for the score review to finish');
      await assertNoSaveWrites(page, trace);
      await page.evaluate(key => {
        preservedReviewInflight.clear();
        localStorage.setItem(key, '{');
      }, outboxKey);
      await resetTracking(page, trace);
      await page.click(saveButton);
      await waitStatus(page, 'Could not read saved score delivery data');
      await assertNoSaveWrites(page, trace);
      await download.assertNone();
    } finally {
      await download.close();
      await context.close();
    }
  });
});

test('T-A5 changes to primary state, receipts, passive data or the recovery marker abort a save in progress', { timeout: 35000 }, async t => {
  await withBrowser(async (browser, origin) => {
    for (const change of ['primary', 'receipts', 'passive', 'stale']) {
      await t.test(change, async () => {
        const context = await browser.createBrowserContext();
        const download = await downloads(browser, context);
        try {
          const { page, trace } = await openSource(context, origin);
          await seedSections(page);
          const writer = await context.newPage();
          await writer.goto(origin + '/manifest.json');
          const visibilityBefore = await page.evaluate(() => document.visibilityState);
          // A trusted click and the page's polling need the source tab in the foreground.
          await page.bringToFront();
          await page.waitForFunction(() => document.visibilityState === 'visible', { polling: 50, timeout: 5000 });
          console.log(`T-A5 ${change}: source visibility before foregrounding: ${visibilityBefore}`);
          await page.evaluate(pauseReceiptRead => {
            const pause = async () => {
              window.recoveryTestSavePaused = true;
              await new Promise(resolve => { window.resumeRecoveryTestSave = resolve; });
            };
            if (pauseReceiptRead) {
              const databases = indexedDB.databases.bind(indexedDB);
              let first = true;
              indexedDB.databases = async () => {
                if (first) {
                  first = false;
                  await pause();
                }
                return databases();
              };
            } else {
              const hash = DyeLedgerRecoveryFile.sha256Hex;
              DyeLedgerRecoveryFile.sha256Hex = async value => {
                await pause();
                return hash(value);
              };
            }
          }, change === 'passive');
          await resetTracking(page, trace);
          await page.click(saveButton);
          await page.waitForFunction(() => window.recoveryTestSavePaused, { timeout: 5000 });
          console.log(`T-A5 ${change}: export paused after initial capture`);
          await writer.evaluate(async ({ change, stateKey, marker, receipt, database }) => {
            if (change === 'primary') {
              const data = JSON.parse(localStorage.getItem(stateKey));
              data.notes = 'Synthetic save in a sibling tab';
              localStorage.setItem(stateKey, JSON.stringify(data));
            } else if (change === 'stale') {
              localStorage.setItem(marker, '{"phase":"restoring"}');
            } else if (change === 'passive') {
              localStorage.setItem(stateKey + ':setup-draft', '{"name":"Changed in a sibling tab"}');
            } else {
              const db = await new Promise((resolve, reject) => {
                const request = indexedDB.open(database);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              try {
                await new Promise((resolve, reject) => {
                  const transaction = db.transaction('receipts', 'readwrite');
                  transaction.objectStore('receipts').put({ ...receipt, note: 'Receipt changed in a sibling tab' });
                  transaction.oncomplete = resolve;
                  transaction.onabort = () => reject(transaction.error);
                });
              } finally {
                db.close();
              }
            }
          }, { change, stateKey, marker: api.restoreKeys.marker, receipt, database: databaseName });
          await page.evaluate(() => window.resumeRecoveryTestSave());
          if (change === 'stale') {
            await page.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('Recovery started'));
            await page.waitForFunction(() => !recoverySaveInProgress, { timeout: 5000 });
          } else {
            await waitStatus(page, change === 'receipts' ? 'Your review receipts changed while saving' : 'Your data changed while saving');
          }
          await assertNoSaveWrites(page, trace);
          await download.assertNone();
          console.log(`T-A5 ${change}: concurrent mutation refused, no download`);
        } finally {
          await download.close();
          await context.close();
        }
      });
    }
  });
});

test('T-A6 and T-A7 unavailable or unreadable sources refuse without writes', { timeout: 35000 }, async t => {
  await withBrowser(async (browser, origin) => {
    for (const [label, options, message] of [
      ['unreadable receipts', {}, 'Could not read saved review receipts'],
      ['missing module', { missingModule: true }, "Recovery file isn't available here"],
      ['missing hash', { unsupportedHash: true }, "Recovery file isn't available here"],
    ]) {
      await t.test(label, async () => {
        const context = await browser.createBrowserContext();
        const download = await downloads(browser, context);
        try {
          const { page, trace } = await openSource(context, origin, options);
          if (label === 'unreadable receipts') {
            await page.evaluate(database => new Promise((resolve, reject) => {
              const request = indexedDB.open(database, 1);
              request.onupgradeneeded = () => request.result.createObjectStore('synthetic-wrong-store');
              request.onsuccess = () => { request.result.close(); resolve(); };
              request.onerror = () => reject(request.error);
            }), databaseName);
          }
          const before = await databaseCensus(page);
          if (label === 'missing module') await waitModuleState(page, 'unavailable');
          await resetTracking(page, trace);
          await page.click(saveButton);
          await waitStatus(page, message);
          if (label === 'missing module') {
            await page.click(saveButton);
            await waitStatus(page, message);
          }
          assert.deepEqual(await databaseCensus(page), before);
          await assertNoSaveWrites(page, trace);
          await download.assertNone();
        } finally {
          await download.close();
          await context.close();
        }
      });
    }
  });
});

test('L1 opening Data Tools loads the versioned recovery module exactly once', { timeout: 25000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    try {
      const { page, trace } = await openSource(context, origin, { deferTools: true });
      const moduleRequests = () => trace.requests.filter(url => url.startsWith(origin + '/recovery-file.js'));
      assert.deepEqual(moduleRequests(), []);
      await openDataTools(page);
      await waitModuleState(page, 'ready');
      const expected = [origin + '/recovery-file.js?v=' + encodeURIComponent(currentVersionBare)];
      assert.deepEqual(moduleRequests(), expected);
      await page.click('#settings [data-experience-back]');
      await openDataTools(page);
      await waitModuleState(page, 'ready');
      assert.deepEqual(moduleRequests(), expected);
    } finally {
      await context.close();
    }
  });
});

test('L2 Save during module loading sends no requests and creates no file', { timeout: 25000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    const download = await downloads(browser, context);
    try {
      const { page, trace } = await openSource(context, origin, { deferTools: true, holdModule: true });
      const requested = page.waitForRequest(url => url.url().startsWith(origin + '/recovery-file.js?v='), { timeout: 5000 });
      await openDataTools(page);
      await requested;
      await waitModuleState(page, 'loading');
      const before = await databaseCensus(page);
      await resetTracking(page, trace);
      await page.click(saveButton);
      await waitStatus(page, 'Recovery tools are still loading');
      await assertNoSaveWrites(page, trace);
      assert.deepEqual(await databaseCensus(page), before);
      await download.assertNone();
      await trace.releaseModule();
      await waitModuleState(page, 'ready');
    } finally {
      await download.close();
      await context.close();
    }
  });
});

test('L4 Save with a simulated offline cold cache sends no requests and creates no file', { timeout: 25000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    const download = await downloads(browser, context);
    try {
      const { page, trace } = await openSource(context, origin, { deferTools: true });
      assert.deepEqual(await page.evaluate(() => caches.keys()), []);
      await trace.cdp.send('Network.emulateNetworkConditions', {
        offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
      });
      await openDataTools(page);
      await waitModuleState(page, 'unavailable');
      const before = await databaseCensus(page);
      await resetTracking(page, trace);
      await page.click(saveButton);
      await waitStatus(page, "Recovery file isn't available here");
      await assertNoSaveWrites(page, trace);
      assert.deepEqual(await databaseCensus(page), before);
      await download.assertNone();
    } finally {
      await download.close();
      await context.close();
    }
  });
});

async function openRecovery(context, origin) {
  const page = await context.newPage();
  const trace = await observe(page, origin);
  await page.goto(origin + '/recovery.html', { waitUntil: 'networkidle0' });
  await page.click('#checkIsolation');
  await page.waitForFunction(() => !document.getElementById('canaryProof').hidden);
  return { page, trace };
}

async function confirmRecovery(page, code) {
  await page.type('#originalCanary', code);
  await page.click('#canaryAbsent');
  await page.click('#confirmIsolation');
}

async function showIsolationCode(page) {
  await page.click('#showRecoveryIsolationCodeBtn');
  const status = await waitStatus(page, 'Isolation code ');
  return status.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
}

test('T-B1 an app isolation code is accepted only in a separate profile', { timeout: 30000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const source = await browser.createBrowserContext();
    const separate = await browser.createBrowserContext();
    try {
      const { page, trace } = await openSource(source, origin);
      const before = await databaseCensus(page);
      assert.equal(before.storage[0][canaryKey], undefined);
      await resetTracking(page, trace);
      const code = await showIsolationCode(page);
      assert.ok(code, 'the app shows its UUID');
      const expected = structuredClone(before);
      expected.storage[0][canaryKey] = code;
      assert.deepEqual(await databaseCensus(page), expected);
      assert.equal(await showIsolationCode(page), code);
      assert.deepEqual(await page.evaluate(() => recoveryTestStorageWrites), [['local', 'setItem', canaryKey]]);
      assert.deepEqual(trace.requests, []);

      const { page: fresh } = await openRecovery(separate, origin);
      await confirmRecovery(fresh, code);
      await fresh.waitForSelector('#recoveryPicker input[type=file]');

      // Keep only the synthetic canary so the shared-context check reaches code comparison.
      await page.evaluate(key => {
        for (const name of Object.keys(localStorage)) if (name !== key) localStorage.removeItem(name);
      }, canaryKey);
      const { page: shared } = await openRecovery(source, origin);
      assert.equal(await shared.$eval('#recoveryCanary', field => field.value), code);
      await confirmRecovery(shared, code);
      await shared.waitForFunction(() => document.getElementById('recoveryStatus').textContent.includes('different'));
      assert.equal(await shared.$('#recoveryPicker input[type=file]'), null);
    } finally {
      await separate.close();
      await source.close();
    }
  });
});

test('T-B2 restores the downloaded bytes, verifies hold-aware hashes and fences Shared Match writes', { timeout: 35000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const source = await browser.createBrowserContext();
    const target = await browser.createBrowserContext();
    const download = await downloads(browser, source);
    try {
      const { page: original } = await openSource(source, origin);
      await seedSections(original);
      const code = await showIsolationCode(original);
      assert.ok(code);
      await original.click(saveButton);
      await waitStatus(original, 'SHA-256');
      const { path, bytes } = await download.file();
      const parsed = api.parseRecoveryFile(bytes.toString('utf8'));
      assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
      const artifactHash = createHash('sha256').update(bytes).digest('hex');

      const { page: recovery, trace: recoveryTrace } = await openRecovery(target, origin);
      await confirmRecovery(recovery, code);
      const picker = await recovery.waitForSelector('#recoveryPicker input[type=file]');
      await picker.uploadFile(path);
      await recovery.waitForFunction(() => document.getElementById('recoveryStatus').textContent.includes('File verified'));
      await recovery.click('#restoreRecovery');
      await recovery.waitForFunction(() => document.getElementById('recoveryStatus').textContent.includes('Verified recovery:'));
      const restored = await databaseCensus(recovery);
      const raw = restored.storage[0];
      const marker = JSON.parse(raw[api.restoreKeys.marker]);
      const hold = JSON.parse(raw[api.restoreKeys.scoreHold]);
      const restoredState = JSON.parse(raw[stateKey]);
      assert.equal(marker.fileSha256, artifactHash);
      assert.equal(marker.results.rounds, parsed.file.rounds.length);
      assert.equal(restoredState.matches.length, parsed.file.rounds.length);
      for (const round of parsed.file.rounds) {
        const match = restoredState.matches.find(candidate => candidate.id === round.roundId);
        assert.ok(match, round.roundId);
        const reconstructed = { ...match, ...hold.queueRecovery[round.roundId] };
        assert.equal(await api.sha256Hex(api.canonical(reconstructed)), round.canonicalSha256, round.roundId);
      }
      assert.deepEqual(hold.heldMatchIds, ['synthetic-shared', operation.matchId]);
      assert.deepEqual(hold.operations, [operation]);
      assert.deepEqual(hold.queueRecovery['synthetic-shared'].sharedScoreQueueRecovery[operation.key], operation);
      assert.equal(restoredState.matches.find(match => match.id === 'synthetic-shared').sharedScoreQueueRecovery, undefined);
      assert.equal(raw[outboxKey], undefined);
      assert.deepEqual(recoveryTrace.errors, []);
      assert.ok(recoveryTrace.requests.every(url => url.startsWith(origin + '/')));

      const app = await target.newPage();
      const appTrace = await observe(app, origin);
      await app.goto(origin + '/index.html', { waitUntil: 'networkidle0' });
      assert.equal(await app.evaluate(() => window.__DYE_RECOVERY_GUARD__?.state), 'G1');
      assert.ok(appTrace.requests.every(url => url.startsWith(origin + '/')), 'no CDN or outbound requests during G1 startup');
      assert.deepEqual(appTrace.sockets, []);
      const boot = await databaseCensus(app);
      console.log('T-B2 synthetic G1 draft bytes', JSON.stringify({
        before: raw[draftKey], after: boot.storage[0][draftKey],
      }));
      assert.deepEqual(await app.evaluate(() => [recoveryTestStorageWrites, recoveryTestDatabaseWrites]), [[], []]);
      assert.deepEqual(boot.storage[0], raw);
      assert.ok(Object.keys(boot.storage[0]).every(key => !/shared-device-id|shared-participant|account-auth|delivery-retry/.test(key)));
      await resetTracking(app, appTrace);
      const proof = await app.evaluate(async () => {
        Object.defineProperty(navigator, 'onLine', { value: true });
        let clients = 0;
        window.supabase = { createClient() { clients++; throw new Error('Unexpected client construction'); } };
        const match = getMatch('synthetic-shared');
        const held = isRecoveryHeldMatch(match);
        const allowed = canAttemptSharedDelivery(match);
        const result = await drainPendingSharedScoreOperationsForMatch(match);
        scheduleSharedMatchSync(match, { immediate: true });
        window.dispatchEvent(new Event('online'));
        await drainPendingSharedScoreOutboxes();
        return { held, allowed, skipped: result.skipped, resultHeld: result.held, clients,
          sdk: !!document.querySelector('script[src*="cdn.jsdelivr.net"]'),
          storedReceipts: await readRecoveryReviewReceipts() };
      });
      assert.deepEqual(proof, { held: true, allowed: false, skipped: true, resultHeld: true,
        clients: 0, sdk: false, storedReceipts: [receipt] });
      assert.deepEqual(await databaseCensus(app), boot);
      await assertNoSaveWrites(app, appTrace);
      console.log(`T-B2 retained synthetic download: ${path}; SHA-256 ${artifactHash}`);
    } finally {
      await download.close();
      await target.close();
      await source.close();
    }
  });
});

test('G1 preserves a restored draft at startup and saves an intentional edit with no active round', { timeout: 25000 }, async () => {
  const originalDraft = '{"name":"Restored draft for editing"}';
  const seed = await restoredFixture({
    active: false, setupDraft: originalDraft, preferences: rawValues['dyeLedger.playerPreferences'],
  });
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      const trace = await observe(page, origin, { seed });
      await page.goto(origin + '/index.html', { waitUntil: 'networkidle0' });
      const startup = await page.evaluate(key => ({
        mode: window.__DYE_RECOVERY_GUARD__?.state, active: state.activeMatchId,
        draft: localStorage.getItem(key), writes: recoveryTestStorageWrites,
      }), draftKey);
      assert.deepEqual(startup, { mode: 'G1', active: null, draft: originalDraft, writes: [] });
      await resetTracking(page, trace);
      const course = await page.waitForSelector('[data-open-setup-destination="course"]', { visible: true, timeout: 5000 });
      await course.click();
      const name = await page.waitForSelector('#matchForm input[name="name"]', { visible: true, timeout: 5000 });
      assert.equal(await name.evaluate(input => input.value), 'Restored draft for editing');
      await name.click({ clickCount: 3 });
      await page.keyboard.sendCharacter('Intentional G1 draft edit');
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.name === 'Intentional G1 draft edit',
        { timeout: 5000 }, draftKey);
      const writes = await page.evaluate(() => recoveryTestStorageWrites);
      assert.ok(writes.length > 0);
      assert.ok(writes.every(row => row.join(':') === `local:setItem:${draftKey}`));
      assert.equal(await page.evaluate(key => localStorage.getItem(key), api.restoreKeys.scoreHold), seed[api.restoreKeys.scoreHold]);
      assert.deepEqual(trace.requests.filter(url => !url.startsWith('data:image/svg+xml;base64,')), []);
      assert.deepEqual(trace.sockets, []);
      assert.deepEqual(trace.errors, []);
    } finally {
      await context.close();
    }
  });
});

test('T-B3 an older persisted round is normalized and exported as a complete verified file', { timeout: 25000 }, async () => {
  await withBrowser(async (browser, origin) => {
    const context = await browser.createBrowserContext();
    const download = await downloads(browser, context);
    try {
      const legacy = visualFixture().state;
      const olderRound = legacy.matches[0];
      delete olderRound.storageMode;
      delete olderRound.holeCount;
      const { page, trace } = await openSource(context, origin, {
        seed: { [stateKey]: JSON.stringify(legacy), [draftKey]: '{"name":"G0 startup control"}' },
      });
      const startup = await page.evaluate(key => ({
        recovery: window.__DYE_RECOVERY_GUARD__?.state,
        draft: localStorage.getItem(key),
        draftWrites: recoveryTestStorageWrites.filter(row => row[2] === key),
      }), draftKey);
      assert.equal(startup.recovery, undefined);
      assert.equal(JSON.parse(startup.draft).name, '');
      assert.deepEqual(startup.draftWrites, [['local', 'setItem', draftKey]]);
      const expected = await page.evaluate(() => JSON.parse(JSON.stringify(state.matches[0])));
      assert.equal(expected.storageMode, 'local');
      const before = await databaseCensus(page);
      await resetTracking(page, trace);
      await page.click(saveButton);
      await waitStatus(page, 'SHA-256');
      const { bytes } = await download.file();
      const parsed = api.parseRecoveryFile(bytes.toString('utf8'));
      assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
      const verification = await api.verifyRecoveryFile(parsed.file);
      assert.equal(verification.ok, true, JSON.stringify(verification.errors));
      assert.deepEqual(parsed.file.payload.state.matches, [expected]);
      assert.deepEqual(await databaseCensus(page), before);
      await assertNoSaveWrites(page, trace);
    } finally {
      await download.close();
      await context.close();
    }
  });
});
