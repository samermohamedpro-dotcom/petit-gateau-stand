// ═══════════════════════════════════════════════════════════════════
//  Le service worker de la caisse : qu'elle S'OUVRE sans réseau.
//  Les données hors ligne, c'est Firestore (base.js) ; ici, seulement les
//  fichiers de la page et les photos des produits.
//   · à l'installation, il garde TOUS les fichiers de la page de sa version
//     (audit de solidité du 26/11/2026, point 4). Avant, il ne gardait que ce
//     qui passait par lui APRÈS son installation : mesuré, une première ouverture
//     ne laissait rien, et la caisse rouverte sans réseau montrait une page
//     d'erreur. Or sur iPhone et iPad, l'app posée sur l'écran d'accueil a sa
//     propre mémoire : son premier lancement EST une première ouverture.
//   · la page (index.html) : le réseau d'abord, mais 3 s au plus, puis la
//     copie gardée. Avant, elle attendait le réseau sans limite : sur un réseau
//     saturé (des barres, rien ne revient), rien ne s'affichait après 15 s ;
//   · le reste (caisse.js?v=…, polices, icônes, photos) : la copie gardée
//     d'abord. Le ?v= change à chaque version : une nouvelle adresse, donc
//     jamais une vieille copie servie à la place d'une neuve ;
//   · version.txt ne passe pas par ici : la caisse y lit si une version neuve
//     est en ligne (point 5), et une copie gardée lui mentirait.
//  202611261450 est remplacé par construire.mjs : chaque version a donc un
//  service worker différent, que le navigateur installe — avec ses fichiers.
//  Firebase (googleapis.com) ne passe pas par ici.
// ═══════════════════════════════════════════════════════════════════
const CACHE = 'caisse-de-stand';
const VERSION = '202611261450';
const FICHIERS = [
  './', `caisse.js?v=${VERSION}`, `caisse.css?v=${VERSION}`, 'manifest.webmanifest',
  'polices/figtree-latin-400-normal.woff2', 'polices/figtree-latin-700-normal.woff2',
  'polices/figtree-latin-900-normal.woff2', 'polices/fraunces-latin-700-normal.woff2',
  'icone-stand-180.png', 'icone-stand-192.png', 'icone-stand-512.png',
];
const ATTENTE_PAGE_MS = 3000;

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  // Un fichier qui manque ne doit pas empêcher l'installation : on garde ce qui répond.
  await Promise.all(FICHIERS.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => {})));
  await self.skipWaiting();
})()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin && u.pathname.endsWith('/version.txt')) return;
  const page = u.origin === location.origin && (u.pathname.endsWith('/') || u.pathname.endsWith('.html'));
  const fichier = u.origin === location.origin && !page;
  const photo = u.origin === 'https://petit-gateau.com' && u.pathname.startsWith('/img/');
  if (!page && !fichier && !photo) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (page) {
      const garde = async () => (await cache.match(r, { ignoreSearch: true })) || (await cache.match('./'));
      const reseau = fetch(r).then((frais) => {
        if (frais.ok) cache.put('./', frais.clone());
        return frais;
      });
      // Le réseau a 3 s ; passé ce délai, la copie gardée s'il y en a une, sinon on attend le réseau.
      const delai = new Promise((ok) => setTimeout(ok, ATTENTE_PAGE_MS)).then(garde);
      try {
        const premier = await Promise.race([reseau.catch(() => null), delai]);
        if (premier) return premier;
        return await reseau;
      } catch { return (await garde()) || Response.error(); }
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
