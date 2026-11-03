/**
 * The graph-notes frontend/scripts/sw-template.js this repo proposes for when graph
 * notes adopts site-shell; the harness serves it as the graph app's /graph/sw.js.
 *
 * Two changes from today's template:
 * 1. Navigations go to the network first, so a composed page from a new
 *    site-shell release reaches the installed app on its next online launch.
 *    Offline, on a network error, after NAV_TIMEOUT_MS, or when the answer is
 *    not a same-origin 200 HTML page (an expired Access session answers a 302
 *    to the Access login), the cached /graph/ is served, as today.
 * 2. site-shell's /_site/<build>/ files are cached on first use, cache-first:
 *    they are immutable, so a cached copy is never stale. Both spellings are
 *    covered: /graph/_site/ (forwarded by this app's Worker) and /_site/ (once
 *    the zone route is attached).
 */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const APP_CACHE = `graph-app-${VERSION}`;
const SHELL_CACHE = 'graph-site-shell';
const NAV_TIMEOUT_MS = 3000;
const NETWORK_ONLY = [/^\/graph\/api\//, /^\/graph\/signin\/?$/, /^\/graph\/sw\.js$/];
const SHELL_FILE = /^(?:\/graph)?\/_site\/[0-9a-f]{12}\//;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('graph-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (SHELL_FILE.test(url.pathname)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
    return;
  }
  if (!url.pathname.startsWith('/graph') || NETWORK_ONLY.some((re) => re.test(url.pathname))) return;

  if (req.mode === 'navigate') {
    // Every page of this app is the one viewer page; ?g= picks the graph client-side.
    event.respondWith(networkFirstPage(req));
    return;
  }
  event.respondWith(
    caches.match(req, { cacheName: APP_CACHE, ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirstPage(req) {
  const cached = () => caches.match('/graph/', { cacheName: APP_CACHE, ignoreSearch: true });
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS)),
    ]);
    const html = (res.headers.get('content-type') || '').startsWith('text/html');
    if (res.status === 200 && res.type === 'basic' && !res.redirected && html) {
      const cache = await caches.open(APP_CACHE);
      await cache.put('/graph/', res.clone());
      return res;
    }
    return (await cached()) || res;
  } catch {
    return (await cached()) || Response.error();
  }
}
