/* =====================================================================
   LEANX SHOWROOM — SERVICE WORKER
   Keeps the booth alive when the venue wifi is not. The portal shell,
   fonts and preview frames are served from cache if the network drops,
   so the showroom, the project stages and the captured screens keep
   working. (Live client sites still need the network, of course.)

   Strategy
     shell (HTML/CSS/JS)  network first, cache as backup  -> edits appear
                                                             on the next reload
     assets (images/fonts) cache first, refreshed in the background
     anything cross-origin passed straight through, never touched
   ===================================================================== */

const VERSION = 'leanx-showroom-v1';
const CORE = [
  './', './index.html', './css/portal.css',
  './js/app.js', './js/projects.js', './js/qrcode.js',
  './assets/brand/x-3d.png', './assets/brand/wordmark.png',
  './assets/fonts/outfit-latin.woff2', './assets/fonts/outfit-latin-ext.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled(CORE.map(u => cache.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isAsset = url => /\.(jpg|jpeg|png|webp|svg|woff2?|ico)$/i.test(url.pathname);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // live client sites: untouched
  if (url.pathname.startsWith('/__leanx/')) return;         // local proxy status: never cached

  if (isAsset(url)) {
    // Cache first, then refresh quietly in the background.
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
    return;
  }

  // Shell: network first so a redeploy shows immediately, cache as the safety net.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req) || await cache.match('./index.html');
      return hit || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
