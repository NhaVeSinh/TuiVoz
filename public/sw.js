/** Service worker — cache-first for versioned statics only; never caches /api/*. */

const CACHE = 'tv-static-v4';
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

// voz XenForo push payload: {title,body,dir,icon,badge,total_unread,url}.
self.addEventListener('push', (e) => {
  if (!(self.Notification && self.Notification.permission === 'granted')) return;
  let data;
  try {
  data = e.data.json();
  } catch {
  return;
  }
  if (!data || !data.title || !data.body) return;

  const options = { body: data.body, dir: data.dir || 'ltr', data };
  if (data.badge) options.badge = data.badge;
  if (data.icon) options.icon = data.icon;

  if ('setAppBadge' in self.navigator && 'clearAppBadge' in self.navigator) {
  const count = parseInt(String(data.total_unread).replace(/[,. ]/g, ''), 10);
  if (count) self.navigator.setAppBadge(count);
  else self.navigator.clearAppBadge();
  }

  e.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (e) => {
  const notification = e.notification;
  notification.close();
  const raw = notification.data && notification.data.url;
  if (!raw) return;

  // Open the matching TuiVoz route, not voz.vn itself.
  let url = raw;
  try {
  const u = new URL(raw, location.origin);
  if (u.host === 'voz.vn') url = location.origin + u.pathname + u.search + u.hash;
  } catch {
  /* keep raw */
  }

  e.waitUntil(
  clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((wins) => {
      for (const win of wins) {
        if (win.url === url && 'navigate' in win) {
          return win.navigate(url).then((c) => (c ? c.focus() : clients.openWindow(url)));
        }
      }
      return clients.openWindow(url);
    })
  );
});
