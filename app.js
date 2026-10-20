"use strict";
/* ============ Mar del Masnou · previsió ============ */
// Llocs = clubs. La llista és a clubs.js (window.OV_CLUBS), generada per scripts/clubs.mjs a partir de data/clubs.csv (vela.cat):
// per a cada club, punt de previsió, punt d'onatge (mar endins), estacions (pot no tenir-ne: només previsió), platges amb bandera,
// base nàutica, orientació de la costa (terral) i zones d'avisos de Meteocat. Per afegir o corregir un club: CSV + node scripts/clubs.mjs.
// El Club Ocata Vent i el Club Nàutic El Masnou comparteixen meteo; cada club té la seva base.
const LOCS = window.OV_CLUBS && window.OV_CLUBS.masnou ? window.OV_CLUBS : {
  masnou:   {name:"Club Ocata Vent", muni:"El Masnou", com:"Maresme", lat:41.4766, lon:2.3185, mlat:41.465, mlon:2.33, home:[41.479804, 2.324024], wm:[41.4795, 2.3265], coast:135,
             stations:["masnou","ocata"], st:"masnou", smp:[21, 96], beaches:{"081189-p1":"Platja d'Ocata", "081189-p0":"Platja del Masnou"}, flag:"081189-p1"}
};
let locKey = (() => { try{ return JSON.parse(localStorage.getItem("ov2_loc")); }catch(e){ return null; } })(); if(!LOCS[locKey]) locKey = "masnou";
const LOC = LOCS[locKey];
// Cap on mira la platja (graus, de terra cap al mar). Per defecte, la calculada a clubs.js; el club la pot corregir
// a l'editor del plànol (eina «Mar») i es desa en aquest mòbil quan se'n llegeix el plànol (club.js → OV_SET_COAST).
const COAST0 = LOC.coast ?? 135;
let COAST = (() => { try{ const v = JSON.parse(localStorage.getItem("ov2_costa_" + locKey)); return typeof v === "number" ? v : COAST0; }catch(e){ return COAST0; } })();
// Tipus d'embarcació i llindars per defecte: catàleg únic a boats.js (window.OV_BOATS). Reserva mínima si no carrega.
const OVB = window.OV_BOATS || {FAMS:{vela:"Vela"}, IC:{}, LIST:{pati:{n:"Patí català", s:"Patí", f:"vela", ic:"pati", c:{min:5, iMin:8, iMax:16, max:20, gust:24, wOk:0.6, wMax:1.2}}}};
const DEFAULTS = {};
for(const k in OVB.LIST){ const T = OVB.LIST[k]; DEFAULTS[k] = Object.assign({name:T.n, short:T.s, fam:T.f, ic:T.ic}, T.c); }
const SLOTS = [
  {k:"mati",   label:"Matí",   ab:"M",  range:"9–12 h",  hours:[9,10,11]},
  {k:"migdia", label:"Migdia", ab:"Mg", range:"12–15 h", hours:[12,13,14]},
  {k:"tarda",  label:"Tarda",  ab:"T",  range:"15–19 h", hours:[15,16,17,18]}
];
const VERD = [{min:80,k:"ideal",t:"Ideal"},{min:60,k:"bo",t:"Bo"},{min:35,k:"marg",t:"Marginal"},{min:-1,k:"no",t:"No apte"}];
const WINDS = ["Tramuntana","Gregal","Llevant","Xaloc","Migjorn","Garbí","Ponent","Mestral"];
const WABBR = ["TRA","GRE","LLE","XAL","MIG","GAR","PON","MES"];
const DAYS_L = ["Diumenge","Dilluns","Dimarts","Dimecres","Dijous","Divendres","Dissabte"];
const MONTHS = ["gen","feb","març","abr","maig","juny","jul","ag","set","oct","nov","des"];
const KMH = 0.539957;

const store = {
  get(k){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
// Barra de dalt: els tipus de les meves embarcacions de la Base (ov2_acts_boat, els passa club.js) + els que el soci hi afegeix
// (ov2_acts_extra). Sense embarcacions ni tria pròpia: patí, windsurf i Hobie (decisió de l'Oriol). Màxim BAR_MAX icones.
const ACTS0 = ["pati", "windsurf", "hobie"].filter(k => DEFAULTS[k]), BAR_MAX = 4;
let actsBoat = (store.get("ov2_acts_boat") || []).filter(k => DEFAULTS[k]);
let actsExtra = store.get("ov2_acts_extra");   // null = encara no l'ha tocada
function barActs(){
  const ex = Array.isArray(actsExtra) ? actsExtra : (actsBoat.length ? [] : ACTS0);
  const L = [...new Set(actsBoat.concat(ex))].filter(k => DEFAULTS[k]);
  return L.length ? L.slice(0, BAR_MAX) : (ACTS0.length ? ACTS0 : [Object.keys(DEFAULTS)[0]]);   // primer les de la Base
}
let act = store.get("ov2_act"); if(!DEFAULTS[act] || !barActs().includes(act)) act = barActs()[0];
let crit = JSON.parse(JSON.stringify(DEFAULTS));
const savedCrit = store.get("ov2_crit"); if(savedCrit) for(const k in crit) if(savedCrit[k]) Object.assign(crit[k], savedCrit[k]);
let DATA = null, ST = null, openDay = null;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const r1 = v => v==null||isNaN(v) ? "–" : (Math.round(v*10)/10).toLocaleString("ca");
const r0 = v => v==null||isNaN(v) ? "–" : String(Math.round(v));
const norm = d => ((d%360)+360)%360;
const windName = d => d==null ? "–" : WINDS[Math.round(norm(d)/45)%8];
const windAbbr = d => d==null ? "–" : WABBR[Math.round(norm(d)/45)%8];
// Terral: bufa de terra, fins a 75° a cada costat de la direcció contrària a la platja. De mar: fins a 60° a cada costat d'on mira la platja.
const angDiff = (a, b) => { const x = Math.abs(norm(a) - norm(b)) % 360; return x > 180 ? 360 - x : x; };
const isOffshore = d => d != null && angDiff(d, COAST + 180) <= 75;
const isOnshore = d => d != null && angDiff(d, COAST) <= 60;
const pad = n => String(n).padStart(2,"0");
function arrow(deg, size){
  if(deg==null) return "";
  const s = size||16;
  return `<svg width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true" style="flex:none"><g transform="rotate(${norm(deg+180)} 10 10)"><path d="M10 1.5 L15.5 16 L10 12.5 L4.5 16 Z" fill="currentColor"/></g></svg>`;
}
function wxIcon(code, size){
  const z = size||18, s = `width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"`;
  if(code==null) return "";
  if(code>=95) return `<svg ${s} aria-label="Tempesta"><path d="M7 15a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3 3 0 0 1 0 6"/><path d="M12 13l-2 4h3l-2 4"/></svg>`;
  if(code>=51) return `<svg ${s} aria-label="Pluja"><path d="M7 14a4 4 0 1 1 1-7.9A5 5 0 0 1 18 8a3 3 0 0 1 0 6H7"/><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3"/></svg>`;
  if(code>=3) return `<svg ${s} aria-label="Ennuvolat"><path d="M7 18a4 4 0 1 1 1-7.9A5 5 0 0 1 18 12a3 3 0 0 1 0 6Z"/></svg>`;
  if(code>=1) return `<svg ${s} aria-label="Sol i núvols"><circle cx="8" cy="8" r="3"/><path d="M8 2v1M2 8h1M3.8 3.8l.7.7M12.2 3.8l-.7.7"/><path d="M9 19a3.5 3.5 0 1 1 1-6.8A4.5 4.5 0 0 1 19 14a2.5 2.5 0 0 1 0 5Z"/></svg>`;
  return `<svg ${s} aria-label="Sol"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
}
const IC = {
  gust:`<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h6"/>`,
  wave:`<path d="M2 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/><path d="M2 20c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/>`,
  per:`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>`,
  air:`<path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0z"/>`,
  water:`<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>`,
  sun:`<path d="M17 18a5 5 0 0 0-10 0M12 9V3M4.2 10.2l1.4 1.4M18.4 11.6l1.4-1.4M1 18h2M21 18h2M23 22H1"/>`,
  speed:`<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>`,
  dist:`<path d="M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M8.5 14.5l7-7"/>`,
  course:`<circle cx="12" cy="12" r="9"/><path d="M12 7l3 8-3-2-3 2z"/>`,
  clock:`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`
};
const icon = (k, z) => `<svg width="${z||14}" height="${z||14}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const suitS = t => t==null ? "" : t>=22 ? "Lycra o bany" : t>=19 ? "Neoprè curt" : t>=16 ? "Neoprè 3/2" : "Neoprè 4/3";   // curt, per a la casella
const suit = t => t==null ? "" : t>=22 ? "Lycra o banyador" : t>=19 ? "Neoprè curt 2–3 mm" : t>=16 ? "Neoprè 3/2 mm" : "Neoprè 4/3 + escarpins";

/* ---------- puntuació ---------- */
function windScore(w, c){
  if(w==null) return null;
  if(w < c.min) return Math.max(0, 30*(w/c.min));
  if(w < c.iMin) return 40 + 60*(w-c.min)/(c.iMin-c.min);
  if(w <= c.iMax) return 100;
  if(w <= c.max) return 100 - 60*(w-c.iMax)/(c.max-c.iMax);
  return Math.max(0, 25 - 6*(w-c.max));
}
function waveScore(h, c){
  if(h==null) return 100;
  if(h <= c.wOk) return 100;
  if(h <= c.wMax) return 100 - 60*(h-c.wOk)/(c.wMax-c.wOk);
  return Math.max(0, 25 - 60*(h-c.wMax));
}
// Onada que arriba a la platja: amb mar de fons (període llarg) l'onada creix en arribar a la costa
const beachWave = p => p.wave==null ? null : (p.tp!=null && p.tp >= 7 ? p.wave * (1 + Math.min(0.5, (p.tp-6)*0.1)) : p.wave);
// Llum de dia: ¿l'hora (o l'instant) cau abans de la sortida + 30 min o després de la posta − 30 min?
function darkAt(t){
  if(!DATA || !DATA.daily || !t) return false; const i = DATA.daily.time.indexOf(t.slice(0,10)); if(i < 0) return false;
  const ms = x => new Date(x).getTime(), at = ms(t), rise = ms(DATA.daily.sunrise[i]), set = ms(DATA.daily.sunset[i]);
  return at + 30*60e3 < rise || at >= set - 30*60e3;
}
const HARD = ["Ratxes fortes","Tempesta","Pluja","Terral fort","Poca llum"];
const INFO_FLAGS = ["Mar de fons","Aigua freda"];
function scoreHour(p, c){
  const ws = windScore(p.wind, c);
  if(ws==null) return {score:null, flags:[], why:[]};
  const hb = beachWave(p), os = waveScore(hb, c);
  let s = Math.min(ws, os), pw = ws, po = os;
  const flags = [];
  if(p.gust!=null && p.gust > c.gust){ s = Math.min(s, 25); pw = Math.min(pw, 25); flags.push("Ratxes fortes"); }
  else if(p.gust!=null && p.wind!=null && p.wind >= 4 && p.gust / p.wind > 1.6){ s -= 15; pw -= 15; flags.push("Ràfagues"); }   // racheig relatiu
  if(p.tp!=null && p.tp >= 7 && p.wave!=null && p.wave >= 0.4) flags.push("Mar de fons");   // ja compta a l'onada de platja
  // Onada curta i picada: període mitjà per sota del mínim de l'embarcació (c.pMin, s; buit = indiferent) amb 0,3 m d'onada o més
  if(c.pMin && p.per!=null && p.per < c.pMin && p.wave!=null && p.wave >= 0.3){ const pen = Math.min(35, 15 + 10*(c.pMin - p.per)); s -= pen; po -= pen; flags.push("Onada curta"); }
  if(isOffshore(p.dir) && p.wind >= 6){
    s = p.wind >= 10 ? Math.min(s-25, 40) : s-25; pw = p.wind >= 10 ? Math.min(pw-25, 40) : pw-25; flags.push("Terral");
    if(p.wind >= 10){ s = Math.min(s, 20); pw = Math.min(pw, 20); flags.push("Terral fort"); } }
  const rain = p.code!=null && ((p.code>=61 && p.code<=67) || (p.code>=80 && p.code<=82));
  if(p.code!=null && p.code>=95){ s = 0; flags.push("Tempesta"); }
  else if(rain){ s = 0; flags.push("Pluja"); }
  else if(p.code!=null && p.code>=51 && p.code<=57){ s -= 15; flags.push("Plugim"); }
  else if(p.pp!=null && p.pp>=60){ s -= 15; flags.push("Probable pluja"); }
  if(darkAt(p.t)){ s = Math.min(s, 10); flags.push("Poca llum"); }
  if(p.sst!=null && p.sst < 17) flags.push("Aigua freda");
  // Motius, en paraules, del que limita la sortida
  const why = [];
  if(p.wind < c.min) why.push("poc vent"); else if(p.wind < c.iMin) why.push("vent fluix");
  if(p.wind > c.max) why.push("massa vent"); else if(p.wind > c.iMax) why.push("vent fort");
  if(flags.includes("Ratxes fortes")) why.push("ratxes fortes"); else if(flags.includes("Ràfagues")) why.push("vent a ràfagues");
  if(hb!=null && hb > c.wMax) why.push("onada alta"); else if(hb!=null && hb > c.wOk) why.push("onada");
  [["Terral fort","terral fort"],["Terral","terral"],["Mar de fons","mar de fons"],["Onada curta","onada curta"],["Tempesta","tempesta"],["Pluja","pluja"],["Plugim","plugim"],["Probable pluja","pluja probable"],["Poca llum","poca llum"]]
    .forEach(([f,t]) => { if(flags.includes(f) && !why.includes(t) && !(t === "terral" && why.includes("terral fort"))) why.push(t); });
  // primer els motius que ho fan no recomanable
  const PRI = ["poca llum","tempesta","pluja","terral fort","ratxes fortes","massa vent","onada alta","poc vent"];
  why.sort((x, y) => (PRI.includes(x) ? PRI.indexOf(x) : 99) - (PRI.includes(y) ? PRI.indexOf(y) : 99));
  const cl = x => Math.max(0, Math.min(100, Math.round(x)));
  return {score:cl(s), flags, why, wind:cl(pw), wave: p.wave==null ? null : cl(po), hb};
}
// Veredicte en 3 nivells, els mateixos que els colors: verd (Ideal / Bo), taronja (Limitat), vermell (No recomanat)
const verdict = o => { const sc = (o && typeof o === "object") ? o.score : o;
  if(sc==null) return {k:"no", t:"Sense dades", sub:""};
  const k = sc >= 60 ? "ideal" : sc >= 35 ? "marg" : "no";
  const t = sc >= 80 ? "Ideal" : sc >= 60 ? "Bo" : sc >= 35 ? "Limitat" : "No recomanat";
  const why = (o && o.why) || [];
  return {k, t, sub: sc >= 80 ? "" : why.slice(0, 2).join(" · ")}; };

// Codi de 3 colors per a cada valor: verd = bo, taronja = es pot però amb limitacions, vermell = no adequat
function lvWind(w, c){ if(w==null) return null; return (w < c.min || w > c.max) ? "no" : (w < c.iMin || w > c.iMax) ? "marg" : "ideal"; }
function lvGust(g, c){ if(g==null) return null; return g > c.gust ? "no" : g > c.max ? "marg" : "ideal"; }
function lvWave(h, c){ if(h==null) return null; return h > c.wMax ? "no" : h > c.wOk ? "marg" : "ideal"; }
const lvTxt = (k, txt) => k ? `<span class="lv k-${k}">${txt}</span>` : txt;

/* ---------- dades ---------- */
const URL_FC = `https://api.open-meteo.com/v1/forecast?latitude=${LOC.lat}&longitude=${LOC.lon}`+
  "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"+
  "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m"+
  "&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min"+
  "&wind_speed_unit=kn&timezone=Europe%2FMadrid&forecast_days=16";   // 16 dies: el calendari en pot mostrar dues setmanes
const URL_MA = `https://marine-api.open-meteo.com/v1/marine?latitude=${LOC.mlat}&longitude=${LOC.mlon}`+
  "&hourly=wave_height,wave_direction,wave_period,swell_wave_peak_period,sea_surface_temperature"+
  "&current=wave_height,wave_direction,wave_period,sea_surface_temperature"+
  "&cell_selection=sea&timezone=Europe%2FMadrid&forecast_days=16&past_days=1";
// Boia de Barcelona II (Ports de l'Estat, xarxa costanera REDCOS): 41,32 N 2,20 E, 68 m de fondària, ~20 km al SO del Masnou.
// Mesura cada hora l'altura significant (Hm0), l'altura màxima, el període de pic i la direcció de procedència.
const BUOY = {name:"boia de Barcelona", url:"https://portus.puertos.es/portussvr/api/RTData/station/1731?locale=es", params:[13,17,34,20]};
let BU = store.get("ov2_buoy") || {at:0, hours:{}};
const HMAX_K = 1.6; // l'onada més alta d'una hora sol ser ~1,6 vegades l'altura significant (a la boia avui: 1,4–2,2)
const STATIONS = {
  ocata:  {name:"Ocata", url:"https://ocata2.meteoelmasnou.cat/meteotemplateLive.txt"},
  masnou: {name:"El Masnou",  url:"https://www.meteoelmasnou.cat/meteotemplateLive.txt"},
  // Badalona (Dalt de la Vila, uns 600 m terra endins i en alçada): mateix sistema (Meteotemplate) i mateixa xarxa meteoelmasnou.cat
  badalona: {name:"Badalona", url:"https://badalona.meteoelmasnou.cat/meteotemplateLive.txt"},
  // Port de Barcelona, estació Bocana Nord (dades obertes CC BY-SA 4.0): CSV cada 10 min en m/s, hora UTC; + històric de 3 dies.
  // Sense CORS: al navegador falla i l'app mostra «sense dades · model»; a l'APK va per la petició nativa.
  portbcn: {name:"Port BCN", long:"Port de Barcelona · estació Bocana Nord", type:"pbcn", unit:"ms", maxAge:60,
    info:"Mesura cada 10 min, però el port publica les dades en blocs: poden arribar amb 30–40 min de retard.",
    url:"https://opendata.portdebarcelona.cat/dataset/1afd4f4d-f329-4959-b1d3-252d973a9c3b/resource/d4263236-5d2a-486e-9ba9-9c4cb27ddc8a/download/14-bocananord_opd_10m.csv",
    hist:"https://opendata.portdebarcelona.cat/dataset/1afd4f4d-f329-4959-b1d3-252d973a9c3b/resource/b724b1e7-26e3-4c6f-80d1-65a0b507065f/download/14-bocananord_opd_10m_hist.csv"},
  // CN Vilassar de Mar (Davis Vantage Pro2, sensor a 10 m), Weathercloud: JSON amb vent en m/s, sense ratxa, cada ~10 min. Sense CORS (com el port).
  // Weathercloud: sense la capçalera X-Requested-With torna una resposta buida
  vilassar: {name:"CN Vilassar", long:"Club Nàutic Vilassar de Mar (Weathercloud)", type:"wcloud", headers:{"X-Requested-With":"XMLHttpRequest"}, unit:"ms", maxAge:30, info:"Vent mitjà i direcció cada ~10 min; no dona ratxa.", url:"https://app.weathercloud.net/device/values/0732654059"}
};
const MS = 1.943844;
// Port de Barcelona: CSV → registres {t, wind, gust, dir} en nusos (TIMESTAMP en UTC; «NAN» = sense dada)
function pbcnParse(txt){
  let L = txt.trim().split(/\r?\n/); const hi = L.findIndex(l => l.includes('"TIMESTAMP"') || l.startsWith("TIMESTAMP")); if(hi < 0) return []; L = L.slice(hi); if(L.length < 2) return [];
  const H = L[0].split(",").map(s => s.replace(/"/g, "").trim()), ix = n => H.indexOf(n);
  const iT = ix("TIMESTAMP"), iW = ix("VV_S_WVT"), iD = ix("DV_D1_WVT"), iG = ix("VV10m3Seg_Max") >= 0 ? ix("VV10m3Seg_Max") : ix("VV_Max");
  const num = v => { const n = parseFloat(String(v).replace(/"/g, "")); return Number.isFinite(n) ? n : null; };
  return L.slice(1).map(r => { const c = r.split(","), m = (c[iT] || "").match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); if(!m) return null;
    const w = num(c[iW]), g = num(c[iG]);
    return {t: Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]), wind: w == null ? null : w*MS, gust: g == null ? null : g*MS, dir: num(c[iD]), temp: null}; })
    .filter(Boolean).sort((a, b) => a.t - b.t);
}
// Per defecte, El Masnou: l'anemòmetre de l'estació d'Ocata està arrecerat i marca un 40–80 % del vent real (comprovat oct. 2026)
let stKey = store.get("ov2_station_v3"); if(!LOC.stations.includes(stKey)) stKey = LOC.st;

async function getJSON(u){ const r = await fetch(u, {cache:"no-store"}); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }
// Estacions (meteoelmasnou.cat): a l'app Android, petició nativa (la WebView les bloqueja); si falla, fetch normal.
async function stFetch(u, headers){
  if(window.OV_NATIVE && OV_NATIVE.http){ try{ return await OV_NATIVE.http(u, headers); }catch(e){} }
  return fetch(u, {cache:"no-store", headers: headers || {}});
}
function build(fc, ma){
  const hours = {}, H = fc.hourly;
  H.time.forEach((t,i) => { hours[t] = {t, temp:H.temperature_2m[i], pp:H.precipitation_probability?.[i], code:H.weather_code[i],
    wind:H.wind_speed_10m[i], dir:H.wind_direction_10m[i], gust:H.wind_gusts_10m[i], wave:null, wdir:null, per:null, sst:null}; });
  if(ma && ma.hourly){ const M = ma.hourly;
    M.time.forEach((t,i) => { const h = hours[t]; if(!h) return;
      h.wave = M.wave_height?.[i] ?? null; h.wdir = M.wave_direction?.[i] ?? null; h.per = M.wave_period?.[i] ?? null; h.tp = M.swell_wave_peak_period?.[i] ?? null; h.sst = M.sea_surface_temperature?.[i] ?? null; }); }
  const mwave = {}; if(ma && ma.hourly) ma.hourly.time.forEach((t,i) => { const v = ma.hourly.wave_height?.[i]; if(v != null) mwave[t] = v; });
  const c = fc.current || {}, mc = (ma && ma.current) || {};
  return { base: hours, hours, mwave, daily: fc.daily, fetchedAt: new Date().toISOString(), marineOk: !!(ma && ma.hourly),
    nowBase: {t:c.time, temp:c.temperature_2m, code:c.weather_code, wind:c.wind_speed_10m, dir:c.wind_direction_10m, gust:c.wind_gusts_10m,
      wave:mc.wave_height ?? null, per:mc.wave_period ?? null, wdir:mc.wave_direction ?? null, sst:mc.sea_surface_temperature ?? null} };
}
/* ---------- models de previsió ---------- */
// «Automàtic» = la millor combinació d'Open-Meteo. AROME (Météo-France, 1,3–2,5 km) arriba a ~2 dies i ARPEGE el continua
// fins a ~4 dies; més enllà, i per als camps que no té, s'omple amb l'automàtic.
const MODELS = {
  arome: {label:"AROME", api:"meteofrance_seamless", long:"AROME (Météo-France)"},
  auto:  {label:"Open-Meteo", api:null, long:"Open-Meteo (barreja els models que funcionen millor a cada zona i termini)"},
  ecmwf: {label:"ECMWF", api:"ecmwf_ifs", long:"ECMWF IFS 9 km (centre europeu)"},
  icon:  {label:"ICON", api:"icon_eu", long:"ICON-EU (servei alemany, DWD)"},
  ukmo:  {label:"UKMO", api:"ukmo_global_deterministic_10km", long:"UKMO Global 10 km (Met Office britànic)"},
  opt:   {label:"Optimista", api:null, long:"Per a cada hora, el model més favorable"},
  pes:   {label:"Pessimista", api:null, long:"Per a cada hora, el model més desfavorable"}
};
// Preferència: «best» = el model que més encerta avui respecte l'estació (per defecte), o un model fix triat per l'usuari
// Models que es demanen a part i es comparen amb l'estació: [clau, nom a l'API d'Open-Meteo]
const ALT_MODELS = ["arome","ecmwf","icon","ukmo"].map(k => [k, MODELS[k].api]);
let modelPref = store.get("ov2_model_pref") || "best"; if(modelPref !== "best" && !MODELS[modelPref]) modelPref = "best";
let model = "auto";
function pickModel(){
  if(modelPref !== "best") return modelPref;
  const errs = modelErrors().filter(e => e.n >= 3);
  if(!errs.length){   // encara no hi ha prou hores mesurades avui: el que més ha encertat els últims 30 dies, o el millor de l'últim cop
    const h = encertsResum(30).filter(x => x.dies >= 5);
    return h.length ? h[0].k : (store.get("ov2_model_best") || "auto");
  }
  const best = errs.sort((a, b) => a.mae - b.mae)[0].k; store.set("ov2_model_best", best); return best;
}
const URL_ALT = `https://api.open-meteo.com/v1/forecast?latitude=${LOC.lat}&longitude=${LOC.lon}`+
  "&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&models="+ALT_MODELS.map(m => m[1]).join(",")+
  "&wind_speed_unit=kn&timezone=Europe%2FMadrid&forecast_days=7";
function parseAlt(j){
  if(!j || !j.hourly) return null; const H = j.hourly, out = {};
  ALT_MODELS.forEach(([, m]) => { const o = {};
    H.time.forEach((t,i) => { const w = H["wind_speed_10m_"+m]?.[i]; if(w == null) return;
      o[t] = {wind:w, gust:H["wind_gusts_10m_"+m]?.[i] ?? null, dir:H["wind_direction_10m_"+m]?.[i] ?? null, temp:H["temperature_2m_"+m]?.[i] ?? null}; });
    out[m] = o; });
  return out;
}
// Construeix DATA.hours a partir de la base (automàtic) i del model triat
function applyModel(){
  if(!DATA || !DATA.base) return;
  model = pickModel();
  const hours = {}; let lastAlt = null;
  const withAlt = (b, a, k) => Object.assign({}, b, {wind:a.wind, gust:a.gust ?? b.gust, dir:a.dir ?? b.dir, temp:a.temp ?? b.temp, src:k});
  if(model === "opt" || model === "pes"){
    // Optimista / pessimista: per a cada hora, el model que dona millor / pitjor valoració per a l'embarcació triada
    const c = crit[act], alts = ALT_MODELS.map(([k, m]) => [k, DATA.alt?.[m]]);
    for(const t in DATA.base){ const b = DATA.base[t]; let best = Object.assign({}, b, {src:"auto"}), bs = scoreHour(best, c).score ?? -1;
      alts.forEach(([k, src]) => { const a = src && src[t]; if(!a) return; const h = withAlt(b, a, k), sc = scoreHour(h, c).score ?? -1;
        if(model === "opt" ? sc > bs : sc < bs){ best = h; bs = sc; } });
      hours[t] = best; }
  } else {
    const alt = MODELS[model].api && DATA.alt ? DATA.alt[MODELS[model].api] : null;
    for(const t in DATA.base){ const b = DATA.base[t], a = alt && alt[t];
      hours[t] = a ? withAlt(b, a, model) : Object.assign({}, b, {src:"auto"});
      if(a) lastAlt = t; }
  }
  DATA.hours = hours; DATA.modelEnd = lastAlt;
  applyWaves();
  const h = hours[nowKey()];
  DATA.now = Object.assign({}, DATA.nowBase, h && h.src !== "auto" ? {wind:h.wind, gust:h.gust, dir:h.dir, temp:h.temp} : {});
  if(h) Object.assign(DATA.now, {wave:h.wave, hmax:h.hmax, hmaxE:h.hmaxE, tp:h.tp, wdir:h.wdir ?? DATA.now.wdir, wobs:h.wobs, wcorr:h.wcorr});
  const lb = lastBuoy(); if(lb && buoySwell(lb) && Date.now() - lb.t < 3*3600e3) Object.assign(DATA.now, {wave:lb.hs, hmax:lb.hmax ?? +(lb.hs*HMAX_K).toFixed(2), hmaxE:lb.hmax == null, tp:lb.tp ?? DATA.now.tp, wdir:lb.dir ?? DATA.now.wdir, wobs:true, wcorr:false, wat:lb.t});
}
/* ---------- onatge: mesura de la boia i correcció de la previsió ---------- */
const localKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
// La boia és a Barcelona (mar oberta, 68 m): només representa el Masnou quan hi ha mar de fons (període ≥ 7 s),
// que arriba igual a tota la costa. La mar de vent curta de Barcelona no arriba al Masnou (comprovat 11 oct.: boia 0,4–0,55 m, platja ≈ 0,2 m).
const buoySwell = b => !!(b && b.tp != null && b.tp >= 7);
const lastBuoy = () => { const ks = Object.keys(BU.hours || {}).sort(); return ks.length ? BU.hours[ks[ks.length-1]] : null; };
// Quant s'ha equivocat el model (a la cel·la del Masnou) respecte la boia les darreres 12 hores mesurades
function waveFactor(){
  if(!DATA) return null; const nk = nowKey(), mw = DATA.mwave || {};
  const pairs = Object.keys(BU.hours || {}).filter(k => k <= nk).sort().reverse()
    .filter(k => buoySwell(BU.hours[k])).map(k => [BU.hours[k].hs, mw[k] ?? DATA.base[k]?.wave]).filter(([b, m]) => b != null && m != null && m > 0.05).slice(0, 12);
  if(pairs.length < 4) return null;
  const b = pairs.reduce((a, p) => a + p[0], 0) / pairs.length, m = pairs.reduce((a, p) => a + p[1], 0) / pairs.length;
  return {f: Math.min(2, Math.max(0.6, b / m)), buoy: b, model: m, n: pairs.length};
}
// Hores passades: mesura real de la boia. Hores futures: previsió × factor de correcció, que s'esvaeix en 48 h
function applyWaves(){
  const wf = waveFactor(), nk = nowKey(), now = Date.now(); DATA.wf = wf;
  for(const t in DATA.hours){ const h = DATA.hours[t], b = BU.hours?.[t];
    if(b && t <= nk && buoySwell(b)){ Object.assign(h, {wave:b.hs, hmax:b.hmax, tp:b.tp ?? h.tp, wdir:b.dir ?? h.wdir, wobs:true, wfc:h.wave}); continue; }
    if(h.wave != null && wf && Math.abs(wf.f - 1) > 0.05){
      const lead = Math.max(0, (new Date(t).getTime() - now) / 3600e3), w = Math.max(0, 1 - lead / 48);
      if(w > 0){ h.wfc = h.wave; h.wave = +(h.wave * (1 + (wf.f - 1) * w)).toFixed(2); h.wcorr = true; } }
    if(h.hmax == null && h.wave != null){ h.hmax = +(h.wave * HMAX_K).toFixed(2); h.hmaxE = true; }
  }
}
async function loadBuoy(){
  try{
    const r = await fetch(BUOY.url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(BUOY.params), cache:"no-store"});
    if(!r.ok) throw 0;
    const hours = {};
    (await r.json()).forEach(row => { const m = (row.fecha || "").match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); if(!m) return;
      const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5])), o = {};          // Portus dona les hores en UTC
      (row.datos || []).forEach(x => { if(x.valor != null && x.valor !== "" && !x.averia) o[x.paramEseoo] = +x.valor / (x.factor || 1); });
      if(o.Hm0 != null) hours[localKey(d)] = {hs:o.Hm0, hmax:o.Hmax ?? null, tp:o.Tp ?? null, dir:o.MeanDir ?? null, t:d.getTime()}; });
    if(Object.keys(hours).length){ BU = {at:Date.now(), hours}; store.set("ov2_buoy", BU); }
  }catch(e){}
  if(DATA){ applyModel(); renderNow(); renderHours(); renderWeek(); if(window.renderWindMap) renderWindMap(); if(window.renderPrep) renderPrep(); }
}
/* ---------- historial d'encerts dels models (el desa GitHub Actions a data/encerts.json) ---------- */
let ENC = null;
const TIPUS_VENT = {terral:"Terral", marinada:"Marinada", llevant:"Llevant", garbi:"Garbí"};
async function loadEncerts(){
  try{ ENC = await getJSON("data/encerts.json?t=" + Date.now()); }catch(e){ ENC = null; }
  if(DATA){ applyModel(); render(); }
}
// Tipus de vent d'un dia amb l'orientació del mar d'aquest club (COAST): mateix criteri que tipusVent de scripts/llocs.mjs.
// Es recalcula aquí perquè el club pot corregir l'orientació al plànol; si el dia no té direcció, es fa servir el desat.
function tipusDia(d){
  if(d.dir == null || d.vent == null) return d.tipus || null;
  if(d.vent < 3) return "calma";
  if(isOffshore(d.dir)) return "terral";
  let rel = norm(d.dir - COAST); if(rel > 180) rel -= 360;   // des de la direcció del mar: marinada de −10° a +65°, llevant per l'esquerra, garbí per la dreta
  if(rel >= -10 && rel <= 65) return "marinada";
  return rel < -10 ? "llevant" : "garbi";
}
// Error mitjà de cada model (mitjana dels errors diaris) a la ubicació actual, dels últims «dies» dies i, si es vol, d'un tipus de vent
function encertsResum(dies, tipus){
  if(!ENC || !Array.isArray(ENC.dies)) return [];
  const d0 = new Date(Date.now() - dies*864e5), since = `${d0.getFullYear()}-${pad(d0.getMonth()+1)}-${pad(d0.getDate())}`, acc = {};
  ENC.dies.filter(d => d.loc === locKey && d.data >= since && (!tipus || tipusDia(d) === tipus)).forEach(d => {
    for(const k in d.models){ const a = acc[k] = acc[k] || {s:0, dies:0}; a.s += d.models[k].mae; a.dies++; } });
  return Object.entries(acc).filter(([k]) => MODELS[k]).map(([k, a]) => ({k, mae:a.s/a.dies, dies:a.dies})).sort((a, b) => a.mae - b.mae);
}
// Error mitjà del vent previst respecte l'estació en les hores ja passades d'avui
function modelErrors(){
  if(!DATA || !DATA.base || OBS.key !== stKey) return [];
  const rows = [["auto", DATA.base], ...ALT_MODELS.map(([k, m]) => [k, DATA.alt?.[m]])];
  return rows.map(([k, src]) => { let sum = 0, n = 0;
    for(const t in OBS.hours){ if(t >= nowKey()) continue; const o = OBS.hours[t], f = src && src[t]; if(o.wind != null && f && f.wind != null){ sum += Math.abs(o.wind - f.wind); n++; } }
    return {k, mae: n ? sum/n : null, n}; }).filter(x => x.mae != null);
}
function showMsg(text, err){ const m = $("msg"); m.hidden = !text; m.textContent = text || ""; m.className = "msg"+(err?" err":""); }
async function load(){
  try{
    const [fc, ma, alt] = await Promise.all([getJSON(URL_FC), getJSON(URL_MA).catch(() => getJSON(URL_MA.replace("forecast_days=16", "forecast_days=8"))).catch(()=>null), getJSON(URL_ALT).catch(()=>null)]);
    DATA = build(fc, ma); DATA.alt = parseAlt(alt); applyModel();
    const {hours, ...toCache} = DATA; store.set("ov2_cache_" + locKey, toCache);
    showMsg(DATA.marineOk ? "" : "Sense dades d'onatge ara mateix: la valoració només té en compte el vent.");
  }catch(e){
    const cached = store.get("ov2_cache_" + locKey) || (locKey === "masnou" ? store.get("ov2_cache") : null);
    if(cached){ DATA = cached; if(!DATA.base){ DATA.base = DATA.hours; DATA.nowBase = DATA.now; } applyModel(); showMsg("Sense connexió. Mostro la previsió desada el "+stamp(cached.fetchedAt)+".", true); }
    else { showMsg("No s'ha pogut carregar la previsió. Comprova la connexió i torna-ho a provar.", true); return; }
  }
  render();
}
// Si l'estació triada no envia vent (sensor aturat: el fitxer només porta pressió, pluja…), es fa servir la
// següent de la llista que en tingui, i la capçalera ho indica amb «↪».
const stNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
async function stRead(key){
  const S = STATIONS[key], r = await stFetch(S.url+"?t="+Date.now(), S.headers);
  if(!r.ok) throw new Error("HTTP "+r.status);
  if(S.type === "pbcn"){ const L = pbcnParse(await r.text()), o = L[L.length-1]; return o && o.wind != null ? Object.assign({key, hum:null, pres:null, at:o.t}, o) : null; }
  if(S.type === "wcloud"){ const j = await r.json(), W = stNum(j.wspdavg ?? j.wspd); if(W == null) return null;
    return {key, wind:W*MS, gust:null, dir:stNum(j.wdiravg ?? j.wdir), temp:stNum(j.temp), hum:stNum(j.hum), pres:stNum(j.bar), at:(stNum(j.epoch)||0)*1000}; }
  const j = await r.json(), W = stNum(j.W);
  if(W == null) return null;
  const G = stNum(j.G);
  return {key, wind:W*KMH, gust:G == null ? null : G*KMH, dir:stNum(j.B), temp:stNum(j.T), hum:stNum(j.H), pres:stNum(j.P), at:(stNum(j.U)||0)*1000};
}
async function loadStation(){
  if(!STATIONS[stKey]){ ST = null; if(DATA) renderNow(); return null; }   // club sense estació: només previsió
  const want = stKey, order = [want, ...LOC.stations.filter(k => k !== want)];
  let got = null;
  for(const k of order){ try{ got = await stRead(k); }catch(e){ got = null; } if(got && Date.now() - got.at < stMaxAge(k)) break; got = null; }
  if(want === stKey) ST = got;
  if(DATA) renderNow();
  return ST;
}
/* ---------- registres horaris de l'estació (avui) ---------- */
// Mateixa consulta que la «Taula interactiva» de la web: Avui, per hores, vent mitjà, ratxa màx., direcció i temperatura
let OBS = {key:null, at:0, hours:{}};
const UNIT_KN = {kmh:0.539957, "km/h":0.539957, ms:1.943844, "m/s":1.943844, mph:0.868976, kt:1, kn:1, kts:1};
const OBS_PARAMS = "avgbracketLWbracketR,maxbracketLGbracketR,avgbracketLBbracketR,avgbracketLTbracketR";
const fmtLocal = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// Registres de 5 minuts de l'estació (consulta «Taula interactiva», agrupació «Tot»), en nusos
async function stationRecords(key, interval, fromMs, toMs){
  const S = STATIONS[key];
  if(S.type === "wcloud") throw new Error("sense historial");
  if(S.type === "pbcn"){   // històric de 3 dies del port, retallat a l'interval
    const [r, r2] = await Promise.all([stFetch(S.hist+"?t="+Date.now()), stFetch(S.url+"?t="+Date.now()).catch(() => null)]); if(!r.ok) throw new Error("HTTP "+r.status);
    const extra = r2 && r2.ok ? pbcnParse(await r2.text()) : [];
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const a = interval === "today" ? d0.getTime() : (fromMs || 0), b = interval === "today" ? Date.now() : (toMs || Date.now());
    const by = new Map(); [...pbcnParse(await r.text()), ...extra].forEach(o => by.set(o.t, o));
    return [...by.values()].sort((x, y) => x.t - y.t).filter(o => o.t >= a && o.t <= b);
  }
  const base = new URL(S.url).origin;
  const q = `value=all&interval=${interval}&from=${fromMs ? encodeURIComponent(fmtLocal(fromMs)) : ""}&to=${toMs ? encodeURIComponent(fmtLocal(toMs)) : ""}&parameters=${OBS_PARAMS}`;
  const r = await stFetch(base+"/pages/station/tableAjax.php?"+q+"&t="+Date.now()); if(!r.ok) throw new Error("HTTP "+r.status);
  const doc = new DOMParser().parseFromString(await r.text(), "text/html");
  const unitTxt = (doc.querySelector("thead th:nth-child(2)")?.textContent || "").toLowerCase();
  const f = UNIT_KN[((unitTxt.match(/\(([^)]+)\)/) || [])[1] || "").replace(/\s/g,"")] ?? KMH;
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const out = [];
  doc.querySelectorAll("tbody tr").forEach(tr => {
    const td = [...tr.children].map(x => x.textContent.trim()); const m = td[0]?.match(/(\d\d)[\/.](\d\d)[\/.](\d{2,4})\s+(\d\d)[:.](\d\d)/); if(!m) return;   // 12/10/26 14:05 o 12.10.2026 14.05
    const w = num(td[1]), g = num(td[2]);
    out.push({t: new Date(m[3].length === 4 ? +m[3] : 2000 + +m[3], +m[2]-1, +m[1], +m[4], +m[5]).getTime(), wind: w==null?null:w*f, gust: g==null?null:g*f, dir: num(td[3]), temp: num(td[4])});
  });
  return out.sort((a,b) => a.t - b.t);
}
// Direcció mitjana vectorial (ponderada pel vent): 350° i 10° fan 0°, no 180°
function vecDir(list){ let x = 0, y = 0; list.forEach(o => { if(o.dir!=null){ const w = Math.max(o.wind||0, 0.1); x += Math.sin(o.dir*Math.PI/180)*w; y += Math.cos(o.dir*Math.PI/180)*w; } }); return (x||y) ? norm(Math.atan2(x,y)*180/Math.PI) : null; }
async function loadObs(){
  const key = stKey; if(!STATIONS[key]) return;
  try{
    let recs = await stationRecords(key, "today"), recs24 = recs;
    if(recs.length < 12) try{ recs24 = await stationRecords(key, "custom", Date.now() - 24*3600e3, Date.now()); }catch(e){}
    const by = {};
    recs.forEach(o => { const d = new Date(o.t), k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`; (by[k] = by[k] || []).push(o); });
    const hours = {};
    for(const k in by){ const L = by[k], ws = L.map(o=>o.wind).filter(v=>v!=null), gs = L.map(o=>o.gust).filter(v=>v!=null), ts = L.map(o=>o.temp).filter(v=>v!=null);
      hours[k] = {wind: ws.length ? ws.reduce((a,b)=>a+b,0)/ws.length : null, gust: gs.length ? Math.max(...gs) : null, dir: vecDir(L), temp: ts.length ? ts.reduce((a,b)=>a+b,0)/ts.length : null, n: L.length}; }
    if(key === stKey){ OBS = {key, at: Date.now(), hours, recs: recs24, recs24h: recs24 !== recs}; if(DATA){ applyModel(); renderNow(); renderHours(); renderWeek(); if(window.renderWindMap) renderWindMap(); if(window.renderPrep) renderPrep(); } }
  }catch(e){}
}
// Hora combinada: mesura real de l'estació per a les hores passades i l'actual; previsió per a la resta
function hourAt(date, h){
  const k = hourKey(date, h), f = DATA.hours[k]; if(!f) return null;
  const o = OBS.key === stKey ? OBS.hours[k] : null;
  if(o && o.wind != null && k <= nowKey()) return Object.assign({}, f, {wind:o.wind, gust:o.gust ?? f.gust, dir:o.dir ?? f.dir, temp:o.temp ?? f.temp, obs:true, fc:f});
  return f;
}
const stMaxAge = k => (STATIONS[k]?.maxAge || 30) * 60e3;   // el port publica a blocs: fins a 60 min
const stFresh = () => !!(ST && ST.wind != null && (Date.now() - ST.at) < stMaxAge(ST.key));
const stamp = iso => { const d = new Date(iso); return d.toLocaleDateString("ca",{day:"numeric",month:"short"})+" a les "+d.toLocaleTimeString("ca",{hour:"2-digit",minute:"2-digit"}); };
const hourKey = (date,h) => date+"T"+pad(h)+":00";
const nowKey = () => (DATA?.now?.t || new Date().toISOString()).slice(0,13)+":00";
const todayDate = () => DATA.daily.time.find(d => d === nowKey().slice(0,10)) || DATA.daily.time[0];
// Previsió de vent per a un instant qualsevol (la fa servir el registre de sortides)
function forecastAt(ms){
  if(!DATA) return null; const d = new Date(ms);
  const k = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
  return DATA.hours[k] || null;
}

function slotAgg(date, slot, c){
  const hs = slot.hours.map(h => hourAt(date,h)).filter(Boolean);
  if(!hs.length) return null;
  const vals = f => hs.map(f).filter(x=>x!=null);
  const avg = f => { const v = vals(f); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; };
  const max = f => { const v = vals(f); return v.length ? Math.max(...v) : null; };
  let sx=0, sy=0; hs.forEach(h => { if(h.dir!=null && h.wind!=null){ sx += Math.sin(h.dir*Math.PI/180)*h.wind; sy += Math.cos(h.dir*Math.PI/180)*h.wind; }});
  const dir = (sx||sy) ? norm(Math.atan2(sx,sy)*180/Math.PI) : null;
  const sc = hs.map(h => scoreHour(h,c));
  const ss = sc.map(s=>s.score).filter(s=>s!=null);
  let score = ss.length ? Math.round(Math.min(ss.reduce((a,b)=>a+b,0)/ss.length, Math.min(...ss)+25)) : null;
  const gmax = Math.max(...hs.map(h => h.gust ?? 0));
  if(score != null && gmax > c.gust) score = Math.min(score, 25);   // la ratxa màxima de la franja també compta
  return {wind:avg(h=>h.wind), gust:max(h=>h.gust), dir, wave:max(h=>h.wave), per:avg(h=>h.per), temp:avg(h=>h.temp), sst:avg(h=>h.sst),
    code:max(h=>h.code), score, flags:[...new Set(sc.flatMap(s=>s.flags))], why:[...new Set(sc.flatMap(s=>s.why || []))], past: hs[hs.length-1].t < nowKey()};
}

/* ---------- indicador d'idoneïtat ---------- */
// Valoració de la portada: mitjana de l'última hora mesurada i de les 2 hores següents de previsió
function scoreWindow(n, c){
  const now = Date.now(), recs = OBS.key === stKey ? (OBS.recs || []).filter(o => o.t >= now - 3600e3 && o.wind != null) : [];
  const last = recs.length ? Object.assign({}, n, {wind: recs.reduce((a,o)=>a+o.wind,0)/recs.length, gust: Math.max(...recs.map(o => o.gust ?? o.wind)), dir: vecDir(recs) ?? n.dir}) : n;
  const nk = nowKey(), d = new Date(nk.slice(0,13) + ":00:00");
  const next = [1, 2].map(i => { const x = new Date(d.getTime() + i*3600e3); return DATA.hours[localKey(x)]; }).filter(Boolean);
  const all = [last, ...next].map(p => scoreHour(p, c)).filter(r => r.score != null);
  if(!all.length) return scoreHour(n, c);
  const avg = f => { const v = all.map(f).filter(x => x != null); return v.length ? Math.round(v.reduce((a,b)=>a+b,0)/v.length) : null; };
  const PRI = ["poca llum","tempesta","pluja","terral fort","ratxes fortes","massa vent","onada alta","poc vent"];
  const W = new Set(all.flatMap(r => r.why));
  // en ajuntar 3 hores, el motiu fort amaga el seu grau suau: «poc vent» i «vent fluix» no surten tots dos
  [["poc vent","vent fluix"],["massa vent","vent fort"],["ratxes fortes","vent a ràfagues"],["onada alta","onada"],["terral fort","terral"],["pluja","pluja probable"],["pluja","plugim"]].forEach(([a, b]) => { if(W.has(a)) W.delete(b); });
  const why = [...W].sort((x, y) => (PRI.includes(x) ? PRI.indexOf(x) : 99) - (PRI.includes(y) ? PRI.indexOf(y) : 99));
  return {score: avg(r => r.score), wind: avg(r => r.wind), wave: avg(r => r.wave), flags: [...new Set(all.flatMap(r => r.flags))], why, n: all.length};
}
// Indicador circular: anell exterior = idoneïtat global (per trams de color), anells interiors = vent (blanc/negre) i onades (blau)
const kOf = sc => sc==null ? "no" : sc >= 60 ? "ideal" : sc >= 35 ? "marg" : "no";
function gaugeSvg(s0, v){
  // els arcs es dibuixen amb el mateix valor arrodonit que es mostra (x/10), perquè la llargada quadri amb el número
  const q = x => x == null ? null : Math.round(x/10)*10, s = Object.assign({}, s0, {score: q(s0.score), wind: q(s0.wind), wave: q(s0.wave)});
  const score = s.score, P = (a, r) => [Math.sin(a*Math.PI/180)*r, -Math.cos(a*Math.PI/180)*r];
  const arc = (a0, a1, r) => { const [x0,y0] = P(a0,r), [x1,y1] = P(a1,r); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const ring = (val, r, w, color, track) => { let g = `<circle r="${r}" fill="none" stroke="${track}" stroke-width="${w}"/>`;
    if(val > 0) g += `<path d="${arc(0, Math.min(359.9, val/100*360), r)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`; return g; };
  let g = `<circle r="109" fill="none" stroke="var(--line)" stroke-width="1.2"/>`;
  // anell global, acolorit per trams (vermell < 35, taronja < 60, verd)
  g += `<circle r="100" fill="none" stroke="var(--grid)" stroke-width="12"/>`;
  // degradat continu: vermell a dalt → taronja cap a 5 → verd a 10 (trams petits, perquè l'SVG no té degradat cònic)
  const gcol = f => f < 0.5 ? `color-mix(in srgb, var(--marg) ${Math.round(f/0.5*100)}%, var(--no))` : `color-mix(in srgb, var(--ideal) ${Math.round((f-0.5)/0.5*100)}%, var(--marg))`;
  if(score > 0){ const end = Math.min(359.9, score/100*360), st = 3;
    const [cx0,cy0] = P(0, 100); g += `<circle cx="${cx0}" cy="${cy0}" r="6" fill="${gcol(0)}"/>`;
    for(let a = 0; a < end; a += st){ const a1 = Math.min(end, a + st + 0.6); g += `<path d="${arc(a, a1, 100)}" fill="none" stroke="${gcol(a/360)}" stroke-width="12"/>`; }
    const [ex,ey] = P(end, 100); g += `<circle cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="6" fill="${gcol(end/360)}"/>`; }
  g += ring(s.wave ?? 0, 88, 6, "var(--wave-l)", "color-mix(in srgb, var(--wave-l) 14%, transparent)");
  g += ring(s.wind ?? 0, 79, 6, "var(--ink)", "color-mix(in srgb, var(--ink) 10%, transparent)");
  g += `<path d="M0 -107 l-6 -9 h12 z" fill="var(--ideal)"/>`;
  const n10 = x => x==null ? "–" : String(Math.round(x/10));
  g += `<text y="-22" text-anchor="middle" font-family="Rajdhani,sans-serif" font-weight="700" font-size="48" fill="var(--${v.k})">${n10(score)}<tspan font-size="18" fill="var(--muted)" dx="2">/10</tspan></text>`;
  g += `<text y="-2" text-anchor="middle" font-family="Rajdhani,sans-serif" font-weight="700" font-size="16" fill="var(--${v.k})" letter-spacing=".5">${esc(v.t.toUpperCase())}</text>`;
  const mini = (x, val, lbl, ic) => { const r = 16, cy = 32, a = (d) => { const t = (180 + d) * Math.PI/180; return [x + Math.cos(t)*r, cy + Math.sin(t)*r]; };
    const [sx,sy] = a(0), [ex,ey] = a(Math.max(0.1, (val ?? 0)/100*180)), k = kOf(val);
    return `<path d="M${x-r} ${cy} A${r} ${r} 0 0 1 ${x+r} ${cy}" fill="none" stroke="var(--grid)" stroke-width="4" stroke-linecap="round"/>`+
      (val ? `<path d="M${sx.toFixed(1)} ${sy.toFixed(1)} A${r} ${r} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="${ic === "w" ? "var(--ink)" : "var(--wave-l)"}" stroke-width="4" stroke-linecap="round"/>` : "")+
      `<g transform="translate(${x-7} ${cy-14})" fill="none" stroke="${ic === "w" ? "var(--ink)" : "var(--wave-l)"}" stroke-width="1.6" stroke-linecap="round">${ic === "w" ? `<path d="M1 4h7a2 2 0 1 0-2-2M1 7h10a2 2 0 1 1-2 2M1 10h5"/>` : `<path d="M0 8c2-3 4-3 6 0s4 3 6 0M0 11c2-3 4-3 6 0s4 3 6 0"/>`}</g>`+
      `<text x="${x}" y="${cy+11}" text-anchor="middle" font-family="Rajdhani,sans-serif" font-weight="700" font-size="10" fill="var(--muted)" letter-spacing=".6">${lbl}</text>`+
      `<text x="${x}" y="${cy+26}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-weight="700" font-size="14" fill="var(--ink)">${n10(val)}<tspan font-size="8" fill="var(--muted)">/10</tspan></text>`; };
  g += mini(-32, s.wind, "VENT", "w") + mini(32, s.wave, "ONADES", "o");
  return `<svg viewBox="-114 -120 228 230" role="img" aria-label="Idoneïtat ${esc(v.t)}: ${n10(score)} sobre 10; vent ${n10(s.wind)}, onades ${n10(s.wave)}">${g}</svg>`;
}

/* ---------- rosa dels vents ---------- */
// Rosa dels vents amb histograma del dia: barres cada 10°, llargada = temps que ha bufat d'aquella direcció.
// Cada barra s'apila per idoneïtat per a l'embarcació triada (verd → taronja → vermell, del centre enfora).
// Lectura i previsió no es distingeixen: les hores ja passades vénen de l'estació, les que falten de la previsió.
const ROSE_LAYERS = ["ideal","marg","no"];
function roseHist(recs, fc, c){
  c = c || crit[act];
  const sec = Array.from({length:36}, () => [0,0,0]);
  const add = (p, min) => { if(p.dir==null) return; const k = kOf(scoreHour(p, c).score); sec[Math.round(norm(p.dir)/10) % 36][ROSE_LAYERS.indexOf(k)] += min; };
  const R = (recs || []).filter(o => o.dir!=null && o.wind!=null && o.wind >= 0.5);
  // la lectura només porta vent: l'onada, la pluja i la llum de la mateixa hora surten de la previsió
  R.forEach((o, i) => { const nx = R[i+1] || R[i-1]; const step = nx ? Math.min(30, Math.max(1, Math.abs(nx.t - o.t)/60000)) : 10;
    const fh = DATA?.hours?.[localKey(new Date(o.t))] || {};
    add(Object.assign({}, fh, {wind:o.wind, gust:o.gust ?? null, dir:o.dir}), step); });
  (fc || []).forEach(h => { if(h.wind!=null && h.wind >= 0.5) add(h, 60); });
  return sec;
}
// Hores de previsió d'avui que queden (de la propera hora fins a la posta)
function roseForecast(){
  if(!DATA) return []; const td = todayDate(), i = DATA.daily.time.indexOf(td), set = i >= 0 ? new Date(DATA.daily.sunset[i]).getHours() : 20, nh = +nowKey().slice(11,13);
  // Optimista / Pessimista trien model segons l'embarcació: l'histograma ha de ser el mateix per a totes,
  // així que llavors fa servir el model que més encerta (o la base d'Open-Meteo)
  const per = model === "opt" || model === "pes", bk = store.get("ov2_model_best") || "auto", alt = per && MODELS[bk]?.api ? DATA.alt?.[MODELS[bk].api] : null;
  const out = []; for(let h = nh + 1; h <= set; h++){ const k = hourKey(td, h), p = per ? (alt?.[k] ? Object.assign({}, DATA.base[k], alt[k]) : DATA.base[k]) : DATA.hours[k]; if(p) out.push(p); } return out;
}
// icona d'onada (dibuixada a l'editor d'icones, graella 24×24)
const WAVE_IC = ["M4 10.5C6 8 3 5.5 7 9C9 11 10.5 11 12 9C13.5 7 9.5 5 16.5 9C18 10 19.5 11 18 10","M4 17C6.5 13.5 3 12 7.5 15.5C9 17 10.5 17 12 15C13.5 13 10 11.5 16.5 15C18 16 19.5 17 16.5 15"];
const waveIc = sz => `<svg class="wave-ic" width="${sz}" height="${sz}" viewBox="2 3 18 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${WAVE_IC.map(d => `<path d="${d}"/>`).join("")}</svg>`;
function roseSvg(o){
  const R = 100, ri = 38, Z = o.card ? 1.35 : 1, P = (a, r) => [Math.sin(a*Math.PI/180)*r, -Math.cos(a*Math.PI/180)*r];
  const wedge = (a0, a1, ra, rb, fill, extra) => { const [x0,y0] = P(a0,rb), [x1,y1] = P(a1,rb), [x2,y2] = P(a1,ra), [x3,y3] = P(a0,ra);
    return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${rb} ${rb} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} A${ra} ${ra} 0 0 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z" fill="${fill}"${extra||""}/>`; };
  // Tot el que té direcció va dins #roseRot, que gira amb la brúixola; el centre i el número queden quiets
  const bg = `<circle r="${R}" fill="var(--surface-2)" stroke="var(--line)" stroke-width="1.5"/>`;
  let g = "";
  for(let a=0; a<360; a+=45){ const [x0,y0] = P(a, ri), [x1,y1] = P(a, R-8); g += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`; }
  // histograma
  const H = o.hist, tot = H ? H.map(b => b.reduce((x,y)=>x+y,0)) : [], mx = Math.max(1, ...tot), L = R - 10 - ri;
  if(H) H.forEach((bins, i) => { if(!tot[i]) return; let ra = ri + 1; const a0 = i*10 - 4, a1 = i*10 + 4;
    let cum = 0; bins.forEach((n, b) => { if(!n) return; cum += n; const rb = ri + 1 + Math.sqrt(cum/mx)*L; g += wedge(a0, a1, ra, rb, `var(--${ROSE_LAYERS[b]})`, ' stroke="var(--surface-2)" stroke-width=".6"'); ra = rb; }); });   // escala d'arrel: les direccions amb poca estona també es veuen
  // escala exterior
  for(let a=0; a<360; a+=10){ const big = a%45===0, [x0,y0] = P(a, R), [x1,y1] = P(a, R-(big?9:4));
    g += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${big?"var(--ink)":"var(--muted)"}" stroke-width="${big?2:1}"/>`; }
  // només si l'onada ve gairebé de la mateixa direcció (< 14°) la icona tapa la lletra; si no, totes dues hi caben al seu lloc
  const wHide = o.wdir!=null ? WABBR.findIndex((t,i) => Math.abs(((o.wdir - i*45 + 540) % 360) - 180) < 14) : -1;
  WABBR.forEach((t,i) => { if(i === wHide) return; const [x,y] = P(i*45, R+12*Z); g += `<text x="${x.toFixed(1)}" y="${(y+4*Z).toFixed(1)}" text-anchor="middle" font-size="${11*Z}" font-weight="700" fill="${isOffshore(i*45) ? "var(--marg)" : "var(--sea)"}" font-family="Rajdhani,sans-serif" letter-spacing=".5" class="upr">${t}</text>`; });
  // punts cardinals (N, E, S, O) per fora de les lletres dels vents; si l'onada hi cau a sobre, la lletra no es dibuixa
  if(o.card) ["N","E","S","O"].forEach((t,i) => { let a = i*90; const dw = o.wdir!=null ? ((o.wdir - a + 540) % 360) - 180 : 99;
    if(Math.abs(dw) < 24) a += dw > 0 ? dw - 24 : dw + 24;   // l'onada hi cau a sobre: la lletra es desplaça una mica al costat
    const [x,y] = P(a, R+48);
    g += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><text class="upr" y="7" text-anchor="middle" font-size="21" font-weight="800" fill="var(--ink)" font-family="Rajdhani,sans-serif">${t}</text></g>`; });
  // con de la direcció del vent actual (forma d'abans): de la vora fins al cercle central.
  // Vora del color del text (negra en clar, blanca en fosc), interior segons la idoneïtat i ombra perquè floti sobre les barres
  if(o.dir!=null){ const [x0,y0] = P(o.dir-11, R), [x1,y1] = P(o.dir+11, R), [xc,yc] = P(o.dir, ri-6);
    g += `<g class="needle"><path d="M${xc.toFixed(1)} ${yc.toFixed(1)} L${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${o.k ? `var(--${o.k})` : "var(--surface-2)"}" fill-opacity=".6" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/></g>`; }
  // pantalla de ruta: rumb del GPS (agulla blava) i direcció cap a la base (punt verd)
  if(o.cog!=null){ const y0 = -(ri-2), yh = -(R-22), y1 = -(R+4);   // fletxa de cartell: tija gruixuda i punta ampla
    g += `<polygon transform="rotate(${o.cog})" points="-6,${y0} 6,${y0} 6,${yh} 15,${yh} 0,${y1} -15,${yh} -6,${yh}" fill="var(--accent)" stroke="var(--surface)" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke"/>`; }
  if(o.home!=null){ const [x,y] = P(o.home, R-14*Z); g += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${Z})"><g class="upr"><circle r="11" fill="var(--ideal)" stroke="var(--surface)" stroke-width="2"/><path d="M-5 1 0-4 5 1M-3.5 0v4.5h7V0" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></g></g>`; }
  let fx = `<circle r="${ri-4}" fill="var(--surface)" stroke="var(--line)" stroke-width="1.5"/>`;
  if(o.cv != null) fx += `<text y="-15" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted)" font-family="Rajdhani,sans-serif" letter-spacing="1">${o.cl || ""}</text><text y="17" text-anchor="middle" font-size="34" font-weight="700" fill="var(--ink)" font-family="Rajdhani,sans-serif">${o.cv}<tspan font-size="11" fill="var(--muted)" dx="2">${o.cu || ""}</tspan></text>`;
  else {
  fx += `<g transform="translate(-8 -31) scale(.9)" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"><path d="M1 5h9a2.5 2.5 0 1 0-2.5-2.5M1 9h13a2.5 2.5 0 1 1-2.5 2.5M1 13h6"/></g>`;
  fx += `<text y="17" text-anchor="middle" font-size="36" font-weight="700" fill="var(--ink)" font-family="Rajdhani,sans-serif">${r0(o.wind)}<tspan font-size="13" fill="var(--muted)" dx="1">kn</tspan></text>`;
  }
  // onada: icona + alçada per fora de la rosa, al costat d'on ve
  let wl = "";
  if(o.wdir!=null){ const [x,y] = P(o.wdir, R+17*Z), t = o.wave!=null ? `${r1(o.wave)} m` : "";
    // la lletra de la direcció que tapa la icona es posa just a sobre; a dalt i a baix de tot no hi cabria i va al costat
    const wLbl = wHide >= 0 ? `<text ${Math.abs(y) > 90 ? `x="-16" y="${t ? -2 : 4}" text-anchor="end"` : `y="${t ? -20 : -13}" text-anchor="middle"`} font-size="11" font-weight="700" fill="${isOffshore(wHide*45) ? "var(--marg)" : "var(--sea)"}" font-family="Rajdhani,sans-serif" letter-spacing=".5">${WABBR[wHide]}</text>` : "";
    g += `<g class="rose-wave" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${Z})"><g class="upr"><g transform="translate(-12 -${t?18:11})" fill="none" stroke="var(--wave-l)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${WAVE_IC.map(d => `<path d="${d}"/>`).join("")}</g>${t ? `<text y="14" text-anchor="middle" font-size="13" font-weight="700" fill="var(--wave-l)" font-family="Rajdhani,sans-serif">${t}</text>` : ""}${wLbl}</g></g>`;
    wl = `, onada de ${windName(o.wdir)}${o.wave!=null ? ` de ${r1(o.wave)} m` : ""}`; }
  const vb = o.card ? "-163 -163 326 326" : "-136 -136 272 272";
  return `<svg viewBox="${vb}" role="img" aria-label="Vent de ${windName(o.dir)} a ${r0(o.wind)} nusos${wl}, amb l'histograma de direccions d'avui">${bg}<g class="rose-rot">${g}</g>${fx}<path class="cmp-mark" d="M0 -${R+19}l-6 -9h12z" fill="var(--accent)"/></svg>`;
}

/* ---------- brúixola: la rosa s'orienta com el món real ---------- */
// Amb la brúixola activa, el nord de la rosa apunta al nord de veritat; el triangle de dalt és cap on mira el mòbil.
let cmpOn = false, cmpH = null, cmpU = 0, cmpGot = false;
// La rosa de la pantalla de ruta gira sempre: amb la brúixola si n'hi ha, i si no, amb el rumb del GPS (rideCogH).
window.rideCmpOn = false; window.rideCogH = null;
function cmpApply(){
  document.querySelectorAll(".rose-rot").forEach(g => {
    const sv = g.ownerSVGElement, ride = !!g.closest("#ride");
    const h = ride ? (cmpH != null ? cmpU : window.rideCogH) : (cmpOn && cmpH != null ? cmpU : null);
    sv.classList.toggle("cmp", h != null);
    const a = h != null ? -h : 0;
    g.style.transform = `rotate(${a}deg)`;
    g.querySelectorAll(".upr").forEach(t => t.style.transform = `rotate(${-a}deg)`);
  });
  const src = document.getElementById("rideCsrc");
  if(src && window.rideCmpOn) src.textContent = cmpH != null ? "Orientada amb la brúixola: dalt = cap on mires" : window.rideCogH != null ? "Orientada amb el rumb: dalt = cap on navegues" : "Nord a dalt";
}
let cmpListening = false;
function cmpListen(){
  const need = cmpOn || window.rideCmpOn, ev = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  if(need && !cmpListening){ addEventListener(ev, cmpRead); cmpListening = true; }
  if(!need && cmpListening){ removeEventListener(ev, cmpRead); cmpListening = false; cmpH = null; }
}
async function cmpPerm(){
  try{ if(typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) return await DeviceOrientationEvent.requestPermission() === "granted"; }catch(e){ return false; }
  return true;
}
function cmpRead(e){
  let h = null;
  if(e.webkitCompassHeading != null) h = e.webkitCompassHeading;                       // iPhone
  else if(e.alpha != null && (e.absolute || e.type === "deviceorientationabsolute")) h = 360 - e.alpha;  // Android
  if(h == null) return;
  h = (h + (screen.orientation?.angle || 0) + 360) % 360; cmpGot = true;
  // gir continu (sense fer la volta sencera en passar de 359° a 0°) i una mica suavitzat
  if(cmpH == null){ cmpH = h; cmpU = h; } else { const d = ((h - cmpH + 540) % 360) - 180; cmpH = h; cmpU += d; }
  if(!cmpRead.raf) cmpRead.raf = requestAnimationFrame(() => { cmpRead.raf = 0; cmpApply(); });
}
async function cmpToggle(){
  const b = $("cmpBtn");
  if(cmpOn){ cmpOn = false; cmpListen(); cmpApply(); b.setAttribute("aria-pressed","false"); return; }
  if(!await cmpPerm()){ showMsg("Sense permís per fer servir la brúixola del mòbil."); return; }
  cmpOn = true; cmpGot = false; b.setAttribute("aria-pressed","true"); cmpListen();
  setTimeout(() => { if(cmpOn && !cmpGot){ showMsg("Aquest mòbil o navegador no dona la brúixola: la rosa es queda amb el nord a dalt."); cmpOn = false; b.setAttribute("aria-pressed","false"); cmpListen(); cmpApply(); } }, 2500);
}
document.addEventListener("click", e => { if(e.target.closest && e.target.closest("#cmpBtn")) cmpToggle(); });

/* ---------- gràfic horari ---------- */
// Amplada real disponible (px) perquè el gràfic hi càpiga sencer, sense lliscar, i les lletres no s'encongeixin
function chartW(el){ const w = el && el.clientWidth ? el.clientWidth - (parseFloat(getComputedStyle(el).paddingLeft)||0) - (parseFloat(getComputedStyle(el).paddingRight)||0) : 0;
  return Math.round(Math.min(760, Math.max(300, w || (innerWidth - 40)))); }
function hourChart(date, h0, h1, wide, Wpx, Hpx){
  const c = crit[act], hrs = [];
  for(let h=h0; h<=h1; h++){ const p = hourAt(date,h); if(p) hrs.push({h, p, s:scoreHour(p,c)}); }
  if(hrs.length < 2) return "";
  const big = document.documentElement.dataset.size === "big";
  const W = wide ? (Wpx || 760) : 380, Hh = Hpx || (wide ? (big ? 200 : 170) : 108), L = wide ? 26 : 6, R = wide ? 30 : 6, T = wide ? 22 : 22, B = wide ? 36 : 20;
  const pw = W-L-R, ph = Hh-T-B, n = hrs.length, dx = pw/(n-1);
  // escala ajustada a les dades que es veuen (no als criteris), perquè el gràfic sigui baixet i aprofiti l'alçada
  const maxK = Math.max(10, Math.ceil(Math.max(...hrs.map(x=>Math.max(x.p.gust||0, x.p.wind||0)))*1.1/5)*5);
  const maxW = Math.max(0.5, Math.ceil(Math.max(...hrs.map(x=>x.p.wave||0))*1.15*2)/2);
  const X = j => L + dx*j, yK = k => T + ph - (k/maxK)*ph, yW = w => T + ph - (w/maxW)*ph;
  const fs = big ? 13 : 11, thin = dx < 24;  // poc espai entre hores: etiquetes d'hora alternes
  const id = "g"+Math.random().toString(36).slice(2,7);
  let g = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ink)" stop-opacity=".16"/><stop offset="1" stop-color="var(--ink)" stop-opacity="0"/></linearGradient></defs>`;
  if(c.iMin < maxK){ const top = yK(Math.min(c.iMax, maxK)); g += `<rect x="${L}" y="${top}" width="${pw}" height="${yK(c.iMin)-top}" fill="var(--ideal-t)" opacity=".7"/>`; }
  if(wide) for(let k=0;k<=maxK;k+=(maxK > 25 ? 10 : 5)) g += `<line x1="${L}" x2="${W-R}" y1="${yK(k)}" y2="${yK(k)}" stroke="var(--grid)"/><text x="${L-6}" y="${yK(k)+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${k}</text>`;
  else g += `<line x1="${L}" x2="${W-R}" y1="${yK(0)}" y2="${yK(0)}" stroke="var(--grid)"/>`;
  const nk = nowKey(), ni = hrs.findIndex(x => x.p.t === nk);
  if(ni >= 0) g += `<line x1="${X(ni)}" x2="${X(ni)}" y1="${T-14}" y2="${yK(0)}" stroke="var(--accent-2)" stroke-width="1.5" stroke-dasharray="3 3"/><text x="${X(ni)}" y="${T-16}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--accent-2)" font-family="Rajdhani,sans-serif" letter-spacing="1">ARA</text>`;
  const pts = hrs.map((x,j) => [X(j), yK(x.p.wind||0)]), gpts = hrs.map((x,j) => [X(j), yK(x.p.gust||0)]);
  g += `<path d="M${X(0)} ${yK(0)} L${pts.map(p=>p.join(" ")).join(" L")} L${X(n-1)} ${yK(0)} Z" fill="url(#${id})"/>`;
  g += `<polyline points="${gpts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  const lastObs = hrs.reduce((a,x,j) => x.p.obs ? j : a, -1);
  if(lastObs >= 0){
    // previsió que hi havia per a les hores ja passades (fina, per comparar)
    const pf = hrs.slice(0, lastObs+1).map((x,j) => [X(j), yK((x.p.fc||x.p).wind||0)]);
    if(pf.length > 1) g += `<polyline points="${pf.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 3" opacity=".6"/>`;
    if(lastObs < n-1) g += `<polyline points="${pts.slice(lastObs).map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>`;
    g += `<polyline points="${pts.slice(0, lastObs+1).map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--accent-2)" stroke-width="3" stroke-linejoin="round"/>`;
  } else g += `<polyline points="${pts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>`;
  // cursor de l'hora seleccionada (es mou des de JS sense redibuixar)
  g += `<g class="hsel" style="display:none"><rect x="${-dx/2}" y="${T-18}" width="${dx}" height="${ph+18}" fill="var(--ink)" opacity=".07" rx="4"/><line x1="0" x2="0" y1="${T-18}" y2="${yK(0)}" stroke="var(--ink)" stroke-width="1.5"/></g>`;
  if(wide){ const wp = hrs.map((x,j) => x.p.wave==null ? null : [X(j), yW(x.p.wave)]).filter(Boolean);
    if(wp.length>1) g += `<polyline points="${wp.map(p=>p.join(",")).join(" ")}" fill="none" stroke="var(--wave-l)" stroke-width="2.5" stroke-dasharray="1 0"/>`;
    for(let w=0; w<=maxW+1e-9; w+=0.5) g += `<text x="${W-R+6}" y="${yW(w)+4}" font-size="11" fill="var(--wave-l)" font-family="IBM Plex Mono,monospace">${w.toLocaleString("ca")}</text>`;
    g += `<text x="${L-6}" y="12" text-anchor="end" font-size="10" fill="var(--muted)" font-family="Rajdhani,sans-serif" font-weight="700">KN</text><text x="${W-R+6}" y="12" font-size="10" fill="var(--wave-l)" font-family="Rajdhani,sans-serif" font-weight="700">M</text>`; }
  hrs.forEach((x,j) => {
    const [px,py] = pts[j], k = verdict(x.s).k, kw = lvWind(x.p.wind, c);
    g += `<circle cx="${px}" cy="${py}" r="${wide?4.5:3.5}" fill="var(--${k})" stroke="${x.p.obs ? "var(--accent-2)" : "var(--surface)"}" stroke-width="${x.p.obs ? 2 : 1.5}"/>`;
    const showLbl = wide ? (!thin || j%2===0 || dx >= 18) : j%2===0;
    if(showLbl) g += `<text x="${px}" y="${py-9}" text-anchor="middle" font-size="${wide?fs:10}" font-weight="700" fill="var(--${kw || "ink"})" font-family="IBM Plex Mono,monospace">${r0(x.p.wind)}</text>`;
    if(wide){ g += `<g transform="translate(${px-7} ${Hh-B+4})" style="color:var(--ink)">${arrow(x.p.dir,14)}</g>`; if(!thin || j%2===0) g += `<text x="${px}" y="${Hh-4}" text-anchor="middle" font-size="${fs}" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${x.h}</text>`; }
    else if(j%2===0) g += `<text x="${px}" y="${Hh-4}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${x.h}h</text>`;
  });
  return `<svg class="hc" viewBox="0 0 ${W} ${Hh}" data-date="${date}" data-hs="${hrs.map(x=>x.h).join(",")}" data-l="${L}" data-dx="${dx}" data-w="${W}" role="img" aria-label="Previsió horària: toca o arrossega per triar una hora">${g}</svg>`;
}
/* ---------- hora seleccionada, compartida pel gràfic, el mapa de vent i les taules ---------- */
let SEL = null;
// Avui / Demà: automàtic (demà a partir d'una hora abans de la posta) fins que l'usuari en tria un
let dayView = null, dayViewDate = null;
function autoDay(){ const i = DATA.daily.time.indexOf(todayDate()); const set = i >= 0 ? new Date(DATA.daily.sunset[i]).getTime() : Infinity; return Date.now() >= set - 3600e3 ? "tom" : "today"; }
// dayView: "today", "tom" o una data concreta triada al calendari (AAAA-MM-DD)
function viewDay(){ if(dayViewDate !== todayDate()){ dayView = null; dayViewDate = todayDate(); }
  if(dayView && /^\d{4}-/.test(dayView)) return DATA.daily.time.includes(dayView) && dayView >= todayDate() ? dayView : todayDate();
  const i = DATA.daily.time.indexOf(todayDate()); return (dayView || autoDay()) === "tom" && DATA.daily.time[i+1] ? DATA.daily.time[i+1] : todayDate(); }
// selector de dia: Avui · Demà · calendari (fins on arriba la previsió)
function daySeg(cls, big){
  const td = todayDate(), vd = viewDay(), i = DATA.daily.time.indexOf(td), tm = DATA.daily.time[i+1], last = DATA.daily.time[DATA.daily.time.length-1];
  const other = vd !== td && vd !== tm, sd = d => { const x = new Date(d + "T12:00:00"); return DAYS_S[x.getDay()] + " " + x.getDate(); };
  const b = (v, lbl, on, sub) => `<button type="button" data-dayv="${v}" aria-pressed="${on}">${big ? `<b>${lbl}</b><small>${sub}</small>` : lbl}</button>`;
  const cal = `<button type="button" class="day-cal" data-daycal aria-pressed="${other}" aria-label="Tria un dia al calendari">${big ? "" : ""}<svg width="${big ? 22 : 18}" height="${big ? 22 : 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>${other ? `<span>${sd(vd)}</span>` : big ? "<small>Calendari</small>" : ""}</button>`;
  return `<div class="seg ${cls}" role="group" aria-label="Dia">${b("today", "Avui", vd === td, sd(td))}${tm ? b("tom", "Demà", vd === tm, sd(tm)) : ""}${cal}</div>`;
}
const selKey = () => (SEL && DATA && DATA.hours[SEL]) ? SEL : (DATA && viewDay() !== todayDate() ? hourKey(viewDay(), 12) : nowKey());
// Gràfic del dia de l'hora triada (dins la targeta del mapa de vent)
let chartDate = null;
function renderDayChart(){
  const host = $("dayChart"); if(!host || !DATA) return;
  const k = selKey(), d = DATA.daily.time.includes(k.slice(0,10)) ? k.slice(0,10) : viewDay();
  const card = $("windMap"), full = card && card.classList.contains("full-chart"), cw = host.parentElement;
  // a pantalla completa, el gràfic ocupa tot l'espai lliure (amplada i alçada reals, sense deformar les lletres)
  chartDate = d; host.innerHTML = full ? hourChart(d, 7, 21, true, Math.max(300, cw.clientWidth), Math.max(170, cw.clientHeight - 6)) : hourChart(d, 7, 21, true, chartW(card));
  $("dayLegend").innerHTML = chartLegend(true);
}
function readout(k){
  const date = k.slice(0,10), h = +k.slice(11,13), p = hourAt(date, h); if(!p) return "";
  const c = crit[act], v = verdict(scoreHour(p, c)), d = new Date(date+"T12:00:00");
  const day = "";   // la data ja surt a la capçalera de la targeta
  const src = p.obs ? `Mesurat · ${STATIONS[stKey].name}` : `Previsió · ${(MODELS[p.src] || MODELS[model]).label}`;
  // fila 1: hora + veredicte (esquerra) i motiu (dreta) · fila 2: font de les dades (esquerra) · fila 3: valors
  return `<span class="rd-top"><span class="rd-h"><b>${day}${pad(h)}:00</b><span class="tag k-${v.k}"><span class="vd"></span>${v.t}</span></span>${v.sub ? `<span class="rd-why k-${v.k}">${v.sub.split(" · ").map(x => `<span>${esc(x)}</span>`).join(" · ")}</span>` : ""}</span><span class="rd-m${p.obs ? " obs" : ""}" title="${esc(src)}">${p.code != null ? wxIcon(p.code, 18) : ""}<span>${esc(src)}</span></span>
    <span class="rd-v"><span>${arrow(p.dir,14)} Vent ${lvTxt(lvWind(p.wind,c), r0(p.wind)+" kn")} ${windAbbr(p.dir)}</span><span>Ratxa ${lvTxt(lvGust(p.gust,c), r0(p.gust)+" kn")}</span>
    <span>Onada ${lvTxt(lvWave(p.wave,c), r1(p.wave)+" m")}${p.hmax!=null ? ` <small>(màx ${p.hmaxE?"≈":""}${r1(p.hmax)})</small>` : ""}${p.tp!=null||p.per!=null ? ` · ${r0(p.tp ?? p.per)} s` : ""}</span></span>`;
}
function applySel(){
  if(!DATA) return; const k = selKey(), date = k.slice(0,10), h = String(+k.slice(11,13));
  if(date !== chartDate && $("dayChart")) renderDayChart();
  document.querySelectorAll("svg.hc").forEach(svg => { const d = svg.dataset, g = svg.querySelector(".hsel"); if(!g) return;
    const j = d.date === date ? d.hs.split(",").indexOf(h) : -1;
    if(j < 0){ g.style.display = "none"; return; }
    g.setAttribute("transform", `translate(${(+d.l) + (+d.dx)*j} 0)`); g.style.display = ""; });
  document.querySelectorAll(".hc-read").forEach(el => { el.innerHTML = readout(k); });
  document.querySelectorAll("tr[data-k]").forEach(tr => tr.classList.toggle("sel", tr.dataset.k === k));
}
// src: "chart" | "table" | "wm" (el mapa ja s'ha mogut tot sol)
function selectHour(k, src){
  if(!DATA || !DATA.hours[k]) return; SEL = k; applySel();
  if(src !== "wm" && window.wmSelect) wmSelect(k, true);
}
window.SEL_K = () => DATA ? selKey() : SEL;
window.mmSel = (k) => { if(DATA && DATA.hours[k]){ SEL = k; if(k.slice(0, 10) !== hoursDate && $("hoursBody")) renderHoursDay(); else applySel(); } };
let hcDrag = null;
function hcPick(svg, clientX){
  const r = svg.getBoundingClientRect(), d = svg.dataset, hs = d.hs.split(",");
  const x = (clientX - r.left) * (+d.w) / r.width;
  const j = Math.max(0, Math.min(hs.length-1, Math.round((x - (+d.l)) / (+d.dx))));
  const k = hourKey(d.date, +hs[j]); if(k !== SEL) selectHour(k, "chart");
}
// Zona tàctil: de la primera a l'última hora, amb un marge de 0,35 hores; els laterals (eixos) no responen
function hcIn(svg, clientX){
  const r = svg.getBoundingClientRect(), d = svg.dataset, n = d.hs.split(",").length;
  const x = (clientX - r.left) * (+d.w) / r.width, m = (+d.dx) * 0.35;
  return x >= (+d.l) - m && x <= (+d.l) + (+d.dx) * (n - 1) + m;
}
// Al dit: un toc tria l'hora; arrossegar en horitzontal la mou; si el dit va amunt o avall és scroll i no es toca res
let hcT = null;
document.addEventListener("pointerdown", e => {
  const svg = e.target.closest && e.target.closest("svg.hc"); if(!svg || !hcIn(svg, e.clientX)) return;
  if(e.pointerType === "mouse"){ hcDrag = svg; hcPick(svg, e.clientX); }
  else hcT = {svg, x:e.clientX, y:e.clientY};
});
document.addEventListener("pointermove", e => {
  if(hcDrag){ hcPick(hcDrag, e.clientX); return; }
  if(!hcT) return;
  const ax = Math.abs(e.clientX - hcT.x), ay = Math.abs(e.clientY - hcT.y);
  if(ay > 8 && ay >= ax) hcT = null;                                       // scroll vertical
  else if(ax > 8){ hcDrag = hcT.svg; hcT = null; hcPick(hcDrag, e.clientX); }
});
document.addEventListener("pointerup", e => { if(hcT) hcPick(hcT.svg, e.clientX); hcT = null; hcDrag = null; });
document.addEventListener("pointercancel", () => { hcT = null; hcDrag = null; });
document.addEventListener("click", e => { const tr = e.target.closest && e.target.closest("tr[data-k]"); if(tr) selectHour(tr.dataset.k, "table"); });
const chartLegend = wide => `<details class="legend-d"><summary>Què és cada línia?</summary><div class="legend"><span><span class="sw" style="background:var(--accent-2)"></span>Vent mesurat</span><span><span class="sw" style="background:var(--ink)"></span>Vent previst (kn)</span><span><span class="sw" style="background:var(--muted)"></span>Ratxa</span>${wide?`<span><span class="sw" style="background:var(--wave-l)"></span>Onada (m)</span>`:""}<span><span class="sw" style="background:var(--ideal-t);height:10px"></span>Vent ideal ${esc(DEFAULTS[act].short)}</span></div>
  <div class="legend lv-legend"><span><span class="vd" style="background:var(--ideal)"></span>Bo</span><span><span class="vd" style="background:var(--marg)"></span>Limitat</span><span><span class="vd" style="background:var(--no)"></span>No recomanat</span></div>
  <p class="note">Toca o arrossega el gràfic per veure una hora a la targeta de dalt.</p></details>`;
function hourTable(date, h0, h1){
  const c = crit[act], nk = nowKey(); let rows = "";
  for(let h=h0; h<=h1; h++){ const p = hourAt(date,h); if(!p) continue; const s = scoreHour(p,c), v = verdict(s);
    rows += `<tr data-k="${p.t}" class="${p.t===nk?"now-row":""}"><td class="l">${h}:00${p.obs ? `<small class="obs">mesurat</small>` : ""}</td><td class="l"><span class="tag k-${v.k}"><span class="vd"></span>${v.t}</span></td>
      <td class="l"><span style="display:inline-flex;align-items:center;gap:4px">${arrow(p.dir,14)}${windAbbr(p.dir)}</span></td>
      <td><b>${lvTxt(lvWind(p.wind,c), r0(p.wind))}</b></td><td>${lvTxt(lvGust(p.gust,c), r0(p.gust))}</td><td>${lvTxt(lvWave(p.wave,c), r1(p.wave))}${p.wobs ? `<small class="obs">boia</small>` : ""}</td><td>${p.hmax!=null ? (p.hmaxE?"≈":"")+r1(p.hmax) : "–"}</td><td>${r0(p.tp ?? p.per)}</td><td>${r0(p.temp)}°</td><td>${r1(p.sst)}°</td><td>${p.pp ?? "–"}%</td>
      <td class="warn">${s.flags.map(esc).join(" · ")}</td></tr>`; }
  return `<div class="tbl"><table><thead><tr><th class="l">Hora</th><th class="l">Estat</th><th class="l">Dir.</th><th>Vent</th><th>Ratxa</th><th>Onada</th><th>Màx.</th><th>Per. s</th><th>Aire</th><th>Aigua</th><th>Pluja</th><th class="l">Avisos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- informació oficial: bandera de bany (Gencat) i avisos (Meteocat) ---------- */
// Bandera: dades obertes «Estat de les platges de Catalunya» (Platja d'Ocata = 081189-p1, Platja del Masnou = 081189-p0).
// Avisos: Situacions Meteorològiques de Perill (SMP) de Meteocat per a la comarca del club i la seva zona de mar (LOC.smp).
const BEACHES = LOC.beaches;
const SMP_ZONES = LOC.smp;   // Meteocat: comarca i zona de mar (Maresme 21/96 · Barcelonès 13/95)
let INFO = {flag:null, alerts:[], at:0, ok:{flag:false, smp:false}};
const ymd = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
async function loadFlag(){
  if(!Object.keys(BEACHES).length) return null;   // club sense platja configurada: no hi ha bandera
  const where = encodeURIComponent(Object.keys(BEACHES).map(c => `codiplatja='${c}'`).join(" OR "));
  const r = await fetch(`https://analisi.transparenciacatalunya.cat/resource/4baz-cjv2.json?$where=${where}&$select=codiplatja,estat_data,estat_bandera,estat_motiubandera,estat_estatmar,estat_meduses&$order=:id DESC&$limit=4`, {cache:"no-store"});
  if(!r.ok) throw 0;
  const rows = await r.json();
  const row = rows.find(x => x.codiplatja === LOC.flag) || rows[0]; if(!row) return null;
  const m = (row.estat_data || "").match(/(\d\d)\/(\d\d)\/(\d{4})T(\d\d):(\d\d)/);
  const at = m ? Date.UTC(+m[3], +m[2]-1, +m[1], +m[4], +m[5]) : null;
  const med = (row.estat_meduses || "").split(";").filter(x => x && x !== "N/A").map(x => x.split(",")[0]);
  return {beach: BEACHES[row.codiplatja] || "", color: (row.estat_bandera || "").toLowerCase(), reason: row.estat_motiubandera && row.estat_motiubandera !== "N/A" ? row.estat_motiubandera : "", sea: row.estat_estatmar && row.estat_estatmar !== "N/A" ? row.estat_estatmar : "", jelly: med, at};
}
// Cada episodi porta totes les versions de l'avís (les antigues, «Ampliat»): només compta la vigent (o, si no n'hi ha, la darrera emesa)
function smpCurrent(A){
  A = A || []; const st = a => String((a.estat && a.estat.nom) || a.estat || "");
  const v = A.filter(a => st(a) === "Vigent"); if(v.length) return v;
  return A.length ? [A.reduce((x, y) => String(y.dataEmisio || "") > String(x.dataEmisio || "") ? y : x)] : [];
}
async function loadSmp(){
  const out = new Map(), now = new Date(), todayK = ymd(now), hourNow = now.getHours();
  for(const d of [now, new Date(now.getTime() + 864e5)]){
    let list;
    try{ const r = await fetch(`https://static-m.meteo.cat/ginys/pronostic/smp/episodisOberts/avisos-episodis-oberts-${ymd(d)}.json`, {cache:"no-store"}); if(r.status === 404) continue; if(!r.ok) throw 0; list = await r.json(); }
    catch(e){ if(d === now) throw e; continue; }
    (list || []).forEach(ep => smpCurrent(ep.avisos).forEach(av => (av.evolucions || []).forEach(ev => (ev.periodes || []).forEach(pe => (pe.afectacions || []).forEach(af => {
      if(!SMP_ZONES.includes(af.idComarca)) return;
      const day = (ev.dia || "").slice(0,10).replace(/-/g,""); if(day < todayK) return;
      const h1 = Number((pe.nom || "00-00").split("-")[1]) || 24;
      if(day === todayK && h1 <= hourNow) return;              // franja ja passada
      const key = `${ep.meteor?.nom}|${day}`, cur = out.get(key) || {meteor: ep.meteor?.nom || "Avís", tipus: av.tipus, day, llindar: af.llindar || ev.llindar1, perill: 0, periods: new Set(), zones: new Set()};
      cur.perill = Math.max(cur.perill, af.perill || 0); cur.periods.add(pe.nom); cur.zones.add(af.idComarca === SMP_ZONES[1] ? "mar" : "terra");
      if(av.tipus === "Avís") cur.tipus = "Avís";
      out.set(key, cur);
    })))));
  }
  return [...out.values()].sort((a,b) => a.day.localeCompare(b.day) || b.perill - a.perill)
    .map(a => Object.assign(a, {periods:[...a.periods].sort(), zones:[...a.zones]}));
}
async function loadInfo(){
  const [f, s] = await Promise.allSettled([loadFlag(), loadSmp()]);
  INFO = {flag: f.status === "fulfilled" ? f.value : null, alerts: s.status === "fulfilled" ? s.value : [], at: Date.now(), ok:{flag: f.status === "fulfilled", smp: s.status === "fulfilled"}};
  renderInfo();
}
const FLAG = {verda:{k:"ideal", t:"verda"}, groga:{k:"marg", t:"groga"}, vermella:{k:"no", t:"vermella"}};
const PERILL = p => p >= 5 ? {k:"no", t:"perill molt alt"} : p >= 3 ? {k:"no", t:"perill alt"} : {k:"marg", t:"perill moderat"};
function renderInfo(){
  const el = $("info"); if(!el) return;
  const parts = [], today = ymd(new Date()), tomorrow = ymd(new Date(Date.now() + 864e5));
  // Un avís per fenomen: els dies que l'afecten van junts a la mateixa fila (abans, una fila per fenomen i dia)
  const dayT = d => d === today ? "avui" : d === tomorrow ? "demà" : d.slice(6).replace(/^0/, "") + "/" + d.slice(4, 6);
  const groups = new Map();
  INFO.alerts.forEach(a => { const g = groups.get(a.meteor) || {meteor:a.meteor, tipus:a.tipus, llindar:a.llindar, perill:0, zones:new Set(), days:[]};
    g.perill = Math.max(g.perill, a.perill); if(a.tipus === "Avís") g.tipus = "Avís"; a.zones.forEach(z => g.zones.add(z)); g.days.push(a); groups.set(a.meteor, g); });
  [...groups.values()].sort((x, y) => x.days[0].day.localeCompare(y.days[0].day) || y.perill - x.perill).forEach(g => { const pv = PERILL(g.perill);
    const when = g.days.map(a => dayT(a.day)).join(" i ");
    const det = g.days.map(a => dayT(a.day) + " " + (a.periods.length === 4 ? "tot el dia" : a.periods.map(p => p.replace("-", "–") + " h").join(", "))).join(" · ");
    const key = [g.days[0].day, g.tipus, g.meteor].join("|"), fold = smpFold().includes(key);
    parts.push(`<button type="button" class="info-row k-${pv.k}${fold ? " fold" : ""}" data-smp="${esc(key)}" aria-expanded="${!fold}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/></svg>
      <span class="info-t"><b>${esc(g.tipus)} Meteocat · ${esc(g.meteor)}${fold ? " · " + when : ""}</b><span class="info-d"><br>${esc(g.llindar || "")} · ${esc(det)} · ${pv.t}${g.zones.has("mar") ? " · zona de mar " + (/^[AEIOU]/.test(LOC.com) ? "de l'" : "del ") + LOC.com : " · " + LOC.com}</span></span>
      <svg class="info-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${fold ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"}"/></svg></button>`); });
  el.innerHTML = parts.join("");   // només hi surten avisos actius
  renderFlag(); if(window.renderPrep) renderPrep();
}
// Avisos de Meteocat: es pleguen en una línia tocant-los (es recorda en aquest mòbil; les claus velles es netegen soles)
function smpFold(){ try{ return JSON.parse(localStorage.getItem("ov_smp_fold") || "[]"); }catch(e){ return []; } }
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-smp]"); if(!b) return;
  const k = b.dataset.smp, today = ymd(new Date()); let F = smpFold().filter(x => x.slice(0, 8) >= today);
  F = F.includes(k) ? F.filter(x => x !== k) : F.concat(k); try{ localStorage.setItem("ov_smp_fold", JSON.stringify(F)); }catch(e){} renderInfo(); });
// Traços de la bandera, de l'editor d'icones (traç 1 = pal; la resta, farcit del color de la bandera)
const FLAG_IC = ["M5 23L5 3","M5 3L19 4L18.5 7.5L19 13L5 12Z"];
// Bandera de bany: icona petita sota l'indicador (gris = sense dades d'avui). Tocant-la es veu el detall.
function renderFlag(){
  const el = $("gflag"); if(!el) return;
  if(!LOC.flag){ el.innerHTML = ""; return; }
  const f = INFO.flag, fresh = !!(f && f.at && new Date(f.at).toDateString() === new Date().toDateString()), fl = fresh && f && FLAG[f.color];
  const col = fl ? `var(--${fl.k})` : "var(--muted)";
  const txt = fl ? `Bandera ${fl.t} · ${f.beach} · ${new Date(f.at).toTimeString().slice(0,5)}` + [f.reason, f.sea ? "mar "+f.sea : "", f.jelly.length ? "meduses: "+f.jelly.join(", ") : ""].filter(Boolean).map(x => " · "+x).join("")
    : (INFO.ok.flag ? "Bandera de bany: sense dades avui" + (f && FLAG[f.color] ? ` (darrera: ${FLAG[f.color].t}, ${new Date(f.at).toLocaleDateString("ca",{day:"numeric",month:"short"})})` : "") : "Bandera de bany: no disponible ara");
  el.innerHTML = `<button type="button" class="gflag-b" aria-label="${esc(txt)}" title="${esc(txt)}" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round"><path d="${FLAG_IC[0]}" stroke="${col}" stroke-width="2.4"/>${FLAG_IC.slice(1).map(d => `<path d="${d}" fill="${col}" stroke="${col}" stroke-width="1"${fl ? "" : ' fill-opacity=".45"'}/>`).join("")}</svg></button><span class="gflag-t" hidden>${esc(txt)}</span>`;
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest(".gflag-b"); if(!b) return; const t = b.nextElementSibling; t.hidden = !t.hidden; b.setAttribute("aria-expanded", String(!t.hidden)); });

/* ---------- render ---------- */
// Siluetes de les embarcacions: a boats.js (OV_BOATS.IC), una per tipus o compartida dins la família
const boatIcon = (k, z) => `<svg width="${z||22}" height="${z||22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${OVB.IC[DEFAULTS[k]?.ic] || OVB.IC[k] || OVB.IC.pati || ""}</svg>`;
function renderSeg(){
  $("actSeg").classList.toggle("n4", barActs().length > 3);
  $("actSeg").innerHTML = barActs().map(k => `<button type="button" data-act="${k}" aria-pressed="${k===act}" aria-label="${esc(DEFAULTS[k].name)}" title="${esc(DEFAULTS[k].name)}">${boatIcon(k)}</button>`).join("");
}
// x = text curt de sota (ha de cabre sencer); full = el text llarg, en passar-hi el dit o el ratolí
function stat(ic, label, v, unit, x, full){ return `<div class="stat"${full && full !== x ? ` title="${esc(full)}"` : ""}><div class="k"><span class="chip-ic">${icon(ic)}</span><span class="lbl">${label}</span></div><div class="v">${v}${unit?`<small>${unit}</small>`:""}</div><div class="x">${x||"&nbsp;"}</div></div>`; }
// Widget d'Android (APK): l'app hi passa el veredicte d'ara i la previsió de les 48 h següents; Android el refresca cada 30 min
// i, quan les dades d'ara són velles, mostra la previsió de l'hora en curs (VentWidget.java). Al navegador no fa res.
let wgKey = "", wgAt = 0;
function widgetPush(n, s, v, live, c){
  const W = window.OV_NATIVE && window.Capacitor?.Plugins?.OvWidget; if(!W || !DATA) return;
  try{
    const d0 = new Date(nowKey().slice(0,13) + ":00:00"), hrs = [];
    for(let i = 0; i < 48; i++){ const d = new Date(d0.getTime() + i*3600e3), p = DATA.hours[localKey(d)]; if(!p || p.wind == null) continue;
      const r = scoreHour(p, c), vh = verdict(r);
      hrs.push({t:d.getTime(), s:r.score, k:vh.k, v:vh.t, why:vh.sub, w:p.wind, g:p.gust, dn:windName(p.dir), h:p.wave}); }
    const snap = {act:DEFAULTS[act].short, loc:LOC.name, st: live ? STATIONS[ST.key].name : "",
      now:{s:s.score, k:v.k, v:v.t, why:v.sub, w:n.wind, g:n.gust, dn:windName(n.dir), h:DATA.now.wave}, hrs};
    const key = JSON.stringify(snap);
    if(key === wgKey && Date.now() - wgAt < 10*60e3) return;   // sense canvis: com a molt cada 10 min
    wgKey = key; wgAt = Date.now();
    Promise.resolve(W.save({data: JSON.stringify(Object.assign({at: wgAt}, snap))})).catch(() => {});   // APK antic sense widget: no passa res
  }catch(e){}
}
// Detall de l'estació dins el botó (i) de la targeta d'ara: nom complet, distància, ritme i limitacions
function stInfo(){
  const box = $("iInd"); if(!box) return;
  let p = $("iStation"); if(!p){ p = document.createElement("p"); p.id = "iStation"; box.prepend(p); }
  const S = STATIONS[stKey];
  if(!S){ p.innerHTML = `<b>Estació:</b> aquest club encara no en té. Es mostra la previsió.`; return; }
  const web = S.type && !window.OV_NATIVE ? " Des del navegador no es pot llegir: només a l'app Android." : "";
  p.innerHTML = `<b>Estació:</b> ${esc(S.long || S.name)}${LOC.stNote ? ", " + esc(LOC.stNote.replace(/^Estació /i, "")) + " de la base" : ""}. ${esc(S.info || "")}${web}`;
}
function renderNow(){
  if(!DATA) return;
  const fc = DATA.now, c = crit[act], live = stFresh();
  const n = live ? Object.assign({}, fc, {wind:ST.wind, gust:ST.gust, dir:ST.dir, temp:ST.temp}) : fc;
  if(n.wind==null){ $("hero").hidden = true; return; }
  $("hero").hidden = false;
  const s = scoreWindow(n, c), v = verdict(s);
  widgetPush(n, s, v, live, c);
  const mins = live ? Math.max(0, Math.round((Date.now()-ST.at)/60000)) : null;
  $("src").className = "src"+(live?" live":"");
  $("src").innerHTML = !STATIONS[stKey] ? `<span class="dot"></span>Sense estació · previsió` : `<span class="dot"></span>${live ? `${ST.key !== stKey ? "↪ " : ""}${STATIONS[ST.key].name} · fa ${mins} min` : `${STATIONS[stKey].name}: sense dades · model`}${LOC.stations.length > 1 ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M7 4l-4 4 4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>` : ""}`;
  stInfo();
  if(STATIONS[stKey]) $("src").setAttribute("aria-label", "Estació: "+STATIONS[stKey].name+(live && ST.key !== stKey ? ", sense vent ara; dades de "+STATIONS[ST.key].name : "")+". Canvia d'estació");
  $("gauge").innerHTML = gaugeSvg(s, v) + `<div class="grow"><div class="gflag" id="gflag"></div><span class="g-why k-${v.k}">${esc(v.sub || "")}</span></div>`; renderFlag();
  const kind = isOffshore(n.dir) ? "terral" : isOnshore(n.dir) ? "de mar" : "lateral";
  $("rose").innerHTML = `<button class="ib-i rose-i" type="button" data-info="iRose" aria-label="Com es llegeix la rosa dels vents" aria-expanded="${!$("iRose")?.hidden}">i</button><button type="button" class="cmp-btn" id="cmpBtn" aria-pressed="${cmpOn}" aria-label="Orienta la rosa amb la brúixola del mòbil" title="Orienta amb la brúixola"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 15 12h-6z" fill="currentColor"/><path d="M12 21 9 12h6z" fill="currentColor" opacity=".35"/></svg></button>` + roseSvg({k: kOf(s.score), dir:n.dir, wind:n.wind, fcDir:fc.dir, wdir:fc.wdir, wave:fc.wave, live, hist: roseHist(OBS.key === stKey ? OBS.recs : [], roseForecast(), c)}); cmpApply();
  // sense repetir el que ja diu el motiu de sota l'indicador
  // Els avisos (vermells) van com a text al motiu de sota l'indicador; només la informació (mar de fons, aigua freda) va en etiqueta grisa
  const FW = {"Ràfagues":"vent a ràfagues","Probable pluja":"pluja probable","Terral":"terral"}, why = (s.why || []).filter(w => !INFO_FLAGS.some(f => f.toLowerCase() === w));
  s.flags.filter(f => !INFO_FLAGS.includes(f)).forEach(f => { const w = FW[f] || f.toLowerCase(); if(!why.includes(w) && !(f === "Terral" && why.includes("terral fort")) && !(f === "Ràfagues" && why.includes("ratxes fortes")) && !(f === "Probable pluja" && why.includes("pluja"))) why.push(w); });
  const gw = document.querySelector("#gauge .g-why"); if(gw && why.length) gw.textContent = why.join(" · ");
  $("flags").innerHTML = s.flags.filter(f => INFO_FLAGS.includes(f)).map(f => `<span class="flag info">${esc(f)}</span>`).join("");
  const i = DATA.daily.time.indexOf(todayDate());
  $("stats").innerHTML =
    stat("gust", "Ratxa", lvTxt(lvGust(n.gust,c), r0(n.gust)), "kn", n.gust!=null&&n.wind!=null&&Math.round(n.gust-n.wind) > 0 ? "+"+r0(n.gust-n.wind)+" kn de cop" : "") +
    stat("wave", "Onada", lvTxt(lvWave(fc.wave,c), r1(fc.wave)), "m", fc.hmax!=null ? `màx ${fc.hmaxE?"≈":""}${r1(fc.hmax)} m` : waveSrc(fc), waveSrc(fc)) +
    stat("per", "Període", r1(tpOf(fc)), "s", tpOf(fc)!=null ? (tpOf(fc)<5 ? "curta" : tpOf(fc)<7 ? "mixta" : "llarga") + (fc.wdir!=null ? " · de "+windAbbr(fc.wdir) : "") : "") +
    stat("air", "Aire", r0(n.temp), "°C", live && ST.hum != null ? `Humitat ${r0(ST.hum)}%` : "", live ? `Humitat ${r0(ST.hum)}% · ${r0(ST.pres)} hPa` : "") +
    stat("water", "Aigua", r1(fc.sst), "°C", suitS(fc.sst), suit(fc.sst)) +
    stat("sun", "Posta", DATA.daily.sunset[i]?.slice(11,16) || "–", "", "Sortida "+(DATA.daily.sunrise[i]?.slice(11,16)||"–"));
  const td = todayDate();
  // Vista de lletra gran: només xifres i paraules, sense indicadors gràfics
  const row = (k, v, u, x) => `<div class="brow"><span class="bk">${k}</span><span class="bv">${v}${u?`<small>${u}</small>`:""}</span>${x?`<span class="bx">${x}</span>`:""}</div>`;
  const bvd = viewDay(), bTom = bvd !== td, dlab = d => { const x = new Date(d + "T12:00:00"); return DAYS_S[x.getDay()] + " " + x.getDate(); };
  const tmD = DATA.daily.time[DATA.daily.time.indexOf(td) + 1];
  const bday = daySeg("bday", true);
  const bslots = SLOTS.map(sl => { const a = slotAgg(bvd, sl, c); if(!a) return ""; const vv = verdict(a);
    return `<div class="bslot k-${vv.k}${a.past?" past":""}"><span class="bk">${sl.label}</span><span class="tag"><span class="vd"></span>${vv.t}</span><span class="bw">${r0(a.wind)}<small>/${r0(a.gust)} kn</small></span><span class="bx">${windName(a.dir)} · ${r1(a.wave)} m</span></div>`; }).join("");
  $("bigNow").innerHTML = `<div class="bverdict k-${v.k}"><span>${v.t}</span><small>${s.score ?? "–"}/100</small></div>
    ${s.flags.length ? `<div class="flags">${s.flags.map(f => `<span class="flag">${esc(f)}</span>`).join("")}</div>` : ""}
    ${row("Vent", lvTxt(lvWind(n.wind,c), r0(n.wind)), "kn", `<span style="display:inline-flex;align-items:center;gap:6px">${arrow(n.dir,26)}${windName(n.dir)} · ${kind}</span>`)}
    ${row("Ratxa", lvTxt(lvGust(n.gust,c), r0(n.gust)), "kn")}
    ${row("Onada", lvTxt(lvWave(fc.wave,c), r1(fc.wave)), "m", (fc.hmax!=null ? `màx ${r1(fc.hmax)} m · ` : "") + (tpOf(fc)!=null ? r0(tpOf(fc))+" s" : "")+(fc.wdir!=null?" · de "+windName(fc.wdir):""))}
    ${row("Aire", r0(n.temp), "°C")}
    ${row("Aigua", r1(fc.sst), "°C", suit(fc.sst))}
    ${row("Posta del sol", DATA.daily.sunset[i]?.slice(11,16) || "–", "")}
    <div class="bslots">${bday}${bslots}</div>`;
  const vd = viewDay(), isTom = vd !== td;
  const slots = SLOTS.map(sl => { const a = slotAgg(vd, sl, c); if(!a) return "";
    const vv = verdict(a);
    return `<div class="sl k-${vv.k}${a.past?" past":""}"><div class="h">${sl.label}<span class="tag"><span class="vd"></span>${vv.t}</span></div>
      <div class="w">${arrow(a.dir,13)}${r0(a.wind)}<small>/${r0(a.gust)} kn</small></div><div class="o">${waveIc(12)} ${r1(a.wave)} m</div>${a.code != null ? `<span class="sl-wx">${wxIcon(a.code, 18)}</span>` : ""}</div>`; }).join("");
  const ol = $("outlook");
  const dd = new Date(vd + "T12:00:00");
  ol.innerHTML = `<div class="card-h" style="margin-bottom:6px">${daySeg("day-seg", false)}
    ${vd === td || vd === DATA.daily.time[DATA.daily.time.indexOf(td)+1] ? `<span class="lbl day-date">${DAYS_L[dd.getDay()]} ${dd.getDate()} ${MONTHS[dd.getMonth()]}</span>` : ""}</div>
    <div class="slots">${slots}</div>`;
  renderDayChart(); applySel();
}
const tpOf = p => p.tp ?? p.per ?? null;
function waveSrc(p){
  if(p.wobs){ const m = p.wat ? Math.round((Date.now() - p.wat)/60000) : null; return "boia BCN" + (m!=null ? (m < 90 ? ` fa ${m} min` : ` fa ${Math.round(m/60)} h`) : ""); }
  return p.wcorr ? "previsió corregida" : (p.wdir!=null ? "de "+windName(p.wdir) : "previsió");
}
function renderHours(){
  if(window.renderWindMap) setTimeout(renderWindMap, 0); if(window.renderPrep) setTimeout(renderPrep, 0);
  renderHoursDay();
}
// Dia de la taula d'hores: el de l'hora triada (selector de dia i hora del mapa, gràfic o taula); si no n'hi ha, el d'Avui/Demà
let hoursDate = null;
const hoursDay = () => { const d = selKey().slice(0, 10); return DATA.daily.time.includes(d) ? d : viewDay(); };
function renderHoursDay(){
  // tot el dia (7–21 h); les hores passades surten com a «mesurat»
  const td = hoursDay(); hoursDate = td;
  const errs = modelErrors(), bestE = errs.length ? Math.min(...errs.map(e => e.mae)) : null;
  renderModelBox(errs, bestE);
  const tdI = DATA.daily.time.indexOf(todayDate()), hx = new Date(td + "T12:00:00");
  $("hoursTitle").textContent = td === todayDate() ? "Hores d'avui" : td === DATA.daily.time[tdI+1] ? "Hores de demà" : `Hores ${DAYS_L[hx.getDay()].toLowerCase()} ${hx.getDate()}`;
  const wf = DATA.wf;
  $("iHours").innerHTML = `<p>Una fila per hora, de 7 a 21 h. Les hores passades diuen <b>mesurat</b> i són dades de l'estació ${esc(STATIONS[stKey]?.name || "")}; la resta, previsió del model ${esc(MODELS[model].label)}. Llisca la taula cap als costats per veure totes les columnes.</p>` +
    (wf && Math.abs(wf.f-1) > 0.05
      ? `<p><b>Onada corregida ×${r1(wf.f)}.</b> Hi ha mar de fons (onada de 7 s o més) i la ${esc(BUOY.name)} mesura ${wf.f > 1 ? "més" : "menys"} onada que el model: a les hores de mar de fons, la previsió d'onada es multiplica per aquest factor.</p>`
      : `<p>L'onada és la del model. Només es corregeix amb la ${esc(BUOY.name)} quan hi ha mar de fons (onada de 7 s o més).</p>`);
  $("hoursBody").innerHTML = hourTable(td, 7, 21);
  applySel();
  const best = SLOTS.map(sl => ({sl, a:slotAgg(td, sl, crit[act])})).filter(x=>x.a && !x.a.past).sort((a,b)=>b.a.score-a.a.score)[0];
  $("peekHours").textContent = best ? "Millor: "+best.sl.label.toLowerCase()+" · "+verdict(best.a).t.toLowerCase() : "";
}
function renderModelBox(errs, bestE){
  $("peekModel").textContent = modelPref === "best" ? "El que més encerta · " + MODELS[model].label : MODELS[modelPref].label;
  // ⋮ ▸ Model meteorològic: una fila per opció (botó de ràdio), amb l'error d'avui de cada model
  const errOf = k => { const e = errs.find(x => x.k === k); return e ? `error d'avui ${r1(e.mae)} kn${e.mae === bestE ? " (el millor)" : ""}` : ""; };
  const OPTS = [["best", "El que més encerta avui", MODELS[model] ? "Ara: " + MODELS[model].label : ""], ["opt", "Optimista", "El model més favorable a cada hora"], ["pes", "Pessimista", "El més desfavorable a cada hora"],
    ["arome", "AROME", "Météo-France · ≈1,3 km · 2–4 dies"], ["icon", "ICON", "Servei alemany DWD · ≈7 km · 5 dies"], ["ecmwf", "ECMWF", "Centre europeu · 9 km"], ["ukmo", "UKMO", "Met Office · 10 km"], ["auto", "Open-Meteo", "Barreja dels models que funcionen millor"]];
  $("modelBox").innerHTML = `<div class="cfg-grp" role="radiogroup" aria-label="Model meteorològic">${OPTS.map(([v, t, d]) => `<label class="cfg-row cfg-radio"><input type="radio" name="modelPick" value="${v}"${modelPref === v ? " checked" : ""}><span class="cfg-rt"><b>${esc(t)}</b><small>${esc([d, MODELS[v] ? errOf(v) : ""].filter(Boolean).join(" · "))}</small></span></label>`).join("")}</div>
    ${errs.length ? "" : `<p class="note">Encara no hi ha prou hores mesurades avui per comparar els models amb l'estació ${esc(STATIONS[stKey]?.name || "")}.</p>`}
    ${(() => { const h = encertsResum(30); if(!h.length) return `<p class="note">L'historial d'encerts dels models es va omplint cada dia.</p>`;
      const byT = Object.keys(TIPUS_VENT).map(t => [t, encertsResum(90, t)[0]]).filter(([, x]) => x && x.dies >= 3);
      return `<div class="model-err-row"><span class="lbl">Últims 30 dies · ${h[0].dies} ${h[0].dies === 1 ? "dia" : "dies"} comparats</span>${h.map((e, i) => `<span class="${i === 0 ? "best" : ""}${e.k === model ? " cur" : ""}">${esc(MODELS[e.k].label)} <b>${r1(e.mae)} kn</b></span>`).join("")}</div>`
        + (byT.length ? `<p class="note">Millor per tipus de vent (90 dies): ${byT.map(([t, x]) => `${TIPUS_VENT[t]}: <b>${esc(MODELS[x.k].label)}</b>`).join(" · ")}</p>` : ""); })()}`;
}
function dayName(date, i){ const d = new Date(date+"T12:00:00"); return {name: i===0 ? "Avui" : i===1 ? "Demà" : DAYS_L[d.getDay()], dm: d.getDate()+" "+MONTHS[d.getMonth()]}; }
const EV_IC = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
window.addEventListener("ov-events", () => { if(DATA) renderWeek(); });   // avisos del club amb data (club.js)
function renderWeek(){
  const c = crit[act], D = DATA.daily; let html = "", good = 0;
  D.time.forEach((date, i) => { if(i >= 7) return;   // la llista setmanal: 7 dies (la resta, al calendari)
    const dn = dayName(date, i), aggs = SLOTS.map(sl => slotAgg(date, sl, c));
    const pills = aggs.map((a,j) => { if(!a) return `<span class="pill k-no" style="opacity:.3">–</span>`; const vv = verdict(a); if(!a.past && a.score>=60) good++;
      return `<span class="pill k-${vv.k}" title="${SLOTS[j].label}: ${vv.t}"${a.past?' style="opacity:.45"':""}>${SLOTS[j].ab}</span>`; }).join("");
    const ws = aggs.filter(Boolean).map(a=>a.wind), wv = aggs.filter(Boolean).map(a=>a.wave).filter(x=>x!=null);
    const domDir = aggs.filter(Boolean).sort((a,b)=>b.wind-a.wind)[0]?.dir;
    const open = openDay === date, ev = (window.OV_EVENTS || []).filter(e => e.data === date);
    html += `<button type="button" class="wrow" data-day="${date}" aria-expanded="${open}" aria-label="${dn.name} ${dn.dm}: mostra les hores${ev.length ? " · " + ev.length + (ev.length === 1 ? " activitat del club" : " activitats del club") : ""}">
      <span class="d"><b><span class="dn">${dn.name}</span>${wxIcon(D.weather_code[i],20)}${ev.length ? `<span class="wev" title="Activitat del club">${EV_IC}</span>` : ""}</b><span>${dn.dm} · <i>${r0(D.temperature_2m_min[i])}–${r0(D.temperature_2m_max[i])}°</i></span></span>
<span class="pills">${pills}</span>
      <span class="wr"><span class="wr-w"><em>${windAbbr(domDir)}</em>${arrow(domDir,13)}<b>${ws.length?r0(Math.min(...ws))+"–"+r0(Math.max(...ws)):"–"}</b><small>kn</small></span><span class="wr-o">${waveIc(14)}<b>${wv.length?Math.max(...wv).toFixed(1).replace(".",","):"–"}</b><small>m</small></span></span>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`;
    if(open) html += `<div class="wdetail">${ev.map(e => `<div class="wev-card">${EV_IC}<div><b>${esc(e.titol)}</b><span>${esc(e.comissio)}</span><p>${esc(e.text)}</p></div></div>`).join("")}<div class="hc-read"></div><div class="chart">${hourChart(date, 7, 21, true, chartW($("week")) - 8)}</div>${chartLegend(true)}</div>`;
  });
  const end = DATA.modelEnd && model !== "auto" ? (() => { const d = new Date(DATA.modelEnd); return `Previsió ${MODELS[model].label} fins ${DAYS_L[d.getDay()].toLowerCase()} a les ${pad(d.getHours())} h; després, Open-Meteo.`; })() : "";
  $("week").innerHTML = (end ? `<p class="note" style="margin-bottom:6px">${esc(end)}</p>` : "") + html;
  applySel();
  $("peekWeek").textContent = good ? good+" franges bones o ideals" : "Cap franja bona";
}
// Llindars navegació: llista dels tipus d'embarcació (Configuració) i detall del tipus triat (critK)
let critK = act;
const critSum = k => { const c = crit[k]; return `Ideal ${c.iMin}–${c.iMax} kn · ratxa fins a ${c.gust} kn · onada fins a ${r1(c.wMax)} m${c.pMin ? ` · període mín. ${c.pMin} s` : ""}`; };
// Llista agrupada: primer les de la barra de dalt (interruptor encès), després la resta del catàleg per famílies.
// Les de les meves embarcacions de la Base hi són sempre (interruptor bloquejat).
function critRow(k, on){
  const lock = actsBoat.includes(k);
  return `<div class="cfg-row crit-row"><button type="button" class="crit-open" data-crit="${k}" data-cfg="crit-det"><span class="cfg-ic">${boatIcon(k, 24)}</span><span class="cfg-rt"><b>${esc(DEFAULTS[k].name)}</b><small>${esc(lock ? "La teva embarcació · " + critSum(k) : critSum(k))}</small></span></button>`
    + `<input type="checkbox" class="switch" data-bar="${k}" aria-label="${esc(DEFAULTS[k].name)} a la barra de dalt"${on ? " checked" : ""}${lock ? " disabled" : ""}></div>`;
}
function renderCritList(){
  const L = $("critList"); if(!L) return;
  const bar = barActs(), rest = Object.keys(DEFAULTS).filter(k => !bar.includes(k)), fams = OVB.FAMS || {};
  L.innerHTML = `<span class="lbl cfg-h">A la barra de dalt (${bar.length} de ${BAR_MAX})</span><div class="cfg-grp">${bar.map(k => critRow(k, true)).join("")}</div>`
    + Object.keys(fams).map(f => { const R = rest.filter(k => DEFAULTS[k].fam === f); return R.length ? `<span class="lbl cfg-h">${esc(fams[f])}</span><div class="cfg-grp">${R.map(k => critRow(k, false)).join("")}</div>` : ""; }).join("")
    + `<p class="note" id="barNote" hidden></p>`;
}
// Canvia l'embarcació triada (barra de dalt) i ho redibuixa tot
function setAct(k){
  if(!DEFAULTS[k]) return; act = k; store.set("ov2_act", act);
  if(DATA) applyModel(); render(); if(window.renderWindMap) renderWindMap(); if(window.renderPrep) renderPrep();
}
function barChanged(){ const B = barActs(); if(!B.includes(act)) setAct(B[0]); else renderSeg(); renderCritList(); }
document.addEventListener("change", e => { const t = e.target; if(!t.matches || !t.matches("[data-bar]")) return;
  const k = t.dataset.bar, B = barActs(), ex = Array.isArray(actsExtra) ? actsExtra.slice() : (actsBoat.length ? [] : ACTS0.slice());
  if(t.checked && B.length >= BAR_MAX){ t.checked = false; const n = $("barNote"); if(n){ n.hidden = false; n.textContent = `A la barra hi caben ${BAR_MAX} embarcacions. Treu-ne una abans d'afegir-ne una altra.`; } return; }
  if(!t.checked && B.length <= 1){ t.checked = true; return; }   // n'hi ha d'haver almenys una
  actsExtra = t.checked ? [...new Set(ex.concat(k))] : ex.filter(x => x !== k);
  store.set("ov2_acts_extra", actsExtra); barChanged(); });
// club.js hi passa els tipus de les meves embarcacions de la Base cada vegada que les llegeix
window.OV_ACTS = {
  boats(types){
    const T = [...new Set((types || []).filter(k => DEFAULTS[k]))];
    if(T.join() === actsBoat.join()) return; actsBoat = T; store.set("ov2_acts_boat", T); barChanged();
  },
  bar: barActs
};
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-crit]"); if(!b || !DEFAULTS[b.dataset.crit]) return; critK = b.dataset.crit; renderCrit(); });
function renderCrit(){
  if(!DEFAULTS[critK]) critK = act;
  const c = crit[critK];
  if(window.OV_CFG) OV_CFG.title("crit-det", DEFAULTS[critK].name);
  $("peekCrit").textContent = `${DEFAULTS[act].short} · ideal ${crit[act].iMin}–${crit[act].iMax} kn · onada fins a ${r1(crit[act].wMax)} m`;
  const F = [["min","Vent mínim (kn)",1],["iMin","Ideal des de (kn)",1],["iMax","Ideal fins a (kn)",1],["max","Vent màxim (kn)",1],["gust","Ratxa màxima (kn)",1],["wOk","Onada còmoda (m)",0.1],["wMax","Onada màxima (m)",0.1],["pMin","Període mínim (s)",1]];
  $("crit").innerHTML = F.map(([k,l,st]) => `<label for="c_${k}">${l}<input id="c_${k}" type="number" inputmode="decimal" step="${st}" min="0" value="${c[k] ?? ""}"${k === "pMin" ? ' placeholder="Indiferent"' : ""} data-k="${k}"></label>`).join("")
    + `<p class="note crit-wide">Onada curta: buit = indiferent. Amb un període més curt (i 0,3 m o més), la nota baixa.</p>`;
}
function render(){
  renderSeg(); renderCrit();
  if(!DATA) return;
  renderNow(); renderHours(); renderWeek();
  $("updated").textContent = "Previsió descarregada el "+stamp(DATA.fetchedAt)+".";
}

/* ---------- tema ---------- */
const THEMES = ["auto","dark","light"];
const THEME_IC = {
  auto:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>`,
  dark:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>`,
  light:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
};
const DOTS_IC = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="12" cy="19" r="2.1"/></svg>`;
const THEME_LBL = {auto:"automàtic (segons el mòbil)", dark:"fosc", light:"clar"};
let theme = store.get("ov2_theme"); if(!THEMES.includes(theme)) theme = "auto";
function applyTheme(){
  if(theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  $("themeBtn").innerHTML = DOTS_IC;
  const dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $("themeColor").setAttribute("content", dark ? "#060c19" : "#e9eef5");
  window.dispatchEvent(new Event("mm-theme"));
}
let textSize = store.get("ov2_size") === "big" ? "big" : "normal";
function applySize(){ if(textSize === "big") document.documentElement.dataset.size = "big"; else delete document.documentElement.dataset.size; }
function renderViewPanel(){
  $("peekVis").textContent = {auto:"Tema automàtic", dark:"Tema fosc", light:"Tema clar"}[theme] + " · lletra " + (textSize === "big" ? "gran" : "petita");
  document.querySelectorAll("#themeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.theme === theme)));
  document.querySelectorAll("#sizeSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.size === textSize)));
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest(".ib-i[data-info]"); if(!b) return; const el = $(b.dataset.info); el.hidden = !el.hidden; b.setAttribute("aria-expanded", String(!el.hidden));
  const sm = b.closest("summary"); if(sm){ e.preventDefault(); if(!el.hidden) sm.parentElement.open = true; } });   // dins d'un desplegable: la (i) no el plega
// Configuració (cfg.js): cada pantalla es pinta quan s'obre
window.addEventListener("ov-cfg", e => { const k = e.detail && e.detail.pg;
  if(k === "model"){ if(DATA){ const errs = modelErrors(); renderModelBox(errs, errs.length ? Math.min(...errs.map(x => x.mae)) : null); } else try{ renderModelBox([], null); }catch(err){} }
  if(k === "vis") renderViewPanel();
  if(k === "crit") renderCritList();
  if(k === "crit-det") renderCrit(); });
$("themeSeg").addEventListener("click", e => { const b = e.target.closest("button[data-theme]"); if(!b) return; theme = b.dataset.theme; store.set("ov2_theme", theme); applyTheme(); renderViewPanel(); });
$("sizeSeg").addEventListener("click", e => { const b = e.target.closest("button[data-size]"); if(!b) return; textSize = b.dataset.size; store.set("ov2_size", textSize); applySize(); renderViewPanel(); });
document.addEventListener("change", e => { if(e.target.name !== "modelPick") return; modelPref = e.target.value; store.set("ov2_model_pref", modelPref);
  if(DATA){ applyModel(); renderNow(); renderHours(); renderWeek(); if(window.renderWindMap) renderWindMap(); if(window.renderPrep) renderPrep(); } });
applySize();
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
applyTheme();

/* ---------- confirmació lliscant (per esborrar o descartar) ---------- */
// Cal arrossegar el botó fins a l'altra punta: no es pot fer sense voler, ni amb guants ni amb el mòbil mullat.
function slideConfirm(el, label, onDone){
  el.innerHTML = `<div class="slc" tabindex="0" role="slider" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="slc-t">${esc(label)}</span><span class="slc-k" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span></div>`;
  const tr = el.firstChild, kn = tr.querySelector(".slc-k"); let x0 = null, dx = 0, max = 0;
  const set = v => { dx = Math.max(0, Math.min(max, v)); kn.style.transform = `translateX(${dx}px)`; tr.style.setProperty("--p", max ? dx/max : 0); tr.setAttribute("aria-valuenow", String(Math.round(max ? dx/max*100 : 0))); };
  const done = () => { tr.classList.add("ok"); set(max); setTimeout(onDone, 120); };
  kn.addEventListener("pointerdown", e => { max = tr.clientWidth - kn.offsetWidth - 8; x0 = e.clientX - dx; kn.setPointerCapture(e.pointerId); tr.classList.add("drag"); e.preventDefault(); });
  kn.addEventListener("pointermove", e => { if(x0 != null) set(e.clientX - x0); });
  const up = () => { if(x0 == null) return; x0 = null; tr.classList.remove("drag"); if(dx >= max * 0.9) done(); else set(0); };
  kn.addEventListener("pointerup", up); kn.addEventListener("pointercancel", up);
  tr.addEventListener("keydown", e => { if(e.key !== "ArrowRight" && e.key !== "End") return; max = tr.clientWidth - kn.offsetWidth - 8; e.preventDefault(); set(e.key === "End" ? max : dx + max/4); if(dx >= max * 0.99) done(); });
}

/* ---------- navegació ---------- */
function go(v){
  ["fc","trip","map","log","club"].forEach(k => { $("view-"+k).hidden = k !== v; });
  document.querySelectorAll(".tabs button").forEach(b => b.dataset.go === v ? b.setAttribute("aria-current","page") : b.removeAttribute("aria-current"));
  window.scrollTo({top:0});
  window.dispatchEvent(new CustomEvent("mm-view", {detail:v}));
}
document.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if(b) go(b.dataset.go); });

const DAYS_S = ["dg.","dl.","dt.","dc.","dj.","dv.","ds."];
$("clock").textContent = LOC.name;

/* ---------- events ---------- */
$("actSeg").addEventListener("click", e => { const b = e.target.closest("button[data-act]"); if(!b) return; setAct(b.dataset.act); });
$("week").addEventListener("click", e => { const b = e.target.closest(".wrow"); if(!b) return; openDay = openDay === b.dataset.day ? null : b.dataset.day; renderWeek();
  if(openDay && (!SEL || SEL.slice(0,10) !== openDay)) selectHour(hourKey(openDay, Math.max(7, Math.min(21, +selKey().slice(11,13)))), "chart"); });
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-dayv]"); if(!b || !DATA) return;
  dayView = b.dataset.dayv; dayViewDate = todayDate(); SEL = null; renderNow(); renderHours(); selectHour(selKey(), "chart"); });
function setDay(v){ dayView = v; dayViewDate = todayDate(); SEL = null; renderNow(); renderHours(); selectHour(selKey(), "chart"); }
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-daycal]"); if(b && DATA) calOpen(); });
/* ---------- calendari propi: verd = hi ha previsió, vermell = sense dades ---------- */
// (el calendari del mòbil no deixa pintar els dies, per això en fem un de propi, amb caselles grans)
const MONTHS_L = ["gener","febrer","març","abril","maig","juny","juliol","agost","setembre","octubre","novembre","desembre"];
function dayHasData(d){ if(!DATA || !DATA.daily.time.includes(d)) return false; let n = 0; for(let h = 9; h <= 18; h++){ const p = DATA.hours[hourKey(d, h)]; if(p && p.wind != null) n++; } return n >= 6; }
function calOpen(){
  calClose();
  const td = todayDate(), vd = viewDay(), last = new Date(DATA.daily.time[DATA.daily.time.length-1] + "T12:00:00");
  const iso = x => `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`;
  const t0 = new Date(td + "T12:00:00"), months = [[t0.getFullYear(), t0.getMonth()]];
  if(last.getMonth() !== t0.getMonth() || last.getFullYear() !== t0.getFullYear()) months.push([last.getFullYear(), last.getMonth()]);
  const month = ([y, m]) => {
    const first = new Date(y, m, 1, 12), lead = (first.getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    let cells = "";
    for(let i = 0; i < lead; i++) cells += `<span></span>`;
    for(let dd = 1; dd <= n; dd++){ const d = iso(new Date(y, m, dd, 12)), past = d < td, ok = !past && dayHasData(d);
      const cls = past ? "past" : ok ? "ok" : "no", lbl = `${dd} ${MONTHS_L[m]}: ${past ? "ja ha passat" : ok ? "amb previsió" : "sense dades"}`;
      cells += `<button type="button" class="cal-d ${cls}${d === vd ? " sel" : ""}${d === td ? " today" : ""}" ${ok ? `data-cald="${d}"` : "disabled"} aria-label="${lbl}">${dd}</button>`; }
    return `<div class="cal-m"><div class="cal-mt">${MONTHS_L[m]} ${y}</div><div class="cal-g"><b>dl</b><b>dt</b><b>dc</b><b>dj</b><b>dv</b><b>ds</b><b>dg</b>${cells}</div></div>`; };
  const el = document.createElement("div"); el.className = "cal-pop"; el.id = "calPop";
  el.innerHTML = `<div class="cal-card" role="dialog" aria-label="Tria un dia"><div class="cal-h"><b>Tria un dia</b><button type="button" class="cal-x" aria-label="Tanca">✕</button></div>
    ${months.map(month).join("")}
    <div class="cal-leg"><span><i class="ok"></i>Amb previsió</span><span><i class="no"></i>Sense dades</span></div></div>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => { const d = e.target.closest("[data-cald]");
    if(d){ const v = d.dataset.cald, i = DATA.daily.time.indexOf(td); calClose(); setDay(v === td ? "today" : v === DATA.daily.time[i+1] ? "tom" : v); return; }
    if(e.target === el || e.target.closest(".cal-x")) calClose(); });
}
function calClose(){ const el = document.getElementById("calPop"); if(el) el.remove(); }
document.addEventListener("keydown", e => { if(e.key === "Escape") calClose(); });
let rsT = null, rsW = innerWidth;
addEventListener("resize", () => { if(innerWidth === rsW) return; rsW = innerWidth; clearTimeout(rsT); rsT = setTimeout(() => { if(DATA){ renderNow(); renderWeek(); } }, 200); });
// Estirar per actualitzar: a dalt de tot de la pàgina, estirar avall obre un espai sota la capçalera amb la icona.
function refreshAll(){ document.dispatchEvent(new Event("ov-pull")); return Promise.allSettled([load(), loadStation(), loadObs(), loadInfo(), loadBuoy()]); }
(() => {
  const P = $("ptr"), MAX = 96, GO = 64, SKIP = ".leaflet-container,.view-panel,.cfg-menu,.cfg-scrim,#clSheet,.full,[data-sw],.chart.wide,.tbl,input,textarea,select,iframe,[role=dialog]";
  let y0 = null, x0 = 0, d = 0, pull = false, busy = false;
  const set = (h, anim) => { P.style.transition = anim ? "height .25s ease" : "none"; P.style.height = h + "px";
    P.style.setProperty("--ptr-r", (h * 4) + "deg"); P.classList.toggle("go", h >= GO); };
  const blocked = t => busy || scrollY > 0 || /riding|cam-open|wm-open/.test(document.body.className)
    || getComputedStyle(document.body).overflow === "hidden" || (t.closest && t.closest(SKIP));
  addEventListener("touchstart", e => { y0 = null; pull = false;
    if(e.touches.length !== 1 || blocked(e.target)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }, {passive:true});
  addEventListener("touchmove", e => { if(y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if(!pull){ if(Math.abs(dx) > 10 && Math.abs(dx) > dy){ y0 = null; return; }
      if(dy < 8 || scrollY > 0){ if(dy < 0) y0 = null; return; } pull = true; }
    d = Math.min(MAX, Math.max(0, (dy - 8) * .5)); set(d);
    if(e.cancelable) e.preventDefault(); }, {passive:false});
  const end = async () => { if(!pull){ y0 = null; return; } y0 = null; pull = false;
    if(d < GO){ set(0, true); return; }
    busy = true; set(44, true); P.classList.add("spin"); try{ navigator.vibrate && navigator.vibrate(10); }catch(e){}
    const t = Date.now(); await refreshAll(); await new Promise(r => setTimeout(r, Math.max(0, 600 - (Date.now() - t))));
    P.classList.remove("spin"); set(0, true); busy = false; };
  addEventListener("touchend", end); addEventListener("touchcancel", end);
})();
$("src").addEventListener("click", () => { const L = LOC.stations; if(L.length < 2) return; stKey = L[(L.indexOf(stKey) + 1) % L.length]; store.set("ov2_station_v3", stKey); ST = null; renderNow(); loadStation(); loadObs(); });
$("crit").addEventListener("change", e => { const k = e.target.dataset.k; if(!k) return; const v = parseFloat(String(e.target.value).replace(",", "."));
  if(k === "pMin" && (isNaN(v) || v <= 0)){ crit[critK].pMin = null; store.set("ov2_crit", crit); renderCrit(); renderCritList(); if(DATA && critK === act){ applyModel(); renderNow(); renderHours(); renderWeek(); } return; }   // buit = indiferent
  if(isNaN(v) || v < 0){ renderCrit(); return; }
  crit[critK][k] = v; store.set("ov2_crit", crit); renderCrit(); renderCritList(); if(DATA && critK === act){ applyModel(); renderNow(); renderHours(); renderWeek(); } });
$("resetCrit").addEventListener("click", () => { crit[critK] = JSON.parse(JSON.stringify(DEFAULTS[critK])); store.set("ov2_crit", crit); renderCritList(); render(); });

renderSeg(); renderCrit();
load(); loadStation(); loadObs(); loadInfo(); loadBuoy(); loadEncerts();
setInterval(() => { if(document.visibilityState === "visible") loadBuoy(); }, 20*60*1000);
setInterval(() => { if(document.visibilityState === "visible") loadInfo(); }, 15*60*1000);
setInterval(load, 30*60*1000);
setInterval(() => { if(document.visibilityState === "visible") loadObs(); }, 10*60*1000);
setInterval(() => { if(document.visibilityState === "visible") loadStation(); }, 60*1000);
document.addEventListener("visibilitychange", () => { if(document.visibilityState !== "visible") return; loadStation(); if(Date.now() - OBS.at > 5*60*1000) loadObs(); if(DATA && Date.now()-new Date(DATA.fetchedAt) > 20*60*1000) load(); });

/* ---------- instal·lació ---------- */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; $("install").hidden = false; });
$("install").addEventListener("click", async () => { if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("install").hidden = true; });
window.addEventListener("appinstalled", () => { $("install").hidden = true; });
if("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(()=>{});

/* ---------- capçalera: s'amaga en fer scroll avall i torna en pujar ---------- */
(() => {
  const top = document.querySelector("header.top"); if(!top) return;
  let lastY = scrollY, acc = 0, ticking = false;
  const upd = () => { ticking = false; const y = scrollY, d = y - lastY; lastY = y;
    const vp = document.getElementById("viewPanel");
    if(y < 60 || (vp && !vp.hidden)){ top.classList.remove("hide"); top.classList.toggle("lift", y > 4); acc = 0; return; }
    top.classList.add("lift");
    acc = (d > 0) === (acc > 0) ? acc + d : d;            // compta el recorregut en la mateixa direcció
    if(acc > 24) top.classList.add("hide"); else if(acc < -16) top.classList.remove("hide"); };
  addEventListener("scroll", () => { if(!ticking){ ticking = true; requestAnimationFrame(upd); } }, {passive:true});
  // en canviar de pestanya o obrir un desplegable, que es vegi
  addEventListener("mm-view", () => top.classList.remove("hide"));
})();

/* ---------- ubicació (configuració) ---------- */
// El selector (mapa + cerca) és a llocs.js. Canviar de lloc recarrega l'app: així totes les dades són del club triat.
// Orientació del mar definida pel club al plànol (club.js): si canvia, es desa i es torna a calcular tot
window.OV_SET_COAST = (club, v) => {
  if(({ocatavent:"masnou"})[club] !== locKey && club !== locKey) return;   // només per al club que es mira
  const nv = typeof v === "number" ? norm(Math.round(v)) : COAST0; if(nv === COAST) return;
  COAST = nv; try{ if(typeof v === "number") localStorage.setItem("ov2_costa_" + locKey, JSON.stringify(nv)); else localStorage.removeItem("ov2_costa_" + locKey); }catch(e){}
  if(DATA){ applyModel(); renderNow(); renderHours(); renderWeek(); }
};
function setLoc(k){ if(!LOCS[k] || k === locKey) return; store.set("ov2_loc", k); store.set("ov2_station_v3", LOCS[k].st); location.reload(); }
$("peekLoc").textContent = LOC.name;
