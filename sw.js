// ═══════════════════════════════════════════════════════════════════
//  Le service worker de la caisse : qu'elle S'OUVRE sans réseau.
//  Les données hors ligne, c'est Firestore (base.js) ; ici, seulement les
//  fichiers de la page et les photos des produits.
//   · la page (index.html) : le réseau d'abord, la copie gardée sinon —
//     une nouvelle version arrive dès qu'il y a du réseau ;
//   · le reste (caisse.js?v=…, polices, icônes, photos) : la copie gardée
//     d'abord. Le ?v= change à chaque version : une nouvelle adresse, donc
//     jamais une vieille copie servie à la place d'une neuve.
//  Firebase (googleapis.com) ne passe pas par ici.
// ═══════════════════════════════════════════════════════════════════
const CACHE = 'caisse-de-stand';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const page = u.origin === location.origin && (u.pathname.endsWith('/') || u.pathname.endsWith('.html'));
  const fichier = u.origin === location.origin && !page;
  const photo = u.origin === 'https://petit-gateau.com' && u.pathname.startsWith('/img/');
  if (!page && !fichier && !photo) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (page) {
      try {
        const frais = await fetch(r);
        if (frais.ok) cache.put(r, frais.clone());
        return frais;
      } catch { return (await cache.match(r)) || (await cache.match('./')) || Response.error(); }
    }
    const garde = await cache.match(r);
    if (garde) return garde;
    const frais = await fetch(r);
    if (frais.ok || frais.type === 'opaque') {
      // Une nouvelle version du code : l'ancienne n'a plus rien à faire ici.
      if (u.searchParams.has('v')) {
        for (const k of await cache.keys()) {
          const ku = new URL(k.url);
          if (ku.pathname === u.pathname && ku.search !== u.search) cache.delete(k);
        }
      }
      cache.put(r, frais.clone());
    }
    return frais;
  })());
});
