// sw.js — minimal service worker.
//
// Two real jobs: (1) satisfy Chrome/Android's real installability
// requirement (a registered service worker with a real fetch handler —
// without this, beforeinstallprompt never fires at all), and (2) a real
// cache-first app shell so the interface itself still loads offline or
// on a flaky connection. Supabase/CDN requests are left alone entirely —
// this never touches cross-origin requests, only this app's own files.

const CACHE_NAME = 'narrava-shell-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './img/icon-192.png',
  './img/icon-512.png',
  './js/config.js',
  './js/supabase-client.js',
  './js/shared-utils.js',
  './js/video-player.js',
  './js/watch-progress.js',
  './js/social.js',
  './js/comments-panel.js',
  './js/feed-data.js',
  './js/app.js',
  './js/discover.js',
  './js/library.js',
  './js/watch.js',
  './js/auth.js',
  './js/profile.js',
  './js/pwa-install.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only ever handle this app's own same-origin GET requests — every
  // Supabase/CDN call (a different origin) passes straight through
  // untouched, exactly as if this file didn't exist.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
