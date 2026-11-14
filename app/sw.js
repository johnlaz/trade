// Trade Arena service worker: app shell offline, never caches prices, Firebase, or Groq.
const CACHE = 'trade-arena-v1.3.1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const LIBS = ['www.gstatic.com', 'cdnjs.cloudflare.com'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const same = u.origin === location.origin, lib = LIBS.includes(u.hostname);
  if (!same && !lib) return;                       // prices, Firebase and Groq go straight to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (lib && hit) return hit;                    // versioned CDN files never change
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
      if (res && res.ok && (same || res.type === 'cors' || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) { if (hit) return hit; throw err; }
  })());
});
