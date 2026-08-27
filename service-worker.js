const BUILD_INFO = {
  version: 'v31.0.08',
  versionNumber: '31.0.08',
  cacheName: 'the-dye-ledger-v31.0.08',
  buildDate: '2026-08-27T12:00:00-04:00'
};
const CACHE_NAME = BUILD_INFO.cacheName;
const ASSETS = [
  './',
  './index.html',
  './style.css?v=31.0.08',
  './app.js?v=31.0.08',
  './identity-security.js?v=31.0.08',
  './supabase-config.js?v=31.0.08',
  './manifest.json?v=31.0.08',
  './branding/apple-touch-icon-v31.0.08.png',
  './branding/favicon-32-v31.0.08.png',
  './branding/favicon-16-v31.0.08.png',
  './branding/app-icon-192-v31.0.08.png',
  './branding/app-icon-512-v31.0.08.png',
  './ledger-report/shell.html',
  './ledger-report/bootstrap.js?v=31.0.08',
  './ledger-report/pack.js?v=31.0.08',
  './ledger-report/engines.js?v=31.0.08',
  './ledger-report/report.js?v=31.0.08',
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
