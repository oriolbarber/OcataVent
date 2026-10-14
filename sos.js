"use strict";
/* ============ Ocata Vent 2 · Ajuda en curs (avís de seguretat amb algú que hi va) ============
   · Navegant: quan envia un avís al club (avisos.js → OV_CLUB.raiseAlert), aquest mòdul escolta el document
     alertes/{id} en directe (onSnapshot). Quan algú prem «Vaig a ajudar», surt «MISSATGE REBUT per NOM» i s'obre el mapa.
     Mentre l'avís és actiu, el mòbil del navegant hi actualitza la seva posició (cada 20 s si algú hi va; si no, cada minut).
   · Qui ajuda: prem «Vaig a ajudar» al Club; s'afegeix a alertes/{id}.ajudants.{uid} = {nom, lat, lon, at} i hi envia
     la seva posició cada 20 s mentre ajuda. Veu el navegant i els altres que hi van.
   · El mapa es minimitza i es torna a obrir amb el triangle d'emergència que surt sobre el logo (i a la pantalla de navegació).
   · S'acaba quan el navegant anul·la l'avís o acaba la sortida, quan algú el marca com a resolt, o quan qui ajuda ho deixa.
   La sessió es desa a ov2_sos per continuar si es recarrega l'app. */
(() => {
const KEY = "ov2_sos";
let S = null;               // {id, role:"navegant"|"ajudant", seen:[uids]}
let unsub = null, doc = null, map = null, lay = null, fitted = false, geoT = null, posT = null, myPos = null, lastPush = 0;
const ctx = () => window.OV_CLUB?.ctx?.() || null;
const live = () => (typeof LIVE !== "undefined" ? LIVE : null);
const uid = () => ctx()?.user?.uid;
const save = () => { try{ S ? localStorage.setItem(KEY, JSON.stringify(S)) : localStorage.removeItem(KEY); }catch(e){} };
const nowMs = () => Date.now();
const agoTxt = t => { const m = Math.round((nowMs() - t) / 60000); return m < 1 ? "ara mateix" : m === 1 ? "fa 1 min" : `fa ${m} min`; };
const CAP = ["al nord", "al nord-est", "a l'est", "al sud-est", "al sud", "al sud-oest", "a l'oest", "al nord-oest"];
const cap = d => CAP[Math.round(((d % 360) + 360) % 360 / 45) % 8];
const distTxt = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / NM).toFixed(1).replace(".", ",")} nm`;
const tms = v => v ? (v.toMillis ? v.toMillis() : +v) : 0;
const TRI = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5L23 21.5H1z" fill="#c3162a" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 9v6M12 18v.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';

function alarm(){
  try{ navigator.vibrate?.([300, 150, 300, 150, 600]); }catch(e){}
  try{ const A = new (window.AudioContext || window.webkitAudioContext)(), o = A.createOscillator(), g = A.createGain();
    o.frequency.value = 660; o.connect(g); g.connect(A.destination);
    [0, .3, .6].forEach(t => { g.gain.setValueAtTime(0.25, A.currentTime + t); g.gain.setValueAtTime(0, A.currentTime + t + .18); });
    o.start(); o.stop(A.currentTime + 1); }catch(e){}
}

/* ---------- triangle d'emergència (sobre el logo i a la pantalla de navegació) ---------- */
function triButtons(){
  const top = document.querySelector("header.top"), img = top && top.querySelector("img");
  if(top && img && !$("sosBtn")){
    const b = document.createElement("button");
    b.type = "button"; b.id = "sosBtn"; b.className = "sos-btn"; b.hidden = true; b.setAttribute("aria-label", "Obre el mapa de l'ajuda en curs"); b.innerHTML = TRI;
    top.appendChild(b);
  }
  const rt = document.querySelector("#ride .ride-top");
  if(rt && !$("sosBtn2")){
    const b = document.createElement("button");
    b.type = "button"; b.id = "sosBtn2"; b.className = "sos-btn in-ride"; b.hidden = true; b.setAttribute("aria-label", "Obre el mapa de l'ajuda en curs"); b.innerHTML = TRI;
    rt.prepend(b);
  }
  const b = $("sosBtn");
  if(b && img){ b.style.left = img.offsetLeft + "px"; b.style.top = img.offsetTop + "px"; b.style.width = img.offsetWidth + "px"; b.style.height = img.offsetHeight + "px"; }
}
function showTri(on){ triButtons(); ["sosBtn", "sosBtn2"].forEach(i => { const b = $(i); if(b) b.hidden = !on; }); }

/* ---------- finestra del mapa ---------- */
function panel(){
  let p = $("sosMap"); if(p) return p;
  p = document.createElement("div"); p.id = "sosMap"; p.className = "sos"; p.hidden = true;
  p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Ajuda en curs");
  p.innerHTML = `<div class="sos-h"><span class="sos-tri">${TRI}</span><div class="sos-t"><b id="sosTitle">Ajuda en curs</b><span id="sosInfo"></span></div>
      <button type="button" class="btn" id="sosMin">Minimitza</button></div>
    <div class="sos-msg" id="sosMsg" hidden></div>
    <div class="sos-mapel" id="sosMapEl"></div>
    <div class="sos-f" id="sosFoot"></div>`;
  document.body.appendChild(p);
  return p;
}
function open(){
  if(!S) return;
  const p = panel(); p.hidden = false; showTri(true);
  if(!map && typeof baseMap === "function"){ map = baseMap($("sosMapEl"), true); if(map){ lay = L.layerGroup().addTo(map); fitted = false; } }
  setTimeout(() => { map?.invalidateSize(); draw(); }, 50);
  foot();
}
function minimize(){ const p = $("sosMap"); if(p) p.hidden = true; }
function foot(){
  const f = $("sosFoot"); if(!f || !S) return;
  f.innerHTML = S.role === "navegant"
    ? `<p class="note">Si ja estàs bé, anul·la l'avís: tothom ho veurà.</p><div id="sosEnd"></div>`
    : `<p class="note">Si no pots anar-hi, deixa-ho: el navegant ho veurà.</p><div id="sosEnd"></div>`;
  if(typeof slideConfirm === "function") slideConfirm($("sosEnd"), S.role === "navegant" ? "Llisca: estic bé, anul·la l'avís" : "Llisca per deixar d'ajudar", S.role === "navegant" ? cancelOwn : leave);
}
function msg(t){ const m = $("sosMsg"); if(!m) return; m.innerHTML = t || ""; m.hidden = !t; }

// Posicions: navegant = alerta (lat, lon, posAt); ajudants = alerta.ajudants; jo (ajudant) = myPos
function points(){
  if(!doc) return [];
  const P = [{k:"nav", nom:doc.nom, lat:doc.lat, lon:doc.lon, t:tms(doc.posAt), me: S.role === "navegant"}];
  for(const [u, h] of Object.entries(doc.ajudants || {})){
    const mine = u === uid();
    const lat = mine && myPos ? myPos.lat : h.lat, lon = mine && myPos ? myPos.lon : h.lon;
    P.push({k:u, nom:h.nom, lat, lon, t: mine && myPos ? myPos.t : tms(h.at), me: mine});
  }
  if(S.role === "ajudant" && myPos && !(doc.ajudants || {})[uid()]) P.push({k:uid(), nom:"Tu", lat:myPos.lat, lon:myPos.lon, t:myPos.t, me:true});
  const Lv = live(); if(S.role === "navegant" && Lv && Lv.pts.length){ const l = Lv.pts[Lv.pts.length - 1]; P[0].lat = l.lat; P[0].lon = l.lon; P[0].t = l.t || nowMs(); }
  return P.filter(x => typeof x.lat === "number" && typeof x.lon === "number");
}
function draw(){
  if(!S || !doc) return;
  const P = points(), nav = P.find(x => x.k === "nav"), helpers = P.filter(x => x.k !== "nav");
  // text de capçalera
  const t = $("sosTitle"), inf = $("sosInfo");
  if(t) t.textContent = S.role === "navegant" ? (helpers.length ? "Venen a ajudar-te" : "Avís enviat al club") : `Vas a ajudar ${doc.nom}`;
  if(inf){
    if(S.role === "navegant") inf.textContent = helpers.length ? helpers.map(h => `${h.nom}: a ${distTxt(hav(h, nav || h))}`).join(" · ") : "Encara no hi va ningú. Si cal: VHF canal 16 o 112.";
    else { const me = helpers.find(h => h.me);
      inf.textContent = nav ? (me ? `És a ${distTxt(hav(me, nav))}, cap ${cap(bearing(me, nav))} · posició ${agoTxt(nav.t)}` : `Posició ${agoTxt(nav.t)} · buscant la teva ubicació…`) : "Sense posició del navegant"; }
  }
  if(!map || !lay) return;
  lay.clearLayers();
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#c3162a";
  for(const x of P){
    const c = x.k === "nav" ? css("--no") : css("--accent");
    L.circleMarker([x.lat, x.lon], {radius: x.k === "nav" ? 11 : 9, color:"#fff", weight:3, fillColor:c, fillOpacity:1}).addTo(lay)
      .bindTooltip(x.me ? "Tu" : x.nom, {permanent:true, direction:"top", offset:[0, -10], className:"sos-tip"});
  }
  if(nav) helpers.forEach(h => L.polyline([[h.lat, h.lon], [nav.lat, nav.lon]], {color:css("--accent"), weight:2, dashArray:"6 6"}).addTo(lay));
  if(!fitted && P.length){ if(P.length === 1) map.setView([P[0].lat, P[0].lon], 15); else map.fitBounds(P.map(x => [x.lat, x.lon]), {padding:[40, 40], maxZoom:16}); fitted = true; }
}

/* ---------- escolta del document de l'avís ---------- */
function listen(){
  const C = ctx(); if(!C || !S) return;
  unsub && unsub();
  unsub = C.F.onSnapshot(C.F.doc(C.db, "alertes", S.id), snap => {
    if(!S) return;
    if(!snap.exists() || snap.data().resolta){
      if(S.role === "ajudant") toast(snap.exists() ? `L'avís de ${doc?.nom || ""} s'ha marcat com a resolt.` : `${doc?.nom || "El navegant"} ha anul·lat l'avís: està bé.`);
      end(); return;
    }
    doc = snap.data();
    if(S.role === "navegant"){
      const seen = new Set(S.seen || []), fresh = Object.entries(doc.ajudants || {}).filter(([u]) => !seen.has(u));
      if(fresh.length){
        fresh.forEach(([u]) => seen.add(u)); S.seen = [...seen]; save();
        fitted = false; open();
        msg(`<b>MISSATGE REBUT</b> per ${fresh.map(([, h]) => esc(h.nom)).join(", ")}<br><span>Ve a ajudar-te. Al mapa veus on és.</span>`);
        alarm();
      }
      schedulePos();
    }
    draw();
  }, () => {});
}

/* ---------- posicions ---------- */
function schedulePos(){   // navegant: puja la posició a l'avís
  clearTimeout(posT);
  if(!S || S.role !== "navegant") return;
  const busy = Object.keys(doc?.ajudants || {}).length > 0, every = busy ? 20000 : 60000;
  posT = setTimeout(async () => {
    const C = ctx(), Lv = live(); if(!C || !S || !Lv || !Lv.pts.length) return schedulePos();
    const l = Lv.pts[Lv.pts.length - 1];
    if(l.t && l.t > lastPush){ lastPush = l.t; C.F.updateDoc(C.F.doc(C.db, "alertes", S.id), {lat:l.lat, lon:l.lon, posAt:nowMs()}).catch(() => {}); }
    schedulePos();
  }, every);
}
function getPos(){
  if(window.OV_GEO?.getPosition) return window.OV_GEO.getPosition({high:true, maxAge:10000});
  return new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, {enableHighAccuracy:true, maximumAge:10000, timeout:20000}) : rej(new Error("geo")));
}
async function pushMine(){   // qui ajuda: puja la seva posició
  const C = ctx(); if(!C || !S || S.role !== "ajudant") return;
  try{
    const p = await getPos(), c = p.coords || p;
    myPos = {lat:c.latitude, lon:c.longitude, t:nowMs()}; draw();
    await C.F.updateDoc(C.F.doc(C.db, "alertes", S.id), {["ajudants." + C.user.uid]: {nom:C.member.nom, lat:myPos.lat, lon:myPos.lon, at:C.F.serverTimestamp()}});
  }catch(e){ const i = $("sosInfo"); if(i && !myPos) i.textContent = "No es pot llegir la teva ubicació: activa el GPS."; }
}
function startGeo(){ clearInterval(geoT); pushMine(); geoT = setInterval(() => { if(document.visibilityState === "visible") pushMine(); }, 20000); }

/* ---------- accions ---------- */
function help(a){
  if(!window.OV_CLUB?.sheet) return;
  OV_CLUB.sheet("Vaig a ajudar", `<p>${esc(a.nom)} ha avisat el club. Si hi vas, li arribarà <b>«Missatge rebut per ${esc(ctx()?.member?.nom || "")}»</b> i tots dos veureu on és l'altre al mapa.</p>
    <p class="note">La teva posició només es comparteix amb qui veu aquest avís, mentre ajudes. Si és greu: VHF canal 16 o 112.</p>
    <button type="button" class="btn cl-pri cl-wide" id="sosGo">Hi vaig</button>`, d => {
    d.querySelector("#sosGo").onclick = async () => {
      window.OV_CLUB.closeSheet();
      if(S && S.id !== a.id) await leave(true);
      S = {id:a.id, role:"ajudant"}; doc = a; save(); fitted = false;
      listen(); startGeo(); open();
    };
  });
}
async function leave(silent){
  const C = ctx(), id = S?.id;
  if(C && id && S.role === "ajudant") await C.F.updateDoc(C.F.doc(C.db, "alertes", id), {["ajudants." + C.user.uid]: C.F.deleteField()}).catch(() => {});
  end(); if(!silent) window.OV_CLUB?.loadAlerts?.();
}
function cancelOwn(){   // el navegant anul·la l'avís des del mapa
  if(!S || S.role !== "navegant") return;
  const id = S.id, C = ctx();
  window.OV_AVISOS?.cancelled?.(id);
  if(C) C.F.deleteDoc(C.F.doc(C.db, "alertes", id)).catch(() => {});
  end();
}
function end(){
  unsub && unsub(); unsub = null; clearInterval(geoT); clearTimeout(posT);
  S = null; doc = null; myPos = null; save();
  if(map){ map.remove(); map = null; lay = null; }
  const p = $("sosMap"); if(p){ p.hidden = true; msg(""); }
  showTri(false);
}
function toast(t){
  const b = document.createElement("div"); b.className = "live-alert"; b.setAttribute("role", "alert");
  b.innerHTML = `<div class="la-item ok"><b>${esc(t)}</b><div class="la-btns"><button type="button" class="btn">D'acord</button></div></div>`;
  b.querySelector("button").onclick = () => b.remove(); document.body.appendChild(b);
}

/* ---------- interfície pública ---------- */
window.OV_SOS = {
  own(id){ if(S && S.id === id) return; S = {id, role:"navegant", seen:[]}; save(); listen(); schedulePos(); showTri(true); },
  ownEnd(id){ if(S && S.id === id) end(); },
  help, open, active: () => S
};
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#sosBtn, #sosBtn2, #sosMin"); if(!t) return;
  if(t.id === "sosMin") minimize(); else open();
});
window.addEventListener("resize", () => { if(S) triButtons(); });
// Continua després de recarregar l'app
async function resume(){
  if(S) return;
  let s = null; try{ s = JSON.parse(localStorage.getItem(KEY)); }catch(e){}
  if(!s || !s.id) return;
  const C = ctx(); if(!C) return;
  if(s.role === "navegant" && !(live() && s.id.includes("_" + live().start + "_"))){ try{ localStorage.removeItem(KEY); }catch(e){} return; }
  S = s; listen(); showTri(true);
  if(S.role === "ajudant") startGeo(); else schedulePos();
}
// El botó «Ajuda» de la pantalla de navegació només surt amb compte de soci aprovat (sense, no hi ha a qui avisar)
function helpVis(){ const b = $("rideHelp"); if(b) b.hidden = !ctx(); }
window.addEventListener("ov-cloud", () => setTimeout(() => { helpVis(); resume(); }, 500));
setTimeout(() => { helpVis(); resume(); }, 3000);
})();
