// Minimal offline-friendly service worker: cache-first for static assets,
// network-first for everything else (so inventory data and API calls
// always try the network first and only fall back to cache if offline).
const CACHE_NAME = "inventorysync-v1";
const PRECACHE_URLS = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Only ever handle this app's own same-origin requests. Leaving
  // cross-origin requests (Google Sheets API, the UPC lookup proxy,
  // Google's own sign-in/picker scripts, etc.) to the network directly is
  // deliberate: this handler's catch-all fallback below serves the
  // cached "/" app shell on any failure, and a cross-origin API call that
  // fails would otherwise come back as a 200 OK containing our own HTML
  // instead of a real error — silently corrupting the caller's response
  // instead of surfacing (or cleanly failing) the real problem.
  if (url.origin !== self.location.origin) return;

  // Never cache API routes or the payment-success flow — those must
  // always reflect live server state.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/payment-success")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
