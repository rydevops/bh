/* Bullet Heroes service worker.
 * - Pre-caches the whole game so it runs offline.
 * - A new release changes BUILD (and so this file's bytes) -> the browser installs the new worker,
 *   which fills a new cache, takes over immediately, and deletes older caches.
 * Stamped by tools/stamp.mjs - BUILD and PRECACHE are generated; do not edit by hand. */
const BUILD = 'e6b55e7518d2';
const CACHE = 'bullet-heroes-' + BUILD;
const PRECACHE = [
  './css/style.css',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './index.html',
  './js/audio/engine.js',
  './js/audio/index.js',
  './js/audio/music.js',
  './js/data/enemies.js',
  './js/data/heroes.js',
  './js/data/missions.js',
  './js/data/research.js',
  './js/data/stages.js',
  './js/data/upgrades.js',
  './js/economy.js',
  './js/main.js',
  './js/progression.js',
  './js/render/backgrounds.js',
  './js/render/renderer.js',
  './js/render/sprites.js',
  './js/render/titleScene.js',
  './js/save.js',
  './js/sim/bosses.js',
  './js/sim/damage.js',
  './js/sim/game.js',
  './js/store.js',
  './js/ui/app.js',
  './js/ui/combat.js',
  './js/ui/dom.js',
  './js/ui/heroes.js',
  './js/ui/home.js',
  './js/ui/icons.js',
  './js/ui/meta.js',
  './js/ui/results.js',
  './js/ui/settings.js',
  './js/ui/squad.js',
  './js/ui/stages.js',
  './js/update.js',
  './js/util.js',
  './js/version.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // `cache: 'reload'` bypasses the HTTP cache so a new release never pre-caches stale files.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bullet-heroes-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // The update probe and the worker script must always hit the network.
  if (path.endsWith('/version.json') || path.endsWith('/sw.js')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  // Navigations: serve the cached shell (works offline), fall back to network.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { cacheName: CACHE }).then((hit) => hit || fetch(req))
    );
    return;
  }
  // Everything else: cache-first from the versioned cache, then network (and remember it).
  event.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      });
    })
  );
});
