/** Service worker — cache-first for versioned statics only; never caches /api/*. */

const CACHE = 'tv-static-v1';
const CACHEABLE = /\/assets\/(css|icons|lib|ui|views|fonts)\//;

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Same-origin static assets only; APIs and cross-origin pass through.
  if (e.request.method !== 'GET' || url.origin !== location.origin || !CACHEABLE.test(url.pathname)) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
    )
  );
});
