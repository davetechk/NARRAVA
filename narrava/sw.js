// Service worker: installability, cache-first app shell, downloads cache.
// Bump CACHE_NAME on every release. DOWNLOADS_CACHE is never deleted.

const CACHE_NAME = 'narrava-shell-v44';
const DOWNLOADS_CACHE = 'narrava-offline-v1'; // same name in js/downloads.js

// CDN files the app can't start without
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js'
];

const PRECACHE_URLS = [
  './',
  './index.html',
  './privacy.html',
  './manifest.json',
  './css/styles.css',
  './img/icon-192.png',
  './img/icon-512.png',
  './js/protect.js',
  './js/layout-guard.js',
  './js/config.js',
  './js/supabase-client.js',
  './js/shared-utils.js',
  './js/video-player.js',
  './js/offline.js',
  './js/downloads.js',
  './js/watch-progress.js',
  './js/social.js',
  './js/comments-panel.js',
  './js/feed-data.js',
  './js/coins.js',
  './js/ads.js',
  './js/app.js',
  './js/discover.js',
  './js/library.js',
  './js/history.js',
  './js/help.js',
  './js/membership.js',
  './js/watch.js',
  './js/auth.js',
  './js/profile.js',
  './js/pwa-install.js',
  './js/nav.js',
  ...CDN_URLS
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
        names
          .filter((name) => name !== CACHE_NAME && name !== DOWNLOADS_CACHE)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

const OFFLINE_PREFIX = new URL('offline/', self.registration.scope).pathname;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Downloads: from the downloads cache or 404, never the network
  if (url.origin === self.location.origin && url.pathname.startsWith(OFFLINE_PREFIX)) {
    event.respondWith(
      caches.open(DOWNLOADS_CACHE)
        .then((cache) => cache.match(req, { ignoreSearch: true }))
        .then((hit) => hit || new Response('Not downloaded', { status: 404, headers: { 'Content-Type': 'text/plain' } }))
    );
    return;
  }

  // Other cross-origin requests pass through, except the CDN files
  const isCdnFile = CDN_URLS.includes(req.url);
  if (url.origin !== self.location.origin && !isCdnFile) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((shell) => shell.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) shell.put(req, res.clone());
        return res;
      }).catch(() =>
        // Offline fallback: shell copy ignoring ?v=, or index.html for a page load
        shell.match(req, { ignoreSearch: true }).then((fallback) =>
          fallback || (req.mode === 'navigate' ? shell.match('./index.html') : Response.error())
        )
      );
    }))
  );
});
