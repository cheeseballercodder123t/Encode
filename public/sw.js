/**
 * The app-shell service worker (defect 45).
 *
 * Two things needed it:
 *
 *  1. Installability. Chromium will not consider the app installable - and so
 *     never fires `beforeinstallprompt`, the one event
 *     `components/PWAInstallHeader.tsx` waits for - unless a service worker with
 *     a `fetch` handler is registered alongside the manifest.
 *  2. A cold offline load. The studio generates its workouts from text, files and
 *     YouTube URLs and hands the results to RemNote, Anki and the clipboard, so it
 *     is exactly the kind of app someone returns to on a train. Before this, going
 *     offline and reloading gave the browser's own error page even though the
 *     shell itself needs nothing from the network.
 *
 * Strategy: **network first, cache as fallback**. Online, every request is still
 * answered by the network, so nothing this worker does can serve a stale page or
 * a stale AI response. The cache exists purely for the moment the network is gone.
 *
 * Deliberately narrow: only same-origin GETs are touched. Every streamed
 * generation (`POST /api/...`) and every provider call passes straight through
 * untouched, which is the whole reason this stays safe.
 */

const CACHE = 'deepencode-shell-v1';

/** Fetched during install so the first offline navigation has something to show. */
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

/** Next's dev-only endpoints (HMR socket, error overlay frames). Never cached. */
const NEVER_CACHE = ['/_next/webpack-hmr', '/__nextjs'];

function isCacheable(url) {
  return !NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `addAll` rejects the whole install if any single entry fails, so each
      // path is added on its own: one 404 must not cost us the shell.
      .then((cache) => Promise.all(SHELL.map((path) => cache.add(path).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // A generation is a POST; it must never be replayed from a cache.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Anything off-origin - AI providers, Firestore, Google Drive - is none of our
  // business and is left exactly as the page asked for it.
  if (url.origin !== self.location.origin) return;
  if (!isCacheable(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only successful, complete same-origin responses are worth keeping.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // A navigation that was never cached still deserves the shell rather
        // than the browser's offline page.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        throw new Error('offline and not cached');
      }),
  );
});
