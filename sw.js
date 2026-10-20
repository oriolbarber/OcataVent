// Mar del Masnou: guarda l'app per obrir-la sense connexió. Les dades meteo sempre van a la xarxa.
const CACHE = "ocatavent2-v122";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./app.css?v=172", "./native.js?v=114", "./clubs.js?v=1", "./boats.js?v=2", "./app.js?v=136", "./cfg.js?v=5", "./ajuda.js?v=1", "./trip.js?v=123", "./maps.js?v=105", "./llocs.js?v=7", "./fx.js?v=1", "./windmap.js?v=110", "./prep.js?v=103", "./cloud.js?v=123", "./amics.js?v=115", "./club.js?v=144", "./admin.js?v=114", "./avisos.js?v=208", "./planol-core.js?v=6", "./sos.js?v=2",
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
