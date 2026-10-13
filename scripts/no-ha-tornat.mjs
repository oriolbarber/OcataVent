// Avís «no ha tornat a l'hora» (GitHub Actions, cada 10 minuts).
// Llegeix la presència de Firestore: si algú és a l'aigua i ha passat la tornada prevista més un marge,
// crea una alerta (col·lecció «alertes») que l'app mostra als responsables i a la mateixa persona.
// Quan torna (la presència desapareix o canvia), l'alerta es dona per resolta.
// També esborra les presències de fa més de 24 h i les alertes resoltes de fa més d'una setmana.
// Secrets: FIREBASE_SERVICE_ACCOUNT (JSON del compte de servei). Opcional: NOTIFY_URL (tema de ntfy.sh o similar).
// Variables opcionals: MARGE_MIN (per defecte 30).
const MARGE = (+process.env.MARGE_MIN || 30) * 60e3, DAY = 864e5;
const BOATS = {pati: "Patí", windsurf: "Windsurf", hobie: "Hobie Cat"};
const hm = t => new Date(t).toLocaleTimeString("ca-ES", {hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid"});
const ms = v => v == null ? null : typeof v === "number" ? v : v.toMillis ? v.toMillis() : +new Date(v);

// Decideix què cal fer, sense tocar res (així es pot provar sense Firestore)
export function planifica(pres, alertes, now) {
  const fer = {crea: [], actualitza: [], resol: [], esborraPres: []};
  const obertes = new Map(alertes.filter(a => !a.resolta).map(a => [a.id, a]));
  const vistes = new Set();
  for (const p of pres) {
    const act = ms(p.actualitzat) || 0;
    if (now - act > DAY) { fer.esborraPres.push(p.id); continue; }
    if (p.estat !== "aigua" || !p.retorn || now <= p.retorn + MARGE) continue;
    const id = `${p.id}_${p.desde}`; vistes.add(id);
    if (obertes.has(id)) { if (ms(obertes.get(id).posAt) !== act) fer.actualitza.push({id, lat: p.lat, lon: p.lon, posAt: act}); }
    else if (!alertes.some(a => a.id === id)) fer.crea.push({id, dades: {clubId: p.clubId, tipus: "no-ha-tornat", userId: p.id, nom: p.nom, act: p.act,
      desde: p.desde, retorn: p.retorn, lat: p.lat, lon: p.lon, posAt: act, resolta: false}});
  }
  for (const [id, a] of obertes) if (!vistes.has(id)) {
    const p = pres.find(x => x.id === a.userId);
    const segueix = p && p.estat === "aigua" && p.desde === a.desde && now - (ms(p.actualitzat) || 0) <= DAY;   // p. ex. ha allargat la tornada
    fer.resol.push({id, tornat: !segueix});
  }
  return fer;
}
export const textAlerta = (d, now) => `${d.nom} (${BOATS[d.act] || d.act}) havia de tornar a les ${hm(d.retorn)} i encara no ha tancat la sortida (${Math.round((now - d.retorn) / 6e4)} min). Obre Ocata Vent ▸ Club ▸ Base per veure l'última posició.`;

async function avisa(titol, text) {
  const u = process.env.NOTIFY_URL; if (!u) return;
  try { await fetch(u, {method: "POST", body: text, headers: {"Title": titol, "Priority": "high", "Tags": "warning"}}); }
  catch (e) { console.warn("No s'ha pogut enviar l'avís:", e.message); }
}

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) { console.log("Falta el secret FIREBASE_SERVICE_ACCOUNT: no es fa res."); return; }
  const {initializeApp, cert} = await import("firebase-admin/app");
  const {getFirestore, FieldValue} = await import("firebase-admin/firestore");
  initializeApp({credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))});
  const db = getFirestore(), now = Date.now();
  const pres = (await db.collection("presencia").get()).docs.map(d => ({id: d.id, ...d.data()}));
  const alertes = (await db.collection("alertes").where("resolta", "==", false).get()).docs.map(d => ({id: d.id, ...d.data()}));
  // Les alertes ja resoltes amb el mateix id també compten, perquè no es tornin a crear
  const ids = pres.map(p => `${p.id}_${p.desde}`), resoltes = [];
  for (let i = 0; i < ids.length; i += 10) { const q = ids.slice(i, i + 10); if (q.length) (await db.getAll(...q.map(id => db.collection("alertes").doc(id)))).forEach(s => { if (s.exists && s.get("resolta")) resoltes.push({id: s.id, ...s.data()}); }); }
  const fer = planifica(pres, alertes.concat(resoltes), now);
  for (const {id, dades} of fer.crea) {
    await db.collection("alertes").doc(id).set({...dades, creat: FieldValue.serverTimestamp()});
    console.log("Alerta:", id); await avisa("No ha tornat a l'hora", textAlerta(dades, now));
  }
  for (const {id, ...pos} of fer.actualitza) await db.collection("alertes").doc(id).update(pos);
  for (const {id, tornat} of fer.resol) {
    await db.collection("alertes").doc(id).update({resolta: true, resoltaPer: tornat ? "auto" : "allargada", resoltaAt: FieldValue.serverTimestamp()});
    const a = alertes.find(x => x.id === id); console.log("Resolta:", id);
    if (a && tornat) await avisa("Ja ha tornat", `${a.nom} ja ha tornat o ha tancat la sortida.`);
  }
  for (const id of fer.esborraPres) { await db.collection("presencia").doc(id).delete(); console.log("Presència caducada:", id); }
  // Les alertes resoltes fa més d'una setmana s'esborren: no cal guardar on era ningú
  for (const d of (await db.collection("alertes").where("resolta", "==", true).get()).docs)
    if (now - (ms(d.get("resoltaAt")) || 0) > 7 * DAY) { await d.ref.delete(); console.log("Alerta antiga esborrada:", d.id); }
  console.log(`Presències: ${pres.length} · noves alertes: ${fer.crea.length} · resoltes: ${fer.resol.length}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
