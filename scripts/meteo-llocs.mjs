// Genera functions/llocs.json (coordenades de cada club per a la previsió del servidor) a partir de clubs.js.
// Cal tornar-lo a executar quan canviï clubs.js:  node scripts/meteo-llocs.mjs
import fs from "node:fs";
import vm from "node:vm";

const ctx = {window: {}};
vm.runInNewContext(fs.readFileSync("clubs.js", "utf8"), ctx);
const out = {};
for (const [k, L] of Object.entries(ctx.window.OV_CLUBS)) out[k] = {lat: L.lat, lon: L.lon, mlat: L.mlat ?? L.lat, mlon: L.mlon ?? L.lon, st: L.st || null};
fs.writeFileSync("functions/llocs.json", JSON.stringify(out) + "\n");
console.log(Object.keys(out).length + " llocs; amb estació: " + Object.values(out).filter(l => l.st).length);
