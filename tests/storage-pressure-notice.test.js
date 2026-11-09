import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import '../preserved-score-review.js';
import { loadLiveEngine } from '../scripts/live-engine-adapter.js';
import { chrome, openVisualPage, startServer, visualFixture } from './support/design-browser.js';

const { pressure, canonical } = globalThis.DyeLedgerPreservedReview;
const mainKey = 'the-dye-ledger-v20';
const backupKey = `${mainKey}:last-known-good`;
const outboxKey = `${mainKey}:shared-score-outbox:v1`;
const totalLimit = 2 * 1024 * 1024;
const deliveryLimit = 256 * 1024;
const emptyOutbox = { operations: [], preservedForHostReview: [] };
const pending = { operationId: 'pending-1', matchId: 'design-round', playerId: 'p0', holeNumber: 1 };
const review = { matchId: 'design-round' };
const unmatched = { matchId: 'unmatched-round' };

function sizedEntry(key, bytes) {
  return [key, 'x'.repeat(bytes / 2 - key.length)];
}

function trappedStore(entries) {
  const rows = new Map(entries);
  const counts = { key: 0, getItem: 0, writes: 0 };
  const rejectWrite = () => { counts.writes++; throw Error('Unexpected storage write'); };
  const storage = {
    get length() { return rows.size; },
    key(index) { counts.key++; return [...rows.keys()][index]; },
    getItem(key) { counts.getItem++; return rows.get(key) ?? null; },
    setItem: rejectWrite,
    removeItem: rejectWrite,
    clear: rejectWrite,
  };
  return { storage, counts, snapshot: () => JSON.stringify([...rows]) };
}

test('pressure reconciles raw byte estimates in a single read-only pass', () => {
  const store = trappedStore([
    sizedEntry(mainKey, 1281422), sizedEntry(backupKey, 1281454),
    sizedEntry('synthetic-cloud-cache', 261700), sizedEntry('synthetic-other', 456536),
  ]);
  const before = store.snapshot();
  const result = pressure(store.storage, emptyOutbox, { mainKey, backupKey });
  assert.equal(result.totalBytes, 3281112);
  assert.equal(result.mainBytes, 1281422);
  assert.equal(result.backupBytes, 1281454);
  assert.equal(result.otherBytes, 718236);
  assert.equal(result.mainBytes + result.backupBytes + result.otherBytes, result.totalBytes);
  assert.equal(result.warning, true);
  assert.equal(result.totalWarning, true);
  assert.equal(result.deliveryWarning, false);
  assert.deepEqual(store.counts, { key: 4, getItem: 4, writes: 0 });
  assert.equal(store.snapshot(), before);
  const { describeStoragePressure } = loadLiveEngine();
  const sizeSection = describeStoragePressure(result).sections.find(section => section.id === 'size');
  assert.match(sizeSection.text, /About 3205 KiB stored\. Main app data: about 1252 KiB\. Recovery backup: about 1252 KiB\. Other local data: about 702 KiB\./);
  const unclassified = pressure(store.storage, emptyOutbox);
  assert.equal(unclassified.mainBytes, 0);
  assert.equal(unclassified.backupBytes, 0);
  assert.equal(unclassified.otherBytes, result.totalBytes);
});

test('pressure preserves inclusive total and delivery boundaries', () => {
  for (const offset of [-2, 0, 2]) {
    const totalStore = trappedStore([sizedEntry(mainKey, totalLimit + offset)]);
    const measuredTotal = pressure(totalStore.storage, emptyOutbox);
    assert.equal(measuredTotal.totalBytes, totalLimit + offset);
    assert.equal(measuredTotal.totalWarning, offset >= 0);
    assert.equal(measuredTotal.warning, offset >= 0);

    const outbox = { ...emptyOutbox, padding: '' };
    outbox.padding = 'x'.repeat((deliveryLimit + offset) / 2 - canonical(outbox).length);
    const deliveryStore = trappedStore([]);
    const measuredDelivery = pressure(deliveryStore.storage, outbox);
    assert.equal(measuredDelivery.deliveryBytes, deliveryLimit + offset);
    assert.equal(measuredDelivery.deliveryWarning, offset >= 0);
    assert.equal(measuredDelivery.warning, offset >= 0);
    assert.equal(measuredDelivery.pending + measuredDelivery.review, 0);
    assert.equal(totalStore.counts.writes + deliveryStore.counts.writes, 0);
  }
});

const noticeCases = [
  { name: 'below thresholds', ids: [] },
  { name: 'size only', total: true, ids: ['size'] },
  { name: 'size and pending', total: true, operations: [pending], ids: ['size', 'pending'] },
  { name: 'size and review', total: true, reviews: [review], ids: ['size', 'review'] },
  { name: 'size and mixed', total: true, operations: [pending], reviews: [review], ids: ['size', 'pending', 'review'] },
  { name: 'delivery pending only', delivery: true, operations: [pending], ids: ['delivery', 'pending'] },
  { name: 'delivery review only', delivery: true, reviews: [review], ids: ['delivery', 'review'] },
  { name: 'delivery mixed', delivery: true, operations: [pending], reviews: [review], ids: ['delivery', 'pending', 'review'] },
  { name: 'delivery zero counts', delivery: true, ids: ['delivery'] },
  { name: 'both thresholds', total: true, delivery: true, operations: [pending], ids: ['size', 'delivery', 'pending'] },
  { name: 'partial unmatched', total: true, reviews: [review, unmatched], ids: ['size', 'review', 'unmatched'] },
  { name: 'all unmatched', total: true, reviews: [unmatched], ids: ['size', 'review', 'unmatched'] },
];

function caseOutbox({ operations = [], reviews = [], delivery }) {
  const outbox = { operations: structuredClone(operations), preservedForHostReview: structuredClone(reviews) };
  if (delivery) {
    const row = outbox.operations[0] || outbox.preservedForHostReview[0] || outbox;
    row.padding = 'x'.repeat(deliveryLimit / 2);
  }
  return outbox;
}

function checkMeasuredText(text) {
  assert.doesNotMatch(text, /reconnect|retry|connection|saving remains available|no save failure|review saved rounds|data-pressure-rounds/i);
  assert.doesNotMatch(text.replace("This notice doesn't remove anything.", ''), /remove|delete|clear/i);
}

test('measured notice sections distinguish storage size, delivery and host review', () => {
  const { describeStoragePressure } = loadLiveEngine();
  for (const scenario of noticeCases) {
    const store = trappedStore(scenario.total ? [sizedEntry(mainKey, totalLimit)] : []);
    const before = store.snapshot();
    const measured = pressure(store.storage, caseOutbox(scenario), { mainKey, backupKey });
    const unmatchedCount = (scenario.reviews || []).filter(row => row.matchId !== 'design-round').length;
    const notice = describeStoragePressure(measured, unmatchedCount);
    assert.equal(notice.hidden, !scenario.ids.length, scenario.name);
    assert.deepEqual(Array.from(notice.sections, section => section.id).filter(id => id !== 'preservation'), scenario.ids, scenario.name);
    const text = [notice.heading, ...Array.from(notice.sections, section => section.text)].join(' ');
    checkMeasuredText(text);
    if (scenario.total) assert.match(text, /No recovery backup is currently stored.*size estimates, not remaining device space/);
    if (scenario.delivery && !scenario.total) assert.match(notice.heading, /Local score delivery and review data is large/);
    if (scenario.total && scenario.delivery) assert.equal(notice.heading, 'Device storage is large');
    if (unmatchedCount) assert.match(text, /1 preserved score has no matching round/);
    assert.equal(store.counts.writes, 0);
    assert.equal(store.snapshot(), before);
  }
});

test('Chromium notice is read-only and save paths each refresh with one key pass', { timeout: 60000 }, async () => {
  assert.ok(chrome, 'Chromium is required for storage notice checks');
  const server = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const fixture = visualFixture();
    const page = await openVisualPage(browser, `http://127.0.0.1:${server.address().port}/`, 'match', 375, false, false, false, fixture);
    const scenarios = noticeCases.filter(scenario => scenario.name !== 'delivery zero counts');
    const result = await page.evaluate(({ scenarios, queues, mainKey, backupKey, outboxKey, totalLimit, statePayload }) => {
      const prototype = Storage.prototype;
      const methods = Object.fromEntries(['setItem', 'removeItem', 'clear', 'key'].map(name => [name, prototype[name]]));
      const api = window.DyeLedgerPreservedReview;
      const measure = api.pressure;
      const notice = document.getElementById('preservedScorePressure');
      const snapshot = () => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
      function reset(scenario, outbox) {
        localStorage.clear();
        localStorage.setItem(mainKey, statePayload);
        localStorage.setItem(backupKey, statePayload);
        localStorage.setItem(outboxKey, JSON.stringify(outbox));
        if (scenario.total) localStorage.setItem('synthetic-size', 'x'.repeat(totalLimit / 2));
      }
      function readOnlyRender(failMeasurement) {
        let writes = 0;
        const before = snapshot();
        for (const name of ['setItem', 'removeItem', 'clear']) prototype[name] = () => { writes++; throw Error('Unexpected storage write'); };
        if (failMeasurement) api.pressure = () => { throw Error('Synthetic measurement failure'); };
        try {
          if (!failMeasurement) api.pressure(localStorage, readSharedScoreOutbox(), { mainKey, backupKey });
          renderPreservedScorePressure();
          return { writes, unchanged: before === snapshot(), hidden: notice.hidden, text: notice.textContent,
            buttons: Array.from(notice.querySelectorAll('button'), button => button.dataset.preservedReview),
            paragraphs: notice.querySelectorAll('p').length };
        } finally {
          Object.assign(prototype, methods);
          api.pressure = measure;
        }
      }
      const states = scenarios.map((scenario, index) => {
        reset(scenario, queues[index]);
        return readOnlyRender(false);
      });
      const failure = readOnlyRender(true);
      const scans = [
        () => renderPreservedScorePressure(),
        () => persist({ skipRender: true }),
        () => writeSharedScoreOutbox(readSharedScoreOutbox()).ok,
      ].map(invoke => {
        reset(scenarios.at(-2), queues.at(-2));
        const indices = [];
        let refreshes = 0;
        prototype.key = function (index) { if (this === localStorage) indices.push(index); return methods.key.call(this, index); };
        api.pressure = (...args) => { refreshes++; return measure(...args); };
        try { return { ok: invoke() !== false, indices, keys: localStorage.length, refreshes }; }
        finally { prototype.key = methods.key; api.pressure = measure; }
      });
      return { adapterMode: DYE_LEDGER_ADAPTER_MODE, states, failure, scans };
    }, { scenarios, queues: scenarios.map(caseOutbox), mainKey, backupKey, outboxKey, totalLimit, statePayload: JSON.stringify(fixture.state) });

    assert.equal(result.adapterMode, false);
    for (const [index, actual] of result.states.entries()) {
      const scenario = scenarios[index];
      assert.equal(actual.writes, 0, scenario.name);
      assert.equal(actual.unchanged, true, scenario.name);
      assert.equal(actual.hidden, !scenario.ids.length, scenario.name);
      assert.doesNotMatch(actual.text, /Storage usage could not be measured/);
      checkMeasuredText(actual.text);
      assert.equal(actual.text.includes('waiting to send'), scenario.ids.includes('pending'), scenario.name);
      assert.equal(actual.text.includes('awaiting host review'), scenario.ids.includes('review'), scenario.name);
      assert.equal(actual.text.includes('1 preserved score has no matching round'), scenario.ids.includes('unmatched'), scenario.name);
      assert.deepEqual(actual.buttons, scenario.reviews?.some(row => row.matchId === 'design-round') ? ['design-round'] : []);
    }
    assert.deepEqual(result.failure, { writes: 0, unchanged: true, hidden: false,
      text: 'Storage usage could not be measured. Saving remains available; use Support diagnostics if a save fails.',
      buttons: [], paragraphs: 0 });
    for (const scan of result.scans) {
      assert.equal(scan.ok, true);
      assert.equal(scan.refreshes, 1);
      assert.deepEqual(scan.indices, Array.from({ length: scan.keys }, (_, index) => index));
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
