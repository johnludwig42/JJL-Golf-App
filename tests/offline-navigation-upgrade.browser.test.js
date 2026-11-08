import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, extname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { scrambleFixture } from './support/scramble-fixture.js';
import { currentVersionBare, currentVersionPrefixed } from './support/release-identity.js';
import { settledSnapshot, captureStorage, comparePersistence } from './support/persistence-census.js';

const BASELINE_COMMIT = '4cfe74b';
// Class D: sole old-version literal, used only to assert the declared baseline.
const EXPECTED_BASELINE_VERSION = '31.0.84';
const baselineVersion = JSON.parse(execFileSync('git', ['show', BASELINE_COMMIT + ':package.json'], { encoding: 'utf8' })).version;
assert.notEqual(currentVersionBare, baselineVersion, 'release identity not applied');
assert.equal(baselineVersion, EXPECTED_BASELINE_VERSION);
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const root = resolve('.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

function exportBaseline() {
  const parent = mkdtempSync(join(tmpdir(), 'dye-offline-upgrade-baseline-'));
  const folder = join(parent, 'baseline');
  const archive = join(parent, 'baseline.tar');
  mkdirSync(folder);
  execFileSync('git', ['archive', '--format=tar', '--output=' + archive, BASELINE_COMMIT]);
  execFileSync('tar', ['-xf', archive, '-C', folder]);
  return { parent, folder, archive };
}

async function startFixture(scope, baselineRoot) {
  let offline = false;
  let serving = baselineRoot;
  const requests = [];
  const sockets = new Set();
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method, offline, source: serving === baselineRoot ? 'baseline' : 'working', at: new Date().toISOString() });
    if (offline) { request.socket.destroy(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith(scope)) { response.writeHead(404); response.end(); return; }
    const relative = url.pathname.slice(scope.length) || 'index.html';
    if (['__observer.html', 'staging-sign-in', 'staging-sign-in.html'].includes(relative)) {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><title>LOCAL FIXTURE</title><p>Fixture page</p>'); return;
    }
    if (relative === 'supabase-config.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      response.end('window.__DYE_SUPABASE_CONFIG__={};'); return;
    }
    const file = resolve(serving, decodeURIComponent(relative));
    if (!file.startsWith(serving + sep)) { response.writeHead(403); response.end(); return; }
    try {
      const bytes = readFileSync(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { url: 'http://127.0.0.1:' + server.address().port + scope, requests,
    setOffline(value) { offline = value; }, switchToWorkingTree() { serving = root; },
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(done => server.close(done)); },
  };
}
function seed() {
  const data = scrambleFixture();
  const engine = loadLiveEngine();
  const active = structuredClone(data.match);
  Object.assign(active, { id: 'offline-active', name: 'Offline Active', storageMode: 'local', scoringAccessMode: 'single_device', sharedMatchId: '', sharedMatchCode: '' });
  // A scramble is valid only in assigned shared mode. Use a valid four-golfer
  // local round for isolated navigation; do not bypass the app's format gates.
  delete active.teamScoringPolicyVersion;
  delete active.assignedTeamIndexPolicyVersion;
  active.teamCount = 2;
  active.players = active.players.slice(0, 4);
  active.players.forEach(player => { delete player.assignedTeamIndex; });
  active.players.forEach(player => player.scores.forEach((score, i) => { score.gross = i < 3 ? player.team + 2 : null; }));
  const finished = structuredClone(active);
  Object.assign(finished, { id: 'offline-frozen', name: 'Offline Frozen', status: 'complete', completedAt: '2026-01-01T12:00:00.000Z', roundRecapFinal: 'The synthetic teams completed their round. The scorecard preserves the result.' });
  finished.players.forEach(player => player.scores.forEach(score => { score.gross = player.team + 2; }));
  const state = engine.seedState({ courses: [data.course], players: data.players.slice(0, 4), matches: [active, finished], activeMatchId: active.id, completedSummaryMatchId: null });
  const round = state.matches.find(match => match.id === finished.id);
  const metrics = engine.computeMatchMetrics(round);
  assert.ok(metrics, 'fixture must satisfy the real engine format checks');
  round.roundRecordSnapshot = engine.buildFrozenRoundRecord(round, metrics, '2026-01-01T13:00:00.000Z');
  assert.ok(engine.buildLedgerEntryReportModel(round, metrics), 'fixture must support a real Ledger');
  return JSON.parse(JSON.stringify(state));
}


for (const scope of ['/', '/JJL-Golf-App/']) {
  test('real app-controlled upgrade and persistence census at ' + scope, { skip: !chrome, timeout: 240000 }, async t => {
    const exported = exportBaseline();
    const fixture = await startFixture(scope, exported.folder);
    const profile = mkdtempSync(join(tmpdir(), 'dye-offline-upgrade-browser-'));
    const census = [], gaps = [], loads = [], cacheStates = [], uiSteps = [];
    const externalRequests = [], inlineResources = [], pageErrors = [], consoleMessages = [], storageWrites = [], upgradeEvents = [];
    let browser, page, observer, cumulative = null;
    const oldCache = 'the-dye-ledger-v' + baselineVersion;
    const newCache = 'the-dye-ledger-' + currentVersionPrefixed;
    try {
      browser = await puppeteer.launch({ executablePath: chrome, userDataDir: profile, headless: true, protocolTimeout: 30000, args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
      t.diagnostic('Chrome ' + await browser.version() + '; baseline ' + baselineVersion + '; target ' + currentVersionBare);
      async function pageAt(url, initialSeed = null, isOffline = false) {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        await page.setUserAgent(userAgent);
        await page.exposeFunction('__recordStorageWrite', record => storageWrites.push(record));
        await page.evaluateOnNewDocument(() => {
          for (const operation of ['setItem', 'removeItem']) {
            const original = Storage.prototype[operation];
            Storage.prototype[operation] = function (key, ...args) {
              const result = original.call(this, key, ...args);
              const record = { key: String(key), operation, area: this === localStorage ? 'local' : 'session', url: location.href, stack: new Error().stack };
              void globalThis.__recordStorageWrite(record);
              return result;
            };
          }
        });
        await page.setRequestInterception(true);
        page.on('request', request => {
          const parsed = new URL(request.url());
          if (parsed.protocol === 'data:') { inlineResources.push(request.url()); request.continue(); return; }
          if (parsed.hostname !== '127.0.0.1') { externalRequests.push(request.url()); request.abort(); }
          else request.continue();
        });
        page.on('pageerror', error => pageErrors.push(String(error)));
        page.on('console', message => { if (message.type() === 'error') consoleMessages.push(message.text()); });
        if (initialSeed) await page.evaluateOnNewDocument((value, origin) => {
          // Chrome's own failed-navigation document has opaque storage. It is
          // not the app and must never receive the synthetic seeding script.
          if (location.origin !== origin) return;
          if (!localStorage.getItem('the-dye-ledger-v20')) localStorage.setItem('the-dye-ledger-v20', JSON.stringify(value));
        }, initialSeed, new URL(url).origin);
        await page.setOfflineMode(isOffline);
        await page.goto(url, { waitUntil: 'load' });
        return page;
      }

      page = await pageAt(fixture.url, seed());
      await page.waitForFunction(() => typeof openUnifiedExport === 'function' && navigator.serviceWorker.controller, { timeout: 20000, polling: 100 });
      assert.equal(await page.evaluate(() => APP_VERSION_NUMBER), baselineVersion);
      observer = await pageAt(fixture.url + '__observer.html');
      await page.exposeFunction('__recordUpgradeEvent', event => upgradeEvents.push(event));
      await page.evaluateOnNewDocument(() => {
        navigator.serviceWorker.addEventListener('controllerchange', () => void globalThis.__recordUpgradeEvent({ kind: 'controllerchange', at: Date.now(), url: location.href, script: navigator.serviceWorker.controller?.scriptURL }));
        window.addEventListener('load', () => void globalThis.__recordUpgradeEvent({ kind: 'load', at: Date.now(), url: location.href, version: typeof APP_VERSION_NUMBER === 'string' ? APP_VERSION_NUMBER : null }));
      });
      await observer.evaluate(async () => { await (await caches.open('offline-upgrade-unrelated-fixture')).put(new URL('unrelated-cache-probe', location.href), new Response('retain-synthetic')); });
      const first = await settledSnapshot(observer, page);
      let last = first, previousWriteEnd = storageWrites.length;
      const wholeWriteStart = storageWrites.length;
      async function cacheState(label) {
        const state = await observer.evaluate(async oldName => {
          const keys = await caches.keys();
          const response = keys.includes(oldName) ? await (await caches.open(oldName)).match(new URL('index.html', location.href)) : null;
          return { keys, bytes: response ? Array.from(new Uint8Array(await response.arrayBuffer())) : null };
        }, oldCache);
        const record = { label, keys: state.keys, oldIndexHash: state.bytes ? hash(Buffer.from(state.bytes)) : null };
        record.oldIdentity = !state.keys.includes(oldCache) ? 'absent' : record.oldIndexHash === hash(readFileSync(join(exported.folder, 'ledger-report/shell.html'))) ? 'Ledger HTML' : record.oldIndexHash === hash(readFileSync(join(exported.folder, 'index.html'))) ? 'baseline app HTML' : 'other';
        cacheStates.push(record); return record;
      }
      async function phase(label, action) {
        const before = await captureStorage(observer, page);
        const gap = comparePersistence(last, before, scope + ' gap before ' + label, storageWrites.slice(previousWriteEnd));
        gaps.push(gap); assert.deepEqual(gap.changes, [], 'storage changed between upgrade windows');
        const start = storageWrites.length;
        await action();
        const after = await settledSnapshot(observer, page);
        census.push(comparePersistence(before, after, scope + ' ' + label, storageWrites.slice(start)));
        last = after; previousWriteEnd = storageWrites.length;
        await cacheState('after ' + label);
      }
      async function offline(value) { fixture.setOffline(value); await page.setOfflineMode(value); }
      async function click(selector) {
        await page.bringToFront();
        const element = await page.waitForSelector(selector, { visible: true, timeout: 15000 });
        await element.click();
        uiSteps.push({ selector, at: new Date().toISOString() });
      }
      async function assertApp(version) {
        await page.waitForFunction(expected => typeof APP_VERSION_NUMBER === 'string' && APP_VERSION_NUMBER === expected && getActiveMatch()?.id === 'offline-active', { timeout: 20000, polling: 100 }, version);
        assert.ok(await page.$('nav.tabs')); assert.equal(await page.$('#doc'), null);
        assert.equal(await page.evaluate(() => getActiveMatch().players[0].scores[0].gross), 3);
      }
      async function openLedger(expectedVersion) {
        const returnUrl = page.url();
        const start = fixture.requests.length;
        const wasOffline = await page.evaluate(() => !navigator.onLine);
        let evaluationError = '';
        const navigation = page.waitForFunction(() => location.pathname.endsWith('/ledger-report/shell.html')
          && document.readyState === 'complete' && document.querySelector('.page'), { timeout: 20000, polling: 100 });
        const exportCall = page.evaluate(async () => {
            const round = state.matches.find(match => match.id === 'offline-frozen');
            if (!computeMatchMetrics(round)) throw new Error('Browser fixture has invalid completed-round metrics');
            const result = await openUnifiedExport(round, 'ledger');
            if (result !== true) throw new Error('App refused fixture Ledger export');
          }).catch(error => { evaluationError = String(error); });
        try { await Promise.all([navigation, exportCall]); }
        catch (error) {
          loads.push({ failure: String(error), evaluationError, serverRequests: fixture.requests.slice(start), page: await page.evaluate(() => ({
            url: location.href, readyState: document.readyState, fontStatus: document.fonts.status,
            pages: document.querySelectorAll('.page').length, body: document.body.innerText.slice(0, 2000),
            scripts: [...document.scripts].map(script => script.src), navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
            resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
          })) });
          throw error;
        }
        assert.ok(page.url().includes('ledger-report/shell.html'));
        await page.waitForSelector('.page', { timeout: 15000 });
        assert.equal(await page.$('.report-missing'), null);
        const record = await page.evaluate(() => {
          const entry = performance.getEntriesByType('navigation')[0];
          const key = globalThis.__DYE_LEDGER_REPORT_TRANSFER_KEY__;
          return { navigation: entry.toJSON(), roundId: globalThis.__DYE_LEDGER_ROUND__?.meta?.roundId,
            returnUrl: globalThis.__DYE_LEDGER_RETURN_URL__, key,
            consumed: sessionStorage.getItem('dye-ledger-report:last-consumed'), retainedTransfer: sessionStorage.getItem(key) };
        });
        record.evaluationError = evaluationError;
        record.serverRequests = fixture.requests.slice(start);
        loads.push(record);
        assert.equal(record.navigation.responseStatus, 200);
        assert.ok(record.navigation.workerStart > 0, 'navigation handled by service worker');
        const original = new URL(record.navigation.name);
        assert.equal(original.pathname, new URL('ledger-report/shell.html', fixture.url).pathname);
        assert.equal(original.searchParams.get('reportKey'), record.key);
        assert.equal(page.url(), new URL(`ledger-report/shell.html?v=${expectedVersion}`, fixture.url).href);
        assert.ok(record.key.startsWith('dye-ledger-report-'));
        assert.equal(record.roundId, 'offline-frozen');
        assert.equal(record.returnUrl, returnUrl);
        assert.ok(Number(record.consumed) > 0, 'bootstrap consumed a valid transfer');
        assert.equal(JSON.parse(record.retainedTransfer).report.meta.roundId, record.roundId);
        const transferWrite = storageWrites.findIndex(row => row.key === record.key && row.operation === 'setItem');
        const consumedWrite = storageWrites.findIndex((row, i) => i > transferWrite && row.key === 'dye-ledger-report:last-consumed' && row.operation === 'setItem');
        assert.ok(transferWrite >= 0 && consumedWrite > transferWrite, 'session transfer created before bootstrap consumed marker');
        const ledgerRequests = record.serverRequests.filter(row => !row.offline && new URL(row.url, fixture.url).pathname === original.pathname);
        assert.equal(ledgerRequests.length, wasOffline ? 0 : 1, 'online Ledger reaches server once; offline Ledger uses cache');
        if (evaluationError) assert.match(evaluationError, /Execution context was destroyed/);
      }
      await cacheState('settled baseline');
      await phase('old Ledger contamination', async () => {
        await openLedger(baselineVersion);
        const contaminated = await cacheState('contamination proved before return');
        assert.equal(contaminated.oldIdentity, 'Ledger HTML');
      });
      await phase('return for update controls', async () => {
        await click('#returnToMatchBtn');
        await page.waitForFunction(url => location.href === url && document.readyState === 'complete' && typeof getActiveMatch === 'function', { timeout: 15000, polling: 100 }, fixture.url);
        await assertApp(baselineVersion);
      });
      await phase('app-controlled upgrade', async () => {
        fixture.switchToWorkingTree();
        await cacheState('working tree switched, before update check');
        await click('nav.tabs [data-tab="settings"]');
        await click('#settings [data-experience-target="support"]');
        await click('#pwaCheckForUpdatesBtn');
        await page.waitForFunction(() => !!window.dyeLedgerServiceWorkerRegistration?.waiting, { timeout: 20000, polling: 100 });
        const safety = await page.evaluate(() => ({ reason: getUnsafeReloadReason(), status: document.getElementById('appUpdateStatusMessage')?.textContent, waiting: window.dyeLedgerServiceWorkerRegistration?.waiting?.scriptURL }));
        uiSteps.push({ safety });
        assert.equal(safety.reason, '', 'UI must reach a safe update state without changing protected data');
        await cacheState('waiting update, before Install Update');
        await click('#pwaRefreshNowBtn');
        await assertApp(currentVersionBare);
        assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0].type), 'reload', 'app must reload itself');
        assert.ok(upgradeEvents.some(event => event.kind === 'controllerchange'), 'controllerchange observed before reload');
        await cacheState('app reloaded new identity');
      });
      await phase('new Ledger then fresh app offline', async () => {
        await openLedger(currentVersionBare);
        // Disconnect while still in Ledger; no online return may repair cache.
        await offline(true);
        page = await pageAt(fixture.url, null, true);
        await assertApp(currentVersionBare);
        const state = await cacheState('fresh app opened offline');
        assert.equal(state.oldIdentity, 'absent');
        const appBytes = await observer.evaluate(async name => Array.from(new Uint8Array(await (await (await caches.open(name)).match(new URL('index.html', location.href))).arrayBuffer())), newCache);
        assert.equal(hash(Buffer.from(appBytes)), hash(readFileSync('index.html')));
      });
      await phase('new Ledger offline', async () => {
        await openLedger(currentVersionBare);
        const bytes = await observer.evaluate(async name => Array.from(new Uint8Array(await (await (await caches.open(name)).match(new URL('ledger-report/shell.html', location.href))).arrayBuffer())), newCache);
        assert.equal(hash(Buffer.from(bytes)), hash(readFileSync('ledger-report/shell.html')));
      });
      const keys = await observer.evaluate(async name => ({ all: await caches.keys(), current: (await (await caches.open(name)).keys()).map(request => request.url), unrelated: await (await (await caches.open('offline-upgrade-unrelated-fixture')).match(new URL('unrelated-cache-probe', location.href))).text() }), newCache);
      const precache = [...readFileSync('service-worker.js','utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => new URL(match[1], fixture.url).href);
      assert.deepEqual(keys.current.slice().sort(), precache.slice().sort(), 'exact current precache key set');
      assert.equal(keys.all.includes(oldCache), false); assert.equal(keys.unrelated, 'retain-synthetic');
      loads.push({ cacheKeys: keys, expectedPrecache: precache });
      const final = await settledSnapshot(observer, page);
      const tail = comparePersistence(last, final, scope + ' gap final', storageWrites.slice(previousWriteEnd));
      gaps.push(tail); assert.deepEqual(tail.changes, [], 'storage changed after final upgrade window');
      cumulative = comparePersistence(first, final, scope + ' whole upgrade', storageWrites.slice(wholeWriteStart));
      const allowedSession = key => key.startsWith('dye-ledger-report-') || key === 'dye-ledger-report:last-consumed' || key === 'dyeLedgerPendingUpdateVersion';
      const unexpectedSessionWrites = storageWrites.filter(w => w.area === 'session' && !allowedSession(w.key));
      loads.push({ unexpectedSessionWrites }); assert.deepEqual(unexpectedSessionWrites, []);
      assert.deepEqual(pageErrors, []);
      t.diagnostic('Upgrade AC6: ' + cumulative.ac6 + '; unclassified changes retained for independent review');
    } finally {
      if (process.env.DYE_OFFLINE_UPGRADE_CENSUS) appendFileSync(process.env.DYE_OFFLINE_UPGRADE_CENSUS, JSON.stringify({ scope, profile, exported, baselineVersion, targetVersion: currentVersionBare, census, gaps, cumulative, loads, cacheStates, uiSteps, upgradeEvents, storageWrites, blockedExternalRequests: externalRequests, inlineResources, pageErrors, consoleMessages }) + '\n');
      await browser?.close(); await fixture.close();
      t.diagnostic('Retained synthetic profile: ' + profile + '; baseline export: ' + exported.folder);
    }
  });
}
