/*
 * Service worker : met en cache tous les fichiers de l'application pour
 * qu'elle fonctionne sans connexion.
 * Stratégie « réseau d'abord » : avec du wifi, l'iPad récupère toujours la
 * dernière version publiée ; sans wifi, il utilise la copie en cache.
 */
const CACHE = 'caisse-josephine-v2';
const FICHIERS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/calc.js', 'js/db.js', 'js/sync.js', 'js/pdf.js', 'js/visuels.js', 'js/config.js',
  'lib/jspdf.umd.min.js',
  'img/logo-small.png', 'img/logo-pdf.png', 'img/icon-180.png', 'img/icon-192.png', 'img/icon-512.png',
  'img/icon-maskable-512.png', 'img/favicon-32.png', 'img/icon-167.png', 'img/icon-152.png',
];
const DELAI_RESEAU = 3500; // ms avant d'utiliser le cache si le wifi est lent

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'activer') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // ex. envoi vers Google : jamais en cache
  if (url.pathname.includes('/suivi/') || url.pathname.includes('/tests/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const reseau = fetch(req, { cache: 'no-cache' }).then(r => {
      if (r && r.ok && r.type === 'basic') cache.put(req, r.clone());
      return r;
    });
    const enCache = await cache.match(req, { ignoreSearch: true }) ||
      (req.mode === 'navigate' ? await cache.match('index.html') : null);
    if (!enCache) return reseau.catch(() => Response.error());
    const delai = new Promise(r => setTimeout(() => r(null), DELAI_RESEAU));
    try {
      const r = await Promise.race([reseau, delai]);
      if (r && r.ok) return r;
    } catch (err) { /* hors connexion */ }
    reseau.catch(() => {});
    return enCache;
  })());
});
