import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, appendFileSync } from 'node:fs';
import { resolve, extname, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { scrambleFixture } from './support/scramble-fixture.js';
import { currentVersionBare, currentVersionPrefixed } from './support/release-identity.js';
import { settledSnapshot, captureStorage, comparePersistence } from './support/persistence-census.js';

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
const root = resolve('.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

test('D1-A permits only blank draft regeneration with an active round', () => {
  const draft = { id: 'draft-a', sharedMatchId: 'session-a', sharedMatchRef: 'session-a', sharedMatchCode: 'SESSION-A', sessionId: 'session-a', sessionCreatedAt: '2026-01-01T00:00:00.000Z', name: '', courseId: '', teeId: '', players: [], notes: '', roundRecapNotes: '', selectedGames: [], presses: [] };
  const regenerated = { ...draft, id: 'draft-b', sharedMatchId: 'session-b', sharedMatchRef: 'session-b', sharedMatchCode: 'SESSION-B', sessionId: 'session-b', sessionCreatedAt: '2026-01-02T00:00:00.000Z' };
  const state = { activeMatchId: 'active', matches: [{ id: 'active', status: 'active', players: [] }] };
  const snapshot = (value, current = state) => ({ local: { 'the-dye-ledger-v20': JSON.stringify(current), 'the-dye-ledger-v20:setup-draft': JSON.stringify(value) }, session: {} });
  const positive = comparePersistence(snapshot(draft), snapshot(regenerated), 'D1-A positive');
  assert.equal(positive.changes[0].classification, 'APPROVED_BLANK_DRAFT_REGENERATION_D1_A');
  assert.equal(positive.changes[0].fieldChanges.length, 6);
  for (const [field, value] of Object.entries({ name: 'Real draft', courseId: 'course', teeId: 'tee', players: [{ playerId: 'golfer' }], notes: 'Keep me', roundRecapNotes: 'Keep me', selectedGames: ['stroke_net'], presses: [{}], unreviewedField: true, sessionCreatedAt: 'invalid' })) {
    assert.throws(() => comparePersistence(snapshot(draft), snapshot({ ...regenerated, [field]: value }), `D1-A rejects ${field}`), /protected storage key changed/);
  }
  assert.throws(() => comparePersistence(snapshot({ ...draft, name: 'Existing real draft' }), snapshot(regenerated), 'D1-A nonblank before'), /protected storage key changed/);
  const inactive = { ...state, activeMatchId: null };
  assert.throws(() => comparePersistence(snapshot(draft, inactive), snapshot(regenerated, inactive), 'D1-A no active round'), /protected storage key changed/);
  assert.throws(() => comparePersistence(snapshot(null), snapshot(regenerated), 'D1-A draft creation'), /protected storage key changed/);
});

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

async function startFixture(scope) {
  let offline = false;
  const requests = [];
  const sockets = new Set();
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method, offline, at: new Date().toISOString() });
    if (offline) { request.socket.destroy(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith(scope)) { response.writeHead(404); response.end(); return; }
    const relative = url.pathname.slice(scope.length) || 'index.html';
    if (relative === '__observer.html' || relative === 'staging-sign-in' || relative === 'staging-sign-in.html') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      response.end('<!doctype html><title>LOCAL FIXTURE</title><p>Fixture page</p>'); return;
    }
    if (relative === 'supabase-config.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      response.end('window.__DYE_SUPABASE_CONFIG__={};'); return;
    }
    const file = resolve(root, decodeURIComponent(relative));
    if (!file.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    try {
      const bytes = readFileSync(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch { if (!response.headersSent) response.writeHead(404); response.end('Not found'); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return {
    url: `http://127.0.0.1:${server.address().port}${scope}`,
    requests,
    setOffline(value) { offline = value; },
    async close() { for (const socket of sockets) socket.destroy(); await new Promise(done => server.close(done)); },
  };
}

for (const scope of ['/', '/JJL-Golf-App/']) {
  test(`real worker offline navigation a-f and persistence census at ${scope}`, { skip: !chrome, timeout: 180000 }, async t => {
    const fixture = await startFixture(scope);
    const profile = mkdtempSync(join(tmpdir(), 'dye-offline-browser-'));
    let browser;
    const census = [];
    const gaps = [];
    let cumulative = null;
    const outcomes = [];
    const externalRequests = [];
    const inlineResources = [];
    const pageErrors = [];
    const storageWrites = [];
    const loads = [];
    const consoleMessages = [];
    try {
      browser = await puppeteer.launch({ executablePath: chrome, userDataDir: profile, headless: true, protocolTimeout: 30000, args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
      t.diagnostic(`Chrome ${await browser.version()}; real worker; synthetic data; scope ${scope}`);
      async function pageAt(url, initialSeed = null) {
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
        await page.goto(url, { waitUntil: 'load' });
        return page;
      }
      const page = await pageAt(fixture.url, seed());
      await page.waitForFunction(() => typeof openUnifiedExport === 'function' && navigator.serviceWorker.controller, { timeout: 20000 });
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      const observer = await pageAt(fixture.url + '__observer.html');
      const firstBaseline = await settledSnapshot(observer, page);
      let scenarioBefore = firstBaseline;
      let previousAfter = firstBaseline;
      const wholeWriteStart = storageWrites.length;
      let previousWriteEnd = wholeWriteStart;
      let writeStart = storageWrites.length;
      async function checkGap(label) {
        const next = await captureStorage(observer, page);
        const gap = comparePersistence(previousAfter, next, `${scope} gap ${label}`, storageWrites.slice(previousWriteEnd));
        gaps.push(gap);
        assert.deepEqual(gap.changes, [], `${scope}: localStorage changed between comparison windows (${label})`);
        return next;
      }
      async function begin() {
        writeStart = storageWrites.length;
        scenarioBefore = await checkGap(`before scenario ${census.length + 1}`);
      }
      const appHash = hash(readFileSync('index.html'));
      async function assertApp(subject) {
        await subject.waitForFunction(() => typeof getActiveMatch === 'function' && getActiveMatch()?.id === 'offline-active', { timeout: 15000, polling: 100 });
        assert.equal(await subject.evaluate(() => APP_VERSION), currentVersionPrefixed);
        assert.ok(await subject.$('nav.tabs'));
        assert.equal(await subject.$('#doc'), null);
        assert.equal(await subject.evaluate(() => getActiveMatch().players[0].scores[0].gross), 3);
      }
      async function assertCachedApp() {
        const actual = await observer.evaluate(async name => {
          const cache = await caches.open(name);
          const response = await cache.match(new URL('index.html', location.href));
          return Array.from(new Uint8Array(await response.arrayBuffer()));
        }, `the-dye-ledger-${currentVersionPrefixed}`);
        assert.equal(hash(Buffer.from(actual)), appHash);
      }
      async function assertCachedLedger() {
        const actual = await observer.evaluate(async name => {
          const response = await (await caches.open(name)).match(new URL('ledger-report/shell.html', location.href));
          return Array.from(new Uint8Array(await response.arrayBuffer()));
        }, `the-dye-ledger-${currentVersionPrefixed}`);
        assert.equal(hash(Buffer.from(actual)), hash(readFileSync('ledger-report/shell.html')));
      }
      async function compare(label, subject = page) {
        const after = await settledSnapshot(observer, subject);
        const result = comparePersistence(scenarioBefore, after, `${scope} ${label}`, storageWrites.slice(writeStart));
        census.push(result);
        previousAfter = after;
        previousWriteEnd = storageWrites.length;
        if (result.ac6 === 'PENDING_REVIEW') t.diagnostic(`AC6 pending independent review: ${label}`);
      }
      async function offline(value) {
        fixture.setOffline(value);
        await page.setOfflineMode(value);
      }
      async function assertNavigationError(relative) {
        let rejected;
        await assert.rejects(page.goto(fixture.url + relative, { waitUntil: 'load', timeout: 10000 }), error => {
          rejected = String(error);
          return /net::ERR_/.test(rejected);
        });
        // goto rejects before Chrome commits its own error document. Inspect
        // that document after commit, never the departing report's context.
        await page.waitForFunction(() => location.protocol === 'chrome-error:' && document.readyState === 'complete', { timeout: 15000, polling: 100 });
        const errorPage = await page.evaluate(() => ({ url: location.href, app: !!document.querySelector('nav.tabs'), report: !!document.querySelector('.page') }));
        loads.push({ failedNavigation: relative, rejected, errorPage });
        assert.equal(errorPage.app, false);
        assert.equal(errorPage.report, false);
      }
      async function openLedger() {
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
        assert.equal(page.url(), new URL(`ledger-report/shell.html?v=${currentVersionBare}`, fixture.url).href);
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

      // a: disconnect while still in Ledger; an online return would heal the old bug.
      await begin();
      await openLedger();
      await assertCachedLedger();
      await offline(true);
      await page.goto(fixture.url, { waitUntil: 'load' });
      await assertApp(page); await assertCachedApp(); await compare('a'); outcomes.push({ scenario: 'a', result: 'PASS' });

      // b/c: actual app export creates the session transfer, then actual Return control.
      await begin();
      const originalReturnUrl = page.url();
      await openLedger(); await compare('b'); outcomes.push({ scenario: 'b', result: 'PASS' });
      const consumedKey = await page.evaluate(() => globalThis.__DYE_LEDGER_REPORT_TRANSFER_KEY__);
      await begin();
      // Puppeteer's pointer click scrolls via animation frames. The census
      // observer must not leave the subject in a background tab for this step.
      await page.bringToFront();
      await page.click('#returnToMatchBtn');
      await page.waitForFunction(url => location.href === url && document.readyState === 'complete'
        && typeof getActiveMatch === 'function', { timeout: 15000, polling: 100 }, originalReturnUrl);
      assert.equal(page.url(), originalReturnUrl);
      assert.equal(await page.evaluate(key => sessionStorage.getItem(key), consumedKey), null, 'Return removes consumed transfer');
      await assertApp(page); await compare('c'); outcomes.push({ scenario: 'c', result: 'PASS' });

      // d: never return to the app online after visiting either sign-in alias.
      for (const alias of ['staging-sign-in.html', 'staging-sign-in']) {
        await begin();
        await offline(false);
        await page.goto(fixture.url + alias, { waitUntil: 'load' });
        await offline(true);
        await page.goto(fixture.url, { waitUntil: 'load' });
        await assertApp(page); await assertCachedApp(); await compare(`d ${alias}`);
      }
      outcomes.push({ scenario: 'd', result: 'PASS' });

      // f: require a browser navigation error; it must not quietly return app HTML.
      for (const relative of ['reports/ledger-entry-flamtana.html', 'staging-sign-in']) {
        await begin();
        await assertNavigationError(relative);
        await compare(`f ${relative}`);
      }
      await observer.evaluate(async name => {
        await (await caches.open(name)).delete(new URL('ledger-report/shell.html', location.href));
      }, `the-dye-ledger-${currentVersionPrefixed}`);
      await begin();
      await assertNavigationError(`ledger-report/shell.html?v=${currentVersionBare}&reportKey=synthetic`);
      await compare('f missing Ledger'); outcomes.push({ scenario: 'f', result: 'PASS' });
      assert.deepEqual(pageErrors, [], 'uncaught browser errors');
      const cacheUrls = await observer.evaluate(async name => (await (await caches.open(name)).keys()).map(request => request.url), `the-dye-ledger-${currentVersionPrefixed}`);
      const worker = readFileSync('service-worker.js', 'utf8');
      const precache = [...worker.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => new URL(match[1], fixture.url).href);
      const unexpected = cacheUrls.filter(url => !precache.includes(url));
      loads.push({ cacheUrls, precache, unexpected });
      assert.deepEqual(unexpected, [], 'cache keys must exactly match precache app-file URLs, including queries');
      await checkGap('after final cache check');
      const finalState = await settledSnapshot(observer, page);
      const tail = comparePersistence(previousAfter, finalState, `${scope} gap final settle`, storageWrites.slice(previousWriteEnd));
      gaps.push(tail);
      assert.deepEqual(tail.changes, [], 'localStorage changed after the final scenario window');
      cumulative = comparePersistence(firstBaseline, finalState, `${scope} whole run`, storageWrites.slice(wholeWriteStart));
      outcomes.push({ scenario: 'e', result: [...census, cumulative].some(row => row.ac6 === 'PENDING_REVIEW') ? 'PENDING_REVIEW' : 'PASS_FOR_CAPTURED_LOCAL_STORAGE', note: 'Settled per-scenario and whole-run comparisons; every gap checked; D1-A exception explicit; independent AC6 review required' });
    } finally {
      if (process.env.DYE_OFFLINE_CENSUS) appendFileSync(process.env.DYE_OFFLINE_CENSUS, JSON.stringify({ scope, profile, outcomes, census, gaps, cumulative, loads, serverRequests: fixture.requests, storageWrites, inlineResources, blockedExternalRequests: externalRequests, pageErrors, consoleMessages }) + '\n');
      await browser?.close();
      await fixture.close();
      const resolved = resolve(profile);
      assert.ok(resolved.startsWith(resolve(tmpdir()) + sep) && resolved.includes('dye-offline-browser-'));
      // Retain the synthetic profile rather than let Windows file locks hide a
      // test failure or trigger permission-changing cleanup. No real profile used.
      t.diagnostic(`Retained disposable synthetic profile: ${resolved}`);
    }
  });
}
