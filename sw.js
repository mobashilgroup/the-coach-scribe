const CACHE_NAME = 'coach-scribe-v2';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './tokens.js',
  './app.js',
  './assetsstyles.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
