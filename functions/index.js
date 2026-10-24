// Ocata Vent · memòria cau meteo al servidor (Cloud Functions, pla Blaze).
// Un sol procés llegeix les estacions i Open-Meteo i en desa una còpia a Firestore (col·lecció meteo, lectura pública).
// Els mòbils llegeixen aquesta còpia; si falta o és vella, van a la font com abans (app.js, meteoCache).
//   meteo/estacions  → lectura d'ara de totes les estacions          (cada 2 min)
//   meteo/st_{clau}  → registres de les últimes 24 h d'una estació    (cada 10 min; Weathercloud, cada 2 min acumulant)
//   meteo/fc_{lloc}  → previsió, onatge i models d'un club            (cada hora)
// Cada document porta un sol camp «json» (text) perquè l'app el llegeixi amb una petició REST sense descarregar Firebase.
process.env.TZ = "Europe/Madrid";   // la taula de Meteotemplate dona hores locals

import {onSchedule} from "firebase-functions/v2/scheduler";
import {setGlobalOptions, logger} from "firebase-functions/v2";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {readFileSync} from "node:fs";
import {STATIONS, stLive, stRecs24, packRec, packLive, previsio} from "./fonts.js";

setGlobalOptions({region: "europe-west1", memory: "256MiB", maxInstances: 1});
initializeApp();
const db = getFirestore();
const LLOCS = JSON.parse(readFileSync(new URL("./llocs.json", import.meta.url), "utf8"));   // node scripts/meteo-llocs.mjs
const DAY = 24 * 3600e3;
const put = (id, obj) => db.doc("meteo/" + id).set({json: JSON.stringify(obj), upd: FieldValue.serverTimestamp()});
const getJ = async id => { const s = await db.doc("meteo/" + id).get(); try { return s.exists ? JSON.parse(s.get("json")) : null; } catch (e) { return null; } };

export const estacions = onSchedule({schedule: "every 2 minutes", timeZone: "Europe/Madrid", timeoutSeconds: 90, retryCount: 0}, async () => {
  const now = Date.now(), recsNow = new Date(now).getMinutes() % 10 < 2, st = {}, err = {};
  await Promise.all(Object.keys(STATIONS).map(async k => {
    let live = null;
    try { live = await stLive(k); if (live) st[k] = packLive(live); } catch (e) { err[k] = String(e.message || e).slice(0, 80); }
    try {
      if (STATIONS[k].type === "wcloud") {   // sense historial a la font: s'acumulen les lectures d'ara
        if (!live) return;
        const prev = await getJ("st_" + k), recs = (prev?.recs || []).filter(r => r[0] >= now - DAY);
        if (!recs.length || recs[recs.length - 1][0] < live.at) recs.push(packRec({...live, t: live.at}));
        await put("st_" + k, {upd: now, recs});
      } else if (recsNow) {
        const recs = await stRecs24(k);
        if (recs && recs.length) await put("st_" + k, {upd: now, recs: recs.map(packRec)});
      }
    } catch (e) { err[k + "_recs"] = String(e.message || e).slice(0, 80); }
  }));
  await put("estacions", {upd: now, st, err});
  if (Object.keys(err).length) logger.warn("Estacions amb errors", err);
});

// Clubs amb previsió al servidor: els que tenen estació (llocs.json) + els que s'afegeixin a config/meteo.previsio (llista de claus)
async function llocsPrevisio() {
  const set = new Set(Object.entries(LLOCS).filter(([, L]) => L.st).map(([k]) => k));
  try { const c = await db.doc("config/meteo").get(); (c.get("previsio") || []).forEach(k => { if (LLOCS[k]) set.add(k); }); } catch (e) {}
  return [...set];
}
export const previsions = onSchedule({schedule: "5 * * * *", timeZone: "Europe/Madrid", timeoutSeconds: 300, retryCount: 0}, async () => {
  const keys = await llocsPrevisio(), fail = [];
  for (const k of keys) {
    try { const p = await previsio(LLOCS[k], process.env.OPENMETEO_KEY); await put("fc_" + k, {at: Date.now(), ...p}); }
    catch (e) { fail.push(k + ": " + String(e.message || e).slice(0, 60)); if (/HTTP 429/.test(String(e))) break; }   // límit d'Open-Meteo: es reprova l'hora vinent
    await new Promise(r => setTimeout(r, 400));
  }
  if (fail.length) logger.warn("Previsions sense actualitzar", fail);
});
