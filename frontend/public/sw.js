// VELORA service worker (registered by src/components/providers/ServiceWorker.tsx). Two jobs:
//  1. Speed: the site's design, script and font files (/_next/static, renamed on every release so they never go stale)
//     and the app icons are kept on the device after the first visit, so the app opens without downloading them again.
//  2. Offline: with no internet, a VELORA "you're offline" page instead of the browser's error.
// Pages, prices, stock, the bag, checkout, sign-in and the API always come fresh from the network.
const VERSION = 'v1';
const OFFLINE_CACHE = `velora-offline-${VERSION}`;
const STATIC_CACHE = `velora-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const MAX_STATIC_ENTRIES = 300; // old releases' files are dropped once this many are kept

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = [OFFLINE_CACHE, STATIC_CACHE];
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('velora-') && !keep.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Full page loads: always from the network (fresh prices and stock); the offline page only when there is no connection.
  // Navigation preload is deliberately not used: with it, Firefox skipped this handler and showed its own error page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // product photos, Stripe etc.: untouched
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(fromDeviceFirst(event, request));
  }
  // everything else (the API, page data, other files) goes straight to the network
});

async function fromDeviceFirst(event, request) {
  const saved = await caches.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    event.waitUntil(
      caches.open(STATIC_CACHE).then(async (cache) => {
        await cache.put(request, copy);
        const keys = await cache.keys();
        for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i++) await cache.delete(keys[i]);
      }),
    );
  }
  return response;
}
