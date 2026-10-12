"use strict";
/* ============ Mar del Masnou · mapes en directe ============ */
const RV_API = "https://api.rainviewer.com/public/weather-maps.json";
const WINDY_PRODUCT = {wind:"ecmwf", gust:"ecmwf", waves:"ecmwfWaves", rain:"ecmwf", clouds:"ecmwf"};
// autoplay/muted: molts reproductors els accepten per URL; si aquest no, no fan res (i cal tocar ▶ dins el vídeo)
// Badalona: webcam del Club Natació Badalona (la mateixa que mostra badalona.meteoelmasnou.cat), reproductor de Windy
const CAM2_URL = "https://webcams.windy.com/webcams/public/embed/player?webcamId=1625826131&playerType=live&loop=0&autoPlay=1&interactive=1";
const CAM_URL = "https://plataforma.streamingbarcelona.com/masnou/es/embed/?autoplay=1&muted=1&mute=1&autostart=true";
const MB_URL = `https://www.meteoblue.com/ca/weather/maps/widget/${LOC.lat.toFixed(3)}N${LOC.lon.toFixed(3)}E?windAnimation=1&gust=1&satellite=1&cloudsAndPrecipitation=1&temperature=1&sunshine=0&extremeForecastIndex=0&geoloc=fixed&tempunit=C&windunit=kn&lengthunit=metric&zoom=8&autowidth=auto`;

let mapKind = "mb", rvMap = null, rvFrames = [], rvLayers = [], rvIdx = 0, rvTimer = null, rvKind = null, rvLoadedAt = 0, windyOv = "waves";

const PLAY_IC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>`;
const PAUSE_IC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;

function rvShow(i){
  if(!rvLayers.length) return;
  rvIdx = (i + rvLayers.length) % rvLayers.length;
  rvLayers.forEach((l, j) => l.setOpacity(j === rvIdx ? (rvKind === "sat" ? 0.85 : 0.8) : 0));
  const d = new Date(rvFrames[rvIdx].time*1000), ago = Math.round((Date.now() - d)/60000);
  $("radarTime").textContent = pad(d.getHours())+":"+pad(d.getMinutes()) + (ago > 0 ? " · fa "+ago+" min" : "");
  $("radarSlider").value = rvIdx;
}
function rvPlay(on){
  clearInterval(rvTimer); rvTimer = null;
  if(on && rvLayers.length){ rvTimer = setInterval(() => { rvShow(rvIdx+1); }, rvIdx === rvLayers.length-1 ? 1500 : 650); }
  $("radarPlay").innerHTML = rvTimer ? PAUSE_IC : PLAY_IC;
  $("radarPlay").setAttribute("aria-label", rvTimer ? "Atura l'animació" : "Reprodueix l'animació");
}
async function rvLoad(kind){
  if(!window.L){ $("radarMap").innerHTML = `<div class="empty">No s'ha pogut carregar el mapa. Comprova la connexió.</div>`; return; }
  if(!rvMap){ rvMap = baseMap($("radarMap")); rvMap.setView([41.6, 2.2], 8); L.circleMarker(HOME, {radius:6, color:"#fff", weight:2, fillColor:"#ff6476", fillOpacity:1}).bindTooltip(LOC.name).addTo(rvMap); }
  if(kind === rvKind && Date.now() - rvLoadedAt < 5*60*1000) { rvPlay(true); return; }
  rvPlay(false);
  $("radarTime").textContent = "Carregant…";
  try{
    const j = await (await fetch(RV_API, {cache:"no-store"})).json();
    rvLayers.forEach(l => rvMap.removeLayer(l));
    rvFrames = kind === "sat" ? (j.satellite?.infrared || []) : [...(j.radar?.past || []), ...(j.radar?.nowcast || [])];
    const tile = kind === "sat" ? "/256/{z}/{x}/{y}/0/0_0.png" : "/256/{z}/{x}/{y}/2/1_1.png";
    rvLayers = rvFrames.map(f => L.tileLayer(j.host + f.path + tile, {opacity:0, zIndex:10, maxNativeZoom:7, maxZoom:12, attribution:'RainViewer'}).addTo(rvMap));
    rvKind = kind; rvLoadedAt = Date.now();
    $("radarSlider").max = Math.max(0, rvFrames.length-1);
    $("radarTitle").textContent = kind === "sat" ? "Satèl·lit infraroig · núvols" : "Radar de pluja · últimes 2 h";
    $("radarNote").innerHTML = kind === "sat"
      ? `Núvols vistos pel satèl·lit en infraroig: com més blancs, més alts i freds (tempestes). Font: RainViewer.`
      : `Pluja detectada pels radars meteorològics, cada 10 minuts. Font: RainViewer.`;
    if(!rvFrames.length){ $("radarTime").textContent = "Sense imatges"; return; }
    rvShow(rvFrames.length-1); rvPlay(true);
  }catch(e){ $("radarTime").textContent = "Sense connexió"; }
}
function windyUrl(ov){
  return "https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt"+
    `&zoom=9&overlay=${ov}&product=${WINDY_PRODUCT[ov]}&level=surface&lat=41.38&lon=2.35&detailLat=${LOC.lat}&detailLon=${LOC.lon}&marker=true&message=true`;
}
function showMapKind(k){
  mapKind = k;
  document.querySelectorAll("#mapSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.map === k)));
  $("mapRadar").hidden = k !== "radar";
  $("mapWindy").hidden = k !== "windy";
  $("mapMb").hidden = k !== "mb";
  $("mapCam").hidden = k !== "cam"; $("mapCam2").hidden = k !== "cam";
  if(k === "cam" && !$("camFrame2").src){ $("camFrame2").src = CAM2_URL; $("camPlay2").hidden = false; setTimeout(camLoad, 50); }
  if(k !== "cam" && $("camFrame2").src) $("camFrame2").removeAttribute("src");
  if(k === "cam" && !$("camFrame").src){ $("camFrame").src = CAM_URL; $("camPlay").hidden = false; setTimeout(camLoad, 50); }
  if(k !== "cam" && $("camFrame").src){ $("camFrame").removeAttribute("src"); } // atura el vídeo (dades) quan no es mira
  if(k === "radar" || k === "sat"){ setTimeout(() => { rvMap && rvMap.invalidateSize(); rvLoad(k); }, 0); }
  else rvPlay(false);
  if(k === "windy" && !$("windyFrame").src) $("windyFrame").src = windyUrl(windyOv);
  if(k === "mb" && !$("mbFrame").src) $("mbFrame").src = MB_URL;
}

$("mapSeg").addEventListener("click", e => { const b = e.target.closest("button[data-map]"); if(b) showMapKind(b.dataset.map); });
$("windySeg").addEventListener("click", e => { const b = e.target.closest("button[data-ov]"); if(!b) return; windyOv = b.dataset.ov;
  document.querySelectorAll("#windySeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); $("windyFrame").src = windyUrl(windyOv);
  const t = {waves:"Onades", wind:"Vent", gust:"Ratxes", rain:"Pluja", clouds:"Núvols"}[windyOv]; document.querySelector("#mapWindy .lbl").textContent = t + " · Windy"; });
$("radarPlay").addEventListener("click", () => rvPlay(!rvTimer));
$("radarSlider").addEventListener("input", e => { rvPlay(false); rvShow(+e.target.value); });
$("radarPlay").innerHTML = PLAY_IC;
window.addEventListener("mm-view", e => { if(e.detail === "map") showMapKind(mapKind); else { rvPlay(false); camClose(); $("camFrame").removeAttribute("src"); $("camFrame2").removeAttribute("src"); } });
document.addEventListener("visibilitychange", () => { if(document.visibilityState !== "visible") rvPlay(false); });

/* ---------- webcam a pantalla completa, girada i amb zoom ---------- */
// L'iframe de la webcam és d'un altre web: no podem tocar el vídeo, però sí fer gran i ampliar el marc sencer.
// Una capa transparent a sobre recull els gestos (pessigar, arrossegar, doble toc) quan és a pantalla completa.
// Cada webcam té el seu estat i el seu enquadrament desat (sfx = sufix dels id: "" Nàutic Masnou, "2" CN Badalona)
const CAM_DEF = {s:1.35, fx:0, fy:0};
function makeCam(sfx, key){
  const $c = id => $(id + sfx), C = {on:false, s:1, tx:0, ty:0, pts:new Map(), pinch:null, lastTap:0};
  const view = () => { const v = store.get(key); return v && v.s ? v : CAM_DEF; };
  const apply = () => { const f = $c("camFrame"), w = f.offsetWidth, h = f.offsetHeight;
    C.s = Math.min(5, Math.max(1, C.s)); const mx = (C.s - 1) * w / 2, my = (C.s - 1) * h / 2;
    C.tx = Math.min(mx, Math.max(-mx, C.tx)); C.ty = Math.min(my, Math.max(-my, C.ty));
    f.style.transform = C.s === 1 ? "" : `translate(${C.tx}px, ${C.ty}px) scale(${C.s})`; };
  const load = () => { const v = view(), f = $c("camFrame"); C.s = v.s; C.tx = v.fx * f.offsetWidth; C.ty = v.fy * f.offsetHeight; apply(); };
  const save = () => { const f = $c("camFrame"), w = f.offsetWidth || 1, h = f.offsetHeight || 1; store.set(key, {s: +C.s.toFixed(3), fx: +(C.tx / w).toFixed(4), fy: +(C.ty / h).toFixed(4)}); };
  // zoom mantenint quiet el punt (px, py) relatiu al centre de l'iframe
  const zoomAt = (s2, px, py) => { const k = s2 / C.s; C.tx = px - (px - C.tx) * k; C.ty = py - (py - C.ty) * k; C.s = s2; apply(); };
  const rel = e => { const r = $c("camFrame").getBoundingClientRect(); return [e.clientX - (r.left + r.width/2) + C.tx, e.clientY - (r.top + r.height/2) + C.ty]; };
  const open = async () => { C.on = true; const box = $c("camBox");
    box.classList.add("cam-max"); document.body.classList.add("cam-open"); $c("camHint").hidden = false; setTimeout(() => { $c("camHint").hidden = true; }, 4000);
    try{ if(box.requestFullscreen) await box.requestFullscreen({navigationUI:"hide"}); else if(box.webkitRequestFullscreen) box.webkitRequestFullscreen(); }catch(e){}
    try{ await screen.orientation.lock("landscape"); }catch(e){}   // Android: gira sol; on no es pot, n'hi ha prou de girar el mòbil
    setTimeout(load, 300); };
  const close = () => { if(!C.on) return; C.on = false; save();
    $c("camBox").classList.remove("cam-max"); document.body.classList.remove("cam-open");
    try{ screen.orientation.unlock(); }catch(e){}
    try{ if(document.fullscreenElement) document.exitFullscreen(); }catch(e){}
    setTimeout(load, 300); };   // el vídeo petit queda amb el mateix enquadrament
  $c("camMax").addEventListener("click", open);
  $c("camClose").addEventListener("click", close);
  $c("camZoomIn").addEventListener("click", () => zoomAt(C.s * 1.5, C.tx, C.ty));
  $c("camZoomOut").addEventListener("click", () => zoomAt(C.s / 1.5, C.tx, C.ty));
  document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && C.on) close(); });
  document.addEventListener("keydown", e => { if(e.key === "Escape" && C.on) close(); });
  addEventListener("resize", () => { if(C.on) apply(); else if(!$c("mapCam").hidden) load(); });
  const ct = $c("camTouch");
  ct.addEventListener("pointerdown", e => {
    ct.setPointerCapture(e.pointerId); C.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if(C.pts.size === 2){ const [a, b] = [...C.pts.values()]; C.pinch = {d: Math.hypot(a[0]-b[0], a[1]-b[1]), s: C.s, mid: [(a[0]+b[0])/2, (a[1]+b[1])/2], tx: C.tx, ty: C.ty}; }
    if(C.pts.size === 1){ const now = Date.now();
      if(now - C.lastTap < 300){ const [px, py] = rel(e); zoomAt(C.s > 1.2 ? 1 : 2.5, C.s > 1.2 ? 0 : px, C.s > 1.2 ? 0 : py); if(C.s === 1){ C.tx = C.ty = 0; apply(); } C.lastTap = 0; }
      else C.lastTap = now; } });
  ct.addEventListener("pointermove", e => {
    const prev = C.pts.get(e.pointerId); if(!prev) return; C.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if(C.pts.size >= 2 && C.pinch){ const [a, b] = [...C.pts.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), mid = [(a[0]+b[0])/2, (a[1]+b[1])/2];
      const r = $c("camFrame").getBoundingClientRect(), p0 = C.pinch, s2 = Math.min(5, Math.max(1, p0.s * d / p0.d)), k = s2 / p0.s;
      const cx = r.left + r.width/2 - C.tx, cy = r.top + r.height/2 - C.ty, px = p0.mid[0] - cx, py = p0.mid[1] - cy;
      C.s = s2; C.tx = px - (px - p0.tx) * k + (mid[0] - p0.mid[0]); C.ty = py - (py - p0.ty) * k + (mid[1] - p0.mid[1]); apply(); }
    else if(C.pts.size === 1 && C.s > 1){ C.tx += e.clientX - prev[0]; C.ty += e.clientY - prev[1]; apply(); } });
  const up = e => { C.pts.delete(e.pointerId); if(C.pts.size < 2) C.pinch = null; };
  ct.addEventListener("pointerup", up); ct.addEventListener("pointercancel", up);
  ct.addEventListener("wheel", e => { e.preventDefault(); const [px, py] = rel(e); zoomAt(C.s * (e.deltaY < 0 ? 1.2 : 1/1.2), px, py); }, {passive:false});
  return {C, load, close, frame: () => $c("camFrame"), play: () => $c("camPlay")};
}
const CAMS = [makeCam("", "ov2_cam_view"), makeCam("2", "ov2_cam_view2")];
const CAM = CAMS[0].C;
function camLoad(){ CAMS.forEach(c => c.load()); }
function camClose(){ CAMS.forEach(c => c.close()); }

// Avís «Toca per veure-la»: amb zoom, el ▶ del reproductor pot quedar fora de la vista. L'avís deixa passar el toc (no el bloqueja)
// i s'amaga quan detectem que s'ha tocat dins el vídeo (la finestra perd el focus i el focus passa a l'iframe).
addEventListener("blur", () => setTimeout(() => { CAMS.forEach(c => { if(document.activeElement === c.frame()) c.play().hidden = true; }); }, 0));
