import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import { chrome, startServer, visualFixture } from './support/design-browser.js';
import '../recovery-file.js';

const api = globalThis.DyeLedgerRecoveryFile;
const { restoreKeys: keys } = api;
const time = '2026-10-10T18:00:00.000Z';
const state = visualFixture().state;

async function preparePage(context, origin, { offline = false, seed = false } = {}) {
  const page = await context.newPage();
  const requests = [];
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('data:')) return request.continue();
    const local = url.startsWith(origin + '/');
    requests.push({ url, local, type: request.resourceType() });
    return local ? request.continue() : request.abort();
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', event => requests.push({ url: event.url, local: false, type: 'websocket' }));
  await page.evaluateOnNewDocument(({ offline, seed, state, stateKey }) => {
    const trace = window.preferenceTrace = { writes: [], clients: 0 };
    Object.defineProperty(navigator, 'onLine', { get: () => !offline });
    if (!offline && !seed) {
      window.supabase = { createClient() { trace.clients++; throw new Error('Unexpected cloud client'); } };
    }
    if (seed) localStorage.setItem(stateKey, JSON.stringify(state));
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this === localStorage) trace.writes.push({
          method, key: args[0] ?? null, value: args[1] ?? null, stack: new Error().stack,
        });
        return original.apply(this, args);
      };
    }
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...rest) {
      if (mode === 'readwrite') trace.writes.push({ method: mode, stores, stack: new Error().stack });
      return transaction.call(this, stores, mode, ...rest);
    };
  }, { offline, seed, state, stateKey: keys.state });
  await page.bringToFront();
  return { page, requests };
}

const census = page => page.evaluate(() => ({
  local: Object.fromEntries(Object.entries(localStorage).sort()),
  mode: window.__DYE_RECOVERY_GUARD__?.state ?? null,
  trace: window.preferenceTrace,
}));

async function waitStatus(page, value) {
  await page.waitForFunction(text => document.querySelector('#recoveryStatus')?.textContent.includes(text),
    { timeout: 5000, polling: 50 }, value);
}

async function boot(page, origin) {
  await page.goto(origin + '/index.html');
  await page.waitForFunction(() => document.getElementById('appVersionFooter')?.textContent.startsWith('v'),
    { timeout: 5000, polling: 50 });
}

const form = page => page.evaluate(() => Object.fromEntries(
  ['scoring.hapticsEnabled', 'scoring.statTrackingMode'].map(name => [name,
    document.querySelector('#playerPreferencesForm [name="' + name + '"]:checked')?.value]),
));

function assertQuiet(observation, requests) {
  assert.deepEqual(observation.trace.writes, []);
  assert.equal(observation.trace.clients, 0);
  assert.deepEqual(requests.filter(row => !row.local || ['fetch', 'xhr', 'websocket'].includes(row.type)), []);
}

test('F-4 G0 and G1 recovery preferences startup and intentional edits', { timeout: 90000 }, async () => {
  assert.ok(chrome, 'Chrome is required for the preferences browser test');
  const started = performance.now();
  const root = resolve(process.env.DYE_R1_F_EVIDENCE || 'tmp/report-qa/wp-lib-01-r1-f-preferences');
  mkdirSync(root, { recursive: true });
  const evidence = mkdtempSync(join(root, 'preferences-'));
  const save = (name, value) => writeFileSync(join(evidence, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  const log = (event, name, message) => appendFileSync(join(evidence, 'progress.jsonl'),
    JSON.stringify({ event, name, message, elapsedMs: performance.now() - started }) + '\n');
  let server;
  let browser;
  async function step(name, action, ms = 8000, deadline = 85000) {
    let timer;
    log('start', name);
    try {
      const result = await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(name + ' timed out')),
          Math.max(1, Math.min(ms, deadline - (performance.now() - started))));
      })]);
      log('done', name);
      return result;
    } catch (error) {
      log('fail', name, error.message);
      throw error;
    } finally { clearTimeout(timer); }
  }
  try {
    server = await step('server', startServer);
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await step('browser', () => puppeteer.launch({ executablePath: chrome, headless: true, timeout: 7500,
      args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'] }));
    const source = await step('G0:context', () => browser.createBrowserContext());
    const ordinary = await step('G0:page', () => preparePage(source, origin, { seed: true }));
    await step('G0:boot', () => boot(ordinary.page, origin));
    const defaults = await step('G0:defaults', () => ordinary.page.evaluate(() =>
      normalizePlayerPreferences(getDefaultPlayerPreferences())));
    const g0 = await step('G0:census', () => census(ordinary.page));
    save('T1-G0', { ...g0, defaults, requests: ordinary.requests });
    assert.equal(g0.mode, null);
    const defaultWrites = g0.trace.writes.filter(write => write.key === keys.preferences);
    assert.equal(defaultWrites.length, 1);
    assert.equal(defaultWrites[0].value, JSON.stringify(defaults));
    assert.equal(defaultWrites[0].value.length, 882);
    assert.match(defaultWrites[0].stack, /getPlayerPreferences/);
    await step('G0:close', () => source.close());

    for (const withPreferences of [false, true]) {
      const bootCase = withPreferences ? 'T3' : 'T2';
      const editCase = withPreferences ? 'T5' : 'T4';
      const expected = structuredClone(defaults);
      if (withPreferences) {
        expected.scoring.hapticsEnabled = false;
        expected.scoring.statTrackingMode = 'ENHANCED';
      }
      const preferences = withPreferences ? JSON.stringify(expected) : null;
      const file = await api.buildRecoveryFile({ state, preferences }, {
        appVersion: 'synthetic', createdAt: time, sourceOrigin: origin, fileId: bootCase,
      });
      const inputPath = join(evidence, bootCase + '-input.json');
      writeFileSync(inputPath, api.serialize(file), { flag: 'wx' });
      const context = await step(bootCase + ':context', () => browser.createBrowserContext());
      const recovery = await step(bootCase + ':recovery-page', () => preparePage(context, origin, { offline: true }));
      await step(bootCase + ':restore', async () => {
        const page = recovery.page;
        await page.goto(origin + '/recovery.html');
        await page.click('#checkIsolation');
        await waitStatus(page, 'Local checks passed');
        await page.click('#canaryAbsent');
        await page.type('#originalCanary', '1f092bcc-03e2-4ce3-8e58-2ad232e2c98a');
        await page.click('#confirmIsolation');
        await (await page.waitForSelector('#recoveryPicker input')).uploadFile(inputPath);
        await waitStatus(page, 'File verified');
        await page.click('#restoreRecovery');
        await waitStatus(page, 'Verified recovery:');
      }, 10000);
      const before = await step(bootCase + ':restore-census', () => census(recovery.page));
      assert.equal(before.local[keys.preferences] ?? null, preferences);
      const app = await step(bootCase + ':app-page', () => preparePage(context, origin));
      await step(bootCase + ':boot', () => boot(app.page, origin));
      const after = await step(bootCase + ':boot-census', () => census(app.page));
      const controls = await step(bootCase + ':form', () => form(app.page));
      save(bootCase + '-G1', { before, after, controls, requests: app.requests });
      assert.equal(after.mode, 'G1');
      assert.deepEqual(after.local, before.local);
      assertQuiet(after, app.requests);
      assert.equal(controls['scoring.hapticsEnabled'], String(expected.scoring.hapticsEnabled));
      assert.equal(controls['scoring.statTrackingMode'], expected.scoring.statTrackingMode);

      expected.scoring.hapticsEnabled = !expected.scoring.hapticsEnabled;
      await step(editCase + ':change-preference', () => app.page.$eval(
        '#playerPreferencesForm [name="scoring.hapticsEnabled"][value="' + expected.scoring.hapticsEnabled + '"]',
        control => control.click()));
      const edited = await step(editCase + ':census', () => census(app.page));
      save(editCase + '-intentional-edit', { edited, expected });
      assert.equal(edited.mode, 'G1');
      assert.equal(edited.trace.clients, 0);
      assert.equal(edited.trace.writes.length, 1);
      assert.equal(edited.trace.writes[0].key, keys.preferences);
      assert.deepEqual(JSON.parse(edited.trace.writes[0].value), expected);
      assert.deepEqual(edited.local, { ...before.local, [keys.preferences]: JSON.stringify(expected) });
      const requestsBeforeReload = app.requests.length;
      await step(editCase + ':reload', () => boot(app.page, origin));
      const reloaded = await step(editCase + ':reload-census', () => census(app.page));
      const reloadedForm = await step(editCase + ':reload-form', () => form(app.page));
      const reloadRequests = app.requests.slice(requestsBeforeReload);
      save(editCase + '-reload', { reloaded, reloadedForm, requests: reloadRequests });
      assert.equal(reloaded.mode, 'G1');
      assert.deepEqual(reloaded.local, edited.local);
      assertQuiet(reloaded, reloadRequests);
      assert.equal(reloadedForm['scoring.hapticsEnabled'], String(expected.scoring.hapticsEnabled));
      await step(editCase + ':close', () => context.close());
    }
  } finally {
    const cleanup = {};
    try {
      if (browser) {
        try { await step('browser-close', () => browser.close(), 4500, 89800); cleanup.browser = 'closed'; }
        catch (error) { cleanup.browser = 'forced'; browser.process()?.kill('SIGKILL'); throw error; }
      }
    } finally {
      try {
        if (server) await step('server-close', () => new Promise((done, reject) => {
          server.close(error => error ? reject(error) : done());
          server.closeAllConnections();
        }), 250, 89800);
        cleanup.server = 'closed';
      } finally { save('cleanup', cleanup); }
    }
  }
});
