import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceWorkerHarness } from './support/service-worker-harness.js';

const isNetworkError = result => result.intercepted
  && result.responseError === undefined
  && result.response?.type === 'error'
  && result.response.status === 0;

test('network-error guard rejects arbitrary coding TypeErrors', () => {
  assert.equal(isNetworkError({ intercepted: true, responseError: new TypeError('coding bug') }), false);
  assert.equal(isNetworkError({ intercepted: true, response: Response.error() }), true);
});

// Each defect is an independent test: one failure never hides later subcases.
// Fixture bodies are intentionally tiny. Rendering/round preservation need the
// separately approved real-browser and physical-phone verification stages.
for (const scopePath of ['/', '/JJL-Golf-App/']) {
  const prefix = `[${scopePath}]`;
  async function installed() {
    const harness = createServiceWorkerHarness({ scopePath });
    await harness.install();
    return harness;
  }
  async function cachedApp(harness) {
    const cache = await harness.caches.open(harness.cacheName);
    return (await cache.match(harness.url('index.html')))?.text();
  }
  async function onlineLedger(harness) {
    const result = await harness.dispatch(harness.url('ledger-report/shell.html?v=fixture&reportKey=synthetic'));
    assert.equal(result.responseError, undefined, 'fixture navigation must not fail');
    assert.equal(await result.response.text(), harness.ledgerBody, 'fixture Ledger body must be delivered');
  }

  test(`${prefix} HARNESS exact query keys, relative URLs, body cloning and offline stub`, async () => {
    const h = await installed();
    const cache = await h.caches.open(h.cacheName);
    assert.equal(await (await cache.match('./index.html')).text(), h.appBody);
    assert.equal(await cache.match(h.url('index.html?unmatched=1')), undefined);
    assert.equal(await (await cache.match('./index.html')).text(), h.appBody, 'cache reads must return independent bodies');
    h.setOnline(false);
    const missing = await h.dispatch(h.url('not-cached.js'), { mode: 'same-origin' });
    assert.equal(missing.responseError?.message, 'Synthetic offline fetch');
    assert.equal(h.calls.skipWaiting, 0);
  });

  test(`${prefix} H1 online Ledger cannot replace the app cache`, async () => {
    const h = await installed();
    await onlineLedger(h);
    assert.equal(await cachedApp(h), h.appBody, 'Ledger HTML must never occupy index.html');
  });

  test(`${prefix} H2 offline Ledger with query returns the precached Ledger shell`, async () => {
    const h = await installed();
    h.setOnline(false);
    const result = await h.dispatch(h.url('ledger-report/shell.html?v=fixture&reportKey=synthetic'));
    assert.equal(result.responseError, undefined);
    assert.equal(await result.response.text(), h.ledgerBody);
  });

  test(`${prefix} R2 changed online Ledger content leaves the precached release shell intact`, async () => {
    const h = await installed();
    h.setResponse(h.url('ledger-report/shell.html'), new Response('DIFFERENT ONLINE LEDGER'));
    const result = await h.dispatch(h.url('ledger-report/shell.html?reportKey=synthetic'));
    assert.equal(await result.response.text(), 'DIFFERENT ONLINE LEDGER');
    const cache = await h.caches.open(h.cacheName);
    assert.equal(await (await cache.match(h.url('ledger-report/shell.html'))).text(), h.ledgerBody);
    assert.equal(await cachedApp(h), h.appBody);
  });

  test(`${prefix} R2 main-app HTTP 500 is returned without overwriting its cached shell`, async () => {
    const h = await installed();
    h.setResponse(h.url(''), new Response('SERVER ERROR', { status: 500 }));
    const result = await h.dispatch(h.url(''));
    assert.equal(result.response.status, 500);
    assert.equal(await result.response.text(), 'SERVER ERROR');
    assert.equal(await cachedApp(h), h.appBody);
  });

  for (const appPath of ['', 'index.html', '?refresh=1', 'index.html#x']) {
    test(`${prefix} H3 offline app ${appPath || '(root)'} after an online Ledger`, async () => {
      const h = await installed();
      await onlineLedger(h);
      // No online return to the app: it could heal the very defect under test.
      h.setOnline(false);
      const result = await h.dispatch(h.url(appPath));
      assert.equal(result.responseError, undefined);
      assert.equal(await result.response.text(), h.appBody);
    });
  }

  for (const otherPath of ['staging-sign-in.html', 'staging-sign-in', 'staging-sign-in?x=1']) {
    test(`${prefix} H4 online ${otherPath} bypasses worker navigation handling`, async () => {
      const h = await installed();
      const result = await h.dispatch(h.url(otherPath));
      const observed = { intercepted: result.intercepted, cachedApp: await cachedApp(h) };
      assert.deepEqual(observed, { intercepted: false, cachedApp: h.appBody });
    });
  }

  for (const otherPath of ['reports/ledger-entry-flamtana.html', 'staging-sign-in', 'nope.html']) {
    test(`${prefix} H5 offline ${otherPath} does not receive the app fallback`, async () => {
      const h = await installed();
      h.setOnline(false);
      const result = await h.dispatch(h.url(otherPath));
      assert.equal(result.intercepted, false, 'unsupported navigation belongs to the browser, never the app fallback');
    });
  }

  test(`${prefix} H6 offline Ledger without its cached shell fails as a network error`, async () => {
    const h = await installed();
    const cache = await h.caches.open(h.cacheName);
    await cache.delete(h.url('ledger-report/shell.html'));
    h.setOnline(false);
    const result = await h.dispatch(h.url('ledger-report/shell.html?reportKey=synthetic'));
    assert.equal(isNetworkError(result), true, 'must not substitute main-app HTML for the missing report');
  });

  test(`${prefix} H7 foreign-origin navigation bypasses navigation handling (synthetic event guard)`, async () => {
    const h = await installed();
    const result = await h.dispatch('https://foreign.invalid/index.html');
    assert.equal(result.intercepted, false);
  });

  if (scopePath !== '/') {
    test(`${prefix} H7 outside-scope path bypasses navigation handling (synthetic event guard)`, async () => {
      const h = await installed();
      const result = await h.dispatch(new URL('/other/index.html', h.scope).href);
      assert.equal(result.intercepted, false);
    });
  }

  test(`${prefix} H8 online app navigation refreshes its own cached entry`, async () => {
    const h = await installed();
    const updated = '<!doctype html><title>UPDATED APP FIXTURE</title>';
    h.setResponse(h.url(''), new Response(updated));
    const result = await h.dispatch(h.url(''));
    assert.equal(await result.response.text(), updated);
    assert.equal(await cachedApp(h), updated);
  });

  test(`${prefix} H9 missing app entries produce a browser-equivalent network error`, async () => {
    const h = await installed();
    const cache = await h.caches.open(h.cacheName);
    await cache.delete(h.url('index.html'));
    await cache.delete(h.url(''));
    h.setOnline(false);
    assert.equal(isNetworkError(await h.dispatch(h.url(''))), true);
  });

  test(`${prefix} H10 activation removes synthetic older Dye cache and preserves unrelated caches`, async () => {
    const h = await installed();
    const oldName = 'the-dye-ledger-v0.0.0-fixture';
    await (await h.caches.open(oldName)).put(h.url('index.html'), new Response(h.ledgerBody));
    await (await h.caches.open('other-cache')).put(h.url('keep.txt'), new Response('KEEP'));
    await h.activate();
    assert.deepEqual(await h.caches.keys(), [h.cacheName, 'other-cache']);
    assert.equal(await cachedApp(h), h.appBody);
    assert.equal(await (await (await h.caches.open('other-cache')).match(h.url('keep.txt'))).text(), 'KEEP');
    assert.equal(h.calls.claim, 1);
  });

  test(`${prefix} H11 static GET stays cache-first online and offline`, async () => {
    const h = await installed();
    const url = h.url('fixture-static.js');
    h.setResponse(url, new Response('FIRST'));
    const first = await h.dispatch(url, { mode: 'same-origin' });
    assert.equal(await first.response.text(), 'FIRST');
    h.setResponse(url, new Response('SECOND'));
    const fetchesBefore = h.fetches.length;
    assert.equal(await (await h.dispatch(url, { mode: 'same-origin' })).response.text(), 'FIRST');
    h.setOnline(false);
    assert.equal(await (await h.dispatch(url, { mode: 'same-origin' })).response.text(), 'FIRST');
    assert.equal(h.fetches.length, fetchesBefore);
  });

  test(`${prefix} H11 non-GET is ignored and SKIP_WAITING remains explicit`, async () => {
    const h = await installed();
    assert.equal(h.calls.skipWaiting, 0, 'install must not skip waiting');
    assert.equal((await h.dispatch(h.url('index.html'), { method: 'POST' })).intercepted, false);
    await h.message({ type: 'UNRELATED' });
    assert.equal(h.calls.skipWaiting, 0);
    await h.message({ type: 'SKIP_WAITING' });
    assert.equal(h.calls.skipWaiting, 1);
  });
}
