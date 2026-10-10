const BUILD_INFO = {
  version: 'v31.0.55',
  versionNumber: '31.0.55',
  cacheName: 'the-dye-ledger-v31.0.55',
  buildDate: '2026-10-09T23:26:44.097Z'
};
const CACHE_NAME = BUILD_INFO.cacheName;
const ASSETS = [
  './',
  './index.html',
  './app-print.css?v=31.0.55',
  './app-presentation.js?v=31.0.55',
  './style.css?v=31.0.55&rev=202610092326',
  './app.js?v=31.0.55&rev=202610092326',
  './identity-security.js?v=31.0.55&rev=202610092326',
  './supabase-config.js?v=31.0.55&rev=202610092326',
  './manifest.json?v=31.0.55&rev=202610092326',
  './branding/apple-touch-icon-v31.0.55.png',
  './branding/favicon-32-v31.0.55.png',
  './branding/favicon-16-v31.0.55.png',
  './branding/app-icon-192-v31.0.55.png',
  './branding/app-icon-512-v31.0.55.png',
  './ledger-report/shell.html',
  './ledger-report/bootstrap.js?v=31.0.55',
  './ledger-report/pack.js?v=31.0.55',
  './ledger-report/engines.js?v=31.0.55',
  './ledger-report/stroke-play.js?v=31.0.55',
  './ledger-report/logic.js?v=31.0.55',
  './ledger-report/report.js?v=31.0.55',
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
  './setup.svg',
  './scoring.svg',
  './leaderboard.svg',
  './settings.svg'
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

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put('./index.html', response.clone());
      } catch {}
    }
    return response;
  } catch {
    return (await caches.match('./index.html')) || caches.match('./');
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
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  event.respondWith(cacheFirstStatic(event.request));
});
