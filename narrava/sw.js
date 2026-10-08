// sw.js — minimal service worker.
//
// Three jobs: (1) satisfy Chrome/Android's real installability
// requirement (a registered service worker with a real fetch handler —
// without this, beforeinstallprompt never fires at all); (2) a real
// cache-first app shell so the interface itself still loads offline or
// on a flaky connection — including the two CDN libraries the page can't
// start without (supabase-js, hls.js), so the app opens with no
// connection at all (see offline.js); and (3) downloads: every request
// under offline/ is answered from the downloads cache (DOWNLOADS_CACHE,
// written by js/downloads.js) and NEVER from the network. Every other
// cross-origin request (Supabase, Bunny, Paystack…) is left alone.
//
// Updates: bump CACHE_NAME on every release. Activation deletes old
// shell caches only — DOWNLOADS_CACHE is never deleted here, so
// downloads survive app updates.

const CACHE_NAME = 'narrava-shell-v37';
const DOWNLOADS_CACHE = 'narrava-offline-v1'; // same name in js/downloads.js

// Cross-origin files the app can't start without, cached like the shell.
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
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

// offline/… inside this worker's scope (e.g. /narrava/offline/<episode>/…).
const OFFLINE_PREFIX = new URL('offline/', self.registration.scope).pathname;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Downloads: the downloads cache or a 404 — never the network.
  if (url.origin === self.location.origin && url.pathname.startsWith(OFFLINE_PREFIX)) {
    event.respondWith(
      caches.open(DOWNLOADS_CACHE)
        .then((cache) => cache.match(req, { ignoreSearch: true }))
        .then((hit) => hit || new Response('Not downloaded', { status: 404, headers: { 'Content-Type': 'text/plain' } }))
    );
    return;
  }

  // Everything else cross-origin passes straight through, except the
  // CDN libraries above (cache first, like the shell).
  const isCdnFile = CDN_URLS.includes(req.url);
  if (url.origin !== self.location.origin && !isCdnFile) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((shell) => shell.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) shell.put(req, res.clone());
        return res;
      }).catch(() =>
        // Offline and never fetched with this exact ?v=: the shell's own
        // copy (precached at install, same release) — and for a page
        // load, index.html.
        shell.match(req, { ignoreSearch: true }).then((fallback) =>
          fallback || (req.mode === 'navigate' ? shell.match('./index.html') : Response.error())
        )
      );
    }))
  );
});
