const CACHE_NAME = 'the-dye-ledger-v25.4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json?v=25.3',
  './apple-touch-icon.png',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './icons/icon-192-v4.png',
  './icons/icon-512-v4.png',
  './icons/apple-touch-icon-v4.png',
  './icons/logo-mark.svg',
  './icons/players.svg',
  './icons/courses.svg',
  './icons/setup.svg',
  './icons/scoring.svg',
  './icons/leaderboard.svg',
  './icons/settings.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))),
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
