"use strict";
/* ============ Ocata Vent 2 · Confidencialitat i amics ============
   Configuració ▸ Confidencialitat: qui veu cada cosa (tothom, el club, amics o ningú).
   Avisos de seguretat: a més, «+ gent a la base nàutica» (els socis que en aquell moment hi són).
   Amics mutus: botó d'afegir amic a la part inferior dreta del Club.
   Les preferències es desen a members/{uid}.privacitat; els amics, a amistats/{uidMenor}_{uidMajor}.
   Els avisos de les comissions no en depenen: sempre els veu tot el club. */
(() => {
const NIV = {tothom:"Tothom", club:"El club", amics:"Amics", ningu:"Ningú"};
const NIV_LLARG = {
  tothom:"Qualsevol soci aprovat de l'app (avui, el club; amb la V3, també altres clubs).",
  club:"Els socis aprovats del teu club.",
  amics:"Només els socis que heu acceptat com a amics.",
  ningu:"Ningú: no es comparteix."
};
const ITEMS = [
  {k:"mur", t:"Publicacions al mur", d:"club", ningu:false, nota:"Valor per defecte: el pots canviar en cada publicació."},
  {k:"presencia", t:"On ets (a la base o a l'aigua)", d:"club", ningu:true, nota:"Inclou la posició mentre navegues."},
  {k:"avisos", t:"Avisos de seguretat en ruta", d:"club", ningu:true, nota:"Sense vent i lluny, vent massa fort, onades perilloses."},
  {k:"intencions", t:"Qui surt", d:"club", ningu:false, nota:"Valor per defecte quan anuncies que surts."},
  {k:"anuncis", t:"Anuncis", d:"club", ningu:false, nota:"Valor per defecte quan publiques un anunci."}
];
const ADD_IC = '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="10" cy="7.5" r="4"/><path d="M2.5 20c0-4.1 3.4-7 7.5-7 1.6 0 3.1.4 4.3 1.2a6 6 0 0 0-1.3 5.8z"/><circle cx="18" cy="17" r="5" fill="currentColor"/><path d="M18 14.5v5M15.5 17h5" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg>';
const XI = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

let C = null, amistats = [], perfils = [], cerca = "", loading = null, loadedAt = 0;
const uid = () => C.user.uid;
const ref = (...p) => C.F.doc(C.db, ...p);
const getAll = async (n, ...w) => (await C.F.getDocs(C.F.query(C.F.collection(C.db, n), ...w))).docs.map(d => Object.assign({id:d.id}, d.data()));
const parell = (a, b) => a < b ? a + "_" + b : b + "_" + a;
const altre = a => a.uids.find(x => x !== uid());
const say = t => { const m = $("privMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } };
const ERRS = {"permission-denied":"El núvol ho ha refusat (permís). Comprova que les regles estan publicades.", "unavailable":"Sense connexió amb el núvol."};
const errText = e => ERRS[e && e.code] || "No s'ha pogut fer" + (e && e.code ? " (" + e.code + ")." : ".");

async function ctx(){ C = window.OV_CLOUD?.ctx ? await window.OV_CLOUD.ctx().catch(() => null) : null; return C; }
function pref(k){ const it = ITEMS.find(x => x.k === k), v = C && C.member.privacitat && C.member.privacitat[k]; return v && NIV[v] && (it.ningu || v !== "ningu") ? v : it.d; }
const avisosBase = () => !(C && C.member.privacitat && C.member.privacitat.avisosBase === false);
const autoBase = () => !!(C && C.member.privacitat && C.member.privacitat.autoBase === true);   // per defecte, no
const amicsUids = () => amistats.filter(a => a.estat === "acceptada").map(altre);
const lectors = v => v === "amics" ? amicsUids() : [];

async function load(force){
  if(!C) return;
  if(loading) return loading;
  if(!force && now() - loadedAt < 60000) return;
  loading = (async () => {
    try{
      const club = C.member.clubId;
      [amistats, perfils] = await Promise.all([getAll("amistats", C.F.where("uids", "array-contains", uid())), getAll("perfils", C.F.where("clubId", "==", club))]);
      const mine = perfils.find(p => p.id === uid());
      if(!mine || mine.nom !== C.member.nom){   // perfil mínim perquè els altres socis et puguin trobar
        await C.F.setDoc(ref("perfils", uid()), {userId:uid(), clubId:club, nom:C.member.nom});
        perfils = perfils.filter(p => p.id !== uid()).concat([{id:uid(), userId:uid(), clubId:club, nom:C.member.nom}]);
      }
      loadedAt = now(); say("");
    }catch(e){ say(errText(e)); }
    finally{ loading = null; }
  })();
  await loading; render(); renderFriends();
}
const now = () => Date.now();

/* ---------- vista: confidencialitat (Configuració) ---------- */
function render(){
  renderFab();
  const sec = $("privSec"), body = $("privBody"); if(!sec || !body) return;
  sec.hidden = !C; if(!C) return;
  $("peekPriv").textContent = "Mur: " + NIV[pref("mur")].toLowerCase() + " · on ets: " + NIV[pref("presencia")].toLowerCase();
  body.innerHTML = `<div class="msg err" id="privMsg" hidden></div>
    <p class="note" style="margin:0">Tria qui veu cada cosa. Els avisos de la junta i les comissions sempre els veu tot el club. Els amics s'afegeixen des del botó <b>Afegeix amics</b> del Club.</p>
    ${ITEMS.map(it => { const v = pref(it.k); return `<label class="priv-row" for="pv_${it.k}"><span class="priv-t"><b>${esc(it.t)}</b><small class="note">${esc(it.nota)}</small></span>
      <select class="field" id="pv_${it.k}" data-priv="${it.k}">${Object.keys(NIV).filter(k => it.ningu || k !== "ningu").map(k => `<option value="${k}"${k === v ? " selected" : ""}>${NIV[k]}</option>`).join("")}</select></label>
      ${it.k === "presencia" ? `<label class="cl-sw priv-base"><span><b>Marca'm a la base automàticament</b><small class="note">Si fa 10 minuts que ets a menys de 50 m de la base, et marca a la base; si fa 2 minuts que ets a més de 200 m, et treu. <b>Consum de bateria baix:</b> només funciona amb l'app oberta i llegeix el GPS més sovint com més a prop de la base ets.</small></span><input type="checkbox" class="switch" id="pvAuto"${autoBase() ? " checked" : ""}${pref("presencia") === "ningu" ? " disabled" : ""}></label>` : ""}
      ${it.k === "avisos" ? `<label class="cl-sw priv-base"><span><b>+ Gent a la base nàutica</b><small class="note">Els socis que en aquell moment són a la base també veuen els teus avisos, encara que no siguin del grup triat.</small></span><input type="checkbox" class="switch" id="pvBase"${avisosBase() ? " checked" : ""}></label>` : ""}`; }).join("")}
    <div class="vp-more"><button class="ib-i" type="button" data-info="iPriv" aria-label="Què vol dir cada opció" aria-expanded="false">i</button>
      <div class="vp-info" id="iPriv" hidden>${Object.keys(NIV).map(k => `<p><b>${NIV[k]}:</b> ${esc(NIV_LLARG[k])}</p>`).join("")}<p><b>Gent a la base:</b> els socis que han marcat «Soc a la base» o hi han tornat amb el GPS. Els avisos de seguretat els poden marcar com a resolts la junta, els responsables i qui és a la base.</p><p>El que ja has compartit amb «Amics» ho veuen els amics que tenies en aquell moment; quan acceptes o treus un amic, l'app ho actualitza.</p></div></div>`;
}

/* ---------- amics: botó flotant del Club i full ---------- */
function renderFab(){
  let b = $("friendFab");
  const show = !!C && !$("view-club").hidden;
  if(!b){ if(!C) return; b = document.createElement("button"); b.type = "button"; b.id = "friendFab"; b.className = "friend-fab"; b.setAttribute("aria-label", "Afegeix amics"); b.innerHTML = ADD_IC; document.body.appendChild(b); b.onclick = openFriends; }
  b.hidden = !show;
  const n = C ? amistats.filter(a => a.estat === "pendent" && a.a === uid()).length : 0;
  let dot = b.querySelector(".ff-dot"); if(n){ if(!dot){ dot = document.createElement("span"); dot.className = "ff-dot"; b.appendChild(dot); } dot.textContent = n; } else if(dot) dot.remove();
  b.setAttribute("aria-label", n ? `Afegeix amics · ${n} sol·licituds` : "Afegeix amics");
}
function friendsBody(){
  const acc = amistats.filter(a => a.estat === "acceptada"), rebudes = amistats.filter(a => a.estat === "pendent" && a.a === uid()), enviades = amistats.filter(a => a.estat === "pendent" && a.de === uid());
  const nomDe = a => (a.noms || {})[altre(a)] || perfils.find(p => p.id === altre(a))?.nom || "Soci";
  const lligats = new Set(amistats.map(altre));
  const q = cerca.trim().toLowerCase(), troba = q.length >= 2 ? perfils.filter(p => p.id !== uid() && !lligats.has(p.id) && String(p.nom).toLowerCase().includes(q)).slice(0, 8) : [];
  const row = (nom, btns) => `<div class="acc-row"><div class="acc-who"><b>${esc(nom)}</b></div><div class="acc-btns">${btns}</div></div>`;
  return `<div class="msg err" id="privMsg" hidden></div>
    <label class="cl-field" for="privCerca"><span class="lbl">Cerca un soci</span>
      <input class="field" id="privCerca" type="search" placeholder="Escriu el nom" autocomplete="off" value="${esc(cerca)}" style="font-family:var(--f-body)"></label>
    <div id="privTroba">${troba.map(p => row(p.nom, `<button class="btn sm cl-pri" type="button" data-fadd="${esc(p.id)}">Afegeix</button>`)).join("") || (q.length >= 2 ? `<p class="note">Cap soci amb aquest nom (o ja és amic teu).</p>` : `<p class="note">Escriu almenys dues lletres.</p>`)}</div>
    ${rebudes.length ? `<span class="lbl">Sol·licituds rebudes · ${rebudes.length}</span>` + rebudes.map(a => row(nomDe(a), `<button class="btn sm cl-pri" type="button" data-fok="${esc(a.id)}">Accepta</button><button class="btn sm" type="button" data-fno="${esc(a.id)}">Rebutja</button>`)).join("") : ""}
    <span class="lbl">Amics · ${acc.length}</span>
    ${acc.map(a => row(nomDe(a), `<button class="btn sm" type="button" data-fask="${esc(a.id)}">Treu</button>`) + `<div data-fbox="${esc(a.id)}"></div>`).join("") || `<p class="note">Encara no tens cap amic a l'app.</p>`}
    ${enviades.length ? `<span class="lbl">Enviades, pendents</span>` + enviades.map(a => row(nomDe(a), `<button class="btn sm" type="button" data-fno="${esc(a.id)}">Cancel·la</button>`)).join("") : ""}
    <p class="note">Els amics han d'acceptar la sol·licitud. Qui veu cada cosa es tria a Configuració ▸ Confidencialitat.</p>`;
}
function openFriends(){
  if(!C || !window.OV_CLUB?.sheet) return;
  OV_CLUB.sheet("Amics", `<div id="friendsBody">${friendsBody()}</div>`, () => { load(); });
}
function renderFriends(){ const b = $("friendsBody"); if(b) b.innerHTML = friendsBody(); renderFab(); }

/* ---------- accions ---------- */
async function setPref(k, v){
  const p = Object.assign({}, C.member.privacitat || {}, {[k]: v});
  try{ await C.F.updateDoc(ref("members", uid()), {privacitat:p}); C.member.privacitat = p; render(); window.OV_CLUB?.privChanged(k); }
  catch(e){ say(errText(e)); render(); }
}
async function add(id){
  const p = perfils.find(x => x.id === id); if(!p) return;
  const doc = {uids:[uid(), id], de:uid(), a:id, noms:{[uid()]:C.member.nom, [id]:p.nom}, estat:"pendent", creat:C.F.serverTimestamp()};
  try{ await C.F.setDoc(ref("amistats", parell(uid(), id)), doc); amistats.push(Object.assign({id:parell(uid(), id)}, doc)); cerca = ""; renderFriends(); }
  catch(e){ say(errText(e)); }
}
async function accept(id){
  try{ await C.F.updateDoc(ref("amistats", id), {estat:"acceptada", acceptadaAt:C.F.serverTimestamp()}); const a = amistats.find(x => x.id === id); if(a) a.estat = "acceptada"; renderFriends(); window.OV_CLUB?.refreshLectors(); }
  catch(e){ say(errText(e)); }
}
async function remove(id){
  try{ await C.F.deleteDoc(ref("amistats", id)); amistats = amistats.filter(x => x.id !== id); renderFriends(); window.OV_CLUB?.refreshLectors(); }
  catch(e){ say(errText(e)); }
}
document.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.priv; if(k && C) setPref(k, e.target.value); if(e.target.id === "pvBase" && C) setPref("avisosBase", e.target.checked);
  if(e.target.id === "pvAuto" && C){ const on = e.target.checked;
    if(on && navigator.geolocation) navigator.geolocation.getCurrentPosition(() => {}, () => say("Sense permís d'ubicació, no es pot detectar l'arribada a la base."), {timeout:20000});   // demana el permís ara
    setPref("autoBase", on); } });
document.addEventListener("input", e => { if(e.target.id !== "privCerca") return; cerca = e.target.value; const pos = e.target.selectionStart; renderFriends(); const i = $("privCerca"); if(i){ i.focus(); try{ i.setSelectionRange(pos, pos); }catch(err){} } });
window.addEventListener("mm-view", renderFab);
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#friendsBody button"); if(!t || !C || t.classList.contains("ib-i")) return;
  const d = t.dataset;
  if(d.fadd) add(d.fadd);
  else if(d.fok) accept(d.fok);
  else if(d.fno) remove(d.fno);
  else if(d.fask){ const box = document.querySelector(`[data-fbox="${CSS.escape(d.fask)}"]`); if(box) slideConfirm(box, "Llisca per treure l'amic", () => remove(d.fask)); }
});
$("themeBtn").addEventListener("click", () => { if(!$("viewPanel").hidden && C){ render(); load(); } });
window.addEventListener("ov-cloud", async () => { await ctx(); render(); if(C) load(true); });
setInterval(() => { if(C && document.visibilityState === "visible" && !$("view-club").hidden) load(); }, 120000);   // sol·licituds noves

window.OV_PRIV = {
  NIV, ITEMS, pref, lectors, amicsUids, avisosBase, autoBase, openFriends,
  async ready(){ if(C && !loadedAt) await load(true); },
  options(k){ const it = ITEMS.find(x => x.k === k); return Object.keys(NIV).filter(v => it.ningu || v !== "ningu"); },
  open(){ const p = $("viewPanel"); if(!p) return; p.hidden = false; $("themeBtn").setAttribute("aria-expanded", "true"); const s = $("privSec"); if(s){ s.open = true; render(); setTimeout(() => s.scrollIntoView({behavior:"smooth", block:"start"}), 50); } },
  async purge(){   // en esborrar el compte
    await ctx(); if(!C) return;
    for(const a of await getAll("amistats", C.F.where("uids", "array-contains", uid()))) await C.F.deleteDoc(ref("amistats", a.id)).catch(() => {});
    await C.F.deleteDoc(ref("perfils", uid())).catch(() => {});
  }
};
ctx().then(() => { render(); if(C) load(true); });
})();
