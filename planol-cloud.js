"use strict";
/* ============ Ocata Vent · Plànol de la base: connexió amb el núvol (editor) ============
   Mateix Firebase i mateixa sessió que l'app i la web de gestió. Amb ?local=1, l'editor treballa sense núvol (prototip).
   Qui hi pot entrar:
   · plànol (places, zones, punts, fons): administració, premium, permís «planol» o la comissió Junta
   · embarcacions (fitxes, propietari, places): administració, premium, permís «embarcacions» o la comissió Manteniment
   Dades: clubs/{club}/planol/actual · embarcacions/{id} (+ privat/p si el nom del propietari és ocult). */
(() => {
const P = new URLSearchParams(location.search);
if(P.get("local") === "1") return;
const FB = "https://www.gstatic.com/firebasejs/13.0.0/";
const FB_CONFIG = {apiKey:"AIzaSyDp1A_kJusg-ni5p4JY_62n9I2WF1H8smY", authDomain:"ocatavent.firebaseapp.com", projectId:"ocatavent"};
const OWNER_UID = "aHjoROUH3aQsHh6ksS3Tt1p5soF2";
const BOAT_F = ["t", "label", "vela", "prop", "propUid", "coprop", "ocult", "estat", "notes", "place", "pendent"];
const ERRS = {"permission-denied":"El núvol ho ha refusat (permís, o les regles encara no s'han publicat).", "unavailable":"Sense connexió amb el núvol."};
let F, db, user, me, club, last = null, saveT = 0, busy = false, again = false, pendingDoc = null;
let resolveReady; const ready = new Promise(r => resolveReady = r);
const status = (t, err) => window.dispatchEvent(new CustomEvent("ov-plan-status", {detail:{t, err:!!err}}));
const clean = o => JSON.parse(JSON.stringify(o));

async function boot(){
  try{
    const [fa, a, f] = await Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-auth.js"), import(FB + "firebase-firestore.js")]);
    F = f; const app = fa.initializeApp(FB_CONFIG);
    const auth = a.initializeAuth(app, {persistence:[a.indexedDBLocalPersistence, a.browserLocalPersistence]});
    db = f.initializeFirestore(app, {ignoreUndefinedProperties:true});
    let done = false;
    a.onAuthStateChanged(auth, async u => { if(done) return; done = true; user = u; resolveReady(await start()); });
  }catch(e){ resolveReady({error:"net"}); }
}
async function start(){
  if(!user) return {error:"login"};
  try{
    const md = await F.getDoc(F.doc(db, "members", user.uid)); me = md.exists() ? md.data() : null;
    const isAdm = user.uid === OWNER_UID || await F.getDoc(F.doc(db, "admins", user.uid)).then(d => d.exists(), () => false);
    if(!me || me.estat !== "aprovat") if(!isAdm) return {error:"perm"};
    club = (isAdm && P.get("club")) || (me && me.clubId) || "ocatavent";
    const prem = !!(me && me.premium), perms = (me && me.permisos) || [], coms = (me && me.comissions) || [];
    const can = {plan: isAdm || prem || perms.includes("planol") || coms.includes("junta"), boats: isAdm || prem || perms.includes("embarcacions") || coms.includes("manteniment")};
    if(!can.plan && !can.boats) return {error:"perm"};
    const [pd, bq, pq, cd] = await Promise.all([
      F.getDoc(F.doc(db, "clubs", club, "planol", "actual")).catch(() => null),
      F.getDocs(F.query(F.collection(db, "embarcacions"), F.where("clubId", "==", club))),
      F.getDocs(F.query(F.collection(db, "perfils"), F.where("clubId", "==", club))).catch(() => ({docs:[]})),
      F.getDoc(F.doc(db, "clubs", club)).catch(() => null)]);
    const plan = pd && pd.exists() ? pd.data() : {};
    const boats = bq.docs.map(d => Object.assign({id:d.id}, d.data()));
    if(can.boats) await Promise.all(boats.filter(b => b.ocult).map(async b => {   // nom ocult: el llegeix qui gestiona les embarcacions
      const pv = await F.getDoc(F.doc(db, "embarcacions", b.id, "privat", "p")).catch(() => null); if(pv && pv.exists()) b.prop = pv.data().prop || ""; }));
    const doc = {v:1, origin:plan.origin || {lat:41.479804, lon:2.324024}, vista:plan.vista || null, bg:Object.assign({src:"icgc", dx:0, dy:0, s:1, r:0, op:.75}, plan.bg || {}), objs:window.OV_PLAN.fromStore(plan.objs).concat(boats.map(b => {
      const o = {k:"boat", id:b.id}; BOAT_F.forEach(k => o[k] = b[k] ?? (k === "estat" ? "lloc" : k === "ocult" || k === "pendent" ? false : k === "place" ? null : "")); o.historial = b.historial || []; return o; }))};
    last = clean(doc);
    const members = pq.docs.map(d => ({uid:d.id, nom:d.data().nom || ""})).sort((x, y) => x.nom.localeCompare(y.nom, "ca"));
    return {doc, can, club, clubNom:(cd && cd.exists() && cd.data().nom) || club, me:{uid:user.uid, nom:(me && me.nom) || ""}, members, save};
  }catch(e){ return {error:"load", msg:ERRS[e && e.code] || (e && e.code) || ""}; }
}

/* Desa: el plànol (sense la imatge pròpia, que es queda en aquest ordinador) i les fitxes que han canviat. */
function save(doc){ pendingDoc = doc; clearTimeout(saveT); status("Canvis sense desar…"); saveT = setTimeout(flush, 900); }
async function flush(){
  if(busy){ again = true; return; } busy = true; const doc = clean(pendingDoc); status("Desant…");
  try{
    const ts = F.serverTimestamp();
    const planOf = d => ({objs:window.OV_PLAN.toStore(d.objs.filter(o => o.k !== "boat")), bg:(({src, dx, dy, s, r, op}) => ({src:src === "img" ? "icgc" : src, dx, dy, s, r, op}))(d.bg), origin:d.origin, vista:d.vista || null});
    const np = planOf(doc), op = last ? planOf(last) : null;
    if(!op || JSON.stringify(np) !== JSON.stringify(op))
      await F.setDoc(F.doc(db, "clubs", club, "planol", "actual"), Object.assign(np, {actualitzat:ts, actualitzatPer:user.uid}));
    const prev = {}; (last ? last.objs : []).filter(o => o.k === "boat").forEach(o => prev[o.id] = o);
    const now = doc.objs.filter(o => o.k === "boat"), codeOf = id => (doc.objs.find(o => o.id === id) || {}).label || "";
    for(const b of now){
      const a = prev[b.id], hist = (b.historial || []).slice(-19), add = t => hist.push({at:Date.now(), qui:(me && me.nom) || "", que:t});
      if(!a) add(b.place ? "Alta a la plaça " + codeOf(b.place) : "Alta sense plaça");
      else { if(a.place !== b.place) add(b.place ? "Plaça " + codeOf(b.place) : "Sense plaça");
             if(a.pendent && !b.pendent) add("Validada");
             if(a.estat !== b.estat) add(({lloc:"A la varada", navegant:"Navegant", reparacio:"En reparació"})[b.estat] || b.estat); }
      const changed = !a || BOAT_F.some(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
      if(!changed) continue;
      const data = {clubId:club, historial:hist, actualitzat:ts, actualitzatPer:user.uid};
      BOAT_F.forEach(k => data[k] = b[k] ?? null); data.ocult = !!b.ocult; data.pendent = !!b.pendent; data.estat = b.estat || "lloc";
      if(data.ocult) data.prop = "";
      await F.setDoc(F.doc(db, "embarcacions", b.id), data);
      if(b.ocult) await F.setDoc(F.doc(db, "embarcacions", b.id, "privat", "p"), {prop:b.prop || ""});
      else if(a && a.ocult) await F.deleteDoc(F.doc(db, "embarcacions", b.id, "privat", "p")).catch(() => {});
      b.historial = hist; const live = pendingDoc.objs.find(o => o.id === b.id); if(live) live.historial = hist;
    }
    for(const id of Object.keys(prev)) if(!now.some(b => b.id === id)){
      await F.deleteDoc(F.doc(db, "embarcacions", id, "privat", "p")).catch(() => {});
      await F.deleteDoc(F.doc(db, "embarcacions", id, "foto", "f")).catch(() => {});
      await F.deleteDoc(F.doc(db, "embarcacions", id));
    }
    last = doc; status("Desat al núvol");
  }catch(e){ status("No s'ha desat: " + (ERRS[e && e.code] || (e && e.code) || "error"), true); }
  finally{ busy = false; if(again){ again = false; flush(); } }
}

window.OV_PLAN_CLOUD = {ready};
boot();
})();
