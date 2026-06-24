const BUILD_INFO = {
  version: 'v30.3.22',
  versionNumber: '30.3.22',
  cacheName: 'the-dye-ledger-v30.3.22',
  buildDate: '2026-06-24T03:45:00Z'
};
const CACHE_NAME = BUILD_INFO.cacheName;
const ASSETS = [
  './',
  './index.html',
  './style.css?v=30.3.22',
  './app.js?v=30.3.22',
  './supabase-config.js?v=30.3.22',
  './manifest.json?v=30.3.22',
  './apple-touch-icon.png',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './icon-192-v4.png',
  './icon-512-v4.png',
  './apple-touch-icon.png',
  './logo-mark.svg',
  './players.svg',
  './courses.svg',
  './setup.svg',
  './scoring.svg',
  './leaderboard.svg',
  './settings.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
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

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
