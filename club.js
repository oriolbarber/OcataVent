"use strict";
/* ============ Ocata Vent 2 · Club (Fase 2): mur, avisos, anuncis i base ============
   Només per a socis aprovats. Fa servir la sessió i el Firestore de cloud.js (window.OV_CLOUD.ctx()).
   Col·leccions: publicacions, intencions, avisos, anuncis (+ interessats), presencia. */
(() => {
// Comissions del club: les edita l'administració (clubs/{clubId}.comissions, admin.js). La Junta no es pot eliminar.
const COMS0 = {junta:"Junta", manteniment:"Manteniment", economica:"Econòmica"};
const COMSm = () => window.OV_COMS || COMS0;
const CATS = {tripulacio:"Tripulació", material:"Material", altres:"Altres"};
const UP = '<path d="M7 11v10H3V11z"/><path d="M7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V10h5.5a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 21H7"/>';
const REACTS = [
  {k:"up", l:"M'agrada", p:UP},
  {k:"clap", l:"Aplaudiment", p:'<path d="M9 13l5-5a1.5 1.5 0 0 1 2 2l-3 3 4-4a1.5 1.5 0 0 1 2 2l-4 4 2.5-2.5a1.5 1.5 0 0 1 2 2L15 19a5 5 0 0 1-7 0l-.5-.5a5 5 0 0 1 0-7L9 10"/><path d="M4 5l1.5 1.5M9 2.5v2M2.5 9h2"/>'},
  {k:"wow", l:"Ensurt", p:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="15" cy="10" r="1.2" fill="currentColor"/><ellipse cx="12" cy="16" rx="2" ry="2.6"/>'},
  {k:"down", l:"No m'agrada", p:UP, rot:true}
];
const svgI = (p, z, rot) => `<svg width="${z||22}" height="${z||22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${rot ? ' style="transform:rotate(180deg)"' : ""}>${p}</svg>`;
const LOCK = svgI('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 18);
const PIN = svgI('<path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v6"/>', 15);
const XI = svgI('<path d="M6 6l12 12M18 6L6 18"/>', 20);
const DAY = 864e5, MIN = 6e4, INT_DIES = 15, AN_MAX = 60;   // «Qui surt»: fins a 15 dies vista
const now = () => Date.now();

let C = null, tab = store.get("ov2_club_tab") || "mur", mapObj = null, lastPos = 0;
const D = {pubs:[], intents:[], avisos:[], anuncis:[], pres:[], myPres:null, alertes:[], at:{}};
const WARN = svgI('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', 22);
const F0 = {open:false, date:"mes", person:"tots", order:"recents", vent:false, onada:false, all:false};
let filt = Object.assign({}, F0, store.get("ov2_club_filt") || {}, {open:false});
const ui = {avisCom:"totes", anCat:"tots", avisOpen:false, anOpen:false, interest:{}, interested:{}};
const EYE = svgI('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 22);
const SEEN = svgI('<path d="M2 13l4 4L16 7"/><path d="M10 15l2 2L22 7"/>', 22);
const EYE_S = svgI('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 14);
const CAL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const dayLong = d => new Date(d + "T12:00").toLocaleDateString("ca", {weekday:"long", day:"numeric", month:"long"});
// Filtres plegats (avisos i anuncis): botó «Filtres» + resum; en obrir-lo, les opcions
function foldFilters(key, label, open, chips){
  return `<div class="cl-fbar"><button type="button" class="btn cl-fbtn" data-fold="${key}" aria-expanded="${open}">${svgI('<path d="M4 6h16M7 12h10M10 18h4"/>', 20)}Filtres${label ? `<span class="cl-n">1</span>` : ""}</button>
    <span class="cl-sum">${esc(label || "Tots")}</span></div>${open ? `<div class="card cl-panel"><div class="cl-chips">${chips}</div></div>` : ""}`;
}

/* ---------- utilitats ---------- */
const uid = () => C.user.uid;
const col = n => C.F.collection(C.db, n);
const ref = (...p) => C.F.doc(C.db, ...p);
const W = (f, op, v) => C.F.where(f, op, v);
const getAll = async (n, ...w) => (await C.F.getDocs(C.F.query(col(n), ...w))).docs.map(d => Object.assign({id:d.id}, d.data()));
const ms = v => v == null ? null : typeof v === "number" ? v : v.toMillis ? v.toMillis() : +new Date(v);
const TS = m => C.F.Timestamp.fromMillis(m);
const alive = x => x.caduca == null || ms(x.caduca) > now();   // sense «caduca» (avisos sense data): no caduca mai
const num = v => typeof v === "number" && isFinite(v) ? Math.round(v*100)/100 : null;
const initials = s => String(s || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const hm = t => { const d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
const dayStr = t => new Date(t).toLocaleDateString("ca", {weekday:"short", day:"numeric", month:"short"});
const ago = t => { const m = Math.max(0, Math.round((now() - t)/MIN)); return m < 1 ? "ara" : m < 60 ? "fa " + m + " min" : "fa " + Math.round(m/60) + " h"; };
const boatShort = k => DEFAULTS[k]?.short || DEFAULTS[k]?.name || k || "";
const vis = () => window.OV_PRIV ? OV_PRIV.pref("presencia") : "club";   // Configuració ▸ Confidencialitat (amics.js)
const NIVT = v => (window.OV_PRIV?.NIV || {})[v] || v;
// Publicar avisos: administració i premium, a qualsevol comissió; la resta, a les seves i amb el permís «avisos»
const canPost = () => !C ? [] : (C.isAdm || C.isPremium) ? Object.keys(COMSm()) : C.perms.includes("avisos") ? (C.member.comissions || []).filter(k => COMSm()[k]) : [];
const ERRS = {"permission-denied":"El núvol ho ha refusat (permís). Comprova que les regles estan publicades.", "unavailable":"Sense connexió amb el núvol.", "timeout":"El núvol no respon."};
const errText = e => ERRS[e && e.code] || "No s'ha pogut fer" + (e && e.code ? " (" + e.code + ")." : ".");
function say(t){ const m = $("clubMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } }
function sheetSay(t){ const m = $("shMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } }
const TO = (p, n = 15000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r({code:"timeout"}), n))]);

async function ctx(){ C = window.OV_CLOUD?.ctx ? await window.OV_CLOUD.ctx().catch(() => null) : null; return C; }
const visible = () => !$("view-club").hidden;

/* ---------- avisos amb data: es mostren a la previsió de 7 dies (app.js, renderWeek) ---------- */
// Puntet vermell a la pestanya «Club» del menú principal si hi ha avisos sense llegir
const unreadN = () => C ? D.avisos.filter(a => alive(a) && !(a.vist || {})[uid()]).length : 0;
function navDot(){
  const d = $("clubDot"); if(!d) return;
  const n = unreadN(); d.hidden = !n;
  $("tabClub")?.setAttribute("aria-label", n ? `Club, ${n} avisos sense llegir` : "Club");
}
function publishEvents(){
  navDot();
  window.OV_EVENTS = D.avisos.filter(a => a.data && alive(a)).map(a => ({data:a.data, titol:a.titol, text:a.text, comissio:COMSm()[a.comissio] || a.comissio}));
  window.dispatchEvent(new CustomEvent("ov-events"));
}
async function loadEvents(){ if(!C) return; try{ D.avisos = await getAll("avisos", W("clubId", "==", C.member.clubId)); D.at.avisos = now(); publishEvents(); }catch(e){} }

/* ---------- càrrega ---------- */
// Tot el que aquest soci pot veure d'una col·lecció, segons la confidencialitat de cada document: una consulta per nivell
async function getVisible(n){
  const club = C.member.clubId, qs = [[W("clubId", "==", club), W("visibilitat", "==", "club")], [W("visibilitat", "==", "tothom")],
    [W("lectors", "array-contains", uid())], [W("userId", "==", uid())]];
  const out = new Map();
  (await Promise.all(qs.map(w => getAll(n, ...w).catch(e => { if(e && e.code === "permission-denied") return []; throw e; })))).flat().forEach(x => out.set(x.id, x));
  return [...out.values()].filter(x => !(x.amagat || []).includes(club));   // amagat per al meu club per moderació
}
// Qui ho veu: el selector dels formularis i els camps que es desen
const visSelect = (k, cur) => field("shVis", "Qui ho veu", `<select class="field" id="shVis">${(window.OV_PRIV ? OV_PRIV.options(k) : ["club"]).map(v => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(NIVT(v))}</option>`).join("")}</select>`);
async function visFields(v){ if(window.OV_PRIV) await OV_PRIV.ready(); return {visibilitat:v, lectors: window.OV_PRIV ? OV_PRIV.lectors(v) : []}; }
const prefOf = k => window.OV_PRIV ? OV_PRIV.pref(k) : "club";
const canMod = () => !!(C && (C.perms || []).includes("moderar"));
// Moderació: el contingut del propi club es retira; el d'un altre club (visible per a «tothom») només s'amaga per al meu club
const modBtn = (n, x) => x.clubId === C.member.clubId || C.isAdm
  ? `<button type="button" class="btn sm cl-mod" data-askdel="${n}" data-id="${esc(x.id)}">Retira (moderació)</button>`
  : `<button type="button" class="btn sm cl-mod" data-askhide="${n}" data-id="${esc(x.id)}">Amaga per al club</button>`;
const NEED = {mur:["pubs", "intents", "avisos"], avisos:["avisos"], anuncis:["anuncis", "avisos"], base:["pres", "avisos"]};
async function fetchK(k){
  const club = C.member.clubId;
  if(k === "pubs") D.pubs = await getVisible("publicacions");
  if(k === "intents") D.intents = await getVisible("intencions");
  if(k === "avisos"){ D.avisos = await getAll("avisos", W("clubId", "==", club)); publishEvents(); }
  if(k === "anuncis"){
    D.anuncis = await getVisible("anuncis");
    await Promise.all(D.anuncis.filter(alive).map(async a => {
      if(a.userId === uid()) ui.interested[a.id] = (await getAll("anuncis/" + a.id + "/interessats")).map(x => x.nom);
      else ui.interest[a.id] = (await C.F.getDoc(ref("anuncis", a.id, "interessats", uid()))).exists();
    }));
  }
  if(k === "pres"){
    D.pres = await getVisible("presencia");
    const mine = await C.F.getDoc(ref("presencia", uid()));
    D.myPres = mine.exists() ? Object.assign({id:mine.id}, mine.data()) : null;
    if(D.myPres && !D.pres.some(p => p.id === uid())) D.pres.push(D.myPres);
  }
  D.at[k] = now();
}
async function load(force){
  if(!C) return;
  const need = NEED[tab].filter(k => force || !D.at[k] || now() - D.at[k] > 30000);
  render();
  if(!need.length) return;
  try{ await TO(Promise.all(need.map(fetchK))); say(""); }catch(e){ say(errText(e)); }
  render(); cleanup();
}
function cleanup(){   // les coses caducades les esborra qualsevol soci que les vegi
  for(const [n, L] of [["intencions", D.intents], ["avisos", D.avisos], ["anuncis", D.anuncis]])
    for(const x of L) if(x.caduca && !alive(x)) C.F.deleteDoc(ref(n, x.id)).catch(() => {});
}

/* ---------- vista ---------- */
// Compte sense aprovar: la pestanya hi és, però només explica què falta
const accSt = () => window.OV_CLOUD?.status ? OV_CLOUD.status() : null;
function renderWait(){
  const el = $("clubView"); if(!el) return;
  const st = accSt();
  const t = st === "pendent" ? ["Pendent d'aprovació", "Has demanat l'alta. Quan l'administració del club l'aprovi, aquí hi veuràs el mur, els avisos, els anuncis i qui és a la base."]
    : st === "sense-alta" ? ["Falta l'alta al club", "Has entrat, però encara no has demanat l'alta. Ves a Configuració ▸ Compte i prem «Sol·licita l'alta»."]
    : ["Alta no aprovada", "L'alta no s'ha aprovat. Si creus que és un error, parla amb la junta."];
  el.innerHTML = `<article class="card cl-wait"><h2>${t[0]}</h2><p>${t[1]}</p>
    <button type="button" class="btn acc-wide" id="clWaitRe">Torna-ho a comprovar</button></article>`;
}
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("#clWaitRe"); if(!b) return;
  b.disabled = true; b.textContent = "Comprovant…";
  await window.OV_CLOUD?.reread?.();
  if(!C) renderWait();
});
function render(){
  const el = $("clubView"); if(!el) return;
  if(!C){ navDot(); if(accSt()) renderWait(); return; }
  if(mapObj){ mapObj.remove(); mapObj = null; }
  clearRouteMaps();
  const unread = unreadN(); navDot();
  const tabs = [["mur", "Mur"], ["avisos", "Avisos"], ["anuncis", "Anuncis"], ["base", "Base"]];
  el.innerHTML = `<nav class="cl-tabs" aria-label="Seccions del club">${tabs.map(([k, t]) => `<button type="button" data-ctab="${k}"${k === tab ? ' aria-current="page"' : ""}>${t}${k === "avisos" && unread ? `<span class="cl-dot" aria-label="${unread} sense llegir">${unread}</span>` : ""}</button>`).join("")}</nav>
    <div class="msg err" id="clubMsg" hidden></div>
    ${alertBanner()}
    ${({mur:renderMur, avisos:renderAvisos, anuncis:renderAnuncis, base:renderBase})[tab]()}`;
  if(tab === "base") setTimeout(drawMap, 0);
  if(tab === "mur") setTimeout(drawRouteMaps, 0);
}

/* ---------- MUR ---------- */
function activeFilters(){
  const P = {meves:"Les meves"}; D.pubs.forEach(p => P[p.userId] = p.nom);
  return [filt.date !== "tot" ? (filt.date === "mes" ? "Últim mes" : "Última setmana") : null,
    filt.person !== "tots" ? (P[filt.person] || "Una persona") : null,
    filt.order === "likes" ? "Més reaccions" : null, filt.vent ? "Vent fort" : null, filt.onada ? "Onada forta" : null].filter(Boolean);
}
const nReact = p => Object.keys(p.reaccions || {}).length;
function feedList(){
  const t0 = {setmana: now() - 7*DAY, mes: now() - 31*DAY, tot: 0}[filt.date] || 0;
  const L = D.pubs.filter(p => (filt.all || p.act === act) && p.inici >= t0
    && (filt.person === "tots" || (filt.person === "meves" ? p.userId === uid() : p.userId === filt.person))
    && (!filt.vent || (p.vent && p.vent.avg > 16)) && (!filt.onada || (p.onada != null && p.onada >= 0.8)));
  return L.sort(filt.order === "likes" ? (a, b) => nReact(b) - nReact(a) || b.inici - a.inici : (a, b) => b.inici - a.inici);
}
const chip = (attr, val, on, label) => `<button type="button" class="cl-chip" ${attr}="${esc(val)}" aria-pressed="${!!on}">${esc(label)}</button>`;
function renderMur(){
  const act0 = activeFilters();
  const people = {}; D.pubs.forEach(p => { if(p.userId !== uid()) people[p.userId] = p.nom; });
  const bar = `<div class="cl-fbar"><button type="button" class="btn cl-fbtn" id="clFilt" aria-expanded="${filt.open}" aria-controls="clPanel">${svgI('<path d="M4 6h16M7 12h10M10 18h4"/>', 20)}Filtres${act0.length ? `<span class="cl-n">${act0.length}</span>` : ""}</button>
    <span class="cl-sum">${esc([filt.all ? "Totes les embarcacions" : "Només " + boatShort(act)].concat(act0).join(" · "))}</span></div>`;
  const panel = !filt.open ? "" : `<div class="card cl-panel" id="clPanel">
    <div class="cl-grp"><span class="lbl">Data</span><div class="cl-chips">${[["setmana", "Última setmana"], ["mes", "Últim mes"], ["tot", "Tot"]].map(([k, t]) => chip("data-fdate", k, filt.date === k, t)).join("")}</div></div>
    <div class="cl-grp"><span class="lbl">Persones</span><div class="cl-chips">${[["tots", "Tothom"], ["meves", "Les meves"]].concat(Object.entries(people).slice(0, 8)).map(([k, t]) => chip("data-fperson", k, filt.person === k, t)).join("")}</div></div>
    <div class="cl-grp"><span class="lbl">Ordena per</span><div class="cl-chips">${[["recents", "Més recents"], ["likes", "Més reaccions"]].map(([k, t]) => chip("data-forder", k, filt.order === k, t)).join("")}</div></div>
    <div class="cl-grp"><span class="lbl">Condicions</span><div class="cl-chips">${chip("data-fflag", "vent", filt.vent, "Vent fort (+16 kn)")}${chip("data-fflag", "onada", filt.onada, "Onada forta (+0,8 m)")}</div></div>
    <label class="cl-sw"><span>Totes les embarcacions</span><input type="checkbox" class="switch" id="clAll"${filt.all ? " checked" : ""}></label>
    <div class="cl-row2"><button type="button" class="btn" id="clReset">Esborra filtres</button><button type="button" class="btn cl-pri" id="clFiltDone">Fet</button></div></div>`;
  const L = feedList();
  return bar + panel + intentsCard() + (L.length ? L.map(card).join("")
    : `<article class="card empty">${D.at.pubs ? (D.pubs.length ? "Cap sortida amb aquests filtres." : "Encara no hi ha cap sortida publicada. Comparteix-ne una des de l'Historial.") : "Carregant…"}</article>`);
}
function intentsCard(){
  const L = D.intents.filter(alive).sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  const today = ymd(new Date()), tom = ymd(new Date(now() + DAY));
  const dl = d => d === today ? "Avui" : d === tom ? "Demà" : new Date(d + "T12:00").toLocaleDateString("ca", {weekday:"short", day:"numeric"});
  return `<section class="card cl-intents" aria-label="Qui surt a navegar"><div class="card-h"><span class="lbl">Qui surt</span><span class="note">S'esborra l'endemà</span></div>
    ${L.map(it => { const ap = it.apuntats || {}, n = Object.keys(ap).length, on = !!ap[uid()], mine = it.userId === uid();
      return `<div class="cl-int"><div class="cl-when"><b>${esc(dl(it.dia))}</b><span>${esc(it.hora)}</span></div>
        <div class="cl-who"><b>${esc(it.nom)}</b><span>${esc(boatShort(it.act))} · ${n === 1 ? "1 s'hi apunta" : n + " s'hi apunten"}${n ? ": " + esc(Object.values(ap).join(", ")) : ""}</span></div>
        ${mine ? `<button type="button" class="btn sm" data-askdel="intencions" data-id="${esc(it.id)}">Retira</button>` : `<button type="button" class="btn cl-go" data-join="${esc(it.id)}" aria-pressed="${on}">${on ? "Hi vas ✓" : "Hi vaig"}</button>`}</div>
        ${!mine && canMod() ? modBtn("intencions", it) : ""}<div data-delbox="${esc(it.id)}"></div>`; }).join("")}
    <button type="button" class="btn cl-dash" id="clNewIntent">+ Anuncia que surts</button></section>`;
}
function card(p){
  const mine = p.userId === uid(), rc = p.reaccions || {}, my = rc[uid()], cnt = k => Object.values(rc).filter(x => x === k).length;
  const st = (l, val, u, sub, hot) => `<div class="stat cl-st"><span class="lbl">${l}</span><span class="v"${hot ? ' style="color:var(--accent-2)"' : ""}>${val}<small> ${u}</small></span><span class="cl-sub">${esc(sub)}</span></div>`;
  const durM = Math.round((p.durS || 0)/60);
  return `<article class="card cl-card" aria-label="Sortida publicada: ${esc(p.titol || "")}">
    <div class="cl-stats">
      ${st("Distància", (p.distNm || 0).toFixed(1).replace(".", ","), "nm", durM >= 60 ? Math.floor(durM/60) + " h " + (durM % 60) + " min" : durM + " min")}
      ${st("Vel. màx.", r1(p.maxKn), "kn", "Mitjana " + r1(p.avgKn))}
      ${st("Vent", r0(p.vent?.avg), "kn", p.vent && p.vent.avg != null ? windName(p.vent.dir) + " · ratxa " + r0(p.vent.gust) : "Sense dades", true)}</div>
    ${p.onada != null ? `<div class="cl-sub">Onada màxima: ${r1(p.onada)} m</div>` : ""}
    ${p.ruta ? routeSvg(p.ruta) : `<div class="cl-noroute">${LOCK}Ruta no publicada</div>`}
    ${p.comentari ? `<p class="cl-text">${esc(p.comentari)}</p>` : ""}
    <div class="cl-head cl-foot"><span class="cl-av" aria-hidden="true">${esc(initials(p.nom))}</span>
      <div class="cl-who"><b>${esc(p.nom)}</b><span>${esc(boatShort(p.act))} · ${esc(dayStr(p.inici))}</span></div>
      <span class="cl-boat">${typeof boatIcon === "function" ? boatIcon(p.act) : ""}</span></div>
    <div class="cl-reacts" role="group" aria-label="Reaccions">${REACTS.map(r => `<button type="button" class="cl-r" data-react="${r.k}" data-pub="${esc(p.id)}" aria-pressed="${my === r.k}" aria-label="${r.l}">${svgI(r.p, 22, r.rot)}${cnt(r.k) ? `<span>${cnt(r.k)}</span>` : ""}</button>`).join("")}
      ${mine ? `<button type="button" class="btn sm cl-edit" data-editpub="${esc(p.id)}">Edita</button>` : ""}</div>
    ${!mine && canMod() ? modBtn("publicacions", p) + `<div data-delbox="${esc(p.id)}"></div>` : ""}
  </article>`;
}
const NO_ROUTE = "Aquesta sortida no té prou recorregut GPS per mostrar-ne la ruta (cal haver-se allunyat almenys 100 m). Treu «Inclou la ruta» per publicar-la sense.";
function routePts(s){ return String(s).split(";").map(x => x.split(",").map(Number)).filter(a => a.length === 2 && isFinite(a[0]) && isFinite(a[1])); }
function routeSvg(s){
  const P = routePts(s);
  if(P.length < 2) return "";
  return `<figure class="cl-route"><div class="map short cl-rmap" data-route="${esc(String(s))}" role="img" aria-label="Mapa de la ruta">${routeLine(P)}</div></figure>`;
}
// traçat sense fons de mapa: es veu mentre carrega el mapa i si no hi ha Leaflet
function routeLine(P){
  const k = Math.cos(P[0][0]*Math.PI/180), xs = P.map(p => p[1]*k), ys = P.map(p => p[0]);
  const Wd = 360, H = 240, pd = 16, x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sc = Math.min((Wd - 2*pd)/((x1 - x0) || 1e-6), (H - 2*pd)/((y1 - y0) || 1e-6)), ox = (Wd - (x1 - x0)*sc)/2, oy = (H - (y1 - y0)*sc)/2;
  const pts = P.map((p, i) => (ox + (xs[i] - x0)*sc).toFixed(1) + "," + (oy + (y1 - ys[i])*sc).toFixed(1)).join(" ");
  return `<svg viewBox="0 0 ${Wd} ${H}"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
let routeMaps = [];
function clearRouteMaps(){ routeMaps.forEach(m => { try{ m.remove(); }catch(e){} }); routeMaps = []; }
function drawRouteMaps(){
  clearRouteMaps();
  if(typeof baseMap !== "function" || !window.L) return;
  document.querySelectorAll("#clubView .cl-rmap[data-route]").forEach(el => {
    const P = routePts(el.dataset.route); if(P.length < 2) return;
    const m = baseMap(el, true); if(!m) return;
    const line = L.polyline(P, {color:cssVar("--accent"), weight:4, opacity:.95}).addTo(m);
    m.fitBounds(line.getBounds().pad(0.15), {maxZoom:16});
    routeMaps.push(m);
  });
}

/* ---------- AVISOS ---------- */
function renderAvisos(){
  const L = D.avisos.filter(a => alive(a) && (ui.avisCom === "totes" || a.comissio === ui.avisCom))
    .sort((a, b) => (b.fixat ? 1 : 0) - (a.fixat ? 1 : 0) || (a.data && b.data ? a.data.localeCompare(b.data) : (a.data ? -1 : b.data ? 1 : 0)) || ms(b.creat) - ms(a.creat));
  const coms = canPost(), mine = C.member.comissions || [];
  return foldFilters("avis", ui.avisCom === "totes" ? "" : COMSm()[ui.avisCom], ui.avisOpen, [["totes", "Totes"]].concat(Object.entries(COMSm())).map(([k, t]) => chip("data-acom", k, ui.avisCom === k, t)).join(""))
    + `${L.map(a => { const seen = !!(a.vist || {})[uid()], n = Object.keys(a.vist || {}).length, own = a.userId === uid(), del = own || C.isAdm || mine.includes(a.comissio) || canMod();
      return `<article class="card cl-avis c-${esc(a.comissio)}${seen ? "" : " unread"}">
        <div class="cl-avh"><span class="cl-badge">${esc(COMSm()[a.comissio] || a.comissio)}</span>${a.fixat ? `<span class="cl-pin">${PIN}Fixat</span>` : ""}<span class="cl-date">${esc(dayStr(ms(a.creat) || now()))}</span></div>
        <h3 class="cl-atitle">${esc(a.titol)}</h3>
        ${a.data ? `<div class="cl-event">${CAL}<b>${esc(dayLong(a.data))}</b></div>` : ""}
        <p class="cl-text">${esc(a.text)}</p>
        <div class="cl-afoot"><div class="cl-who"><span>${esc(a.autorNom || "")} · ${esc(COMSm()[a.comissio] || "")}${a.editat ? " · editat" : ""}</span><span>${a.data ? "Desapareix l'endemà" : "Fins que es retiri"} · <span class="cl-nv" aria-label="vist per ${n}">${EYE_S}${n}</span></span></div>
          <button type="button" class="btn cl-seen" data-seen="${esc(a.id)}" aria-pressed="${seen}" aria-label="${seen ? "Vist. Toca per desmarcar" : "Marca com a vist"}">${seen ? SEEN : EYE}<small>${seen ? "Vist" : "Marca"}</small></button></div>
        ${own || del ? `<div class="cl-row2">${own ? `<button type="button" class="btn sm" data-editavis="${esc(a.id)}">Edita</button>` : "<span></span>"}${del ? `<button type="button" class="btn sm" data-askdel="avisos" data-id="${esc(a.id)}">Retira l'avís</button>` : ""}</div><div data-delbox="${esc(a.id)}"></div>` : ""}</article>`; }).join("")
      || `<article class="card empty">${D.at.avisos ? "No hi ha cap avís." : "Carregant…"}</article>`}
    ${coms.length ? `<button type="button" class="btn cl-pri cl-wide" id="clNewAvis">+ Nou avís</button><p class="note">Hi publiquen les comissions amb permís per fer avisos${mine.length ? ". Tu hi publiques com a: " + esc(mine.map(k => COMSm()[k]).join(", ")) : ""}.</p>` : ""}`;
}

/* ---------- ANUNCIS ---------- */
function renderAnuncis(){
  const L = D.anuncis.filter(a => alive(a) && (ui.anCat === "tots" || a.cat === ui.anCat)).sort((a, b) => ms(b.creat) - ms(a.creat));
  return foldFilters("an", ui.anCat === "tots" ? "" : CATS[ui.anCat], ui.anOpen, [["tots", "Tots"]].concat(Object.entries(CATS)).map(([k, t]) => chip("data-acat", k, ui.anCat === k, t)).join(""))
    + `${L.map(a => { const mine = a.userId === uid(), on = !!ui.interest[a.id], names = ui.interested[a.id] || [];
      return `<article class="card cl-an"><div class="cl-avh"><span class="cl-tag">${esc(CATS[a.cat] || a.cat)}</span><span class="cl-date">Fins al ${esc(dayStr(ms(a.caduca)))}</span>${mine ? `<button type="button" class="cl-pen" data-editan="${esc(a.id)}" aria-label="Edita l'anunci" title="Edita"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg></button>` : ""}</div>
        <h3 class="cl-atitle">${esc(a.titol)}</h3><p class="cl-text">${esc(a.text)}</p>
        <div class="cl-afoot"><div class="cl-who"><b>${esc(mine ? "Tu" : a.autorNom)}</b>${mine ? `<span>${names.length === 1 ? "1 interessat" : names.length + " interessats"}</span>` : ""}</div>
          ${mine ? `<button type="button" class="btn sm" data-askdel="anuncis" data-id="${esc(a.id)}">Retira</button>` : `<button type="button" class="btn cl-go" data-interest="${esc(a.id)}" aria-pressed="${on}">${on ? "T'interessa ✓" : "M'interessa"}</button>`}</div>
        ${!mine && canMod() ? modBtn("anuncis", a) : ""}
        ${mine && names.length ? `<div class="cl-names"><span class="lbl">Qui s'hi interessa (només ho veus tu)</span><b>${esc(names.join(" · "))}</b></div>` : ""}
        <div data-delbox="${esc(a.id)}"></div></article>`; }).join("")
      || `<article class="card empty">${D.at.anuncis ? "No hi ha cap anunci." : "Carregant…"}</article>`}
    <button type="button" class="btn cl-pri cl-wide" id="clNewAn">+ Publica un anunci</button>
    <p class="note">Qui s'hi interessa prem «M'interessa»; només tu veus qui és, per contactar-hi pel teu compte.</p>`;
}

/* ---------- BASE ---------- */
const presLive = () => D.pres.filter(x => now() - (ms(x.actualitzat) || 0) < DAY);
const warned = x => x.estat === "aigua" && D.alertes.some(a => a.userId === x.id);
function renderBase(){
  const L = presLive(), ai = L.filter(x => x.estat === "aigua").sort((a, b) => (warned(b) ? 1 : 0) - (warned(a) ? 1 : 0)), ba = L.filter(x => x.estat === "base");
  const me = D.myPres && now() - (ms(D.myPres.actualitzat) || 0) < DAY ? D.myPres : null, v = vis();
  const row = x => { const al = D.alertes.filter(a => a.userId === x.id);
    return `<div class="cl-prow"><span class="cl-av ${x.estat === "base" ? "s-base" : al.length ? "s-late" : "s-aigua"}" aria-hidden="true">${esc(x.id === uid() ? "TU" : initials(x.nom))}</span>
    <div class="cl-who"><b>${esc(x.id === uid() ? "Tu" : x.nom)}${x.estat === "aigua" ? " · " + esc(boatShort(x.act)) : ""}</b>
    <span${al.length ? ' class="cl-late"' : ""}>${al.length ? esc(al.map(a => ALERT_T[a.tipus] || a.tipus).join(" · ")) : "Des de les " + hm(x.desde)}</span></div>
    <span class="note">${esc(ago(ms(x.actualitzat) || now()))}</span></div>`; };
  const rec = typeof LIVE !== "undefined" && LIVE;
  return `<button class="cta" type="button" data-go="trip">${rec ? svgI('<circle cx="12" cy="12" r="6" fill="currentColor"/>', 22) : svgI('<path d="M12 3v14"/><path d="M12 4l7 11h-7"/><path d="M3 19c3 2 6 2 9 0s6-2 9 0"/>', 22)}${rec ? "Sortida en curs" : "Comença una sortida"}</button>
    <div class="cl-counts"><div class="stat"><span class="lbl">A l'aigua</span><span class="v" style="color:var(--accent)">${ai.length}</span></div><div class="stat"><span class="lbl">A la base</span><span class="v" style="color:var(--ideal)">${ba.length}</span></div></div>
    <article class="card"><div class="map short" id="clMap"></div>
      <div class="legend"><span><span class="sw cl-sw-base"></span>A la base</span><span><span class="sw cl-sw-aigua"></span>Navegant</span><span><span class="sw cl-sw-late"></span>Amb un avís de seguretat</span></div></article>
    <section class="card"><div class="card-h"><span class="lbl">A l'aigua</span></div>${ai.map(row).join("") || `<p class="note">Ningú, ara mateix.</p>`}</section>
    <section class="card"><div class="card-h"><span class="lbl">A la base</span></div>${ba.map(row).join("") || `<p class="note">Ningú, ara mateix.</p>`}
      ${v === "ningu" ? `<p class="note" style="margin-top:8px">Tens la presència desactivada (a sota).</p>` : me && me.estat === "base" ? `<button type="button" class="btn cl-wide" id="clLeave" style="margin-top:10px">Marxo de la base</button>` : me ? "" : `<button type="button" class="btn cl-wide cl-ok" id="clHere" style="margin-top:10px">Soc a la base</button>`}</section>
    <section class="card"><div class="card-h"><span class="lbl">Qui et veu aquí</span><button class="ib-i" type="button" data-info="iPres" aria-label="Com funciona la presència" aria-expanded="false">i</button></div>
      <div class="cl-privrow"><b>${esc(NIVT(v))}</b><button type="button" class="btn" id="clPriv">Canvia-ho</button></div>
      <p class="note" style="margin-top:8px">Es tria a Configuració ▸ Confidencialitat, junt amb qui veu les teves publicacions i els avisos de seguretat.</p>
      <div class="vp-info" id="iPres" hidden><p>Només mentre ets a la base (amb el botó o automàticament, si ho actives) o navegant (en començar una sortida). S'esborra en acabar la sortida, en marxar o al cap de 24 h.</p><p>Navegant, la posició s'actualitza cada 2 minuts. Amb la pantalla apagada, només l'app d'Android la continua enviant.</p></div></section>`;
}
function drawMap(){
  const el = $("clMap"); if(!el || typeof baseMap !== "function") return;
  mapObj = baseMap(el); if(!mapObj) return;
  L.circle(HOME, {radius:150, color:cssVar("--ideal"), weight:1.5, dashArray:"4 4", fillOpacity:.06}).addTo(mapObj);
  const pts = [];
  for(const x of presLive()){
    if(x.lat == null) continue;
    const c = cssVar(x.estat === "base" ? "--ideal" : warned(x) ? "--no" : "--accent");
    L.circleMarker([x.lat, x.lon], {radius:11, color:c, fillColor:c, fillOpacity:.9, weight:2}).addTo(mapObj)
      .bindTooltip(x.id === uid() ? "Tu" : initials(x.nom), {permanent:true, direction:"center", className:"cl-tip"});
    pts.push([x.lat, x.lon]);
  }
  if(pts.length > 1) mapObj.fitBounds(L.latLngBounds(pts.concat([HOME])).pad(0.3), {maxZoom:15});
}

/* ---------- full lliscant (formularis) ---------- */
function closeSheet(){ const s = $("clSheet"); if(s) s.remove(); }
function sheet(title, body, onMount){
  closeSheet();
  const d = document.createElement("div"); d.className = "cl-sheet"; d.id = "clSheet";
  d.innerHTML = `<div class="cl-sheet-in card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="cl-sheet-h"><h2>${esc(title)}</h2><button type="button" class="ib" data-close aria-label="Tanca">${XI}</button></div>${body}<div class="msg err" id="shMsg" hidden></div></div>`;
  document.body.appendChild(d);
  d.addEventListener("click", e => { if(e.target === d || e.target.closest("[data-close]")) closeSheet(); });
  if(onMount) onMount(d);
}
const field = (id, label, input) => `<label class="cl-field" for="${id}"><span class="lbl">${label}</span>${input}</label>`;
async function busy(btn, fn){ if(btn.disabled) return; btn.disabled = true; sheetSay(""); try{ await TO(fn()); }catch(e){ sheetSay(errText(e)); } finally{ btn.disabled = false; } }

/* Publicar o editar una sortida */
// Ruta per al mur: sense el tram inicial i final (fins a 200 m; menys si la sortida és curta) i simplificada a ~150 punts
function routeOf(t){
  const P = (t.pts || []).map(p => p && {lat:+p.lat, lon:+p.lon}).filter(p => p && isFinite(p.lat) && isFinite(p.lon));
  if(P.length < 4) return null;
  const far = Math.max(...P.map(p => hav(P[0], p)));
  if(far < 100) return null;   // no s'ha allunyat ni 100 m: no hi ha ruta per ensenyar
  const cut = Math.min(200, far * 0.25);
  let i = 0; while(i < P.length && hav(P[0], P[i]) < cut) i++;
  let j = P.length - 1; while(j > i && hav(P[P.length-1], P[j]) < cut) j--;
  const Q = P.slice(i, j + 1); if(Q.length < 2) return null;
  const step = Math.max(1, Math.ceil(Q.length/150)), R = Q.filter((_, k) => k % step === 0);
  if(R[R.length-1] !== Q[Q.length-1]) R.push(Q[Q.length-1]);
  return R.map(p => p.lat.toFixed(5) + "," + p.lon.toFixed(5)).join(";");
}
async function waveFor(t){
  const d0 = ymd(new Date(t.start)), d1 = ymd(new Date(t.end || t.start));
  const H = (await getJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${LOC.mlat}&longitude=${LOC.mlon}&hourly=wave_height&timezone=Europe%2FMadrid&start_date=${d0}&end_date=${d1}`)).hourly;
  const v = H.time.map((x, i) => ({t:new Date(x).getTime(), h:H.wave_height[i]})).filter(o => o.h != null && o.t >= t.start - 3600e3 && o.t <= (t.end || t.start) + 1800e3).map(o => o.h);
  return v.length ? Math.round(Math.max(...v)*100)/100 : null;
}
function verdictFor(a, Wd, onada){
  if(!Wd || Wd.avg == null || !crit[a]) return null;
  try{ const sc = scoreHour({wind:Wd.avg, gust:Wd.gust, dir:Wd.dir, wave:onada, tp:null, code:null, pp:null, t:null, sst:null}, crit[a]), v = verdict(sc);
    return {k:v.k, t:v.t, why:(sc.why && sc.why.length ? sc.why : sc.flags || []).slice(0, 2).join(" · ")}; }catch(e){ return null; }
}
async function pubSheet(t, p){
  const def = p ? p.titol : (t && t.name) || "Sortida de " + (t ? dayStr(t.start) : "");
  sheet(p ? "La meva publicació" : "Comparteix amb el club", `
    ${field("shText", "Comentari <small>(opcional)</small>", `<textarea class="field cl-ta" id="shText" rows="4" maxlength="280" placeholder="Què ha de saber qui surti un dia com aquest?">${esc(p ? p.comentari || "" : "")}</textarea>`)}
    <label class="cl-sw"><span><b>${p ? "Mostra la ruta" : "Inclou la ruta"}</b><small class="note">Simplificada i sense els primers ni els últims 200 m. Ho pots canviar després.</small></span><input type="checkbox" class="switch" id="shRoute"${p && p.ruta ? " checked" : ""}></label>
    ${visSelect("mur", p ? (p.visibilitat || "club") : prefOf("mur"))}
    <p class="note">Les xifres de la sortida no es poden retocar.</p>
    <button type="button" class="btn cl-pri cl-wide" id="shSave">${p ? "Desa els canvis" : "Publica al mur"}</button>
    ${p ? `<div class="cl-retire"><span class="lbl">Retira del mur</span><p class="note">Desapareix del mur amb les reaccions; la sortida es queda al teu historial.</p><div id="shDel"></div></div>` : ""}`, d => {
    if(p) slideConfirm($("shDel"), "Llisca per retirar", async () => { try{ await TO(C.F.deleteDoc(ref("publicacions", p.id))); D.pubs = D.pubs.filter(x => x.id !== p.id); closeSheet(); render(); refreshShare(); }catch(e){ sheetSay(errText(e)); } });
    $("shSave").onclick = e => busy(e.currentTarget, async () => {
      const titol = String(def || "Sortida").slice(0, 60), comentari = $("shText").value.trim().slice(0, 280), wantRoute = $("shRoute").checked;
      if(p){
        let ruta = p.ruta || null;
        if(wantRoute && !ruta){ const lt = t || await DB.get(p.tripId); if(!lt){ sheetSay("Per afegir la ruta, fes-ho des del mòbil on tens aquesta sortida."); return; } ruta = routeOf(lt);
          if(!ruta){ sheetSay(NO_ROUTE); return; } }
        if(!wantRoute) ruta = null;
        const vf = await visFields($("shVis").value);
        await C.F.updateDoc(ref("publicacions", p.id), Object.assign({titol, comentari, ruta, editada:true}, vf));
        Object.assign(p, {titol, comentari, ruta, editada:true}, vf);
      } else {
        const s = t.summary || summarize(t), Wd = s.wind || {}, ruta = wantRoute ? routeOf(t) : null;
        if(wantRoute && !ruta){ sheetSay(NO_ROUTE); return; }
        let onada = null; try{ onada = await waveFor(t); }catch(e){}
        const doc = Object.assign({userId:uid(), clubId:C.member.clubId, tripId:t.id, nom:C.member.nom, act:String(t.act || ""),
          inici:t.start, fi:t.end || t.start, titol, comentari, ruta,
          distNm:num(s.distNm) || 0, durS:Math.round((s.dur || 0)/1000), maxKn:num(s.maxKn), avgKn:num(s.avgKn),
          vent:{avg:num(Wd.avg), gust:num(Wd.gust), dir:num(Wd.dir)}, onada, veredicte:verdictFor(t.act, Wd, onada),
          reaccions:{}, editada:false, creat:C.F.serverTimestamp()}, await visFields($("shVis").value));
        await C.F.setDoc(ref("publicacions", uid() + "_" + t.id), doc);
        D.pubs = D.pubs.filter(x => x.id !== uid() + "_" + t.id).concat([Object.assign({id:uid() + "_" + t.id}, doc, {creat:now()})]);
      }
      closeSheet(); render(); refreshShare();
    });
  });
}
let shareEl = null, shareTrip = null;
async function refreshShare(){ if(shareEl && shareTrip && document.body.contains(shareEl)) OV_CLUB.shareBtn(shareEl, shareTrip); }

/* Altres formularis */
function intentSheet(){
  const d = new Date(), h = pad(Math.min(20, d.getHours() + 1)) + ":00";
  sheet("Anuncia que surts", `
    <div class="cl-field"><span class="lbl">Dia</span>
      <div class="cl-row2" role="group" aria-label="Dia">${chip("data-iday", "0", true, "Avui")}${chip("data-iday", "1", false, "Demà")}</div>
      <label class="cl-field" for="shDate"><span class="note">O tria un altre dia, fins a ${INT_DIES} dies</span>
        <input class="field" id="shDate" type="date" value="${ymd(d)}" min="${ymd(d)}" max="${ymd(new Date(now() + INT_DIES*DAY))}"></label></div>
    ${field("shHour", "Hora", `<input class="field" id="shHour" type="time" value="${h}">`)}
    ${field("shAct", "Embarcació", `<select class="field" id="shAct">${Object.keys(DEFAULTS).map(k => `<option value="${k}"${k === act ? " selected" : ""}>${esc(DEFAULTS[k].name)}</option>`).join("")}</select>`)}
    ${visSelect("intencions", prefOf("intencions"))}
    <p class="note">Qui ho veu s'hi pot apuntar. S'esborra l'endemà.</p>
    <button type="button" class="btn cl-pri cl-wide" id="shSave">Publica</button>`, sh => {
    const mark = () => { const v = $("shDate").value; sh.querySelectorAll("[data-iday]").forEach(b => b.setAttribute("aria-pressed", String(ymd(new Date(now() + (+b.dataset.iday)*DAY)) === v))); };
    sh.addEventListener("click", ev => { const b = ev.target.closest("[data-iday]"); if(!b) return; $("shDate").value = ymd(new Date(now() + (+b.dataset.iday)*DAY)); mark(); });
    $("shDate").addEventListener("change", mark);
    $("shSave").onclick = e => busy(e.currentTarget, async () => {
      const v = $("shDate").value, min = ymd(new Date()), max = ymd(new Date(now() + INT_DIES*DAY));
      if(!v || v < min || v > max){ sheetSay(`Tria un dia d'avui a ${INT_DIES} dies vista.`); return; }
      const day = new Date(v + "T23:59:59");
      const doc = Object.assign({userId:uid(), clubId:C.member.clubId, nom:C.member.nom, act:$("shAct").value, dia:ymd(day), hora:$("shHour").value || "12:00", apuntats:{}, caduca:TS(day.getTime()), creat:C.F.serverTimestamp()}, await visFields($("shVis").value));
      const r = await C.F.addDoc(col("intencions"), doc);
      D.intents.push(Object.assign({id:r.id}, doc, {caduca:day.getTime()})); closeSheet(); render();
    });
  });
}
function avisSheet(a){
  const coms = canPost(), today = ymd(new Date());
  sheet(a ? "Edita l'avís" : "Nou avís", `
    ${a ? `<p class="note" style="margin:0">${esc(COMSm()[a.comissio] || a.comissio)}</p>` : field("shCom", "Comissió", `<select class="field" id="shCom">${coms.map(k => `<option value="${k}">${esc(COMSm()[k])}</option>`).join("")}</select>`)}
    ${field("shTitle", "Títol", `<input class="field" id="shTitle" type="text" maxlength="80" value="${esc(a ? a.titol : "")}" style="font-family:var(--f-body)">`)}
    ${field("shText", "Text", `<textarea class="field cl-ta" id="shText" rows="5" maxlength="600">${esc(a ? a.text : "")}</textarea>`)}
    ${field("shData", "Data de l'activitat <small>(opcional)</small>", `<input class="field" id="shData" type="date" value="${esc(a && a.data || "")}" min="${today}">`)}
    <p class="note">Amb data: surt també a la previsió de 7 dies i desapareix l'endemà. Sense data: es queda fins que algú amb permís el retiri.</p>
    <label class="cl-sw"><span><b>Fixa'l a dalt</b></span><input type="checkbox" class="switch" id="shPin"${a && a.fixat ? " checked" : ""}></label>
    <button type="button" class="btn cl-pri cl-wide" id="shSave">${a ? "Desa els canvis" : "Publica l'avís"}</button>`, () => {
    $("shSave").onclick = e => busy(e.currentTarget, async () => {
      const titol = $("shTitle").value.trim().slice(0, 80), text = $("shText").value.trim().slice(0, 600), data = $("shData").value || null;
      if(!titol || !text){ sheetSay("Cal un títol i un text."); return; }
      if(data && data < today){ sheetSay("La data no pot ser d'abans d'avui."); return; }
      const cadMs = data ? new Date(data + "T23:59:59").getTime() + DAY : null;   // caduca l'endemà de l'activitat
      const f = {titol, text, fixat:$("shPin").checked, data, caduca: cadMs ? TS(cadMs) : null};
      if(a){
        await C.F.updateDoc(ref("avisos", a.id), Object.assign({}, f, {editat:true}));
        Object.assign(a, f, {caduca:cadMs, editat:true});
      } else {
        const doc = Object.assign({userId:uid(), clubId:C.member.clubId, comissio:$("shCom").value, creat:C.F.serverTimestamp(), autorNom:C.member.nom, vist:{}}, f);
        const r = await C.F.addDoc(col("avisos"), doc);
        D.avisos.push(Object.assign({id:r.id}, doc, {caduca:cadMs, creat:now()}));
      }
      publishEvents(); closeSheet(); render();
    });
  });
}
function anunciSheet(a){
  const cad0 = a ? ymd(new Date(ms(a.caduca))) : ymd(new Date(now() + 15*DAY));
  sheet(a ? "Edita l'anunci" : "Nou anunci", `
    ${field("shCat", "Categoria", `<select class="field" id="shCat">${Object.entries(CATS).map(([k, t]) => `<option value="${k}"${a && a.cat === k ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`)}
    ${field("shTitle", "Títol", `<input class="field" id="shTitle" type="text" maxlength="80" value="${esc(a ? a.titol : "")}" style="font-family:var(--f-body)">`)}
    ${field("shText", "Text", `<textarea class="field cl-ta" id="shText" rows="4" maxlength="400">${esc(a ? a.text : "")}</textarea>`)}
    ${field("shCad", "Caduca el dia", `<input class="field" id="shCad" type="date" value="${cad0}" min="${ymd(new Date())}" max="${ymd(new Date(now() + AN_MAX*DAY))}">`)}
    ${visSelect("anuncis", a ? a.visibilitat : prefOf("anuncis"))}
    <button type="button" class="btn cl-pri cl-wide" id="shSave">${a ? "Desa els canvis" : "Publica l'anunci"}</button>`, () => {
    $("shSave").onclick = e => busy(e.currentTarget, async () => {
      const titol = $("shTitle").value.trim(), text = $("shText").value.trim();
      if(!titol){ sheetSay("Cal un títol."); return; }
      const v = $("shCad").value, max = ymd(new Date(now() + AN_MAX*DAY));
      if(!v || v < ymd(new Date()) || v > max){ sheetSay(`Tria una data d'avui a ${AN_MAX} dies vista.`); return; }
      const cad = new Date(v + "T23:59:59").getTime();
      const f = Object.assign({cat:$("shCat").value, titol:titol.slice(0, 80), text:text.slice(0, 400), caduca:TS(cad)}, await visFields($("shVis").value));
      if(a){
        await C.F.updateDoc(ref("anuncis", a.id), Object.assign({}, f, {editat:true}));
        Object.assign(a, f, {caduca:cad, editat:true});
      } else {
        const doc = Object.assign({userId:uid(), clubId:C.member.clubId, creat:C.F.serverTimestamp(), autorNom:C.member.nom}, f);
        const r = await C.F.addDoc(col("anuncis"), doc);
        D.anuncis.push(Object.assign({id:r.id}, doc, {caduca:cad, creat:now()})); ui.interested[r.id] = [];
      }
      closeSheet(); render();
    });
  });
}

/* ---------- accions ---------- */
async function react(pid, k){
  const p = D.pubs.find(x => x.id === pid); if(!p) return;
  const before = Object.assign({}, p.reaccions), cur = before[uid()], nv = cur === k ? null : k;
  p.reaccions = Object.assign({}, before); if(nv) p.reaccions[uid()] = nv; else delete p.reaccions[uid()]; render();
  try{ await TO(C.F.updateDoc(ref("publicacions", pid), {["reaccions." + uid()]: nv || C.F.deleteField()})); }
  catch(e){ p.reaccions = before; render(); say(errText(e)); }
}
async function hideDoc(n, id){
  try{ await TO(C.F.updateDoc(ref(n, id), {amagat:C.F.arrayUnion(C.member.clubId)}));
    const k = {publicacions:"pubs", intencions:"intents", anuncis:"anuncis"}[n]; D[k] = D[k].filter(x => x.id !== id); render(); }
  catch(e){ say(errText(e)); }
}
async function mapToggle(n, list, id, field, val){
  const x = list.find(o => o.id === id); if(!x) return;
  const before = Object.assign({}, x[field]), on = !before[uid()];
  x[field] = Object.assign({}, before); if(on) x[field][uid()] = val; else delete x[field][uid()]; render();
  try{ await TO(C.F.updateDoc(ref(n, id), {[field + "." + uid()]: on ? val : C.F.deleteField()})); }
  catch(e){ x[field] = before; render(); say(errText(e)); }
}
async function interest(id){
  const on = !ui.interest[id]; ui.interest[id] = on; render();
  try{ const r = ref("anuncis", id, "interessats", uid());
    await TO(on ? C.F.setDoc(r, {userId:uid(), nom:C.member.nom}) : C.F.deleteDoc(r)); }
  catch(e){ ui.interest[id] = !on; render(); say(errText(e)); }
}
async function removeDoc(n, id){
  try{
    if(n === "anuncis") for(const x of await getAll("anuncis/" + id + "/interessats")) await C.F.deleteDoc(ref("anuncis", id, "interessats", x.id));
    await TO(C.F.deleteDoc(ref(n, id)));
    const k = {intencions:"intents", avisos:"avisos", anuncis:"anuncis", publicacions:"pubs"}[n]; D[k] = D[k].filter(x => x.id !== id); if(n === "avisos") publishEvents(); render();
  }catch(e){ say(errText(e)); }
}
function presDoc(estat, o){
  const v = vis();
  return Object.assign({userId:uid(), clubId:C.member.clubId, nom:C.member.nom, estat, act:String(act), lat:HOME[0], lon:HOME[1],
    desde:now(), visibilitat:v, lectors: window.OV_PRIV ? OV_PRIV.lectors(v) : [], actualitzat:C.F.serverTimestamp()}, o || {});
}
async function setPres(doc){
  await TO(C.F.setDoc(ref("presencia", uid()), doc));
  D.myPres = Object.assign({id:uid()}, doc, {actualitzat:now()}); D.pres = D.pres.filter(x => x.id !== uid()).concat([D.myPres]);
}
async function delPres(){ await C.F.deleteDoc(ref("presencia", uid())); D.myPres = null; D.pres = D.pres.filter(x => x.id !== uid()); }

/* ---------- arribada i sortida de la base pel GPS (si el soci ho ha activat a Confidencialitat) ---------- */
// Regla: a menys de 50 m de la base durant 10 minuts seguits → «a la base»; a més de 200 m durant 2 minuts → deixa d'estar-hi.
// Estalvi de bateria: la freqüència depèn de la distància de l'última lectura.
//   · més de 2 km: cada 10 min, ubicació aproximada (xarxa; gairebé no gasta)
//   · de 200 m a 2 km: cada 3 min, GPS
//   · a menys de 200 m, o comptant temps per entrar o sortir: cada minut, GPS
// Només amb l'app visible (la web no pot fer res amb la pantalla apagada). A l'APK (Capacitor), window.OV_GEO pot substituir
// la lectura de posició (getPosition) i, millor encara, un geofence natiu pot cridar OV_CLUB.autoTick(true) en entrar o sortir.
const AUTO_IN = 50, AUTO_IN_MS = 10*MIN, AUTO_OUT = 200, AUTO_OUT_MS = 2*MIN, AUTO_ACC = 60, AUTO_FAR = 2000;
let autoBusy = false, autoTimer = null, autoDist = null;
function autoPos(high, maxAge){
  if(window.OV_GEO?.getPosition) return window.OV_GEO.getPosition({high, maxAge});   // APK: proveïdor natiu
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {enableHighAccuracy:high, maximumAge:maxAge, timeout:30000}));
}
function autoDelay(st){
  const inS = store.get("ov2_auto_in"), outS = store.get("ov2_auto_out");
  if(autoDist == null || autoDist <= AUTO_OUT || (inS && st !== "base") || st === "base") return MIN;   // a prop, comptant per entrar, o a la base (per detectar la sortida)
  return autoDist < AUTO_FAR ? 3*MIN : 10*MIN;
}
function autoSchedule(ms){ clearTimeout(autoTimer); autoTimer = document.visibilityState === "visible" ? setTimeout(() => autoTick(), ms) : null; }
const autoOn = () => !!(C && navigator.geolocation && window.OV_PRIV?.autoBase() && vis() !== "ningu");
async function autoTick(force){
  if(!autoOn()){ clearTimeout(autoTimer); autoTimer = null; return; }
  if(document.visibilityState !== "visible" || autoBusy) return;
  if(typeof LIVE !== "undefined" && LIVE){ autoSchedule(5*MIN); return; }   // durant una sortida, ja ho fa avisos.js
  autoBusy = true;
  let st = null;
  try{
    const high = autoDist == null || autoDist < AUTO_FAR || D.myPres?.estat === "base";
    const pos = await autoPos(high, force ? 0 : (high ? 30000 : 5*MIN)), c = pos.coords, t = now();
    const d = hav({lat:HOME[0], lon:HOME[1]}, {lat:c.latitude, lon:c.longitude}), acc = c.accuracy || 999;
    autoDist = d;
    if(!D.at.mypres){ const s = await C.F.getDoc(ref("presencia", uid())); D.myPres = s.exists() ? Object.assign({id:s.id}, s.data()) : null; D.at.mypres = t; }
    st = D.myPres && t - (ms(D.myPres.actualitzat) || 0) < DAY ? D.myPres.estat : null;
    let inS = store.get("ov2_auto_in"), outS = store.get("ov2_auto_out");
    if(t - (store.get("ov2_auto_seen") || 0) > 15*MIN){ inS = null; outS = null; }   // un forat llarg trenca el compte
    const dins = acc <= AUTO_ACC && d <= AUTO_IN, fora = d - Math.min(acc, d) >= AUTO_OUT;   // fora: segur, encara que la lectura sigui imprecisa
    if(dins){ inS = inS || t; outS = null; }
    else if(fora){ outS = outS || t; inS = null; }
    else if(acc <= AUTO_ACC){ inS = null; outS = null; }   // entre 50 i 200 m: no canvia res
    store.set("ov2_auto_in", inS); store.set("ov2_auto_out", outS); store.set("ov2_auto_seen", t);
    if(inS && t - inS >= AUTO_IN_MS && !st){ await setPres(presDoc("base", {desde:inS})); st = "base"; loadAlerts(); if(visible()) render(); }
    else if(outS && t - outS >= AUTO_OUT_MS && st === "base"){ await delPres(); st = null; loadAlerts(); if(visible()) render(); }
  }catch(e){}
  finally{ autoBusy = false; autoSchedule(autoDelay(st)); }
}
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") autoTick(true); else { clearTimeout(autoTimer); autoTimer = null; } });

document.addEventListener("click", async e => {
  const t = e.target.closest && e.target.closest("#clubView button, #clubView [data-ctab]"); if(!t || !C) return;
  const ds = t.dataset;
  if(ds.ctab){ tab = ds.ctab; store.set("ov2_club_tab", tab); load(); window.scrollTo({top:0}); return; }
  const saveF = () => { store.set("ov2_club_filt", Object.assign({}, filt, {open:false})); render(); };
  if(t.id === "clFilt" || t.id === "clFiltDone"){ filt.open = !filt.open; saveF(); return; }
  if(t.id === "clReset"){ filt = Object.assign({}, F0, {open:true}); saveF(); return; }
  if(ds.fdate){ filt.date = ds.fdate; saveF(); return; }
  if(ds.fperson){ filt.person = ds.fperson; saveF(); return; }
  if(ds.forder){ filt.order = ds.forder; saveF(); return; }
  if(ds.fflag){ filt[ds.fflag] = !filt[ds.fflag]; saveF(); return; }
  if(ds.acom){ ui.avisCom = ds.acom; ui.avisOpen = false; render(); return; }
  if(ds.acat){ ui.anCat = ds.acat; ui.anOpen = false; render(); return; }
  if(ds.fold){ const k = ds.fold + "Open"; ui[k] = !ui[k]; render(); return; }
  if(ds.editan){ const a = D.anuncis.find(x => x.id === ds.editan); if(a) anunciSheet(a); return; }
  if(ds.editavis){ const a = D.avisos.find(x => x.id === ds.editavis); if(a) avisSheet(a); return; }
  if(ds.react){ react(ds.pub, ds.react); return; }
  if(ds.join){ mapToggle("intencions", D.intents, ds.join, "apuntats", C.member.nom); return; }
  if(ds.seen){ mapToggle("avisos", D.avisos, ds.seen, "vist", true); return; }
  if(ds.interest){ interest(ds.interest); return; }
  if(ds.editpub){ const p = D.pubs.find(x => x.id === ds.editpub); if(p) pubSheet(null, p); return; }
  if(ds.askhide){ const box = document.querySelector(`[data-delbox="${CSS.escape(ds.id)}"]`); if(box) slideConfirm(box, "Llisca per amagar-ho al club", () => hideDoc(ds.askhide, ds.id)); return; }
  if(ds.askdel){ const box = document.querySelector(`[data-delbox="${CSS.escape(ds.id)}"]`); if(box) slideConfirm(box, "Llisca per retirar", () => removeDoc(ds.askdel, ds.id)); return; }
  if(t.id === "clPriv"){ window.OV_PRIV?.open(); return; }
  if(t.id === "clHere"){ try{ await setPres(presDoc("base")); render(); loadAlerts(); }catch(err){ say(errText(err)); } return; }
  if(t.id === "clLeave"){ try{ await delPres(); render(); loadAlerts(); }catch(err){ say(errText(err)); } return; }
  if(ds.resolve){ resolveAlert(ds.resolve); return; }
  if(t.id === "clNewIntent") intentSheet();
  if(t.id === "clNewAvis") avisSheet(null);
  if(t.id === "clNewAn") anunciSheet(null);
});
document.addEventListener("change", e => { if(e.target.id === "clAll"){ filt.all = e.target.checked; store.set("ov2_club_filt", Object.assign({}, filt, {open:false})); render(); } });
$("actSeg").addEventListener("click", () => { if(visible() && tab === "mur") setTimeout(render, 0); });

/* ---------- avisos de seguretat (els detecta avisos.js al mòbil de qui navega) ---------- */
const ALERT_T = {"sense-vent":"Sense vent i lluny", "vent-fort":"Vent massa fort", "onades":"Onades perilloses"};
let atBase = false;
async function loadAlerts(){
  if(!C) return;
  try{
    const L = await getVisible("alertes"), mine = await C.F.getDoc(ref("presencia", uid())).catch(() => null);
    atBase = !!(mine && mine.exists() && mine.data().estat === "base");
    if(atBase) L.push(...await getAll("alertes", W("clubId", "==", C.member.clubId), W("base", "==", true)).catch(() => []));   // ets a la base: també els avisos «+ gent a la base»
    const seen = new Set(); D.alertes = L.filter(a => ALERT_T[a.tipus] && !a.resolta && a.userId !== uid() && !seen.has(a.id) && seen.add(a.id));
  }
  catch(e){ D.alertes = []; }
  alertDot(); if(visible()) render();
}
function alertDot(){
  const b = $("tabClub"); if(!b) return;
  let s = b.querySelector(".cl-adot"); const n = D.alertes.filter(a => a.userId !== uid()).length;
  if(!n){ if(s) s.remove(); return; }
  if(!s){ s = document.createElement("span"); s.className = "cl-adot"; b.appendChild(s); }
  s.textContent = n; s.setAttribute("aria-label", n === 1 ? "1 avís de seguretat" : n + " avisos de seguretat");
}
function alertText(a){
  const v = a.valor, b = boatShort(a.act);
  if(a.tipus === "sense-vent") return `${b} · sense vent a ${String(v).replace(".", ",")} nm de la base`;
  if(a.tipus === "vent-fort") return `${b} · és a l'aigua amb ratxes de ${v} kn`;
  return `${b} · és a l'aigua i s'esperen onades de ${String(v).replace(".", ",")} m`;
}
function alertBanner(){
  const L = D.alertes.filter(a => a.userId !== uid()).sort((a, b) => ms(b.creat) - ms(a.creat));
  return L.map(a => `<div class="cl-alert" role="alert">${WARN}<div class="cl-who">
      <b>${esc(a.nom)}: ${esc((ALERT_T[a.tipus] || "").toLowerCase())}</b>
      <span>${esc(alertText(a))} · posició ${esc(ago(ms(a.posAt) || now()))}</span></div>
      <div class="cl-abtns"><button type="button" class="btn sm" data-ctab="base">Base</button>${C.isResp || atBase ? `<button type="button" class="btn sm" data-resolve="${esc(a.id)}">Resolta</button>` : ""}</div></div>`).join("");
}
async function resolveAlert(id){
  try{ await TO(C.F.updateDoc(ref("alertes", id), {resolta:true, resoltaPer:uid(), resoltaAt:C.F.serverTimestamp()})); D.alertes = D.alertes.filter(a => a.id !== id); alertDot(); render(); }
  catch(e){ say(errText(e)); }
}
setInterval(() => { if(C && document.visibilityState === "visible") loadAlerts(); }, 120000);
document.addEventListener("visibilitychange", () => { if(C && document.visibilityState === "visible") loadAlerts(); });

/* ---------- pestanya i sessió ---------- */
function tabBtn(){
  const on = !!C || !!accSt(), b = $("tabClub"); if(!b) return;
  b.hidden = !on; document.querySelector(".tabs .in").classList.toggle("n5", on);
  if(!on && visible()) go("fc");
}
window.addEventListener("ov-coms", () => { publishEvents(); if(visible()) render(); });
window.addEventListener("ov-cloud", async () => {
  await ctx(); tabBtn(); autoTick(true); loadAlerts(); if(C) loadEvents(); else { navDot(); window.OV_EVENTS = []; window.dispatchEvent(new CustomEvent("ov-events")); }
  if(C && typeof LIVE !== "undefined" && LIVE) OV_CLUB.tripStart(LIVE);
  if(C && visible()) load(true); else if(!C && visible()) render();
});
window.addEventListener("mm-view", e => { if(e.detail === "club"){ if(C){ load(); loadAlerts(); } else if(accSt()) renderWait(); else go("fc"); } else { if(mapObj){ mapObj.remove(); mapObj = null; } clearRouteMaps(); } });

/* ---------- connexió amb trip.js i cloud.js ---------- */
const OV_CLUB = window.OV_CLUB = {
  sheet, closeSheet, autoTick,
  async shareBtn(el, t){
    shareEl = el; shareTrip = t; el.innerHTML = "";
    if(!C || !t || t.owner !== uid()) return;
    let p = D.pubs.find(x => x.id === uid() + "_" + t.id);
    if(!p){ try{ const s = await TO(C.F.getDoc(ref("publicacions", uid() + "_" + t.id)), 8000); if(s.exists()) p = Object.assign({id:s.id}, s.data()); }catch(e){} }
    el.innerHTML = p ? `<button type="button" class="btn cl-wide">Publicada al mur · Edita</button>` : `<button type="button" class="btn cl-pri cl-wide">Comparteix amb el club</button>`;
    el.firstChild.onclick = () => pubSheet(t, p || null);
  },
  async tripStart(Lv){
    if(!C || vis() === "ningu" || !Lv) return;
    const last = Lv.pts && Lv.pts[Lv.pts.length - 1];
    try{ await setPres(presDoc("aigua", {act:String(Lv.act || act), desde:Lv.start, lat:last ? last.lat : HOME[0], lon:last ? last.lon : HOME[1]})); lastPos = now(); }catch(e){}
  },
  tripPos(Lv, p){
    if(!C || vis() === "ningu" || !D.myPres || D.myPres.estat !== "aigua" || now() - lastPos < 120000) return;
    lastPos = now();
    const s10 = window.OV_AVISOS?.sog10();
    C.F.updateDoc(ref("presencia", uid()), {lat:p.lat, lon:p.lon, sog: s10 == null ? null : Math.round(s10*10)/10, actualitzat:C.F.serverTimestamp()}).catch(() => {});
  },
  async tripEnd(){ if(!C || !D.myPres) return; try{ await delPres(); }catch(e){} },
  async arrived(){ if(!C || vis() === "ningu") return; try{ await setPres(presDoc("base")); }catch(e){} },   // tornada a la base detectada pel GPS
  // Avís de seguretat que el navegant ha decidit enviar (avisos.js). Si a Confidencialitat té «Ningú», s'envia al club:
  // prémer «Avisa el club» és un consentiment explícit. Retorna true quan el núvol l'ha desat.
  async raiseAlert(tipus, valor, p, Lv){
    const v0 = prefOf("avisos"), v = v0 === "ningu" ? "club" : v0;
    if(!C || !Lv) return false;
    try{ await C.F.setDoc(ref("alertes", uid() + "_" + Lv.start + "_" + tipus), Object.assign({clubId:C.member.clubId, tipus, userId:uid(), nom:C.member.nom,
      act:String(D.myPres?.act || act), desde:Lv.start, lat:p ? p.lat : HOME[0], lon:p ? p.lon : HOME[1], posAt:now(), valor:num(valor), resolta:false, creat:C.F.serverTimestamp(),
      base: window.OV_PRIV ? OV_PRIV.avisosBase() : true}, await visFields(v))); return true; }catch(e){ return false; }
  },
  async clearAlert(tipus, Lv){   // el navegant l'anul·la o acaba la sortida: s'esborra (no cal guardar on era ningú)
    if(!C || !Lv) return;
    C.F.deleteDoc(ref("alertes", uid() + "_" + Lv.start + "_" + tipus)).catch(() => {});
  },
  // Confidencialitat: s'ha canviat una preferència (amics.js)
  async privChanged(k){
    if(!C) return;
    if(k === "autoBase") autoTick(true);
    if(k === "presencia" && D.myPres){ try{ if(vis() === "ningu") await delPres(); else { const o = Object.assign({}, D.myPres); delete o.id; delete o.visib; await setPres(Object.assign(o, await visFields(vis()), {actualitzat:C.F.serverTimestamp()})); } }catch(e){} }
    if(visible()) render();
  },
  // Amics nous o retirats: actualitza qui pot llegir el que ja havies compartit amb «Amics»
  async refreshLectors(){
    if(!C || !window.OV_PRIV) return;
    const L = OV_PRIV.lectors("amics");
    for(const n of ["publicacions", "intencions", "anuncis", "presencia", "alertes"]){
      try{ for(const x of await getAll(n, W("userId", "==", uid()))) if(x.visibilitat === "amics") await C.F.updateDoc(ref(n, x.id), {lectors:L}); }catch(e){}
    }
    if(D.myPres && D.myPres.visibilitat === "amics") D.myPres.lectors = L;
  },
  async purge(){   // en esborrar el compte: treu tot el que el soci ha publicat o marcat al club
    await ctx(); if(!C) return;
    const me = uid(), club = C.member.clubId, del = (n, id) => C.F.deleteDoc(ref(n, id)).catch(() => {});
    const drop = (n, id, f) => C.F.updateDoc(ref(n, id), {[f + "." + me]: C.F.deleteField()}).catch(() => {});
    for(const p of await getVisible("publicacions")) p.userId === me ? await del("publicacions", p.id) : (p.reaccions || {})[me] && await drop("publicacions", p.id, "reaccions");
    for(const x of await getVisible("intencions")) x.userId === me ? await del("intencions", x.id) : (x.apuntats || {})[me] && await drop("intencions", x.id, "apuntats");
    for(const x of await getAll("avisos", W("clubId", "==", club))) x.userId === me ? await del("avisos", x.id) : (x.vist || {})[me] && await drop("avisos", x.id, "vist");
    for(const x of await getVisible("anuncis")){
      if(x.userId === me){ for(const i of await getAll("anuncis/" + x.id + "/interessats")) await C.F.deleteDoc(ref("anuncis", x.id, "interessats", i.id)).catch(() => {}); await del("anuncis", x.id); }
      else await C.F.deleteDoc(ref("anuncis", x.id, "interessats", me)).catch(() => {});
    }
    await del("presencia", me);
  }
};
ctx().then(() => { tabBtn(); loadAlerts(); loadEvents(); autoTick(true); });
})();
