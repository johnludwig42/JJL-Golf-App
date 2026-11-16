import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { chrome, startServer, visualFixture } from './support/design-browser.js';
import '../recovery-file.js';

const api = globalThis.DyeLedgerRecoveryFile;
const keys = api.restoreKeys;
const time = '2026-10-10T18:00:00.000Z';
const canary = '1f092bcc-03e2-4ce3-8e58-2ad232e2c98a';
const receipt = { id: 'quota-receipt' };

async function fixture(origin, padding, keepLedger) {
  const engine = loadLiveEngine();
  const state = engine.seedState(visualFixture().state);
  const [active] = state.matches;
  function round(id, date, complete, accepted) {
    const row = { ...structuredClone(active), id, name: id, date, status: complete ? 'complete' : 'active' };
    if (complete) {
      row.completedAt = date + 'T12:00:00.000Z';
      row.players.forEach((player, index) => player.scores.forEach(score => { score.gross = 4 + index; }));
    }
    if (accepted) {
      const report = engine.buildLedgerEntryReportModel(row);
      assert.ok(report?.meta, 'expected a Ledger report for ' + id);
      Object.assign(report.meta, { status: 'final', roundId: id, story: 'Synthetic quota fixture.' });
      row.ledgerEntrySnapshot = { status: 'accepted', roundId: id, acceptedAt: time, report };
      row.quotaFixturePadding = 'x'.repeat(padding);
    }
    return row;
  }
  const older = round('file-ledger', '2026-10-06', true, true);
  const draft = round('unfinished', '2026-10-07', false, false);
  const newer = round('newer-ledger', '2026-10-08', true, true);
  const completed = round('completed-no-ledger', '2026-10-05', true, false);
  state.matches = [older, active, draft, newer, completed];
  state.completedSummaryMatchId = older.id;
  state.sharedMatchIds = ['DYE-240001'];
  older.storageMode = 'shared';
  older.sharedMatchId = 'DYE-240001';
  older.sharedScoreQueueRecovery = { 'p0:1': { operationId: 'quota-held-operation' } };
  const file = await api.buildRecoveryFile({
    state, reviewReceipts: [receipt], setupDraft: '{"name":"Synthetic"}',
    finishRecovery: '{"roundId":"file-ledger"}',
  }, { appVersion: 'synthetic', createdAt: time, sourceOrigin: origin, fileId: 'quota-fixture' });
  const text = api.serialize(file);
  assert.ok(Buffer.byteLength(text) < 16 * 1024 * 1024);
  const plan = await api.planRestore(text, { profileNonce: 'quota-fixture', restoredAt: time });
  const ids = [active.id, draft.id, ...(keepLedger ? [newer.id] : []), completed.id];
  const plannedState = JSON.parse(plan.values[keys.state]);
  const primaryLength = JSON.stringify({
    ...plannedState, matches: plannedState.matches.filter(row => ids.includes(row.id)),
  }).length;
  return { file, text, plan, ids, primaryLength };
}

async function instrument(page, origin, options, requests) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('data:')) return request.continue();
    const local = url.startsWith(origin + '/');
    requests.push({ url, type: request.resourceType(), local });
    return local ? request.continue() : request.abort();
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', event => requests.push({ url: event.url, type: 'websocket', local: false }));
  await page.evaluateOnNewDocument(({ keys, options }) => {
    window.quotaOnline = Boolean(options.boot);
    window.quotaTrace = { writes: [], faults: [], clients: 0 };
    Object.defineProperty(navigator, 'onLine', { get: () => window.quotaOnline });
    if (options.boot) {
      window.supabase = { createClient() { window.quotaTrace.clients++; throw new Error('Unexpected cloud client'); } };
    }
    const { setItem, removeItem, clear } = Storage.prototype;
    let totalCap;
    Storage.prototype.setItem = function (key, value) {
      if (this !== localStorage) return setItem.call(this, key, value);
      key = String(key);
      value = String(value);
      window.quotaTrace.writes.push([key, value.length]);
      if (options.primaryLimit !== undefined && key === keys.state && totalCap === undefined) {
        totalCap = Object.entries(this).reduce((sum, [name, text]) => sum + name.length + text.length, 0)
          + key.length + options.primaryLimit;
      }
      if (totalCap !== undefined) {
        const size = Object.entries(this).filter(([name]) => name !== key)
          .reduce((sum, [name, text]) => sum + name.length + text.length, key.length + value.length);
        if (size > totalCap) {
          window.quotaTrace.faults.push({ key, source: 'simulated-cap', size, totalCap });
          throw new DOMException('Synthetic character cap', 'QuotaExceededError');
        }
      }
      if (options.fault === 'readback' && key === keys.state) value += ' ';
      if (options.fault === 's8' && key === keys.marker && JSON.parse(value).phase === 'restored-verified') {
        window.quotaTrace.faults.push({ key, source: 'injected-s8' });
        throw new Error('Synthetic S8 fault');
      }
      try { return setItem.call(this, key, value); }
      catch (error) {
        window.quotaTrace.faults.push({ key, source: 'native', name: error.name, length: value.length });
        throw error;
      }
    };
    Storage.prototype.removeItem = function (key) {
      if (this === localStorage) window.quotaTrace.writes.push([key, null]);
      return removeItem.call(this, key);
    };
    Storage.prototype.clear = function () {
      if (this === localStorage) window.quotaTrace.writes.push(['clear', null]);
      return clear.call(this);
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (store, mode, ...rest) {
      if (mode === 'readwrite') window.quotaTrace.writes.push(['IndexedDB', store]);
      return transaction.call(this, store, mode, ...rest);
    };
  }, { keys, options });
}

async function waitStatus(page, value) {
  await page.waitForFunction(text => document.querySelector('#recoveryStatus')?.textContent.includes(text),
    { timeout: 5000, polling: 50 }, value);
}

const census = page => page.evaluate(() => ({
  local: Object.fromEntries(Object.entries(localStorage).sort()), trace: window.quotaTrace,
}));

test('AC-R5 and FT-13 browser quota and interruption cases', { timeout: 90000 }, async t => {
  assert.ok(chrome, 'Chrome is required for F-4');
  const started = performance.now();
  const root = resolve(process.env.DYE_R1_F_EVIDENCE || 'tmp/report-qa/wp-lib-01-r1-f-quota');
  mkdirSync(root, { recursive: true });
  const evidence = mkdtempSync(join(root, 'browser-'));
  const save = (name, value) => writeFileSync(join(evidence, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  const log = (event, name, details = {}) => appendFileSync(join(evidence, 'progress.jsonl'),
    JSON.stringify({ event, name, elapsedMs: performance.now() - started, ...details }) + '\n');
  let browser;
  let server;
  async function bound(name, action, ms = 8000, deadline = 85000) {
    let timer;
    log('start', name);
    try {
      const result = await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(name + ' timed out')), Math.max(1, Math.min(ms, deadline - (performance.now() - started))));
      })]);
      log('done', name);
      return result;
    } catch (error) {
      log('fail', name, { message: error.message, targets: browser?.targets().map(target => target.url()) });
      throw error;
    } finally { clearTimeout(timer); }
  }
  try {
    server = await bound('server', startServer);
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await bound('chrome', () => puppeteer.launch({
      executablePath: chrome, headless: true, timeout: 7500,
      args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'],
    }));
    save('chrome', { version: await bound('chrome-version', () => browser.version()), executable: chrome });
    const capacity = await bound('measure-native-Chromium-quota', async () => {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.goto(origin + '/recovery.html');
      const limit = await page.evaluate(() => {
        let low = 0;
        let high = 16 * 1024 * 1024;
        while (high - low > 1) {
          const size = Math.floor((low + high) / 2);
          try {
            localStorage.setItem('quota-calibration', 'x'.repeat(size));
            low = size;
          } catch (error) {
            if (error.name !== 'QuotaExceededError') throw error;
            high = size;
          }
        }
        return { asciiValueCharacters: low, firstRejected: high, key: 'quota-calibration' };
      });
      await context.close();
      return limit;
    });
    save('native-capacity', capacity);
    assert.ok(capacity.asciiValueCharacters > 1024 * 1024 && capacity.asciiValueCharacters < 8 * 1024 * 1024);

    for (const name of ['simulated', 'native-Chromium', 'mandatory-quota', 'readback', 's8']) {
      let completed = false;
      await t.test(name, async () => {
        const step = (label, action, ms) => bound(name + ':' + label, action, ms);
        const native = name === 'native-Chromium';
        const success = native || name === 'simulated';
        const data = await fixture(origin, native ? Math.ceil(capacity.asciiValueCharacters * 0.6) : 0, native);
        const context = await step('context', () => browser.createBrowserContext());
        const requests = [];
        const options = native ? {} : name === 'simulated' ? { primaryLimit: data.primaryLength }
          : name === 'mandatory-quota' ? { primaryLimit: 1 } : { primaryLimit: data.primaryLength, fault: name };
        const page = await step('recovery-page', async () => {
          const target = await context.newPage();
          await instrument(target, origin, options, requests);
          await target.goto(origin + '/recovery.html');
          await target.bringToFront();
          return target;
        });
        await step('isolation', async () => {
          await page.click('#checkIsolation');
          await waitStatus(page, 'Local checks passed');
          await page.click('#canaryAbsent');
          await page.type('#originalCanary', canary);
          await page.click('#confirmIsolation');
          await page.waitForSelector('#recoveryPicker input');
        });
        // Upload through a real file for the large case without sending its contents through CDP.
        const filePath = join(evidence, name + '-input.json');
        writeFileSync(filePath, data.text, { flag: 'wx' });
        await step('file', async () => {
          await (await page.waitForSelector('#recoveryPicker input')).uploadFile(filePath);
          await waitStatus(page, 'File verified');
        }, 10000);
        await step('restore', async () => {
          await page.click('#restoreRecovery');
          await waitStatus(page, success ? 'Verified recovery:' : 'Restore incomplete');
        }, 10000);
        const before = await step('restore-census', () => census(page));
        const marker = JSON.parse(before.local[keys.marker]);
        const status = await step('status', () => page.$eval('#recoveryStatus', node => node.textContent));
        save(name + '-restore', {
          status, marker, trace: before.trace, fileBytes: Buffer.byteLength(data.text),
          stateBytes: data.plan.values[keys.state].length, retainedIds: before.local[keys.state]
            ? JSON.parse(before.local[keys.state]).matches.map(row => row.id) : [],
        });
        assert.equal(marker.phase, success ? 'restored-verified' : 'restoring');
        if (success) {
          const actual = JSON.parse(before.local[keys.state]);
          const wanted = JSON.parse(data.plan.values[keys.state]);
          wanted.matches = wanted.matches.filter(row => data.ids.includes(row.id));
          assert.equal(api.canonical(actual) === api.canonical(wanted), true, 'exact reduced state in file order');
          const left = data.file.rounds.filter(row => !data.ids.includes(row.roundId)).map(row => row.roundId);
          assert.deepEqual(marker.results.leftInFile, left);
          assert.match(status, new RegExp(left.length + ' rounds remain in the recovery file'));
          assert.ok(actual.matches.some(row => row.id === actual.activeMatchId));
          assert.ok(api.validateMarker(marker), 'valid verified restore marker');
          const scoreHoldText = before.local[keys.scoreHold];
          const scoreHold = JSON.parse(scoreHoldText);
          assert.equal(scoreHold.restoredAt, marker.startedAt);
          assert.ok(await api.validateHoldRecord(scoreHold, 'score'), 'valid score hold and recordSha256');
          assert.equal(await api.sha256Hex(scoreHoldText), marker.expected[keys.scoreHold]);
          const expectedAtRestoreTime = await api.planRestore(data.text, {
            profileNonce: marker.profileNonce, restoredAt: marker.startedAt,
          });
          assert.equal(scoreHoldText, expectedAtRestoreTime.values[keys.scoreHold]);
          for (const key of [keys.startupHold, keys.setupDraft]) {
            assert.equal(before.local[key], data.plan.values[key]);
          }
          assert.ok(before.trace.faults.some(fault => fault.key === keys.state
            && fault.source === (native ? 'native' : 'simulated-cap')));
        } else {
          assert.equal(Object.hasOwn(before.local, keys.state), name !== 'mandatory-quota');
          await step('incomplete-reload', async () => {
            await page.reload();
            await waitStatus(page, 'Restore incomplete');
            assert.equal(await page.$('input[type=file]'), null);
          });
        }
        const bootRequests = [];
        const app = await step('app-boot', async () => {
          const target = await context.newPage();
          await instrument(target, origin, { boot: true }, bootRequests);
          await target.goto(origin + '/index.html');
          await target.waitForFunction(expected => window.__DYE_RECOVERY_GUARD__?.state === expected,
            { timeout: 5000, polling: 50 }, success ? 'G1' : 'G2');
          return target;
        });
        const boot = await step('app-census', () => census(app));
        const disallowed = bootRequests.filter(request => !request.local
          || ['fetch', 'xhr', 'websocket', 'eventsource', 'ping'].includes(request.type));
        save(name + '-app-boot', { trace: boot.trace, requests: bootRequests, disallowed });
        assert.equal(api.canonical(boot.local) === api.canonical(before.local), true, 'boot left storage byte-identical');
        assert.deepEqual(boot.trace.writes, []);
        assert.equal(boot.trace.clients, 0);
        assert.deepEqual(disallowed, []);
        if (success) {
          const view = await step('file-only-viewer', async () => {
            await page.bringToFront();
            await page.evaluate(() => { window.quotaOnline = true; });
            await page.click('#viewRecoveryRounds');
            await (await page.waitForSelector('#recoveryViewerPicker input')).uploadFile(filePath);
            const rows = '#recoveryViewerRounds li';
            await page.waitForFunction(selector => [...document.querySelectorAll(selector)].some(row =>
              row.textContent.startsWith('file-ledger ·') && row.textContent.includes('In the recovery file only')),
            { polling: 50 }, rows);
            const button = await page.evaluateHandle(selector => [...document.querySelectorAll(selector)]
              .find(row => row.textContent.startsWith('file-ledger ·')).querySelector('button'), rows);
            await Promise.all([page.waitForNavigation(), button.asElement().click()]);
            return render(page);
          }, 10000);
          const reference = await step('ordinary-reference', async () => {
            const target = await context.newPage();
            await instrument(target, origin, {}, requests);
            const archived = api.acceptedLedgerReport(data.file.payload.state.matches[0]);
            await target.evaluateOnNewDocument(report => sessionStorage.setItem('quota-reference', JSON.stringify({
              report, autoPrint: false, createdAt: new Date().toISOString(),
            })), archived);
            await target.goto(origin + '/ledger-report/shell.html?reportKey=quota-reference');
            return render(target);
          });
          save(name + '-viewer', { view, reference, requests });
          assert.equal(view.readOnly, true);
          assert.deepEqual(view.pages, reference.pages);
          assert.deepEqual(view.headings, reference.headings);
          assert.equal(view.text, reference.text);
          assert.equal(api.canonical((await step('viewer-census', () => census(page))).local) === api.canonical(before.local), true);
          assert.ok(requests.every(request => request.local));
        }
        await step('close-context', () => context.close());
        completed = true;
      });
      if (!completed) break;
    }
  } finally {
    const cleanup = {};
    try {
      if (browser) {
        try { await bound('browser-close', () => browser.close(), 4500, 89800); cleanup.browser = 'closed'; }
        catch (error) {
          cleanup.browser = 'forced';
          browser.process()?.kill('SIGKILL');
          throw error;
        }
      }
    } finally {
      try {
        if (server) await bound('server-close', () => new Promise((done, reject) => {
          server.close(error => error ? reject(error) : done());
          server.closeAllConnections();
        }), 250, 89800);
        cleanup.server = 'closed';
      } finally { save('cleanup', cleanup); }
    }
  }
});

async function render(page) {
  await page.waitForSelector('#doc .page');
  await page.evaluate(() => document.fonts.ready.then(() => true));
  return page.evaluate(() => ({
    readOnly: window.__DYE_LEDGER_VIEW_ONLY__ === true,
    pages: [...document.querySelectorAll('#doc .page')].map(node => node.querySelector('.wordmark em')?.textContent),
    headings: [...document.querySelectorAll('#doc .sechead')].map(node => node.textContent),
    text: document.querySelector('#doc').innerText,
  }));
}
