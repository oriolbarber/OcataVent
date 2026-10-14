"use strict";
/* ============ Ocata Vent 2 · avisos de seguretat en ruta (Fase 3) ============
   Durant una sortida gravada, cada 20 s comprova:
   · Sense vent i lluny: < 1 kn els últims 10 min, a més de 0,5 nm de la base, l'estació marca < 4 kn
     i la previsió no dona vent suficient les properes 2 h.
   · Vent massa fort: l'estació marca ratxes per sobre del màxim de l'embarcació (o vent per sobre del màxim).
   · Onades perilloses: la previsió dona onades per sobre del màxim de l'embarcació les properes 3 h.
   · Tornada a la base: dins del radi de la base 10 min seguits, després d'haver-ne sortit → desa la sortida sola.
   Els tres primers es mostren a dalt de tot, amb vibració i so, i PROPOSEN avisar el club: només es desen a «alertes»
   si el navegant prem «Avisa el club» (decisió de l'Oriol, 14/10/2026: els avisos els autoritza qui navega, perquè siguin fiables).
   Un cop enviat, el navegant el pot anul·lar. Fa servir els criteris de cada embarcació (crit).
   No hi ha avís per no tornar a l'hora prevista: decisió de l'Oriol (13/10/2026). */
(() => {
const BASE_R = 50;            // m: radi de la base nàutica (pendent de la junta)
const FORA_M = 150;           // m: cal haver-se allunyat això de la base perquè compti la tornada
const SNOOZE = 20*60e3;       // «No cal» amaga la proposta 20 min
const AT_BASE_MS = 10*60e3;   // temps dins de la base per tancar la sortida sola
const KINDS = ["sense-vent", "vent-fort", "onades"];
let active = {}, snooze = {}, sent = {}, atBase = 0, wasOut = false, lastLive = null, closing = false;   // sent[k]: "enviant" | "enviat" 

const home = () => ({lat:HOME[0], lon:HOME[1]});
const CAP = ["al nord", "al nord-est", "a l'est", "al sud-est", "al sud", "al sud-oest", "a l'oest", "al nord-oest"];
const compass = d => d == null ? "–" : CAP[Math.round(((d % 360) + 360) % 360 / 45) % 8];
function sog10(){   // velocitat mitjana dels últims 10 minuts (kn), si n'hi ha prou punts
  if(!LIVE || LIVE.pts.length < 2) return null;
  const P = LIVE.pts, last = P[P.length-1], Q = P.filter(p => last.t - p.t <= 10*60e3);
  if(Q.length < 2 || last.t - Q[0].t < 8*60e3) return null;
  let d = 0; for(let i = 1; i < Q.length; i++) d += hav(Q[i-1], Q[i]);
  return d / ((last.t - Q[0].t)/1000) * KN;
}
function nextHours(n){   // previsió de les properes n hores (objectes de DATA.hours)
  if(!DATA || !DATA.hours) return [];
  const out = [], d = new Date();
  for(let i = 0; i <= n; i++){ const x = new Date(d.getTime() + i*3600e3), k = `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}T${pad(x.getHours())}:00`; if(DATA.hours[k]) out.push(DATA.hours[k]); }
  return out;
}

function evaluate(){
  const c = crit[LIVE.act] || crit.pati, name = DEFAULTS[LIVE.act]?.name || "", P = LIVE.pts, last = P[P.length-1], found = {};
  if(!last) return found;
  const distNm = hav(home(), last)/NM, s10 = sog10(), stW = stFresh() ? ST.wind : null;
  const fc2 = nextHours(2).map(p => p.wind).filter(v => v != null), fcMax = fc2.length ? Math.max(...fc2) : null;
  if(s10 != null && s10 < 1 && distNm > 0.5 && (stW == null || stW < 4) && (fcMax == null || fcMax < c.min)){
    const brg = bearing(last, home());
    found["sense-vent"] = {val:Math.round(distNm*10)/10, title:"Sense vent i lluny de la base",
      text:`Ets a ${distNm.toFixed(1).replace(".", ",")} nm de la base i no hi ha vent${fcMax != null ? " (previsió: " + r0(fcMax) + " kn les properes 2 h)" : ""}. La base és cap ${compass(brg)} (${Math.round(brg)}°). Si no pots tornar, demana ajuda: VHF canal 16 o 112.`};
  }
  if(stFresh() && ((ST.gust != null && ST.gust > c.gust) || (ST.wind != null && ST.wind > c.max)))
    found["vent-fort"] = {val:Math.round(ST.gust ?? ST.wind), title:"Vent massa fort",
      text:`L'estació marca ${r0(ST.wind)} kn amb ratxes de ${r0(ST.gust)} kn. Per al ${name}, el màxim és ${c.max} kn i ${c.gust} de ratxa. Torna a la base.`};
  const wv = nextHours(3).map(p => beachWave(p)).filter(v => v != null), wMax = wv.length ? Math.max(...wv) : null;
  if(wMax != null && wMax > c.wMax)
    found["onades"] = {val:Math.round(wMax*10)/10, title:"Onades perilloses a la previsió",
      text:`S'esperen onades de ${r1(wMax)} m a la platja les properes 3 h. Per al ${name}, el màxim és ${String(c.wMax).replace(".", ",")} m. Torna a la base abans que arribin.`};
  return found;
}

function beep(){
  try{ navigator.vibrate?.([400, 200, 400, 200, 400]); }catch(e){}
  try{ const A = new (window.AudioContext || window.webkitAudioContext)(), o = A.createOscillator(), g = A.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(A.destination); g.gain.setValueAtTime(0.25, A.currentTime);
    [0, .35, .7].forEach(t => { g.gain.setValueAtTime(0.25, A.currentTime + t); g.gain.setValueAtTime(0, A.currentTime + t + .2); });
    o.start(); o.stop(A.currentTime + 1); }catch(e){}
}
function box(){ let b = $("liveAlert"); if(!b){ b = document.createElement("div"); b.id = "liveAlert"; b.className = "live-alert"; b.setAttribute("role", "alert"); document.body.appendChild(b); } return b; }
function render(){
  const b = box(), now = Date.now(), L = KINDS.filter(k => sent[k] || (active[k] && !(snooze[k] > now)));
  b.hidden = !L.length;
  b.innerHTML = L.map(k => sent[k] ? `<div class="la-item sent"><b>${esc(active[k]?.title || "Avís enviat")}</b>
      <p>${sent[k] === "enviant" ? (navigator.onLine === false ? "Sense connexió: l'avís s'enviarà quan en tinguis." : "Enviant l'avís al club…") : "Avís enviat al club."}</p>
      <div class="la-btns"><button type="button" class="btn" data-cancel="${k}">Estic bé · anul·la'l</button></div></div>`
    : `<div class="la-item"><b>${esc(active[k].title)}</b><p>${esc(active[k].text)}</p>
      <div class="la-btns"><button type="button" class="btn" data-snooze="${k}">No cal</button><button type="button" class="btn la-pri" data-send="${k}">Avisa el club</button></div></div>`).join("");
}
async function send(k){
  if(!lastLive || sent[k]) return;
  sent[k] = "enviant"; render();
  const ok = await window.OV_CLUB?.raiseAlert(k, active[k]?.val, LIVE && LIVE.pts[LIVE.pts.length-1], lastLive);
  if(ok){ sent[k] = "enviat"; render(); } else { delete sent[k]; toast("No s'ha pogut enviar l'avís. Si cal ajuda: VHF canal 16 o 112."); }
}
function cancel(k){ if(lastLive) window.OV_CLUB?.clearAlert(k, lastLive); delete sent[k]; snooze[k] = Date.now() + SNOOZE; render(); }
function toast(t){ const b = box(); b.hidden = false; b.innerHTML = `<div class="la-item ok"><b>${esc(t)}</b><button type="button" class="btn" data-snooze="ok">D'acord</button></div>`; }
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#liveAlert [data-snooze], #liveAlert [data-send], #liveAlert [data-cancel]"); if(!t) return;
  if(t.dataset.send){ send(t.dataset.send); return; }
  if(t.dataset.cancel){ cancel(t.dataset.cancel); return; }
  const k = t.dataset.snooze; if(k !== "ok") snooze[k] = Date.now() + SNOOZE; else box().hidden = true; render();
});

async function autoReturn(){
  if(closing || !LIVE) return; closing = true;
  try{ if(typeof showRide === "function") showRide(false); await finishTrip(); window.OV_CLUB?.arrived(); toast("Has tornat a la base: la sortida s'ha desat sola."); }
  finally{ closing = false; check(); }   // treu de seguida els avisos de la sortida acabada
}

function check(){
  if(!LIVE){   // la sortida s'ha acabat: es treuen els avisos
    if(lastLive){ for(const k of Object.keys(sent)) window.OV_CLUB?.clearAlert(k, lastLive); active = {}; snooze = {}; sent = {}; atBase = 0; wasOut = false; lastLive = null; render(); }
    return;
  }
  if(lastLive && lastLive.id !== LIVE.id){ active = {}; snooze = {}; sent = {}; atBase = 0; wasOut = false; }
  lastLive = {id:LIVE.id, start:LIVE.start};
  const found = evaluate(), last = LIVE.pts[LIVE.pts.length-1];
  let fresh = false;
  for(const k of KINDS){   // només es proposa; l'avís al club l'envia el navegant (i el retira ell, o en acabar la sortida)
    if(found[k] && !active[k]) fresh = true;
    if(found[k]) active[k] = found[k]; else if(!sent[k]) delete active[k];
  }
  if(fresh && KINDS.some(k => found[k] && !sent[k] && !(snooze[k] > Date.now()))) beep();
  render();
  // Tornada a la base
  if(last){
    const d = hav(home(), last);
    if(d > FORA_M) wasOut = true;
    if(wasOut && d < BASE_R){ if(!atBase) atBase = Date.now(); if(Date.now() - atBase >= AT_BASE_MS) autoReturn(); }
    else atBase = 0;
  }
}
setInterval(check, 20000);
window.OV_AVISOS = {sog10, check};
})();
