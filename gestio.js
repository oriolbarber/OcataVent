"use strict";
/* ============ Ocata Vent 2 · Web de gestió ============
   Dues pàgines, el mateix codi:
   · gestio.html — gestió del club: socis, rols (paquets de permisos), comissions i «qui pot fer què». Hi entren l'administració i les persones premium.
   · admin.html  — administració global: clubs, plantilles de rol, administradors, catàleg de permisos i tots els usuaris. Només l'administració.
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
  seguretat:{t:"Seguretat", d:"Marcar com a resolts els avisos de seguretat en ruta (sense vent, vent fort, onades)."},
  avisos:  {t:"Fer avisos", d:"Publicar avisos al Club en nom de les comissions de què forma part."},
  planol:  {t:"Plànol", d:"Dibuixar el plànol de la base: places, edificis, zones i punts. La Junta també ho pot fer."},
  embarcacions:{t:"Embarcacions", d:"Donar d'alta i de baixa embarcacions, assignar-les a les places i posar-ne el propietari. Manteniment també ho pot fer."},
  altes:   {t:"Altes", d:"Aprovar o rebutjar altes i treure l'accés."},
  rols:    {t:"Rols i comissions", d:"Crear i editar comissions i rols, i assignar-hi persones."},
  permisos:{t:"Permisos", d:"Donar i treure aquests permisos a altres persones."},
  moderar: {t:"Moderar", d:"Retirar publicacions, «Qui surt» i anuncis d'altres persones."}
};
const COMS0 = {junta:"Junta", manteniment:"Manteniment", economica:"Econòmica"};
// Rols = paquets de permisos amb nom. Plantilles globals (config/global.plantilles) → rols de cada club (clubs/{id}.rols).
// La web recalcula members/{uid}.permisos (efectius) = permisos dels rols (rolsClub) + permisos extra (permisosExtra). Les regles només miren «permisos».
const TPL0 = {secretaria:{nom:"Secretaria", permisos:["altes"]}, comunicacio:{nom:"Comunicació", permisos:["avisos", "moderar"]}, coordinacio:{nom:"Coordinació", permisos:["rols", "permisos"]}, monitoratge:{nom:"Monitoratge", permisos:["seguretat"]}};
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
let tpl = TPL0, admins = [];
const rolsOf = id => (clubs[id] && clubs[id].rols) || tpl;
// Socis d'abans dels rols: els seus permisos solts passen a ser «extra»
const extraOf = m => [...new Set((m.permisosExtra || (m.rolsClub ? [] : (m.permisos || []))).concat(m.responsable ? ["seguretat"] : []))].filter(k => PERMS[k]);
const effOf = (m, R) => [...new Set((m.rolsClub || []).filter(r => R[r]).flatMap(r => R[r].permisos || []).concat(extraOf(m)))].filter(k => PERMS[k]);
const permT = L => L.map(k => PERMS[k]?.t).filter(Boolean).join(", ");

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
  await loadTpl();
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
async function loadTpl(){
  try{ const d = await F.getDoc(F.doc(db, "config", "global")); tpl = d.exists() && d.data().plantilles ? d.data().plantilles : TPL0; }catch(e){ tpl = TPL0; }
}
async function loadAdmins(){
  try{ admins = (await F.getDocs(F.collection(db, "admins"))).docs.map(d => Object.assign({uid:d.id}, d.data())); }catch(e){ admins = []; }
}
async function loadAll(){
  await loadAdmins();
  try{
    const [qm, qc] = await Promise.all([F.getDocs(F.collection(db, "members")), F.getDocs(F.collection(db, "clubs"))]);
    members = qm.docs.map(d => d.data());
    clubs = {}; qc.docs.forEach(d => clubs[d.id] = Object.assign({nom:"", comissions:COMS0}, d.data()));
    members.forEach(m => { if(m.clubId && !clubs[m.clubId]) clubs[m.clubId] = {nom:"", comissions:COMS0}; });
    if(!clubs.ocatavent) clubs.ocatavent = {nom:"Club Ocata Vent", comissions:COMS0};
    say("");
  }catch(e){ say(errText(e)); }
}

/* ---------- plànol de la base: l'editor (planol.html) dins la web de gestió ---------- */
const renderPlanol = () => `<iframe class="g-plan" title="Plànol de la base" src="planol.html?embed=1${club ? "&club=" + encodeURIComponent(club) : ""}"></iframe>
  <p class="note">Es desa sol al núvol del club. Si el vols a pantalla completa: <a href="planol.html${club ? "?club=" + encodeURIComponent(club) : ""}">obre'l a part</a>.</p>`;

/* ---------- utilitats de pantalla ---------- */
function shell(html){ $("gMain").innerHTML = `<div class="msg err" id="gMsg" hidden></div>` + html; head(); }
function say(t){ const m = $("gMsg"); if(m){ m.textContent = t || ""; m.hidden = !t; } }
const clubName = id => (clubs[id] && clubs[id].nom) || (id === "ocatavent" ? "Club Ocata Vent" : id);
const comsOf = id => (clubs[id] && clubs[id].comissions) || COMS0;
const inClub = () => members.filter(m => m.clubId === club);
function head(){
  $("gTitle").textContent = GLOBAL ? (club ? clubName(club) : "Administració global") : "Gestió · " + clubName(club || (me && me.clubId) || "ocatavent");
  $("gWho").textContent = user ? (me?.nom || user.email || "") + (isAdm ? " · administració" : me?.premium ? " · premium" : "") : "";
  $("gOut").hidden = !user; brandHead();
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
      <button type="button" data-view="rols"${view === "rols" ? ' aria-current="page"' : ""}>Rols</button>
      <button type="button" data-view="coms"${view === "coms" ? ' aria-current="page"' : ""}>Club</button>
      <button type="button" data-view="planol"${view === "planol" ? ' aria-current="page"' : ""}>Plànol</button>
    </nav>
    ${({socis:renderSocis, rols:renderRols, coms:renderComs, planol:renderPlanol})[view](L)}`);
  document.body.classList.toggle("g-wide", view === "planol");
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
      <span class="g-tags">${m.estat !== "aprovat" ? `<i class="g-tag st-${esc(m.estat)}">${esc(ESTAT[m.estat] || m.estat)}</i>` : ""}${m.premium ? `<i class="g-tag prem">Premium</i>` : ""}${showClub ? `<i class="g-tag">${esc(clubName(m.clubId))}</i>` : ""}${(m.comissions || []).filter(k => C[k]).map(k => `<i class="g-tag com">${esc(C[k])}</i>`).join("")}${(m.rolsClub || []).filter(r => rolsOf(m.clubId)[r]).map(r => `<i class="g-tag rol">${esc(rolsOf(m.clubId)[r].nom)}</i>`).join("")}</span>
      ${P.length ? `<small class="note">Pot: ${esc(P.join(", "))}</small>` : ""}
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
// Editor de rols: scope "rol" (rols del club) o "tpl" (plantilles globals). Un rol per targeta, permisos com a xips.
function roleEditor(R, scope, count){
  return `${Object.entries(R).map(([k, r]) => `<article class="card g-card g-rol">
      <div class="g-com"><input class="field" type="text" maxlength="40" value="${esc(r.nom)}" data-rname="${esc(k)}" data-scope="${scope}" aria-label="Nom del rol">${count ? `<span class="g-n">${count(k)} pers.</span>` : ""}<button class="btn sm" type="button" data-rdel="${esc(k)}" data-scope="${scope}">Elimina</button></div>
      <div class="cl-chips">${Object.entries(PERMS).map(([p, d]) => `<button type="button" class="cl-chip" data-rperm="${esc(k)}" data-p="${p}" data-scope="${scope}" aria-pressed="${(r.permisos || []).includes(p)}">${esc(d.t)}</button>`).join("")}</div>
      <div data-rbox="${scope}-${esc(k)}"></div></article>`).join("") || `<article class="card"><p class="note">Encara no hi ha cap rol.</p></article>`}
    <article class="card g-card"><div class="g-com"><input class="field" type="text" maxlength="40" id="${scope}New" placeholder="${scope === "tpl" ? "Nova plantilla de rol" : "Nou rol (p. ex. Monitoratge)"}"><button class="btn cl-pri" type="button" data-radd="${scope}">Afegeix</button></div></article>`;
}
function whoCan(L){
  const A = L.filter(m => m.estat === "aprovat").sort((a, b) => String(a.nom).localeCompare(String(b.nom), "ca")), R = rolsOf(club);
  return `<article class="card g-card"><span class="lbl">Qui pot fer què · ${A.length} persones</span>
    <div class="g-tbl-w"><table class="g-tbl"><thead><tr><th>Persona</th>${Object.values(PERMS).map(p => `<th>${esc(p.t)}</th>`).join("")}</tr></thead>
    <tbody>${A.map(m => { const E = m.premium ? Object.keys(PERMS) : effOf(m, R);
      return `<tr><th><button type="button" class="g-lnk" data-open="${esc(m.userId)}">${esc(m.nom)}</button>${m.premium ? ` <i class="g-tag prem">Premium</i>` : ""}</th>${Object.keys(PERMS).map(p => `<td>${E.includes(p) ? `<span class="g-yes" aria-label="sí">✓</span>` : `<span class="g-no" aria-label="no">·</span>`}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div>
    <p class="note">Inclou els rols, els permisos extra i premium (que ho té tot dins del club).</p></article>`;
}
function renderRols(L){
  const n = k => L.filter(m => m.estat === "aprovat" && (m.rolsClub || []).includes(k)).length;
  return `<p class="note">Cada rol és un paquet de permisos. Assigna'ls a les persones des de la seva fitxa a «Socis». Si canvies els permisos d'un rol, s'actualitzen a totes les persones que el tenen.</p>
    ${roleEditor(rolsOf(club), "rol", n)}
    ${whoCan(L)}
    ${catalog()}`;
}
const catalog = () => `<article class="card g-card"><span class="lbl">Catàleg de permisos</span>${Object.values(PERMS).map(p => `<p class="note"><b>${esc(p.t)}:</b> ${esc(p.d)}</p>`).join("")}
  <p class="note">Els permisos els defineix l'app: cadascun té la seva regla de seguretat. Premium i l'administració els tenen tots.</p></article>`;
function renderComs(L){
  const C = comsOf(club), n = k => L.filter(m => m.estat === "aprovat" && (m.comissions || []).includes(k)).length;
  return `${brandCard()}
    <article class="card g-card"><span class="lbl">Comissions · ${Object.keys(C).length}</span>
      ${Object.entries(C).map(([k, t]) => `<div class="g-com"><input class="field" type="text" maxlength="40" value="${esc(t)}" data-comname="${esc(k)}" aria-label="Nom de la comissió"><span class="g-n">${n(k)} pers.</span>
        ${k === "junta" ? `<span class="note">Fixa</span>` : `<button class="btn sm" type="button" data-comdel="${esc(k)}">Elimina</button>`}</div><div data-combox="${esc(k)}"></div>`).join("")}
      <div class="g-com"><input class="field" type="text" maxlength="40" id="gNewCom" placeholder="Nova comissió"><button class="btn cl-pri" type="button" id="gAddCom">Afegeix</button></div>
      <p class="note">La Junta no es pot eliminar: la fan servir els avisos de seguretat. Per vincular persones a una comissió, obre la seva fitxa a «Socis».</p></article>`;
}
/* ---------- marca del club: logo i títol de la capçalera de l'app (clubs/{id}.logo, .titol) ---------- */
const LOGO0 = "icons/logo.svg?v=3", TITOL0 = "Ocata Vent";
function brandCard(){
  const c = clubs[club] || {}, lg = c.logo || LOGO0, tt = c.titol || TITOL0;
  return `<article class="card g-card"><span class="lbl">Identitat del club</span>
    <div class="g-brand"><div class="g-prev" aria-label="Com es veu a la capçalera de l'app"><img id="gLogoPrev" src="${esc(lg)}" alt="" width="44" height="44">
      <div class="t"><b id="gTitPrev">${esc(tt)}</b><span>Club on navegues ▾</span></div></div>
      <div class="g-row"><label class="btn" for="gLogoFile">Canvia el logo</label><input id="gLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
        ${c.logo ? `<button class="btn" type="button" id="gLogoDel">Logo d'Ocata Vent</button>` : ""}</div></div>
    <label class="lbl" for="gClubTit">Títol de la capçalera</label>
    <input class="field g-up" id="gClubTit" type="text" maxlength="24" placeholder="${TITOL0}" value="${esc(c.titol || "")}">
    <label class="lbl" for="gClubNom">Nom complet del club</label>
    <input class="field" id="gClubNom" type="text" maxlength="80" value="${esc(c.nom || clubName(club))}">
    <p class="note">El títol surt en majúscules a dalt de l'app de tots els socis, amb el logo; a sota hi continua el club on naveguen. Buit = «${TITOL0}». El logo es retalla en un cercle: millor quadrat, amb el motiu al centre (PNG, JPG, WebP o SVG). Es desa en sortir del camp.</p></article>`;
}
// Imatge → data URL petit: SVG tal qual (≤ 60 kB); la resta, retallada quadrada i reduïda a 256 px
async function logoData(f){
  if(f.type === "image/svg+xml"){
    if(f.size > 60000) throw new Error("L'SVG fa més de 60 kB: simplifica'l o fes-ne un PNG.");
    const txt = await f.text(); return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(txt)));
  }
  const url = URL.createObjectURL(f);
  try{
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("No es pot llegir la imatge.")); i.src = url; });
    const S = 256, m = Math.min(img.naturalWidth, img.naturalHeight), cv = document.createElement("canvas"); cv.width = cv.height = S;
    cv.getContext("2d").drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
    let d = cv.toDataURL("image/webp", .9); if(!d.startsWith("data:image/webp")) d = cv.toDataURL("image/png");
    if(d.length > 140000) d = cv.toDataURL("image/jpeg", .85);
    return d;
  }finally{ URL.revokeObjectURL(url); }
}
function brandHead(){ const i = document.querySelector(".g-top img"); if(i){ const c = clubs[club || me?.clubId]; i.src = c && c.logo || LOGO0; } }

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
    <span class="lbl">Plantilles de rol · ${Object.keys(tpl).length}</span>
    <p class="note">Són els rols amb què comença cada club nou. Cada club després els pot canviar.</p>
    ${roleEditor(tpl, "tpl")}
    ${adminsCard()}
    ${catalog()}
    <span class="lbl">Tots els usuaris · ${members.length}</span>
    <input class="field" id="gQ" type="search" placeholder="Cerca a tots els clubs per nom o correu" autocomplete="off" value="${esc(flt.q)}">
    <div class="g-list">${q ? (all.map(m => rowHTML(m, true)).join("") || `<article class="card"><p class="note">Ningú.</p></article>`) : ""}</div>
    <div class="g-row"><button class="btn" type="button" id="gCsv">Descarrega tots els usuaris (CSV)</button><button class="btn" type="button" id="gReload">Actualitza</button></div>`);
}

function adminsCard(){
  const owner = user.uid === OWNER_UID, ids = new Set(admins.map(a => a.uid));
  const cand = members.filter(m => m.estat === "aprovat" && !ids.has(m.userId) && m.userId !== OWNER_UID).sort((a, b) => String(a.nom).localeCompare(String(b.nom), "ca"));
  const nm = uid => { const m = members.find(x => x.userId === uid); return m ? m.nom + " · " + m.email : uid; };
  return `<article class="card g-card"><span class="lbl">Administració global · ${admins.length + 1}</span>
    <div class="g-com"><b style="flex:1">${esc(nm(OWNER_UID))}</b><span class="note">Inicial</span></div>
    ${admins.map(a => `<div class="g-com"><span style="flex:1">${esc(nm(a.uid))}</span>${owner ? `<button class="btn sm" type="button" data-admdel="${esc(a.uid)}">Treu</button>` : ""}</div><div data-admbox="${esc(a.uid)}"></div>`).join("")}
    ${owner ? `<div class="g-com"><select class="field" id="gAdmNew"><option value="">Tria una persona…</option>${cand.map(m => `<option value="${esc(m.userId)}">${esc(m.nom)} · ${esc(m.email)}</option>`).join("")}</select><button class="btn cl-pri" type="button" id="gAdmAdd">Afegeix</button></div>
      <p class="note">L'administració global veu i edita tots els clubs i usuaris. Només l'administració inicial en pot afegir o treure.</p>` : `<p class="note">Només l'administració inicial en pot afegir o treure.</p>`}</article>`;
}

/* ---------- fitxa d'una persona ---------- */
function openMember(id){
  const m = members.find(x => x.userId === id); if(!m) return;
  openId = id;
  const self = id === user.uid, C = comsOf(m.clubId), R = rolsOf(m.clubId), on = m.estat === "aprovat";
  const tog = (attr, k, v, t) => `<button class="btn sm" type="button" ${attr}="${esc(k)}" aria-pressed="${!!v}">${esc(t)}</button>`;
  sheet(m.nom, `
    <p class="note" style="margin:0">${esc(m.email)} · ${esc(ESTAT[m.estat] || m.estat)}${ms(m.creat) ? " · alta demanada el " + esc(dayStr(ms(m.creat))) : ""}</p>
    <div class="g-grp"><label class="lbl" for="mNom">Nom</label><div class="g-com"><input class="field" id="mNom" type="text" maxlength="80" value="${esc(m.nom)}"><button class="btn cl-pri" type="button" id="mNomOk">Desa</button></div></div>
    ${on ? `<div class="g-grp"><span class="lbl">Comissions i rol</span><div class="acc-roles">${Object.entries(C).map(([k, t]) => tog("data-mcom", k, (m.comissions || []).includes(k), t)).join("")}</div>
      <p class="note">La Junta pot marcar com a resolts els avisos de seguretat (com el permís «Seguretat»).</p></div>
    <div class="g-grp"><span class="lbl">Rols i permisos</span>${self ? `<p class="note">No pots canviar els teus propis rols ni permisos.</p>` : `
      <div class="acc-roles">${Object.entries(R).map(([k, r]) => tog("data-mrol", k, (m.rolsClub || []).includes(k), r.nom)).join("") || `<span class="note">El club encara no té rols: crea'n a la pestanya «Rols».</span>`}</div>`}
      <p class="note">${m.premium ? "Premium: ho pot fer tot dins del club." : "Pot: " + esc(permT(effOf(m, R)) || "res especial")}</p>
      ${self ? "" : `<details class="g-det"${extraOf(m).length ? " open" : ""}><summary>Permisos extra (excepcions)</summary>
        ${Object.entries(PERMS).map(([k, p]) => `<label class="cl-sw"><span><b>${p.t}</b><small class="note">${esc(p.d)}</small></span><input type="checkbox" class="switch" data-mextra="${k}"${extraOf(m).includes(k) ? " checked" : ""}></label>`).join("")}</details>`}</div>` : ""}
    ${isAdm && !self ? `<div class="g-grp"><span class="lbl">Només administració</span>
      ${on ? `<label class="cl-sw"><span><b>Premium</b><small class="note">Gestiona el seu club des d'aquesta web.</small></span><input type="checkbox" class="switch" id="mPrem"${m.premium ? " checked" : ""}></label>` : ""}
      <label class="lbl" for="mClub">Club</label><select class="field" id="mClub">${Object.keys(clubs).concat(clubs[m.clubId] ? [] : [m.clubId]).map(c => `<option value="${esc(c)}"${c === m.clubId ? " selected" : ""}>${esc(clubName(c))}</option>`).join("")}</select>
      <p class="note">En canviar de club es treuen les comissions, els rols i premium.</p></div>` : ""}
    ${!self ? `<div class="g-grp"><span class="lbl">Accés</span>${on ? `<div id="mRevoke"></div>` : `<button class="btn cl-pri g-wide" type="button" data-mestat="aprovat">${m.estat === "rebutjat" ? "Torna a donar l'alta" : "Aprova"}</button>`}</div>` : ""}`, d => {
    const rev = $("mRevoke"); if(rev) slideConfirm(rev, "Llisca per treure l'accés", () => update(id, {estat:"rebutjat", revisatPer:user.uid, revisatAt:F.serverTimestamp()}, true));
    d.addEventListener("click", e => {
      const b = e.target.closest("button"); if(!b) return;
      if(b.dataset.mcom){ const c = (m.comissions || []).filter(k => C[k]); update(id, {comissions: c.includes(b.dataset.mcom) ? c.filter(x => x !== b.dataset.mcom) : c.concat([b.dataset.mcom])}); }
      if(b.dataset.mrol){ const cur = (m.rolsClub || []).filter(k => R[k]), k = b.dataset.mrol; setPerms(m, cur.includes(k) ? cur.filter(x => x !== k) : cur.concat([k]), extraOf(m)); }
      if(b.dataset.mestat) update(id, {estat:b.dataset.mestat, revisatPer:user.uid, revisatAt:F.serverTimestamp()}, true);
      if(b.id === "mNomOk"){ const v = $("mNom").value.trim().slice(0, 80); if(v && v !== m.nom) update(id, {nom:v}); }
    });
    d.addEventListener("change", async e => {
      const t = e.target;
      if(t.dataset.mextra){ const k = t.dataset.mextra, P = extraOf(m); setPerms(m, (m.rolsClub || []).filter(r => R[r]), t.checked ? P.filter(x => x !== k).concat([k]) : P.filter(x => x !== k)); }
      if(t.id === "mPrem") update(id, {premium: t.checked});
      if(t.id === "mClub" && t.value !== m.clubId){
        // Primer es treuen els rols del club vell (regla «rols»), després es canvia de club (regla d'administració)
        if((m.comissions || []).length || m.responsable){ if(!await update(id, {comissions:[], responsable:false}, false, true)) return; }
        if((m.rolsClub || []).length){ const X = extraOf(m); if(!await update(id, {rolsClub:[], permisosExtra:X, permisos:X}, false, true)) return; }   // els rols són del club vell
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

// Rols i permisos extra d'una persona → recalcula «permisos»
async function setPerms(m, rolsClub, extra){
  if(m.responsable){ try{ await F.updateDoc(F.doc(db, "members", m.userId), {responsable:false}); m.responsable = false; }catch(e){} }
  const x = Object.assign({}, m, {rolsClub, permisosExtra:extra});
  return update(m.userId, {rolsClub, permisosExtra:extra, permisos:effOf(x, rolsOf(m.clubId))});
}
// Després de canviar els rols del club: recalcula les persones afectades (no a un mateix: les regles no ho deixen)
async function recalc(id){
  const R = rolsOf(id), L = members.filter(m => m.clubId === id && (m.rolsClub || []).length);
  let skipped = false, fails = 0;
  for(const m of L){
    const rc = (m.rolsClub || []).filter(r => R[r]), x = Object.assign({}, m, {rolsClub:rc}), P = effOf(x, R);
    if(rc.length === (m.rolsClub || []).length && P.slice().sort().join() === (m.permisos || []).slice().sort().join()) continue;
    if(m.userId === user.uid){ skipped = true; continue; }
    try{ const patch = {rolsClub:rc, permisosExtra:extraOf(m), permisos:P}; await F.updateDoc(F.doc(db, "members", m.userId), patch); Object.assign(m, patch); }catch(e){ fails++; }
  }
  say(fails ? `No s'han pogut actualitzar ${fails} persones.` : skipped ? "Els teus propis permisos no s'actualitzen: demana a una altra persona gestora que t'obri la fitxa." : "");
}

/* ---------- comissions, rols i clubs ---------- */
async function saveClub(id, patch){
  const cur = clubs[id] || {nom:"", comissions:COMS0}, next = {nom:cur.nom || clubName(id), titol:cur.titol || "", logo:cur.logo || "", comissions:cur.comissions || COMS0, rols:cur.rols || tpl, ...patch};
  const doc = {nom:next.nom, comissions:next.comissions, rols:next.rols, actualitzat:F.serverTimestamp(), actualitzatPer:user.uid};
  if(next.titol) doc.titol = next.titol; if(next.logo) doc.logo = next.logo;
  try{ await F.setDoc(F.doc(db, "clubs", id), doc); clubs[id] = next; say(""); if(patch.rols) await recalc(id); render(); return true; }
  catch(e){ say(errText(e)); return false; }
}

async function saveTpl(next){
  try{ await F.setDoc(F.doc(db, "config", "global"), {plantilles:next, actualitzat:F.serverTimestamp(), actualitzatPer:user.uid}); tpl = next; say(""); render(); }
  catch(e){ say(errText(e)); }
}
const rolesIn = sc => sc === "tpl" ? tpl : rolsOf(club);
const saveRoles = (sc, next) => sc === "tpl" ? saveTpl(next) : saveClub(club, {rols:next});

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
  const rows = [["Nom", "Correu", "Club", "Estat", "Premium", "Comissions", "Rols", "Permisos", "Alta demanada"]].concat(L.map(m => [m.nom, m.email, clubName(m.clubId), ESTAT[m.estat] || m.estat, m.premium ? "sí" : "", (m.comissions || []).map(k => comsOf(m.clubId)[k]).filter(Boolean).join(", "), (m.rolsClub || []).map(r => rolsOf(m.clubId)[r]?.nom).filter(Boolean).join(", "), (m.permisos || []).map(k => PERMS[k]?.t).filter(Boolean).join(", "), ms(m.creat) ? new Date(ms(m.creat)).toISOString().slice(0, 10) : ""]));
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
  if(b.dataset.rperm){ const sc = b.dataset.scope, R = rolesIn(sc), k = b.dataset.rperm, p = b.dataset.p, r = R[k]; if(!r) return;
    const P = r.permisos || []; saveRoles(sc, Object.assign({}, R, {[k]: {nom:r.nom, permisos: P.includes(p) ? P.filter(x => x !== p) : P.concat([p])}})); return; }
  if(b.dataset.radd){ const sc = b.dataset.radd, R = rolesIn(sc), n = ($(sc + "New")?.value || "").trim(); if(!n) return;
    let k = slug(n) || "rol", i = 2; while(R[k]) k = (slug(n) || "rol") + "-" + i++; saveRoles(sc, Object.assign({}, R, {[k]: {nom:n.slice(0, 40), permisos:[]}})); return; }
  if(b.dataset.rdel){ const sc = b.dataset.scope, R = rolesIn(sc), k = b.dataset.rdel, box = document.querySelector(`[data-rbox="${sc}-${CSS.escape(k)}"]`);
    if(box) slideConfirm(box, "Llisca per eliminar " + (R[k]?.nom || ""), () => { const n = Object.assign({}, R); delete n[k]; saveRoles(sc, n); }); return; }
  if(b.id === "gAdmAdd"){ const u = $("gAdmNew")?.value; if(!u) return; const m = members.find(x => x.userId === u);
    try{ await F.setDoc(F.doc(db, "admins", u), {nom:m?.nom || "", afegit:F.serverTimestamp()}); await loadAdmins(); say(""); render(); }catch(err){ say(errText(err)); } return; }
  if(b.dataset.admdel){ const u = b.dataset.admdel, box = document.querySelector(`[data-admbox="${CSS.escape(u)}"]`);
    if(box) slideConfirm(box, "Llisca per treure l'administració", async () => { try{ await F.deleteDoc(F.doc(db, "admins", u)); await loadAdmins(); say(""); render(); }catch(err){ say(errText(err)); } }); return; }
  if(b.id === "gReload"){ b.disabled = true; if(GLOBAL){ const c = club; await loadAll(); club = c; } else await openClub(club); render(); return; }
  if(b.id === "gLogoDel"){ saveClub(club, {logo:""}); return; }
  if(b.id === "gAddCom"){ const n = ($("gNewCom")?.value || "").trim(); if(!n) return; const C = comsOf(club); let k = slug(n) || "comissio", i = 2; while(C[k]) k = (slug(n) || "comissio") + "-" + i++;
    saveClub(club, {comissions:Object.assign({}, C, {[k]: n.slice(0, 40)})}); return; }
  if(b.dataset.comdel){ const k = b.dataset.comdel, box = document.querySelector(`[data-combox="${CSS.escape(k)}"]`), C = comsOf(club);
    if(box) slideConfirm(box, "Llisca per eliminar " + (C[k] || ""), () => { const n = Object.assign({}, C); delete n[k]; saveClub(club, {comissions:n}); }); return; }
  if(b.id === "gAddClub"){ const n = ($("gNewClub")?.value || "").trim(); if(!n) return; let k = slug(n) || "club", i = 2; while(clubs[k]) k = (slug(n) || "club") + "-" + i++;
    b.disabled = true; clubs[k] = {nom:n.slice(0, 80), comissions:COMS0, rols:JSON.parse(JSON.stringify(tpl))}; if(!await saveClub(k, {})){ delete clubs[k]; render(); } return; }
});
document.addEventListener("change", e => {
  const t = e.target; if(t.closest && t.closest("#gSheet")) return;
  if(t.dataset && t.dataset.comname){ const k = t.dataset.comname, C = comsOf(club), v = t.value.trim().slice(0, 40);
    if(v && v !== C[k]) saveClub(club, {comissions:Object.assign({}, C, {[k]: v})}); else t.value = C[k]; }
  if(t.dataset && t.dataset.rname){ const sc = t.dataset.scope, R = rolesIn(sc), k = t.dataset.rname, v = t.value.trim().slice(0, 40);
    if(R[k] && v && v !== R[k].nom) saveRoles(sc, Object.assign({}, R, {[k]: Object.assign({}, R[k], {nom:v})})); else if(R[k]) t.value = R[k].nom; }
  if(t.id === "gClubTit"){ const v = t.value.trim().replace(/\s+/g, " ").slice(0, 24); if(v !== (clubs[club]?.titol || "")) saveClub(club, {titol:v}); }
  if(t.id === "gLogoFile" && t.files && t.files[0]){ const f = t.files[0]; t.value = "";
    logoData(f).then(d => saveClub(club, {logo:d})).catch(err => say(err.message || "No s'ha pogut fer servir aquesta imatge.")); }
  if(t.id === "gClubNom"){ const v = t.value.trim().slice(0, 80); if(v && v !== clubs[club]?.nom) saveClub(club, {nom:v}); }
});
document.addEventListener("input", e => {
  if(e.target.id === "gClubTit"){ const p = $("gTitPrev"); if(p) p.textContent = e.target.value.trim() || TITOL0; return; }
  if(e.target.id !== "gQ") return;
  flt.q = e.target.value; const pos = e.target.selectionStart; render();
  const i = $("gQ"); if(i){ i.focus(); try{ i.setSelectionRange(pos, pos); }catch(err){} }
});
document.addEventListener("keydown", e => { if(e.key === "Escape") closeSheet(); if(e.key === "Enter" && (e.target.id === "gPass" || e.target.id === "gMail")) $("gLogin")?.click(); });

boot();
})();
