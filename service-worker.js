const BUILD_INFO = {
  version: 'v30.3.75',
  versionNumber: '30.3.75',
  cacheName: 'the-dye-ledger-v30.3.75',
  buildDate: '2026-07-22T00:00:00Z'
};
const CACHE_NAME = BUILD_INFO.cacheName;
const ASSETS = [
  './',
  './index.html',
  './style.css?v=30.3.75&rev=1',
  './app.js?v=30.3.75&rev=1',
  './identity-security.js?v=30.3.75&rev=1',
  './supabase-config.js?v=30.3.75&rev=1',
  './manifest.json?v=30.3.75&rev=1',
  './branding/apple-touch-icon.png',
  './branding/favicon-32.png?v=30.3.75&rev=1',
  './branding/favicon-16.png?v=30.3.75&rev=1',
  './branding/app-icon-192.png?v=30.3.75&rev=1',
  './branding/app-icon-512.png?v=30.3.75&rev=1',
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
