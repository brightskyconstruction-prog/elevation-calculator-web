/**
 * Service Worker — Grade and Elevation Calculator
 *
 * Strategy:
 *  - Shell (index.html) → Network-first with offline fallback
 *  - Static assets      → Cache-first (versioned via CACHE_NAME)
 */

const CACHE_NAME = 'elev-calc-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/rod.png',
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  // Activate immediately — no need to wait for existing clients to close
  self.skipWaiting();
});

// ── Activate: remove stale caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for navigation, cache-first for assets ───────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET') return;
  try {
    const url = new URL(request.url);
    if (url.origin !== location.origin) return;
  } catch { return; }

  // Navigation (HTML pages) → network-first, fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else → cache-first, revalidate in background
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});
