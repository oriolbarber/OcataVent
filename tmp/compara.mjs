import {parseTaula, previsio} from "../scripts/encerts.mjs";
import {pad, ymd} from "../scripts/llocs.mjs";
const MS = 1.943844, dia = ymd(new Date());
const hourly = recs => { const by = {}; for (const o of recs) { const d = new Date(o.t); if (ymd(d) !== dia || o.wind == null) continue; const h = d.getHours(); (by[h] ||= []).push(o); }
  const out = {}; for (const h in by) { const a = by[h]; out[h] = {w: a.reduce((s, o) => s + o.wind, 0) / a.length, g: Math.max(...a.map(o => o.gust ?? o.wind)), n: a.length}; } return out; };
const S = {};
for (const [k, host] of [["Ocata", "ocata2"], ["El Masnou", "www"], ["Badalona", "badalona"]]) {
  try { const r = await fetch(`https://${host}.meteoelmasnou.cat/pages/station/tableAjax.php?value=all&interval=today&from=&to=&parameters=avgbracketLWbracketR,maxbracketLGbracketR,avgbracketLBbracketR,avgbracketLTbracketR&t=${Date.now()}`);
    S[k] = hourly(parseTaula(await r.text())); } catch (e) { console.log(k, "ERROR", e.message); }
}
try { const t = await (await fetch("https://opendata.portdebarcelona.cat/dataset/1afd4f4d-f329-4959-b1d3-252d973a9c3b/resource/b724b1e7-26e3-4c6f-80d1-65a0b507065f/download/14-bocananord_opd_10m_hist.csv")).text();
  let L = t.trim().split(/\r?\n/); const hi = L.findIndex(l => l.includes('"TIMESTAMP"') || l.startsWith("TIMESTAMP")); L = L.slice(hi);
  const H = L[0].split(",").map(s => s.replace(/"/g, "").trim()), ix = n => H.indexOf(n), iT = ix("TIMESTAMP"), iW = ix("VV_S_WVT"), iG = ix("VV10m3Seg_Max") >= 0 ? ix("VV10m3Seg_Max") : ix("VV_Max");
  const num = v => { const n = parseFloat(String(v).replace(/"/g, "")); return Number.isFinite(n) ? n : null; };
  S["Port BCN"] = hourly(L.slice(1).map(r => { const c = r.split(","), m = (c[iT] || "").match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); if (!m) return null; const w = num(c[iW]), g = num(c[iG]);
    return {t: Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]), wind: w == null ? null : w*MS, gust: g == null ? null : g*MS}; }).filter(Boolean));
} catch (e) { console.log("Port ERROR", e.message); }
try { const j = await (await fetch("https://app.weathercloud.net/device/values/0732654059", {headers: {"X-Requested-With": "XMLHttpRequest"}})).json(); console.log("CN Vilassar (ara):", JSON.stringify(j).slice(0, 400)); } catch (e) { console.log("Vilassar ERROR", e.message); }
let P = {}; try { P = await previsio("masnou", dia); } catch (e) { console.log("Previsió ERROR", e.message); }
const cols = Object.keys(S), mods = Object.keys(P);
console.log(`\nDIA ${dia} · mitjana/ratxa màx (kn) per hora\n| h | ${cols.join(" | ")} | ${mods.join(" | ")} |`);
for (let h = 7; h <= 20; h++) console.log(`| ${pad(h)} | ${cols.map(k => S[k][h] ? `${S[k][h].w.toFixed(1)}/${S[k][h].g.toFixed(0)}` : "–").join(" | ")} | ${mods.map(m => P[m][pad(h)] ?? "–").join(" | ")} |`);
