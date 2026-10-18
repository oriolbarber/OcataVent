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
const CONSENT_V = "2026-10-18";                      // canvia-la si canvia el text de consentiment
const CHUNK = 400000;                                // caràcters per tros (Firestore: màx. 1 MiB per document)
const MAX_TRAMS = 20;

let A = null, F = null, app = null, auth = null, db = null, loading = null, fsLoading = null;
let user = null, member = null, isAdm = false, ready = false, offline = false;
let pendingLink = null, syncing = false, syncAgain = false, syncErr = "", lastSync = 0, lastRefresh = 0, delStep = false;
let flash = {t:"", err:false};

const approved = () => !!(user && member && member.estat === "aprovat");
const say = (t, err) => { flash = {t, err:!!err}; document.querySelectorAll("[data-accmsg]").forEach(m => { m.textContent = t; m.hidden = !t; m.classList.toggle("err", !!err); if(t && m.closest(".cfg-pg.on")) m.scrollIntoView({block:"nearest", behavior:"smooth"}); }); };
// Firestore no avisa si no arriba al servidor: espera indefinidament. Amb això, al cap de 15 s hi ha un missatge.
const T = (p, ms = 15000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({code:"timeout"}), ms))]);
const ERR = {
  "auth/popup-closed-by-user": "Has tancat la finestra abans d'acabar.",
  "auth/cancelled-popup-request": "Has tancat la finestra abans d'acabar.",
  "auth/popup-blocked": "El mòbil no ha deixat obrir la finestra de Google. Prova-ho amb l'enllaç per correu.",
  "auth/operation-not-supported-in-this-environment": "Aquí no es pot obrir la finestra de Google. Prova-ho amb l'enllaç per correu.",
  "auth/network-request-failed": "Sense connexió. Torna-ho a provar quan en tinguis.",
  "auth/operation-not-allowed": "L'entrada per correu encara no està activada al club. Avisa l'administració del club.",
  "auth/unauthorized-domain": "Aquest domini no està autoritzat a Firebase (Authentication → Settings → Authorized domains).",
  "auth/unauthorized-continue-uri": "Aquest domini no està autoritzat a Firebase (Authentication → Settings → Authorized domains).",
  "auth/invalid-email": "El correu no és vàlid.",
  "auth/invalid-action-code": "L'enllaç ja s'ha fet servir o ha caducat. Demana'n un de nou.",
  "auth/expired-action-code": "L'enllaç ha caducat. Demana'n un de nou.",
  "auth/invalid-credential": "Correu o contrasenya incorrectes. Si entraves amb Google o amb enllaç, prem «He oblidat la contrasenya» per posar-ne una.",
  "auth/wrong-password": "Contrasenya incorrecta.",
  "auth/user-not-found": "No hi ha cap compte amb aquest correu. Fes-te'n un a «Alta nova».",
  "auth/email-already-in-use": "Aquest correu ja té compte (potser amb Google). Ves a «Ja soc del club» i prem «He oblidat la contrasenya» per posar-ne una.",
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
// Telèfon (opcional): members/{uid}/privat/contacte. Només el veuen el soci, la Junta i qui té el permís «Seguretat».
let contacte = null, contacteAt = 0;
async function readContact(force){
  if(!user || !member) return null;
  if(!force && contacteAt && Date.now() - contacteAt < 60000) return contacte;
  try{ const f = await fs(), d = await T(f.getDoc(f.doc(db, "members", user.uid, "privat", "contacte")), 8000); contacte = d.exists() ? d.data() : null; contacteAt = Date.now(); }catch(e){}
  return contacte;
}
const telOk = t => /^[+0-9 ()\-.]{6,20}$/.test(t) && (t.match(/[0-9]/g) || []).length >= 6;
async function saveDades(){
  const nom = ($("accDNom")?.value || "").trim().replace(/\s+/g, " ").slice(0, 80), tel = ($("accDTel")?.value || "").trim().replace(/\s+/g, " ");
  if(!nom){ say("Escriu el nom i els cognoms.", true); return; }
  if(tel && !telOk(tel)){ say("El telèfon no sembla correcte: només xifres, espais i el signe +.", true); return; }
  say("Desant…");
  try{
    const f = await fs();
    if(nom !== member.nom){ await T(f.updateDoc(f.doc(db, "members", user.uid), {nom})); member.nom = nom; }
    const cur = contacte && contacte.telefon || "";
    if(tel !== cur){
      if(tel) await T(f.setDoc(f.doc(db, "members", user.uid, "privat", "contacte"), {telefon:tel, at:f.serverTimestamp()}));
      else await T(f.deleteDoc(f.doc(db, "members", user.uid, "privat", "contacte")));
      contacte = tel ? {telefon:tel} : null; contacteAt = Date.now();
    }
    say("Dades desades."); render(); emit();
    if(window.OV_CFG && OV_CFG.current() === "acc-dades") OV_CFG.back();
  }catch(e){ say(errText(e), true); }
}
async function createMember(nom){
  const f = await fs(), mail = user.email || "";
  const n = String(nom || user.displayName || mail.split("@")[0] || "Persona sòcia").trim().slice(0, 80);
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
async function setPassword(){
  const pw = $("accNewPw")?.value || "";
  if(pw.length < 6){ say("La contrasenya ha de tenir almenys 6 caràcters.", true); return; }
  say("Desant…");
  try{ await A.linkWithCredential(user, A.EmailAuthProvider.credential(user.email, pw)); await user.reload();
    say(`Fet. A l'app entra amb ${user.email} i aquesta contrasenya.`); render(); if(window.OV_CFG && OV_CFG.current() === "acc-pw") OV_CFG.back(); }
  catch(e){ say(e && e.code === "auth/provider-already-linked" ? "Aquest compte ja té contrasenya." : errText(e), true); }
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
  try{ await createMember(store.get("ov2_consent")?.nom); say(member ? (member.estat === "aprovat" ? "Alta feta: tens permisos d'administració i l'alta ja és aprovada." : "Sol·licitud enviada.") : "No s'ha pogut comprovar l'alta.", !member); render(); emit(); if(approved()) sync(); }
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
    await f.deleteDoc(f.doc(db, "members", uid, "privat", "contacte")).catch(() => {});
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
  <p><b>Què es desa:</b> el teu nom, el correu i la data d'aquesta acceptació, perquè l'administració del club pugui aprovar l'alta; el telèfon, només si el poses (el veuen la Junta i qui té el permís «Seguretat»); i les sortides que hi pugis (ruta GPS, hores, velocitats i vent).</p>
  <p><b>Qui ho veu:</b> les sortides són privades, només les veus tu. El que publiques (mur, «Qui surt», anuncis), on ets i els avisos de seguretat ho veu qui triïs a ⋮ ▸ Privadesa: tothom, el club, les teves amistats o ningú. La gent del club veu el teu nom per poder-te afegir com a amistat. L'administració veu el nom i el correu de cada persona sòcia.</p>
  <p><b>On ets:</b> només mentre ets a la base o navegant, i ho veu qui hagis triat (per defecte, el club). Navegant, inclou la posició. S'esborra en acabar, en marxar o al cap de 24 h.</p>
  <p><b>On:</b> Google Firebase (Authentication per al compte i Cloud Firestore per a les dades), en servidors de la Unió Europea.</p>
  <p><b>Per a què:</b> només perquè l'app funcioni. No es ven ni es cedeix, i el correu no s'envia a cap altre servei.</p>
  <p><b>Els teus drets:</b> pots esborrar el compte i totes les dades del núvol des d'aquí, quan vulguis. Per consultar-les o corregir-les, adreça't a la junta.</p>
  <p><b>Edat:</b> només per a majors de 18 anys.</p>
  <p><b>Avís:</b> l'app no substitueix el VHF (canal 16) ni el 112.</p>`;
const consentBlock = (withName) => `
  ${withName ? `<label class="tn-name"><span class="lbl">Nom i cognoms</span><input class="field" id="accName" type="text" autocomplete="name" maxlength="80" style="font-family:var(--f-body)" value="${esc(user?.displayName || store.get("ov2_consent")?.nom || "")}"></label>` : ""}
  <div class="acc-ck"><input type="checkbox" id="accConsent"><label for="accConsent">Tinc 18 anys o més i accepto el tractament de dades que s'explica a la (i).</label>
    <button class="ib-i" type="button" data-info="iConsent" aria-label="Com es tracten les dades" aria-expanded="false">i</button></div>
  <div class="vp-info" id="iConsent" hidden>${CONSENT_HTML}</div>`;
const delBlock = () => `
  <details class="acc-del"><summary>Esborra el compte</summary>
    <p class="note">S'esborraran el compte, la teva fitxa, les sortides del núvol i tot el que hagis publicat o marcat al club (publicacions, reaccions, avisos, anuncis i presència). No es pot desfer. Les sortides d'aquest mòbil s'hi queden.</p>
    ${delStep === "relink" ? `<button class="btn" type="button" id="accRelink">Envia'm un enllaç nou</button>` : `<div id="accDel"></div>`}
  </details>`;

function render(){
  const body = $("accBody"); if(!body) return;
  const peek = $("peekAcc");
  let h = "", unreg = false;   // punt vermell al menú ⋮ ▸ Compte: sense compte o sense haver demanat l'alta
  if(pendingLink){
    peek.textContent = "Entrant…";
    h = `<p class="note">Escriu el correu on has rebut l'enllaç.</p>
      <input class="field" id="accLinkMail" type="email" autocomplete="email" placeholder="correu@exemple.cat">
      <button class="btn" type="button" id="accFinish">Entra</button>`;
  } else if(!user && store.get("ov2_cloud") && !ready && !offline){
    peek.textContent = "Connectant…"; h = `<p class="note">Connectant amb el compte…</p>`;
  } else if(!user && offline && store.get("ov2_cloud")){
    peek.textContent = "Sense connexió";
    h = `<p class="note">Ara no es pot connectar. Les sortides es desen al mòbil i es pujaran quan hi hagi connexió.</p>
      <button class="btn" type="button" id="accRetry">Torna-ho a provar</button>`;
  } else if(!user){
    peek.textContent = "Sense compte"; unreg = true;
    const alta = accMode === "alta";
    const google = (window.OV_NATIVE ? "" : `<button class="btn acc-wide" type="button" id="accGoogle">${alta ? "Alta amb Google" : "Entra amb Google"}</button>
      <div class="acc-or">o amb correu i contrasenya</div>`)
      + (window.OV_NATIVE && !alta ? `<p class="note">Si fins ara entraves amb Google, prem «He oblidat la contrasenya» per posar-ne una al mateix compte.</p>` : "");
    h = `<div class="seg acc-mode" role="group" aria-label="Tipus d'entrada">
        <button type="button" id="accModeEntra" aria-pressed="${!alta}">Ja soc del club</button>
        <button type="button" id="accModeAlta" aria-pressed="${alta}">Alta nova</button></div>
      ${alta ? `<p class="note">Opcional. Amb l'alta aprovada, les sortides es desen al núvol, les recuperes en qualsevol mòbil i tens accés al Club. Sense compte, la previsió i la gravació funcionen igual.</p>
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
    const nom = member?.nom || user.displayName || "", ini = nom.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    const estatT = !member ? "Falta l'alta" : member.estat === "pendent" ? "Pendent d'aprovació" : member.estat === "rebutjat" ? "No aprovat" : isAdm ? "Administració" : member.premium ? "Premium" : "Alta aprovada";
    const who = `<div class="cfg-grp"><div class="cfg-prof"><span class="cfg-av" aria-hidden="true">${esc(ini)}</span>
        <div class="acc-who" style="flex:1"><b>${esc(nom)}</b><span>${esc(user.email || "")}</span><span>${esc(estatT)}</span></div>
        <button class="ib-i" type="button" data-info="iUid" aria-label="Identificador del compte" aria-expanded="false">i</button></div></div>
      <p class="vp-info" id="iUid" hidden>ID del compte: <b style="font-family:var(--f-mono);word-break:break-all">${esc(user.uid)}</b>${user.uid === OWNER_UID ? "<br>És el compte d'administració inicial." : ""}</p>`;
    peek.textContent = estatT + (member && member.estat === "aprovat" ? " · " + (member.nom || user.email || "") : "");
    if(!member){
      unreg = true;
      h = who + `<p class="note">Has entrat, però encara no has demanat l'alta al club.</p>${consentBlock(true)}
        <button class="btn acc-wide" type="button" id="accJoin">Sol·licita l'alta</button>`;
    } else if(member.estat === "pendent"){
      h = who + `<div class="warnbox">Sol·licitud enviada: l'administració del club l'ha d'aprovar. Mentrestant, les sortides es desen només en aquest mòbil.</div>`;
    } else if(member.estat === "rebutjat"){
      h = who + `<div class="warnbox">L'alta no s'ha aprovat. Si creus que és un error, parla amb la junta.</div>`;
    } else {
      h = who + `<p class="note">Les sortides es desen al núvol, privades: només les veus tu.</p>`;
    }
    if(member) h += `<span class="lbl cfg-h">Dades personals</span>
      <div class="cfg-grp"><button type="button" class="cfg-row" data-cfg="acc-dades"><span class="cfg-ic">${IC_USER}</span><span class="cfg-rt"><b>Nom, correu i telèfon</b><small id="accTelPeek">${esc(contacte && contacte.telefon ? "Telèfon " + contacte.telefon : "Telèfon no indicat")}</small></span>${CHEV}</button></div>`;
    if(approved()) h += `<span class="lbl cfg-h">Les meves embarcacions</span>
      <div class="cfg-grp" id="accBoats"><p class="note" style="padding:14px">Carregant…</p></div>
      <p class="note">Les dades que hi posis (tipus, nom, vela, plaça) les valida Manteniment. L'estat (a la varada, navegant, en reparació) es canvia a Club ▸ Base.</p>`;
    const hasPw = (user.providerData || []).some(p => p.providerId === "password");
    if(!hasPw && user.email) h += `<div class="cfg-grp"><button type="button" class="cfg-row" data-cfg="acc-pw"><span class="cfg-ic">${IC_KEY}</span><span class="cfg-rt"><b>Contrasenya per a l'app</b><small>Per entrar a l'app d'Android</small></span>${CHEV}</button></div>`;
    h += `<button class="btn acc-wide" type="button" id="accOut">Tanca la sessió</button>` + delBlock();
  }
  body.innerHTML = msgDiv("accMsg") + h;
  window.OV_CFG?.badge("acc", unreg);
  const d = $("accDel"); if(d) slideConfirm(d, "Llisca per esborrar el compte", deleteAccount);
  renderSub(); fillBoats();
  if(member && !contacteAt) readContact().then(c => { const el = $("accTelPeek"); if(el) el.textContent = c && c.telefon ? "Telèfon " + c.telefon : "Telèfon no indicat"; });
}
const msgDiv = id => `<div class="msg${flash.err ? " err" : ""}" id="${id}" data-accmsg${flash.t ? "" : " hidden"}>${esc(flash.t)}</div>`;
const CHEV = `<svg class="cfg-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
const IC_USER = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
const IC_KEY = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>`;
const IC_BOAT = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3v13H4zM13 7l6 9h-6zM3 19h18l-2 2H5z"/></svg>`;
// Subpantalles del compte: dades personals i contrasenya
function renderSub(){
  const D = $("accDadesBody"), P = $("accPwBody");
  if(D){
    if(!user || !member) D.innerHTML = `<p class="note">Cal entrar amb el compte.</p>`;
    else if(!D.querySelector("#accDNom") || !window.OV_CFG?.isOpen("acc-dades")){   // mentre s'edita, no es repinta
      D.innerHTML = msgDiv("accMsgD") + `
      <label class="acc-f"><span class="lbl">Nom i cognoms</span><input class="field" id="accDNom" type="text" autocomplete="name" maxlength="80" value="${esc(member.nom || "")}"></label>
      <label class="acc-f"><span class="lbl">Correu</span><input class="field cfg-ro" id="accDMail" type="email" value="${esc(user.email || "")}" readonly aria-describedby="accDMailN"></label>
      <p class="note" id="accDMailN">És el correu amb què entres: no es pot canviar des d'aquí.</p>
      <label class="acc-f"><span class="lbl">Telèfon (opcional)</span><input class="field" id="accDTel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="600 00 00 00" value="${esc(contacte && contacte.telefon || "")}" aria-describedby="accDTelN"></label>
      <p class="note" id="accDTelN">Només el veuen la Junta i qui té el permís «Seguretat», per trucar-te si avises el club des de l'aigua.</p>
      <button class="btn cl-pri acc-wide" type="button" id="accDSave">Desa</button>`;
    }
  }
  if(P && !($("accNewPw")?.value && window.OV_CFG?.isOpen("acc-pw"))){   // no esborris el que s'està escrivint
    const hasPw = user && (user.providerData || []).some(p => p.providerId === "password");
    P.innerHTML = !user || !user.email ? `<p class="note">Cal entrar amb el compte.</p>` : hasPw ? msgDiv("accMsgP") + `<p class="note">Aquest compte ja té contrasenya.</p>` : msgDiv("accMsgP") + `
      <p class="note">A l'app d'Android no es pot entrar amb Google. Posa una contrasenya aquí i, a l'app, entra amb <b>${esc(user.email)}</b> i aquesta contrasenya: és el mateix compte.</p>
      <label class="acc-f"><span class="lbl">Contrasenya nova</span><input class="field" id="accNewPw" type="password" autocomplete="new-password" minlength="6" placeholder="Mínim 6 caràcters"></label>
      <button class="btn cl-pri acc-wide" type="button" id="accSetPw">Desa la contrasenya</button>`;
  }
}
// Les meves embarcacions (les mateixes de Club ▸ Base): tocar-ne una obre la seva fitxa
async function fillBoats(){
  const el = $("accBoats"); if(!el || !window.OV_CLUB?.myBoats) return;
  let L; try{ L = await OV_CLUB.myBoats(); }catch(e){ L = null; }
  const box = $("accBoats"); if(!box) return;
  if(!L){ box.innerHTML = `<p class="note" style="padding:14px">No s'han pogut carregar. Torna-ho a provar més tard.</p>`; return; }
  box.innerHTML = L.map(b => `<button type="button" class="cfg-row" data-accboat="${esc(b.id)}"><span class="cfg-ic">${IC_BOAT}</span><span class="cfg-rt"><b>${esc(b.title)}</b><small>${esc(b.sub)}</small></span>${CHEV}</button>`).join("")
    + `<button type="button" class="cfg-row add" id="accBoatNew"><span class="cfg-ic">+</span><span class="cfg-rt"><b>${L.length ? "Afegeix-ne una altra" : "Afegeix la meva embarcació"}</b></span></button>`;
}
window.addEventListener("ov-sheet-closed", () => { if(window.OV_CFG?.isOpen("acc")) fillBoats(); });
function openPanel(){ if(window.OV_CFG) OV_CFG.open("acc"); render(); }
async function refresh(){   // en obrir la configuració: comprova si ja t'han aprovat i les altes noves
  if(!user || Date.now() - lastRefresh < 20000) return;
  lastRefresh = Date.now();
  const was = member?.estat;
  try{ await readMember(); }catch(e){ return; }
  render(); emit();
  if(member?.estat !== was && approved()) sync();
}

document.addEventListener("input", e => { if(e.target.id === "accDTel") e.target.dataset.touched = "1"; });
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#accBody button, #accDadesBody button, #accPwBody button"); if(!t || t.classList.contains("ib-i") || t.hasAttribute("data-cfg")) return;
  if(t.dataset.accboat){ window.OV_CLUB?.openBoat(t.dataset.accboat); return; }
  if(t.id === "accBoatNew"){ window.OV_CLUB?.newBoat(); return; }
  if(t.disabled) return; t.disabled = true; setTimeout(() => { t.disabled = false; }, 1500);
  if(t.id === "accModeEntra" || t.id === "accModeAlta"){ accMode = t.id === "accModeAlta" ? "alta" : "entra"; flash = {t:"", err:false}; render(); t.disabled = false; return; }
  if(t.id === "accGoogle") google();
  else if(t.id === "accLogin") passLogin();
  else if(t.id === "accCreate") passCreate();
  else if(t.id === "accReset") passReset();
  else if(t.id === "accSetPw") setPassword();
  else if(t.id === "accLink") sendLink();
  else if(t.id === "accFinish"){ const m = ($("accLinkMail")?.value || "").trim().toLowerCase(); if(m && pendingLink) finishLink(m, pendingLink); }
  else if(t.id === "accRetry") load().catch(() => say("Encara no hi ha connexió.", true));
  else if(t.id === "accOut") logout();
  else if(t.id === "accJoin") requestJoin();
  else if(t.id === "accRelink") relink();
  else if(t.id === "accDSave") saveDades();
});
window.addEventListener("ov-cfg", e => { const k = e.detail && e.detail.pg;
  if(k === "acc"){ render(); refresh(); }
  if(k === "acc-dades"){ flash = {t:"", err:false}; const D = $("accDadesBody"); if(D) D.innerHTML = ""; renderSub();
    readContact(true).then(c => { const i = $("accDTel"); if(i && !i.dataset.touched) i.value = c && c.telefon || ""; }); }
  if(k === "acc-pw"){ flash = {t:"", err:false}; renderSub(); } });

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
  // Estat del compte per a la pestanya Club: null (sense sessió), "sense-alta", "pendent", "rebutjat" o "aprovat"
  status(){ return !user ? null : !member ? "sense-alta" : member.estat; },
  async ctx(){ if(!approved()) return null; const f = await fs(); const prem = !!member.premium, perms = isAdm || prem ? ["altes", "rols", "permisos", "moderar", "avisos", "seguretat", "planol", "embarcacions"] : (member.permisos || []);
    return {F:f, db, user, member, isAdm, isPremium:prem, perms, isResp: isAdm || prem || perms.includes("seguretat") || !!member.responsable || (member.comissions || []).includes("junta")}; },
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

/* ---------- primera vegada: proposa registrar-se o continuar sense compte ---------- */
function welcome(tries){
  if(store.get("ov2_welcome") || store.get("ov2_cloud") || store.get("ov2_had") || isLink || user) return;
  const busy = !window.OV_CLUB?.sheet || $("clSheet") || document.querySelector(".ride:not([hidden]), .native-handoff");
  if(busy){ if((tries || 0) < 10) setTimeout(() => welcome((tries || 0) + 1), 1500); return; }
  store.set("ov2_welcome", 1);
  OV_CLUB.sheet("Et donem la benvinguda", `<p style="margin:0;font-size:1.02rem">Fes-te el compte de soci i tindràs:</p>
    <ul class="wl-list"><li><b>Sortides al núvol:</b> no les perds i les veus des de qualsevol mòbil.</li>
      <li><b>El Club:</b> mur, avisos, anuncis i base nàutica.</li>
      <li><b>Seguretat a l'aigua:</b> si demanes ajuda, el club ho sap.</li></ul>
    <p class="note">L'alta l'aprova el club. Sense registre, la previsió i la gravació de sortides funcionen igual; ho pots fer més endavant a ⋮ ▸ Compte.</p>
    <button type="button" class="btn cl-pri cl-wide" id="wlYes">Vull registrar-me</button>
    <button type="button" class="btn cl-wide" id="wlNo">Continua sense registre</button>`, () => {
    $("wlYes").onclick = () => { OV_CLUB.closeSheet(); accMode = "alta"; flash = {t:"", err:false}; if(window.OV_CFG) OV_CFG.open("acc"); render(); };
    $("wlNo").onclick = () => OV_CLUB.closeSheet();
  });
}
setTimeout(welcome, 1200);
})();
