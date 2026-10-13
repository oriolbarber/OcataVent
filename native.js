"use strict";
/* ============ Ocata Vent 2 · pont amb l'app Android (Capacitor) ============
   L'APK (android-app/) carrega aquesta mateixa web publicada i hi afegeix:
   · GPS en segon pla amb servei en primer pla (BackgroundGeolocation): la gravació continua amb la pantalla apagada.
   · Enllaç d'accés per correu: el correu s'obre al navegador, i la web el reenvia a l'app (ocatavent://login?link=…).
   Al navegador, window.OV_NATIVE no existeix i tot funciona com sempre. */
(() => {
const CAP = window.Capacitor;
const native = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
const LINK_HOST = "ocatavent://login?link=";

/* ---------- al navegador: un enllaç d'accés demanat des de l'app es torna a obrir a l'app ---------- */
if(!native){
  const q = new URLSearchParams(location.search);
  if(q.get("app") === "1" && q.get("oobCode") && q.get("mode") === "signIn"){
    const target = LINK_HOST + encodeURIComponent(location.href);
    const intent = "intent://login?link=" + encodeURIComponent(location.href) + "#Intent;scheme=ocatavent;package=cat.ocatavent.app;end";
    window.OV_APP_LINK = true;   // cloud.js no ha de fer servir aquest enllaç al navegador
    document.addEventListener("DOMContentLoaded", () => {
      const box = document.createElement("div");
      box.className = "native-handoff";
      box.innerHTML = `<div class="card"><h2>Entra a l'app</h2><p>Aquest enllaç és per entrar a l'app Ocata Vent del mòbil.</p>
        <a class="cta" href="${intent}">Obre l'app Ocata Vent</a>
        <p class="note">Si no s'obre, comprova que tens l'app instal·lada en aquest mòbil i torna a demanar l'enllaç des de l'app.</p></div>`;
      document.body.appendChild(box);
    });
    setTimeout(() => { location.href = /Android/i.test(navigator.userAgent) ? intent : target; }, 300);
  }
  return;
}

document.documentElement.classList.add("native");
const P = name => CAP.registerPlugin ? CAP.registerPlugin(name) : CAP.Plugins[name];
const BG = P("BackgroundGeolocation"), App = P("App");

/* ---------- enllaç d'accés rebut per l'app ---------- */
function openLink(url){
  if(!url || !url.startsWith("ocatavent://login")) return;
  const link = new URLSearchParams(url.split("?")[1] || "").get("link");
  if(!link) return;
  try{ const u = new URL(link); if(u.origin === location.origin) location.href = u.href; }catch(e){}
}
try{
  App.addListener("appUrlOpen", e => openLink(e.url));
  App.getLaunchUrl().then(r => r && openLink(r.url)).catch(() => {});
}catch(e){}

/* ---------- GPS en segon pla per a la gravació de sortides ---------- */
let watcher = null;
window.OV_NATIVE = {
  platform: "android",
  // Mateixa interfície que navigator.geolocation.watchPosition: onPos({coords, timestamp})
  async watch(onPos, onErr){
    await this.clear();
    watcher = await BG.addWatcher({
      backgroundTitle: "Ocata Vent està gravant la sortida",
      backgroundMessage: "Toca per tornar a l'app. Atura la sortida a l'app per acabar.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 0
    }, (loc, err) => {
      if(err){ if(err.code === "NOT_AUTHORIZED"){ onErr && onErr({code:1, message:"Sense permís d'ubicació"}); if(confirm("L'app necessita el permís d'ubicació per gravar la sortida. Vols obrir els ajustaments?")) BG.openSettings(); } else onErr && onErr({code:2, message:err.message}); return; }
      if(!loc) return;
      onPos({timestamp: loc.time || Date.now(), coords: {latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy,
        speed: loc.speed == null ? null : loc.speed, heading: loc.bearing == null ? null : loc.bearing, altitude: loc.altitude}});
    });
    return watcher;
  },
  async clear(){ if(watcher){ const id = watcher; watcher = null; try{ await BG.removeWatcher({id}); }catch(e){} } },
  openSettings(){ try{ BG.openSettings(); }catch(e){} },
  // Petició GET nativa (CapacitorHttp, inclòs a Capacitor): sense CORS ni les restriccions de la WebView.
  // Retorna un objecte semblant a Response: {ok, status, text(), json()}.
  async http(url){
    const H = CAP.Plugins.CapacitorHttp || P("CapacitorHttp");
    const r = await H.request({url, method:"GET", responseType:"text", connectTimeout:15000, readTimeout:15000,
      headers:{"Cache-Control":"no-cache"}});
    const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    return {ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => body, json: async () => JSON.parse(body)};
  }
};
})();
