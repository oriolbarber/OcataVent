"use strict";
/* ============ Ocata Vent 2 · Web de gestió ============
   Dues pàgines, el mateix codi:
   · gestio.html — gestió del club: socis, comissions i permisos. Hi entren l'administració i les persones premium.
   · admin.html  — administració global: tots els clubs i tots els usuaris. Només l'administració.
   La sessió és la mateixa que la de l'app (mateix origen i mateix Firebase): si ja hi has entrat, no cal tornar-ho a fer.
   La seguretat real la fan les regles de Firestore (firestore.rules): premium només llegeix i edita el seu club. */
(() => {
const FB_VER = "13.0.0", FB = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
const FB_CONFIG = {
  apiKey: "AIzaSyDp1A_kJusg-ni5p4JY_62n9I2WF1H8smY",
  authDomain: "ocatavent.firebaseapp.com",
  projectId: "ocatavent"
};
const OWNER_UID = "aHjoROUH3aQsHh6ksS3Tt1p5soF2";
const GLOBAL = document.body.dataset.mode === "global";
const PERMS = {
  avisos:  {t:"Fer avisos", d:"Publicar avisos al Club en nom de les comissions de què forma part."},
  altes:   {t:"Altes", d:"Aprovar o rebutjar altes i treure l'accés."},
  rols:    {t:"Rols i comissions", d:"Crear i editar comissions, assignar-hi persones i nomenar responsables."},
  permisos:{t:"Permisos", d:"Donar i treure aquests permisos a altres persones."},
  moderar: {t:"Moderar", d:"Retirar publicacions, «Qui surt» i anuncis d'altres persones."}
};
const COMS0 = {junta:"Junta", manteniment:"Manteniment", economica:"Econòmica"};
const ESTAT = {aprovat:"Amb alta", pendent:"Pendent", rebutjat:"No aprovat"};
const ERRS = {"permission-denied":"El núvol ho ha refusat: no tens permís per fer-ho, o les regles encara no s'han publicat.", "unavailable":"Sense connexió amb el núvol.", "auth/invalid-credential":"Correu o contrasenya incorrectes.", "auth/wrong-password":"Correu o contrasenya incorrectes.", "auth/user-not-found":"No hi ha cap compte amb aquest correu.", "auth/too-many-requests":"Massa intents. Torna-ho a provar d'aquí a una estona.", "auth/popup-closed-by-user":"S'ha tancat la finestra abans d'entrar."};
const errText = e => ERRS[e && e.code] || "No s'ha pogut fer" + (e && e.code ? " (" + e.code + ")." : ".");
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const slug = t => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
const ms = t => t ? (t.toMillis ? t.toMillis() : +t) : 0;
const dayStr = t => t ? new Date(t).toLocaleDateString("ca", {day:"numeric", month:"short", year:"numeric"}) : "";
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

let A, F, auth, db, user = null, me = null, isAdm = false;
let clubs = {};            // {id: {nom, comissions}}
let members = [];          // socis carregats (del club o de tots)
let club = null;           // club que es mostra
let view = "socis", flt = {q:"", estat:"tots", com:"totes"}, openId = null;

/* ---------- arrencada ---------- */
async function boot(){
  try{
    const [fa, a, f] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
    A = a; F = f;
    const app = fa.initializeApp(FB_CONFIG);
    auth = a.initializeAuth(app, {persistence:[a.indexedDBLocalPersistence, a.browserLocalPersistence], popupRedirectResolver:a.browserPopupRedirectResolver});
    db = f.initializeFirestore(app, {ignoreUndefinedProperties:true});
    a.onAuthStateChanged(auth, u => { user = u; start(); });
  }catch(e){ shell(`<article class="card"><h2>Sense connexió</h2><p class="note">No s'ha pogut carregar el núvol. Comprova la connexió i torna-ho a provar.</p></article>`); }
}
async function start(){
  if(!user){ renderLogin(); return; }
  shell(`<article class="card"><p class="note">Carregant…</p></article>`);
  try{
    const md = await F.getDoc(F.doc(db, "members", user.uid));
    me = md.exists() ? md.data() : null;
    isAdm = user.uid === OWNER_UID || await F.getDoc(F.doc(db, "admins", user.uid)).then(d => d.exists(), () => false);
  }catch(e){ me = null; }
  const prem = !!(me && me.estat === "aprovat" && me.premium);
  if(GLOBAL ? !isAdm : !(isAdm || prem)){ renderNoAccess(); return; }
  if(GLOBAL){ await loadAll(); club = null; }
  else{ const q = new URLSearchParams(location.search).get("club"); await openClub(isAdm && q ? q : (me ? me.clubId : "ocatavent")); }
  render();
}
async function loadClub(id){
  try{ const d = await F.getDoc(F.doc(db, "clubs", id)); clubs[id] = Object.assign({nom:"", comissions:COMS0}, d.exists() ? d.data() : {}); }
  catch(e){ clubs[id] = clubs[id] || {nom:"", comissions:COMS0}; }
}
async function openClub(id){
  club = id; openId = null; view = "socis"; flt = {q:"", estat:"tots", com:"totes"};
  await loadClub(id);
  if(!GLOBAL){
    try{ const qs = await F.getDocs(F.query(F.collection(db, "members"), F.where("clubId", "==", id))); members = qs.docs.map(d => d.data()); say(""); }
    catch(e){ members = []; say(errText(e)); }
  }
}
async function loadAll(){
  try{
    const [qm, qc] = await Promise.all([F.getDocs(F.collection(db, "members")), F.getDocs(F.collection(db, "clubs"))]);
    members = qm.docs.map(d => d.data());
    clubs = {}; qc.docs.forEach(d => clubs[d.id] = Object.assign({nom:"", comissions:COMS0}, d.data()));
    members.forEach(m => { if(m.clubId && !clubs[m.clubId]) clubs[m.clubId] = {nom:"", comissions:COMS0}; });
    if(!clubs.ocatavent) clubs.ocatavent = {nom:"Club Ocata Vent", comissions:COMS0};
    say("");
  }catch(e){ say(errText(e)); }
}

/* ---------- utilitats de pantalla ---------- */
function shell(html){ $("gMain").innerHTML = `<div class="msg err" id="gMsg" hidden></div>` + html; head(); }
function say(t){ const m = $("gMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } }
const clubName = id => (clubs[id] && clubs[id].nom) || (id === "ocatavent" ? "Club Ocata Vent" : id);
const comsOf = id => (clubs[id] && clubs[id].comissions) || COMS0;
const inClub = () => members.filter(m => m.clubId === club);
function head(){
  $("gTitle").textContent = GLOBAL ? (club ? clubName(club) : "Administració global") : "Gestió · " + clubName(club || (me && me.clubId) || "ocatavent");
  $("gWho").textContent = user ? (me?.nom || user.email || "") + (isAdm ? " · administració" : me?.premium ? " · premium" : "") : "";
  $("gOut").hidden = !user;
}

/* ---------- entrada ---------- */
function renderLogin(){
  shell(`<article class="card g-login">
    <h2>Entra a la gestió</h2>
    <p class="note">Fes servir el mateix compte que a l'app Ocata Vent. Si encara no en tens, registra't primer a l'app.</p>
    ${isNative ? "" : `<button class="btn g-wide" type="button" id="gGoogle">Entra amb Google</button><div class="g-or"><span>o</span></div>`}
    <label class="lbl" for="gMail">Correu</label><input class="field" id="gMail" type="email" autocomplete="email" inputmode="email">
    <label class="lbl" for="gPass">Contrasenya</label><input class="field" id="gPass" type="password" autocomplete="current-password">
    <button class="btn cl-pri g-wide" type="button" id="gLogin">Entra</button>
    <button class="btn sm" type="button" id="gForgot">He oblidat la contrasenya</button>
    <a class="btn g-wide" href="./">Torna a l'app</a>
  </article>`);
}
function renderNoAccess(){
  shell(`<article class="card"><h2>Sense accés</h2>
    <p class="note">${GLOBAL ? "Aquesta pàgina és només per a l'administració de l'app." : "La web de gestió és per a l'administració i per a les persones premium del club. Si n'hauries de tenir, parla amb l'administració."}</p>
    <p class="note">Has entrat com a ${esc(user.email || "")}.</p>
    <div class="g-row"><a class="btn" href="./">Torna a l'app</a><button class="btn" type="button" data-out>Surt</button></div></article>`);
}

/* ---------- vista principal ---------- */
function render(){
  if(GLOBAL && !club){ renderGlobal(); return; }
  const L = inClub(), pend = L.filter(m => m.estat === "pendent").length;
  shell(`${GLOBAL ? `<button class="btn sm g-back" type="button" id="gBack">← Tots els clubs</button>` : ""}
    <nav class="cl-tabs g-tabs" aria-label="Seccions">
      <button type="button" data-view="socis"${view === "socis" ? ' aria-current="page"' : ""}>Socis${pend ? `<span class="cl-dot" aria-label="${pend} pendents">${pend}</span>` : ""}</button>
      <button type="button" data-view="coms"${view === "coms" ? ' aria-current="page"' : ""}>Comissions</button>
    </nav>
    ${view === "socis" ? renderSocis(L) : renderComs(L)}`);
}
function stats(L){
  const n = e => L.filter(m => m.estat === e).length;
  return `<div class="g-stats"><div><b>${n("aprovat")}</b><span>Amb alta</span></div><div><b>${n("pendent")}</b><span>Pendents</span></div><div><b>${L.filter(m => m.premium).length}</b><span>Premium</span></div><div><b>${n("rebutjat")}</b><span>No aprovats</span></div></div>`;
}
const chip = (attr, val, on, label) => `<button type="button" class="cl-chip" ${attr}="${esc(val)}" aria-pressed="${!!on}">${esc(label)}</button>`;
function filtered(L){
  const q = flt.q.trim().toLowerCase();
  return L.filter(m => (flt.estat === "tots" || m.estat === flt.estat) && (flt.com === "totes" || (flt.com === "_cap" ? !(m.comissions || []).length : (m.comissions || []).includes(flt.com)))
    && (!q || String(m.nom).toLowerCase().includes(q) || String(m.email).toLowerCase().includes(q)))
    .sort((a, b) => (a.estat === "pendent" ? 0 : 1) - (b.estat === "pendent" ? 0 : 1) || String(a.nom).localeCompare(String(b.nom), "ca"));
}
function rowHTML(m, showClub){
  const C = comsOf(m.clubId), P = (m.permisos || []).map(k => PERMS[k]?.t).filter(Boolean);
  return `<article class="card g-m${m.estat === "pendent" ? " pend" : ""}${m.estat === "rebutjat" ? " off" : ""}">
    <button type="button" class="g-open" data-open="${esc(m.userId)}">
      <b>${esc(m.nom)}${m.userId === user.uid ? " (tu)" : ""}</b><span class="g-mail">${esc(m.email)}</span>
      <span class="g-tags">${m.estat !== "aprovat" ? `<i class="g-tag st-${esc(m.estat)}">${esc(ESTAT[m.estat] || m.estat)}</i>` : ""}${m.premium ? `<i class="g-tag prem">Premium</i>` : ""}${showClub ? `<i class="g-tag">${esc(clubName(m.clubId))}</i>` : ""}${(m.comissions || []).filter(k => C[k]).map(k => `<i class="g-tag com">${esc(C[k])}</i>`).join("")}${m.responsable ? `<i class="g-tag com">Responsable</i>` : ""}</span>
      ${P.length ? `<small class="note">Permisos: ${esc(P.join(", "))}</small>` : ""}
    </button>
    ${m.estat === "pendent" && m.userId !== user.uid ? `<div class="g-row"><button class="btn cl-pri" type="button" data-estat="aprovat" data-uid="${esc(m.userId)}">Aprova</button><button class="btn danger" type="button" data-estat="rebutjat" data-uid="${esc(m.userId)}">Rebutja</button></div>` : ""}
  </article>`;
}
function renderSocis(L){
  const C = comsOf(club), R = filtered(L);
  return `${stats(L)}
    <input class="field" id="gQ" type="search" placeholder="Cerca per nom o correu" autocomplete="off" value="${esc(flt.q)}">
    <div class="cl-chips">${[["tots", "Tots"], ["pendent", "Pendents"], ["aprovat", "Amb alta"], ["rebutjat", "No aprovats"]].map(([k, t]) => chip("data-fest", k, flt.estat === k, t)).join("")}</div>
    <div class="cl-chips">${[["totes", "Totes les comissions"]].concat(Object.entries(C), [["_cap", "Sense comissió"]]).map(([k, t]) => chip("data-fcom", k, flt.com === k, t)).join("")}</div>
    <p class="note">${R.length} de ${L.length} persones</p>
    <div class="g-list">${R.map(m => rowHTML(m)).join("") || `<article class="card"><p class="note">Ningú amb aquests filtres.</p></article>`}</div>
    <div class="g-row"><button class="btn" type="button" id="gCsv">Descarrega la llista (CSV)</button><button class="btn" type="button" id="gReload">Actualitza</button></div>
    <div class="vp-more"><button class="ib-i" type="button" data-info="gInfo" aria-label="Què permet cada permís" aria-expanded="false">i</button>
      <div class="vp-info" id="gInfo" hidden>${Object.values(PERMS).map(p => `<p><b>${p.t}:</b> ${esc(p.d)}</p>`).join("")}
        <p><b>Premium:</b> gestiona el seu club des d'aquesta web i té tots els permisos dins del club. Només el dona l'administració.</p>
        <p>Per publicar avisos d'una comissió cal formar-ne part i tenir «Fer avisos». Ningú no pot canviar el seu propi estat ni els seus permisos.</p></div></div>`;
}
function renderComs(L){
  const C = comsOf(club), n = k => L.filter(m => m.estat === "aprovat" && (m.comissions || []).includes(k)).length;
  return `<article class="card g-card"><label class="lbl" for="gClubNom">Nom del club</label>
      <input class="field" id="gClubNom" type="text" maxlength="80" value="${esc(clubs[club]?.nom || clubName(club))}">
      <p class="note">Es desa en sortir del camp.</p></article>
    <article class="card g-card"><span class="lbl">Comissions · ${Object.keys(C).length}</span>
      ${Object.entries(C).map(([k, t]) => `<div class="g-com"><input class="field" type="text" maxlength="40" value="${esc(t)}" data-comname="${esc(k)}" aria-label="Nom de la comissió"><span class="g-n">${n(k)} pers.</span>
        ${k === "junta" ? `<span class="note">Fixa</span>` : `<button class="btn sm" type="button" data-comdel="${esc(k)}">Elimina</button>`}</div><div data-combox="${esc(k)}"></div>`).join("")}
      <div class="g-com"><input class="field" type="text" maxlength="40" id="gNewCom" placeholder="Nova comissió"><button class="btn cl-pri" type="button" id="gAddCom">Afegeix</button></div>
      <p class="note">La Junta no es pot eliminar: la fan servir els avisos de seguretat. Per vincular persones a una comissió, obre la seva fitxa a «Socis».</p></article>`;
}
function renderGlobal(){
  const ids = Object.keys(clubs).sort((a, b) => clubName(a).localeCompare(clubName(b), "ca"));
  const q = flt.q.trim().toLowerCase(), all = q ? members.filter(m => String(m.nom).toLowerCase().includes(q) || String(m.email).toLowerCase().includes(q)) : [];
  shell(`${stats(members)}
    <span class="lbl">Clubs · ${ids.length}</span>
    <div class="g-list">${ids.map(id => { const L = members.filter(m => m.clubId === id), p = L.filter(m => m.estat === "pendent").length;
      return `<article class="card g-m"><button type="button" class="g-open" data-club="${esc(id)}"><b>${esc(clubName(id))}</b><span class="g-mail">${esc(id)}</span>
        <span class="g-tags"><i class="g-tag">${L.filter(m => m.estat === "aprovat").length} amb alta</i>${p ? `<i class="g-tag st-pendent">${p} pendents</i>` : ""}<i class="g-tag prem">${L.filter(m => m.premium).length} premium</i></span></button></article>`; }).join("")}</div>
    <article class="card g-card"><span class="lbl">Nou club</span>
      <input class="field" id="gNewClub" type="text" maxlength="80" placeholder="Nom del club (p. ex. Club Nàutic Badalona)">
      <button class="btn cl-pri g-wide" type="button" id="gAddClub">Crea el club</button>
      <p class="note">Les altes noves de l'app entren de moment al Club Ocata Vent. Per passar algú a un altre club, obre la seva fitxa.</p></article>
    <span class="lbl">Tots els usuaris · ${members.length}</span>
    <input class="field" id="gQ" type="search" placeholder="Cerca a tots els clubs per nom o correu" autocomplete="off" value="${esc(flt.q)}">
    <div class="g-list">${q ? (all.map(m => rowHTML(m, true)).join("") || `<article class="card"><p class="note">Ningú.</p></article>`) : ""}</div>
    <div class="g-row"><button class="btn" type="button" id="gCsv">Descarrega tots els usuaris (CSV)</button><button class="btn" type="button" id="gReload">Actualitza</button></div>`);
}

/* ---------- fitxa d'una persona ---------- */
function openMember(id){
  const m = members.find(x => x.userId === id); if(!m) return;
  openId = id;
  const self = id === user.uid, C = comsOf(m.clubId), on = m.estat === "aprovat";
  const tog = (attr, k, v, t) => `<button class="btn sm" type="button" ${attr}="${esc(k)}" aria-pressed="${!!v}">${esc(t)}</button>`;
  sheet(m.nom, `
    <p class="note" style="margin:0">${esc(m.email)} · ${esc(ESTAT[m.estat] || m.estat)}${ms(m.creat) ? " · alta demanada el " + esc(dayStr(ms(m.creat))) : ""}</p>
    <div class="g-grp"><label class="lbl" for="mNom">Nom</label><div class="g-com"><input class="field" id="mNom" type="text" maxlength="80" value="${esc(m.nom)}"><button class="btn cl-pri" type="button" id="mNomOk">Desa</button></div></div>
    ${on ? `<div class="g-grp"><span class="lbl">Comissions i rol</span><div class="acc-roles">${Object.entries(C).map(([k, t]) => tog("data-mcom", k, (m.comissions || []).includes(k), t)).join("")}${tog("data-mresp", "1", m.responsable, "Responsable")}</div>
      <p class="note">Les persones responsables i la Junta poden marcar com a resolts els avisos de seguretat.</p></div>
    <div class="g-grp"><span class="lbl">Permisos</span>${self ? `<p class="note">No pots canviar els teus propis permisos.</p>` : `${m.premium ? `<p class="note">Premium: ja té tots els permisos dins del club.</p>` : ""}
      ${Object.entries(PERMS).map(([k, p]) => `<label class="cl-sw"><span><b>${p.t}</b><small class="note">${esc(p.d)}</small></span><input type="checkbox" class="switch" data-mperm="${k}"${(m.permisos || []).includes(k) ? " checked" : ""}></label>`).join("")}`}</div>` : ""}
    ${isAdm && !self ? `<div class="g-grp"><span class="lbl">Només administració</span>
      ${on ? `<label class="cl-sw"><span><b>Premium</b><small class="note">Gestiona el seu club des d'aquesta web.</small></span><input type="checkbox" class="switch" id="mPrem"${m.premium ? " checked" : ""}></label>` : ""}
      <label class="lbl" for="mClub">Club</label><select class="field" id="mClub">${Object.keys(clubs).concat(clubs[m.clubId] ? [] : [m.clubId]).map(c => `<option value="${esc(c)}"${c === m.clubId ? " selected" : ""}>${esc(clubName(c))}</option>`).join("")}</select>
      <p class="note">En canviar de club es treuen les comissions, el rol de responsable i premium.</p></div>` : ""}
    ${!self ? `<div class="g-grp"><span class="lbl">Accés</span>${on ? `<div id="mRevoke"></div>` : `<button class="btn cl-pri g-wide" type="button" data-mestat="aprovat">${m.estat === "rebutjat" ? "Torna a donar l'alta" : "Aprova"}</button>`}</div>` : ""}`, d => {
    const rev = $("mRevoke"); if(rev) slideConfirm(rev, "Llisca per treure l'accés", () => update(id, {estat:"rebutjat", revisatPer:user.uid, revisatAt:F.serverTimestamp()}, true));
    d.addEventListener("click", e => {
      const b = e.target.closest("button"); if(!b) return;
      if(b.dataset.mcom){ const c = (m.comissions || []).filter(k => C[k]); update(id, {comissions: c.includes(b.dataset.mcom) ? c.filter(x => x !== b.dataset.mcom) : c.concat([b.dataset.mcom])}); }
      if(b.dataset.mresp) update(id, {responsable: !m.responsable});
      if(b.dataset.mestat) update(id, {estat:b.dataset.mestat, revisatPer:user.uid, revisatAt:F.serverTimestamp()}, true);
      if(b.id === "mNomOk"){ const v = $("mNom").value.trim().slice(0, 80); if(v && v !== m.nom) update(id, {nom:v}); }
    });
    d.addEventListener("change", async e => {
      const t = e.target;
      if(t.dataset.mperm){ const k = t.dataset.mperm, P = (m.permisos || []).filter(x => PERMS[x]); update(id, {permisos: t.checked ? P.filter(x => x !== k).concat([k]) : P.filter(x => x !== k)}); }
      if(t.id === "mPrem") update(id, {premium: t.checked});
      if(t.id === "mClub" && t.value !== m.clubId){
        // Primer es treuen els rols del club vell (regla «rols»), després es canvia de club (regla d'administració)
        if((m.comissions || []).length || m.responsable){ if(!await update(id, {comissions:[], responsable:false}, false, true)) return; }
        update(id, {clubId:t.value, premium:false});
      }
    });
  });
}
async function update(id, patch, close, quiet){
  const m = members.find(x => x.userId === id); if(!m) return false;
  try{
    await F.updateDoc(F.doc(db, "members", id), patch);
    Object.assign(m, patch, patch.revisatAt ? {revisatAt:Date.now()} : {});
    if(quiet) return true;
    if(close){ closeSheet(); render(); } else { render(); openMember(id); }
    return true;
  }catch(e){ const s = $("shMsg"); if(s){ s.textContent = errText(e); s.hidden = false; } else say(errText(e)); return false; }
}

/* ---------- comissions i clubs ---------- */
async function saveClub(id, patch){
  const cur = clubs[id] || {nom:"", comissions:COMS0}, next = {nom:cur.nom || clubName(id), comissions:cur.comissions || COMS0, ...patch};
  try{ await F.setDoc(F.doc(db, "clubs", id), {nom:next.nom, comissions:next.comissions, actualitzat:F.serverTimestamp(), actualitzatPer:user.uid}); clubs[id] = next; say(""); render(); return true; }
  catch(e){ say(errText(e)); return false; }
}

/* ---------- full inferior (fitxa) ---------- */
function sheet(title, html, onOpen){
  closeSheet(true);
  const d = document.createElement("div");
  d.className = "cl-sheet"; d.id = "gSheet";
  d.innerHTML = `<div class="cl-sheet-in card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="cl-sheet-h"><h2>${esc(title)}</h2><button class="ib" type="button" id="shClose" aria-label="Tanca"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="msg err" id="shMsg" hidden></div>${html}</div>`;
  document.body.appendChild(d); document.body.classList.add("g-lock");
  d.addEventListener("click", e => { if(e.target === d || e.target.closest("#shClose")) closeSheet(); });
  onOpen && onOpen(d);
}
function closeSheet(keep){ const d = $("gSheet"); if(d) d.remove(); document.body.classList.remove("g-lock"); if(!keep) openId = null; }

/* ---------- confirmació lliscant (mateixa que a l'app) ---------- */
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

/* ---------- llista en CSV ---------- */
function csv(){
  const L = GLOBAL && !club ? members : filtered(inClub());
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Nom", "Correu", "Club", "Estat", "Premium", "Comissions", "Responsable", "Permisos", "Alta demanada"]].concat(L.map(m => [m.nom, m.email, clubName(m.clubId), ESTAT[m.estat] || m.estat, m.premium ? "sí" : "", (m.comissions || []).map(k => comsOf(m.clubId)[k]).filter(Boolean).join(", "), m.responsable ? "sí" : "", (m.permisos || []).map(k => PERMS[k]?.t).filter(Boolean).join(", "), ms(m.creat) ? new Date(ms(m.creat)).toISOString().slice(0, 10) : ""]));
  const blob = new Blob(["﻿" + rows.map(r => r.map(cell).join(";")).join("\r\n")], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `socis-${club || "tots"}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- esdeveniments ---------- */
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("button"); if(!b || b.closest("#gSheet")) return;
  if(b.dataset.info){ const p = $(b.dataset.info); if(p){ p.hidden = !p.hidden; b.setAttribute("aria-expanded", String(!p.hidden)); } return; }
  if(b.id === "gGoogle"){ try{ await A.signInWithPopup(auth, new A.GoogleAuthProvider()); }catch(err){ say(errText(err)); } return; }
  if(b.id === "gLogin"){ const em = $("gMail").value.trim(), pw = $("gPass").value; if(!em || !pw){ say("Escriu el correu i la contrasenya."); return; }
    b.disabled = true; try{ await A.signInWithEmailAndPassword(auth, em, pw); }catch(err){ say(errText(err)); b.disabled = false; } return; }
  if(b.id === "gForgot"){ const em = $("gMail").value.trim(); if(!em){ say("Escriu primer el correu."); return; }
    try{ await A.sendPasswordResetEmail(auth, em); say("T'hem enviat un correu per canviar la contrasenya."); }catch(err){ say(errText(err)); } return; }
  if(b.id === "gOut" || b.hasAttribute("data-out")){ await A.signOut(auth); return; }
  if(b.dataset.view){ view = b.dataset.view; render(); return; }
  if(b.dataset.fest){ flt.estat = b.dataset.fest; render(); return; }
  if(b.dataset.fcom){ flt.com = b.dataset.fcom; render(); return; }
  if(b.dataset.open){ openMember(b.dataset.open); return; }
  if(b.dataset.estat){ update(b.dataset.uid, {estat:b.dataset.estat, revisatPer:user.uid, revisatAt:F.serverTimestamp()}, true); return; }
  if(b.dataset.club){ await openClub(b.dataset.club); render(); window.scrollTo({top:0}); return; }
  if(b.id === "gBack"){ club = null; flt = {q:"", estat:"tots", com:"totes"}; render(); return; }
  if(b.id === "gCsv"){ csv(); return; }
  if(b.id === "gReload"){ b.disabled = true; if(GLOBAL){ const c = club; await loadAll(); club = c; } else await openClub(club); render(); return; }
  if(b.id === "gAddCom"){ const n = ($("gNewCom")?.value || "").trim(); if(!n) return; const C = comsOf(club); let k = slug(n) || "comissio", i = 2; while(C[k]) k = (slug(n) || "comissio") + "-" + i++;
    saveClub(club, {comissions:Object.assign({}, C, {[k]: n.slice(0, 40)})}); return; }
  if(b.dataset.comdel){ const k = b.dataset.comdel, box = document.querySelector(`[data-combox="${CSS.escape(k)}"]`), C = comsOf(club);
    if(box) slideConfirm(box, "Llisca per eliminar " + (C[k] || ""), () => { const n = Object.assign({}, C); delete n[k]; saveClub(club, {comissions:n}); }); return; }
  if(b.id === "gAddClub"){ const n = ($("gNewClub")?.value || "").trim(); if(!n) return; let k = slug(n) || "club", i = 2; while(clubs[k]) k = (slug(n) || "club") + "-" + i++;
    b.disabled = true; clubs[k] = {nom:n.slice(0, 80), comissions:COMS0}; if(!await saveClub(k, {})){ delete clubs[k]; render(); } return; }
});
document.addEventListener("change", e => {
  const t = e.target; if(t.closest && t.closest("#gSheet")) return;
  if(t.dataset && t.dataset.comname){ const k = t.dataset.comname, C = comsOf(club), v = t.value.trim().slice(0, 40);
    if(v && v !== C[k]) saveClub(club, {comissions:Object.assign({}, C, {[k]: v})}); else t.value = C[k]; }
  if(t.id === "gClubNom"){ const v = t.value.trim().slice(0, 80); if(v && v !== clubs[club]?.nom) saveClub(club, {nom:v}); }
});
document.addEventListener("input", e => {
  if(e.target.id !== "gQ") return;
  flt.q = e.target.value; const pos = e.target.selectionStart; render();
  const i = $("gQ"); if(i){ i.focus(); try{ i.setSelectionRange(pos, pos); }catch(err){} }
});
document.addEventListener("keydown", e => { if(e.key === "Escape") closeSheet(); if(e.key === "Enter" && (e.target.id === "gPass" || e.target.id === "gMail")) $("gLogin")?.click(); });

boot();
})();
