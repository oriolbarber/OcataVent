"use strict";
/* ============ Ocata Vent 2 · Administració: socis, rols i permisos ============
   Configuració ▸ Administració. La veu qui té algun permís de gestió (o és administrador):
   · altes     — aprovar, rebutjar o treure l'accés a socis
   · rols      — comissions (Junta, Manteniment, Econòmica) i responsable
   · permisos  — donar i treure aquests permisos a altres socis
   · moderar   — retirar publicacions, «Qui surt» i anuncis d'altres socis
   Ningú no es pot canviar l'estat ni els permisos a si mateix. Les regles de Firestore ho controlen. */
(() => {
const PERMS = {
  altes:   {t:"Altes",    d:"Aprovar o rebutjar altes i treure l'accés."},
  rols:    {t:"Rols i comissions", d:"Crear, reanomenar i eliminar comissions, assignar-hi persones i nomenar responsables."},
  permisos:{t:"Permisos", d:"Donar i treure aquests permisos a altres persones sòcies."},
  moderar: {t:"Moderar",  d:"Retirar publicacions, «Qui surt» i anuncis d'altres persones."},
  avisos:  {t:"Fer avisos", d:"Publicar avisos al Club en nom de les comissions de què forma part."}
};
const COMS0 = {junta:"Junta", manteniment:"Manteniment", economica:"Econòmica"};
let COMS = COMS0, CLUBNOM = "";
const slug = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "comissio";
const ESTAT = {aprovat:"Aprovat", pendent:"Pendent", rebutjat:"No aprovat"};
let C = null, members = [], cerca = "", loadedAt = 0;
const has = p => !!(C && C.perms.includes(p));
const gestor = () => has("altes") || has("rols") || has("permisos");
const ref = id => C.F.doc(C.db, "members", id);
const say = t => { const m = $("admMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } };
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
function badge(){ const n = has("altes") ? members.filter(m => m.estat === "pendent").length : 0; $("themeBtn").classList.toggle("has-dot", n > 0); }

/* ---------- secció de la configuració ---------- */
function rolesTxt(m){
  const r = (m.comissions || []).map(k => COMS[k]).filter(Boolean);
  if(m.responsable) r.push("Responsable");
  const p = (m.permisos || []).map(k => PERMS[k]?.t).filter(Boolean);
  return [ESTAT[m.estat] || m.estat].concat(r).concat(p.length ? ["Permisos: " + p.join(", ")] : []).join(" · ");
}
function render(){
  const sec = $("admSec"), body = $("admBody"); if(!sec || !body) return;
  sec.hidden = !(C && (gestor() || has("moderar") || has("avisos"))); if(sec.hidden) return;
  const pend = members.filter(m => m.estat === "pendent");
  $("peekAdm").textContent = C.isAdm ? "Administració" + (pend.length ? " · " + pend.length + " pendents" : "") : "Permisos: " + C.perms.map(k => PERMS[k]?.t).join(", ");
  if(!gestor()){ body.innerHTML = [has("moderar") ? `Tens el permís de moderar: al Club, a les publicacions, «Qui surt» i anuncis d'altres persones hi veuràs el botó «Retira».` : "", has("avisos") ? `Tens el permís de fer avisos: al Club ▸ Avisos hi veuràs «+ Nou avís» per a les teves comissions.` : ""].filter(Boolean).map(t => `<p class="note" style="margin:0">${t}</p>`).join(""); return; }
  const q = cerca.trim().toLowerCase(), L = members.filter(m => m.estat !== "pendent" && (!q || String(m.nom).toLowerCase().includes(q) || String(m.email).toLowerCase().includes(q)));
  const row = (m, extra) => `<div class="acc-row adm-row"><button type="button" class="adm-open" data-adm="${esc(m.userId)}"><b>${esc(m.nom)}${m.userId === C.user.uid ? " (tu)" : ""}</b><span>${esc(m.email)}</span><small>${esc(rolesTxt(m))}</small></button>${extra || ""}</div>`;
  body.innerHTML = `<div class="msg err" id="admMsg" hidden></div>
    ${has("altes") ? `<span class="lbl">Altes pendents · ${pend.length}</span>
      ${pend.map(m => row(m, `<div class="acc-btns"><button class="btn sm cl-pri" type="button" data-admset="aprovat" data-uid="${esc(m.userId)}">Aprova</button><button class="btn sm danger" type="button" data-admset="rebutjat" data-uid="${esc(m.userId)}">Rebutja</button></div>`)).join("") || `<p class="note">No n'hi ha cap.</p>`}` : ""}
    <span class="lbl">Persones sòcies · ${members.filter(m => m.estat === "aprovat").length} amb alta</span>
    <input class="field" id="admCerca" type="search" placeholder="Cerca per nom o correu" autocomplete="off" value="${esc(cerca)}" style="font-family:var(--f-body)">
    <div class="adm-list">${L.map(m => row(m)).join("") || `<p class="note">Ningú.</p>`}</div>
    ${has("rols") ? `<span class="lbl">Comissions · ${Object.keys(COMS).length}</span>
      <div class="adm-coms">${Object.entries(COMS).map(([k, t]) => `<div class="adm-com"><input class="field" type="text" maxlength="40" value="${esc(t)}" data-comname="${esc(k)}" aria-label="Nom de la comissió" style="font-family:var(--f-body)">
        ${k === "junta" ? `<span class="note">No es pot eliminar</span>` : `<button class="btn sm" type="button" data-comdel="${esc(k)}">Elimina</button>`}</div>
        <div data-combox="${esc(k)}"></div>`).join("")}
        <div class="adm-com"><input class="field" type="text" maxlength="40" id="admNewCom" placeholder="Nova comissió" style="font-family:var(--f-body)"><button class="btn sm cl-pri" type="button" id="admAddCom">Afegeix</button></div></div>
      <p class="note">El nom nou es desa en sortir del camp. Si elimines una comissió, desapareix de la llista; els seus avisos es queden fins que caduquen.</p>` : ""}
    <div class="vp-more"><button class="ib-i" type="button" data-info="iAdm" aria-label="Què permet cada permís" aria-expanded="false">i</button>
      <div class="vp-info" id="iAdm" hidden>${Object.values(PERMS).map(p => `<p><b>${p.t}:</b> ${esc(p.d)}</p>`).join("")}<p>Toca una persona per canviar-ne l'estat, les comissions i els permisos. Ningú no pot canviar el seu propi estat ni els seus permisos. L'administració inicial els té tots.</p></div></div>
    <button class="btn sm" type="button" id="admReload">Actualitza la llista</button>
    ${C.isAdm || C.isPremium ? `<a class="btn cl-pri cl-wide" href="gestio.html">Obre la web de gestió del club</a>${C.isAdm ? `<a class="btn cl-wide" href="admin.html">Administració global (tots els clubs)</a>` : ""}` : ""}`;
}

/* ---------- fitxa d'un soci ---------- */
function openMember(id){
  const m = members.find(x => x.userId === id); if(!m || !window.OV_CLUB?.sheet) return;
  const self = id === C.user.uid, tog = (attr, k, on, t) => `<button class="btn sm" type="button" ${attr}="${k}" aria-pressed="${on}">${esc(t)}</button>`;
  OV_CLUB.sheet(m.nom, `
    <p class="note" style="margin:0">${esc(m.email)} · ${esc(ESTAT[m.estat] || m.estat)}</p>
    ${has("rols") && m.estat === "aprovat" ? `<div class="adm-grp"><span class="lbl">Comissions i rol</span><div class="acc-roles">${Object.entries(COMS).map(([k, t]) => tog("data-mcom", k, (m.comissions || []).includes(k), t)).join("")}${tog("data-mresp", "1", !!m.responsable, "Responsable")}</div>
      <p class="note">Per publicar avisos d'una comissió cal formar-ne part i tenir el permís «Fer avisos». Les persones responsables i la Junta poden marcar com a resolts els avisos de seguretat.</p></div>` : ""}
    ${has("permisos") && m.estat === "aprovat" ? `<div class="adm-grp"><span class="lbl">Permisos</span>${self ? `<p class="note">No pots canviar els teus propis permisos.</p>` :
      `<div class="adm-perms">${Object.entries(PERMS).map(([k, p]) => `<label class="cl-sw"><span><b>${p.t}</b><small class="note">${esc(p.d)}</small></span><input type="checkbox" class="switch" data-mperm="${k}"${(m.permisos || []).includes(k) ? " checked" : ""}></label>`).join("")}</div>`}</div>` : ""}
    ${has("altes") && !self ? `<div class="adm-grp"><span class="lbl">Accés</span>${m.estat === "aprovat" ? `<div id="admRevoke"></div>` : `<button class="btn cl-pri cl-wide" type="button" data-mestat="aprovat">Aprova</button>`}</div>` : ""}`, d => {
    const rev = $("admRevoke"); if(rev) slideConfirm(rev, "Llisca per treure l'accés", () => update(id, {estat:"rebutjat", revisatPer:C.user.uid, revisatAt:C.F.serverTimestamp()}, true));
    d.addEventListener("click", e => {
      const b = e.target.closest("button"); if(!b) return;
      if(b.dataset.mcom){ const c = (m.comissions || []).filter(k => COMS[k]);   /* les comissions eliminades es treuen */ update(id, {comissions: c.includes(b.dataset.mcom) ? c.filter(x => x !== b.dataset.mcom) : c.concat([b.dataset.mcom])}); }
      if(b.dataset.mresp) update(id, {responsable: !m.responsable});
      if(b.dataset.mestat) update(id, {estat:b.dataset.mestat, revisatPer:C.user.uid, revisatAt:C.F.serverTimestamp()}, true);
    });
    d.addEventListener("change", e => { const k = e.target.dataset.mperm; if(!k) return; const P = m.permisos || [];
      update(id, {permisos: e.target.checked ? P.filter(x => x !== k).concat([k]) : P.filter(x => x !== k)}); });
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
  const t = e.target.closest && e.target.closest("#admBody button"); if(!t || !C || t.classList.contains("ib-i")) return;
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
$("themeBtn").addEventListener("click", () => { if(!$("viewPanel").hidden && C){ render(); load(); } });
window.addEventListener("ov-cloud", async () => { await ctx(); render(); load(true); loadComs(); });
ctx().then(() => { render(); load(true); loadComs(); });
})();
