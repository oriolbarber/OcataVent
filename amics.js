"use strict";
/* ============ Ocata Vent 2 · Confidencialitat i amics ============
   Configuració ▸ Confidencialitat: qui veu cada cosa (tothom, el club, la junta, amics o ningú) i els amics mutus.
   Les preferències es desen a members/{uid}.privacitat; els amics, a amistats/{uidMenor}_{uidMajor}.
   Els avisos de les comissions no en depenen: sempre els veu tot el club. */
(() => {
const NIV = {tothom:"Tothom", club:"El club", junta:"La junta", amics:"Amics", ningu:"Ningú"};
const NIV_LLARG = {
  tothom:"Qualsevol soci aprovat de l'app (avui, el club; amb la V3, també altres clubs).",
  club:"Els socis aprovats del teu club.",
  junta:"La comissió de Junta, els responsables (monitors) i els administradors.",
  amics:"Només els socis que heu acceptat com a amics.",
  ningu:"Ningú: no es comparteix."
};
const ITEMS = [
  {k:"mur", t:"Publicacions al mur", d:"club", ningu:false, nota:"Valor per defecte: el pots canviar en cada publicació."},
  {k:"presencia", t:"On ets (a la base o a l'aigua)", d:"junta", ningu:true, nota:"Inclou la posició mentre navegues."},
  {k:"avisos", t:"Avisos de seguretat en ruta", d:"junta", ningu:true, nota:"Sense vent i lluny, vent massa fort, onades perilloses."},
  {k:"intencions", t:"Qui surt", d:"club", ningu:false, nota:"Valor per defecte quan anuncies que surts."},
  {k:"anuncis", t:"Anuncis", d:"club", ningu:false, nota:"Valor per defecte quan publiques un anunci."}
];
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
function pref(k){ const it = ITEMS.find(x => x.k === k), v = C && C.member.privacitat && C.member.privacitat[k]; return v && (it.ningu || v !== "ningu") ? v : it.d; }
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
  await loading; render();
}
const now = () => Date.now();

/* ---------- vista ---------- */
function render(){
  const sec = $("privSec"), body = $("privBody"); if(!sec || !body) return;
  sec.hidden = !C; if(!C) return;
  $("peekPriv").textContent = "Mur: " + NIV[pref("mur")].toLowerCase() + " · on ets: " + NIV[pref("presencia")].toLowerCase();
  const acc = amistats.filter(a => a.estat === "acceptada"), rebudes = amistats.filter(a => a.estat === "pendent" && a.a === uid()), enviades = amistats.filter(a => a.estat === "pendent" && a.de === uid());
  const nomDe = a => (a.noms || {})[altre(a)] || perfils.find(p => p.id === altre(a))?.nom || "Soci";
  const lligats = new Set(amistats.map(altre));
  const q = cerca.trim().toLowerCase(), troba = q.length >= 2 ? perfils.filter(p => p.id !== uid() && !lligats.has(p.id) && String(p.nom).toLowerCase().includes(q)).slice(0, 8) : [];
  const row = (nom, btns) => `<div class="acc-row"><div class="acc-who"><b>${esc(nom)}</b></div><div class="acc-btns">${btns}</div></div>`;
  body.innerHTML = `<div class="msg err" id="privMsg" hidden></div>
    <p class="note" style="margin:0">Tria qui veu cada cosa. Els avisos de la junta i les comissions sempre els veu tot el club.</p>
    ${ITEMS.map(it => { const v = pref(it.k); return `<label class="priv-row" for="pv_${it.k}"><span class="priv-t"><b>${esc(it.t)}</b><small class="note">${esc(it.nota)}</small></span>
      <select class="field" id="pv_${it.k}" data-priv="${it.k}">${Object.keys(NIV).filter(k => it.ningu || k !== "ningu").map(k => `<option value="${k}"${k === v ? " selected" : ""}>${NIV[k]}</option>`).join("")}</select></label>`; }).join("")}
    <div class="vp-more"><button class="ib-i" type="button" data-info="iPriv" aria-label="Què vol dir cada opció" aria-expanded="false">i</button>
      <div class="vp-info" id="iPriv" hidden>${Object.keys(NIV).map(k => `<p><b>${NIV[k]}:</b> ${esc(NIV_LLARG[k])}</p>`).join("")}<p>El que ja has compartit amb «Amics» ho veuen els amics que tenies en aquell moment; quan acceptes o treus un amic, l'app ho actualitza.</p></div></div>
    <div class="priv-amics"><span class="lbl">Amics · ${acc.length}</span>
      ${rebudes.length ? `<span class="note">Sol·licituds rebudes</span>` + rebudes.map(a => row(nomDe(a), `<button class="btn sm cl-pri" type="button" data-fok="${esc(a.id)}">Accepta</button><button class="btn sm" type="button" data-fno="${esc(a.id)}">Rebutja</button>`)).join("") : ""}
      ${acc.map(a => row(nomDe(a), `<button class="btn sm" type="button" data-fask="${esc(a.id)}">Treu</button>`) + `<div data-fbox="${esc(a.id)}"></div>`).join("") || `<p class="note">Encara no tens cap amic a l'app.</p>`}
      ${enviades.length ? `<span class="note">Enviades, pendents</span>` + enviades.map(a => row(nomDe(a), `<button class="btn sm" type="button" data-fno="${esc(a.id)}">Cancel·la</button>`)).join("") : ""}
      <label class="cl-field" for="privCerca"><span class="lbl">Afegeix un soci del club</span>
        <input class="field" id="privCerca" type="search" placeholder="Escriu el nom" autocomplete="off" value="${esc(cerca)}" style="font-family:var(--f-body)"></label>
      <div id="privTroba">${troba.map(p => row(p.nom, `<button class="btn sm" type="button" data-fadd="${esc(p.id)}">Afegeix</button>`)).join("") || (q.length >= 2 ? `<p class="note">Cap soci amb aquest nom.</p>` : "")}</div>
    </div>`;
}

/* ---------- accions ---------- */
async function setPref(k, v){
  const p = Object.assign({}, C.member.privacitat || {}, {[k]: v});
  try{ await C.F.updateDoc(ref("members", uid()), {privacitat:p}); C.member.privacitat = p; render(); window.OV_CLUB?.privChanged(k); }
  catch(e){ say(errText(e)); render(); }
}
async function add(id){
  const p = perfils.find(x => x.id === id); if(!p) return;
  const doc = {uids:[uid(), id], de:uid(), a:id, noms:{[uid()]:C.member.nom, [id]:p.nom}, estat:"pendent", creat:C.F.serverTimestamp()};
  try{ await C.F.setDoc(ref("amistats", parell(uid(), id)), doc); amistats.push(Object.assign({id:parell(uid(), id)}, doc)); cerca = ""; render(); }
  catch(e){ say(errText(e)); }
}
async function accept(id){
  try{ await C.F.updateDoc(ref("amistats", id), {estat:"acceptada", acceptadaAt:C.F.serverTimestamp()}); const a = amistats.find(x => x.id === id); if(a) a.estat = "acceptada"; render(); window.OV_CLUB?.refreshLectors(); }
  catch(e){ say(errText(e)); }
}
async function remove(id){
  try{ await C.F.deleteDoc(ref("amistats", id)); amistats = amistats.filter(x => x.id !== id); render(); window.OV_CLUB?.refreshLectors(); }
  catch(e){ say(errText(e)); }
}
document.addEventListener("change", e => { const k = e.target.dataset && e.target.dataset.priv; if(k && C) setPref(k, e.target.value); });
document.addEventListener("input", e => { if(e.target.id !== "privCerca") return; cerca = e.target.value; const pos = e.target.selectionStart; render(); const i = $("privCerca"); if(i){ i.focus(); try{ i.setSelectionRange(pos, pos); }catch(err){} } });
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#privBody button"); if(!t || !C || t.classList.contains("ib-i")) return;
  const d = t.dataset;
  if(d.fadd) add(d.fadd);
  else if(d.fok) accept(d.fok);
  else if(d.fno) remove(d.fno);
  else if(d.fask){ const box = document.querySelector(`[data-fbox="${CSS.escape(d.fask)}"]`); if(box) slideConfirm(box, "Llisca per treure l'amic", () => remove(d.fask)); }
});
$("themeBtn").addEventListener("click", () => { if(!$("viewPanel").hidden && C){ render(); load(); } });
window.addEventListener("ov-cloud", async () => { await ctx(); render(); if(C) load(true); });

window.OV_PRIV = {
  NIV, ITEMS, pref, lectors, amicsUids,
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
