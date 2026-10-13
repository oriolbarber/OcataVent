// Historial d'encerts dels models (GitHub Actions, cap al matí i cap al vespre).
//  · Matí (6–10 h): desa la previsió d'avui de cada model a data/previsio-avui.json.
//  · Vespre (des de les 21 h): la compara amb el vent mesurat a l'estació i afegeix el resultat a data/encerts.json.
// Ús: node scripts/encerts.mjs [auto|previsio|compara]   (TZ=Europe/Madrid)
import fs from "node:fs/promises";
import {LLOCS, MODELS, HORES, pad, ymd, tipusVent, vecDir} from "./llocs.mjs";

const F_PREV = "data/previsio-avui.json", F_ENC = "data/encerts.json", MAX_DIES = 400;
const UNIT_KN = {kmh: 0.539957, "km/h": 0.539957, ms: 1.943844, "m/s": 1.943844, mph: 0.868976, kt: 1, kn: 1, kts: 1};
const OBS_PARAMS = "avgbracketLWbracketR,maxbracketLGbracketR,avgbracketLBbracketR,avgbracketLTbracketR";

const readJSON = async (f, def) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch (e) { return def; } };
const writeJSON = async (f, v) => { await fs.mkdir("data", {recursive: true}); await fs.writeFile(f, JSON.stringify(v, null, 1) + "\n"); };
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error("HTTP " + r.status + " " + u); return r.json(); }

/* ---------- previsió ---------- */
export async function previsio(loc, dia) {
  const L = LLOCS[loc];
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&hourly=wind_speed_10m,wind_direction_10m` +
    `&models=${Object.values(MODELS).join(",")}&wind_speed_unit=kn&timezone=Europe%2FMadrid&start_date=${dia}&end_date=${dia}`;
  const H = (await getJSON(u)).hourly, out = {};
  for (const [k, api] of Object.entries(MODELS)) {
    const w = H["wind_speed_10m_" + api] || [], o = {};
    H.time.forEach((t, i) => { const h = +t.slice(11, 13); if (HORES.includes(h) && w[i] != null) o[pad(h)] = Math.round(w[i] * 10) / 10; });
    if (Object.keys(o).length) out[k] = o;
  }
  return out;
}

/* ---------- vent mesurat a l'estació (mateixa consulta que l'app: «Taula interactiva», avui) ---------- */
const strip = s => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
export function parseTaula(html) {
  const head = (html.match(/<thead[\s\S]*?<\/thead>/i) || [""])[0], ths = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => strip(m[1]).toLowerCase());
  const f = UNIT_KN[((ths[1] || "").match(/\(([^)]+)\)/) || [])[1]?.replace(/\s/g, "") ?? ""] ?? 0.539957;
  const body = (html.match(/<tbody[\s\S]*?<\/tbody>/i) || [""])[0], num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; }, out = [];
  for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const td = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => strip(m[1]));
    const m = td[0]?.match(/(\d\d)[\/.](\d\d)[\/.](\d{2,4})\s+(\d\d)[:.](\d\d)/); if (!m) continue;
    const w = num(td[1]), g = num(td[2]);
    out.push({t: new Date(m[3].length === 4 ? +m[3] : 2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime(),
      wind: w == null ? null : w * f, gust: g == null ? null : g * f, dir: num(td[3])});
  }
  return out.sort((a, b) => a.t - b.t);
}
async function mesures(loc) {
  const r = await fetch(`${LLOCS[loc].estacio}/pages/station/tableAjax.php?value=all&interval=today&from=&to=&parameters=${OBS_PARAMS}&t=${Date.now()}`);
  if (!r.ok) throw new Error("Estació HTTP " + r.status);
  return parseTaula(await r.text());
}
export function perHores(recs, dia) {
  const by = {};
  for (const o of recs) { const d = new Date(o.t); if (ymd(d) !== dia) continue; (by[pad(d.getHours())] = by[pad(d.getHours())] || []).push(o); }
  const out = {};
  for (const h in by) { const ws = by[h].map(o => o.wind).filter(v => v != null); if (ws.length) out[h] = {wind: ws.reduce((a, b) => a + b, 0) / ws.length, dir: vecDir(by[h])}; }
  return out;
}

/* ---------- comparació ---------- */
export function compara(prev, obs) {
  const hores = HORES.map(pad).filter(h => obs[h]), models = {};
  for (const [k, f] of Object.entries(prev || {})) {
    let s = 0, n = 0; for (const h of hores) if (f[h] != null) { s += Math.abs(f[h] - obs[h].wind); n++; }
    if (n >= 4) models[k] = {mae: Math.round(s / n * 100) / 100, n};
  }
  const L = hores.map(h => obs[h]), vent = L.length ? L.reduce((a, o) => a + o.wind, 0) / L.length : null, dir = vecDir(L);
  return {n: hores.length, vent: vent == null ? null : Math.round(vent * 10) / 10, dir, tipus: tipusVent(dir, vent), models};
}

async function main() {
  const mode = process.argv[2] || "auto", now = new Date(), dia = ymd(now), h = now.getHours();
  let canvis = false;
  if (mode === "previsio" || (mode === "auto" && h >= 6 && h <= 10)) {
    const prev = await readJSON(F_PREV, null);
    if (prev && prev.data === dia && mode !== "previsio") console.log("Previsió d'avui ja desada.");
    else {
      const locs = {};
      for (const loc of Object.keys(LLOCS)) { try { locs[loc] = await previsio(loc, dia); } catch (e) { console.warn("Previsió", loc, e.message); } }
      await writeJSON(F_PREV, {data: dia, desada: now.toISOString(), locs}); canvis = true; console.log("Previsió desada:", Object.keys(locs).join(", "));
    }
  }
  if (mode === "compara" || (mode === "auto" && h >= 21)) {
    const prev = await readJSON(F_PREV, null), enc = await readJSON(F_ENC, {v: 1, dies: []});
    if (!prev || prev.data !== dia) console.log("No hi ha previsió desada d'avui: no es pot comparar.");
    else if (enc.dies.some(d => d.data === dia) && mode !== "compara") console.log("Avui ja està comparat.");
    else {
      enc.dies = enc.dies.filter(d => d.data !== dia);
      for (const loc of Object.keys(LLOCS)) {
        try {
          const r = compara(prev.locs[loc], perHores(await mesures(loc), dia));
          if (r.n >= 4 && Object.keys(r.models).length) { enc.dies.push({data: dia, loc, estacio: LLOCS[loc].nomEstacio, ...r}); console.log(loc, JSON.stringify(r)); }
          else console.log(loc, "massa poques hores mesurades:", r.n);
        } catch (e) { console.warn("Comparació", loc, e.message); }
      }
      enc.dies = enc.dies.sort((a, b) => a.data.localeCompare(b.data) || a.loc.localeCompare(b.loc)).slice(-MAX_DIES * Object.keys(LLOCS).length);
      enc.actualitzat = now.toISOString(); await writeJSON(F_ENC, enc); canvis = true;
    }
  }
  if (!canvis) console.log("Res a fer ara (" + pad(h) + " h).");
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
