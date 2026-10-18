"use strict";
/* ============ Ocata Vent 2 · Administració: socis, rols i permisos ============
   ⋮ ▸ Administració Club. La veu qui té algun permís de gestió (o és administrador):
   · altes     — aprovar, rebutjar o treure l'accés a socis
   · rols      — comissions (Junta, Manteniment, Econòmica)
   · permisos  — donar i treure aquests permisos a altres socis
   · moderar   — retirar publicacions, «Qui surt» i anuncis d'altres socis
   Ningú no es pot canviar l'estat ni els permisos a si mateix. Les regles de Firestore ho controlen. */
(() => {
const PERMS = {
  altes:   {t:"Altes",    d:"Aprovar o rebutjar altes i treure l'accés."},
  rols:    {t:"Rols i comissions", d:"Crear, reanomenar i eliminar comissions i rols, i assignar-hi persones."},
  permisos:{t:"Permisos", d:"Donar i treure aquests permisos a altres persones sòcies."},
  moderar: {t:"Moderar",  d:"Retirar publicacions, «Qui surt» i anuncis d'altres persones."},
  seguretat:{t:"Seguretat", d:"Marcar com a resolts els avisos de seguretat en ruta (sense vent, vent fort, onades)."},
  avisos:  {t:"Fer avisos", d:"Publicar avisos al Club en nom de les comissions de què forma part."},
  planol:  {t:"Plànol", d:"Dibuixar el plànol de la base: places, edificis, zones i punts. La Junta també ho pot fer."},
  embarcacions:{t:"Embarcacions", d:"Donar d'alta i de baixa embarcacions, assignar-les a les places i posar-ne el propietari. Manteniment també ho pot fer."}
};
const COMS0 = {junta:"Junta", manteniment:"Manteniment", economica:"Econòmica"};
let COMS = COMS0, CLUBNOM = "";
const slug = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "comissio";
const ESTAT = {aprovat:"Aprovat", pendent:"Pendent", rebutjat:"No aprovat"};
let C = null, members = [], cerca = "", loadedAt = 0;
const has = p => !!(C && C.perms.includes(p));
const gestor = () => has("altes") || has("rols") || has("permisos");
const ref = id => C.F.doc(C.db, "members", id);
let lastMsg = "";
const say = t => { lastMsg = t || ""; document.querySelectorAll("[data-admmsg]").forEach(m => { m.textContent = lastMsg; m.hidden = !lastMsg; }); };
const msgDiv = () => `<div class="msg err" data-admmsg${lastMsg ? "" : " hidden"}>${esc(lastMsg)}</div>`;
const ERRS = {"permission-denied":"El núvol ho ha refusat (permís). Comprova que tens aquest permís i que les regles estan publicades.", "unavailable":"Sense connexió amb el núvol."};
const errText = e => ERRS[e && e.code] || "No s'ha pogut fer" + (e && e.code ? " (" + e.code + ")." : ".");

async function ctx(){ C = window.OV_CLOUD?.ctx ? await window.OV_CLOUD.ctx().catch(() => null) : null; return C; }
// Comissions del club: les llegeix qualsevol soci aprovat (club.js les fa servir als avisos)
async function loadComs(){
  if(!C) return;
  try{ const d = await C.F.getDoc(C.F.doc(C.db, "clubs", C.member.clubId)); COMS = d.exists() && d.data().comissions ? d.data().comissions : COMS0; CLUBNOM = d.exists() ? d.data().nom || "" : ""; }
  catch(e){ COMS = COMS0; }
  window.OV_COMS = COMS; window.dispatchEvent(new CustomEvent("ov-coms")); render();
}
async function saveComs(next){
  try{
    await C.F.setDoc(C.F.doc(C.db, "clubs", C.member.clubId), {...(CLUBNOM ? {nom:CLUBNOM} : {}), comissions:next, actualitzat:C.F.serverTimestamp(), actualitzatPer:C.user.uid});
    COMS = next; window.OV_COMS = next; window.dispatchEvent(new CustomEvent("ov-coms")); render();
  }catch(e){ say(errText(e)); }
}
async function load(force){
  if(!C || !gestor() || (!force && Date.now() - loadedAt < 30000)) return;
  try{
    const qs = await C.F.getDocs(C.F.query(C.F.collection(C.db, "members"), C.F.where("clubId", "==", C.member.clubId)));
    members = qs.docs.map(d => d.data()).sort((a, b) => String(a.nom).localeCompare(String(b.nom), "ca"));
    loadedAt = Date.now(); say("");
  }catch(e){ say(errText(e)); }
  badge(); render();
}
// Puntet vermell (engranatge de la configuració i capçalera «Administració») si hi ha altes pendents i tens el permís «altes»
function badge(){
  const n = C && has("altes") ? members.filter(m => m.estat === "pendent").length : 0;
  window.OV_CFG?.badge("adm", n);
}
// Escolta en directe les altes pendents del club: el puntet apareix sense haver d'obrir la configuració
let unsub = null, watchKey = "";
function watch(){
  const key = C && has("altes") ? C.user.uid + "|" + C.member.clubId : "";
  if(key === watchKey) return;
  if(unsub){ try{ unsub(); }catch(e){} unsub = null; }
  watchKey = key; if(!key) return;
  unsub = C.F.onSnapshot(C.F.query(C.F.collection(C.db, "members"), C.F.where("clubId", "==", C.member.clubId), C.F.where("estat", "==", "pendent")), qs => {
    const pend = qs.docs.map(d => d.data()), ids = new Set(pend.map(m => m.userId));
    members = members.filter(m => m.estat !== "pendent" || ids.has(m.userId));
    pend.forEach(m => { const i = members.findIndex(x => x.userId === m.userId); if(i < 0) members.push(m); else members[i] = m; });
    members.sort((a, b) => String(a.nom).localeCompare(String(b.nom), "ca"));
    badge();
    if(!$("admSocisBody")?.contains(document.activeElement)) render();   // no trenquis la cerca mentre s'escriu
  }, () => { watchKey = ""; unsub = null; });
}

/* ---------- secció de la configuració ---------- */
function rolesTxt(m){
  const r = (m.comissions || []).map(k => COMS[k]).filter(Boolean);
  const p = (m.permisos || []).map(k => PERMS[k]?.t).filter(Boolean);
  return [ESTAT[m.estat] || m.estat].concat(r).concat(p.length ? ["Permisos: " + p.join(", ")] : []).join(" · ");
}
const CHEV = `<svg class="cfg-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
const SHIELD = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/></svg>`;
const goRow = (pg, t, sub, extra) => `<button type="button" class="cfg-row" data-cfg="${pg}"><span class="cfg-rt"><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${extra || ""}${CHEV}</button>`;
const canBase = () => has("embarcacions") || has("planol") || !!(C && (C.member.comissions || []).some(k => k === "manteniment" || k === "junta"));
// ⋮ ▸ Administració Club: una pantalla amb els apartats i una subpantalla per a cadascun
function render(){
  const sec = $("admSec"), body = $("admBody"); if(!sec || !body) return;
  sec.hidden = !(C && (gestor() || has("moderar") || has("avisos") || has("embarcacions"))); if(sec.hidden) return;
  const pend = members.filter(m => m.estat === "pendent"), apr = members.filter(m => m.estat === "aprovat").length;
  const rol = C.isAdm ? "Administració" : C.isPremium ? "Premium · gestiones el club" : "Permisos: " + C.perms.map(k => PERMS[k]?.t).filter(Boolean).join(", ");
  $("peekAdm").textContent = C.isAdm ? "Administració" + (pend.length ? " · " + pend.length + " pendents" : "") : rol;
  const notes = gestor() ? [] : [has("moderar") ? `Tens el permís de moderar: al Club, a les publicacions, «Qui surt» i anuncis d'altres persones hi veuràs el botó «Retira».` : "", has("avisos") ? `Tens el permís de fer avisos: al Club ▸ Avisos hi veuràs «+ Nou avís» per a les teves comissions.` : ""].filter(Boolean);
  body.innerHTML = msgDiv() + `<div class="cfg-grp"><div class="cfg-prof"><span class="cfg-ic">${SHIELD}</span><div class="acc-who" style="flex:1"><b>${esc(CLUBNOM || C.member.clubId)}</b><span>${esc(rol)}</span></div></div></div>
    ${gestor() || canBase() ? `<div class="cfg-grp">
      ${gestor() ? goRow("adm-socis", "Socis i altes", `${apr} amb alta` + (has("altes") ? ` · ${pend.length} ${pend.length === 1 ? "pendent" : "pendents"}` : ""), has("altes") && pend.length ? `<span class="cfg-badge">${pend.length}</span>` : "") : ""}
      ${has("rols") ? goRow("adm-coms", "Comissions", Object.values(COMS).join(", ")) : ""}
      ${goRow("adm-rols", "Rols i permisos", "Què permet cada permís")}
      ${canBase() ? goRow("adm-base", "Base i embarcacions", "Propostes per validar i plànol") : ""}
    </div>` : ""}
    ${notes.map(t => `<p class="note">${t}</p>`).join("")}
    ${C.isAdm || C.isPremium ? `<div class="cfg-grp"><a class="cfg-row" href="gestio.html"><span class="cfg-rt"><b>Web de gestió del club</b><small>Socis, rols, comissions i plànol, millor des de l'ordinador</small></span>${CHEV}</a>${C.isAdm ? `<a class="cfg-row" href="admin.html"><span class="cfg-rt"><b>Administració global</b><small>Tots els clubs i usuaris</small></span>${CHEV}</a>` : ""}</div>` : ""}`;
  renderSocis(); renderComs(); renderRols();
  if(window.OV_CFG?.isOpen("adm-base")) renderBase();
}
function renderSocis(){
  const el = $("admSocisBody"); if(!el || !C) return;
  if(!gestor()){ el.innerHTML = `<p class="note">No tens permís per veure els socis.</p>`; return; }
  const pend = members.filter(m => m.estat === "pendent");
  const q = cerca.trim().toLowerCase(), L = members.filter(m => m.estat !== "pendent" && (!q || String(m.nom).toLowerCase().includes(q) || String(m.email).toLowerCase().includes(q)));
  const row = (m, extra) => `<div class="acc-row adm-row"><button type="button" class="adm-open" data-adm="${esc(m.userId)}"><b>${esc(m.nom)}${m.userId === C.user.uid ? " (tu)" : ""}</b><span>${esc(m.email)}</span><small>${esc(rolesTxt(m))}</small></button>${extra || ""}</div>`;
  el.innerHTML = msgDiv() + `
    ${has("altes") ? `<span class="lbl cfg-h">Altes pendents · ${pend.length}</span>
      ${pend.length ? `<div class="cfg-grp">${pend.map(m => row(m, `<div class="acc-btns"><button class="btn sm cl-pri" type="button" data-admset="aprovat" data-uid="${esc(m.userId)}">Aprova</button><button class="btn sm danger" type="button" data-admset="rebutjat" data-uid="${esc(m.userId)}">Rebutja</button></div>`)).join("")}</div>` : `<p class="note">No n'hi ha cap.</p>`}` : ""}
    <span class="lbl cfg-h">Persones sòcies · ${members.filter(m => m.estat === "aprovat").length} amb alta</span>
    <input class="field" id="admCerca" type="search" placeholder="Cerca per nom o correu" autocomplete="off" value="${esc(cerca)}" style="font-family:var(--f-body)" aria-label="Cerca per nom o correu">
    ${L.length ? `<div class="cfg-grp adm-list">${L.map(m => row(m)).join("")}</div>` : `<p class="note">Ningú.</p>`}
    <p class="note">Toca una persona per veure'n l'estat, les comissions i els permisos.</p>
    <button class="btn sm" type="button" id="admReload">Actualitza la llista</button>`;
}
function renderComs(){
  const el = $("admComsBody"); if(!el || !C) return;
  if(!has("rols")){ el.innerHTML = `<p class="note">No tens permís per canviar les comissions.</p>`; return; }
  if(el.contains(document.activeElement) && document.activeElement.matches("input")) return;   // mentre s'escriu un nom
  el.innerHTML = msgDiv() + `<div class="cfg-grp" style="padding:12px 14px"><div class="adm-coms">${Object.entries(COMS).map(([k, t]) => `<div class="adm-com"><input class="field" type="text" maxlength="40" value="${esc(t)}" data-comname="${esc(k)}" aria-label="Nom de la comissió" style="font-family:var(--f-body)">
        ${k === "junta" ? `<span class="note">No es pot eliminar</span>` : `<button class="btn sm" type="button" data-comdel="${esc(k)}">Elimina</button>`}</div>
        <div data-combox="${esc(k)}"></div>`).join("")}
      <div class="adm-com"><input class="field" type="text" maxlength="40" id="admNewCom" placeholder="Nova comissió" style="font-family:var(--f-body)" aria-label="Nom de la comissió nova"><button class="btn sm cl-pri" type="button" id="admAddCom">Afegeix</button></div></div></div>
    <p class="note">El nom nou es desa en sortir del camp. Si elimines una comissió, desapareix de la llista; els seus avisos es queden fins que caduquen.</p>`;
}
function renderRols(){
  const el = $("admRolsBody"); if(!el || !C) return;
  el.innerHTML = `<div class="cfg-grp">${Object.entries(PERMS).map(([k, p]) => `<div class="cfg-row" style="cursor:default"><span class="cfg-rt"><b>${esc(p.t)}${has(k) ? ` <small class="note">· el tens</small>` : ""}</b><small>${esc(p.d)}</small></span></div>`).join("")}</div>
    <p class="note">Ningú no pot canviar el seu propi estat ni els seus permisos. L'administració inicial els té tots; premium, tots dins del seu club.</p>
    ${C.isAdm || C.isPremium ? `<p class="note">Els rols (paquets de permisos amb nom) i qui els té es gestionen a la web de gestió.</p><a class="btn cl-pri cl-wide" href="gestio.html">Obre la web de gestió</a>` : `<p class="note">Els rols i els permisos es gestionen a la web de gestió del club.</p>`}`;
}
async function renderBase(){
  const el = $("admBaseBody"); if(!el || !C) return;
  if(!el.childElementCount) el.innerHTML = `<p class="note">Carregant…</p>`;
  let A = null; try{ A = await window.OV_CLUB?.boatsAdmin(); }catch(e){ A = null; }
  if(!A){ el.innerHTML = `<p class="note">No s'han pogut carregar les embarcacions.</p>`; return; }
  el.innerHTML = `<div class="cfg-grp"><div class="cfg-row" style="cursor:default"><span class="cfg-rt"><b>${A.total} ${A.total === 1 ? "embarcació" : "embarcacions"} · ${A.places} ${A.places === 1 ? "plaça" : "places"}</b><small>${A.lloc} a la varada · ${A.navegant} navegant · ${A.reparacio} en reparació</small></span></div></div>
    ${A.can ? `<span class="lbl cfg-h">Pendents de validar · ${A.pend.length}</span>
      ${A.pend.length ? `<div class="cfg-grp">${A.pend.map(b => `<button type="button" class="cfg-row" data-admboat="${esc(b.id)}"><span class="cfg-rt"><b>${esc(b.title)}</b><small>${esc(b.sub)}</small></span>${CHEV}</button>`).join("")}</div><p class="note">Toca-la per revisar-la i validar-la.</p>` : `<p class="note">No n'hi ha cap.</p>`}` : `<p class="note">Per validar embarcacions cal el permís «Embarcacions» o ser de Manteniment.</p>`}
    <p class="note">El plànol (places, edificis i zones) es dibuixa a la web de gestió ▸ Plànol. L'estat de cada embarcació es veu a Club ▸ Base.</p>
    ${C.isAdm || C.isPremium ? `<a class="btn cl-wide" href="gestio.html">Obre la web de gestió</a>` : ""}`;
}
window.addEventListener("ov-cfg", e => { const k = e.detail && e.detail.pg;
  if(k === "adm-base") renderBase();
  if(k && k.startsWith("adm") && C){ render(); load(); } });
window.addEventListener("ov-sheet-closed", () => { if(window.OV_CFG?.isOpen("adm-base")) renderBase(); });

/* ---------- fitxa d'un soci ---------- */
function openMember(id){
  const m = members.find(x => x.userId === id); if(!m || !window.OV_CLUB?.sheet) return;
  const self = id === C.user.uid, tog = (attr, k, on, t) => `<button class="btn sm" type="button" ${attr}="${k}" aria-pressed="${on}">${esc(t)}</button>`;
  OV_CLUB.sheet(m.nom, `
    <p class="note" style="margin:0">${esc(m.email)} · ${esc(ESTAT[m.estat] || m.estat)}</p>
    ${has("rols") && m.estat === "aprovat" ? `<div class="adm-grp"><span class="lbl">Comissions i rol</span><div class="acc-roles">${Object.entries(COMS).map(([k, t]) => tog("data-mcom", k, (m.comissions || []).includes(k), t)).join("")}</div>
      <p class="note">Per publicar avisos d'una comissió cal formar-ne part i tenir el permís «Fer avisos».</p></div>` : ""}
    ${m.estat === "aprovat" ? `<div class="adm-grp"><span class="lbl">Rols i permisos</span><p class="note">${m.premium ? "Premium: ho pot fer tot dins del club." : "Pot: " + esc((m.permisos || []).map(k => PERMS[k]?.t).filter(Boolean).join(", ") || "res especial")}</p>
      ${C.isAdm || C.isPremium ? `<a class="btn cl-wide" href="gestio.html">Canvia rols i permisos a la web de gestió</a>` : `<p class="note">Els rols i els permisos es gestionen a la web de gestió del club.</p>`}</div>` : ""}
    ${has("altes") && !self ? `<div class="adm-grp"><span class="lbl">Accés</span>${m.estat === "aprovat" ? `<div id="admRevoke"></div>` : `<button class="btn cl-pri cl-wide" type="button" data-mestat="aprovat">Aprova</button>`}</div>` : ""}`, d => {
    const rev = $("admRevoke"); if(rev) slideConfirm(rev, "Llisca per treure l'accés", () => update(id, {estat:"rebutjat", revisatPer:C.user.uid, revisatAt:C.F.serverTimestamp()}, true));
    d.addEventListener("click", e => {
      const b = e.target.closest("button"); if(!b) return;
      if(b.dataset.mcom){ const c = (m.comissions || []).filter(k => COMS[k]);   /* les comissions eliminades es treuen */ update(id, {comissions: c.includes(b.dataset.mcom) ? c.filter(x => x !== b.dataset.mcom) : c.concat([b.dataset.mcom])}); }
      if(b.dataset.mestat) update(id, {estat:b.dataset.mestat, revisatPer:C.user.uid, revisatAt:C.F.serverTimestamp()}, true);
    });
  });
}
async function update(id, patch, close){
  const m = members.find(x => x.userId === id); if(!m) return;
  try{
    await C.F.updateDoc(ref(id), patch);
    Object.assign(m, patch, patch.revisatAt ? {revisatAt:Date.now()} : {});
    if(id === C.user.uid) await window.OV_CLOUD.reread();
    badge(); render();
    if(close) window.OV_CLUB?.closeSheet(); else openMember(id);
  }catch(e){ const s = $("shMsg"); if(s){ s.textContent = errText(e); s.hidden = false; } else say(errText(e)); }
}

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#admBody button, #admSocisBody button, #admComsBody button, #admBaseBody button"); if(!t || !C || t.classList.contains("ib-i") || t.hasAttribute("data-cfg")) return;
  if(t.dataset.admboat){ window.OV_CLUB?.openBoat(t.dataset.admboat); return; }
  if(t.dataset.adm) openMember(t.dataset.adm);
  else if(t.dataset.admset) update(t.dataset.uid, {estat:t.dataset.admset, revisatPer:C.user.uid, revisatAt:C.F.serverTimestamp()}, true);
  else if(t.id === "admReload") load(true);
  else if(t.id === "admAddCom"){ const n = ($("admNewCom")?.value || "").trim(); if(!n) return; let k = slug(n), i = 2; while(COMS[k]) k = slug(n) + "-" + i++;
    saveComs(Object.assign({}, COMS, {[k]: n.slice(0, 40)})); }
  else if(t.dataset.comdel){ const k = t.dataset.comdel, box = document.querySelector(`[data-combox="${CSS.escape(k)}"]`);
    if(box) slideConfirm(box, "Llisca per eliminar " + (COMS[k] || ""), () => { const n = Object.assign({}, COMS); delete n[k]; saveComs(n); }); }
});
document.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.comname; if(!k || !C) return; const v = e.target.value.trim().slice(0, 40);
  if(v && v !== COMS[k]) saveComs(Object.assign({}, COMS, {[k]: v})); else e.target.value = COMS[k]; });
document.addEventListener("input", e => { if(e.target.id !== "admCerca") return; cerca = e.target.value; const pos = e.target.selectionStart; render(); const i = $("admCerca"); if(i){ i.focus(); try{ i.setSelectionRange(pos, pos); }catch(err){} } });
window.addEventListener("ov-cloud", async () => { await ctx(); render(); badge(); watch(); load(true); loadComs(); });
ctx().then(() => { render(); watch(); load(true); loadComs(); });
})();
