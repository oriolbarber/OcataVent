"use strict";
/* ============ Ocata Vent · mapa del vent amb taula d'hores lliscant (estil Windy) ============ */
const WM_BEACH = LOC.wm;      // punt fix: la platja de la ubicació triada
const WM_ZOOM = 13;
const WM_H0 = 6, WM_H1 = 22;             // hores que es mostren cada dia
const WM_GAP = 40;                       // separació mínima (°) entre les dues etiquetes perquè no es tapin
// Colors: el mateix codi de 3 colors de tota l'app (verd / taronja / vermell segons l'embarcació triada)
const kv = k => k ? `var(--${k})` : "var(--muted)";
let wmMap = null, wmPin = null, wmSel = null, wmTiles = null, wmFx = null, wmZoomC = null;
const wmAng = {w: null, v: null};        // angle acumulat de cada etiqueta (per girar sempre pel camí curt)

function wmKeys(){
  const out = [];
  (DATA?.daily?.time || []).forEach(date => { for(let h = WM_H0; h <= WM_H1; h++){ const k = hourKey(date, h); if(DATA.hours[k]) out.push({k, date, h}); } });
  return out;
}
function wmArrow(deg, size, color){
  if(deg == null) return "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" style="flex:none"><g transform="rotate(${norm(deg + 180)} 10 10)"><path d="M10 1.5 L16 17 L10 13 L4 17 Z" fill="${color || "currentColor"}"/></g></svg>`;
}
// Mapa estàtic: sense arrossegar ni fer zoom, perquè el dit faci desplaçar l'app
function wmEnsureMap(){
  const el = $("wmMap"); if(!el) return false;
  if(!window.L){ el.innerHTML = `<div class="empty">No s'ha pogut carregar el mapa.</div>`; return false; }
  if(wmMap) return true;
  wmMap = L.map(el, {zoomControl:false, attributionControl:true, dragging:false, touchZoom:false, doubleClickZoom:false,
    scrollWheelZoom:false, boxZoom:false, keyboard:false, tap:false, zoomSnap:0.25, inertia:false}).setView(WM_BEACH, WM_ZOOM);
  wmMap.attributionControl.setPrefix(false);
  // crossOrigin: el mapa maximitzat llegeix els píxels de les rajoles per saber on és el mar (onades)
  wmTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:16, className:"base-tiles", attribution:"© OpenStreetMap", crossOrigin:"anonymous"}).addTo(wmMap);
  wmPin = L.marker(WM_BEACH, {interactive:false, keyboard:false, icon: L.divIcon({className:"wm-pin", iconSize:[0, 0], html:
    `<div class="wm-pivot"><div class="wm-flag wave" data-f="v"><span class="wm-txt"></span></div><div class="wm-flag wind" data-f="w"><span class="wm-txt"></span></div><i class="wm-dot"></i></div>`})}).addTo(wmMap);
  new ResizeObserver(() => { wmMap.invalidateSize(false); if(!wmFull()) wmMap.setView(WM_BEACH, WM_ZOOM, {animate:false}); if(wmFx) wmFx.size(); }).observe(el);
  return true;
}
// Gira cap al nou angle pel camí més curt (sense voltes de 300°)
function wmTurn(key, target){
  const prev = wmAng[key];
  wmAng[key] = prev == null ? target : prev + ((((target - prev) % 360) + 540) % 360 - 180);
  return wmAng[key];
}
function wmFlag(key, dir, html, bg, fg, off){
  const f = wmPin?.getElement()?.querySelector(`[data-f="${key}"]`); if(!f) return;
  if(dir == null){ f.hidden = true; return; }
  f.hidden = false;
  const a = wmTurn(key, dir - 90);                     // l'etiqueta surt cap a on ve el vent / l'onada i la punta toca el punt
  const n = ((a % 360) + 360) % 360, flip = n > 90 && n < 270;   // si quedaria cap per avall, el text es gira
  f.style.setProperty("--a", a + "deg");
  f.style.setProperty("--bg", bg); f.style.setProperty("--fg", fg); f.style.setProperty("--off", (off || 0) + "px");
  f.classList.toggle("flip", flip);
  f.querySelector(".wm-txt").innerHTML = `<span class="wm-lbl">${html}</span>`;
}
function wmShow(k, scroll){
  if(!DATA || !DATA.hours[k]) return;
  wmSel = k;
  const [date, hh] = [k.slice(0, 10), +k.slice(11, 13)];
  const p = hourAt(date, hh) || DATA.hours[k];
  const d = new Date(date + "T12:00:00");
  // només el dia: l'hora, el veredicte i la font ja surten al requadre de sota
  const td = new Date(), tm = new Date(Date.now() + 864e5), iso = x => `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
  const rel = date === iso(td) ? "Avui" : date === iso(tm) ? "Demà" : DAYS_L[d.getDay()];
  $("wmCap").textContent = `${rel}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const c = crit[act], lw = lvWind(p.wind, c), lg = lvGust(p.gust, c), lo = lvWave(p.wave, c), v = verdict(scoreHour(p, c));
  $("wmNow").innerHTML = `<span><span class="tag k-${v.k}"><span class="vd"></span>${v.t}</span></span>
    <span>Vent ${windName(p.dir)} ${r0(p.dir)}° · ${lvTxt(lw, r1(p.wind)+" kn")} · ratxa ${lvTxt(lg, r0(p.gust))}</span>
    <span>Onada ${p.wdir != null ? windName(p.wdir) + " " + r0(p.wdir) + "° · " : ""}${lvTxt(lo, r1(p.wave)+" m")}${p.hmax != null ? ` (màx ${p.hmaxE ? "≈" : ""}${r1(p.hmax)})` : ""} · ${r0(p.tp ?? p.per)} s${p.wobs ? " · boia" : ""}</span>`;
  if(wmEnsureMap()){
    // separa una mica les etiquetes si vent i onada vénen gairebé del mateix lloc
    let dw = p.dir, dv = p.wave != null ? p.wdir : null, offW = 0, offV = 0;
    if(dw != null && dv != null){
      const diff = ((dv - dw + 540) % 360) - 180;
      // quasi la mateixa direcció: les dues etiquetes en paral·lel, una al costat de l'altra (com a Windy)
      if(Math.abs(diff) < WM_GAP){ const mid = dw + diff / 2; dw = dv = mid; offW = -15; offV = 14; }
    }
    wmFlag("w", dw, `<b>${r1(p.wind)}</b> kn<small>R${r0(p.gust)}</small>`, kv(lw), "var(--on-k)", offW);
    wmFlag("v", dv, `<b>${r1(p.wave)}</b> m<small>${r0(p.tp ?? p.per)} s</small>`, kv(lo), "var(--on-k)", offV);
  }
  if(wmFx) wmFx.kick();
  if(wmFull()) wmLegend();
  tlSync(k, scroll);
  if(window.mmSel) mmSel(k);
}
window.wmSelect = (k, scroll) => { if(DATA && DATA.hours[k] && document.querySelector(`#wmTl [data-tk="${k}"]`)) wmShow(k, scroll); };
function renderWindMap(){
  const host = $("windMap"); if(!host || !DATA) return;
  const keys = wmKeys(); if(!keys.length){ host.hidden = true; return; }
  host.hidden = false;
  const nk = nowKey(), def = keys.find(x => x.k === nk)?.k || keys.find(x => x.k > nk)?.k || keys[0].k;
  const want = (window.SEL_K && window.SEL_K()) || wmSel, keep = want && keys.some(x => x.k === want) ? want : def;
  tlRender();
  wmShow(keep, true);
  setTimeout(() => { if(wmMap){ wmMap.invalidateSize(false); if(!wmFull()) wmMap.setView(WM_BEACH, WM_ZOOM, {animate:false}); } }, 0);
}
window.addEventListener("mm-theme", () => wmSel && wmShow(wmSel, false));

/* ---------- pantalla completa: gràfic o mapa (amb el vent i les onades pintats, llegenda i franja d'hores de tota la previsió) ---------- */
const wmCard = () => $("windMap");
const wmFull = () => !!wmCard()?.classList.contains("full");
function wmPoint(){
  if(!DATA || !wmSel) return null;
  const p = hourAt(wmSel.slice(0, 10), +wmSel.slice(11, 13)) || DATA.hours[wmSel]; if(!p) return null;
  return {wind:p.wind, dir:p.dir, wave:p.wave, wdir:p.wdir, per:p.tp ?? p.per};
}
const LG_W = `<svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true"><path d="M1 4h12M6 9h15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity=".7"/></svg>`;
const LG_V = `<svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true"><path d="M3 2q8 4 0 9M12 2q8 4 0 9" fill="none" stroke="#0a5abe" stroke-width="2" stroke-linecap="round"/></svg>`;
function wmLegend(){
  const el = $("wmLeg"); if(!el) return;
  el.innerHTML = `<span>${LG_W}Vent: les ratlles van cap on bufa (més ràpides, més vent)</span>
    <span>${LG_V}Onades: crestes sobre el mar, cap on avancen</span>
    <span class="ks"><span><i class="vd" style="background:var(--ideal)"></i>Bo</span><span><i class="vd" style="background:var(--marg)"></i>Limitat</span><span><i class="vd" style="background:var(--no)"></i>No recomanat</span></span>
    <span>Etiquetes: vent (kn, R = ratxa) i onada (m, període) per a ${esc(DEFAULTS[act]?.name || "")}</span>`;
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-wmleg]"); const leg = $("wmLeg");
  if(b){ const on = !leg.classList.contains("open"); leg.classList.toggle("open", on); b.setAttribute("aria-expanded", String(on)); return; }
  if(leg && leg.classList.contains("open") && !e.target.closest(".wm-leg")){ leg.classList.remove("open"); document.querySelector("[data-wmleg]")?.setAttribute("aria-expanded", "false"); } });

/* ---------- línia del temps (sota el mapa i a pantalla completa): xips de dia + franja d'hores amb el color del veredicte; l'agulla del mig marca l'hora ---------- */
const TL_W = 22;                         // amplada de cada hora (px), igual que a l'estil .tl-h
let tlProg = 0, tlRaf = 0;
const dayLbl = (date, i) => { const d = new Date(date + "T12:00:00"); return i === 0 && date === todayDate() ? "Avui" : DAYS_S[d.getDay()] + " " + d.getDate(); };
function tlRender(){
  const el = $("wmTl"); if(!el || !DATA) return;
  const keys = wmKeys(), c = crit[act], days = [];
  keys.forEach(x => { if(!days.length || days[days.length - 1] !== x.date) days.push(x.date); });
  el.innerHTML = `<div class="tl-row"><div class="tl-days">${days.map((d, i) => `<button type="button" data-tld="${d}" aria-pressed="false">${dayLbl(d, i)}</button>`).join("")}</div><button type="button" class="tl-x" data-wmclose aria-label="Tanca la pantalla completa">✕</button></div>
    <div class="tl-box"><div class="tl-track" id="tlTrack"><div class="tl-strip">${keys.map((x, i) => {
      const p = hourAt(x.date, x.h) || DATA.hours[x.k], v = verdict(scoreHour(p, c)), hg = Math.round(18 + Math.min(1, (p.wind || 0) / 25) * 82);
      return `<span class="tl-h${i && keys[i - 1].date !== x.date ? " d0" : ""}" data-tk="${x.k}" title="${x.h} h · ${v.t}"><i style="height:calc((100% - 14px) * ${hg / 100});background:var(--${v.k})"></i><b${x.h % 3 === 0 ? ' class="m3"' : ""}>${x.h}</b></span>`; }).join("")}</div></div><div class="tl-needle"></div></div>`;
  $("tlTrack").addEventListener("scroll", tlOnScroll, {passive:true});
}
function tlSync(k, center){
  const tr = $("tlTrack"); if(!tr) return;
  tr.querySelectorAll(".tl-h.sel").forEach(x => x.classList.remove("sel"));
  const h = tr.querySelector(`[data-tk="${k}"]`); if(h) h.classList.add("sel");
  const date = k.slice(0, 10);
  document.querySelectorAll("#wmTl [data-tld]").forEach(b => { const on = b.dataset.tld === date; b.setAttribute("aria-pressed", String(on));
    if(on && center){ const row = b.parentElement; row.scrollTo({left: b.offsetLeft - row.clientWidth / 2 + b.offsetWidth / 2}); } });   // sense scrollIntoView: no ha de moure la pàgina
  if(center && h){ tlProg = Date.now(); tr.scrollTo({left: h.offsetLeft - tr.clientWidth / 2 + TL_W / 2, behavior: "auto"}); }
}
// en lliscar, l'hora que queda sota l'agulla passa a ser la triada (mapa o gràfic s'actualitzen al moment)
function tlOnScroll(){
  if(Date.now() - tlProg < 400 || tlRaf) return;
  tlRaf = requestAnimationFrame(() => { tlRaf = 0; const tr = $("tlTrack"); if(!tr) return;
    const hs = tr.querySelectorAll(".tl-h"), i = Math.max(0, Math.min(hs.length - 1, Math.round(tr.scrollLeft / TL_W)));
    const k = hs[i]?.dataset.tk; if(k && k !== wmSel) wmShow(k, false); });
}
document.addEventListener("click", e => {
  const h = e.target.closest && e.target.closest("#wmTl [data-tk]"); if(h){ wmShow(h.dataset.tk, true); return; }
  const d = e.target.closest && e.target.closest("#wmTl [data-tld]"); if(!d) return;
  const keys = wmKeys().filter(x => x.date === d.dataset.tld), hh = wmSel ? +wmSel.slice(11, 13) : 12;
  const x = keys.find(y => y.h === hh) || keys.find(y => y.h === 12) || keys[0]; if(x) wmShow(x.k, true);
});
// Gràfic: en horitzontal (APK: connector natiu ScreenOrientation; navegador: pantalla completa + bloqueig d'orientació; a l'iPhone es queda vertical).
// Mapa: pantalla completa sense bloquejar l'orientació, segueix el gir del mòbil (decisió de l'Oriol: el vol poder veure en vertical).
async function wmLand(on, land = true){
  const SO = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.ScreenOrientation;
  try{
    if(SO){ await (on && land ? SO.lock({orientation:"landscape"}) : SO.unlock()); return; }
    if(on){
      if(!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({navigationUI:"hide"});
      if(land && screen.orientation && screen.orientation.lock) await screen.orientation.lock("landscape");
    } else {
      try{ screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); }catch(e){}
      if(document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    }
  }catch(e){}
}
// si el navegador surt de la pantalla completa (botó enrere), també es tanca la vista
document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && wmFull()){ if(history.state && history.state.wmFull) history.back(); else wmClose(); } });
function wmOpen(kind){
  const c = wmCard(); if(!c || wmFull()) return;
  c.classList.add("full", "full-" + kind); document.body.classList.add("wm-open");
  try{ history.pushState({wmFull:1}, ""); }catch(e){}
  wmLand(true, kind === "chart"); tlRender();
  if(kind === "chart"){ setTimeout(() => { renderDayChart(); applySel(); }, 0); }
  else if(wmEnsureMap()){
    // a pantalla completa el mapa es pot moure i ampliar amb els dits
    wmMap.dragging.enable(); wmMap.touchZoom.enable(); wmMap.doubleClickZoom.enable();
    if(!wmZoomC) wmZoomC = L.control.zoom({position:"topright"}); wmZoomC.addTo(wmMap);
    if(!wmFx) wmFx = OV_FX(wmMap, wmTiles, {pane:"wmWind", get: wmPoint, active: () => wmFull() && wmCard().classList.contains("full-map") && document.visibilityState === "visible"});
    wmLegend();
    setTimeout(() => { wmMap.invalidateSize(false); wmMap.setView(WM_BEACH, WM_ZOOM, {animate:false}); wmFx.size(); wmFx.buildMask(); wmFx.reset(); }, 0);
  }
  setTimeout(() => wmSel && wmShow(wmSel, true), 50);
}
function wmClose(){
  const c = wmCard(); if(!c || !wmFull()) return;
  const wasChart = c.classList.contains("full-chart");
  c.classList.remove("full", "full-chart", "full-map"); document.body.classList.remove("wm-open");
  $("wmLeg")?.classList.remove("open"); wmLand(false);
  if(wmMap){ wmMap.dragging.disable(); wmMap.touchZoom.disable(); wmMap.doubleClickZoom.disable(); if(wmZoomC) wmZoomC.remove();
    if(wmFx) wmFx.stop(); setTimeout(() => { wmMap.invalidateSize(false); wmMap.setView(WM_BEACH, WM_ZOOM, {animate:false}); }, 0); }
  if(wasChart) setTimeout(() => { renderDayChart(); applySel(); }, 0);
  setTimeout(() => wmSel && wmShow(wmSel, true), 50);
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-wmfull], [data-wmclose]"); if(!b) return;
  if(b.dataset.wmfull) wmOpen(b.dataset.wmfull);
  else if(history.state && history.state.wmFull) history.back(); else wmClose();
});
// el botó enrere d'Android tanca la pantalla completa
window.addEventListener("popstate", () => { if(wmFull()) wmClose(); });
window.addEventListener("mm-view", () => { if(wmFull()) wmClose(); });
document.addEventListener("visibilitychange", () => { if(wmFx && document.visibilityState === "visible") wmFx.kick(); });
// en girar el mòbil o canviar la mida, el gràfic es torna a dibuixar a la mida nova
window.addEventListener("resize", () => { if(!wmFull()) return; clearTimeout(wmOpen.t); wmOpen.t = setTimeout(() => {
  if(wmCard().classList.contains("full-chart")){ renderDayChart(); applySel(); }
  if(wmCard().classList.contains("full-map") && wmMap){ wmMap.invalidateSize(false); if(wmFx){ wmFx.size(); wmFx.buildMask(); } }
  if(wmSel) tlSync(wmSel, true); }, 200); });
window.addEventListener("mm-theme", () => { if(wmFx) wmFx.reset(); });
// el gràfic maximitzat es torna a dibuixar quan canvia l'espai lliure (la lectura s'omple després, el mòbil gira…)
let wmCH = 0;
new ResizeObserver(() => { const c = wmCard(), cw = $("dayChart")?.parentElement; if(!c || !cw || !c.classList.contains("full-chart")) return;
  const h = Math.round(cw.clientHeight + cw.clientWidth * 1000); if(Math.abs(h - wmCH) < 4) return; wmCH = h;
  clearTimeout(wmOpen.r); wmOpen.r = setTimeout(() => { renderDayChart(); applySel(); }, 60); }).observe(document.querySelector("#windMap .wm-cwrap"));
window.renderWindMap = renderWindMap;
if(DATA) renderWindMap();
