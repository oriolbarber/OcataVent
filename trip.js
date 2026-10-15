"use strict";
/* ============ Mar del Masnou · registre de sortides (GPS + estació) ============ */
const KN = 1.943844;          // m/s → nusos
const NM = 1852;              // metres per milla nàutica
const HOME = LOC.home;
const SPEED_COLORS = ["#5aaeff","#3cd0ff","#34e39a","#ffc94a","#ff6476"];
const SPEED_BINS = [2,4,6,8];  // kn
const POS = [
  {k:"cenyida", t:"Cenyida", max:60},
  {k:"traves",  t:"Través",  max:110},
  {k:"llarg",   t:"Llarg",   max:150},
  {k:"popa",    t:"Popa",    max:181}
];

/* ---------- emmagatzematge (IndexedDB, amb localStorage si falla) ---------- */
const DB = {
  _db:null,
  open(){
    if(this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      try{
        const rq = indexedDB.open("ocatavent2", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("trips", {keyPath:"id"});
        rq.onsuccess = () => { this._db = rq.result; res(this._db); };
        rq.onerror = () => rej(rq.error);
      }catch(e){ rej(e); }
    });
  },
  async tx(mode, fn){
    try{ const db = await this.open();
      return await new Promise((res, rej) => { const t = db.transaction("trips", mode), s = t.objectStore("trips"); const r = fn(s);
        t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
    }catch(e){ return this.fallback(mode, fn); }
  },
  fallback(mode, fn){ // magatzem mínim sobre localStorage
    const all = store.get("ov2_trips") || [];
    const s = { put:t => { const i = all.findIndex(x=>x.id===t.id); i>=0 ? all[i]=t : all.push(t); store.set("ov2_trips", all); return {}; },
      getAll:() => ({result:all}), get:id => ({result:all.find(x=>x.id===id)}), delete:id => { store.set("ov2_trips", all.filter(x=>x.id!==id)); return {}; } };
    const r = fn(s); return r && r.result;
  },
  put(t){ return this.tx("readwrite", s => s.put(t)); },
  all(){ return this.tx("readonly", s => s.getAll()); },
  get(id){ return this.tx("readonly", s => s.get(id)); },
  del(id){ return this.tx("readwrite", s => s.delete(id)); }
};

/* ---------- geometria ---------- */
const rad = d => d*Math.PI/180;
function hav(a, b){ const R = 6371000, dLat = rad(b.lat-a.lat), dLon = rad(b.lon-a.lon);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
function bearing(a, b){ const y = Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)), x = Math.cos(rad(a.lat))*Math.sin(rad(b.lat)) - Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  return norm(Math.atan2(y,x)*180/Math.PI); }
const twaOf = (course, windFrom) => Math.abs(((course - windFrom + 540) % 360) - 180);
const posOf = twa => POS.find(p => twa < p.max);
const fmtDur = ms => { const s = Math.max(0, Math.round(ms/1000)); return pad(Math.floor(s/3600))+":"+pad(Math.floor(s/60)%60)+":"+pad(s%60); };
const fmtDurShort = ms => { const m = Math.round(ms/60000); return m >= 60 ? Math.floor(m/60)+" h "+pad(m%60)+" min" : m+" min"; };
const COMPASS16 = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
const cogName = d => d==null ? "–" : COMPASS16[Math.round(norm(d)/22.5)%16];

/* ---------- estat de la sortida ---------- */
let ecoTimer = null, ecoVisible = false;
let LIVE = null, watchId = null, wakeLock = null, tTimer = null, tWind = null, tSave = null, liveMap = null, liveLine = null, liveDot = null;

function windNear(trip, t){
  let best = null, bd = Infinity;
  for(const w of trip.wind){ const d = Math.abs(w.t - t); if(d < bd){ bd = d; best = w; } }
  if(best && bd < 20*60*1000) return best;
  const f = forecastAt(t); return f ? {t, wind:f.wind, gust:f.gust, dir:f.dir, temp:f.temp, src:"model"} : null;
}

function saveLive(){ if(LIVE && !store.set("ov2_live", LIVE)) $("liveGps").textContent = "Memòria plena: no es pot desar la ruta"; }

async function sampleWind(){
  if(!LIVE) return;
  await loadStation();
  const last = LIVE.wind[LIVE.wind.length-1];
  if(stFresh()){ if(!last || last.t !== ST.at) LIVE.wind.push({t:ST.at, wind:ST.wind, gust:ST.gust, dir:ST.dir, temp:ST.temp, src:"estació"}); }
  else { const f = forecastAt(Date.now()); if(f && (!last || Date.now()-last.t > 10*60*1000)) LIVE.wind.push({t:Date.now(), wind:f.wind, gust:f.gust, dir:f.dir, temp:f.temp, src:"model"}); }
  saveLive(); renderLive();
}

// Velocitat màxima creïble per embarcació (kn): per sobre, un punt aïllat es considera un error del GPS
const MAX_KN = act => act === "windsurf" ? 50 : 35;
let jumpRej = 0;
function onPos(pos){
  if(!LIVE) return;
  const c = pos.coords;
  const gps = $("liveGps");
  if(c.accuracy > 60){ gps.textContent = "GPS amb poca precisió (±"+Math.round(c.accuracy)+" m)"; return; }
  gps.textContent = "GPS ±"+Math.round(c.accuracy)+" m";
  const p = {t:pos.timestamp || Date.now(), lat:+c.latitude.toFixed(6), lon:+c.longitude.toFixed(6), acc:Math.round(c.accuracy),
    sog: (c.speed!=null && !isNaN(c.speed)) ? +(c.speed*KN).toFixed(2) : null, cog: (c.heading!=null && !isNaN(c.heading)) ? Math.round(c.heading) : null};
  const last = LIVE.pts[LIVE.pts.length-1];
  if(last){
    const dt = (p.t - last.t)/1000; if(dt < 3) return;
    const d = hav(last, p), calc = d/dt*KN;
    // Salt de GPS: un punt sol que implicaria una velocitat impossible es descarta.
    // Però si es repeteix 3 vegades seguides és que realment anem ràpid (o el punt anterior era el dolent):
    // s'accepta i es continua, perquè la gravació no es pot quedar mai encallada.
    if(calc > MAX_KN(LIVE.act) && jumpRej < 2){ jumpRej++; gps.textContent = "GPS: punt descartat (salt de " + Math.round(calc) + " kn)"; return; }
    jumpRej = 0;
    if(p.sog == null) p.sog = +calc.toFixed(2);
    if(p.cog == null && d > 4) p.cog = Math.round(bearing(last, p));
  }
  LIVE.pts.push(p);
  window.OV_CLUB?.tripPos(LIVE, p);
  if(last && (p.t - last.t)/1000 > GAP_S){ saveLive(); liveGapNote(); }
  if(LIVE.pts.length % 6 === 0) saveLive();
  renderLive();
}
function onPosErr(err){
  const msg = err.code === 1 ? "Has denegat l'accés a la ubicació. Activa-la per a aquesta app a la configuració del navegador." :
    err.code === 2 ? "No es troba senyal GPS. Prova a l'aire lliure." : "El GPS tarda a respondre…";
  $("liveGps").textContent = msg;
  if(err.code === 1 && LIVE && !LIVE.pts.length){ $("tripErr").textContent = msg; $("tripErr").hidden = false; }
}
async function keepAwake(){
  if(window.OV_NATIVE){ window.OV_NATIVE.keepAwake?.(true); return; }   // app: pantalla encesa amb el connector natiu
  try{ if("wakeLock" in navigator && document.visibilityState === "visible" && (!wakeLock || wakeLock.released)){
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { if(LIVE && document.visibilityState === "visible") setTimeout(keepAwake, 500); });
  } }catch(e){}
}
// Avís quan tornem a l'app després d'una estona amb la pantalla apagada o en una altra app
let hiddenAt = 0;
function liveGapNote(){
  if(!LIVE) return;
  const g = gapsOf(LIVE), tot = g.reduce((a, x) => a + (x.to - x.from), 0);
  const el = $("liveGap"); if(!el) return;
  if(!g.length && !hiddenAt){ el.hidden = true; return; }
  const last = g[g.length - 1], hm = t => new Date(t).toTimeString().slice(0, 5);
  const fixTxt = window.OV_NATIVE ? "Comprova que l'app té la ubicació «Permet sempre» i la bateria «Sense restriccions»."
    : `No apaguis la pantalla amb el botó: deixa l'app oberta${LIVE.eco ? " amb la pantalla negra d'estalvi" : " (o activa el mode estalvi)"}.`;
  el.innerHTML = g.length ? `⚠ Ruta incompleta: ${g.length} ${g.length === 1 ? "tram" : "trams"} sense GPS (${fmtDurShort(tot)}), l'últim de ${hm(last.from)} a ${hm(last.to)}. ${fixTxt}` : "";
  el.hidden = !g.length;
}
function startWatch(){
  if(window.OV_NATIVE){   // app Android: GPS en segon pla (continua amb la pantalla apagada)
    keepAwake();
    clearInterval(tTimer); clearInterval(ecoTimer);
    window.OV_NATIVE.watch(onPos, onPosErr).catch(e => onPosErr({code:2, message:String(e && e.message || e)}));
    tTimer = setInterval(() => { if(LIVE){ $("liveTimer").textContent = fmtDur(Date.now()-LIVE.start); LIVE.eco ? renderLive() : rideTime(); } }, LIVE.eco ? 20000 : 1000);
    if(LIVE.eco) setEco();
    clearInterval(tWind); tWind = setInterval(sampleWind, (LIVE.eco ? 5 : 1)*60*1000); sampleWind();
    clearInterval(tSave); tSave = setInterval(saveLive, 15000);
    return true;
  }
  if(!("geolocation" in navigator)){ $("tripErr").textContent = "Aquest navegador no té accés al GPS."; $("tripErr").hidden = false; return false; }
  keepAwake();
  clearInterval(tTimer); clearInterval(ecoTimer);
  if(LIVE.eco){
    // Estalvi: una lectura de GPS cada 20 s (el xip pot reposar entre lectures) i res més en marxa
    const fix = () => navigator.geolocation.getCurrentPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:5000, timeout:15000});
    fix(); ecoTimer = setInterval(fix, 20000);
    tTimer = setInterval(() => { if(LIVE){ $("liveTimer").textContent = fmtDur(Date.now()-LIVE.start); renderLive(); } }, 20000);
    setEco();
  } else {
    watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:0, timeout:30000});
    tTimer = setInterval(() => { if(LIVE){ $("liveTimer").textContent = fmtDur(Date.now()-LIVE.start); rideTime(); } }, 1000);
  }
  clearInterval(tWind); tWind = setInterval(sampleWind, (LIVE.eco ? 5 : 1)*60*1000); sampleWind();
  clearInterval(tSave); tSave = setInterval(saveLive, 15000);
  return true;
}
function stopWatch(){
  if(window.OV_NATIVE) window.OV_NATIVE.clear();
  if(watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null;
  clearInterval(ecoTimer); ecoTimer = null;
  clearInterval(tTimer); clearInterval(tWind); clearInterval(tSave);
  try{ wakeLock && wakeLock.release(); }catch(e){} wakeLock = null;
  window.OV_NATIVE?.keepAwake?.(false); sleepSet(false);
}
function setRecUI(){
  const on = !!LIVE;
  $("recDot").hidden = !on;
  $("tripIdle").hidden = on; $("tripLive").hidden = !on;
  $("ctaLabel").textContent = on ? "Sortida en curs · " + fmtDurShort(Date.now()-LIVE.start) : "Inicia una sortida";
  if(on){ $("liveAct").textContent = DEFAULTS[LIVE.act]?.name || ""; liveGapNote(); }
}

function startTrip(){
  $("tripErr").hidden = true;
  const eco = false;   // sempre comença en mode normal; l'estalvi es tria dins la pantalla de ruta
  const t0 = Date.now();
  LIVE = {id: t0, name: $("tripName").value.trim(), act, start: t0, pts: [], wind: [], eco, station: stKey};
  if(!startWatch()){ LIVE = null; return; }
  saveLive(); setRecUI(); showRide(true);
  window.OV_CLUB?.tripStart(LIVE);   // presència «a l'aigua» (només si el soci ho té activat)
  gearCheck();
}
/* ---------- recordatori de material en començar (els objectes es tornen taronja un rere l'altre com a compte enrere; es tanca sol als 5 s o tocant-lo; la gravació ja ha començat) ---------- */
const KIT_IC = {   // dibuixades a l'editor «Icones Ocata Vent» (data/icones.json)
  armilla:`<path d="M8 3L5 5L5 20L10 20L10 12L14 12L14 20L19 20L19 5L16 3L14 6L10 6Z"/><path d="M10 12L10 9L14 9L14 12"/><path d="M5 17.5L19 17.5"/><path d="M5.5 12L19 12"/><path d="M12 9L12 6"/><path d="M8 12L16 12"/><path d="M4.5 20L4.5 5.5"/><path d="M13.5 9.5L13.5 20"/><path d="M5.5 18L19 18"/>`,
  emissora:`<path d="M9 7L15 7C15.35 7 15.7 7.09 16 7.27C16.3 7.44 16.56 7.7 16.73 8C16.91 8.3 17 8.65 17 9L17 19C17 19.35 16.91 19.7 16.73 20C16.56 20.3 16.3 20.56 16 20.73C15.7 20.91 15.35 21 15 21L9 21C8.65 21 8.3 20.91 8 20.73C7.7 20.56 7.44 20.3 7.27 20C7.09 19.7 7 19.35 7 19L7 9C7 8.65 7.09 8.3 7.27 8C7.44 7.7 7.7 7.44 8 7.27C8.3 7.09 8.65 7 9 7Z"/><path d="M10 7L10 0M10 10L14 10M10 12L14 12M10 18L10 18"/><path d="M12.5 18L12.5 18"/><path d="M12.5 15.5L12.5 15.5"/><path d="M10 15.5L10 15.5"/><path d="M6 12.5L6 11"/>`,
  navalla:`<path d="M4.5 14L14.5 14C14.94 14 15.37 14.12 15.75 14.33C16.13 14.55 16.45 14.87 16.67 15.25C16.88 15.63 17 16.06 17 16.5L17 16.5C17 16.94 16.88 17.37 16.67 17.75C16.45 18.13 16.13 18.45 15.75 18.67C15.37 18.88 14.94 19 14.5 19L4.5 19C4.06 19 3.63 18.88 3.25 18.67C2.87 18.45 2.55 18.13 2.33 17.75C2.12 17.37 2 16.94 2 16.5L2 16.5C2 16.06 2.12 15.63 2.33 15.25C2.55 14.87 2.87 14.55 3.25 14.33C3.63 14.12 4.06 14 4.5 14Z"/><path d="M17.5 15.5L21.5 2.5C17.5 1.5 15 9.5 14.5 14Z"/><path d="M15.5 10.5L18 4"/><path d="M14.5 16.5L14.5 16.5"/>`,
  xiulet:`<path d="M15 14C15 15.05 14.72 16.09 14.2 17C13.67 17.91 12.91 18.67 12 19.2C11.09 19.72 10.05 20 9 20C7.95 20 6.91 19.72 6 19.2C5.09 18.67 4.33 17.91 3.8 17C3.28 16.09 3 15.05 3 14C3 12.95 3.28 11.91 3.8 11C4.33 10.09 5.09 9.33 6 8.8C6.91 8.28 7.95 8 9 8C10.05 8 11.09 8.28 12 8.8C12.91 9.33 13.67 10.09 14.2 11C14.72 11.91 15 12.95 15 14Z"/><path d="M13 9.5L11 8L22 8L22 13L15 13"/><path d="M3 9.5L5 7.5"/>`,
  aigua:`<path d="M10 2L14 2L14 5L16 8L16 20C16 20.35 15.91 20.7 15.73 21C15.56 21.3 15.3 21.56 15 21.73C14.7 21.91 14.35 22 14 22L10 22C9.65 22 9.3 21.91 9 21.73C8.7 21.56 8.44 21.3 8.27 21C8.09 20.7 8 20.35 8 20L8 8L10 5Z"/><path d="M8 12L16 12"/>`,
  abric:`<path d="M8 3L16 3L20 6L22 14L19 15L18 12L18 21L6 21L6 12L5 15L2 14L4 6Z"/><path d="M8 3L12 7L16 3M12 7L12 21"/>`,
  guants:`<path d="M8 21L8 16L4.6 11.4C4.43 11.17 4.33 10.9 4.3 10.62C4.27 10.34 4.31 10.06 4.43 9.8C4.54 9.54 4.72 9.32 4.95 9.15C5.18 8.98 5.45 8.88 5.73 8.85C6.01 8.82 6.29 8.86 6.55 8.98C6.81 9.09 7.03 9.27 7.2 9.5L9 11.5L9 5C9 4.74 9.07 4.48 9.2 4.25C9.33 4.02 9.52 3.83 9.75 3.7C9.98 3.57 10.24 3.5 10.5 3.5C10.76 3.5 11.02 3.57 11.25 3.7C11.48 3.83 11.67 4.02 11.8 4.25C11.93 4.48 12 4.74 12 5L12 10L12 3.5C12 3.24 12.07 2.98 12.2 2.75C12.33 2.52 12.52 2.33 12.75 2.2C12.98 2.07 13.24 2 13.5 2C13.76 2 14.02 2.07 14.25 2.2C14.48 2.33 14.67 2.52 14.8 2.75C14.93 2.98 15 3.24 15 3.5L15 10L15 5C15 4.74 15.07 4.48 15.2 4.25C15.33 4.02 15.52 3.83 15.75 3.7C15.98 3.57 16.24 3.5 16.5 3.5C16.76 3.5 17.02 3.57 17.25 3.7C17.48 3.83 17.67 4.02 17.8 4.25C17.93 4.48 18 4.74 18 5L18 14C17.99 14.89 17.8 15.77 17.46 16.59C17.12 17.41 16.62 18.16 16 18.8L16 21"/>`,
  mobil:`<path d="M8.5 2L15.5 2C15.94 2 16.37 2.12 16.75 2.33C17.13 2.55 17.45 2.87 17.67 3.25C17.88 3.63 18 4.06 18 4.5L18 19.5C18 19.94 17.88 20.37 17.67 20.75C17.45 21.13 17.13 21.45 16.75 21.67C16.37 21.88 15.94 22 15.5 22L8.5 22C8.06 22 7.63 21.88 7.25 21.67C6.87 21.45 6.55 21.13 6.33 20.75C6.12 20.37 6 19.94 6 19.5L6 4.5C6 4.06 6.12 3.63 6.33 3.25C6.55 2.87 6.87 2.55 7.25 2.33C7.63 2.12 8.06 2 8.5 2Z"/><path d="M9.5 4L14 4"/><path d="M12 12L10 15.5"/><path d="M11.5 18.5L12.5 18.5"/><path d="M10 17L11 18"/><path d="M10 15.5L10 16.5"/><path d="M12 12L14 15.5"/><path d="M13 18.5L14 16.5"/><path d="M14 16.5L14 15.5"/>`,
  bossa:`<path d="M6.75 2.5L17.25 2.5C17.56 2.5 17.86 2.58 18.12 2.73C18.39 2.89 18.61 3.11 18.77 3.38C18.92 3.64 19 3.94 19 4.25L19 4.25C19 4.56 18.92 4.86 18.77 5.12C18.61 5.39 18.39 5.61 18.12 5.77C17.86 5.92 17.56 6 17.25 6L6.75 6C6.44 6 6.14 5.92 5.88 5.77C5.61 5.61 5.39 5.39 5.23 5.13C5.08 4.86 5 4.56 5 4.25L5 4.25C5 3.94 5.08 3.64 5.23 3.38C5.39 3.11 5.61 2.89 5.87 2.73C6.14 2.58 6.44 2.5 6.75 2.5Z"/><path d="M5 4.2L3 4.2L2.5 8.5M19 4.2L21 4.2L21.5 19"/><path d="M5 5.5L6.5 18.5C6.5 18.94 6.62 19.37 6.83 19.75C7.05 20.13 7.37 20.45 7.75 20.67C8.13 20.88 8.56 21 9 21L15 21C15.44 21 15.87 20.88 16.25 20.67C16.63 20.45 16.95 20.13 17.17 19.75C17.38 19.37 17.5 18.94 17.5 18.5L18.5 5.5"/><path d="M12 10.5L12 15.5M9.5 13L14.5 13"/><path d="M3 4L6.5 2.5"/><path d="M17.5 2.5L21 4"/><path d="M22 21.5L22 19.5"/><path d="M20.5 19.5L20.5 21.5"/><path d="M1 10.5L3 11"/><path d="M1 9.5L3 10"/><path d="M6 4L17.5 4"/>`,
  sol:`<path d="M16 12C16 12.7 15.82 13.39 15.46 14C15.11 14.61 14.61 15.11 14 15.46C13.39 15.82 12.7 16 12 16C11.3 16 10.61 15.82 10 15.46C9.39 15.11 8.89 14.61 8.54 14C8.18 13.39 8 12.7 8 12C8 11.3 8.18 10.61 8.54 10C8.89 9.39 9.39 8.89 10 8.54C10.61 8.18 11.3 8 12 8C12.7 8 13.39 8.18 14 8.54C14.61 8.89 15.11 9.39 15.46 10C15.82 10.61 16 11.3 16 12Z"/><path d="M12 2L12 4M12 20L12 22M2 12L4 12M20 12L22 12M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9"/>`
};
const GEAR_MS = 7000;   // amb 8-9 objectes, 5 s no donaven temps de llegir-los
function gearCheck(){
  const fc = (typeof DATA !== "undefined" && DATA && DATA.now) || {}, air = stFresh() ? ST.temp : fc.temp, sea = fc.sst;
  // llista d'equipament i seguretat del club; l'abric/neoprè només quan fa fred
  const items = [["armilla", "Armilla ben ajustada"], ["navalla", "Navalla"], ["emissora", "Emissora carregada"], ["xiulet", "Xiulet a l'armilla"],
    ["aigua", "Aigua i crema solar"], ["guants", "Guants i calçat"], ["mobil", "Mòbil en funda estanca"], ["bossa", "Claus i farmaciola"]];
  if((air != null && air < 18) || (sea != null && sea < 17)) items.push(["abric", sea != null && sea < 17 ? "Neoprè o abric" : "Abric"]);
  const el = document.createElement("div"); el.className = "gear"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Abans de sortir, porta");
  el.innerHTML = `<div class="gear-box"><h2>Ho portes tot?</h2>
    <div class="gear-grid">${items.map(([k, t], i) => `<div class="gear-i" style="animation-delay:${Math.round(i * GEAR_MS / items.length)}ms"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KIT_IC[k]}</svg><b>${t}</b></div>`).join("")}</div>
    <p class="gear-n">Bona navegada! · toca per tancar</p></div>`;
  const close = () => { if(!el.isConnected) return; el.classList.add("out"); setTimeout(() => el.remove(), 250); };
  el.addEventListener("click", close);
  document.body.appendChild(el);
  setTimeout(close, GEAR_MS + 400);
}
let confirmStop = 0, confirmDiscard = 0;
async function stopTrip(){
  if(!LIVE) return;
  if(Date.now() - confirmStop > 4000){ confirmStop = Date.now(); $("stopTrip").textContent = "Toca de nou per desar"; setTimeout(() => $("stopTrip").textContent = "Atura i desa", 4000); return; }
  await finishTrip();
}
// Desa la sortida en curs sense demanar confirmació (botó confirmat o tornada a la base detectada per avisos.js)
async function finishTrip(){
  if(!LIVE) return;
  stopWatch();
  const trip = Object.assign({}, LIVE, {end: Date.now()});
  await fillStationWind(trip);
  trip.summary = summarize(trip);
  try{ await DB.put(trip); }catch(e){}
  window.OV_CLOUD?.saved(trip);
  LIVE = null; store.del("ov2_live"); $("tripName").value = ""; window.OV_CLUB?.tripEnd();
  destroyLiveMap(); setRecUI();
  go("log"); showTrip(trip.id);
}
function discardTrip(){
  if(Date.now() - confirmDiscard > 4000){ confirmDiscard = Date.now(); $("discardTrip").textContent = "Toca de nou: s'esborrarà la ruta"; setTimeout(() => $("discardTrip").textContent = "Descarta la sortida", 4000); return; }
  stopWatch(); LIVE = null; store.del("ov2_live"); destroyLiveMap(); setRecUI(); window.OV_CLUB?.tripEnd();
}

/* ---------- càlculs ---------- */
function segments(trip){
  const out = [], P = trip.pts;
  for(let i=1; i<P.length; i++){
    const a = P[i-1], b = P[i], dt = (b.t-a.t)/1000; if(dt <= 0) continue;
    const d = hav(a,b); out.push({a, b, d, dt, kn: d/dt*KN, course: bearing(a,b), t:b.t});
  }
  // velocitat suavitzada (mitjana de 3 trams) per evitar pics del GPS
  out.forEach((s,i) => { const w = out.slice(Math.max(0,i-1), i+2); const D = w.reduce((x,y)=>x+y.d,0), T = w.reduce((x,y)=>x+y.dt,0); s.smooth = T ? D/T*KN : 0; });
  return out;
}
function summarize(trip){
  const seg = segments(trip);
  let dist = 0, moving = 0, maxKn = 0, maxOff = 0;
  const pos = Object.fromEntries(POS.map(p => [p.k, {t:0, d:0}]));
  seg.forEach(s => {
    dist += s.d;
    if(s.dt <= 120 && s.kn > 0.8){ moving += s.dt; maxKn = Math.max(maxKn, s.smooth);
      const w = windNear(trip, s.t);
      if(w && w.dir!=null && s.kn > 1 && s.d > 3){ const p = posOf(twaOf(s.course, w.dir)); pos[p.k].t += s.dt; pos[p.k].d += s.d; } }
  });
  if(trip.pts.length) trip.pts.forEach(p => { maxOff = Math.max(maxOff, hav(trip.pts[0], p)); });
  const gaps = gapsOf(trip);
  const W = trip.wind.length ? trip.wind : [windNear(trip, (trip.start+(trip.end||Date.now()))/2)].filter(Boolean);
  const wv = W.map(w=>w.wind).filter(x=>x!=null), gv = W.map(w=>w.gust).filter(x=>x!=null), tv = W.map(w=>w.temp).filter(x=>x!=null);
  let sx=0, sy=0; W.forEach(w => { if(w.dir!=null && w.wind!=null){ sx += Math.sin(rad(w.dir))*w.wind; sy += Math.cos(rad(w.dir))*w.wind; } });
  return {
    dur: (trip.end||Date.now()) - trip.start, distNm: dist/NM, movingS: moving,
    avgKn: moving >= 60 ? (dist/NM)/(moving/3600) : ((trip.end||Date.now()) - trip.start) > 0 ? (dist/NM)/(((trip.end||Date.now()) - trip.start)/3600e3) : 0, avgAll: moving < 60, maxKn, maxOffM: maxOff, points: trip.pts.length,
    gapN: gaps.length, gapS: gaps.reduce((a, g) => a + (g.to - g.from)/1000, 0),
    wind: {avg: wv.length ? wv.reduce((a,b)=>a+b,0)/wv.length : null, min: wv.length?Math.min(...wv):null, max: wv.length?Math.max(...wv):null,
      gust: gv.length ? Math.max(...gv) : null, dir: (sx||sy) ? norm(Math.atan2(sx,sy)*180/Math.PI) : null, temp: tv.length ? tv.reduce((a,b)=>a+b,0)/tv.length : null,
      src: W.some(w=>w.src==="estació") ? "estació "+(STATIONS[trip.station || stKey]?.name||"") : "previsió del model", n: W.length},
    pos
  };
}

// Trams sense GPS (més de 90 s entre punts): normalment, pantalla apagada o app en segon pla
const GAP_S = 90;
function gapsOf(trip){
  const out = [], P = trip.pts;
  for(let i = 1; i < P.length; i++) if((P[i].t - P[i-1].t)/1000 > GAP_S) out.push({from: P[i-1].t, to: P[i].t, a: P[i-1], b: P[i]});
  return out;
}

/* ---------- mapes ---------- */
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#3cd0ff"; }
// scroll:true → al mòbil un dit fa desplaçar l'app (el mapa només es mou amb dos dits / pessic)
function baseMap(el, scroll){
  if(!window.L) return null;
  el.innerHTML = "";
  const free = scroll && L.Browser.mobile;
  const m = L.map(el, {zoomControl:true, attributionControl:true, dragging:!free, tap:!free}).setView(HOME, 14);
  m.attributionControl.setPrefix(false);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, className:"base-tiles", attribution:"© OpenStreetMap"}).addTo(m);
  L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {maxZoom:18, attribution:"© OpenSeaMap"}).addTo(m);
  return m;
}
function svgTrack(el, pts, colored){
  if(pts.length < 2){ el.innerHTML = `<div class="empty">La ruta apareixerà aquí quan hi hagi senyal GPS.</div>`; return; }
  const lats = pts.map(p=>p.lat), lons = pts.map(p=>p.lon), k = Math.cos(rad(lats[0]));
  const x0 = Math.min(...lons), x1 = Math.max(...lons), y0 = Math.min(...lats), y1 = Math.max(...lats);
  const w = Math.max((x1-x0)*k, 1e-5), h = Math.max(y1-y0, 1e-5), S = 280/Math.max(w,h);
  const X = p => 20 + ((p.lon-x0)*k)*S, Y = p => 20 + (y1-p.lat)*S;
  const line = pts.map(p => X(p).toFixed(1)+","+Y(p).toFixed(1)).join(" ");
  el.innerHTML = `<svg viewBox="0 0 320 ${Math.max(80, h*S+40)}" role="img" aria-label="Traçat de la ruta"><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="${X(pts[0])}" cy="${Y(pts[0])}" r="5" fill="var(--ideal)"/><circle cx="${X(pts[pts.length-1])}" cy="${Y(pts[pts.length-1])}" r="5" fill="var(--no)"/></svg>`;
}
let liveMapEl = null;   // on és el mapa en directe: "liveMap" (vista Sortida) o "rideMap" (pantalla de ruta)
function destroyLiveMap(){ if(liveMap){ liveMap.remove(); liveMap = null; liveLine = null; liveDot = null; } liveMapEl = null; }
function updateLiveMap(){
  const id = rideVisible ? "rideMap" : "liveMap"; if(liveMapEl && liveMapEl !== id) destroyLiveMap();
  const el = $(id), P = LIVE.pts; liveMapEl = id;
  if(!window.L){ svgTrack(el, P); return; }
  if(!liveMap){ liveMap = baseMap(el, true); liveLine = L.polyline([], {color: cssVar("--accent"), weight:4}).addTo(liveMap); }
  if(!P.length) return;
  const ll = P.map(p => [p.lat, p.lon]); liveLine.setLatLngs(ll);
  const cur = ll[ll.length-1];
  if(!liveDot) liveDot = L.circleMarker(cur, {radius:8, color:"#fff", weight:3, fillColor: cssVar("--no"), fillOpacity:1}).addTo(liveMap); else liveDot.setLatLng(cur);
  if(P.length === 1) liveMap.setView(cur, 15); else if(!liveMap.getBounds().pad(-0.15).contains(cur)) liveMap.panTo(cur);
}
function tripMap(el, trip){
  const P = trip.pts;
  if(!window.L){ svgTrack(el, P); return null; }
  const m = baseMap(el, true);
  if(P.length < 2){ if(P.length) L.circleMarker([P[0].lat,P[0].lon], {radius:6}).addTo(m); return m; }
  const seg = segments(trip), groups = SPEED_COLORS.map(() => []);
  const gaps = gapsOf(trip), isGap = s => (s.b.t - s.a.t)/1000 > GAP_S;
  seg.filter(s => !isGap(s)).forEach(s => { const i = SPEED_BINS.findIndex(b => s.smooth < b); groups[i < 0 ? 4 : i].push([[s.a.lat,s.a.lon],[s.b.lat,s.b.lon]]); });
  groups.forEach((g,i) => { if(g.length) L.polyline(g, {color: SPEED_COLORS[i], weight:5, opacity:.95}).addTo(m); });
  if(gaps.length) L.polyline(gaps.map(g => [[g.a.lat,g.a.lon],[g.b.lat,g.b.lon]]), {color:"#8a94a6", weight:3, dashArray:"6 8", opacity:.9}).bindTooltip("Sense GPS (pantalla apagada?)").addTo(m);
  L.circleMarker([P[0].lat,P[0].lon], {radius:7, color:"#fff", weight:2, fillColor:"#34e39a", fillOpacity:1}).bindTooltip("Sortida").addTo(m);
  const e = P[P.length-1]; L.circleMarker([e.lat,e.lon], {radius:7, color:"#fff", weight:2, fillColor:"#ff6476", fillOpacity:1}).bindTooltip("Arribada").addTo(m);
  m.fitBounds(L.latLngBounds(P.map(p=>[p.lat,p.lon])).pad(0.15));
  return m;
}

/* ---------- vista en directe ---------- */
function renderLive(){
  if(!LIVE) return;
  const P = LIVE.pts, s = summarize(LIVE), last = P[P.length-1];
  const sogNow = last ? (P.slice(-3).reduce((a,p)=>a+(p.sog||0),0) / Math.min(3,P.length)) : null;
  const cog = last ? (last.cog ?? (P.length>1 ? bearing(P[P.length-2], last) : null)) : null;
  const w = stFresh() ? {wind:ST.wind, gust:ST.gust, dir:ST.dir, src:"estació"} : LIVE.wind[LIVE.wind.length-1] || null;
  const twa = (cog!=null && w && w.dir!=null && sogNow > 1) ? twaOf(cog, w.dir) : null;
  $("liveStats").innerHTML =
    stat("speed", "Velocitat", r1(sogNow), "kn", "Màxima "+r1(s.maxKn)+" kn") +
    stat("dist", "Distància", (s.distNm).toFixed(1).replace(".",","), "nm", "Mitjana "+r1(s.avgKn)+" kn") +
    stat("course", "Rumb", cog!=null ? r0(cog)+"°" : "–", "", cogName(cog)) +
    stat("gust", "Vent", w ? r0(w.wind) : "–", "kn", w ? windName(w.dir)+" · ratxa "+r0(w.gust)+" · "+w.src : "Sense dades") +
    stat("course", "Angle al vent", twa!=null ? r0(twa)+"°" : "–", "", twa!=null ? posOf(twa).t : "Navega per calcular-lo") +
    stat("clock", "En moviment", fmtDurShort(s.movingS*1000), "", P.length+" punts GPS");
  $("ctaLabel").textContent = "Sortida en curs · " + fmtDurShort(Date.now()-LIVE.start);
  renderRide({sog: sogNow, s, w, cog, twa, last});
  if(rideVisible){ if(ridePage === "map" && !LIVE.eco) updateLiveMap(); return; }
  if(!$("view-trip").hidden) updateLiveMap();
}

/* ---------- pantalla de ruta (normal i estalvi) ---------- */
// Mentre es grava, una pantalla sencera amb les dades grans. Normal: dades + mapa, s'actualitza cada segon.
// Estalvi: fons negre, només dades bàsiques i GPS cada 20 s (el mapa gasta bateria i dades).
let rideVisible = false, ridePage = "data";
const dirArrow = (deg, sz) => deg == null ? "" : `<svg class="rarw" width="${sz}" height="${sz}" viewBox="0 0 20 20" aria-hidden="true"><g transform="rotate(${Math.round(deg)} 10 10)"><path d="M10 1.5 L15.5 16 L10 12.5 L4.5 16 Z" fill="currentColor"/></g></svg>`;
function setEco(){ $("ride").classList.toggle("eco", !!(LIVE && LIVE.eco)); if(LIVE) $("rideEco").setAttribute("aria-pressed", String(!!LIVE.eco)); if(LIVE && LIVE.eco && ridePage === "map") rideShowPage("data"); }
// Web: la pantalla de ruta ocupa tota la pantalla (sense barres del navegador ni d'Android). A l'app ja ho fa MainActivity.
function rideFull(on){
  if(window.OV_NATIVE) return;
  try{
    const d = document;
    if(on && !d.fullscreenElement && d.documentElement.requestFullscreen) d.documentElement.requestFullscreen({navigationUI:"hide"}).catch(() => {});
    else if(!on && d.fullscreenElement === d.documentElement) d.exitFullscreen().catch(() => {});
  }catch(e){}
}
function showRide(on){
  rideVisible = !!on && !!LIVE; $("ride").hidden = !rideVisible; document.body.classList.toggle("riding", rideVisible);
  rideFull(rideVisible);
  if(!rideVisible){ if(liveMapEl === "rideMap") destroyLiveMap(); window.rideCmpOn = false; cmpListen(); fcSlot(false); return; }
  setEco(); rideShowPage(ridePage); rideConfirm(false); renderLive();
}
// «Previsió» dins la pantalla de ruta: s'hi porta la targeta «Vent per hores» (gràfic interactiu + mapa) de la portada, i en sortir es torna al seu lloc
let fcHome = null;
function fcSlot(on){
  const card = $("windMap"); if(!card) return;
  if(on){
    if(!fcHome) fcHome = {parent: card.parentNode, next: card.nextSibling};
    $("rideFcSlot").appendChild(card);
    if(window.renderWindMap) renderWindMap();
    setTimeout(() => { if(typeof wmMap !== "undefined" && wmMap) wmMap.invalidateSize(false); }, 50);
  } else if(fcHome && card.parentNode !== fcHome.parent){
    fcHome.parent.insertBefore(card, fcHome.next);
    setTimeout(() => { if(typeof wmMap !== "undefined" && wmMap) wmMap.invalidateSize(false); }, 50);
  }
}
function rideShowPage(pg){
  if(LIVE && LIVE.eco && pg !== "fc") pg = "data";
  ridePage = pg; $("rideData").hidden = pg !== "data"; $("rideMapP").hidden = pg !== "map"; $("rideCmpP").hidden = pg !== "cmp"; $("rideFcP").hidden = pg !== "fc";
  fcSlot(pg === "fc"); $("rideHide").setAttribute("aria-pressed", String(pg === "fc")); $("rideHide").textContent = pg === "fc" ? "Dades" : "Previsió";
  window.rideCmpOn = pg === "cmp" && !!LIVE; cmpListen();
  if(pg === "cmp") setTimeout(renderLive, 0);
  document.querySelectorAll("#rideSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.rp === pg)));
  if(pg === "map"){ setTimeout(() => { renderLive(); liveMap && liveMap.invalidateSize(); }, 0); } else if(liveMapEl === "rideMap") destroyLiveMap();
}
function rideConfirm(on){ $("rideBot").hidden = !!on; $("rideConfirm").hidden = !on; if(on) slideConfirm($("rideDiscard"), "Llisca per descartar", discardNow); }
const rcell = (label, v, u, sub, cls) => `<div class="rc${cls ? " " + cls : ""}"><span class="rl">${label}</span><span class="rv s">${v}<small>${u || ""}</small></span><span class="rs">${sub || "&nbsp;"}</span></div>`;
function renderRide(d){
  if(!rideVisible || !LIVE) return;
  const {sog, s, w, cog, twa, last} = d, eco = !!LIVE.eco, P = LIVE.pts;
  $("rideAct").textContent = DEFAULTS[LIVE.act]?.name || "";
  rideTime();
  const age = last ? Math.max(0, Math.round((Date.now() - last.t)/1000)) : null;
  $("rideGps").textContent = !last ? "Esperant GPS…" : eco ? `GPS fa ${age} s` : `GPS ±${last.acc ?? "?"} m`;
  $("rideGps").className = "ride-gps" + (!last || age > 60 ? " bad" : "");
  $("rSog").textContent = sog != null ? r1(sog) : "–";
  $("rSogU").textContent = "kn · màx " + r1(s.maxKn);
  // tornada: distància i rumb fins al punt de sortida
  const home = P.length > 1 ? {d: hav(last, P[0]) / NM, b: bearing(last, P[0])} : null;
  const cells = [
    rcell("Distància", s.distNm.toFixed(1).replace(".", ","), "nm", "mitjana " + r1(s.avgKn) + " kn"),
    rcell("Rumb", cog != null ? dirArrow(cog, 22) + r0(cog) + "°" : "–", "", cog != null ? cogName(cog) : "&nbsp;"),
    rcell("Vent", w ? arrow(w.dir, 22) + r0(w.wind) : "–", "kn", w ? windAbbr(w.dir) + " · ratxa " + r0(w.gust) : "sense dades"),
    rcell("Tornada", home ? dirArrow(home.b, 22) + home.d.toFixed(1).replace(".", ",") : "–", "nm", home ? "cap al " + cogName(home.b) + " · " + r0(home.b) + "°" : "&nbsp;")
  ];
  if(!eco) cells.push(
    rcell("Angle vent", twa != null ? r0(twa) + "°" : "–", "", twa != null ? posOf(twa).t : "navega per calcular-lo"),
    rcell("En moviment", fmtDurShort(s.movingS*1000).replace(" min", "").replace(" h ", ":"), s.movingS >= 3600 ? "h" : "min", P.length + " punts GPS"));
  $("rideGrid").innerHTML = cells.join("");
  if(ridePage === "map") $("rideMini").innerHTML = `<b>${sog != null ? r1(sog) : "–"}</b> kn · <b>${s.distNm.toFixed(1).replace(".", ",")}</b> nm${home ? ` · base ${home.d.toFixed(1).replace(".", ",")} nm ${dirArrow(home.b, 14)}` : ""}`;
  if(ridePage === "cmp"){
    window.rideCogH = sog != null && sog > 1 && cog != null ? cog : null;   // sense brúixola: la rosa s'orienta amb el rumb
    const c = crit[act];
    $("rideRose").innerHTML = roseSvg({card: true, k: w ? lvWind(w.wind, c) : null, dir: w?.dir, wind: w?.wind, wdir: DATA?.now?.wdir, wave: DATA?.now?.wave,
      hist: roseHist(OBS.key === stKey ? OBS.recs : [], []), cog, home: home ? home.b : null, cv: sog != null ? r1(sog) : "–", cu: "kn", cl: "VEL."});
    cmpApply();
    $("rideCgrid").innerHTML =
      rcell(`<i class="lg lg-cog" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 .5 15 8h-4.2v7.5H5.2V8H1z" fill="var(--accent)"/></svg></i>Rumb`, cog != null ? r0(cog) + "°" : "–", "", cog != null ? cogName(cog) : "&nbsp;") +
      rcell(`<i class="lg" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14L3 2.5A12 12 0 0 1 13 2.5Z" fill="var(--${w ? lvWind(w.wind, c) : "ink"})" fill-opacity=".38" stroke="var(--${w ? lvWind(w.wind, c) : "ink"})" stroke-width="1.6" stroke-linejoin="round"/></svg></i>Vent`, w ? r0(w.wind) : "–", "kn", w ? windAbbr(w.dir) + " · ratxa " + r0(w.gust) : "&nbsp;") +
      rcell(`<i class="lg" aria-hidden="true"><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.5" fill="var(--ideal)"/><path d="M4.5 8.5 8 5l3.5 3.5M5.5 7.6v3.6h5V7.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></i>Base`, home ? home.d.toFixed(1).replace(".", ",") : "–", "nm", home ? cogName(home.b) : "&nbsp;");
  }
  const g = $("liveGap"); $("rideGap").hidden = g.hidden; $("rideGap").innerHTML = g.innerHTML;
}
function rideTime(){ if(!LIVE) return; const m = Math.floor((Date.now() - LIVE.start)/60000); $("rideTime").textContent = Math.floor(m/60) + ":" + pad(m%60); }
// canvi de mode en marxa: reinicia la lectura del GPS amb el nou ritme
function rideToggleEco(){ if(!LIVE) return; LIVE.eco = !LIVE.eco; store.set("ov2_eco", LIVE.eco); $("ecoMode").checked = LIVE.eco;
  if(watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; clearInterval(ecoTimer); ecoTimer = null;
  startWatch(); saveLive(); setEco(); renderLive(); }
$("rideSeg").addEventListener("click", async e => { const b = e.target.closest("[data-rp]"); if(!b) return;
  if(b.dataset.rp === "cmp") await cmpPerm();   // iPhone: cal demanar permís al sensor en tocar
  rideShowPage(b.dataset.rp); });
$("rideHide").addEventListener("click", () => rideShowPage(ridePage === "fc" ? "data" : "fc"));
$("rideFull").addEventListener("click", () => { showRide(false); go("fc"); });
$("rideEco").addEventListener("click", rideToggleEco);
$("rideStop").addEventListener("click", () => rideConfirm(true));
$("rideBack").addEventListener("click", () => rideConfirm(false));
$("rideSave").addEventListener("click", async () => { confirmStop = Date.now(); showRide(false); await stopTrip(); });
const discardNow = () => { confirmDiscard = Date.now(); showRide(false); discardTrip(); };
slideConfirm($("rideDiscard"), "Llisca per descartar", discardNow);
slideConfirm($("discardTrip"), "Llisca per descartar", discardNow);

/* ---------- vent del model per a sortides sense estació (o importades) ---------- */
// Vent real de l'estació (registres de 5 minuts) per a tota la durada de la sortida; si no n'hi ha, el del model
async function fillStationWind(trip){
  const key = trip.station || stKey; trip.station = key;
  try{
    const recs = (await stationRecords(key, "custom", trip.start - 10*60e3, (trip.end || Date.now()) + 10*60e3)).filter(o => o.wind != null);
    if(recs.length >= 2){ trip.wind = recs.map(o => Object.assign(o, {src:"estació"})); return; }
  }catch(e){}
  if(trip.wind.length < 2) await fillModelWind(trip);
}
async function fillModelWind(trip){
  try{
    const ymd = ms => { const d = new Date(ms); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${LOC.lat}&longitude=${LOC.lon}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m&wind_speed_unit=kn&timezone=Europe%2FMadrid&start_date=${ymd(trip.start)}&end_date=${ymd(trip.end||trip.start)}`;
    const H = (await getJSON(u)).hourly; const t0 = trip.start - 3600e3, t1 = (trip.end||trip.start) + 3600e3;
    const add = H.time.map((t,i) => ({t: new Date(t).getTime(), wind:H.wind_speed_10m[i], gust:H.wind_gusts_10m[i], dir:H.wind_direction_10m[i], temp:H.temperature_2m[i], src:"model"}))
      .filter(w => w.t >= t0 && w.t <= t1 && w.wind != null);
    trip.wind = [...trip.wind, ...add].sort((a,b) => a.t-b.t);
  }catch(e){}
}

/* ---------- importar GPX (ruta gravada amb una altra app o un rellotge) ---------- */
async function importGpx(file){
  const msg = t => { $("importMsg").textContent = t; $("importMsg").hidden = !t; };
  msg("Llegint "+file.name+"…");
  try{
    const xml = new DOMParser().parseFromString(await file.text(), "application/xml");
    const nodes = [...xml.getElementsByTagName("trkpt"), ...xml.getElementsByTagName("rtept")];
    const pts = []; let rej = 0;
    for(const n of nodes){ const tm = n.getElementsByTagName("time")[0]; if(!tm) continue;
      const p = {t: Date.parse(tm.textContent.trim()), lat: +(+n.getAttribute("lat")).toFixed(6), lon: +(+n.getAttribute("lon")).toFixed(6), acc:null, sog:null, cog:null};
      if(isNaN(p.t) || isNaN(p.lat) || isNaN(p.lon)) continue;
      const last = pts[pts.length-1];
      if(last){ const dt = (p.t-last.t)/1000; if(dt < 1) continue; const d = hav(last,p); if(d/dt*KN > 50 && rej < 2){ rej++; continue; } rej = 0; p.sog = +(d/dt*KN).toFixed(2); if(d > 4) p.cog = Math.round(bearing(last,p)); }
      pts.push(p);
    }
    if(pts.length < 2){ msg("Aquest fitxer no té una ruta amb hores. Cal un GPX gravat (track), no una ruta planificada."); return; }
    const nm = xml.getElementsByTagName("name")[0]?.textContent?.trim();
    const trip = {id: Date.now(), name: nm || file.name.replace(/\.gpx$/i,""), act, start: pts[0].t, end: pts[pts.length-1].t, pts, wind: [], imported: true, station: stKey};
    await fillStationWind(trip);
    trip.summary = summarize(trip);
    await DB.put(trip); window.OV_CLOUD?.saved(trip); msg(""); showTrip(trip.id);
  }catch(e){ msg("No s'ha pogut llegir el fitxer GPX."); }
}

/* ---------- protecció i còpia de seguretat ---------- */
// Demana al navegador que no esborri les dades d'aquesta app quan falti espai (a les apps instal·lades sol acceptar-ho)
async function storagePersisted(){
  try{ if(!navigator.storage?.persisted) return false; if(await navigator.storage.persisted()) return true; return await navigator.storage.persist(); }catch(e){ return false; }
}
const SETTINGS_KEYS = ["ov2_act","ov2_crit","ov2_theme","ov2_size","ov2_station_v3","ov2_eco"];
async function backupOut(){
  const msg = t => { $("backupMsg").textContent = t; $("backupMsg").hidden = !t; };
  try{
    const trips = (await DB.all()) || [];
    const settings = {}; SETTINGS_KEYS.forEach(k => { const v = store.get(k); if(v != null) settings[k] = v; });
    const data = {app:"Ocata Vent", format:1, exportedAt:new Date().toISOString(), settings, trips};
    const d = new Date(), name = `ocata-vent-copia_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}.json`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:"application/json"})); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    msg(`Còpia preparada: ${trips.length === 1 ? "1 sortida" : trips.length+" sortides"} i les preferències (${name}). Guarda-la al Drive o envia-te-la per correu.`);
  }catch(e){ msg("No s'ha pogut fer la còpia."); }
}
async function backupIn(file){
  const msg = t => { $("backupMsg").textContent = t; $("backupMsg").hidden = !t; };
  try{
    const data = JSON.parse(await file.text());
    if(data.app !== "Ocata Vent" || !Array.isArray(data.trips)){ msg("Aquest fitxer no és una còpia d'Ocata Vent."); return; }
    const have = new Set(((await DB.all()) || []).map(t => t.id)); let added = 0;
    for(const t of data.trips){
      if(!t || typeof t.id !== "number" || !Array.isArray(t.pts) || have.has(t.id)) continue;   // no trepitja les que ja hi són
      t.wind = Array.isArray(t.wind) ? t.wind : []; delete t.owner; delete t.synced; await DB.put(t); added++;   // entren com a sortides d'aquest mòbil
    }
    if(data.settings) SETTINGS_KEYS.forEach(k => { if(data.settings[k] != null && store.get(k) == null) store.set(k, data.settings[k]); });
    await renderList();
    const m = $("backupMsg"); if(m){ m.textContent = added ? `${added === 1 ? "Recuperada 1 sortida" : "Recuperades "+added+" sortides"} de la còpia del ${new Date(data.exportedAt).toLocaleDateString("ca")}.` : "Totes les sortides de la còpia ja hi eren."; m.hidden = false; }
  }catch(e){ msg("No s'ha pogut llegir la còpia."); }
}

/* ---------- historial ---------- */
let detailMap = null;
async function renderList(){
  $("logDetail").hidden = true; $("logList").hidden = false;
  if(detailMap){ detailMap.remove(); detailMap = null; }
  let trips = []; try{ trips = (await DB.all()) || []; }catch(e){}
  trips.sort((a,b) => b.start - a.start);
  const imp = `<article class="card"><div class="import-row"><label class="btn imp-btn" for="gpxIn">Importa una sortida (GPX)</label>
    <button class="ib-i" type="button" data-info="iImp" aria-label="Què és importar una sortida" aria-expanded="false">i</button></div>
    <div class="vp-info" id="iImp" hidden><p>Una ruta en format GPX gravada amb una altra app o un rellotge. L'app hi afegeix el vent que marcava l'estació.</p></div>
    <input type="file" id="gpxIn" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden><div class="msg" id="importMsg" hidden style="margin-top:8px"></div></article>`;
  const persisted = await storagePersisted();
  const bak = `<article class="card"><div class="card-h"><span class="lbl">Còpia de seguretat</span>
      <span class="src ${persisted ? "live" : ""}"><span class="dot"></span>${persisted ? "Dades protegides al mòbil" : "El navegador pot esborrar-les si falta espai"}</span></div>
    <p class="note">${window.OV_CLOUD?.approved() ? "Les sortides del teu compte també es desen al núvol. Si vols, en pots guardar una còpia en un fitxer." : "Les sortides només es desen en aquest mòbil. Guarda'n una còpia de tant en tant (per exemple, al Drive) per no perdre-les si canvies de mòbil o esborres l'app."}</p>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" type="button" id="backupOut">Fes una còpia de seguretat</button>
      <label class="btn" for="backupIn" style="display:inline-flex;align-items:center">Recupera una còpia</label>
      <input type="file" id="backupIn" accept=".json,application/json" hidden></div>
    <div class="msg" id="backupMsg" hidden style="margin-top:8px"></div></article>`;
  const cloud = `<div id="cloudCard"></div>`;
  if(!trips.length){ $("logList").innerHTML = `<article class="card empty">Encara no hi ha cap sortida desada.<br>Prem «Sortida» per gravar la primera.</article>` + cloud + imp + bak; window.OV_CLOUD?.renderCard(); return; }
  $("logList").innerHTML = `<div class="card-h" style="margin:0"><h2 style="font-size:1.3rem;text-transform:uppercase">Sortides</h2><span class="lbl">${trips.length}</span></div><div class="trips">` + trips.map(t => {
    const d = new Date(t.start), s = t.summary || summarize(t);
    const dShort = DAYS_S[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
    const hhmm = pad(d.getHours()) + ":" + pad(d.getMinutes());
    return `<button type="button" class="trip" data-trip="${t.id}"><b class="tr-n">${esc(t.name || dShort)}</b>
      <span class="tr-d">${t.name ? esc(dShort) + " · " : ""}${hhmm}</span>${tripShape(t.pts)}
      <span class="m tr-dist">${typeof boatIcon === "function" ? boatIcon(t.act, 18) : ""}${s.distNm.toFixed(1).replace(".",",")} nm</span><span class="m tr-x">${fmtDurShort(s.dur)} · màx ${r0(s.maxKn)} kn</span></button>`; }).join("") + `</div>` + cloud + imp + bak;
  window.OV_CLOUD?.renderCard();
}
// Silueta del recorregut per a la llista (sense mapa): polilínia escalada dins un requadre petit
function tripShape(pts){
  const P = (pts || []).filter(p => p && p.lat != null && p.lon != null);
  if(P.length < 2) return `<span class="tr-shape"></span>`;
  const step = Math.max(1, Math.floor(P.length / 80)), Q = P.filter((p, i) => i % step === 0 || i === P.length - 1);
  const k = Math.cos(rad(Q[0].lat)), xs = Q.map(p => p.lon * k), ys = Q.map(p => p.lat);
  const W = 64, H = 40, pd = 3, x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sc = Math.min((W - 2*pd) / ((x1 - x0) || 1e-9), (H - 2*pd) / ((y1 - y0) || 1e-9)), ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
  const pl = Q.map((p, i) => (ox + (xs[i] - x0) * sc).toFixed(1) + "," + (oy + (y1 - ys[i]) * sc).toFixed(1)).join(" ");
  return `<svg class="tr-shape" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pl}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function seriesChart(trip){
  const seg = segments(trip); if(seg.length < 3) return "";
  const t0 = trip.start, t1 = trip.end || Date.now(), W = 760, H = 220, L = 34, R = 12, T = 14, B = 28, pw = W-L-R, ph = H-T-B;
  const winds = trip.wind.filter(w => w.wind!=null);
  const maxV = Math.max(10, Math.ceil(Math.max(...seg.map(s=>s.smooth), ...winds.map(w=>w.gust||w.wind))/5)*5);
  const X = t => L + (t-t0)/(t1-t0||1)*pw, Y = v => T + ph - v/maxV*ph;
  let g = "";
  for(let v=0; v<=maxV; v+=5) g += `<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${v}</text>`;
  const step = Math.max(1, Math.round(seg.length/300));
  g += `<polyline points="${seg.filter((_,i)=>i%step===0).map(s => X(s.t).toFixed(1)+","+Y(Math.min(s.smooth,maxV)).toFixed(1)).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  if(winds.length > 1){
    g += `<polyline points="${winds.map(w => X(w.t)+","+Y(w.wind)).join(" ")}" fill="none" stroke="var(--accent-2)" stroke-width="2.5"/>`;
    g += `<polyline points="${winds.filter(w=>w.gust!=null).map(w => X(w.t)+","+Y(w.gust)).join(" ")}" fill="none" stroke="var(--accent-2)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".8"/>`;
  }
  const mins = (t1-t0)/60000, tick = mins > 180 ? 60 : mins > 60 ? 30 : mins > 20 ? 10 : 5;
  for(let m=0; m<=mins; m+=tick){ const x = X(t0+m*60000), d = new Date(t0+m*60000); g += `<text x="${x}" y="${H-6}" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${pad(d.getHours())}:${pad(d.getMinutes())}</text>`; }
  return `<div class="chart wide"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Velocitat del vaixell i vent durant la sortida">${g}</svg></div>
    <div class="legend"><span><span class="sw" style="background:var(--accent)"></span>Velocitat vaixell (kn)</span><span><span class="sw" style="background:var(--accent-2)"></span>Vent ${winds.some(w=>w.src==="estació")?"estació":"model"} (kn)</span><span><span class="sw" style="background:var(--accent-2);opacity:.6"></span>Ratxa</span></div>`;
}
async function showTrip(id){
  const t = await DB.get(id); if(!t){ renderList(); return; }
  const s = t.summary || summarize(t), d = new Date(t.start);
  $("logList").hidden = true; $("logDetail").hidden = false;
  const posTot = POS.reduce((a,p)=>a+s.pos[p.k].t,0);
  const posRows = POS.map(p => { const v = s.pos[p.k], pc = posTot ? v.t/posTot*100 : 0, kn = v.t ? (v.d/NM)/(v.t/3600) : 0;
    return `<div class="pos"><b>${p.t}</b><span class="bar"><i style="width:${pc.toFixed(1)}%"></i></span><span>${Math.round(pc)}% · ${r1(kn)} kn</span></div>`; }).join("");
  const W = s.wind;
  $("logDetail").innerHTML = `
    <div style="display:flex;gap:8px;align-items:center"><button class="btn" type="button" id="backList">← Sortides</button></div>
    <article class="card"><span class="lbl">${esc(DEFAULTS[t.act]?.name||"")} · ${d.toLocaleDateString("ca",{weekday:"long",day:"numeric",month:"long"})}</span>
      <h2 style="font-size:1.6rem;text-transform:uppercase;margin-top:2px">${esc(t.name || "Sortida de les "+pad(d.getHours())+":"+pad(d.getMinutes()))}</h2>
      <div class="muted" style="font-weight:600;font-size:.85rem">${pad(d.getHours())}:${pad(d.getMinutes())} – ${t.end?new Date(t.end).toTimeString().slice(0,5):"–"} · ${s.points} punts GPS</div></article>
    ${s.gapN ? `<div class="warnbox">⚠ Aquesta sortida té ${s.gapN} ${s.gapN === 1 ? "tram" : "trams"} sense GPS (${fmtDurShort(s.gapS*1000)} en total), segurament amb la pantalla apagada. Al mapa surten amb línia discontínua: la distància hi és en línia recta i la velocitat no s'hi pot calcular.</div>` : ""}
    <div class="big-stats">
      ${stat("dist","Distància", s.distNm.toFixed(2).replace(".",","), "nm", Math.round(s.distNm*NM)+" m")}
      ${(() => { const m = Math.round(s.dur/60000); return m >= 60 ? stat("clock","Durada", Math.floor(m/60)+":"+pad(m%60), "h", "En moviment "+fmtDurShort(s.movingS*1000)) : stat("clock","Durada", m, "min", "En moviment "+fmtDurShort(s.movingS*1000)); })()}
      ${stat("speed","Vel. mitjana", r1(s.avgKn), "kn", s.avgAll ? "Sobre el temps total" : "Només temps en moviment")}
      ${stat("speed","Vel. màxima", r1(s.maxKn), "kn", "Mitjana de 3 trams GPS")}
      ${stat("course","Allunyament", s.maxOffM >= 1000 ? (s.maxOffM/NM).toFixed(2).replace(".",",") : r0(s.maxOffM), s.maxOffM >= 1000 ? "nm" : "m", "Màxim des del punt de sortida")}
      ${stat("gust","Vent", r0(W.avg), "kn", W.avg!=null ? windName(W.dir)+" · "+r0(W.min)+"–"+r0(W.max)+" kn" : "Sense dades")}
      ${stat("gust","Ratxa màx.", r0(W.gust), "kn", W.src)}
      ${stat("air","Aire", r0(W.temp), "°C", W.n+" lectures de vent")}
    </div>
    <article class="card"><div class="card-h"><span class="lbl">Ruta · color segons velocitat</span></div><div class="map short" id="tripMap"></div>
      <div class="legend">${SPEED_COLORS.map((c,i) => `<span><span class="sw" style="background:${c};height:6px"></span>${i===0?"< 2":i===4?"> 8":SPEED_BINS[i-1]+"–"+SPEED_BINS[i]} kn</span>`).join("")}</div></article>
    <article class="card"><div class="card-h"><span class="lbl">Velocitat i vent</span></div>${seriesChart(t) || `<p class="note">No hi ha prou punts per dibuixar el gràfic.</p>`}</article>
    <article class="card"><div class="card-h"><span class="lbl">Rumbs respecte al vent</span><span class="lbl">temps · vel. mitjana</span></div>
      ${posTot ? `<div class="pos-bars">${posRows}</div>` : `<p class="note">Cal navegar una estona amb dades de vent per calcular-ho.</p>`}
      <p class="note" style="margin-top:8px">Angle entre el rumb sobre el fons (GPS) i la direcció del vent: cenyida &lt; 60°, través 60–110°, llarg 110–150°, popa &gt; 150°. No té en compte el corrent ni l'abatiment.</p></article>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" type="button" id="expGpx">Exporta GPX</button><button class="btn" type="button" id="expCsv">Exporta CSV</button>
</div>
    <div id="clubShare"></div>
    <div id="delTrip"></div>`;
  window.OV_CLUB?.shareBtn($("clubShare"), t);
  $("backList").onclick = renderList;
  $("expGpx").onclick = () => download(t, "gpx");
  $("expCsv").onclick = () => download(t, "csv");
  slideConfirm($("delTrip"), "Llisca per esborrar", async () => { await DB.del(t.id); window.OV_CLOUD?.deleted(t); renderList(); });
  if(detailMap){ detailMap.remove(); detailMap = null; }
  setTimeout(() => { detailMap = tripMap($("tripMap"), t); }, 0);
  window.scrollTo({top:0});
}
function download(t, kind){
  const d = new Date(t.start), base = `sortida_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  let body, type;
  if(kind === "gpx"){
    type = "application/gpx+xml";
    body = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ocata Vent" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${esc(t.name||base)}</name><trkseg>\n` +
      t.pts.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"><time>${new Date(p.t).toISOString()}</time></trkpt>`).join("\n") + `\n</trkseg></trk>\n</gpx>\n`;
  } else {
    type = "text/csv";
    body = "hora,lat,lon,precisio_m,velocitat_kn,rumb,vent_kn,ratxa_kn,dir_vent\n" + t.pts.map(p => { const w = windNear(t, p.t) || {};
      return [new Date(p.t).toISOString(), p.lat, p.lon, p.acc, p.sog ?? "", p.cog ?? "", w.wind!=null?w.wind.toFixed(1):"", w.gust!=null?w.gust.toFixed(1):"", w.dir ?? ""].join(","); }).join("\n");
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], {type})); a.download = base+"."+kind;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- connexions ---------- */
$("startTrip").addEventListener("click", startTrip);
$("ecoMode").checked = false;
if(window.OV_NATIVE){ const rt = $("rideTip"); if(rt) rt.textContent = "Si no la toques es posa negra: dos tocs per tornar-la a veure."; }
if(window.OV_NATIVE){ const tt = $("tnTipT"); if(tt) tt.textContent = "Si no la toques, la pantalla es posa negra: dos tocs per tornar-la a veure"; }
$("ecoOn").addEventListener("click", () => showRide(true));
$("logList").addEventListener("change", e => {
  if(e.target.id === "gpxIn" && e.target.files[0]) importGpx(e.target.files[0]);
  if(e.target.id === "backupIn" && e.target.files[0]) backupIn(e.target.files[0]);
});
$("logList").addEventListener("click", e => { if(e.target.closest("#backupOut")) backupOut(); });
storagePersisted();
$("stopTrip").addEventListener("click", stopTrip);
$("logList").addEventListener("click", e => { const b = e.target.closest("[data-trip]"); if(b) showTrip(+b.dataset.trip); });
window.addEventListener("mm-view", e => {
  if(e.detail === "trip" && LIVE) showRide(true);
  if(e.detail === "log") renderList();
});
document.addEventListener("visibilitychange", () => { if(!LIVE) return;
  if(document.visibilityState === "visible"){ keepAwake(); sampleWind(); setTimeout(liveGapNote, 4000); hiddenAt = 0; }
  else { hiddenAt = Date.now(); saveLive(); } });
window.addEventListener("pagehide", saveLive);

// Recupera una sortida que estava en curs (app tancada o recarregada)
(function resume(){
  const saved = store.get("ov2_live");
  if(saved && saved.start && Date.now() - saved.start < 18*3600*1000){ LIVE = saved; startWatch(); setTimeout(() => showRide(true), 0); }
  else if(saved) store.del("ov2_live");
  setRecUI();
})();

/* ---------- permisos per gravar la sortida ---------- */
async function permCheck(){
  const WORD = {ok:"A punt", bad:"Falta", wait:"Falta"};
  const set = (id, cls, txt) => { const li = $(id); if(!li) return; li.className = "ck " + cls; li.querySelector("em").textContent = WORD[cls] || ""; if(txt != null) li.querySelector("small").textContent = txt; };
  if(!("geolocation" in navigator)) set("pmGeo", "bad", "Aquest navegador no té GPS.");
  else {
    let st = "prompt";
    try{ st = (await navigator.permissions.query({name:"geolocation"})).state; }catch(e){}
    // A l'app, la WebView no recorda el permís d'Android i diu sempre «prompt»: es comprova demanant una posició
    if(window.OV_NATIVE && st !== "granted") st = await nativeGeoState();
    $("pmGeoBtn").hidden = st !== "prompt";
    if(window.OV_NATIVE){
      if(st === "granted") set("pmGeo", "ok", "Concedida. N'hi ha prou amb «Permet només mentre s'utilitza l'aplicació» i «Ubicació precisa»: en gravar, la notificació fixa manté el GPS encès amb la pantalla apagada.");
      else if(st === "denied") set("pmGeo", "bad", "Denegada. Ajustaments ▸ Aplicacions ▸ Ocata Vent ▸ Permisos ▸ Ubicació ▸ «Permet només mentre s'utilitza l'aplicació» i activa «Ubicació precisa».");
      else set("pmGeo", "wait", "Encara no l'has concedida. Toca «Permet la ubicació».");
    }
    else if(st === "granted") set("pmGeo", "ok", "Concedida. Si Android ho pregunta, tria «Ubicació precisa».");
    else if(st === "denied") set("pmGeo", "bad", "Denegada. Activa-la a Ajustaments ▸ Aplicacions ▸ Chrome ▸ Permisos ▸ Ubicació, i a la icona del cadenat de la web.");
    else set("pmGeo", "wait", "Encara no l'has concedida. Toca «Permet».");
  }
  await batCheck();
  if(window.OV_NATIVE) set("pmWake", "ok", "A l'app, la gravació continua encara que la pantalla s'apagui.");   // el GPS continua amb la pantalla apagada
  else if("wakeLock" in navigator) set("pmWake", "ok", "Mentre graves, la pantalla no s'apagarà sola.");
  else set("pmWake", "bad", "Aquest navegador no pot mantenir la pantalla encesa: allarga el temps d'apagada a Ajustaments del mòbil.");
  // si alguna cosa falta, se n'ensenya el detall sense haver de tocar
  // el detall només surt si el soci toca una casella, i es tanca sol quan aquella casella ja està bé
  const op = ckOpen && document.querySelector(`#ckRow .ck[data-ck="${ckOpen}"]`);
  ckShow(op && !op.classList.contains("ok") ? ckOpen : null);
}
// App Android: demana una posició ràpida per saber si hi ha permís (error 1 = denegat; temps esgotat = permís sí, senyal no)
let nGeo = null;
function nativeGeoState(){
  if(nGeo === "granted") return Promise.resolve(nGeo);
  return new Promise(res => navigator.geolocation.getCurrentPosition(
    () => res(nGeo = "granted"),
    e => res(nGeo = e.code === 1 ? "denied" : e.code === 3 ? "granted" : "prompt"),
    {enableHighAccuracy:false, maximumAge:600000, timeout:8000}));
}
// Bateria: a l'APK nou, Android diu si l'app està exclosa de l'optimització (OvBattery); si no es pot saber, ho confirma el soci
const BAT_K = "ov2_bat_ok";
async function batCheck(){
  const b = $("pmBat"), btn = $("pmBatBtn"); if(!b) return;
  const P = window.OV_NATIVE && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.OvBattery;
  const say = (cls, word, html, btxt) => { b.className = "ck " + cls; b.querySelector("em").textContent = word; b.querySelector("small").innerHTML = html; btn.hidden = !btxt; if(btxt) btn.textContent = btxt; };
  const where = window.OV_NATIVE ? "Ocata Vent" : "Chrome";
  let ign = null; if(P){ try{ ign = (await P.check()).ignoring; }catch(e){} }
  let man = false; try{ man = localStorage.getItem(BAT_K) === where; }catch(e){}
  if(ign === true) say("ok", "A punt", "Android no aturarà la gravació: l'app no té restriccions de bateria.", null);
  else if(ign === false) say("pm-info", "Revisa", "Android pot aturar la gravació per estalviar bateria. Toca «Obre els ajustos» i, a <b>Bateria</b>, tria <b>Sense restriccions</b>.", "Obre els ajustos");
  else if(man) say("ok", "A punt", `Has confirmat que ${where} no té restriccions de bateria.`, null);
  else say("pm-info", "Revisa", `Perquè Android no aturi la gravació: Ajustaments ▸ Aplicacions ▸ ${where} ▸ Bateria ▸ <b>Sense restriccions</b>. Quan ho tinguis, toca «Ja ho he fet».`, "Ja ho he fet");
}
document.addEventListener("click", e => { if(e.target.id !== "pmBatBtn") return;
  const P = window.OV_NATIVE && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.OvBattery;
  if(P && e.target.textContent === "Obre els ajustos"){ P.open().catch(() => {}); return; }   // fitxa de l'app; en tornar a l'app es torna a comprovar
  try{ localStorage.setItem(BAT_K, window.OV_NATIVE ? "Ocata Vent" : "Chrome"); }catch(_){}
  permCheck();
});
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible" && !LIVE && $("pmBat")) permCheck(); });
let ckOpen = null;
function ckShow(k){
  ckOpen = k; const d = $("ckDetail");
  document.querySelectorAll("#ckRow .ck").forEach(b => b.setAttribute("aria-expanded", String(b.dataset.ck === k)));
  const b = k && document.querySelector(`#ckRow .ck[data-ck="${k}"]`);
  d.hidden = !b; if(b) d.innerHTML = b.querySelector("small").innerHTML;
}
$("ckRow").addEventListener("click", e => { const b = e.target.closest(".ck"); if(b) ckShow(ckOpen === b.dataset.ck ? null : b.dataset.ck); });
document.addEventListener("click", e => { if(e.target.id === "pmGeoBtn"){
  $("pmGeo").querySelector("small").textContent = "Esperant la resposta…"; ckShow("geo"); nGeo = null;
  navigator.geolocation.getCurrentPosition(() => permCheck(), () => permCheck(), {enableHighAccuracy:true, timeout:20000});
} });
window.addEventListener("mm-view", e => { if(e.detail === "trip" && !LIVE) permCheck(); });
permCheck();

/* ---------- pantalla negra per inactivitat mentre es grava (dos tocs la tornen a encendre) ----------
   La pantalla no s'apaga (wake lock / KeepAwake), però si no es toca en SLEEP_S segons es cobreix de negre:
   en pantalles OLED el negre gasta molt poc, i les xifres es recuperen amb dos tocs sense desbloquejar el mòbil.
   Els avisos de seguretat (#liveAlert) i el recordatori de material queden per sobre i a més la desperten. */
const SLEEP_S = 40;
let lastTouch = Date.now(), lastTap = 0, sleeping = false;
function sleepEl(){
  let el = $("rideSleep");
  if(!el){ el = document.createElement("div"); el.id = "rideSleep"; el.className = "ride-sleep"; el.hidden = true;
    el.innerHTML = `<span class="rs-hint">Dos tocs per veure les xifres</span>`; document.body.appendChild(el); }
  return el;
}
function sleepSet(on){
  on = !!on && !!LIVE; if(on === sleeping) return; sleeping = on;
  const el = sleepEl(); el.hidden = !on; if(on){ el.classList.remove("hint-off"); clearTimeout(sleepSet.t); sleepSet.t = setTimeout(() => el.classList.add("hint-off"), 4000); }
  if(!on) lastTouch = Date.now();
}
document.addEventListener("pointerdown", e => {
  const now = Date.now();
  if(sleeping){
    e.preventDefault(); e.stopPropagation();
    if(now - lastTap < 450){ sleepSet(false); lastTap = 0; } else { lastTap = now; sleepEl().classList.remove("hint-off"); clearTimeout(sleepSet.t); sleepSet.t = setTimeout(() => sleepEl().classList.add("hint-off"), 2500); }
    return;
  }
  lastTouch = now;
}, true);
// el toc que desperta no ha d'arribar als botons de sota
document.addEventListener("click", e => { if(e.target && e.target.id === "rideSleep"){ e.preventDefault(); e.stopPropagation(); } }, true);
setInterval(() => {
  if(!LIVE || !rideVisible || document.visibilityState !== "visible"){ sleepSet(false); return; }
  const al = $("liveAlert"), sm = $("sosMap"); if((al && !al.hidden) || (sm && !sm.hidden)){ sleepSet(false); return; }   // un avís de seguretat sempre es veu
  if(document.querySelector(".gear")){ lastTouch = Date.now(); return; }
  if(!sleeping && Date.now() - lastTouch > SLEEP_S * 1000) sleepSet(true);
}, 1000);
