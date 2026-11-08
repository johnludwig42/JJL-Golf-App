import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { currentVersionBare, currentVersionPrefixed } from './release-identity.js';

// Runs the actual worker, with synthetic HTTP bodies and memory-only Cache API
// objects. This is not browser, Safari, network, persistence or upgrade evidence.
export function createServiceWorkerHarness({ scopePath = '/' } = {}) {
  const scope = new URL(scopePath, 'http://127.0.0.1:5000/');
  const workerUrl = new URL(`service-worker.js?v=${currentVersionBare}`, scope);
  const source = readFileSync(new URL('../../service-worker.js', import.meta.url), 'utf8');
  const cacheName = `the-dye-ledger-${currentVersionPrefixed}`;
  const appBody = '<!doctype html><title>APP FIXTURE</title><main>SCORING</main>';
  const ledgerBody = '<!doctype html><title>LEDGER FIXTURE</title><main>REPORT</main>';
  const listeners = new Map();
  const stores = new Map();
  const responses = new Map();
  const fetches = [];
  const writes = [];
  const calls = { claim: 0, skipWaiting: 0 };
  let online = true;
  const absolute = input => new URL(typeof input === 'string' ? input : input.url, workerUrl).href;
  const documentUrl = relative => new URL(relative, scope).href;
  const responseFrom = body => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  responses.set(scope.href, responseFrom(appBody));
  responses.set(documentUrl('index.html'), responseFrom(appBody));
  responses.set(documentUrl('ledger-report/shell.html'), responseFrom(ledgerBody));

  async function fakeFetch(input) {
    const key = absolute(input);
    fetches.push(key);
    if (!online) throw new TypeError('Synthetic offline fetch');
    if (responses.has(key)) return responses.get(key).clone();
    const clean = new URL(key);
    clean.search = '';
    clean.hash = '';
    if (responses.has(clean.href)) return responses.get(clean.href).clone();
    return new Response(`SYNTHETIC RESPONSE ${key}`, { headers: { 'Content-Type': 'text/plain' } });
  }

  function openStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async put(input, response) {
        if (!(response instanceof Response)) throw new TypeError('Cache.put requires a Response');
        const key = absolute(input);
        // Materializing bytes exercises body consumption: the caller must clone
        // a response if it also intends to return that response to its client.
        const bytes = await response.arrayBuffer();
        entries.set(key, { bytes, status: response.status, headers: [...response.headers] });
        writes.push({ cache: name, url: key });
      },
      async match(input) {
        const entry = entries.get(absolute(input));
        return entry ? new Response(entry.bytes.slice(0), { status: entry.status, headers: entry.headers }) : undefined;
      },
      async delete(input) { return entries.delete(absolute(input)); },
      async addAll(inputs) {
        const fetched = await Promise.all(inputs.map(async input => {
          const response = await fakeFetch(input);
          if (!response.ok) throw new TypeError('Synthetic precache HTTP failure');
          return [input, response];
        }));
        for (const [input, response] of fetched) await this.put(input, response);
      },
    };
  }
  const caches = {
    async open(name) { return openStore(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(input) {
      for (const name of stores.keys()) {
        const response = await openStore(name).match(input);
        if (response) return response;
      }
      return undefined;
    },
  };
  const self = {
    location: workerUrl,
    registration: { scope: scope.href },
    clients: { async claim() { calls.claim += 1; } },
    skipWaiting() { calls.skipWaiting += 1; return Promise.resolve(); },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
  };
  vm.runInNewContext(source, { self, caches, fetch: fakeFetch, URL, Request, Response, console }, { filename: 'service-worker.js' });

  async function lifecycle(type, data) {
    const pending = [];
    const event = { data, waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
    for (const listener of listeners.get(type) || []) listener(event);
    await Promise.all(pending);
  }
  async function dispatch(input, { mode = 'navigate', method = 'GET' } = {}) {
    const request = new Request(absolute(input), { method });
    // Node cannot construct a Request with the browser-only "navigate" mode.
    // Only that event attribute is overridden; URL/method remain real Request fields.
    Object.defineProperty(request, 'mode', { value: mode });
    let intercepted = false;
    let responsePromise;
    const pending = [];
    const event = {
      request,
      waitUntil(promise) { pending.push(Promise.resolve(promise)); },
      respondWith(promise) {
        if (intercepted) throw new Error('respondWith called twice');
        intercepted = true;
        responsePromise = Promise.resolve(promise);
      },
    };
    for (const listener of listeners.get('fetch') || []) listener(event);
    let response;
    let responseError;
    if (intercepted) {
      try {
        response = await responsePromise;
        if (!(response instanceof Response)) throw new TypeError('respondWith did not resolve to a Response');
      } catch (error) { responseError = error; }
    }
    await Promise.all(pending);
    return { intercepted, response, responseError };
  }
  return {
    scope, workerUrl, cacheName, caches, appBody, ledgerBody, calls, writes, fetches,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    setOnline(value) { online = value; },
    setResponse(input, response) { responses.set(absolute(input), response); },
    url: documentUrl,
    install: () => lifecycle('install'),
    activate: () => lifecycle('activate'),
    message: data => lifecycle('message', data),
    dispatch,
  };
}
