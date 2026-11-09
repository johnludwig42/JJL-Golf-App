const BUILD_INFO = {
  version: 'v31.0.87',
  versionNumber: '31.0.87',
  cacheName: 'the-dye-ledger-v31.0.87',
  buildDate: '2026-11-09T11:28:55.359Z'
};
const CACHE_NAME = BUILD_INFO.cacheName;
const SCOPE_URL = new URL('./', self.location.href);
const APP_SHELL_URL = new URL('./index.html', SCOPE_URL).href;
const APP_ROOT_URL = SCOPE_URL.href;
const LEDGER_SHELL_URL = new URL('./ledger-report/shell.html', SCOPE_URL).href;
const ASSETS = [
  './',
  './index.html',
  './app-components.css?v=31.0.87',
  './app-print.css?v=31.0.87',
  './app-presentation.js?v=31.0.87',
  './style.css?v=31.0.87&rev=202611091128',
  './preserved-score-review.js?v=31.0.87',
  './app.js?v=31.0.87&rev=202611091128',
  './identity-security.js?v=31.0.87&rev=202611091128',
  './supabase-config.js?v=31.0.87&rev=202611091128',
  './manifest.json?v=31.0.87&rev=202611091128',
  './branding/apple-touch-icon-v31.0.87.png',
  './branding/favicon-32-v31.0.87.png',
  './branding/favicon-16-v31.0.87.png',
  './branding/app-icon-192-v31.0.87.png',
  './branding/app-icon-512-v31.0.87.png',
  './ledger-report/shell.html',
  './ledger-report/bootstrap.js?v=31.0.87',
  './ledger-report/pack.js?v=31.0.87',
  './ledger-report/engines.js?v=31.0.87',
  './ledger-report/stroke-play.js?v=31.0.87',
  './ledger-report/logic.js?v=31.0.87',
  './ledger-report/report.js?v=31.0.87',
  './ledger-report/flamtana-evidence.js?v=31.0.87',
  './ledger-report/fonts/archivo-latin-500-normal.woff2',
  './ledger-report/fonts/archivo-latin-600-normal.woff2',
  './ledger-report/fonts/archivo-latin-700-normal.woff2',
  './ledger-report/fonts/inter-latin-400-normal.woff2',
  './ledger-report/fonts/inter-latin-500-normal.woff2',
  './ledger-report/fonts/inter-latin-600-normal.woff2',
  './ledger-report/fonts/ibm-plex-mono-latin-400-normal.woff2',
  './ledger-report/fonts/ibm-plex-mono-latin-500-normal.woff2',
  './ledger-report/fonts/ibm-plex-mono-latin-600-normal.woff2',
  './players.svg',
  './courses.svg',
  './setup.svg?v=31.0.87',
  './scoring.svg?v=31.0.87',
  './leaderboard.svg?v=31.0.87',
  './settings.svg?v=31.0.87',
  './library.svg?v=31.0.87',
  './insights.svg?v=31.0.87'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('the-dye-ledger-') && k !== CACHE_NAME).map(k => caches.delete(k)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function classifyNavigation(requestUrl) {
  const url = new URL(requestUrl);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_URL.pathname)) return 'other';
  const relativePath = url.pathname.slice(SCOPE_URL.pathname.length);
  if (relativePath === '' || relativePath === 'index.html') return 'app';
  if (relativePath === 'ledger-report/shell.html') return 'ledger';
  return 'other';
}

async function networkFirstNavigation(request) {
  const navigation = classifyNavigation(request.url);
  try {
    const response = await fetch(request);
    if (navigation === 'app' && response && response.ok) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(APP_SHELL_URL, response.clone());
      } catch {}
    }
    return response;
  } catch {
    if (navigation === 'ledger') {
      return (await caches.match(LEDGER_SHELL_URL)) || Response.error();
    }
    return (await caches.match(APP_SHELL_URL)) || (await caches.match(APP_ROOT_URL)) || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && new URL(request.url).origin === self.location.origin) {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch {}
  }
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    if (classifyNavigation(event.request.url) === 'other') return;
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  event.respondWith(cacheFirstStatic(event.request));
});
