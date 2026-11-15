import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { chrome, startServer, visualFixture } from './support/design-browser.js';
import '../recovery-file.js';

const api = globalThis.DyeLedgerRecoveryFile;
const keys = api.restoreKeys;
const state = visualFixture().state;
const matchId = state.matches[0].id;
const withoutScript = html => html.replace(/<script>[\s\S]*?<\/script>/gi, '').replace(/^  (?=\r?$)/gm, '');

async function instrument(page, origin, mode) {
  await page.setRequestInterception(true);
  page.on('request', request => request.url().startsWith(origin + '/') || request.url().startsWith('data:')
    ? request.continue() : request.abort());
  await page.evaluateOnNewDocument(({ mode, state, keys }) => {
    const trace = window.exportTrace = { violations: [], writes: [], focus: 0 };
    addEventListener('securitypolicyviolation', event => {
      trace.violations.push({ directive: event.violatedDirective, uri: event.blockedURI });
    });
    addEventListener('focus', () => { trace.focus++; });
    if (mode === 'restore') Object.defineProperty(navigator, 'onLine', { get: () => false });
    if ((mode === 'G0' || mode === 'G5') && !localStorage.getItem(keys.state)) {
      localStorage.setItem(keys.state, JSON.stringify(state));
      if (mode === 'G5') localStorage.setItem(keys.scoreHold, '{invalid');
    }
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) trace.writes.push({ key, stack: new Error().stack });
      return original.call(this, key, value);
    };
    // Store the observer in the popup so it remains accessible after opener reload.
    const open = window.open;
    window.open = function (...args) {
      const popup = open.apply(this, args);
      if (!popup) throw new Error('Export popup did not open');
      window.exportFixturePopup = popup;
      popup.fixtureAudit = { prints: 0, violations: [], html: '' };
      const openDocument = popup.document.open.bind(popup.document);
      popup.document.open = (...openArgs) => {
        const result = openDocument(...openArgs);
        popup.print = () => { popup.fixtureAudit.prints++; };
        popup.addEventListener('securitypolicyviolation', event => {
          popup.fixtureAudit.violations.push({ directive: event.violatedDirective, uri: event.blockedURI });
        });
        return result;
      };
      const write = popup.document.write.bind(popup.document);
      popup.document.write = (...parts) => {
        popup.fixtureAudit.html = parts.join('');
        return write(...parts);
      };
      return popup;
    };
  }, { mode, state, keys });
}

const snapshot = page => page.evaluate(() => ({
  values: Object.fromEntries(Object.entries(localStorage).sort()), trace: window.exportTrace,
}));

async function restore(page, origin, file) {
  await instrument(page, origin, 'restore');
  await page.bringToFront();
  await page.goto(origin + '/recovery.html');
  const status = value => page.waitForFunction(text => document.querySelector('#recoveryStatus')?.textContent.includes(text),
    { polling: 50, timeout: 5000 }, value);
  await page.click('#checkIsolation');
  await status('Local checks passed');
  await page.click('#canaryAbsent');
  await page.type('#originalCanary', '1f092bcc-03e2-4ce3-8e58-2ad232e2c98a');
  await page.click('#confirmIsolation');
  await (await page.waitForSelector('#recoveryPicker input')).uploadFile(file);
  await status('File verified');
  await page.click('#restoreRecovery');
  await status('Verified recovery:');
}

test('FU9 scorecard and summary Print and Return in G0, G1 and G5', { timeout: 90000 }, async () => {
  assert.ok(chrome, 'Chrome is required for FU9');
  const start = performance.now();
  const root = resolve(process.env.DYE_R1_F_EVIDENCE || 'tmp/report-qa/wp-lib-01-fu9');
  mkdirSync(root, { recursive: true });
  const evidence = mkdtempSync(join(root, 'export-controls-'));
  const save = (name, value) => writeFileSync(join(evidence, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  const log = (event, name) => appendFileSync(join(evidence, 'progress.jsonl'),
    JSON.stringify({ event, name, elapsedMs: performance.now() - start }) + '\n');
  let browser;
  let server;
  async function step(name, action, ms = 8000, deadline = 85000) {
    let timer;
    log('start', name);
    try {
      const result = await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(name + ' timed out')),
          Math.max(1, Math.min(ms, deadline - (performance.now() - start))));
      })]);
      log('done', name);
      return result;
    } catch (error) {
      log('fail', name);
      throw error;
    } finally { clearTimeout(timer); }
  }
  try {
    const baselinePath = join(evidence, 'head-app.js');
    writeFileSync(baselinePath, execFileSync('git', ['show', 'HEAD:app.js'], { maxBuffer: 16 * 1024 * 1024 }), { flag: 'wx' });
    const baseline = loadLiveEngine(baselinePath);
    server = await step('server', startServer);
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await step('browser', () => puppeteer.launch({ executablePath: chrome, headless: true, timeout: 7500,
      args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'] }));
    const fixture = await api.buildRecoveryFile({ state }, {
      appVersion: 'synthetic', createdAt: '2026-10-10T18:00:00.000Z', sourceOrigin: origin, fileId: 'fu9-fixture',
    });
    const file = join(evidence, 'fixture.json');
    writeFileSync(file, api.serialize(fixture), { flag: 'wx' });
    for (const mode of ['G0', 'G1', 'G5']) {
      const context = await step(mode + ':context', () => browser.createBrowserContext());
      if (mode === 'G1') {
        const recovery = await step('G1:recovery-page', () => context.newPage());
        await step('G1:restore', () => restore(recovery, origin, file), 10000);
        await step('G1:close-recovery', () => recovery.close());
      }
      const page = await step(mode + ':boot', async () => {
        const app = await context.newPage();
        await instrument(app, origin, mode);
        await app.bringToFront();
        await app.goto(origin + '/index.html');
        await app.waitForFunction(() => typeof openPrintScorecard === 'function'
          && document.querySelector('#appVersionFooter')?.textContent.startsWith('v'), { polling: 50 });
        return app;
      });
      assert.equal(await step(mode + ':guard', () => page.evaluate(() => window.__DYE_RECOVERY_GUARD__?.state ?? 'G0')), mode);
      const settled = await step(mode + ':settle-startup', async () => {
        const sample = await page.waitForFunction(() => {
          const now = performance.now();
          const idle = setupDraftSaveTimer === null;
          const fingerprint = JSON.stringify(Object.entries(localStorage).sort());
          const prior = window.exportFixtureSettling;
          const since = idle && prior?.idle && prior.fingerprint === fingerprint ? prior.since : now;
          window.exportFixtureSettling = { idle, fingerprint, since };
          return idle && now - since >= 400 ? { stableMs: now - since } : false;
        }, { polling: 50, timeout: 5000 });
        return sample.jsonValue();
      });
      save(mode + '-settling', settled);
      async function openExport(view) {
        await page.bringToFront();
        const popupPromise = new Promise(resolvePopup => page.once('popup', resolvePopup));
        await page.evaluate(({ matchId, view }) => openPrintScorecard(matchId, view), { matchId, view });
        const popup = await popupPromise;
        await popup.bringToFront();
        await popup.waitForSelector('#manualPrintBtn');
        return popup;
      }
      for (const view of mode === 'G5' ? ['scorecard'] : ['scorecard', 'summary']) {
        const label = mode + '-' + view;
        const before = await step(label + ':before', () => snapshot(page));
        const popup = await step(label + ':open', () => openExport(view));
        const audit = { before };
        try {
          await step(label + ':automatic-print', () => popup.waitForFunction(() => window.fixtureAudit?.prints === 1,
            { polling: 50, timeout: 4000 }));
          audit.initial = await step(label + ':audit', () => popup.evaluate(() => ({
            ...window.fixtureAudit, scriptCount: document.scripts.length,
            view: document.querySelector('[data-export-view]')?.dataset.exportView,
            text: document.body.innerText,
          })));
          await step(label + ':manual-print', async () => {
            await popup.click('#manualPrintBtn');
            await popup.waitForFunction(() => window.fixtureAudit?.prints === 2, { polling: 50, timeout: 2500 });
          });
          audit.final = await step(label + ':print-audit', () => popup.evaluate(() => ({
            prints: window.fixtureAudit.prints, violations: window.fixtureAudit.violations,
          })));
          await step(label + ':return', async () => {
            const observedAt = performance.now();
            await popup.evaluate(() => { setTimeout(() => document.getElementById('returnToAppBtn').click(), 0); });
            while (!popup.isClosed() && performance.now() - observedAt < 1000) await delay(20);
            audit.closedBeforeCleanup = popup.isClosed();
            audit.returnMs = performance.now() - observedAt;
          }, 1500);
          audit.opener = await step(label + ':opener', () => page.evaluate(() => ({
            focused: document.hasFocus(), focusEvents: window.exportTrace.focus,
          })));
          audit.after = await step(label + ':after', () => snapshot(page));
          if (view === 'scorecard' && mode !== 'G5') {
            const current = await step(label + ':state-for-reference', () => page.evaluate(() => JSON.parse(JSON.stringify(state))));
            const referenceState = baseline.seedState(current);
            const match = referenceState.matches.find(row => row.id === matchId);
            const reference = baseline.buildUnifiedExportDocument(match, baseline.computeMatchMetrics(match), view);
            writeFileSync(join(evidence, label + '-baseline.html'), reference, { flag: 'wx' });
            writeFileSync(join(evidence, label + '-actual.html'), audit.initial.html, { flag: 'wx' });
            audit.markupMatches = withoutScript(audit.initial.html) === withoutScript(reference);
          }
        } finally {
          audit.cleanupClosed = !popup.isClosed();
          save(label, audit);
          if (audit.cleanupClosed) await step(label + ':cleanup', () => popup.close(), 3000);
        }
        assert.equal(audit.initial.view, view);
        assert.equal(audit.initial.scriptCount, mode === 'G0' ? 1 : 0);
        assert.equal(audit.initial.prints, 1);
        assert.equal(audit.final.prints, 2);
        assert.deepEqual(audit.final.violations, []);
        assert.deepEqual(audit.after.trace.violations, []);
        assert.equal(audit.closedBeforeCleanup, true, 'Return itself must close the popup');
        assert.equal(audit.cleanupClosed, false);
        if (view === 'scorecard' && mode !== 'G5') assert.equal(audit.markupMatches, true, label + ' pre-fix export markup');
        if (mode !== 'G0') {
          const writes = audit.after.trace.writes.slice(audit.before.trace.writes.length);
          assert.ok(writes.length > 0 && writes.every(write =>
            [keys.state, keys.backup].includes(write.key) && write.stack.includes('openPrintScorecard')));
          for (const key of Object.keys(audit.before.values)) {
            if (key !== keys.state && key !== keys.backup) assert.equal(audit.after.values[key], audit.before.values[key], key);
          }
        }
      }
      if (mode === 'G1') {
        const popup = await step('C1:open', () => openExport('scorecard'));
        const title = await step('C1:before', () => popup.title());
        await step('C1:reload', () => page.reload());
        const outcome = await step('C1:return-after-reload', async () => {
          await popup.bringToFront();
          await popup.evaluate(() => { setTimeout(() => document.getElementById('returnToAppBtn')?.click(), 0); });
          await delay(1000);
          const closed = popup.isClosed();
          return { closed, titleBefore: title, titleAfter: closed ? null : await popup.title() };
        });
        save('C1-reloaded-opener', outcome);
        if (!popup.isClosed()) await step('C1:cleanup', () => popup.close(), 3000);
      }
      await step(mode + ':close', () => context.close());
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
