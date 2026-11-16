import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import { chrome, startServer, visualFixture } from './support/design-browser.js';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import '../recovery-file.js';

const api = globalThis.DyeLedgerRecoveryFile;
const timestamp = '2026-10-10T18:00:00.000Z';
const recoveryPath = '/recovery.html';
const fileRefusal = 'This is not the recovery file restored into this profile.';
const derivedPlayerFields = [
  'cnet', 'fnet', 'onet', 'playedIdx', 'nPlayed', 'parPlayed', 'delta', 'tot',
  'cnetT', 'fnetT', 'onetT', 'half', 'out', 'inn',
];
const derivedGameFields = ['R', 'moneyBy'];

function archivedReport(match) {
  const snapshot = match.ledgerEntrySnapshot;
  const report = structuredClone(snapshot.report);
  report.meta.story = String(report.meta.story || snapshot.story || '').trim();
  report.meta.acceptanceStatus = 'accepted';
  report.meta.acceptedAt = snapshot.acceptedAt;
  return report;
}

function compareRenderedModel(before, after) {
  const remaining = structuredClone(after);
  const changes = [];
  const colors = [];
  const strip = (group, fields) => remaining[group].forEach((row, index) => {
    for (const key of fields) {
      if (Object.hasOwn(row, key) && !Object.hasOwn(before[group][index] || {}, key)) {
        changes.push({ group, index, key, value: row[key] });
        delete row[key];
      }
    }
  });
  strip('players', derivedPlayerFields);
  strip('games', derivedGameFields);
  const stroke = before.games.some(game => game.type === 'strokeplay' && !game.overviewOnly);
  if (stroke) {
    const isHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
    remaining.players.forEach((player, index) => {
      if (before.players[index] && !Object.hasOwn(before.players[index], 'color') && isHex(player.color)) {
        colors.push({ kind: 'player-addition', index, before: null, after: player.color });
        delete player.color;
      }
    });
    const sideIds = Object.keys(before.sides).sort();
    const sameSides = JSON.stringify(sideIds) === JSON.stringify(Object.keys(remaining.sides).sort());
    if (sameSides) {
      for (const id of sideIds) {
        const previous = before.sides[id].color;
        const current = remaining.sides[id].color;
        if (isHex(previous) && isHex(current) && previous !== current) {
          colors.push({ kind: 'side-replacement', id, before: previous, after: current });
          remaining.sides[id].color = previous;
        }
      }
    }
  }
  return { remaining, changes, colors, stroke };
}

function expectedPage(report) {
  const names = new Map(Object.entries(report.sides || {}).map(([id, side]) => [id, side.name]));
  for (const player of [...(report.settlementPlayers || []), ...report.players]) names.set(player.id, player.name);
  return {
    gross: Object.fromEntries(report.players.map(player => [player.name, player.gross.map(value => String(value ?? '—'))])),
    payments: report.payments.map(({ from, to, amt }) => [
      names.get(from) ?? from, names.get(to) ?? to, '$' + Math.abs(amt).toFixed(amt % 1 ? 2 : 0),
    ]),
    story: report.meta.story.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean),
  };
}

async function characterizePopup(app, id, view) {
  return app.evaluate(async ({ id, view }) => {
    const audit = { violations: [], prints: 0, returnCalls: 0 };
    const originalOpen = window.open;
    let popup;
    window.open = (...args) => {
      popup = originalOpen.apply(window, args);
      if (!popup) throw new Error('Export popup did not open');
      const openDocument = popup.document.open.bind(popup.document);
      popup.document.open = (...openArgs) => {
        const result = openDocument(...openArgs);
        popup.addEventListener('securitypolicyviolation', event => {
          audit.violations.push({ directive: event.violatedDirective, uri: event.blockedURI });
        });
        popup.print = () => { audit.prints++; };
        return result;
      };
      return popup;
    };
    try {
      openPrintScorecard(id, view);
      const until = Date.now() + 2500;
      while ((!popup?.document.getElementById('manualPrintBtn') || audit.prints === 0) && Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const print = popup?.document.getElementById('manualPrintBtn');
      const back = popup?.document.getElementById('returnToAppBtn');
      if (!print || !back) throw new Error('Export controls did not appear for ' + view);
      audit.autoPrint = audit.prints;
      print.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      audit.manualPrint = audit.prints - audit.autoPrint;
      const close = popup.close.bind(popup);
      popup.close = () => { audit.returnCalls++; close(); };
      back.click();
      audit.closedAfterReturn = popup.closed;
      return audit;
    } finally {
      window.open = originalOpen;
      if (popup && !popup.closed) popup.close();
    }
  }, { id, view });
}

async function fixture(origin) {
  const engine = loadLiveEngine();
  const state = engine.seedState(visualFixture().state);
  const match = state.matches[0];
  const report = engine.buildLedgerEntryReportModel(match);
  Object.assign(report.meta, { status: 'final', story: 'Synthetic accepted Story.' });
  match.ledgerEntrySnapshot = { status: 'accepted', roundId: match.id, acceptedAt: timestamp, report };
  const file = await api.buildRecoveryFile({ state }, {
    appVersion: 'synthetic', createdAt: timestamp, sourceOrigin: origin, fileId: 'viewer-fixture',
  });
  const bytes = api.serialize(file);
  const plan = await api.planRestore(bytes, { profileNonce: 'viewer-fixture', restoredAt: timestamp });
  const marker = { ...plan.marker, phase: 'restored-verified', completedAt: timestamp,
    results: { rounds: 1, receipts: 0, backup: 'verified' } };
  return { bytes, marker, values: plan.values };
}

test('AC-F1–F4 viewer verifies the file, consumes one transfer and cannot queue Ledger changes', async () => {
  assert.ok(chrome, 'Set CHROME_PATH for the required recovery viewer checks.');
  const server = await startServer();
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'] });
    const page = await browser.newPage();
    const requests = [];
    const sockets = [];
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.webSocketCreated', event => sockets.push(event.url));
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().startsWith('data:')) return request.continue();
      requests.push(request.url());
      return new URL(request.url()).origin === origin ? request.continue() : request.abort();
    });
    await page.evaluateOnNewDocument(() => {
      window.audit = { writes: [], violations: [], prints: 0 };
      addEventListener('securitypolicyviolation', event => window.audit.violations.push(event.violatedDirective));
      window.print = () => { window.audit.prints++; };
      for (const name of ['setItem', 'removeItem', 'clear']) {
        const original = Storage.prototype[name];
        Storage.prototype[name] = function (...args) {
          window.audit.writes.push([this === localStorage ? 'local' : 'session', name, args[0]]);
          return original.apply(this, args);
        };
      }
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') window.audit.writes.push(['indexeddb', this.name]);
        return transaction.apply(this, args);
      };
    });
    const url = origin + recoveryPath;
    await page.goto(url);
    assert.equal(await page.$eval('#recoveryViewer', node => node.hidden), true);
    const { bytes, marker, values } = await fixture(origin);
    await page.evaluate(({ values, marker, key }) => {
      for (const [name, value] of Object.entries(values)) localStorage.setItem(name, value);
      localStorage.setItem(key, JSON.stringify(marker));
    }, { values, marker, key: api.restoreKeys.marker });
    await page.reload();
    assert.equal(await page.$('input[type=file]'), null);
    const snapshot = () => page.evaluate(async () => ({
      local: Object.entries(localStorage).sort(),
      session: Object.entries(sessionStorage).sort(),
      databases: await indexedDB.databases(),
      caches: await caches.keys(),
      workers: (await navigator.serviceWorker.getRegistrations()).length,
    }));
    const before = await snapshot();
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }));
    await page.click('#viewRecoveryRounds');
    assert.match(await page.$eval('#recoveryStatus', node => node.textContent), /Reconnect to open the Ledger viewer/);
    assert.equal(await page.$('input[type=file]'), null);
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }));
    await page.click('#viewRecoveryRounds');
    const select = text => page.$eval('#recoveryViewerPicker input', (input, fileText) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([fileText], 'synthetic.json'));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
    }, text);
    await select(bytes + ' ');
    await page.waitForFunction(message => document.querySelector('#recoveryStatus').textContent === message, {}, fileRefusal);
    assert.equal(page.url(), url);
    assert.deepEqual(await snapshot(), before);
    await select(bytes);
    await page.waitForSelector('#recoveryViewerRounds button');
    await Promise.all([page.waitForNavigation(), page.click('#recoveryViewerRounds button')]);
    await page.waitForSelector('#doc .page');
    assert.match(page.url(), /view=recovery/);
    const inspected = await page.evaluate(() => {
      const acceptance = Object.getOwnPropertyDescriptor(window, '__DYE_LEDGER_QUEUE_ACCEPTANCE__');
      const revision = Object.getOwnPropertyDescriptor(window, '__DYE_LEDGER_QUEUE_REVISION__');
      window.confirm = () => true;
      document.querySelector('#acceptLedgerEntryBtn').click();
      document.querySelector('#reviseLedgerEntryBtn').click();
      return {
        controls: ['#acceptLedgerEntryBtn', '#reviseLedgerEntryBtn'].map(selector => document.querySelector(selector).hidden),
        status: document.querySelector('#ledgerAcceptanceStatus').textContent,
        opener: window.opener,
        queues: [acceptance, revision].map(property => [property.value({}), property.writable, property.configurable]),
      };
    });
    assert.deepEqual(inspected.controls, [true, true]);
    assert.match(inspected.status, /View only|could not be unlocked/i);
    assert.equal(inspected.opener, null);
    assert.deepEqual(inspected.queues, [[false, false, false], [false, false, false]]);
    await page.click('#printLedgerEntryBtn');
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await page.evaluate(() => window.audit.violations), []);
    assert.deepEqual(await page.evaluate(() => window.audit.writes.filter(([area]) => area !== 'session')), []);
    await page.reload();
    assert.match(await page.$eval('#doc', node => node.textContent), /Report data is no longer available/);
    assert.equal(await page.evaluate(() => window.__DYE_LEDGER_QUEUE_REVISION__('synthetic')), false);
    await Promise.all([page.waitForNavigation(), page.click('#returnToMatchBtn')]);
    assert.equal(page.url(), url);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(sockets, []);
    assert.ok(requests.every(address => new URL(address).origin === origin));
  } finally {
    try { await browser?.close(); }
    finally { await new Promise(resolve => server.close(resolve)); }
  }
});

test('AC-R3 real recovery download and restored Ledger render against the ordinary shell and app', { timeout: 90000 }, async () => {
  const startedAt = performance.now();
  assert.ok(chrome, 'Set CHROME_PATH for the required recovery viewer checks.');
  const base = resolve(process.env.DYE_R1_F_EVIDENCE || 'tmp/report-qa/wp-lib-01-r1-f-checkpoints');
  await mkdir(base, { recursive: true });
  const evidence = await mkdtemp(join(base, 'f3-render-'));
  let browser;
  let server;
  let download;
  let recovery;
  let active;
  let pendingCall;
  let lastCompletedCall;
  let sequence = 0;
  const measurements = {};
  const log = (event, details = {}) => appendFileSync(join(evidence, 'progress.jsonl'),
    JSON.stringify({ event, elapsedMs: performance.now() - startedAt, ...details }) + '\n');
  const save = (name, data) => writeFileSync(join(evidence, name + '.json'), JSON.stringify(data, null, 2), { flag: 'wx' });
  async function bound(operation, ms) {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('Operation timed out'), { timedOut: true })), ms);
      })]);
    } finally { clearTimeout(timer); }
  }
  let watchdog;
  const watchdogFailure = new Promise((_, reject) => {
    watchdog = setTimeout(() => reject(Object.assign(new Error('85-second watchdog fired'), { timedOut: true })),
      Math.max(0, 85000 - (performance.now() - startedAt)));
  });
  // The watchdog may expire between steps, before the next race is installed.
  watchdogFailure.catch(() => {});
  async function call(name, operation) {
    pendingCall = name;
    log('call-start', { step: active, name });
    try {
      const result = await operation();
      lastCompletedCall = name;
      pendingCall = null;
      log('call-done', { step: active, name });
      return result;
    } catch (error) {
      log('call-fail', { step: active, name, message: error.message });
      throw error;
    }
  }
  async function activate(page, name) {
    const visibility = await call(name + ':read-visibility', () => page.evaluate(() => ({
      visibility: document.visibilityState, focused: document.hasFocus(),
    })));
    save('visibility-' + name, { url: page.url(), ...visibility });
    await call(name + ':bring-to-front', () => page.bringToFront());
  }
  async function step(name, operation, ms = 8000) {
    const id = ++sequence;
    active = name;
    log('start', { id, name, ms });
    try {
      const value = await Promise.race([watchdogFailure, bound(operation, ms)]);
      log('done', { id, name });
      active = null;
      return value;
    } catch (error) {
      const event = error.timedOut ? 'timeout' : 'fail';
      log(event, { id, name, message: error.message });
      if (error.timedOut) save('timeout-' + id, {
        id, name, message: error.message,
        targets: browser?.targets().map(target => ({ type: target.type(), url: target.url() })) || [],
      });
      throw new Error(name + ': ' + error.message, { cause: error });
    }
  }
  try {
    server = await step('setup:server', startServer);
    const origin = 'http://127.0.0.1:' + server.address().port;
    await step('setup:chrome', async () => {
      browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 7500,
        args: ['--no-sandbox', '--disable-gpu', '--disable-background-networking'] });
    });
    browser.on('targetcreated', target => log('target', { type: target.type(), url: target.url() }));
    const version = await step('setup:chrome-version', () => browser.version());
    save('m01-setup', { chrome, version, origin });
    const source = await step('setup:source-context', () => browser.createBrowserContext());
    const destination = await step('setup:destination-context', () => browser.createBrowserContext());
    async function newPage(context) {
      const page = await context.newPage();
      page.on('dialog', dialog => log('dialog', { type: dialog.type(), message: dialog.message() }));
      page.on('pageerror', error => log('pageerror', { url: page.url(), message: error.message }));
      page.on('console', message => { if (message.type() === 'error') log('console', { url: page.url(), text: message.text() }); });
      page.on('requestfailed', request => log('requestfailed', { url: request.url(), error: request.failure()?.errorText }));
      page.on('popup', popup => log('popup', { url: popup.url() }));
      await page.setRequestInterception(true);
      page.on('request', request => request.url().startsWith(origin + '/') || request.url().startsWith('data:')
        ? request.continue() : request.abort());
      await page.evaluateOnNewDocument(() => {
        if (!location.pathname.endsWith('/ledger-report/shell.html')) return;
        let report;
        Object.defineProperty(globalThis, '__DYE_LEDGER_ROUND__', {
          configurable: true,
          get: () => report,
          set(value) {
            report = value;
            globalThis.__fixtureReportBeforeRender = JSON.stringify(value);
          },
        });
        globalThis.__fixtureLedgerAudit = { violations: [], prints: 0 };
        addEventListener('securitypolicyviolation', event => {
          globalThis.__fixtureLedgerAudit.violations.push({ directive: event.violatedDirective, uri: event.blockedURI });
        });
        window.print = () => { globalThis.__fixtureLedgerAudit.prints++; };
      });
      return page;
    }
    const app = await step('setup:source-page', () => newPage(source));
    const state = visualFixture().state;
    const labels = ['neutral-stroke', 'neutral-skins', 'nassau-press', 'story-conflict'];
    const template = state.matches[0];
    for (const [index, id] of labels.entries()) {
      const row = { ...structuredClone(template), id, name: id, status: 'complete' };
      row.featuredCompetition = index === 2 ? 'nassau' : 'stroke_gross';
      row.selectedGames = index === 2 ? [{ ...template.selectedGames[0], pressEnabled: true, pressThreshold: 2 }]
        : index === 1 ? [template.selectedGames.find(game => game.key === 'skins')] : [];
      for (const [playerIndex, player] of row.players.entries()) {
        player.scores.forEach((score, hole) => {
          score.gross = index === 1 ? (playerIndex === 0 ? 3 : 4 + playerIndex)
            : 3 + ((playerIndex + hole) % 3);
        });
      }
      state.matches.push(row);
    }
    state.matches.push({ ...structuredClone(state.matches[1]), id: 'no-ledger', name: 'no-ledger' });
    await app.evaluateOnNewDocument(seed => {
      if (!localStorage.getItem('the-dye-ledger-v20')) localStorage.setItem('the-dye-ledger-v20', JSON.stringify(seed));
      Object.defineProperty(navigator, 'serviceWorker', { value: {
        controller: null, ready: Promise.resolve({ active: null }), addEventListener() {},
        register: async () => ({ active: null, addEventListener() {}, update: async () => {} }),
        getRegistrations: async () => [],
      } });
    }, state);
    await step('setup:source-navigation', () => app.goto(origin + '/'));
    await step('setup:accept-fixtures', () => app.evaluate(({ labels, timestamp }) => {
      for (const id of labels) {
        const match = getMatch(id);
        const metrics = computeMatchMetrics(match);
        const report = buildLedgerEntryReportModel(match, metrics);
        Object.assign(report.meta, { status: 'final', story: id === 'story-conflict'
          ? 'Alex won every hole and shot 18.' : 'The group completed the round.' });
        const result = acceptLedgerEntrySnapshotEnvelope({ roundId: id, acceptedAt: timestamp, report });
        if (!result.accepted) throw new Error(id + ': ' + result.reason);
      }
    }, { labels, timestamp }));
    download = await step('download:create-session', () => browser.target().createCDPSession());
    const started = [];
    const progress = [];
    download.on('Browser.downloadWillBegin', event => started.push(event));
    download.on('Browser.downloadProgress', event => progress.push(event));
    await step('download:configure', () => download.send('Browser.setDownloadBehavior', {
      behavior: 'allow', browserContextId: source.id, downloadPath: evidence, eventsEnabled: true,
    }));
    measurements.download = { directory: evidence, started, progress };
    await step('save:settings', () => app.click('[data-tab="settings"]'));
    await step('save:data-tools', () => app.click('#settings [data-experience-target="utilities"]'));
    await step('save:visible', () => app.waitForSelector('#saveRecoveryFileBtn', { visible: true }));
    await step('save:module-ready', () => app.waitForFunction(() => ['ready', 'unavailable', 'blocked']
      .includes(document.querySelector('#saveRecoveryFileBtn')?.dataset.recoveryFileState),
    { timeout: 5000, polling: 50 }));
    await step('save:show-code', () => app.click('#showRecoveryIsolationCodeBtn'));
    const code = await step('save:read-code', () =>
      app.$eval('#recoveryToolsStatus', node => node.textContent.match(/[0-9a-f-]{36}/i)?.[0]));
    assert.ok(code);
    const completed = () => progress.some(event => event.guid === started[0]?.guid && event.state === 'completed');
    const settlingStarted = performance.now();
    try {
      await step('save:settle', () => app.waitForFunction(() => {
        const now = performance.now();
        const source = captureRecoverySources();
        const prior = window.__fixtureExportSettling;
        const same = prior?.source.fingerprint === source.fingerprint;
        const timerVisible = typeof setupDraftSaveTimer !== 'undefined';
        const timerIdle = timerVisible && setupDraftSaveTimer === null;
        const stableSince = same && prior.timerIdle && timerIdle ? prior.stableSince : now;
        window.__fixtureExportSettling = {
          source, timerVisible, timerIdle, stableSince, stableMs: now - stableSince,
          samples: (prior?.samples || 0) + 1,
          changes: (prior?.changes || 0) + (prior && !same ? 1 : 0),
        };
        return timerIdle && now - stableSince >= 400;
      }, { polling: 50, timeout: 5000 }), 5500);
    } finally {
      const elapsedMs = performance.now() - settlingStarted;
      const sample = await step('save:read-settling', () => app.evaluate(() => window.__fixtureExportSettling ?? null));
      if (sample) {
        const { source: last, ...details } = sample;
        measurements.download.quiescence = {
          ...details, elapsedMs,
          hashes: Object.fromEntries(await Promise.all(Object.entries(last.values).map(async ([key, value]) =>
            [key, value === null ? null : await api.sha256Hex(value)]))),
          stateHash: await api.sha256Hex(last.stateText),
        };
      } else {
        measurements.download.quiescence = { elapsedMs, samples: 0 };
      }
      save('m02-settling', measurements.download.quiescence);
    }
    await step('save:click', () => app.click('#saveRecoveryFileBtn'));
    await step('save:observe-download', async () => {
      const deadline = Date.now() + 5000;
      while (!completed() && Date.now() < deadline) await delay(25);
    }, 5500);
    measurements.download.appStatus = await step('save:status', () => app.$eval('#recoveryToolsStatus', node => node.textContent));
    measurements.download.moduleState = await step('save:module-state', () => app.$eval('#saveRecoveryFileBtn', node => node.dataset.recoveryFileState));
    if (measurements.download.appStatus.includes('changed while saving')) {
      measurements.download.refusal = await step('save:read-refusal', () => app.evaluate(() => {
        const previous = window.__fixtureExportSettling.source;
        const current = captureRecoverySources();
        return {
          changedKeys: Object.keys(current.values).filter(key => current.values[key] !== previous.values[key]),
          stateChanged: current.stateText !== previous.stateText,
        };
      }));
    }
    save('m03-download', measurements.download);
    assert.equal(started.length, 1, 'expected exactly one real recovery download');
    assert.ok(completed(), 'expected Chromium to complete the recovery download');
    assert.match(measurements.download.appStatus, /SHA-256/);
    const path = join(evidence, started[0].suggestedFilename);
    const text = await readFile(path, 'utf8');
    const { file } = api.parseRecoveryFile(text);
    const verifiedFile = await api.verifyRecoveryFile(file);
    measurements.fileSha256 = await api.sha256Hex(text);
    save('m04-file-hash', { verified: verifiedFile.ok, fileSha256: measurements.fileSha256, appStatus: measurements.download.appStatus });
    assert.equal(verifiedFile.ok, true);
    assert.ok(measurements.download.appStatus.includes(measurements.fileSha256));
    recovery = await step('restore:new-page', () => newPage(destination));
    await step('restore:verified', async () => {
      await recovery.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
      });
      await recovery.goto(origin + recoveryPath);
      await recovery.click('#checkIsolation');
      await recovery.waitForSelector('#originalCanary', { visible: true });
      await recovery.type('#originalCanary', code);
      await recovery.click('#canaryAbsent');
      await recovery.click('#confirmIsolation');
      await (await recovery.waitForSelector('#recoveryPicker input')).uploadFile(path);
      await recovery.waitForFunction(() => !document.querySelector('#restoreRecovery').disabled);
      await recovery.click('#restoreRecovery');
      await recovery.waitForFunction(() => document.querySelector('#recoveryStatus').textContent.startsWith('Verified recovery:'));
      const markerHash = await recovery.evaluate(key => JSON.parse(localStorage.getItem(key)).fileSha256, api.restoreKeys.marker);
      save('m05-restore', { markerHash });
      assert.equal(markerHash, measurements.fileSha256);
    }, 10000);

    const restoredApp = await step('restored-app:new-page', () => newPage(destination));
    await step('restored-app:navigate', () => restoredApp.goto(origin + '/'));
    const guard = await step('restored-app:guard', () => restoredApp.evaluate(() => globalThis.__DYE_RECOVERY_GUARD__?.state));
    save('m06-restored-app', { guard });
    assert.equal(guard, 'G1');
    measurements.fu9 = { G0: {}, G1: {} };
    for (const view of ['scorecard', 'summary']) {
      for (const [mode, page] of [['G0', app], ['G1', restoredApp]]) {
        const audit = await step('fu9:' + mode + ':' + view, () => characterizePopup(page, labels[0], view), 6000);
        measurements.fu9[mode][view] = audit;
        save('m07-' + mode + '-' + view, audit);
        if (mode === 'G0') {
          assert.deepEqual(audit.violations, [], mode + ' ' + view + ' CSP');
          assert.equal(audit.autoPrint, 1, mode + ' ' + view + ' auto-print');
          assert.equal(audit.manualPrint, 1, mode + ' ' + view + ' manual print');
          assert.equal(audit.returnCalls, 1, mode + ' ' + view + ' Return');
        }
      }
    }

    async function measure(page) {
      await page.waitForSelector('#doc .page');
      await page.evaluate(() => document.fonts.ready.then(() => true));
      return page.evaluate(() => {
        const pages = [...document.querySelectorAll('#doc .page')];
        const gross = {};
        for (const row of document.querySelectorAll('#doc table.sc tr[data-row]')) {
          const name = row.querySelector('td.pl b')?.textContent.trim();
          const cells = [...row.querySelectorAll('td.cell:not(.tot) .g')].map(cell => cell.textContent.trim());
          if (name && cells.length) (gross[name] ||= []).push(cells);
        }
        return {
          subjects: pages.map(node => node.querySelector('.wordmark em')?.textContent.trim() || 'Result'),
          headings: [...document.querySelectorAll('#doc .sechead')].map(node => node.textContent.trim()),
          overflow: pages.map(node => {
            const flow = node.querySelector('.flow');
            const last = flow?.lastElementChild;
            return [
              last ? Math.ceil(last.getBoundingClientRect().bottom - flow.getBoundingClientRect().top) - flow.clientHeight : 0,
              Math.max(0, node.scrollWidth - node.clientWidth),
            ];
          }),
          report: globalThis.__DYE_LEDGER_ROUND__,
          beforeRender: JSON.parse(globalThis.__fixtureReportBeforeRender),
          text: document.querySelector('#doc').innerText,
          gross,
          payments: [...document.querySelectorAll('#doc .pay')].map(row => {
            const parties = row.querySelector('em');
            const separator = parties.querySelector('.dim');
            return [separator.previousSibling.textContent.trim(), separator.nextSibling.textContent.trim(),
              row.lastElementChild.textContent.trim()];
          }),
          story: [...document.querySelectorAll('#doc .prose p')].map(node => node.textContent.trim()),
          factsNote: /Facts-based recap shown/.test(document.querySelector('#doc').innerText),
          presses: [...document.querySelectorAll('#doc [data-press-detail]')].map(node => node.textContent.trim()),
          audit: globalThis.__fixtureLedgerAudit,
        };
      });
    }
    const shape = ({ subjects, headings }) => ({ subjects, headings });
    for (const [index, id] of labels.entries()) {
      await step(id + ':select-file', async () => {
        await activate(recovery, id + '-selection');
        await call('set-online', () => recovery.evaluate(() =>
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })));
        await call('open-picker', () => recovery.click('#viewRecoveryRounds'));
        const input = await call('wait-for-file-input', () => recovery.waitForSelector('#recoveryViewerPicker input'));
        await call('upload-file', () => input.uploadFile(path));
        await call('wait-for-verified-rows', () => recovery.waitForFunction(() =>
          document.querySelectorAll('#recoveryViewerRounds button').length === 4));
        await call('check-no-ledger-row', async () => {
          assert.equal(await recovery.$$eval('#recoveryViewerRounds li', rows => rows.find(row =>
            row.textContent.startsWith('no-ledger ·'))?.querySelector('button') === null), true);
        });
        const buttons = await call('read-ledger-buttons', () => recovery.$$('#recoveryViewerRounds button'));
        let navigation;
        await call('register-navigation', () => {
          navigation = recovery.waitForNavigation();
          navigation.catch(() => {});
        });
        await call('click-ledger', () => buttons[index].click());
        await call('wait-for-navigation', () => navigation);
      });
      const viewed = await step(id + ':measure-viewer', () => measure(recovery));
      if (index === 0) {
        measurements.fu9.viewer = await step('fu9:viewer:print', async () => {
          await recovery.click('#printLedgerEntryBtn');
          await recovery.waitForFunction(() => globalThis.__fixtureLedgerAudit.prints === 1);
          return recovery.evaluate(() => globalThis.__fixtureLedgerAudit);
        });
        save('m07-viewer', measurements.fu9.viewer);
      }
      const ref = await step(id + ':new-reference', () => newPage(source));
      const saved = file.payload.state.matches.find(match => match.id === id);
      const expected = archivedReport(saved);
      await step(id + ':seed-reference', () => ref.evaluateOnNewDocument(report => sessionStorage.setItem('synthetic-reference', JSON.stringify({
        report, createdAt: new Date().toISOString(), autoPrint: false,
      })), expected));
      await step(id + ':navigate-reference', () => ref.goto(origin + '/ledger-report/shell.html?reportKey=synthetic-reference'));
      const reference = await step(id + ':measure-reference', () => measure(ref));
      const ordinary = await step(id + ':new-ordinary', () => newPage(source));
      await step(id + ':navigate-ordinary', () => ordinary.goto(origin + '/'));
      await step(id + ':open-ordinary-ledger', () => Promise.all([ordinary.waitForNavigation(), ordinary.evaluate(id => {
        shouldUseSameTabLedgerReport = () => true;
        void openUnifiedExport(getMatch(id), 'ledger');
      }, id)]));
      const current = await step(id + ':measure-ordinary', () => measure(ordinary));
      const expectedCanonical = api.canonical(expected);
      await writeFile(join(evidence, id + '-expected.json'), expectedCanonical, { flag: 'wx' });
      const runs = { viewed, reference, current };
      const changes = {};
      for (const [name, entry] of Object.entries(runs)) {
        await writeFile(join(evidence, id + '-' + name + '-before.json'), api.canonical(entry.beforeRender), { flag: 'wx' });
        await writeFile(join(evidence, id + '-' + name + '-after.json'), api.canonical(entry.report), { flag: 'wx' });
        changes[name] = compareRenderedModel(entry.beforeRender, entry.report);
      }
      measurements[id] = {
        renders: Object.fromEntries(Object.entries(runs).map(([name, { beforeRender, report, ...dom }]) => [
          name, { ...dom, modelPayments: report.payments,
            addedFields: changes[name].changes.map(({ group, index, key }) => ({ group, index, key })),
            colorChanges: changes[name].colors },
        ])),
        press: index === 2 ? (current.presses.length || viewed.presses.length ? 'DEMONSTRATED' : 'NOT_DEMONSTRATED') : null,
      };
      save('m08-' + id, measurements[id]);
      if (index === 0 || index === 2) {
        await step(id + ':screenshot-viewer', () => recovery.screenshot({ path: join(evidence, id + '-view.png'), fullPage: true }), 5000);
        await step(id + ':screenshot-reference', () => ref.screenshot({ path: join(evidence, id + '-reference.png'), fullPage: true }), 5000);
      }
      await writeFile(join(evidence, id + '-helper.json'), api.canonical(api.acceptedLedgerReport(saved)), { flag: 'wx' });
      assert.equal(api.canonical(api.acceptedLedgerReport(saved)) === expectedCanonical, true, id + ' helper snapshot');
      const expectedDom = expectedPage(expected);
      for (const [name, entry] of Object.entries({ viewed, reference })) {
        assert.equal(api.canonical(entry.beforeRender) === expectedCanonical, true, id + ' ' + name + ' pre-render');
        assert.equal(api.canonical(changes[name].remaining) === expectedCanonical, true, id + ' ' + name + ' post-render');
        assert.equal(changes[name].changes.length,
          expected.players.length * derivedPlayerFields.length + expected.games.length * derivedGameFields.length);
        assert.equal(changes[name].colors.length,
          changes[name].stroke ? expected.players.length + Object.keys(expected.sides).length : 0);
        assert.deepEqual(Object.keys(entry.gross).sort(), Object.keys(expectedDom.gross).sort());
        for (const [player, cards] of Object.entries(entry.gross)) {
          for (const card of cards) assert.deepEqual(card, expectedDom.gross[player], id + ' ' + player);
        }
        assert.deepEqual(entry.payments, expectedDom.payments, id + ' payments');
        assert.deepEqual(entry.story, expectedDom.story, id + ' Story');
        assert.equal(entry.factsNote, false, id + ' archived Story audit');
      }
      assert.deepEqual(changes.viewed.colors, changes.reference.colors, id + ' renderer colors');
      assert.deepEqual(shape(viewed), shape(reference), id);
      assert.equal(viewed.text, reference.text, id + ' page text');
      for (const [name, entry] of Object.entries(runs)) {
        assert.ok(entry.overflow.every(([vertical, horizontal]) => vertical <= 1 && horizontal === 0), id + ' ' + name);
      }
      if (index < 2) assert.deepEqual(current.subjects, viewed.subjects, id);
      if (index === 1) {
        assert.ok(expected.games.some(game => Object.values(game.money || {}).some(amount => amount !== 0)), 'nonzero game money');
        assert.ok(expected.payments.some(payment => payment.amt !== 0), 'nonzero settlement');
      }
      if (index === 0) {
        await step('restored-ledger:activate', () => activate(restoredApp, 'restored-ledger'));
        await step('restored-ledger:open', () => Promise.all([restoredApp.waitForNavigation(), restoredApp.evaluate(id => {
          shouldUseSameTabLedgerReport = () => true;
          void openUnifiedExport(getMatch(id), 'ledger');
        }, id)]));
        const restoredLedger = await step('restored-ledger:measure', () => measure(restoredApp));
        measurements.restoredApp = { ...shape(restoredLedger), overflow: restoredLedger.overflow, audit: restoredLedger.audit };
        save('m09-restored-ledger', measurements.restoredApp);
        assert.deepEqual(restoredLedger.subjects, viewed.subjects);
        assert.deepEqual(restoredLedger.audit.violations, []);
        assert.deepEqual(viewed.audit.violations, []);
        await step('restored-ledger:close', () => restoredApp.close());
      }
      await step(id + ':activate-return', () => activate(recovery, id + '-return'));
      await step(id + ':return-to-recovery', () => Promise.all([recovery.waitForNavigation(), recovery.click('#returnToMatchBtn')]));
      await step(id + ':close-ordinary', () => ordinary.close());
      await step(id + ':close-reference', () => ref.close());
    }
  } catch (error) {
    log('test-fail', { name: active, message: error.message });
    const failure = { step: active, pendingCall, lastCompletedCall, url: recovery?.url(), message: error.message };
    if (recovery) {
      try {
        failure.page = await bound(() => recovery.evaluate(() => {
          const input = document.querySelector('#recoveryViewerPicker input');
          const viewer = document.querySelector('#recoveryViewer');
          const rows = [...document.querySelectorAll('#recoveryViewerRounds li')];
          return {
            status: document.querySelector('#recoveryStatus')?.textContent,
            visibility: document.visibilityState, focused: document.hasFocus(),
            viewerShown: viewer ? !viewer.hidden : null, inputPresent: Boolean(input),
            fileCount: input?.files?.length ?? null, rowCount: rows.length,
            buttonCount: document.querySelectorAll('#recoveryViewerRounds button').length,
            rows: rows.map(row => row.textContent),
          };
        }), 2000);
      } catch (captureError) { failure.captureError = captureError.message; }
    }
    save('failure-' + sequence, failure);
    throw error;
  } finally {
    clearTimeout(watchdog);
    const cleanup = {};
    const cleanupStep = async (name, action, maxMs) => {
      log('cleanup-start', { name });
      try {
        await bound(action, Math.max(1, Math.min(maxMs, 89800 - (performance.now() - startedAt))));
        cleanup[name] = 'done';
      } catch (error) { cleanup[name] = error.message; }
      log('cleanup-result', { name, result: cleanup[name] });
    };
    try {
      save('measurements', measurements);
    } finally {
      if (browser) {
        const child = browser.process();
        await cleanupStep('browser-close', () => browser.close(), 4500);
        if (cleanup['browser-close'] !== 'done') {
          cleanup.forcedBrowserKill = Boolean(child?.kill('SIGKILL'));
        }
      }
      if (download) await cleanupStep('download-detach', async () => {
        if (browser?.connected && !download.detached) await download.detach();
      }, 250);
      if (server) await cleanupStep('server-close', () => new Promise((done, reject) => {
        server.close(error => error ? reject(error) : done());
        server.closeAllConnections();
      }), 250);
      save('cleanup', cleanup);
      if (Object.entries(cleanup).some(([, result]) => result !== 'done')) {
        throw new Error('F-3 cleanup required intervention or failed. See cleanup.json.');
      }
    }
  }
});
