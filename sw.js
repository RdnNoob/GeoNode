const CACHE_VERSION = 'geolocate-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/login.html',
  '/register.html',
  '/js/app.js',
  '/js/peta.js',
  '/js/enkripsi.js',
  '/js/auth.js',
  '/css/',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache strategy: network-first for API, cache-first for statics
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Bypass cache for API calls and POST requests
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Listen for skip waiting message (from update banner)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (e) => {
  let data = { title: 'GeoLocate', body: 'Kamu punya pesan baru!', url: '/app.html' };

  if (e.data) {
    try {
      const parsed = e.data.json();
      if (parsed && parsed.title) {
        data = parsed;
      }
    } catch (err) {
      try {
        const text = e.data.text();
        if (text) data.body = text;
      } catch (e2) {}
    }
  }

  const options = {
    body: data.body || 'Kamu punya pesan baru!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.tag || 'geolocate-notif',
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || '/app.html',
      fromId: data.fromId || null,
      fromNama: data.fromNama || null,
      groupId: data.groupId || null,
      groupNama: data.groupNama || null
    },
    actions: [
      { action: 'open', title: 'Buka' },
      { action: 'close', title: 'Tutup' }
    ]
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'GeoLocate', options)
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  if (e.action === 'close') return;

  const notifData = e.notification.data || {};
  const urlToOpen = notifData.url || '/app.html';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/app.html') && 'focus' in client) {
          if (notifData.fromId) {
            client.postMessage({
              type: 'open_chat',
              fromId: notifData.fromId,
              fromNama: notifData.fromNama || ''
            });
          }
          if (notifData.groupId) {
            client.postMessage({
              type: 'open_group_chat',
              groupId: notifData.groupId,
              groupNama: notifData.groupNama || ''
            });
          }
          return client.focus();
        }
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
