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

let C = null, tab = store.get("ov2_club_tab") || "base", mapObj = null, lastPos = 0;
const D = {pubs:[], intents:[], avisos:[], anuncis:[], pres:[], myPres:null, alertes:[], planol:null, boats:[], fets:[], at:{}};
const WARN = svgI('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', 22);
const F0 = {open:false, date:"mes", person:"tots", order:"recents", vent:false, onada:false, all:false, view:"mur"};
let filt = Object.assign({}, F0, store.get("ov2_club_filt") || {}, {open:false});
const ui = {baseView:store.get("ov2_base_view") || "emb", pv:null, psel:null, whoOpen:{}, avisCom:"totes", anCat:"tots", avisOpen:false, anOpen:false, interest:{}, interested:{}, avOpen:{}};
// Avisos vistos: es pleguen sols 1 h després de marcar-los (l'hora es desa en aquest mòbil; vistos des d'un altre mòbil, plegats)
const AV_FOLD = 60*MIN;
const seenAt = () => store.get("ov2_avis_vist") || {};
function setSeenAt(id, on){ const m = seenAt(); if(on) m[id] = now(); else delete m[id]; store.set("ov2_avis_vist", m); }
const folded = a => !!(a.vist || {})[uid()] && !ui.avOpen[a.id] && now() - (seenAt()[a.id] || 0) > AV_FOLD;
// Mur: cada soci arxiva o esborra publicacions lliscant (només per a ell, en aquest mòbil; les pròpies es retiren del mur)
const murK = k => "ov2_mur_" + k + "_" + (C ? uid() : "");
const murL = k => store.get(murK(k)) || [];
function murSet(k, id, on){ const L = murL(k).filter(x => x !== id); if(on) L.unshift(id); store.set(murK(k), L.slice(0, 400)); }
const ARX = svgI('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>', 24);
const BIN = svgI('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 24);
const PENC = svgI('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>', 20);
const BIN_S = svgI('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 20);
const dayShort = d => new Date(d + "T12:00").toLocaleDateString("ca", {weekday:"short", day:"numeric"});
const CHEV = svgI('<path d="M6 9l6 6 6-6"/>', 20);
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
const vis = () => window.OV_PRIV ? OV_PRIV.pref("presencia") : "club";   // ⋮ ▸ Privadesa (amics.js)
const NIVT = v => (window.OV_PRIV?.NIV || {})[v] || v;
// Publicar avisos: administració i premium, a qualsevol comissió; la resta, a les seves i amb el permís «avisos»
const canPost = () => !C ? [] : (C.isAdm || C.isPremium) ? Object.keys(COMSm()) : C.perms.includes("avisos") ? (C.member.comissions || []).filter(k => COMSm()[k]) : [];
const ERRS = {"buit":"Escriu-hi alguna cosa.","ocupada":"Aquesta plaça ja té una embarcació. Tria'n una altra.","permission-denied":"El núvol ho ha refusat (permís). Comprova que les regles estan publicades.", "unavailable":"Sense connexió amb el núvol.", "timeout":"El núvol no respon."};
const errText = e => ERRS[e && e.code] || "No s'ha pogut fer" + (e && e.code ? " (" + e.code + ")." : ".");
function say(t){ const m = $("clubMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } }
function sheetSay(t){ const m = $("shMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } }
const TO = (p, n = 15000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r({code:"timeout"}), n))]);

async function ctx(){ C = window.OV_CLOUD?.ctx ? await window.OV_CLOUD.ctx().catch(() => null) : null; return C; }
const visible = () => !$("view-club").hidden;

/* ---------- avisos amb data: es mostren a la previsió de 7 dies (app.js, renderWeek) ---------- */
// Puntet vermell a la pestanya «Club» del menú principal si hi ha avisos sense llegir
const unreadN = () => C ? D.avisos.filter(a => alive(a) && !(a.vist || {})[uid()]).length + D.fets.filter(f => f.public && fetIsNew(f)).length : 0;
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
async function loadEvents(){ if(!C) return; try{ D.avisos = await getAll("avisos", W("clubId", "==", C.member.clubId)); D.at.avisos = now(); publishEvents(); remindEvents(); }catch(e){} }

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
const NEED = {mur:["pubs", "intents", "avisos"], avisos:["avisos", "fets", "boats", "planol"], anuncis:["anuncis", "avisos"], base:["pres", "avisos", "planol", "boats", "fets"]};
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
  if(k === "planol"){ const d = await C.F.getDoc(ref("clubs", C.member.clubId, "planol", "actual")).catch(() => null); D.planol = d && d.exists() ? d.data() : null;
    window.OV_SET_COAST?.(C.member.clubId, D.planol ? D.planol.costa : null); if(D.planol) D.planol.objs = PL() ? PL().fromStore(D.planol.objs) : []; }
  if(k === "fets"){   // una consulta per cada manera de veure'ls (les regles no deixen llegir-los tots de cop)
    const club = C.member.clubId, qs = [[W("clubId", "==", club), W("public", "==", true)], [W("clubId", "==", club), W("userId", "==", uid())], [W("propUid", "==", uid())]];
    if(canBoatsE()) qs.push([W("clubId", "==", club), W("tipus", "==", "fet")]);
    const out = new Map(); (await Promise.all(qs.map(w => getAll("fets", ...w).catch(() => [])))).flat().forEach(x => out.set(x.id, x));
    D.fets = [...out.values()].filter(f => f.clubId === club); }
  if(k === "boats") D.boats = await getAll("embarcacions", W("clubId", "==", C.member.clubId)).catch(() => []);
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
    : st === "sense-alta" ? ["Falta l'alta al club", "Has entrat, però encara no has demanat l'alta. Ves a ⋮ ▸ Compte i prem «Sol·licita l'alta»."]
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
  const tabs = [["base", "Base"], ["mur", "Mur"], ["avisos", "Avisos"], ["anuncis", "Anuncis"]];
  el.innerHTML = `<nav class="cl-tabs" aria-label="Seccions del club">${tabs.map(([k, t]) => `<button type="button" data-ctab="${k}"${k === tab ? ' aria-current="page"' : ""}>${t}${k === "base" && fetsUnread() ? `<span class="cl-dot" aria-label="${fetsUnread()} avisos de la base nous">${fetsUnread()}</span>` : ""}${k === "avisos" && unread ? `<span class="cl-dot" aria-label="${unread} sense llegir">${unread}</span>` : ""}</button>`).join("")}</nav>
    <div class="msg err" id="clubMsg" hidden></div>
    ${alertBanner()}
    ${({mur:renderMur, avisos:renderAvisos, anuncis:renderAnuncis, base:renderBaseTab})[tab]()}`;
  if(tab === "base") setTimeout(() => { drawPlan(); }, 0);
  if(tab === "mur") setTimeout(drawRouteMaps, 0);
}

/* ---------- MUR ---------- */
function activeFilters(){
  const P = {meves:"Les meves"}; D.pubs.forEach(p => P[p.userId] = p.nom);
  return [filt.date !== "tot" ? (filt.date === "mes" ? "Últim mes" : "Última setmana") : null,
    filt.person !== "tots" ? (P[filt.person] || "Una persona") : null,
    filt.order === "likes" ? "Més reaccions" : null, filt.view === "arx" ? "Arxivades" : null, filt.vent ? "Vent fort" : null, filt.onada ? "Onada forta" : null].filter(Boolean);
}
const nReact = p => Object.keys(p.reaccions || {}).length;
function feedList(){
  const t0 = {setmana: now() - 7*DAY, mes: now() - 31*DAY, tot: 0}[filt.date] || 0;
  const arx = new Set(murL("arx")), del = new Set(murL("del"));
  const L = D.pubs.filter(p => !del.has(p.id) && (filt.view === "arx") === arx.has(p.id) && (filt.all || p.act === act) && p.inici >= t0
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
  const nArx = D.pubs.filter(p => murL("arx").includes(p.id) && !murL("del").includes(p.id)).length;
  const panel = !filt.open ? "" : `<div class="card cl-panel" id="clPanel">
    <div class="cl-grp"><span class="lbl">Mostra</span><div class="cl-chips">${chip("data-fview", "mur", filt.view !== "arx", "Mur")}${chip("data-fview", "arx", filt.view === "arx", "Arxivades" + (nArx ? " (" + nArx + ")" : ""))}</div>
      <p class="note">Llisca una sortida: cap a la dreta l'arxives, cap a l'esquerra l'esborres. Només ho veus tu; si és teva, es retira del mur.</p></div>
    <div class="cl-grp"><span class="lbl">Data</span><div class="cl-chips">${[["setmana", "Última setmana"], ["mes", "Últim mes"], ["tot", "Tot"]].map(([k, t]) => chip("data-fdate", k, filt.date === k, t)).join("")}</div></div>
    <div class="cl-grp"><span class="lbl">Persones</span><div class="cl-chips">${[["tots", "Tothom"], ["meves", "Les meves"]].concat(Object.entries(people).slice(0, 8)).map(([k, t]) => chip("data-fperson", k, filt.person === k, t)).join("")}</div></div>
    <div class="cl-grp"><span class="lbl">Ordena per</span><div class="cl-chips">${[["recents", "Més recents"], ["likes", "Més reaccions"]].map(([k, t]) => chip("data-forder", k, filt.order === k, t)).join("")}</div></div>
    <div class="cl-grp"><span class="lbl">Condicions</span><div class="cl-chips">${chip("data-fflag", "vent", filt.vent, "Vent fort (+16 kn)")}${chip("data-fflag", "onada", filt.onada, "Onada forta (+0,8 m)")}</div></div>
    <label class="cl-sw"><span>Totes les embarcacions</span><input type="checkbox" class="switch" id="clAll"${filt.all ? " checked" : ""}></label>
    <div class="cl-row2"><button type="button" class="btn" id="clReset">Esborra filtres</button><button type="button" class="btn cl-pri" id="clFiltDone">Fet</button></div></div>`;
  const L = feedList();
  const inArx = filt.view === "arx";
  const sw = p => `<div class="cl-swp" data-sw="${esc(p.id)}"><div class="cl-swbg" aria-hidden="true"><span class="a">${ARX}${inArx ? "Al mur" : "Arxiva"}</span><span class="d">${BIN}${p.userId === uid() ? "Retira" : "Esborra"}</span></div>${card(p)}</div>`;
  return bar + panel + (inArx ? "" : intentsCard()) + (L.length ? L.map(sw).join("")
    : `<article class="card empty">${!D.at.pubs ? "Carregant…" : inArx ? "No tens cap sortida arxivada amb aquests filtres." : D.pubs.length ? "Cap sortida amb aquests filtres." : "Encara no hi ha cap sortida publicada. Comparteix-ne una des de l'Historial."}</article>`);
}
// Idoneïtat d'una sortida anunciada: el mateix càlcul que la previsió (scoreHour) per a l'hora triada i les 2 següents
function intentFit(dia, hora, a){
  if(typeof DATA === "undefined" || !DATA || !DATA.hours || typeof scoreHour !== "function") return null;
  const c = crit[a] || crit.pati, h0 = parseInt(String(hora).slice(0, 2), 10);
  const P = [0, 1, 2].map(i => { const d = new Date(`${dia}T12:00:00`); d.setHours((isNaN(h0) ? 12 : h0) + i, 0, 0, 0); return DATA.hours[localKey(d)]; }).filter(Boolean);
  const R = P.map(p => scoreHour(p, c)).filter(r => r.score != null);
  if(!R.length) return null;
  const PRI = ["poca llum", "tempesta", "pluja", "terral fort", "ratxes fortes", "massa vent", "onada alta", "poc vent"];
  const score = Math.round(R.reduce((s, r) => s + r.score, 0) / R.length);
  const why = [...new Set(R.flatMap(r => r.why))].sort((x, y) => (PRI.includes(x) ? PRI.indexOf(x) : 99) - (PRI.includes(y) ? PRI.indexOf(y) : 99));
  const W = P.map(p => p.wind).filter(v => v != null), G = P.map(p => p.gust).filter(v => v != null), O = R.map(r => r.hb).filter(v => v != null);
  return {score, v: verdict({score, why}), wind: W.length ? Math.round(W.reduce((a, b) => a + b, 0) / W.length) : null, gust: G.length ? Math.round(Math.max(...G)) : null, wave: O.length ? Math.max(...O) : null};
}
const fitDet = f => !f ? "" : [f.wind != null ? `${f.wind} kn${f.gust != null && f.gust > f.wind + 3 ? " (ratxes " + f.gust + ")" : ""}` : "", f.wave != null ? String(Math.round(f.wave * 10) / 10).replace(".", ",") + " m" : "", f.v.sub].filter(Boolean).join(" · ");
// Indicador d'idoneïtat petit (anell + nota), per a la cantonada de cada «Qui surt»
function miniGauge(f){
  const r = 17, L = 2*Math.PI*r, s = f ? f.score : null, n = f ? Math.round(s/10) : "–";
  const arc = s > 0 ? `<circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--c)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(Math.max(.03, s/100)*L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 22 22)"/>` : "";
  return `<span class="cl-mg k-${f ? f.v.k : "none"}" role="img" aria-label="${f ? `Idoneïtat ${n} de 10: ${esc(f.v.t)}` : "Sense previsió encara"}" title="${f ? esc(f.v.t) : "Sense previsió"}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--grid)" stroke-width="5"/>${arc}<text x="22" y="28" text-anchor="middle" font-family="Rajdhani,sans-serif" font-weight="700" font-size="18" fill="var(--c)">${n}</text></svg></span>`;
}
function fitHtml(f){
  if(!f) return `<span class="cl-fit k-none">Sense previsió encara</span>`;
  const det = fitDet(f);
  return `<span class="cl-fit k-${f.v.k}"><b>${Math.round(f.score / 10)}</b>${esc(f.v.t)}</span>${det ? `<span class="cl-fitd">${esc(det)}</span>` : ""}`;
}
function intentsCard(){
  const L = D.intents.filter(alive).sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora));
  const today = ymd(new Date()), tom = ymd(new Date(now() + DAY));
  const dl = d => d === today ? "Avui" : d === tom ? "Demà" : new Date(d + "T12:00").toLocaleDateString("ca", {weekday:"short", day:"numeric"});
  return `<section class="card cl-intents" aria-label="Qui surt a navegar"><div class="card-h"><span class="lbl">Qui surt</span><span class="note">S'esborra l'endemà</span></div>
    ${L.map(intentItem).join("")}
    <button type="button" class="btn cl-dash" id="clNewIntent">+ Anuncia sortida</button></section>`;
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
    <div class="cl-reacts" role="group" aria-label="Reaccions" data-rpub="${esc(p.id)}">${reactsHtml(p)}</div>
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
function avisCard(a){
  const coms = canPost(), mine = C.member.comissions || [];
  const seen = !!(a.vist || {})[uid()], n = Object.keys(a.vist || {}).length, own = a.userId === uid(), del = own || C.isAdm || mine.includes(a.comissio) || canMod();
      if(folded(a)) return `<button type="button" class="card cl-avis cl-avmini c-${esc(a.comissio)}" data-item="avisos:${esc(a.id)}" data-avopen="${esc(a.id)}" aria-expanded="false" aria-label="${esc(COMSm()[a.comissio] || a.comissio)}: ${esc(a.titol)}. Vist. Toca per obrir-lo">
        ${a.fixat ? `<span class="cl-pin" aria-hidden="true">${PIN}</span>` : ""}<b>${esc(a.titol)}</b>${a.data ? `<span class="cl-date">${esc(dayShort(a.data))}</span>` : ""}${a.inscripcio && (a.apuntats || {})[uid()] ? `<span class="cl-mok" aria-hidden="true">✓</span>` : ""}${CHEV}</button>`;
      return `<article class="card cl-avis c-${esc(a.comissio)}${seen ? "" : " unread"}" data-item="avisos:${esc(a.id)}">
        <div class="cl-avh"><span class="cl-badge">${esc(COMSm()[a.comissio] || a.comissio)}</span>${a.fixat ? `<span class="cl-pin" aria-label="Fixat">${PIN}</span>` : ""}${a.data ? `<span class="cl-event">${CAL}<b>${esc(dayLong(a.data))}</b></span>` : ""}${seen ? `<button type="button" class="cl-avfold" data-avfold="${esc(a.id)}" aria-expanded="true" aria-label="Plega l'avís">${CHEV}</button>` : ""}</div>
        <h3 class="cl-atitle">${esc(a.titol)}</h3>
        ${a.text ? `<p class="cl-text">${esc(a.text)}</p>` : ""}
        ${a.inscripcio ? signRow(a) : ""}
        <div class="cl-afoot"><div class="cl-meta">${esc(a.autorNom || "")} · ${esc(dayStr(ms(a.creat) || now()))}${a.editat ? " · editat" : ""} · ${a.data ? "s'esborra l'endemà" : "fins que es retiri"} · <span class="cl-nv" aria-label="vist per ${n}">${EYE_S}${n}</span></div>
          ${own ? `<button type="button" class="cl-ib2" data-editavis="${esc(a.id)}" aria-label="Edita l'avís">${PENC}</button>` : ""}${del ? `<button type="button" class="cl-ib2" data-askdel="avisos" data-id="${esc(a.id)}" aria-label="Retira l'avís">${BIN_S}</button>` : ""}
          <button type="button" class="btn cl-seen" data-seen="${esc(a.id)}" aria-pressed="${seen}" aria-label="${seen ? "Vist. Toca per desmarcar" : "Marca com a vist"}">${seen ? SEEN : EYE}<small>${seen ? "Vist" : "Marca"}</small></button></div>
        ${del ? `<div data-delbox="${esc(a.id)}"></div>` : ""}</article>`; }
function intentItem(it){
  const today = ymd(new Date()), tom = ymd(new Date(now() + DAY));
  const dl = d => d === today ? "Avui" : d === tom ? "Demà" : new Date(d + "T12:00").toLocaleDateString("ca", {weekday:"short", day:"numeric"}); const ap = it.apuntats || {}, n = Object.keys(ap).length, on = !!ap[uid()], mine = it.userId === uid();
      const f = intentFit(it.dia, it.hora, it.act), det = f ? fitDet(f) : "Sense previsió encara";
      return `<div class="cl-intw" data-item="intencions:${esc(it.id)}"><div class="cl-int"><div class="cl-when"><b>${esc(dl(it.dia))}</b><span>${esc(it.hora)}</span></div>
        <div class="cl-ib"><div class="cl-it"><b>${esc(it.nom)}</b><span>${esc(boatShort(it.act))}</span></div>
          <div class="cl-im k-${f ? f.v.k : "none"}">${esc(det)}</div>
          ${(w => `<div class="cl-ia">${w.head}</div>${w.list}`)(who("intencions:" + it.id, apList(ap), "s'hi apunta", "s'hi apunten", "s'hi apunta encara"))}</div>
        ${miniGauge(f)}
        ${mine ? `<button type="button" class="btn sm" data-askdel="intencions" data-id="${esc(it.id)}">Retira</button>` : `<button type="button" class="btn cl-go" data-join="${esc(it.id)}" aria-pressed="${on}">${on ? "Hi vas ✓" : "Hi vaig"}</button>`}</div>
        ${!mine && canMod() ? modBtn("intencions", it) : ""}<div data-delbox="${esc(it.id)}"></div></div>`; }
function anCard(a){
  const mine = a.userId === uid(), on = !!ui.interest[a.id], names = ui.interested[a.id] || [];
  return `<article class="card cl-an" data-item="anuncis:${esc(a.id)}"><div class="cl-avh"><span class="cl-tag">${esc(CATS[a.cat] || a.cat)}</span><span class="cl-date">Fins al ${esc(dayStr(ms(a.caduca)))}</span></div>
    <h3 class="cl-atitle">${esc(a.titol)}</h3>${a.text ? `<p class="cl-text">${esc(a.text)}</p>` : ""}
    <div class="cl-afoot"><div class="cl-meta">${mine ? who("anuncis:" + a.id, names, "persona interessada", "persones interessades", "s'hi ha interessat encara").head : esc(a.autorNom) + " · " + esc(dayStr(ms(a.creat) || now()))}</div>
      ${mine ? `<button type="button" class="cl-ib2" data-editan="${esc(a.id)}" aria-label="Edita l'anunci">${PENC}</button><button type="button" class="cl-ib2" data-askdel="anuncis" data-id="${esc(a.id)}" aria-label="Retira l'anunci">${BIN_S}</button>`
        : `<button type="button" class="btn cl-go" data-interest="${esc(a.id)}" aria-pressed="${on}">${on ? "T'interessa ✓" : "M'interessa"}</button>`}</div>
    ${mine ? (w => w.list ? w.list + `<p class="note cl-only">Només ho veus tu, per contactar-hi pel teu compte.</p>` : "")(who("anuncis:" + a.id, names)) : ""}
    ${!mine && canMod() ? modBtn("anuncis", a) : ""}<div data-delbox="${esc(a.id)}"></div></article>`;
}
function renderAvisos(){
  const L = D.avisos.filter(a => alive(a) && (ui.avisCom === "totes" || a.comissio === ui.avisCom))
    .sort((a, b) => (b.fixat ? 1 : 0) - (a.fixat ? 1 : 0) || (a.data && b.data ? a.data.localeCompare(b.data) : (a.data ? -1 : b.data ? 1 : 0)) || ms(b.creat) - ms(a.creat));
  const coms = canPost(), mine = C.member.comissions || [];
  const base = ui.avisCom === "totes" || ui.avisCom === "base", P = base ? fetsPub() : [];
  return foldFilters("avis", ui.avisCom === "totes" ? "" : ui.avisCom === "base" ? "Base" : COMSm()[ui.avisCom], ui.avisOpen, [["totes", "Totes"], ["base", "Base"]].concat(Object.entries(COMSm())).map(([k, t]) => chip("data-acom", k, ui.avisCom === k, t)).join(""))
    + (P.length || ui.avisCom === "base" ? `<section class="card bs-fets"><div class="card-h"><span class="lbl">Base nàutica</span><button type="button" class="btn sm cl-pri" id="clFetNew">+ Nou</button></div>${P.map(fetRow).join("") || `<p class="note">Res pendent a la base.</p>`}</section>` : "")
    + `${ui.avisCom === "base" ? "" : L.map(avisCard).join("")
      || (P.length || ui.avisCom === "base" ? "" : `<article class="card empty">${D.at.avisos ? "No hi ha cap avís." : "Carregant…"}</article>`)}
    ${coms.length ? `<button type="button" class="btn cl-pri cl-wide" id="clNewAvis">+ Nou avís</button><p class="note">Hi publiquen les comissions amb permís per fer avisos${mine.length ? ". Tu hi publiques com a: " + esc(mine.map(k => COMSm()[k]).join(", ")) : ""}.</p>` : ""}`;
}

/* ---------- ANUNCIS ---------- */
function renderAnuncis(){
  const L = D.anuncis.filter(a => alive(a) && (ui.anCat === "tots" || a.cat === ui.anCat)).sort((a, b) => ms(b.creat) - ms(a.creat));
  return foldFilters("an", ui.anCat === "tots" ? "" : CATS[ui.anCat], ui.anOpen, [["tots", "Tots"]].concat(Object.entries(CATS)).map(([k, t]) => chip("data-acat", k, ui.anCat === k, t)).join(""))
    + `${L.map(anCard).join("")
      || `<article class="card empty">${D.at.anuncis ? "No hi ha cap anunci." : "Carregant…"}</article>`}
    <button type="button" class="btn cl-pri cl-wide" id="clNewAn">+ Publica un anunci</button>
    <p class="note">Qui s'hi interessa prem «M'interessa»; només tu veus qui és, per contactar-hi pel teu compte.</p>`;
}

/* ---------- BASE ---------- */
const presLive = () => D.pres.filter(x => now() - (ms(x.actualitzat) || 0) < DAY);
const warned = x => x.estat === "aigua" && D.alertes.some(a => a.userId === x.id);
/* ---------- BASE ▸ Embarcacions: plànol de la base (planol-core.js) ---------- */
const PL = () => window.OV_PLAN;
const canPlanE = () => !!C && (C.isAdm || C.isPremium || C.perms.includes("planol") || (C.member.comissions || []).includes("junta"));
const canBoatsE = () => !!C && (C.isAdm || C.isPremium || C.perms.includes("embarcacions") || (C.member.comissions || []).includes("manteniment"));
const myBoats = () => D.boats.filter(b => b.propUid === uid());
const placeById = id => ((D.planol && D.planol.objs) || []).find(o => o.id === id && o.k === "place");
// Base: tot en una pàgina. Vent i qui hi ha · plànol · avisos de la base · les meves embarcacions · qui hi ha (mapa i llistes)
function renderBaseTab(){ return renderBoats() + `<section class="bs-qui">${renderBase()}</section>`; }
/* ---------- Fase B: l'embarcació de la sortida passa a «navegant» i, en acabar, torna a «a la varada» ---------- */
// Tria: la que el soci ha marcat a «Nova sortida» (ov2_trip_pick), si no la del mateix tipus que l'embarcació triada a dalt, si no la primera. Les que són en reparació no.
const TB_K = "ov2_trip_boat";
const tripBoats = () => myBoats().filter(b => (b.estat || "lloc") !== "reparacio");
function boatForTrip(){
  const M = tripBoats(), pick = store.get("ov2_trip_pick");
  if(pick === "cap") return null; if(M.some(b => b.id === pick)) return pick;
  return ((M.filter(b => b.t === act)[0]) || M[0] || {}).id || null;
}
async function ensureBoats(){ if(C && !D.at.boats){ try{ await fetchK("boats"); }catch(e){} } }
function tripBoatUI(){
  const el = $("tripBoat"); if(!el) return;
  const M = C ? myBoats() : []; if(!M.length){ el.hidden = true; el.innerHTML = ""; return; }
  const cur = boatForTrip(), B = PL() ? PL().BOATS : {};
  el.hidden = false;
  el.innerHTML = `<span class="lbl">Embarcació del club</span><div class="cl-chips">${M.map(b => { const rep = (b.estat || "lloc") === "reparacio";
      return `<button type="button" class="cl-chip" data-tboat="${esc(b.id)}" aria-pressed="${cur === b.id}"${rep ? " disabled" : ""}>${esc(b.label || B[b.t]?.n || "Embarcació")}${rep ? " · en reparació" : ""}</button>`; }).join("")}
    <button type="button" class="cl-chip" data-tboat="cap" aria-pressed="${cur === null}">Cap</button></div>
    <p class="note">${cur ? "Mentre duri la sortida sortirà com a «navegant» al plànol del club." : "No es marcarà cap embarcació com a navegant."}</p>`;
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("#tripBoat [data-tboat]"); if(!b) return; store.set("ov2_trip_pick", b.dataset.tboat); tripBoatUI(); });
async function tripBoatStart(){
  if(!C || store.get(TB_K)) return; await ensureBoats();
  const id = boatForTrip(), b = id && D.boats.find(x => x.id === id); if(!b) return;
  try{ if((b.estat || "lloc") !== "navegant") await boatSave(b, {estat:"navegant"}, "Navegant (sortida)"); store.set(TB_K, {id:b.id, at:now()}); if(visible()) render(); }catch(e){}
}
async function tripBoatEnd(){
  const tb = store.get(TB_K); if(!tb || !C) return; await ensureBoats();
  const b = D.boats.find(x => x.id === tb.id);
  try{ if(b && b.estat === "navegant") await boatSave(b, {estat:"lloc"}, "A la varada (fi de la sortida)"); store.del(TB_K); if(visible()) render(); }catch(e){}   // si falla, es torna a provar en tornar a obrir l'app
}

/* ---------- capçalera de Base: vent d'ara i qui hi ha ---------- */
// Capçalera de la Base: qui hi ha (a la base · navegant, amb els noms) i el botó «Soc a la base» / «Marxo de la base»
function presBtn(){
  const v = vis(), me = D.myPres && now() - (ms(D.myPres.actualitzat) || 0) < DAY ? D.myPres : null;
  if(v === "ningu") return `<p class="note">Tens la presència desactivada (⋮ ▸ Privadesa).</p>`;
  if(me && me.estat === "aigua") return "";
  return me && me.estat === "base" ? `<button type="button" class="btn bs-pbtn" id="clLeave">Marxo de la base</button>` : `<button type="button" class="btn cl-ok bs-pbtn" id="clHere">Soc a la base</button>`;
}
function baseTop(){
  const L = presLive(), ai = L.filter(x => x.estat === "aigua"), ba = L.filter(x => x.estat === "base");
  const names = (A, cls) => A.length ? `<div class="bs-pcs">${A.slice(0, 6).map(x => `<span class="bs-pc${cls}${warned(x) ? " late" : ""}">${esc(x.id === uid() ? "Tu" : String(x.nom || "").split(" ")[0])}</span>`).join("")}${A.length > 6 ? `<span class="bs-pc${cls}">+${A.length - 6}</span>` : ""}</div>` : "";
  const cell = (n, t, col, A, cls) => `<div class="bs-cell"><span class="bs-n"><b style="color:var(--${col})">${n}</b> ${t}</span>${names(A, cls)}</div>`;
  return `<article class="card bs-top"><div class="bs-cells">${cell(ba.length, "a la base", "ideal", ba, "")}${cell(ai.length, "navegant", "accent", ai, " aigua")}</div>${presBtn()}</article>`;
}

/* ---------- avisos de la base: notes, fets i preguntes (col·lecció «fets») ---------- */
const FET_T = {nota:{n:"Nota", i:"i"}, fet:{n:"Avís", i:"!"}, pregunta:{n:"Pregunta al propietari", i:"?"}};
const fetBoat = f => f.boatId ? D.boats.find(b => b.id === f.boatId) : null;
const fetWhere = f => { const b = fetBoat(f), pl = b ? placeById(b.place) : f.placeId ? placeById(f.placeId) : null; return [pl ? "Plaça " + (pl.label || "") : "", b ? (b.label || PL()?.BOATS[b.t]?.n || "") : ""].filter(Boolean).join(" · "); };
const fetLast = f => ms(f.darrer && f.darrer.at) || ms(f.creat) || 0;
const fetIsNew = f => f.estat === "obert" && !(f.vist || {})[uid()] && (f.darrer ? f.darrer.uid !== uid() : f.userId !== uid());
const fetsUnread = () => C ? D.fets.filter(f => !f.public && fetIsNew(f)).length : 0;   // les notes i avisos generals compten a «Avisos»
const fetsPub = () => D.fets.filter(f => f.public && f.estat !== "tancat").sort((a, b) => fetLast(b) - fetLast(a));
const canClose = f => f.userId === uid() || f.propUid === uid() || (f.tipus !== "pregunta" && canBoatsE());
function fetRow(f){
  const n = (f.respostes || []).length, w = fetWhere(f);
  return `<button type="button" class="bs-frow t-${esc(f.tipus)}${fetIsNew(f) ? " new" : ""}" data-fet="${esc(f.id)}"><span class="bs-fi" aria-hidden="true">${FET_T[f.tipus]?.i || "i"}</span>
    <span class="bs-ft"><b>${esc(f.text)}</b><small>${esc(f.autorNom || "")}${w ? " · " + esc(w) : ""} · ${esc(ago(fetLast(f)))}${n ? " · " + n + (n === 1 ? " resposta" : " respostes") : ""}</small></span></button>`;
}
// A la Base: les notes i avisos generals (que surten sencers a «Avisos») com a marques d'una línia; els de les embarcacions, sencers
function fetsCard(){
  const open = D.fets.filter(f => !f.public && f.estat !== "tancat").sort((a, b) => fetLast(b) - fetLast(a)), closed = D.fets.filter(f => !f.public && f.estat === "tancat" && now() - fetLast(f) < 30*DAY), P = fetsPub();
  const marks = P.map(f => `<button type="button" class="bs-mark t-${esc(f.tipus)}${fetIsNew(f) ? " new" : ""}" data-fet="${esc(f.id)}"><span class="bs-fi" aria-hidden="true">${FET_T[f.tipus]?.i || "i"}</span><span>${esc(f.text)}</span></button>`).join("");
  return `<section class="card bs-fets"><div class="card-h"><span class="lbl">Avisos de la base</span><button type="button" class="btn sm cl-pri" id="clFetNew">+ Nou</button></div>
    ${marks ? `<div class="bs-marks">${marks}</div>` : ""}
    ${open.map(fetRow).join("") || (marks ? "" : `<p class="note">Res pendent a la base.</p>`)}
    ${closed.length ? `<details><summary class="lbl">Tancats (${closed.length})</summary>${closed.map(fetRow).join("")}</details>` : ""}</section>`;
}
function fetNewSheet(b){
  const own = b && b.propUid === uid(), kinds = b ? (own || !b.propUid ? ["fet"] : ["fet", "pregunta"]) : ["fet", "nota"];
  let kind = kinds[0];
  const who = k => k === "pregunta" ? "Només la veuen tu i el propietari." : b ? "La veuen el propietari i Manteniment." : k === "nota" ? "La veu tot el club." : "El veu tot el club; Manteniment el pot tancar.";
  sheet(b ? (b.label || PL().BOATS[b.t]?.n || "Embarcació") : "Nou avís de la base", `${kinds.length > 1 ? `<div class="cl-seg cl-seg2">${kinds.map(k => `<button type="button" data-fkind="${k}" aria-pressed="${k === kind}">${k === "fet" ? (b ? "Avisa d'un fet" : "Avís / incidència") : k === "nota" ? "Nota informativa" : "Pregunta"}</button>`).join("")}</div>` : ""}
    ${field("fText", "Text", `<textarea class="field cl-ta" id="fText" rows="3" maxlength="500" placeholder="${b ? "Ex.: la vela ha quedat mal plegada" : "Ex.: la dutxa de l'esquerra no funciona"}"></textarea>`)}
    <p class="note" id="fWho">${who(kind)}</p><button type="button" class="btn cl-pri cl-wide" id="shSave">Envia</button>`, sh => {
    sh.querySelectorAll("[data-fkind]").forEach(x => x.onclick = () => { kind = x.dataset.fkind; sh.querySelectorAll("[data-fkind]").forEach(y => y.setAttribute("aria-pressed", String(y === x))); $("fWho").textContent = who(kind); });
    $("shSave").onclick = e => busy(e.currentTarget, async () => { const text = $("fText").value.trim().slice(0, 500); if(!text) throw {code:"buit"};
      const data = {clubId:C.member.clubId, userId:uid(), autorNom:C.member.nom || "", tipus:kind, text, boatId:b ? b.id : null, placeId:b ? b.place || null : null, propUid:b ? b.propUid || null : null,
        public:!b, estat:"obert", respostes:[], vist:{[uid()]:true}, creat:C.F.serverTimestamp()};
      const rf = C.F.doc(col("fets")); await TO(C.F.setDoc(rf, data)); D.fets.push(Object.assign({id:rf.id}, data, {creat:now()})); closeSheet(); render(); });
  });
}
function fetSheet(id){
  const f = D.fets.find(x => x.id === id); if(!f) return;
  const close = canClose(f), del = f.userId === uid() || canBoatsE(), b = fetBoat(f);
  const msg = (who, at, t) => `<div class="bs-msg"><small>${esc(who)} · ${esc(at ? new Date(at).toLocaleString("ca", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "")}</small><p>${esc(t)}</p></div>`;
  sheet(FET_T[f.tipus]?.n || "Avís", `${fetWhere(f) ? `<p class="note">${esc(fetWhere(f))}</p>` : ""}
    <div class="bs-thread">${msg(f.autorNom || "", ms(f.creat), f.text)}${(f.respostes || []).map(x => msg(x.nom || "", x.at, x.text)).join("")}</div>
    ${f.estat === "tancat" ? `<p class="note"><b>Tancat.</b></p>` : `${field("fRep", "Resposta", `<textarea class="field cl-ta" id="fRep" rows="2" maxlength="500"></textarea>`)}<button type="button" class="btn cl-pri cl-wide" id="fSend">Respon</button>`}
    <div class="cl-row2">${close ? `<button type="button" class="btn" id="fClose">${f.estat === "tancat" ? "Torna'l a obrir" : "Tanca'l"}</button>` : "<span></span>"}${b ? `<button type="button" class="btn" id="fBoat">Veure l'embarcació</button>` : ""}</div>
    ${del ? `<div data-delbox="fDel"></div><button type="button" class="btn sm" id="fDelAsk">Esborra'l</button>` : ""}`, sh => {
    if(!(f.vist || {})[uid()]){ f.vist = Object.assign({}, f.vist, {[uid()]:true}); C.F.updateDoc(ref("fets", f.id), {["vist." + uid()]:true}).catch(() => {}); render(); }
    const send = $("fSend"); if(send) send.onclick = () => busy(send, async () => { const text = $("fRep").value.trim().slice(0, 500); if(!text) return;
      const x = {uid:uid(), nom:C.member.nom || "", text, at:now()}, R = (f.respostes || []).concat([x]).slice(-40);
      await TO(C.F.updateDoc(ref("fets", f.id), {respostes:R, darrer:{uid:uid(), at:x.at}, vist:{[uid()]:true}})); f.respostes = R; f.darrer = {uid:uid(), at:x.at}; f.vist = {[uid()]:true}; fetSheet(f.id); render(); });
    const cl = $("fClose"); if(cl) cl.onclick = () => busy(cl, async () => { const st = f.estat === "tancat" ? "obert" : "tancat";
      await TO(C.F.updateDoc(ref("fets", f.id), {estat:st, darrer:{uid:uid(), at:now()}})); f.estat = st; f.darrer = {uid:uid(), at:now()}; closeSheet(); render(); });
    const fb = $("fBoat"); if(fb) fb.onclick = () => { ui.psel = b.place || null; closeSheet(); boatSheet(b.place, b.id); drawPlan(); };
    const da = $("fDelAsk"); if(da) da.onclick = () => { da.hidden = true; slideConfirm(sh.querySelector('[data-delbox="fDel"]'), "Llisca per esborrar-lo", async () => {
      try{ await TO(C.F.deleteDoc(ref("fets", f.id))); D.fets = D.fets.filter(x => x.id !== f.id); closeSheet(); render(); }catch(err){ sheetSay(errText(err)); } }); };
  });
}

function renderBoats(){
  if(!PL()) return `<article class="card empty">Carregant…</article>`;
  const plan = D.planol, places = ((plan && plan.objs) || []).filter(o => o.k === "place"), edit = canPlanE() || canBoatsE();
  if(!places.length && !((plan && plan.objs) || []).length) return baseTop() + `<article class="card empty">${D.at.planol ? "Encara no s'ha dibuixat el plànol de la base." : "Carregant…"}${edit ? `<p class="note" style="margin-top:8px">Es dibuixa des de la web de gestió del club.</p>` : ""}</article>` + fetsCard();
  const onPlace = D.boats.filter(b => b.place && placeById(b.place)), n = k => onPlace.filter(b => (b.estat || "lloc") === k).length, lliures = places.filter(p => !onPlace.some(b => b.place === p.id)).length;
  const M = myBoats(), E = PL().ESTATS;
  return baseTop() + `<article class="card ovp-card"><div class="ovp" id="ovp"><svg id="ovpSvg" xmlns="http://www.w3.org/2000/svg" aria-label="Plànol de la base: toca una plaça per veure'n l'embarcació"></svg>
</div>
    <div class="ovp-leg"><span><i style="background:#fff;border-color:#1c2530"></i>${n("lloc")} a la varada</span><span><i style="background:${E.navegant.f};border-color:${E.navegant.s}"></i>${n("navegant")} navegant</span><span><i style="background:${E.reparacio.f};border-color:${E.reparacio.s}"></i>${n("reparacio")} en reparació</span><span><i style="border-style:dashed"></i>${lliures} lliures</span></div></article>
    ${(P => canBoatsE() && P.length ? `<section class="card cl-pend"><div class="card-h"><span class="lbl">Pendents de validar · ${P.length}</span></div>${P.map(b => { const pl = placeById(b.place);
      return `<div class="cl-brow"><button type="button" class="cl-bname" data-boat="${esc(b.id)}"><b>${esc(b.label || PL().BOATS[b.t]?.n || "Embarcació")}</b><span>${esc(b.prop || "")} · ${pl ? "plaça " + esc(pl.label || "") : "sense plaça"}</span></button><button type="button" class="btn sm cl-pri" data-bvalid="${esc(b.id)}">Valida</button></div>`; }).join("")}</section>` : "")(D.boats.filter(b => b.pendent))}
    <section class="card"><div class="card-h"><span class="lbl">${M.length > 1 ? "Les meves embarcacions" : "La meva embarcació"}</span></div>${M.map(b => { const pl = placeById(b.place);
      return `<div class="cl-brow"><button type="button" class="cl-bname" data-boat="${esc(b.id)}"><b>${esc(b.label || PL().BOATS[b.t]?.n || "Embarcació")}${b.pendent ? ` <i class="cl-ptag">pendent de validar</i>` : ""}</b><span>${pl ? "Plaça " + esc(pl.label || "") : "Sense plaça"}</span></button>
        <div class="cl-bst">${Object.entries(E).map(([k, T]) => `<button type="button" class="cl-chip" data-bstate="${k}" data-id="${esc(b.id)}" aria-pressed="${(b.estat || "lloc") === k}" style="--c:${T.s}">${T.c || T.n}</button>`).join("")}</div></div>`; }).join("")}
      <button type="button" class="btn cl-dash" id="clBoatNew">+ ${M.length ? "Afegeix-ne una altra" : "Afegeix la meva embarcació"}</button>
      <p class="note">Les dades que hi posis (tipus, nom, vela, plaça) les valida Manteniment. També pots tocar una plaça lliure del plànol.</p></section>
    ${fetsCard()}`;
}
// Vista del plànol: fixa, enquadrada pels responsables a l'editor (vista = {x, y, w, h} en metres); sense enquadrament, tot el plànol. Tocar una plaça obre la fitxa.
function planView(){ const v = D.planol && D.planol.vista; if(v && v.w > 1 && v.h > 1) return v;
  const ex = PL().extent(D.planol); if(!ex) return {x:-40, y:-30, w:80, h:60}; const m = 1.5; return {x:ex[0] - m, y:ex[1] - m, w:ex[2] - ex[0] + 2*m, h:ex[3] - ex[1] + 2*m}; }
function drawPlan(){
  const svg = $("ovpSvg"); if(!svg || !PL()) return; const box0 = svg.parentNode;
  const v = planView(); box0.style.aspectRatio = `${v.w} / ${v.h}`;
  const box = svg.getBoundingClientRect(); if(!box.width) return;
  svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`); svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const ppm = Math.min(box.width / v.w, box.height / v.h);
  svg.innerHTML = PL().render(D.planol, D.boats, {ppm, mine:new Set(myBoats().map(b => b.id)), sel:ui.psel}) + fetMarks(ppm);
}
// marca «!» o «?» a la plaça que té un avís o una pregunta oberts (dels que veus)
function fetMarks(ppm){ const R = 9 / ppm, by = {};
  D.fets.filter(f => !f.public && f.estat !== "tancat").forEach(f => { const b = fetBoat(f), id = (b && b.place) || f.placeId; if(id && !by[id]) by[id] = f; });
  return Object.entries(by).map(([id, f]) => { const o = placeById(id); if(!o) return ""; const [dx, dy] = PL().rot(o.l/2 - R*.9, -o.w/2 + R*.9, o.r || 0);
    return `<g pointer-events="none"><circle cx="${o.x + dx}" cy="${o.y + dy}" r="${R}" fill="${f.tipus === "pregunta" ? "var(--ideal)" : "var(--marg)"}" stroke="#fff" stroke-width="${R*.2}"/><text x="${o.x + dx}" y="${o.y + dy}" font-size="${R*1.3}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="800" font-family="Georgia,serif">${FET_T[f.tipus]?.i || "!"}</text></g>`; }).join(""); }
let ptap = null;
document.addEventListener("pointerdown", e => { const g = e.target.closest && e.target.closest("#ovpSvg [data-place]"); ptap = g ? {x:e.clientX, y:e.clientY, place:g.dataset.place} : null; });
document.addEventListener("pointerup", e => { const d = ptap; ptap = null; if(!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
  ui.psel = d.place; drawPlan(); boatSheet(d.place); });
window.addEventListener("resize", () => { if($("ovpSvg")) drawPlan(); });

/* ---------- fitxa de l'embarcació ---------- */
// Dades que proposa el soci (i valida Manteniment): tipus, nom, vela, copropietaris i plaça
function dataForm(b, pl){
  const B = PL().BOATS, cur = b ? b.place : pl ? pl.id : "", t = b ? b.t : pl ? pl.t : "pati";
  const free = ((D.planol && D.planol.objs) || []).filter(o => o.k === "place" && (o.id === cur || !D.boats.some(x => x.place === o.id)));
  return `<div class="cl-row2">${field("bfT", "Tipus", `<select class="field" id="bfT">${Object.entries(B).map(([k, T]) => `<option value="${k}"${k === t ? " selected" : ""}>${esc(T.n)}</option>`).join("")}</select>`)}
      ${field("bfP", "Plaça", `<select class="field" id="bfP"><option value="">Sense plaça</option>${free.map(o => `<option value="${esc(o.id)}"${o.id === cur ? " selected" : ""}>${esc(o.label || "")} · ${esc(B[o.t]?.n || "")}</option>`).join("")}</select>`)}</div>
    <div class="cl-row2">${field("bfN", "Nom", `<input class="field" id="bfN" maxlength="40" value="${esc(b ? b.label || "" : "")}" placeholder="Garbinada">`)}${field("bfV", "Vela / matrícula", `<input class="field" id="bfV" maxlength="20" value="${esc(b ? b.vela || "" : "")}" placeholder="1234">`)}</div>
    ${field("bfC", "Copropietaris", `<input class="field" id="bfC" maxlength="120" value="${esc(b ? b.coprop || "" : "")}" placeholder="Opcional, separats per comes">`)}`;
}
const formVals = () => ({t:$("bfT").value, place:$("bfP").value || null, label:$("bfN").value.trim().slice(0, 40), vela:$("bfV").value.trim().slice(0, 20), coprop:$("bfC").value.trim().slice(0, 120)});
function newBoatSheet(pl){
  sheet("La meva embarcació", `${dataForm(null, pl)}<p class="note">${canBoatsE() ? "Com que gestiones les embarcacions, queda validada directament." : "Queda pendent fins que la validi Manteniment. Mentrestant ja surt al plànol, amb la vora taronja."}</p>
    <button type="button" class="btn cl-pri cl-wide" id="shSave">Desa-la</button>`, () => {
    $("shSave").onclick = e => busy(e.currentTarget, async () => {
      const v = formVals(), o = v.place && placeById(v.place);
      if(v.place && D.boats.some(x => x.place === v.place)) throw {code:"ocupada"};
      const data = Object.assign(v, {clubId:C.member.clubId, prop:C.member.nom || "", propUid:uid(), ocult:false, estat:"lloc", notes:"", pendent:!canBoatsE(),
        historial:[{at:now(), qui:C.member.nom || "", que:(canBoatsE() ? "Alta" : "Proposada") + (o ? " a la plaça " + (o.label || "") : "")}], actualitzat:C.F.serverTimestamp(), actualitzatPer:uid()});
      const r = C.F.doc(col("embarcacions")); await TO(C.F.setDoc(r, data));
      D.boats.push(Object.assign({id:r.id}, data)); closeSheet(); render(); });
  });
}
const ESTAT_T = k => (PL() ? PL().ESTATS[k] || PL().ESTATS.lloc : {n:k}).n;
async function boatSave(b, patch, hist){
  const h = (b.historial || []).slice(-19); if(hist) h.push({at:now(), qui:C.member.nom || "", que:hist});
  const data = Object.assign({}, patch, {historial:h, actualitzat:C.F.serverTimestamp(), actualitzatPer:uid()});
  await TO(C.F.updateDoc(ref("embarcacions", b.id), data)); Object.assign(b, patch, {historial:h});
}
// Foto de l'embarcació: el soci l'enquadra (arrossegar i pessigar, roda o la barra) dins un marc 3:2 i es desa com a JPEG < 150 kB
const readURL = file => new Promise((ok, ko) => { const rd = new FileReader(); rd.onerror = ko; rd.onload = () => ok(rd.result); rd.readAsDataURL(file); });
const loadImg = src => new Promise((ok, ko) => { const im = new Image(); im.onerror = ko; im.onload = () => ok(im); im.src = src; });
function jpegCrop(im, sx, sy, sw, sh){ let W = 960, q = .74, out = "";
  for(let i = 0; i < 7; i++){ const k = Math.min(1, W / sw), c = document.createElement("canvas"); c.width = Math.round(sw*k); c.height = Math.round(sh*k);
    c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height); out = c.toDataURL("image/jpeg", q); if(out.length < 140000) break; W *= .82; q -= .07; }
  if(out.length >= 150000) throw {code:"massa-gran"}; return out; }
function cropPhoto(host, src){ return new Promise(async (done, ko) => {
  let im; try{ im = await loadImg(src); }catch(e){ ko(e); return; }
  const prev = host.innerHTML; host.innerHTML = `<div class="cl-crop" id="cropF"><img src="${src}" alt="" draggable="false"></div>
    <label class="cl-cropz"><span class="lbl">Zoom</span><input type="range" id="cropZ" min="1" max="4" step="0.01" value="1"></label>
    <p class="note">Arrossega la foto i fes zoom fins que quedi ben enquadrada.</p>
    <div class="cl-row"><button type="button" class="btn" id="cropNo">Cancel·la</button><button type="button" class="btn cl-pri" id="cropOk">Desa la foto</button></div>`;
  const F = $("cropF"), I = F.querySelector("img"), Z = $("cropZ"), W = () => F.clientWidth, H = () => F.clientHeight;
  const base = () => Math.max(W() / im.width, H() / im.height); let z = 1, ox = 0, oy = 0;
  const S = () => base() * z;
  function clamp(){ ox = Math.min(0, Math.max(W() - im.width*S(), ox)); oy = Math.min(0, Math.max(H() - im.height*S(), oy)); }
  function paint(){ clamp(); I.style.width = im.width*S() + "px"; I.style.transform = `translate(${ox}px,${oy}px)`; Z.value = z; }
  function zoomTo(nz, cx, cy){ nz = Math.max(1, Math.min(4, nz)); const k = nz / z; ox = cx - (cx - ox)*k; oy = cy - (cy - oy)*k; z = nz; paint(); }
  ox = (W() - im.width*S())/2; oy = (H() - im.height*S())/2; paint();
  const P = new Map(); let st = null;
  F.onpointerdown = e => { F.setPointerCapture(e.pointerId); P.set(e.pointerId, [e.clientX, e.clientY]);
    const v = [...P.values()]; st = v.length === 2 ? {d:Math.hypot(v[0][0]-v[1][0], v[0][1]-v[1][1]), z} : {x:e.clientX, y:e.clientY, ox, oy}; };
  F.onpointermove = e => { if(!P.has(e.pointerId)) return; P.set(e.pointerId, [e.clientX, e.clientY]); const v = [...P.values()], r = F.getBoundingClientRect();
    if(v.length === 2 && st && st.d){ const d = Math.hypot(v[0][0]-v[1][0], v[0][1]-v[1][1]); zoomTo(st.z * d / Math.max(10, st.d), (v[0][0]+v[1][0])/2 - r.left, (v[0][1]+v[1][1])/2 - r.top); return; }
    if(st && st.ox != null){ ox = st.ox + e.clientX - st.x; oy = st.oy + e.clientY - st.y; paint(); } };
  const up = e => { P.delete(e.pointerId); const v = [...P.values()]; st = v.length === 1 ? {x:v[0][0], y:v[0][1], ox, oy} : null; };
  F.onpointerup = up; F.onpointercancel = up;
  F.onwheel = e => { e.preventDefault(); const r = F.getBoundingClientRect(); zoomTo(z * (e.deltaY > 0 ? 1/1.1 : 1.1), e.clientX - r.left, e.clientY - r.top); };
  Z.oninput = () => zoomTo(+Z.value, W()/2, H()/2);
  $("cropNo").onclick = () => { host.innerHTML = prev; done(null); };
  $("cropOk").onclick = () => { try{ const s = S(); done(jpegCrop(im, -ox/s, -oy/s, W()/s, H()/s)); }catch(e){ host.innerHTML = prev; ko(e); } };
}); }
function boatSheet(placeId, boatId){
  const pl = placeId ? placeById(placeId) : null, b = boatId ? D.boats.find(x => x.id === boatId) : D.boats.find(x => x.place === placeId);
  const B = PL().BOATS, own = b && b.propUid === uid(), mgr = canBoatsE(), edit = own || mgr;
  const photoHtml = src => (src ? `<img src="${src}" alt="Foto de l'embarcació">` : "") + (edit ? `<div class="cl-row"><button type="button" class="btn sm" id="shPhotoBtn">${src ? "Canvia la foto" : "Afegeix una foto"}</button>${src ? `<button type="button" class="btn sm" id="shPhotoCrop">Enquadra</button>` : ""}<input type="file" id="shPhotoIn" accept="image/*" hidden></div>` : "");
  const title = b ? (b.label || B[b.t]?.n || "Embarcació") : "Plaça " + ((pl && pl.label) || "");
  const free = mgr ? ((D.planol && D.planol.objs) || []).filter(o => o.k === "place" && !D.boats.some(x => x.place === o.id)) : [];
  const unplaced = mgr && pl && !b ? D.boats.filter(x => !x.place || !placeById(x.place)) : [];
  const body = !b ? `<p class="note">${pl ? `Plaça lliure per a ${esc(B[pl.t]?.n || "")}.` : ""}</p>
      ${unplaced.length ? field("shPut", "Hi poso", `<select class="field" id="shPut"><option value="">Tria una embarcació sense plaça…</option>${unplaced.map(x => `<option value="${esc(x.id)}">${esc((x.label || B[x.t]?.n) + (x.prop ? " · " + x.prop : ""))}</option>`).join("")}</select>`) : ""}
      <button type="button" class="btn cl-pri cl-wide" id="shMine">Hi tinc la meva embarcació</button>`
    : `${b.pendent ? `<div class="cl-pendbox"><span><b>Pendent de validar</b>${own ? " per Manteniment" : " · proposada per " + esc(b.prop || "un soci")}</span>${mgr ? `<button type="button" class="btn sm cl-pri" id="shValid">Valida</button>` : ""}</div>` : ""}
      <div class="cl-binfo">${pl ? `<span><b>Plaça</b> ${esc(pl.label || "")}</span>` : `<span>Sense plaça</span>`}<span>${esc(B[b.t]?.n || "")}</span>${b.vela ? `<span><b>Vela</b> ${esc(b.vela)}</span>` : ""}</div>
      <div class="cl-bstate">${Object.entries(PL().ESTATS).map(([k, T]) => edit ? `<button type="button" class="cl-chip" data-sstate="${k}" aria-pressed="${(b.estat || "lloc") === k}" style="--c:${T.s}">${T.c || T.n}</button>` : (b.estat || "lloc") === k ? `<span class="cl-chip" aria-pressed="true" style="--c:${T.s}">${T.c || T.n}</span>` : "").join("")}</div>
      <div class="cl-bphoto" id="shPhoto">${photoHtml(null)}</div>
      <div class="cl-binfo"><span><b>Propietari/a</b> <span id="shProp">${b.ocult && !edit ? "nom ocult" : esc(b.prop || (b.ocult ? "…" : "—"))}</span></span>${b.coprop ? `<span><b>Amb</b> ${esc(b.coprop)}</span>` : ""}</div>
      ${edit ? `${field("shNotes", "Notes", `<textarea class="field cl-ta" id="shNotes" rows="2" maxlength="500" placeholder="Observacions">${esc(b.notes || "")}</textarea>`)}
        <label class="cl-sw"><span>Amaga el nom del propietari al club</span><input type="checkbox" class="switch" id="shOcult"${b.ocult ? " checked" : ""}></label>` : b.notes ? `<p class="cl-text">${esc(b.notes)}</p>` : ""}
      ${mgr ? `<details><summary class="lbl">Canvia de plaça</summary><div class="cl-row2" style="margin-top:8px">${field("shMove", "Plaça lliure", `<select class="field" id="shMove"><option value="">Tria…</option>${free.map(o => `<option value="${esc(o.id)}">${esc(o.label || "")} · ${esc(B[o.t]?.n || "")}</option>`).join("")}</select>`)}<button type="button" class="btn" id="shOut">Treu de la plaça</button></div></details>` : ""}
      ${edit ? `<details${b.pendent && own ? " open" : ""}><summary class="lbl">Dades de l'embarcació</summary><div style="margin-top:8px;display:flex;flex-direction:column;gap:8px">${dataForm(b)}
        <button type="button" class="btn" id="shData">${mgr ? "Desa les dades" : "Proposa els canvis"}</button>${!mgr ? `<p class="note">Els canvis queden pendents fins que els validi Manteniment.</p>` : ""}</div></details>` : ""}
      ${(b.pendent && own) || mgr ? `<div data-delbox="shDel"></div><button type="button" class="btn sm" id="shDelAsk">${mgr ? (b.pendent ? "Rebutja-la" : "Dona-la de baixa") : "Retira la proposta"}</button>` : ""}
      ${(F => F.length ? `<div class="bs-fets-in"><span class="lbl">Avisos d'aquesta embarcació</span>${F.map(fetRow).join("")}</div>` : "")(D.fets.filter(f => f.boatId === b.id && f.estat !== "tancat"))}
      <div class="cl-row2"><button type="button" class="btn" id="shFet">Avisa d'un fet</button>${!own && b.propUid ? `<button type="button" class="btn" id="shAsk">Pregunta al propietari</button>` : "<span></span>"}</div>
      ${(b.historial || []).length ? `<details><summary class="lbl">Historial (${b.historial.length})</summary><p class="note">${b.historial.slice().reverse().map(x => `${new Date(x.at).toLocaleDateString("ca", {day:"numeric", month:"short"})} · ${esc(x.que)}${x.qui ? " · " + esc(x.qui) : ""}`).join("<br>")}</p></details>` : ""}
      ${edit ? `<button type="button" class="btn cl-pri cl-wide" id="shSave">Desa les notes</button>` : ""}`;
  sheet(title, body, async sh => {
    sh.addEventListener("click", ev => { if(ev.target.closest("[data-close]") || ev.target === sh){ ui.psel = null; drawPlan(); } });
    if(!b){ $("shMine").onclick = () => newBoatSheet(pl); const put = $("shPut"); if(put) put.onchange = () => busy(put, async () => { const x = D.boats.find(y => y.id === put.value); if(!x) return;
      await boatSave(x, {place:pl.id}, "Plaça " + (pl.label || "")); closeSheet(); render(); }); return; }
    // foto (es descarrega només en obrir la fitxa)
    ui.bphoto = null;
    C.F.getDoc(ref("embarcacions", b.id, "foto", "f")).then(d => { const el = $("shPhoto"); if(el && d.exists() && !el.querySelector(".cl-crop")){ ui.bphoto = d.data().data; el.innerHTML = photoHtml(ui.bphoto); bindPhoto(); } }).catch(() => {});
    $("shFet").onclick = () => { closeSheet(); fetNewSheet(b); };
    const ask = $("shAsk"); if(ask) ask.onclick = () => { closeSheet(); fetNewSheet(b); setTimeout(() => { const q = document.querySelector('[data-fkind="pregunta"]'); if(q) q.click(); }, 0); };
    sh.querySelectorAll("[data-fet]").forEach(x => x.onclick = () => fetSheet(x.dataset.fet));
    if(b.ocult && edit) C.F.getDoc(ref("embarcacions", b.id, "privat", "p")).then(d => { if(d.exists() && $("shProp")) $("shProp").textContent = (d.data().prop || "—") + " (ocult al club)"; }).catch(() => {});
    if(!edit) return;
    const va = $("shValid"); if(va) va.onclick = () => busy(va, async () => { await boatSave(b, {pendent:false}, "Validada"); closeSheet(); render(); });
    $("shData").onclick = e => busy(e.currentTarget, async () => { const v = formVals();
      if(v.place && v.place !== b.place && D.boats.some(x => x.place === v.place)) throw {code:"ocupada"};
      const o = v.place && placeById(v.place); await boatSave(b, Object.assign(v, mgr ? {} : {pendent:true}), mgr ? "Dades canviades" + (o && v.place !== b.place ? " · plaça " + (o.label || "") : "") : "Canvis proposats");
      closeSheet(); render(); });
    const da = $("shDelAsk"); if(da) da.onclick = () => { const box = sh.querySelector('[data-delbox="shDel"]'); da.hidden = true;
      slideConfirm(box, mgr && !b.pendent ? "Llisca per donar-la de baixa" : mgr ? "Llisca per rebutjar-la" : "Llisca per retirar-la", async () => {
        try{ await C.F.deleteDoc(ref("embarcacions", b.id, "privat", "p")).catch(() => {}); await C.F.deleteDoc(ref("embarcacions", b.id, "foto", "f")).catch(() => {});
          await TO(C.F.deleteDoc(ref("embarcacions", b.id))); D.boats = D.boats.filter(x => x.id !== b.id); closeSheet(); render(); }catch(err){ sheetSay(errText(err)); } }); };
    sh.querySelectorAll("[data-sstate]").forEach(x => x.onclick = () => busy(x, async () => { const k = x.dataset.sstate; if((b.estat || "lloc") === k) return;
      await boatSave(b, {estat:k}, ESTAT_T(k)); sh.querySelectorAll("[data-sstate]").forEach(y => y.setAttribute("aria-pressed", String(y.dataset.sstate === k))); render(); }));
    // foto: triar-la o tornar a enquadrar l'actual
    const putPhoto = async src => { const host = $("shPhoto"), data = await cropPhoto(host, src); if(!data){ bindPhoto(); return; }
      host.innerHTML = `<p class="note">Desant la foto…</p>`;
      try{ await TO(C.F.setDoc(ref("embarcacions", b.id, "foto", "f"), {data, at:now(), per:uid()})); ui.bphoto = data; }
      catch(err){ sheetSay(errText(err)); }
      host.innerHTML = photoHtml(ui.bphoto); bindPhoto(); };
    function bindPhoto(){ const pb = $("shPhotoBtn"), pin = $("shPhotoIn"), pc = $("shPhotoCrop"); if(!pb) return;
      pb.onclick = () => pin.click(); pin.onchange = async () => { const f = pin.files[0]; if(!f) return; try{ await putPhoto(await readURL(f)); }catch(err){ sheetSay(errText(err)); } };
      if(pc) pc.onclick = async () => { if(ui.bphoto) try{ await putPhoto(ui.bphoto); }catch(err){ sheetSay(errText(err)); } }; }
    bindPhoto();
    $("shSave").onclick = e => busy(e.currentTarget, async () => { await boatSave(b, {notes:$("shNotes").value.slice(0, 500)}); closeSheet(); });
    $("shOcult").onchange = e => busy(e.target, async () => { const on = e.target.checked;
      if(on){ await TO(C.F.setDoc(ref("embarcacions", b.id, "privat", "p"), {prop:b.prop || ""})); await boatSave(b, {ocult:true, prop:""}); }
      else { const d = await C.F.getDoc(ref("embarcacions", b.id, "privat", "p")).catch(() => null), name = d && d.exists() ? d.data().prop || "" : b.prop || "";
        await boatSave(b, {ocult:false, prop:name}); await C.F.deleteDoc(ref("embarcacions", b.id, "privat", "p")).catch(() => {}); } });
    if(mgr){ const mv = $("shMove"); mv.onchange = () => busy(mv, async () => { const o = placeById(mv.value); if(!o) return; await boatSave(b, {place:o.id}, "Plaça " + (o.label || "")); ui.psel = o.id; closeSheet(); render(); });
      $("shOut").onclick = e => busy(e.currentTarget, async () => { await boatSave(b, {place:null}, "Sense plaça"); closeSheet(); render(); }); }
  });
}

function renderBase(){
  const v = vis(), auto = !!window.OV_PRIV?.autoBase();
  return `<details class="card bs-priv" id="bsPriv"${ui.privOpen ? " open" : ""}><summary><span class="lbl">Qui et veu aquí</span><span class="bs-privv">${esc(NIVT(v))}</span></summary>
      <div class="cl-privrow"><b>${esc(NIVT(v))}</b><button type="button" class="btn" id="clPriv">Canvia-ho</button><button class="ib-i" type="button" data-info="iPres" aria-label="Com funciona la presència" aria-expanded="false">i</button></div>
      <label class="cl-sw"><span><b>Marca'm a la base automàticament</b></span><input type="checkbox" class="switch" id="pvAuto"${auto ? " checked" : ""}${v === "ningu" ? " disabled" : ""}></label>
      <div class="vp-info" id="iPres" hidden><p>Només surts mentre ets a la base (amb el botó o automàticament) o navegant (en començar una sortida). S'esborra en acabar la sortida, en marxar o al cap de 24 h.</p><p>Automàticament: després de 10 minuts a menys de 50 m de la base et marca a la base; després de 2 minuts a més de 200 m, et treu. Només amb l'app oberta.</p><p>Navegant, la posició s'actualitza cada 2 minuts. Amb la pantalla apagada, només l'app d'Android la continua enviant. Qui et veu es tria a ⋮ ▸ Privadesa.</p></div></details>`;
}
document.addEventListener("toggle", e => { if(e.target && e.target.id === "bsPriv") ui.privOpen = e.target.open; }, true);
/* ---------- full lliscant (formularis) ---------- */
function closeSheet(){ const s = $("clSheet"); if(s){ s.remove(); window.dispatchEvent(new CustomEvent("ov-sheet-closed")); } }
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
// Ruta per al mur: sencera (de la base a la base) i simplificada a ~150 punts
function routeOf(t){
  const P = (t.pts || []).map(p => p && {lat:+p.lat, lon:+p.lon}).filter(p => p && isFinite(p.lat) && isFinite(p.lon));
  if(P.length < 4) return null;
  const far = Math.max(...P.map(p => hav(P[0], p)));
  if(far < 100) return null;   // no s'ha allunyat ni 100 m: no hi ha ruta per ensenyar
  const Q = P;   // sencera: se surt i s'arriba a la base nàutica, no de casa (decisió de l'Oriol)
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
    <label class="cl-sw"><span><b>${p ? "Mostra la ruta" : "Inclou la ruta"}</b><small class="note">Simplificada a uns 150 punts. Ho pots canviar després.</small></span><input type="checkbox" class="switch" id="shRoute"${p && p.ruta ? " checked" : ""}></label>
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
  sheet("Anuncia sortida", `
    <div class="cl-field"><span class="lbl">Dia</span>
      <div class="cl-row2" role="group" aria-label="Dia">${chip("data-iday", "0", true, "Avui")}${chip("data-iday", "1", false, "Demà")}</div>
      <label class="cl-field" for="shDate"><span class="note">O tria un altre dia, fins a ${INT_DIES} dies</span>
        <input class="field" id="shDate" type="date" value="${ymd(d)}" min="${ymd(d)}" max="${ymd(new Date(now() + INT_DIES*DAY))}"></label></div>
    ${field("shHour", "Hora", `<input class="field" id="shHour" type="time" value="${h}">`)}
    ${field("shAct", "Embarcació", `<select class="field" id="shAct">${Object.keys(DEFAULTS).map(k => `<option value="${k}"${k === act ? " selected" : ""}>${esc(DEFAULTS[k].name)}</option>`).join("")}</select>`)}
    <div class="cl-field"><span class="lbl">Previsió per a aquella hora</span><div class="cl-fitrow" id="shFit"></div></div>
    ${visSelect("intencions", prefOf("intencions"))}
    <p class="note">Qui ho veu s'hi pot apuntar, i veurà aquesta previsió. S'esborra l'endemà.</p>
    <button type="button" class="btn cl-pri cl-wide" id="shSave">Publica</button>`, sh => {
    const fit = () => { const f = $("shFit"); if(f) f.innerHTML = fitHtml(intentFit($("shDate").value, $("shHour").value || "12:00", $("shAct").value)); };
    const mark = () => { const v = $("shDate").value; sh.querySelectorAll("[data-iday]").forEach(b => b.setAttribute("aria-pressed", String(ymd(new Date(now() + (+b.dataset.iday)*DAY)) === v))); fit(); };
    ["shHour", "shAct"].forEach(i => $(i).addEventListener("change", fit)); $("shHour").addEventListener("input", fit); fit();
    sh.addEventListener("click", ev => { const b = ev.target.closest("[data-iday]"); if(!b) return; $("shDate").value = ymd(new Date(now() + (+b.dataset.iday)*DAY)); mark(); });
    $("shDate").addEventListener("change", mark);
    $("shSave").onclick = e => busy(e.currentTarget, async () => {
      const v = $("shDate").value, min = ymd(new Date()), max = ymd(new Date(now() + INT_DIES*DAY));
      if(!v || v < min || v > max){ sheetSay(`Tria un dia d'avui a ${INT_DIES} dies vista.`); return; }
      const day = new Date(v + "T23:59:59");
      const doc = Object.assign({userId:uid(), clubId:C.member.clubId, nom:C.member.nom, act:$("shAct").value, dia:ymd(day), hora:$("shHour").value || "12:00", apuntats:{}, caduca:TS(day.getTime()), creat:C.F.serverTimestamp()}, await visFields($("shVis").value));
      const r = await C.F.addDoc(col("intencions"), doc);
      D.intents.push(Object.assign({id:r.id}, doc, {caduca:day.getTime()})); closeSheet(); if(visible()) render();
    });
  });
}
// Avisos amb «Qui s'apunta»: mapa apuntats = {uid: nom}
const signTxt = n => n === 0 ? "Encara no s'hi ha apuntat ningú" : n === 1 ? "1 persona s'hi apunta" : n + " persones s'hi apunten";
// Qui s'hi apunta o s'hi interessa: el nombre i un (i) que desplega la llista sencera (ui.whoOpen[clau])
function who(key, names, t1, tN, t0){
  const L = names.map(x => typeof x === "string" ? {nom:x} : x).sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0) || String(a.nom).localeCompare(String(b.nom), "ca"));
  const n = L.length, open = n > 0 && !!ui.whoOpen[key];
  return {head:`<span class="cl-wl"><b>${n || "Ningú"}</b> ${n === 1 ? t1 : n ? tN : t0}${n ? `<button type="button" class="ib-i" data-who="${esc(key)}" aria-expanded="${open}" aria-label="${open ? "Amaga" : "Mostra"} la llista de noms">i</button>` : ""}</span>`,
    list: open ? `<ul class="cl-wnames" aria-label="Llista">${L.map(x => `<li${x.me ? ' class="me"' : ""}>${esc(x.me ? "Tu" : x.nom)}</li>`).join("")}</ul>` : ""};
}
const apList = ap => Object.entries(ap || {}).map(([u, nom]) => ({nom, me: u === uid()}));
function signRow(a, attr = "avjoin"){
  const ap = a.apuntats || {}, n = Object.keys(ap).length, on = !!ap[uid()];
  const w = who((attr === "popjoin" ? "pop:" : "avisos:") + a.id, apList(ap), "s'hi apunta", "s'hi apunten", "s'hi ha apuntat encara");
  return `<div class="cl-avsign"><div class="cl-signt">${w.head}</div>
    <button type="button" class="btn cl-go" data-${attr}="${esc(a.id)}" aria-pressed="${on}">${on ? "Hi vas ✓" : "M'hi apunto"}</button>${w.list}</div>`;
}

/* ---------- recordatori en obrir l'app: el dia abans i el mateix dia de les activitats ---------- */
// No hi ha notificacions push: surt quan s'obre l'app (o es torna a ella). Un cop per avís i dia, en aquest mòbil.
const POP_K = "ov2_avis_pop";
function remindEvents(){
  if(!C || (typeof LIVE !== "undefined" && LIVE) || $("clSheet")) return;
  const today = ymd(new Date()), tom = ymd(new Date(now() + DAY)), yest = ymd(new Date(now() - DAY));
  const seen = {}; Object.entries(store.get(POP_K) || {}).forEach(([k, v]) => { if(k.slice(-10) >= yest) seen[k] = v; });
  const L = D.avisos.filter(a => alive(a) && (a.data === today || a.data === tom) && !seen[a.id + "_" + today])
    .sort((a, b) => a.data.localeCompare(b.data));
  if(!L.length){ store.set(POP_K, seen); return; }
  L.forEach(a => seen[a.id + "_" + today] = 1); store.set(POP_K, seen);
  const item = a => { const ap = a.apuntats || {}, on = !!ap[uid()];
    return `<div class="cl-remind c-${esc(a.comissio)}"><span class="lbl">${a.data === today ? "Avui" : "Demà"} · ${esc(COMSm()[a.comissio] || a.comissio)}</span>
      <b>${esc(a.titol)}</b><span class="note">${esc(dayLong(a.data))}</span>
      ${a.inscripcio ? signRow(a, "popjoin") : ""}</div>`; };
  sheet(L.length === 1 ? "Recordatori" : "Recordatoris", `${L.map(item).join("")}
    <div class="cl-row2"><button type="button" class="btn" id="popSee">Veure als avisos</button><button type="button" class="btn cl-pri" data-close>D'acord</button></div>`, d => {
    d.querySelector("#popSee").onclick = () => { closeSheet(); tab = "avisos"; store.set("ov2_club_tab", tab); go("club"); };
    d.addEventListener("click", async e => {
      const wb = e.target.closest("[data-who]");
      if(wb){ ui.whoOpen[wb.dataset.who] = !ui.whoOpen[wb.dataset.who]; const a = D.avisos.find(x => "pop:" + x.id === wb.dataset.who), row = wb.closest(".cl-avsign"); if(a && row) row.outerHTML = signRow(a, "popjoin"); return; }
      const b = e.target.closest("[data-popjoin]"); if(!b) return;
      await mapToggle("avisos", D.avisos, b.dataset.popjoin, "apuntats", C.member.nom);
      const a = D.avisos.find(x => x.id === b.dataset.popjoin), row = b.closest(".cl-avsign");
      if(a && row) row.outerHTML = signRow(a, "popjoin"); });
  });
}
document.addEventListener("visibilitychange", () => {
  if(document.visibilityState !== "visible" || !C) return;
  if(now() - (D.at.avisos || 0) > 15*MIN) loadEvents(); else remindEvents();
});

function avisSheet(a){
  const coms = canPost(), today = ymd(new Date());
  sheet(a ? "Edita l'avís" : "Nou avís", `
    ${a ? `<p class="note" style="margin:0">${esc(COMSm()[a.comissio] || a.comissio)}</p>` : field("shCom", "Comissió", `<select class="field" id="shCom">${coms.map(k => `<option value="${k}">${esc(COMSm()[k])}</option>`).join("")}</select>`)}
    ${field("shTitle", "Títol", `<input class="field" id="shTitle" type="text" maxlength="80" value="${esc(a ? a.titol : "")}" style="font-family:var(--f-body)">`)}
    ${field("shText", "Text", `<textarea class="field cl-ta" id="shText" rows="5" maxlength="600">${esc(a ? a.text : "")}</textarea>`)}
    ${field("shData", "Data de l'activitat <small>(opcional)</small>", `<input class="field" id="shData" type="date" value="${esc(a && a.data || "")}" min="${today}">`)}
    <p class="note">Amb data: surt també a la previsió de 7 dies, l'app ho recorda el dia abans i el mateix dia, i desapareix l'endemà. Sense data: es queda fins que algú amb permís el retiri.</p>
    <label class="cl-sw"><span><b>Fixa'l a dalt</b></span><input type="checkbox" class="switch" id="shPin"${a && a.fixat ? " checked" : ""}></label>
    <label class="cl-sw"><span><b>Pregunta qui s'apunta</b><small class="note">Surt el botó «M'hi apunto» i la llista de qui hi va.</small></span><input type="checkbox" class="switch" id="shSign"${a && a.inscripcio ? " checked" : ""}></label>
    <button type="button" class="btn cl-pri cl-wide" id="shSave">${a ? "Desa els canvis" : "Publica l'avís"}</button>`, () => {
    $("shSave").onclick = e => busy(e.currentTarget, async () => {
      const titol = $("shTitle").value.trim().slice(0, 80), text = $("shText").value.trim().slice(0, 600), data = $("shData").value || null;
      if(!titol || !text){ sheetSay("Cal un títol i un text."); return; }
      if(data && data < today){ sheetSay("La data no pot ser d'abans d'avui."); return; }
      const cadMs = data ? new Date(data + "T23:59:59").getTime() + DAY : null;   // caduca l'endemà de l'activitat
      const f = {titol, text, fixat:$("shPin").checked, inscripcio:$("shSign").checked, data, caduca: cadMs ? TS(cadMs) : null};
      if(a){
        await C.F.updateDoc(ref("avisos", a.id), Object.assign({}, f, {editat:true}));
        Object.assign(a, f, {caduca:cadMs, editat:true});
      } else {
        const doc = Object.assign({userId:uid(), clubId:C.member.clubId, comissio:$("shCom").value, creat:C.F.serverTimestamp(), autorNom:C.member.nom, vist:{}, apuntats:{}}, f);
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
// Repinta un sol element (avís, «Qui surt», anunci) i hi posa l'error al costat; si no hi és, redibuixa la pestanya
function itemHtml(n, id){
  const L = {avisos:D.avisos, intencions:D.intents, anuncis:D.anuncis}[n], x = L && L.find(o => o.id === id);
  return !x ? null : n === "avisos" ? avisCard(x) : n === "intencions" ? intentItem(x) : anCard(x);
}
function paintItem(n, id, err){
  const el = document.querySelector(`#clubView [data-item="${CSS.escape(n + ":" + id)}"]`), h = el && itemHtml(n, id);
  if(!h){ if(visible()) render(); if(err) say(err); return; }
  el.outerHTML = h;
  if(err){ const nw = document.querySelector(`#clubView [data-item="${CSS.escape(n + ":" + id)}"]`); if(nw) nw.insertAdjacentHTML(nw.tagName === "BUTTON" ? "afterend" : "beforeend", `<p class="cl-rerr" role="alert">${esc(err)}</p>`); }
}
// Reaccions: només es redibuixa la fila de la sortida (no els mapes ni el desplaçament); un toc alhora per sortida
const reactBusy = {};
function reactsHtml(p){
  const rc = p.reaccions || {}, my = rc[uid()], cnt = k => Object.values(rc).filter(x => x === k).length;
  return REACTS.map(r => `<button type="button" class="cl-r" data-react="${r.k}" data-pub="${esc(p.id)}" aria-pressed="${my === r.k}" aria-label="${r.l}${cnt(r.k) ? ": " + cnt(r.k) : ""}">${svgI(r.p, 22, r.rot)}${cnt(r.k) ? `<span>${cnt(r.k)}</span>` : ""}</button>`).join("")
    + (p.userId === uid() ? `<button type="button" class="btn sm cl-edit" data-editpub="${esc(p.id)}">Edita</button>` : "");
}
function paintReacts(p, err){
  const g = document.querySelector(`#clubView .cl-reacts[data-rpub="${CSS.escape(p.id)}"]`); if(!g){ render(); return; }
  g.innerHTML = reactsHtml(p);
  const m = g.parentElement.querySelector(".cl-rerr"); if(m) m.remove();
  if(err) g.insertAdjacentHTML("afterend", `<p class="cl-rerr" role="alert">${esc(err)}</p>`);
}
async function react(pid, k){
  const p = D.pubs.find(x => x.id === pid); if(!p || reactBusy[pid]) return;
  reactBusy[pid] = true;
  const before = Object.assign({}, p.reaccions), nv = before[uid()] === k ? null : k;
  p.reaccions = Object.assign({}, before); if(nv) p.reaccions[uid()] = nv; else delete p.reaccions[uid()];
  paintReacts(p);
  try{
    await TO(C.F.updateDoc(ref("publicacions", pid), {["reaccions." + uid()]: nv || C.F.deleteField()}));
    const d = await C.F.getDoc(ref("publicacions", pid)).catch(() => null);   // recompte real (inclou les d'altres)
    if(d && d.exists()) p.reaccions = d.data().reaccions || {};
    paintReacts(p);
  }catch(e){ p.reaccions = before; paintReacts(p, "La reacció no s'ha desat. " + errText(e)); }
  finally{ delete reactBusy[pid]; }
}
async function hideDoc(n, id){
  try{ await TO(C.F.updateDoc(ref(n, id), {amagat:C.F.arrayUnion(C.member.clubId)}));
    const k = {publicacions:"pubs", intencions:"intents", anuncis:"anuncis"}[n]; D[k] = D[k].filter(x => x.id !== id); render(); }
  catch(e){ say(errText(e)); }
}
const busyT = {};
async function mapToggle(n, list, id, field, val){
  const x = list.find(o => o.id === id), k = n + id; if(!x || busyT[k]) return; busyT[k] = 1;
  const before = Object.assign({}, x[field]), on = !before[uid()];
  x[field] = Object.assign({}, before); if(on) x[field][uid()] = val; else delete x[field][uid()]; paintItem(n, id);
  try{
    await TO(C.F.updateDoc(ref(n, id), {[field + "." + uid()]: on ? val : C.F.deleteField()}));
    const d = await C.F.getDoc(ref(n, id)).catch(() => null);   // estat real (inclou el que han fet els altres)
    if(d && d.exists()) Object.assign(x, d.data());
    paintItem(n, id);
  }catch(e){ x[field] = before; paintItem(n, id, "No s'ha desat. " + errText(e)); }
  finally{ delete busyT[k]; }
}
async function interest(id){
  const k = "an" + id; if(busyT[k]) return; busyT[k] = 1;
  const on = !ui.interest[id]; ui.interest[id] = on; paintItem("anuncis", id);
  try{ const r = ref("anuncis", id, "interessats", uid());
    await TO(on ? C.F.setDoc(r, {userId:uid(), nom:C.member.nom}) : C.F.deleteDoc(r)); }
  catch(e){ ui.interest[id] = !on; paintItem("anuncis", id, "No s'ha desat. " + errText(e)); }
  finally{ delete busyT[k]; }
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
  if(ds.who){ ui.whoOpen[ds.who] = !ui.whoOpen[ds.who]; const [n, ...r] = ds.who.split(":"); paintItem(n, r.join(":")); return; }
  if(t.id === "clFetNew"){ fetNewSheet(null); return; }
  if(ds.fet){ fetSheet(ds.fet); return; }
  if(t.id === "clBoatNew"){ newBoatSheet(null); return; }
  if(ds.bvalid){ const b = D.boats.find(x => x.id === ds.bvalid); if(b){ try{ await boatSave(b, {pendent:false}, "Validada"); render(); }catch(err){ say(errText(err)); } } return; }
  if(ds.boat){ const b = D.boats.find(x => x.id === ds.boat); if(b){ ui.psel = b.place || null; drawPlan(); boatSheet(b.place, b.id); } return; }
  if(ds.bstate){ const b = D.boats.find(x => x.id === ds.id); if(!b || (b.estat || "lloc") === ds.bstate) return; try{ await boatSave(b, {estat:ds.bstate}, ESTAT_T(ds.bstate)); render(); }catch(err){ say(errText(err)); } return; }
  if(ds.fview){ filt.view = ds.fview; saveF(); return; }
  if(ds.avopen){ ui.avOpen[ds.avopen] = true; render(); return; }
  if(ds.avfold){ delete ui.avOpen[ds.avfold]; const m = seenAt(); m[ds.avfold] = 0; store.set("ov2_avis_vist", m); render(); return; }
  if(ds.acom){ ui.avisCom = ds.acom; ui.avisOpen = false; render(); return; }
  if(ds.acat){ ui.anCat = ds.acat; ui.anOpen = false; render(); return; }
  if(ds.fold){ const k = ds.fold + "Open"; ui[k] = !ui[k]; render(); return; }
  if(ds.editan){ const a = D.anuncis.find(x => x.id === ds.editan); if(a) anunciSheet(a); return; }
  if(ds.editavis){ const a = D.avisos.find(x => x.id === ds.editavis); if(a) avisSheet(a); return; }
  if(ds.react){ react(ds.pub, ds.react); return; }
  if(ds.join){ mapToggle("intencions", D.intents, ds.join, "apuntats", C.member.nom); return; }
  if(ds.avjoin){ mapToggle("avisos", D.avisos, ds.avjoin, "apuntats", C.member.nom); return; }
  if(ds.seen){ const a = D.avisos.find(x => x.id === ds.seen); setSeenAt(ds.seen, !(a && (a.vist || {})[uid()])); mapToggle("avisos", D.avisos, ds.seen, "vist", true); return; }
  if(ds.interest){ interest(ds.interest); return; }
  if(ds.editpub){ const p = D.pubs.find(x => x.id === ds.editpub); if(p) pubSheet(null, p); return; }
  if(ds.askhide){ const box = document.querySelector(`[data-delbox="${CSS.escape(ds.id)}"]`); if(box) slideConfirm(box, "Llisca per amagar-ho al club", () => hideDoc(ds.askhide, ds.id)); return; }
  if(ds.askdel){ const box = document.querySelector(`[data-delbox="${CSS.escape(ds.id)}"]`); if(box) slideConfirm(box, "Llisca per retirar", () => removeDoc(ds.askdel, ds.id)); return; }
  if(t.id === "clPriv"){ window.OV_PRIV?.open(); return; }
  if(t.id === "clHere"){ try{ await setPres(presDoc("base")); render(); loadAlerts(); }catch(err){ say(errText(err)); } return; }
  if(t.id === "clLeave"){ try{ await delPres(); render(); loadAlerts(); }catch(err){ say(errText(err)); } return; }
  if(ds.resolve){ resolveAlert(ds.resolve); return; }
  if(ds.help){ const a = D.alertes.find(x => x.id === ds.help); if(a) window.OV_SOS?.help(a); return; }
  if(ds.sosopen){ window.OV_SOS?.open(); return; }
  if(t.id === "clNewIntent") intentSheet();
  if(t.id === "clNewAvis") avisSheet(null);
  if(t.id === "clNewAn") anunciSheet(null);
});
document.addEventListener("change", e => { if(e.target.id === "clAll"){ filt.all = e.target.checked; store.set("ov2_club_filt", Object.assign({}, filt, {open:false})); render(); } });
$("actSeg").addEventListener("click", () => { if(visible() && tab === "mur") setTimeout(render, 0); setTimeout(tripBoatUI, 0); });

/* ---------- mur: lliscar per arxivar (→) o esborrar (←), amb «Desfés» ---------- */
let sw = null, undoT = null;
document.addEventListener("pointerdown", e => {
  const art = e.target.closest && e.target.closest("#clubView .cl-swp > .cl-card");
  if(!art || e.button || e.target.closest("button, a, input, select, .cl-rmap, .leaflet-container")) return;
  sw = {art, wrap:art.parentElement, x:e.clientX, y:e.clientY, dx:0, on:false, id:e.pointerId};
}, {passive:true});
document.addEventListener("pointermove", e => {
  if(!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if(!sw.on){
    if(Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)){ sw = null; return; }   // és un desplaçament vertical
    if(Math.abs(dx) < 14) return;
    sw.on = true; try{ sw.art.setPointerCapture(e.pointerId); }catch(err){} sw.art.style.transition = "none";
  }
  sw.dx = dx; sw.art.style.transform = `translateX(${dx}px)`;
  sw.wrap.dataset.dir = dx > 0 ? "arx" : "del"; sw.wrap.classList.toggle("go", Math.abs(dx) > sw.art.offsetWidth*0.35);
});
function swEnd(e){
  if(!sw || e.pointerId !== sw.id) return;
  const s = sw; sw = null; if(!s.on) return;
  const W = s.art.offsetWidth, go = e.type === "pointerup" && Math.abs(s.dx) > W*0.35;
  s.art.style.transition = "transform .2s ease";
  if(!go){ s.art.style.transform = ""; s.wrap.classList.remove("go"); return; }
  s.art.style.transform = `translateX(${s.dx > 0 ? W*1.15 : -W*1.15}px)`;
  setTimeout(() => swipeDone(s.wrap.dataset.sw, s.dx > 0 ? "arx" : "del"), 200);
}
document.addEventListener("pointerup", swEnd);
document.addEventListener("pointercancel", swEnd);
function swipeDone(id, dir){
  const p = D.pubs.find(x => x.id === id); if(!p) return;
  const inArx = filt.view === "arx";
  if(dir === "arx"){ murSet("arx", id, !inArx); undo(inArx ? "Ha tornat al mur" : "Sortida arxivada", () => murSet("arx", id, inArx)); }
  else if(p.userId === uid()){   // la teva: es retira del mur de tothom quan s'acaba el temps de desfer
    murSet("del", id, true);
    undo("Retirada del mur", () => murSet("del", id, false), () => removeDoc("publicacions", id).finally(() => { murSet("del", id, false); murSet("arx", id, false); }));
  }
  else { murSet("del", id, true); undo("Esborrada del teu mur", () => murSet("del", id, false)); }
  render();
}
function undo(txt, onUndo, onCommit){
  flushUndo();
  let el = $("clUndo");
  if(!el){ el = document.createElement("div"); el.id = "clUndo"; el.className = "cl-undo"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(txt)}</span><button type="button" class="btn">Desfés</button>`; el.hidden = false;
  undoT = {commit:onCommit, timer:setTimeout(flushUndo, 6000)};
  el.querySelector("button").onclick = () => { if(!undoT) return; clearTimeout(undoT.timer); undoT = null; el.hidden = true; onUndo(); render(); };
}
function flushUndo(){
  if(!undoT) return;
  const u = undoT; undoT = null; clearTimeout(u.timer);
  const el = $("clUndo"); if(el) el.hidden = true;
  if(u.commit) u.commit();
}
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") flushUndo(); });

/* ---------- actualització en segon pla: el que fan els altres surt sense sortir i tornar ---------- */
const snap = () => JSON.stringify(NEED[tab].map(k => ({pubs:D.pubs, intents:D.intents, avisos:D.avisos, anuncis:D.anuncis, pres:D.pres, planol:D.planol, boats:D.boats, fets:D.fets})[k]).concat([ui.interest, ui.interested]));
setInterval(async () => {
  if(!C || !visible() || document.visibilityState !== "visible" || $("clSheet") || sw || undoT || filt.open
    || Object.keys(busyT).length || Object.keys(reactBusy).length || document.querySelector("#clubView [data-delbox] *")) return;
  const before = snap();
  try{ await Promise.all(NEED[tab].map(fetchK)); }catch(e){ return; }
  if(snap() !== before && visible() && !$("clSheet")) render();
}, 20000);

/* ---------- avisos de seguretat (els detecta avisos.js al mòbil de qui navega) ---------- */
const ALERT_T = {"sense-vent":"Sense vent i lluny", "vent-fort":"Vent massa fort", "onades":"Onades perilloses", "ajuda":"Demana ajuda"};
let atBase = false;
async function loadAlerts(){
  if(!C) return;
  try{
    const L = await getVisible("alertes"), mine = await C.F.getDoc(ref("presencia", uid())).catch(() => null);
    atBase = !!(mine && mine.exists() && mine.data().estat === "base");
    if(atBase) L.push(...await getAll("alertes", W("clubId", "==", C.member.clubId), W("base", "==", true)).catch(() => []));   // ets a la base: també els avisos «+ gent a la base»
    const seen = new Set(), before = new Set(D.alertes.map(a => a.id));
    D.alertes = L.filter(a => ALERT_T[a.tipus] && !a.resolta && a.userId !== uid() && !seen.has(a.id) && seen.add(a.id));
    if(D.at.alertes && D.alertes.some(a => !before.has(a.id))){ try{ navigator.vibrate?.([300, 150, 300]); }catch(e){} }   // avís nou d'algú
    D.at.alertes = now();
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
  if(a.tipus === "ajuda") return `${b} · ha demanat ajuda des de l'aigua`;
  if(a.tipus === "vent-fort") return `${b} · és a l'aigua amb ratxes de ${v} kn`;
  return `${b} · és a l'aigua i s'esperen onades de ${String(v).replace(".", ",")} m`;
}
// Telèfon de qui avisa (members/{uid}/privat/contacte): només el poden llegir la Junta i el permís «Seguretat»
const TEL = {};
const telOf = id => TEL[id] || (TEL[id] = C.F.getDoc(ref("members", id, "privat", "contacte")).then(d => d.exists() ? String(d.data().telefon || "") : "").catch(() => ""));
function fillTels(){ if(!C || !C.isResp) return;
  document.querySelectorAll("a[data-tel]").forEach(a => telOf(a.dataset.tel).then(t => { if(!t) return; a.href = "tel:" + t.replace(/[^+0-9]/g, ""); a.setAttribute("aria-label", "Truca al " + t); a.hidden = false; })); }
function alertBanner(){
  const L = D.alertes.filter(a => a.userId !== uid()).sort((a, b) => ms(b.creat) - ms(a.creat));
  if(L.length && C.isResp) setTimeout(fillTels, 0);
  return L.map(a => `<div class="cl-alert" role="alert">${WARN}<div class="cl-who">
      <b>${esc(a.nom)}: ${esc((ALERT_T[a.tipus] || "").toLowerCase())}</b>
      <span>${esc(alertText(a))} · posició ${esc(ago(ms(a.posAt) || now()))}</span></div>
      <div class="cl-abtns">${(a.ajudants || {})[uid()] ? `<button type="button" class="btn sm cl-pri" data-sosopen="${esc(a.id)}">Mapa</button>` : Object.keys(a.ajudants || {}).length >= 3 ? "" : `<button type="button" class="btn sm cl-pri" data-help="${esc(a.id)}">Vaig a ajudar</button>`}${Object.keys(a.ajudants || {}).length ? `<span class="note cl-helpers">${Object.keys(a.ajudants).length >= 3 ? "Ja hi van 3: " : "Hi va: "}${esc(Object.values(a.ajudants).map(h => h.nom).join(", "))}</span>` : ""}<button type="button" class="btn sm" data-ctab="base">Base</button>${C.isResp ? `<a class="btn sm cl-tel" data-tel="${esc(a.userId)}" hidden>Truca</a>` : ""}${C.isResp || atBase ? `<button type="button" class="btn sm" data-resolve="${esc(a.id)}">Resolta</button>` : ""}</div></div>`).join("");
}
async function resolveAlert(id){
  try{ await TO(C.F.updateDoc(ref("alertes", id), {resolta:true, resoltaPer:uid(), resoltaAt:C.F.serverTimestamp()})); D.alertes = D.alertes.filter(a => a.id !== id); alertDot(); render(); }
  catch(e){ say(errText(e)); }
}
setInterval(() => { if(C && document.visibilityState === "visible") loadAlerts(); }, 60000);
document.addEventListener("visibilitychange", () => { if(C && document.visibilityState === "visible") loadAlerts(); });

/* ---------- pestanya i sessió ---------- */
function tabBtn(){
  const on = !!C || !!accSt(), b = $("tabClub"); if(!b) return;
  b.hidden = !on; document.querySelector(".tabs .in").classList.toggle("n5", on);
  if(!on && visible()) go("fc");
}
window.addEventListener("ov-coms", () => { publishEvents(); if(visible()) render(); });
/* Botó del peu de la previsió: amb sortida en curs, hi torna; soci aprovat, «+ Anuncia sortida»; sense compte, no hi és */
const isRec = () => typeof LIVE !== "undefined" && !!LIVE;
function ctaUpdate(){ const b = $("ctaTrip"); if(b) b.hidden = !isRec() && !C; }
document.addEventListener("click", e => { if(!e.target.closest("#ctaTrip")) return; if(isRec()) go("trip"); else if(C) intentSheet(); });
window.addEventListener("ov-cloud", async () => {
  await ctx(); tabBtn(); ctaUpdate(); autoTick(true); loadAlerts(); if(C) loadEvents(); else { navDot(); window.OV_EVENTS = []; window.dispatchEvent(new CustomEvent("ov-events")); }
  if(C && typeof LIVE !== "undefined" && LIVE) OV_CLUB.tripStart(LIVE);
  else if(C && store.get(TB_K)) tripBoatEnd();   // la sortida es va acabar sense connexió: torna-la a la varada ara
  if(C) ensureBoats().then(tripBoatUI);
  if(C && visible()) load(true); else if(!C && visible()) render();
});
window.addEventListener("mm-view", e => { if(e.detail === "trip" && C) ensureBoats().then(tripBoatUI); });
window.addEventListener("mm-view", e => { if(e.detail === "club"){ if(C){ load(); loadAlerts(); } else if(accSt()) renderWait(); else go("fc"); } else { if(mapObj){ mapObj.remove(); mapObj = null; } clearRouteMaps(); } });

/* ---------- connexió amb trip.js i cloud.js ---------- */
// Dades de les embarcacions per a la Configuració (Compte i Administració): carrega el que falti
async function boatsReady(){
  if(!C) await ctx(); if(!C) return false;
  const need = ["boats", "planol"].filter(k => !D.at[k] || now() - D.at[k] > 30000);
  if(need.length) await TO(Promise.all(need.map(fetchK)));
  return !!PL();
}
function boatRow(b){
  const B = PL().BOATS, pl = placeById(b.place), tn = B[b.t]?.n || "Embarcació";
  return {id:b.id, title:b.label || tn, sub:[b.label ? tn : "", b.vela ? "Vela " + b.vela : "", pl ? "Plaça " + (pl.label || "") : "Sense plaça", b.pendent ? "pendent de validar" : ESTAT_T(b.estat || "lloc").toLowerCase(), b.propUid !== uid() && b.prop ? b.prop : ""].filter(Boolean).join(" · ")};
}
const OV_CLUB = window.OV_CLUB = {
  sheet, closeSheet, autoTick, loadAlerts, cta: ctaUpdate,
  async myBoats(){ if(!(await boatsReady())) return []; return myBoats().map(boatRow); },
  async openBoat(id){ if(await boatsReady().catch(() => false)) boatSheet(null, id); },
  async newBoat(){ if(await boatsReady().catch(() => false)) newBoatSheet(null); },
  // Administració ▸ Base i embarcacions: propostes pendents i recompte (només qui gestiona embarcacions)
  async boatsAdmin(){
    if(!(await boatsReady())) return null;
    const n = k => D.boats.filter(b => !b.pendent && (b.estat || "lloc") === k).length;
    return {can:canBoatsE(), total:D.boats.length, lloc:n("lloc"), navegant:n("navegant"), reparacio:n("reparacio"),
      pend:D.boats.filter(b => b.pendent).map(boatRow), places:((D.planol && D.planol.objs) || []).filter(o => o.k === "place").length};
  },
  ctx: () => C,
  async shareBtn(el, t){
    shareEl = el; shareTrip = t; el.innerHTML = "";
    if(!C || !t || t.owner !== uid()) return;
    let p = D.pubs.find(x => x.id === uid() + "_" + t.id);
    if(!p){ try{ const s = await TO(C.F.getDoc(ref("publicacions", uid() + "_" + t.id)), 8000); if(s.exists()) p = Object.assign({id:s.id}, s.data()); }catch(e){} }
    el.innerHTML = p ? `<button type="button" class="btn cl-wide">Publicada al mur · Edita</button>` : `<button type="button" class="btn cl-pri cl-wide">Comparteix amb el club</button>`;
    el.firstChild.onclick = () => pubSheet(t, p || null);
  },
  async tripStart(Lv){
    if(C && Lv) tripBoatStart();   // l'embarcació, encara que la presència sigui «Ningú»
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
  async tripEnd(){ tripBoatEnd(); if(!C || !D.myPres) return; try{ await delPres(); }catch(e){} },
  async arrived(){ if(!C || vis() === "ningu") return; try{ await setPres(presDoc("base")); }catch(e){} },   // tornada a la base detectada pel GPS
  // Avís de seguretat que el navegant ha decidit enviar (avisos.js). Si a Confidencialitat té «Ningú», s'envia al club:
  // prémer «Avisa el club» és un consentiment explícit. Retorna true quan el núvol l'ha desat.
  async raiseAlert(tipus, valor, p, Lv){
    const v0 = prefOf("avisos"), v = v0 === "ningu" ? "club" : v0;
    if(!C || !Lv) return false;
    const id = uid() + "_" + Lv.start + "_" + tipus;
    try{ await C.F.setDoc(ref("alertes", id), Object.assign({clubId:C.member.clubId, tipus, userId:uid(), nom:C.member.nom, ajudants:{},
      act:String(D.myPres?.act || act), desde:Lv.start, lat:p ? p.lat : HOME[0], lon:p ? p.lon : HOME[1], posAt:now(), valor:num(valor), resolta:false, creat:C.F.serverTimestamp(),
      base: window.OV_PRIV ? OV_PRIV.avisosBase() : true}, await visFields(v))); window.OV_SOS?.own(id); return id; }catch(e){ return false; }
  },
  async clearAlert(tipus, Lv){   // el navegant l'anul·la o acaba la sortida: s'esborra (no cal guardar on era ningú)
    if(!C || !Lv) return;
    const id = uid() + "_" + Lv.start + "_" + tipus; window.OV_SOS?.ownEnd(id);
    C.F.deleteDoc(ref("alertes", id)).catch(() => {});
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
    for(const x of await getAll("avisos", W("clubId", "==", club))) { if(x.userId === me){ await del("avisos", x.id); continue; } if((x.vist || {})[me]) await drop("avisos", x.id, "vist"); if((x.apuntats || {})[me]) await drop("avisos", x.id, "apuntats"); }
    for(const x of await getVisible("anuncis")){
      if(x.userId === me){ for(const i of await getAll("anuncis/" + x.id + "/interessats")) await C.F.deleteDoc(ref("anuncis", x.id, "interessats", i.id)).catch(() => {}); await del("anuncis", x.id); }
      else await C.F.deleteDoc(ref("anuncis", x.id, "interessats", me)).catch(() => {});
    }
    await del("presencia", me);
  }
};
ctaUpdate();
ctx().then(() => { tabBtn(); ctaUpdate(); loadAlerts(); loadEvents(); autoTick(true);
  if(C) fetchK("planol").catch(() => {}); });   // orientació del mar (terral) definida pel club
})();
