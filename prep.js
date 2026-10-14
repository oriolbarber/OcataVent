"use strict";
/* ============ Ocata Vent · pantalla «Nova sortida»: condicions d'ara, mapa amb el GPS i el vent pintat a sobre ============
   - Condicions: veredicte d'ara per a l'embarcació, hores fins a la posta, llum que queda, avisos i bandera.
   - Mapa: posició GPS (per comprovar que funciona), base nàutica, i capes Vent (ratlles + etiqueta, estil Windy),
     Onades (crestes només sobre el mar, detectat pel color d'aigua de les rajoles + etiqueta) i Pluja (radar RainViewer).
   - El GPS només es llegeix mentre aquesta pantalla és visible i no s'està gravant. */
(() => {
const PB = LOC.home;                                   // base nàutica
let pMap = null, meM = null, accC = null, baseM = null, flagM = null, radarL = null, baseL = null, windPane = null, cvS = null, cs = null;
let watchId = null, fix = null, fitted = false, raf = 0, parts = [], cv = null, cx = null;
const LY_KEY = "ov2_prep_ly";
let LY = Object.assign({vent:true, onades:true, pluja:false}, store.get(LY_KEY) || {}); delete LY.carta;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const visible = () => !$("view-trip").hidden && !$("tripIdle").hidden && document.visibilityState === "visible";
const recording = () => typeof LIVE !== "undefined" && !!LIVE;
const hm = d => pad(d.getHours()) + ":" + pad(d.getMinutes());
const durTxt = min => min >= 60 ? Math.floor(min / 60) + " h " + pad(min % 60) + " min" : min + " min";

/* ---------- condicions d'ara ---------- */
function nowPoint(){
  const fc = DATA.now, live = stFresh();
  return live ? Object.assign({}, fc, {wind:ST.wind, gust:ST.gust, dir:ST.dir, temp:ST.temp}) : fc;
}
function render(){
  const el = $("prepNow"); if(!el) return;
  if(!DATA){ el.innerHTML = `<p class="note">Carregant la previsió…</p>`; return; }
  const c = crit[act], n = nowPoint(), s = scoreWindow(n, c), v = verdict(s), td = todayDate(), i = DATA.daily.time.indexOf(td);
  const set = i >= 0 ? new Date(DATA.daily.sunset[i]) : null, rise1 = DATA.daily.sunrise[i + 1] ? new Date(DATA.daily.sunrise[i + 1]) : null;
  const dark = set ? new Date(set.getTime() - 30 * 60e3) : null, left = dark ? Math.round((dark - Date.now()) / 60000) : null;
  // hores que queden fins a la posta
  const h0 = new Date().getHours(), h1 = set ? set.getHours() : 20, hrs = [];
  if(selH != null && (selH <= h0 || selH > h1)) selH = null;   // l'hora triada ja ha passat: torna a «ara»
  for(let h = h0; h <= h1; h++){ const p = hourAt(td, h) || DATA.hours[hourKey(td, h)]; if(p) hrs.push({h, p, v: verdict(scoreHour(p, c))}); }
  // la franja bona més llarga (Ideal o Bo)
  let best = null, run = null;
  hrs.forEach(x => { if(x.v.k === "ideal"){ run = run && run.to === x.h - 1 ? {from: run.from, to: x.h} : {from: x.h, to: x.h}; if(!best || run.to - run.from > best.to - best.from) best = {...run}; } else run = null; });
  const why = (v.sub || "").trim();
  const light = left == null ? "" : left > 0 ? `Llum fins a les ${hm(dark)} · queden <b>${durTxt(left)}</b>`
    : `Ja hi ha poca llum${rise1 ? ` · demà, a partir de les ${hm(new Date(rise1.getTime() - 30 * 60e3))}` : ""}`;
  const plan = !hrs.length ? "" : best ? (best.from === h0 && best.to === h1 ? "Bo fins a la posta" : `Millor franja: <b>${best.from}–${best.to + 1} h</b>`)
    : hrs.some(x => x.v.k === "marg") ? "Avui, com a molt, condicions limitades" : "No es preveu cap hora recomanada fins a la posta";
  // avisos de Meteocat d'avui i bandera
  const today = ymd(new Date()), al = (INFO.alerts || []).filter(a => a.day === today);
  const f = INFO.flag, fresh = !!(f && f.at && new Date(f.at).toDateString() === new Date().toDateString()), fl = fresh && FLAG[f.color];
  const warn = al.map(a => { const pv = PERILL(a.perill); return `<div class="info-row k-${pv.k}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/></svg><span><b>${esc(a.tipus)} Meteocat · ${esc(a.meteor)}</b> · ${pv.t}</span></div>`; }).join("");
  el.innerHTML = `
    <div class="pn-top k-${v.k}">
      <div class="pn-score"><b>${s.score == null ? "–" : Math.round(s.score / 10)}</b><small>/10</small></div>
      <div class="pn-v"><span class="pn-boat">${boatIcon(act, 18)}${esc(DEFAULTS[act].name)} · ara</span><b class="pn-t">${esc(v.t)}</b>${why ? `<span class="pn-why">${esc(why)}</span>` : ""}</div>
    </div>
    ${hrs.length ? `<div class="pn-hrs" aria-label="Hores fins a la posta">${hrs.map(x => `<button type="button" class="pn-h k-${x.v.k}" data-ph="${x.h}" aria-pressed="${x.h === (selH ?? h0)}" aria-label="${x.h} h · ${esc(x.v.t)} · ${r0(x.p.wind)} kn"><span>${x.h} h</span><i></i><b>${r0(x.p.wind)}</b>${wmArrow(x.p.dir, 14)}</button>`).join("")}</div>` : ""}
    <div class="pn-lines">
      ${plan ? `<span>${plan}</span>` : ""}
      ${light ? `<span>${light}</span>` : ""}
      ${fl ? `<span><span class="vd" style="background:var(--${fl.k})"></span>Bandera ${fl.t}${f.reason ? " · " + esc(f.reason) : ""}</span>` : ""}
    </div>${warn}`;
  drawWind();
}

/* ---------- mapa ---------- */
const ME_IC = L => L.divIcon({className:"prep-me", iconSize:[0, 0], html:`<div class="pm-pivot"><i class="pm-head" hidden></i><i class="pm-dot"></i></div>`});
function ensureMap(){
  const el = $("prepMap"); if(!el) return false;
  if(!window.L){ el.innerHTML = `<div class="empty">No s'ha pogut carregar el mapa.</div>`; return false; }
  if(pMap) return true;
  // estàtic per al dit (la pàgina ha de poder fer scroll); zoom amb els botons
  pMap = L.map(el, {zoomControl:true, attributionControl:true, dragging:false, touchZoom:false, doubleClickZoom:false, scrollWheelZoom:false, boxZoom:false, keyboard:false, tap:false, zoomSnap:0.5}).setView(PB, 14);
  pMap.attributionControl.setPrefix(false);
  // crossOrigin: cal per llegir els píxels de les rajoles i saber on és el mar (color d'aigua d'OpenStreetMap)
  baseL = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, className:"base-tiles", attribution:"© OpenStreetMap", crossOrigin:"anonymous"}).addTo(pMap);
  baseL.on("load", buildMask);
  windPane = pMap.createPane("prepWind"); windPane.style.zIndex = 450; windPane.style.pointerEvents = "none";
  cvS = document.createElement("canvas"); cvS.className = "prep-cv"; windPane.appendChild(cvS); cs = cvS.getContext("2d");
  cv = document.createElement("canvas"); cv.className = "prep-cv"; windPane.appendChild(cv); cx = cv.getContext("2d");
  baseM = L.marker(PB, {interactive:false, keyboard:false, icon:L.divIcon({className:"prep-base", iconSize:[0, 0], html:`<div class="pb-pin"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg></div><span class="pb-l">Base</span>`})}).addTo(pMap);
  flagM = L.marker(PB, {interactive:false, keyboard:false, zIndexOffset:-100, icon:L.divIcon({className:"wm-pin", iconSize:[0, 0],
    html:`<div class="wm-pivot"><div class="wm-flag wave" data-pf="v"><span class="wm-txt"></span></div><div class="wm-flag wind" data-pf="w"><span class="wm-txt"></span></div></div>`})}).addTo(pMap);
  pMap.on("zoomend moveend resize", sizeCanvas);
  pMap.on("zoomstart", () => { mask = null; });
  new ResizeObserver(() => { pMap.invalidateSize(false); sizeCanvas(); }).observe(el);
  applyLayers(); sizeCanvas();
  return true;
}
function sizeCanvas(){
  if(!pMap || !cv) return;
  const s = pMap.getSize(), dpr = Math.min(2, devicePixelRatio || 1);
  [[cv, cx], [cvS, cs]].forEach(([c, g]) => {
    L.DomUtil.setPosition(c, pMap.containerPointToLayerPoint([0, 0]));
    if(c.width !== Math.round(s.x * dpr) || c.height !== Math.round(s.y * dpr)){
      c.width = Math.round(s.x * dpr); c.height = Math.round(s.y * dpr); c.style.width = s.x + "px"; c.style.height = s.y + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  });
  parts = []; crests = [];
}
// Màscara del mar: es dibuixen les rajoles en un canvas i es marquen els píxels del color de l'aigua d'OpenStreetMap (#aad3df)
let mask = null, maskOk = null;
function buildMask(){
  if(!pMap || !baseL) return;
  const s = pMap.getSize(), m = document.createElement("canvas"); m.width = s.x; m.height = s.y;
  const g = m.getContext("2d", {willReadFrequently:true});
  Object.values(baseL._tiles || {}).forEach(t => {
    const im = t.el; if(!im || !im.complete || !im.naturalWidth) return;
    const z = t.coords.z, a = pMap.latLngToContainerPoint(pMap.unproject(L.point(t.coords.x * 256, t.coords.y * 256), z)),
      b = pMap.latLngToContainerPoint(pMap.unproject(L.point((t.coords.x + 1) * 256, (t.coords.y + 1) * 256), z));
    g.drawImage(im, a.x, a.y, b.x - a.x, b.y - a.y);
  });
  try{
    const d = g.getImageData(0, 0, s.x, s.y), px = d.data; let n = 0;
    for(let i = 0; i < px.length; i += 4){
      const sea = Math.abs(px[i] - 170) < 14 && Math.abs(px[i+1] - 211) < 14 && Math.abs(px[i+2] - 223) < 14;
      px[i] = px[i+1] = px[i+2] = 0; px[i+3] = sea ? 255 : 0; if(sea) n++;
    }
    g.putImageData(d, 0, 0); mask = m; maskOk = true;
    $("prepSeaT").hidden = !LY.onades || n > 0; $("prepSeaT").textContent = "No hi ha mar a la vista.";
  }catch(e){ mask = null; maskOk = false; if(LY.onades){ $("prepSeaT").hidden = false; $("prepSeaT").textContent = "No s'ha pogut localitzar el mar al mapa."; } }
}
function applyLayers(){
  if(!pMap) return;
  document.querySelectorAll("#prepLayers [data-ly]").forEach(b => b.setAttribute("aria-pressed", String(!!LY[b.dataset.ly])));
  cv.style.display = LY.vent ? "" : "none"; cvS.style.display = LY.onades ? "" : "none";
  if(LY.pluja) loadRadar(); else if(radarL){ radarL.remove(); }
  $("prepRadarT").hidden = !LY.pluja;
  if(!LY.onades) $("prepSeaT").hidden = true; else if(maskOk === false) $("prepSeaT").hidden = false;
  drawWind();
}
let radarAt = 0;
async function loadRadar(){
  if(radarL && Date.now() - radarAt < 5 * 60e3){ radarL.addTo(pMap); return; }
  $("prepRadarT").textContent = "Radar: carregant…";
  try{
    const j = await (await fetch("https://api.rainviewer.com/public/weather-maps.json", {cache:"no-store"})).json();
    const fr = (j.radar?.past || []).slice(-1)[0]; if(!fr) throw 0;
    if(radarL) radarL.remove();
    radarL = L.tileLayer(j.host + fr.path + "/256/{z}/{x}/{y}/2/1_1.png", {opacity:.75, zIndex:8, maxNativeZoom:7, maxZoom:18, attribution:"RainViewer"});
    radarAt = Date.now();
    if(LY.pluja) radarL.addTo(pMap);
    const ago = Math.round((Date.now() - fr.time * 1000) / 60000);
    $("prepRadarT").textContent = `Radar de pluja · ${hm(new Date(fr.time * 1000))} (fa ${ago} min) · sense color: no plou`;
  }catch(e){ $("prepRadarT").textContent = "Radar: sense connexió"; }
}

/* ---------- vent i onades pintats sobre el mapa (com Windy) ---------- */
// Hora triada a la franja (null = ara). El mapa pinta el vent i les onades d'aquella hora.
let selH = null;
function windNow(){
  if(!DATA) return null;
  if(selH != null){ const td = todayDate(), p = hourAt(td, selH) || DATA.hours[hourKey(td, selH)];
    if(p) return {wind:p.wind, gust:p.gust, dir:p.dir, wave:p.wave, wdir:p.wdir, per:tpOf(p), live:false, h:selH}; }
  const n = nowPoint(), fc = DATA.now; return {wind:n.wind, gust:n.gust, dir:n.dir, wave:fc.wave, wdir:fc.wdir, per:tpOf(fc), live:stFresh()};
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("#prepNow [data-ph]"); if(!b) return;
  const h = +b.dataset.ph; selH = h === new Date().getHours() || h === selH ? null : h; parts = []; crests = []; render(); });
function setFlag(key, dir, html, bg, off){
  const f = flagM?.getElement()?.querySelector(`[data-pf="${key}"]`); if(!f) return;
  if(dir == null){ f.hidden = true; return; }
  f.hidden = false;
  const a = dir - 90, n = ((a % 360) + 360) % 360;
  f.style.setProperty("--a", a + "deg"); f.style.setProperty("--bg", bg); f.style.setProperty("--fg", "var(--on-k)"); f.style.setProperty("--off", (off || 0) + "px");
  f.classList.toggle("flip", n > 90 && n < 270);
  f.querySelector(".wm-txt").innerHTML = `<span class="wm-lbl">${html}</span>`;
}
function drawWind(){
  const w = windNow(); if(!w || !pMap) return;
  const c = crit[act], kw = lvWind(w.wind, c), kwv = lvWave(w.wave, c);
  let dw = LY.vent ? w.dir : null, dv = LY.onades && w.wave != null ? w.wdir : null, oW = 0, oV = 0;
  if(dw != null && dv != null){ const d = ((dv - dw + 540) % 360) - 180; if(Math.abs(d) < 40){ dw = dv = dw + d / 2; oW = -15; oV = 14; } }
  setFlag("w", dw, `<b>${r1(w.wind)}</b> kn<small>${windAbbr(w.dir)} · R${r0(w.gust)}</small>`, kw ? `var(--${kw})` : "var(--muted)", oW);
  setFlag("v", dv, `<b>${r1(w.wave)}</b> m<small>${r0(w.per)} s</small>`, kwv ? `var(--${kwv})` : "var(--muted)", oV);
  $("prepWindT").innerHTML = w.wind == null ? "" : `${w.h != null ? `<b>A les ${w.h} h</b> · vent previst` : `Vent ${w.live ? "mesurat" : "previst"}`}: <b>${windName(w.dir)}</b> (${windAbbr(w.dir)}) ${r1(w.wind)} kn, ratxa ${r0(w.gust)}${w.wave != null ? ` · onada ${r1(w.wave)} m de ${windAbbr(w.wdir)}` : ""}`;
  if(!raf && (LY.vent || LY.onades) && visible()) raf = requestAnimationFrame(step);
}
const isDark = () => { const th = document.documentElement.dataset.theme; return th === "dark" || (!th && matchMedia("(prefers-color-scheme: dark)").matches); };
function step(){
  raf = 0;
  const w = windNow(); if(!w || !cx || !(LY.vent || LY.onades) || !visible() || recording()) return;
  const s = pMap.getSize(); if(!s.x) return;
  if(LY.vent) windStep(w, s);
  if(LY.onades) seaStep(w, s);
  if(!reduce) raf = requestAnimationFrame(step);
}
// Vent: ratlles que avancen cap on bufa (més ràpides com més vent) i deixen una cua curta
function windStep(w, s){
  const N = Math.round(s.x * s.y / 2600);
  const to = ((w.dir ?? 0) + 180) * Math.PI / 180, sp = (reduce ? 14 : 0.35 + Math.min(30, w.wind || 0) * 0.09), ux = Math.sin(to) * sp, uy = -Math.cos(to) * sp;
  while(parts.length < N) parts.push({x: Math.random() * s.x, y: Math.random() * s.y, age: Math.random() * 90, life: 60 + Math.random() * 60, j: 0.7 + Math.random() * 0.6});
  if(reduce) cx.clearRect(0, 0, s.x, s.y);
  else { cx.globalCompositeOperation = "destination-out"; cx.fillStyle = "rgba(0,0,0,.1)"; cx.fillRect(0, 0, s.x, s.y); cx.globalCompositeOperation = "source-over"; }
  cx.strokeStyle = isDark() ? "rgba(255,255,255,.75)" : "rgba(10,30,60,.55)"; cx.lineWidth = 1.6; cx.lineCap = "round";
  cx.beginPath();
  if(w.dir != null && (w.wind || 0) >= 0.5) parts.forEach(p => {
    const nx = p.x + ux * p.j, ny = p.y + uy * p.j;
    cx.moveTo(p.x, p.y); cx.lineTo(nx, ny); p.x = nx; p.y = ny; p.age++;
    if(p.age > p.life || p.x < -5 || p.y < -5 || p.x > s.x + 5 || p.y > s.y + 5){ p.x = Math.random() * s.x; p.y = Math.random() * s.y; p.age = 0; }
  });
  cx.stroke();
}
// Onades: crestes (arcs perpendiculars) que avancen cap on va l'onada, només sobre el mar; més llargues com més alta
let crests = [];
function seaStep(w, s){
  cs.clearRect(0, 0, s.x, s.y);
  if(!mask || w.wdir == null || w.wave == null) return;
  const N = Math.round(s.x * s.y / 5200), to = (w.wdir + 180) * Math.PI / 180, ux = Math.sin(to), uy = -Math.cos(to);
  const sp = reduce ? 0 : 0.12 + Math.min(12, w.per || 5) * 0.025, len = 6 + Math.min(2, w.wave) * 9;
  while(crests.length < N) crests.push({x: Math.random() * s.x, y: Math.random() * s.y, age: Math.random() * 200, life: 140 + Math.random() * 120});
  cs.lineWidth = 2.2; cs.lineCap = "round";
  const col = isDark() ? "120,190,255" : "10,90,190";
  crests.forEach(p => {
    const a = Math.sin(Math.PI * Math.min(1, p.age / p.life));          // apareix i s'esvaeix
    cs.strokeStyle = `rgba(${col},${(0.85 * a).toFixed(2)})`;
    cs.beginPath();   // arc amb la panxa cap on avança l'onada
    cs.moveTo(p.x - uy * len - ux * 3, p.y + ux * len - uy * 3);
    cs.quadraticCurveTo(p.x + ux * 3, p.y + uy * 3, p.x + uy * len - ux * 3, p.y - ux * len - uy * 3);
    cs.stroke();
    p.x += ux * sp; p.y += uy * sp; p.age++;
    if(p.age > p.life || p.x < -20 || p.y < -20 || p.x > s.x + 20 || p.y > s.y + 20){ p.x = Math.random() * s.x; p.y = Math.random() * s.y; p.age = 0; }
  });
  // retalla al mar
  cs.globalCompositeOperation = "destination-in"; cs.drawImage(mask, 0, 0, s.x, s.y); cs.globalCompositeOperation = "source-over";
}

/* ---------- GPS (només per comprovar-lo i situar-te; la gravació té el seu) ---------- */
function gpsTxt(t, k){ const e = $("prepGps"); if(!e) return; e.className = "src" + (k ? " " + k : ""); e.innerHTML = (k === "live" ? `<span class="dot"></span>` : "") + t; }
async function startGps(){
  if(watchId != null || recording() || !visible()) return;
  if(!("geolocation" in navigator)){ gpsTxt("Sense GPS"); return; }
  let st = "prompt"; try{ st = (await navigator.permissions.query({name:"geolocation"})).state; }catch(e){ if(window.OV_NATIVE) st = "granted"; }
  if(st === "denied"){ gpsTxt("Ubicació denegada", "bad"); return; }
  if(st !== "granted"){ gpsTxt("Toca «Permet» a GPS, a sota"); return; }
  if(watchId != null || !visible()) return;
  gpsTxt("Buscant el GPS…");
  watchId = navigator.geolocation.watchPosition(onFix, e => gpsTxt(e.code === 1 ? "Ubicació denegada" : "Sense senyal GPS", "bad"), {enableHighAccuracy:true, maximumAge:5000, timeout:30000});
}
function stopGps(){ if(watchId != null){ navigator.geolocation.clearWatch(watchId); watchId = null; } cancelAnimationFrame(raf); raf = 0; }
function onFix(pos){
  const {latitude:lat, longitude:lon, accuracy:acc, heading, speed} = pos.coords;
  fix = {lat, lon, acc, at: Date.now()};
  if(!ensureMap()) return;
  const ll = [lat, lon];
  if(!meM){ meM = L.marker(ll, {interactive:false, keyboard:false, zIndexOffset:500, icon:ME_IC(L)}).addTo(pMap); accC = L.circle(ll, {radius:acc, weight:1, color:"#2f80ff", fillColor:"#2f80ff", fillOpacity:.12, interactive:false}).addTo(pMap); }
  else { meM.setLatLng(ll); accC.setLatLng(ll).setRadius(acc); }
  flagM.setLatLng(ll);   // les etiquetes de vent i onada surten d'on ets
  const hd = meM.getElement()?.querySelector(".pm-head");
  if(hd){ const moving = heading != null && !isNaN(heading) && (speed || 0) > 0.5; hd.hidden = !moving; if(moving) hd.style.transform = `rotate(${heading}deg)`; }
  const d = hav({lat, lon}, {lat:PB[0], lon:PB[1]}), b = bearing({lat, lon}, {lat:PB[0], lon:PB[1]});
  const good = acc <= 25, k = acc <= 25 ? "live" : acc <= 60 ? "" : "bad";
  gpsTxt(`GPS ${good ? "a punt" : acc <= 60 ? "poc precís" : "molt imprecís"} · ±${Math.round(acc)} m`, k);
  $("prepBaseT").innerHTML = d < 60 ? "Ets a la base nàutica" : `Base a <b>${d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1).replace(".", ",") + " km"}</b> cap al ${cogName(b)}`;
  if(!fitted){ fitted = true; if(d < 8000) pMap.fitBounds(L.latLngBounds([ll, PB]), {maxZoom:15, padding:[90, 90]}); else pMap.setView(ll, 14); }
  else if(!pMap.getBounds().pad(-0.25).contains(ll)) pMap.panTo(ll);
}

/* ---------- capes i altres mapes ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("#prepLayers [data-ly]"); if(!b) return;
  LY[b.dataset.ly] = !LY[b.dataset.ly]; store.set(LY_KEY, LY); applyLayers();
});
function show(){
  if(!visible() || recording()){ stopGps(); return; }
  if(ensureMap()){ setTimeout(() => { pMap.invalidateSize(false); sizeCanvas(); applyLayers(); }, 0); }
  render(); startGps();
}
window.addEventListener("mm-view", e => { if(e.detail === "trip") setTimeout(show, 0); else stopGps(); });
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" ? show() : stopGps());
window.addEventListener("mm-theme", () => { parts = []; crests = []; render(); });
$("startTrip").addEventListener("click", () => setTimeout(() => { if(recording()) stopGps(); }, 0));
document.addEventListener("click", e => { if(e.target.id === "pmGeoBtn") setTimeout(startGps, 1500); });
// l'app crida renderPrep quan arriben dades noves (previsió, estació, embarcació)
window.renderPrep = () => { if(visible()) render(); };
setInterval(() => { if(visible() && !recording()) render(); else if(recording()) stopGps(); }, 60000);
// en tornar d'una sortida, la pantalla torna a aparèixer
new MutationObserver(() => { if(!$("tripIdle").hidden) show(); else stopGps(); }).observe($("tripIdle"), {attributes:true, attributeFilter:["hidden"]});
})();
