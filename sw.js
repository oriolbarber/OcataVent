// Mar del Masnou: guarda l'app per obrir-la sense connexió. Les dades meteo sempre van a la xarxa.
const CACHE = "ocatavent2-v153";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./app.css?v=188", "./native.js?v=114", "./clubs.js?v=1", "./boats.js?v=2", "./app.js?v=147", "./cfg.js?v=6", "./ajuda.js?v=3", "./trip.js?v=132", "./share.js?v=1", "./maps.js?v=106", "./llocs.js?v=8", "./fx.js?v=1", "./windmap.js?v=111", "./prep.js?v=105", "./cloud.js?v=124", "./amics.js?v=116", "./club.js?v=147", "./admin.js?v=115", "./avisos.js?v=208", "./planol-core.js?v=6", "./sos.js?v=2",
  "./icons/logo.svg?v=3", "./icons/icon-192.png?v=3", "./icons/icon-512.png?v=3", "./icons/apple-touch-icon.png?v=3"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache:"reload"})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("ocatavent2-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // API, estacions i mapes: directe a la xarxa
  // Xarxa primer, sense la memòria cau HTTP del navegador (així les actualitzacions arriben senceres); si no hi ha connexió, la còpia desada
  e.respondWith(
    fetch(e.request.url, {cache:"no-cache", credentials:"same-origin"})
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match(e.request, {ignoreSearch:true})).then(r => r || caches.match("./index.html")))
  );
});
