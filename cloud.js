"use strict";
/* ============ Ocata Vent 2 · comptes de soci i sortides al núvol (Firebase) ============
   Firebase només es descarrega si en aquest mòbil ja s'havia iniciat sessió, si s'obre un enllaç d'accés
   o si es prem un botó d'entrar. Qui no entra no descarrega res i fa servir l'app com sempre.
   El mòbil continua sent el magatzem principal (IndexedDB): el núvol n'és una còpia per compte. */
(() => {
const FB_VER = "13.0.0";
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
const FB_CONFIG = {
  apiKey: "AIzaSyDp1A_kJusg-ni5p4JY_62n9I2WF1H8smY",
  authDomain: "ocatavent.firebaseapp.com",
  projectId: "ocatavent",
  storageBucket: "ocatavent.firebasestorage.app",
  messagingSenderId: "355609249243",
  appId: "1:355609249243:web:9dc0b7f7b22ccb332953fe"
};
const OWNER_UID = "aHjoROUH3aQsHh6ksS3Tt1p5soF2";   // administrador inicial (també fixat a firestore.rules)
const CLUB_ID = "ocatavent";
const CONSENT_V = "2026-10-13";                      // canvia-la si canvia el text de consentiment
const CHUNK = 400000;                                // caràcters per tros (Firestore: màx. 1 MiB per document)
const MAX_TRAMS = 20;

let A = null, F = null, app = null, auth = null, db = null, loading = null, fsLoading = null;
let user = null, member = null, isAdm = false, ready = false, offline = false;
let pendingLink = null, syncing = false, syncAgain = false, syncErr = "", lastSync = 0, lastRefresh = 0, delStep = false;
let flash = {t:"", err:false};

const approved = () => !!(user && member && member.estat === "aprovat");
const say = (t, err) => { flash = {t, err:!!err}; const m = $("accMsg"); if(m){ m.textContent = t; m.hidden = !t; m.classList.toggle("err", !!err); if(t) m.scrollIntoView({block:"nearest", behavior:"smooth"}); } };
// Firestore no avisa si no arriba al servidor: espera indefinidament. Amb això, al cap de 15 s hi ha un missatge.
const T = (p, ms = 15000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({code:"timeout"}), ms))]);
const ERR = {
  "auth/popup-closed-by-user": "Has tancat la finestra abans d'acabar.",
  "auth/cancelled-popup-request": "Has tancat la finestra abans d'acabar.",
  "auth/popup-blocked": "El mòbil no ha deixat obrir la finestra de Google. Prova-ho amb l'enllaç per correu.",
  "auth/operation-not-supported-in-this-environment": "Aquí no es pot obrir la finestra de Google. Prova-ho amb l'enllaç per correu.",
  "auth/network-request-failed": "Sense connexió. Torna-ho a provar quan en tinguis.",
  "auth/operation-not-allowed": "L'entrada per correu encara no està activada al club. Avisa l'administrador.",
  "auth/unauthorized-domain": "Aquest domini no està autoritzat a Firebase (Authentication → Settings → Authorized domains).",
  "auth/unauthorized-continue-uri": "Aquest domini no està autoritzat a Firebase (Authentication → Settings → Authorized domains).",
  "auth/invalid-email": "El correu no és vàlid.",
  "auth/invalid-action-code": "L'enllaç ja s'ha fet servir o ha caducat. Demana'n un de nou.",
  "auth/expired-action-code": "L'enllaç ha caducat. Demana'n un de nou.",
  "auth/invalid-credential": "Correu o contrasenya incorrectes. Si entraves amb Google o amb enllaç, prem «He oblidat la contrasenya» per posar-ne una.",
  "auth/wrong-password": "Contrasenya incorrecta.",
  "auth/user-not-found": "No hi ha cap compte amb aquest correu. Fes-te'n un a «Alta nova».",
  "auth/email-already-in-use": "Aquest correu ja té compte (potser amb Google). Ves a «Ja soc soci» i prem «He oblidat la contrasenya» per posar-ne una.",
  "auth/weak-password": "La contrasenya ha de tenir almenys 6 caràcters.",
  "auth/missing-password": "Escriu la contrasenya.",
  "auth/too-many-requests": "Massa intents seguits. Espera uns minuts.",
  "auth/requires-recent-login": "Per seguretat, torna a entrar i repeteix-ho de seguida.",
  "permission-denied": "La base de dades ho ha refusat (permission-denied). Comprova que les regles de firestore.rules estan publicades a la consola de Firebase.",
  "timeout": "La base de dades no respon. Comprova la connexió; un bloquejador d'anuncis també ho pot impedir.",
  "unavailable": "Sense connexió amb el núvol. Torna-ho a provar més tard."
};
const errText = e => !A ? "Sense connexió: ara no es pot entrar. Torna-ho a provar quan en tinguis." : ERR[e && e.code] || "No s'ha pogut fer" + (e && e.code ? " (" + e.code + ")." : ".");

/* ---------- càrrega de Firebase (a demanda) ---------- */
function load(){
  if(loading) return loading;
  loading = (async () => {
    const [fa, a] = await Promise.all([import(FB_BASE + "firebase-app.js"), import(FB_BASE + "firebase-auth.js")]);
    A = a; app = fa.initializeApp(FB_CONFIG);
    auth = a.initializeAuth(app, {persistence:[a.indexedDBLocalPersistence, a.browserLocalPersistence], popupRedirectResolver:a.browserPopupRedirectResolver});
    auth.languageCode = "ca";
    offline = false;
    await handleLink();
    await auth.authStateReady();
    a.onAuthStateChanged(auth, onUser);
  })().catch(e => { loading = null; offline = true; if(store.get("ov2_cloud")) render(); throw e; });
  return loading;
}
function fs(){
  if(fsLoading) return fsLoading;
  fsLoading = import(FB_BASE + "firebase-firestore.js").then(f => { F = f; db = f.initializeFirestore(app, {ignoreUndefinedProperties:true}); return f; })
    .catch(e => { fsLoading = null; throw e; });
  return fsLoading;
}

/* ---------- sessió i fitxa de soci ---------- */
const emit = () => window.dispatchEvent(new CustomEvent("ov-cloud"));   // club.js escolta els canvis de sessió i de soci
async function onUser(u){
  user = u; member = null; isAdm = false; delStep = false;
  if(!u){ store.del("ov2_cloud"); ready = true; render(); refreshList(); emit(); return; }
  store.set("ov2_cloud", 1); store.set("ov2_had", 1); accMode = "entra";
  try{
    await readMember();
    if(!member){ const c = store.get("ov2_consent"); if(c && c.v === CONSENT_V) await createMember(c.nom); }
  }catch(e){ say(errText(e), true); }
  ready = true; render(); emit();
  await flushDeletes();
  if(approved()) sync(); else refreshList();
}
async function readMember(){
  const f = await fs();
  isAdm = user.uid === OWNER_UID || await f.getDoc(f.doc(db, "admins", user.uid)).then(d => d.exists(), () => false);
  const snap = await T(f.getDoc(f.doc(db, "members", user.uid)));
  member = snap.exists() ? snap.data() : null;
}
async function createMember(nom){
  const f = await fs(), mail = user.email || "";
  const n = String(nom || user.displayName || mail.split("@")[0] || "Soci").trim().slice(0, 80);
  await T(f.setDoc(f.doc(db, "members", user.uid), {userId:user.uid, clubId:CLUB_ID, email:mail, nom:n,
    estat: isAdm ? "aprovat" : "pendent", consentVersio:CONSENT_V, consentAt:f.serverTimestamp(), creat:f.serverTimestamp()}));
  store.del("ov2_consent");
  await readMember();
}
// Pantalla d'entrada: «Ja soc soci» (només entra) o «Alta nova» (nom + consentiment). Per defecte, «Ja soc soci»
// si aquest mòbil ja havia tingut compte; si no, «Alta nova».
let accMode = store.get("ov2_had") ? "entra" : "alta";
function consentFromForm(){
  if(accMode === "entra") return true;   // si no té fitxa de soci, després d'entrar se li demana l'alta
  const ck = $("accConsent");
  if(!ck || !ck.checked){ say("Per crear el compte cal marcar la casella d'acceptació.", true); return false; }
  store.set("ov2_consent", {v:CONSENT_V, nom:($("accName")?.value || "").trim()});
  return true;
}

/* ---------- entrar i sortir ---------- */
async function google(){
  if(!consentFromForm()) return;
  say("Obrint Google…");
  try{ await load(); await A.signInWithPopup(auth, new A.GoogleAuthProvider()); say(""); }
  catch(e){ say(errText(e), true); }
}
/* ---------- correu i contrasenya ---------- */
const mailOk = m => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m);
const formMail = () => ($("accMail")?.value || "").trim().toLowerCase();
async function passLogin(){
  const mail = formMail(), pw = $("accPass")?.value || "";
  if(!mailOk(mail)){ say("Escriu un correu vàlid.", true); return; }
  if(!pw){ say("Escriu la contrasenya.", true); return; }
  say("Entrant…");
  try{ await load(); await A.signInWithEmailAndPassword(auth, mail, pw); say(""); }
  catch(e){ say(errText(e), true); }
}
async function passCreate(){
  const mail = formMail(), pw = $("accPass")?.value || "", pw2 = $("accPass2")?.value || "";
  if(!($("accName")?.value || "").trim()){ say("Escriu el nom i cognoms.", true); return; }
  if(!mailOk(mail)){ say("Escriu un correu vàlid.", true); return; }
  if(pw.length < 6){ say("La contrasenya ha de tenir almenys 6 caràcters.", true); return; }
  if(pw !== pw2){ say("Les dues contrasenyes no coincideixen.", true); return; }
  if(!consentFromForm()) return;
  say("Creant el compte…");
  try{ await load(); await A.createUserWithEmailAndPassword(auth, mail, pw); say(""); }
  catch(e){ store.del("ov2_consent"); say(errText(e), true); }
}
async function passReset(){
  const mail = formMail();
  if(!mailOk(mail)){ say("Escriu primer el teu correu a dalt.", true); return; }
  say("Enviant…");
  try{ await load(); await A.sendPasswordResetEmail(auth, mail);
    say(`Si ${mail} té compte, t'hi arribarà un correu per posar una contrasenya nova. Mira també el correu brossa.`); }
  catch(e){ say(errText(e), true); }
}
async function sendLink(){
  const mail = ($("accMail")?.value || "").trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)){ say("Escriu un correu vàlid.", true); return; }
  if(!consentFromForm()) return;
  say("Enviant l'enllaç…");
  try{
    await load();
    await A.sendSignInLinkToEmail(auth, mail, {url: linkUrl(), handleCodeInApp:true});
    store.set("ov2_link_mail", mail);
    say(`T'hem enviat un enllaç a ${mail}. Obre'l en aquest mòbil. Pot trigar uns minuts: mira també el correu brossa.`);
  }catch(e){ say(errText(e), true); }
}
// A l'app Android, l'enllaç porta «app=1»: si s'obre al navegador, native.js el torna a enviar a l'app
const linkUrl = () => location.origin + location.pathname + (window.OV_NATIVE ? "?app=1" : "");
async function handleLink(){
  if(window.OV_APP_LINK) return;   // és per a l'app: el navegador no el fa servir
  if(!A.isSignInWithEmailLink(auth, location.href)) return;
  const mail = store.get("ov2_link_mail");
  if(!mail){ pendingLink = location.href; history.replaceState(null, "", location.pathname); openPanel(); return; }
  await finishLink(mail, location.href);
}
async function finishLink(mail, href){
  try{ await A.signInWithEmailLink(auth, mail, href); store.del("ov2_link_mail"); pendingLink = null; say(""); }
  catch(e){ pendingLink = null; say(errText(e), true); openPanel(); }
  finally{ if(location.search) history.replaceState(null, "", location.pathname); }
}
async function logout(){ try{ await A.signOut(auth); say("Has tancat la sessió. Les sortides d'aquest mòbil es queden al mòbil."); }catch(e){ say(errText(e), true); } }
async function requestJoin(){
  if(!consentFromForm()) return;
  say("Enviant la sol·licitud…");
  try{ await createMember(store.get("ov2_consent")?.nom); say(member ? (member.estat === "aprovat" ? "Alta feta: ets administrador i ja estàs aprovat." : "Sol·licitud enviada.") : "No s'ha pogut comprovar l'alta.", !member); render(); emit(); if(approved()) sync(); }
  catch(e){ say(errText(e), true); }
}

/* ---------- sincronització de sortides ---------- */
const sid = id => user.uid + "_" + id;
async function flushDeletes(){
  if(!user) return;
  const q = store.get("ov2_cloud_del") || [], mine = q.filter(d => d.uid === user.uid);
  if(!mine.length) return;
  const left = q.filter(d => d.uid !== user.uid);
  for(const d of mine){ try{ await delRemote(d.id); }catch(e){ left.push(d); } }
  store.set("ov2_cloud_del", left);
}
async function delRemote(id){
  const f = await fs(), ref = f.doc(db, "sortides", sid(id));
  let n = MAX_TRAMS; try{ const r = await f.getDoc(ref); if(r.exists()) n = r.data().trams || MAX_TRAMS; }catch(e){}
  const b = f.writeBatch(db); b.delete(ref);
  for(let i = 0; i < n; i++) b.delete(f.doc(db, "sortides", sid(id), "trams", String(i)));
  await b.commit();
}
async function upload(t){
  const f = await fs(), uid = user.uid;
  const clean = JSON.parse(JSON.stringify(t)); delete clean.owner; delete clean.synced;
  const body = JSON.stringify(clean), n = Math.max(1, Math.ceil(body.length / CHUNK));
  if(n > MAX_TRAMS) throw {code:"massa-gran"};
  // Primer els trossos i al final la fitxa: si la fitxa existeix, la sortida és sencera
  for(let i = 0; i < n; i++) await f.setDoc(f.doc(db, "sortides", sid(t.id), "trams", String(i)), {userId:uid, i, d:body.slice(i*CHUNK, (i+1)*CHUNK)});
  const s = clean.summary || {};
  await f.setDoc(f.doc(db, "sortides", sid(t.id)), {userId:uid, clubId:member.clubId || CLUB_ID, visibilitat:"privat", tripId:t.id,
    nom:String(t.name || "").slice(0, 120), act:String(t.act || ""), inici:t.start, fi:t.end || t.start,
    distNm: typeof s.distNm === "number" && isFinite(s.distNm) ? s.distNm : 0, trams:n, v:1, pujada:f.serverTimestamp()});
  t.owner = uid; t.synced = true; await DB.put(t);
}
async function download(r){
  const f = await fs(), parts = [];
  for(let i = 0; i < r.trams; i++){ const d = await f.getDoc(f.doc(db, "sortides", sid(r.tripId), "trams", String(i))); if(!d.exists()) return null; parts.push(d.data().d); }
  const t = JSON.parse(parts.join("")); t.owner = user.uid; t.synced = true; return t;
}
async function sync(){
  if(!approved()) return;
  if(syncing){ syncAgain = true; return; }
  syncing = true; syncAgain = false; syncErr = ""; renderCard();
  let changed = false;
  try{
    const f = await fs(), uid = user.uid;
    await flushDeletes();
    const qs = await f.getDocs(f.query(f.collection(db, "sortides"), f.where("userId", "==", uid)));
    const remote = new Map(); qs.forEach(d => { const x = d.data(); remote.set(x.tripId, x); });
    const local = (await DB.all()) || [], have = new Set(local.map(t => t.id));
    for(const t of local){
      if(!t.owner && remote.has(t.id)){ t.owner = uid; t.synced = true; await DB.put(t); continue; }   // la mateixa sortida (p. ex. d'una còpia de seguretat)
      if(t.owner !== uid || remote.has(t.id)) continue;
      if(t.synced){ await DB.del(t.id); changed = true; }          // esborrada des d'un altre mòbil
      else { try{ await upload(t); }catch(e){ if(e && e.code === "massa-gran") syncErr = "Hi ha una sortida massa llarga per pujar-la al núvol (es queda al mòbil)."; else throw e; } }
    }
    for(const [id, r] of remote){ if(have.has(id)) continue; const t = await download(r); if(t){ await DB.put(t); changed = true; } }
    lastSync = Date.now();
  }catch(e){ syncErr = e && e.code === "unavailable" ? "Sense connexió: es pujaran quan n'hi hagi." : errText(e); }
  finally{ syncing = false; if(changed) refreshList(); else renderCard(); if(syncAgain) sync(); }
}
async function adopt(){   // passa al compte les sortides que només eren en aquest mòbil
  const local = (await DB.all()) || [];
  for(const t of local) if(!t.owner){ t.owner = user.uid; t.synced = false; await DB.put(t); }
  sync();
}
function refreshList(){   // torna a pintar l'historial si s'està mirant la llista (no el detall)
  if(!$("view-log").hidden && !$("logList").hidden && typeof renderList === "function") renderList(); else renderCard();
}

/* ---------- esborrar el compte ---------- */
async function deleteAccount(){
  const uid = user.uid;
  say("Esborrant…");
  try{
    const recent = Date.now() - Date.parse(user.metadata.lastSignInTime) < 4*60e3;
    if(!recent){
      if(user.providerData.some(p => p.providerId === "google.com")) await A.reauthenticateWithPopup(user, new A.GoogleAuthProvider());
      else { delStep = "relink"; render(); say("Per seguretat, cal tornar a entrar abans d'esborrar el compte. Demana un enllaç nou i, quan tornis, esborra'l de seguida.", true); return; }
    }
    const f = await fs();
    const qs = await f.getDocs(f.query(f.collection(db, "sortides"), f.where("userId", "==", uid)));
    for(const d of qs.docs) await delRemote(d.data().tripId);
    try{ await window.OV_CLUB?.purge(); }catch(e){}   // publicacions, reaccions, avisos, anuncis i presència del club
    try{ await window.OV_PRIV?.purge(); }catch(e){}   // amistats i perfil
    await f.deleteDoc(f.doc(db, "members", uid));
    await A.deleteUser(user);
    for(const t of ((await DB.all()) || [])) if(t.owner === uid){ delete t.owner; delete t.synced; await DB.put(t); }
    store.set("ov2_cloud_del", (store.get("ov2_cloud_del") || []).filter(d => d.uid !== uid));
    store.del("ov2_cloud"); store.del("ov2_consent"); store.del("ov2_had"); accMode = "alta";
    say("Compte esborrat, amb la fitxa de soci, les sortides del núvol i el que havies publicat al club. Les sortides d'aquest mòbil es queden al mòbil.");
  }catch(e){ say(errText(e), true); render(); }
}
async function relink(){
  try{ await A.sendSignInLinkToEmail(auth, user.email, {url: linkUrl(), handleCodeInApp:true});
    store.set("ov2_link_mail", user.email); say(`T'hem enviat un enllaç a ${user.email}. Obre'l i esborra el compte de seguida.`); }
  catch(e){ say(errText(e), true); }
}

/* ---------- interfície: secció «Compte» de la configuració ---------- */
const CONSENT_HTML = `
  <p><b>Responsable:</b> Club Ocata Vent (El Masnou).</p>
  <p><b>Què es desa:</b> el teu nom, el correu del compte i la data d'aquesta acceptació, perquè els administradors del club et reconeguin i aprovin l'alta. I les sortides que hi pugis: ruta GPS, hores, velocitats i vent.</p>
  <p><b>Qui ho veu:</b> les sortides són privades, només les veus tu. El que publiques al club (sortides, «qui surt», anuncis), on ets i els avisos de seguretat ho veu qui triïs a Configuració ▸ Confidencialitat: tothom, el club, la junta, els teus amics o ningú. Els socis veuen el teu nom per poder-te afegir com a amic. Els administradors veuen el nom i el correu dels socis.</p>
  <p><b>Presència a la base:</b> només si l'actives. Mentre ets a la base o navegant, els responsables (o tot el club, si ho tries) veuen on ets. S'esborra en acabar o al cap de 24 h.</p>
  <p><b>On:</b> Google Firebase. El compte el gestiona Firebase Authentication; les sortides es guarden a Cloud Firestore, en servidors de la Unió Europea.</p>
  <p><b>Per a què:</b> només perquè l'app funcioni. No es ven ni es cedeix a ningú, i el correu no s'envia a cap altre servei.</p>
  <p><b>Els teus drets:</b> pots esborrar el compte i totes les dades del núvol des d'aquí mateix, quan vulguis. Per consultar-les o corregir-les, adreça't a la junta del club.</p>
  <p><b>Edat:</b> només per a majors de 18 anys.</p>
  <p><b>Avís:</b> l'app no substitueix el VHF (canal 16) ni el 112.</p>`;
const consentBlock = (withName) => `
  ${withName ? `<label class="tn-name"><span class="lbl">Nom i cognoms</span><input class="field" id="accName" type="text" autocomplete="name" maxlength="80" style="font-family:var(--f-body)" value="${esc(user?.displayName || store.get("ov2_consent")?.nom || "")}"></label>` : ""}
  <div class="acc-ck"><input type="checkbox" id="accConsent"><label for="accConsent">Tinc 18 anys o més i accepto el tractament de dades que s'explica a la (i).</label>
    <button class="ib-i" type="button" data-info="iConsent" aria-label="Com es tracten les dades" aria-expanded="false">i</button></div>
  <div class="vp-info" id="iConsent" hidden>${CONSENT_HTML}</div>`;
const delBlock = () => `
  <details class="acc-del"><summary>Esborra el compte</summary>
    <p class="note">S'esborraran el compte, la fitxa de soci, les teves sortides del núvol i tot el que hagis publicat o marcat al club (publicacions, reaccions, avisos, anuncis i presència). No es pot desfer. Les còpies que hi ha en aquest mòbil es queden al mòbil.</p>
    ${delStep === "relink" ? `<button class="btn" type="button" id="accRelink">Envia'm un enllaç nou</button>` : `<div id="accDel"></div>`}
  </details>`;

function render(){
  const body = $("accBody"); if(!body) return;
  const peek = $("peekAcc");
  let h = "";
  if(pendingLink){
    peek.textContent = "Entrant…";
    h = `<p class="note">Escriu el correu on has rebut l'enllaç.</p>
      <input class="field" id="accLinkMail" type="email" autocomplete="email" placeholder="correu@exemple.cat">
      <button class="btn" type="button" id="accFinish">Entra</button>`;
  } else if(!user && store.get("ov2_cloud") && !ready && !offline){
    peek.textContent = "Connectant…"; h = `<p class="note">Connectant amb el compte…</p>`;
  } else if(!user && offline && store.get("ov2_cloud")){
    peek.textContent = "Sense connexió";
    h = `<p class="note">Ara no es pot connectar amb el compte. Les sortides es desen al mòbil i es pujaran quan hi hagi connexió.</p>
      <button class="btn" type="button" id="accRetry">Torna-ho a provar</button>`;
  } else if(!user){
    peek.textContent = "Sense compte";
    const alta = accMode === "alta";
    const google = (window.OV_NATIVE ? "" : `<button class="btn acc-wide" type="button" id="accGoogle">${alta ? "Alta amb Google" : "Entra amb Google"}</button>
      <div class="acc-or">o amb correu i contrasenya</div>`)
      + (window.OV_NATIVE && !alta ? `<p class="note">Si fins ara entraves amb Google, prem «He oblidat la contrasenya» per posar-ne una al mateix compte.</p>` : "");
    h = `<div class="seg acc-mode" role="group" aria-label="Tipus d'entrada">
        <button type="button" id="accModeEntra" aria-pressed="${!alta}">Ja soc soci</button>
        <button type="button" id="accModeAlta" aria-pressed="${alta}">Alta nova</button></div>
      ${alta ? `<p class="note">Opcional. Amb un compte de soci aprovat, les sortides es desen al núvol i les recuperes en qualsevol mòbil. Sense compte, l'app funciona igual.</p>
      ${consentBlock(true)}` : ""}
      ${google}
      <label class="acc-f"><span class="lbl">Correu</span><input class="field" id="accMail" type="email" autocomplete="${alta ? "email" : "username"}" placeholder="correu@exemple.cat"></label>
      <label class="acc-f"><span class="lbl">Contrasenya</span><input class="field" id="accPass" type="password" autocomplete="${alta ? "new-password" : "current-password"}" minlength="6"></label>
      ${alta ? `<label class="acc-f"><span class="lbl">Repeteix la contrasenya</span><input class="field" id="accPass2" type="password" autocomplete="new-password" minlength="6"></label>
      <button class="btn acc-wide acc-main" type="button" id="accCreate">Crea el compte</button>`
      : `<button class="btn acc-wide acc-main" type="button" id="accLogin">Entra</button>
      <div class="acc-alt"><button class="lnk" type="button" id="accReset">He oblidat la contrasenya</button>
        <button class="lnk" type="button" id="accLink">Envia'm un enllaç d'accés</button></div>`}`;
  } else {
    const who = `<div class="vp-row"><div class="acc-who"><b>${esc(member?.nom || user.displayName || "")}</b><span>${esc(user.email || "")}${isAdm ? " · administrador" : ""}</span></div>
        <button class="ib-i" type="button" data-info="iUid" aria-label="Identificador del compte" aria-expanded="false">i</button></div>
      <p class="vp-info" id="iUid" hidden>ID del compte: <b style="font-family:var(--f-mono);word-break:break-all">${esc(user.uid)}</b>${user.uid === OWNER_UID ? "<br>És l'administrador inicial." : ""}</p>`;
    if(!member){
      peek.textContent = "Falta l'alta";
      h = who + `<p class="note">Has entrat, però encara no has demanat l'alta de soci.</p>${consentBlock(true)}
        <button class="btn acc-wide" type="button" id="accJoin">Sol·licita l'alta</button>`;
    } else if(member.estat === "pendent"){
      peek.textContent = "Pendent d'aprovació";
      h = who + `<div class="warnbox">Sol·licitud enviada. Un administrador del club l'ha d'aprovar. Mentrestant, les sortides es desen només en aquest mòbil.</div>`;
    } else if(member.estat === "rebutjat"){
      peek.textContent = "No aprovat";
      h = who + `<div class="warnbox">L'alta no s'ha aprovat. Si creus que és un error, parla amb la junta del club.</div>`;
    } else {
      peek.textContent = (isAdm ? "Administrador" : "Soci") + " · " + (member.nom || user.email || "");
      h = who + `<p class="note">Soci aprovat. Les sortides es desen al núvol, privades: només les veus tu.</p>`;
    }
    h += `<button class="btn" type="button" id="accOut">Tanca la sessió</button>` + delBlock();
  }
  body.innerHTML = `<div class="msg${flash.err ? " err" : ""}" id="accMsg"${flash.t ? "" : " hidden"}>${esc(flash.t)}</div>` + h;
  const d = $("accDel"); if(d) slideConfirm(d, "Llisca per esborrar el compte", deleteAccount);
}
function openPanel(){
  const p = $("viewPanel"); if(!p) return;
  p.hidden = false; $("themeBtn").setAttribute("aria-expanded", "true");
  const s = $("accSec"); if(s) s.open = true;
  render();
}
async function refresh(){   // en obrir la configuració: comprova si ja t'han aprovat i les altes noves
  if(!user || Date.now() - lastRefresh < 20000) return;
  lastRefresh = Date.now();
  const was = member?.estat;
  try{ await readMember(); }catch(e){ return; }
  render(); emit();
  if(member?.estat !== was && approved()) sync();
}

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#accBody button"); if(!t || t.classList.contains("ib-i")) return;
  if(t.disabled) return; t.disabled = true; setTimeout(() => { t.disabled = false; }, 1500);
  if(t.id === "accModeEntra" || t.id === "accModeAlta"){ accMode = t.id === "accModeAlta" ? "alta" : "entra"; flash = {t:"", err:false}; render(); t.disabled = false; return; }
  if(t.id === "accGoogle") google();
  else if(t.id === "accLogin") passLogin();
  else if(t.id === "accCreate") passCreate();
  else if(t.id === "accReset") passReset();
  else if(t.id === "accLink") sendLink();
  else if(t.id === "accFinish"){ const m = ($("accLinkMail")?.value || "").trim().toLowerCase(); if(m && pendingLink) finishLink(m, pendingLink); }
  else if(t.id === "accRetry") load().catch(() => say("Encara no hi ha connexió.", true));
  else if(t.id === "accOut") logout();
  else if(t.id === "accJoin") requestJoin();
  else if(t.id === "accRelink") relink();
});
$("themeBtn").addEventListener("click", () => { if(!$("viewPanel").hidden){ render(); refresh(); } });

/* ---------- targeta del núvol a l'historial ---------- */
async function renderCard(){
  const el = $("cloudCard"); if(!el) return;
  if(!user || !member){ el.innerHTML = ""; return; }
  if(!approved()){ el.innerHTML = `<div class="warnbox">${member.estat === "pendent" ? "Compte pendent d'aprovació: les sortides es desen només en aquest mòbil." : "Compte no aprovat: les sortides es desen només en aquest mòbil."}</div>`; return; }
  let loose = 0; try{ loose = ((await DB.all()) || []).filter(t => !t.owner).length; }catch(e){}
  const st = syncing ? "Sincronitzant…" : syncErr ? syncErr : lastSync ? "Al dia · " + pad(new Date(lastSync).getHours()) + ":" + pad(new Date(lastSync).getMinutes()) : "";
  el.innerHTML = `<article class="card"><div class="card-h"><span class="lbl">Sortides al núvol</span>
      <span class="src ${!syncing && !syncErr && lastSync ? "live" : ""}"><span class="dot"></span>${esc(st)}</span></div>
    <p class="note">Privades, al compte de ${esc(member.nom || user.email || "")}. Les recuperes en qualsevol mòbil on entris.</p>
    ${loose ? `<p class="note" style="margin-top:8px"><b>${loose === 1 ? "Hi ha 1 sortida" : "Hi ha " + loose + " sortides"} d'aquest mòbil fora del teu compte.</b></p>
      <button class="btn acc-wide" type="button" id="cloudAdopt" style="margin-top:8px">${loose === 1 ? "Puja-la al meu compte" : "Puja-les al meu compte"}</button>` : ""}
    ${syncErr && !syncing ? `<button class="btn" type="button" id="cloudSync" style="margin-top:8px">Torna-ho a provar</button>` : ""}</article>`;
}
document.addEventListener("click", e => {
  if(e.target.closest && e.target.closest("#cloudAdopt")) adopt();
  if(e.target.closest && e.target.closest("#cloudSync")) sync();
});

/* ---------- connexió amb trip.js ---------- */
window.OV_CLOUD = {
  approved,
  async ctx(){ if(!approved()) return null; const f = await fs(); const perms = isAdm ? ["altes", "rols", "permisos", "moderar"] : (member.permisos || []);
    return {F:f, db, user, member, isAdm, perms, isResp: isAdm || !!member.responsable || (member.comissions || []).includes("junta")}; },
  async reread(){ if(!user) return; try{ await readMember(); }catch(e){} render(); emit(); },
  renderCard,
  async saved(t){ if(!approved()) return; t.owner = user.uid; t.synced = false; try{ await DB.put(t); }catch(e){} sync(); },
  deleted(t){ if(!t || !t.owner) return; const q = store.get("ov2_cloud_del") || []; q.push({uid:t.owner, id:t.id}); store.set("ov2_cloud_del", q);
    if(user && user.uid === t.owner) flushDeletes(); }
};
window.addEventListener("online", () => { if(store.get("ov2_cloud") && !user) load().catch(() => {}); else if(approved()) sync(); });
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible" && approved() && Date.now() - lastSync > 60000) sync(); });

const isLink = !window.OV_APP_LINK && /[?&]mode=signIn\b/.test(location.search) && /[?&]oobCode=/.test(location.search);
render();
if(store.get("ov2_cloud") || isLink) load().catch(() => {});
})();
