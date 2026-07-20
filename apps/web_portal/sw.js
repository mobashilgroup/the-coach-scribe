/* The Coach Scribe — service worker.
 * Caches the app shell so the console loads offline (e.g. airplane mode). API
 * calls (/v1/*) and non-GET requests always go to the network and are never
 * cached — only the static shell is precached. */

const CACHE = "tcs-shell-v1";
const SHELL = [
  "./index.html",
  "./app.js",
  "./recorder.js",
  "./styles.css",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never intercept the API or non-GET requests.
  if (event.request.method !== "GET" || url.pathname.startsWith("/v1/") || url.pathname === "/health") return;
  // App shell: cache-first with a network fallback that refreshes the cache.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
