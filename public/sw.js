/**
 * Service Worker — Grade and Elevation Calculator  v2
 *
 * Strategy:
 *  - Shell (index.html) → Network-first with offline fallback
 *  - Static assets      → Cache-first with background revalidation
 *
 * Bump CACHE_NAME whenever you want to force a fresh install.
 */

const CACHE_NAME = 'elev-calc-v2';

// Keep the precache list small — only the files needed for a cold-start
// offline load.  Large assets (rod.png, chunks) are cached lazily on first
// network hit via the stale-while-revalidate handler below.
const PRECACHE = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails atomically — if any resource 404s the SW won't install.
      // Wrap in try/catch so a missing icon never blocks installation.
      cache.addAll(PRECACHE).catch((err) => {
        console.warn('[SW] precache partial failure (non-fatal):', err);
      })
    )
  );
  // Activate immediately — don't wait for old clients to close.
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
  // Take control of all open clients immediately.
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests from our own origin.
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;

  // Navigation requests (HTML pages) → network-first, fallback to shell.
  // This ensures users always get the latest app on reload, with a graceful
  // offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache the fresh shell so we can serve it offline next time.
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else → cache-first, revalidate in background (stale-while-revalidate).
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached); // network failed → fall back to cached copy

        // Return cached immediately; update in background.
        return cached || networkFetch;
      })
    )
  );
});
