// Configuració compartida pels scripts de GitHub Actions.
// Ha de coincidir amb LOCS, STATIONS i MODELS d'app.js (V3 multiclub: d'aquí sortirà la configuració per club).
export const LLOCS = {
  masnou:   {nom: "El Masnou", lat: 41.4766, lon: 2.3185, costa: 135, estacio: "https://www.meteoelmasnou.cat", nomEstacio: "El Masnou"},
  badalona: {nom: "Badalona",  lat: 41.4461, lon: 2.2506, costa: 135, estacio: "https://badalona.meteoelmasnou.cat", nomEstacio: "Badalona"}
};
// Clau de l'app → nom del model a l'API d'Open-Meteo («auto» és la barreja per defecte, best_match)
export const MODELS = {auto: "best_match", arome: "meteofrance_seamless", ecmwf: "ecmwf_ifs", icon: "icon_eu", ukmo: "ukmo_global_deterministic_10km"};
export const HORES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];   // hores de navegació que es comparen
export const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const norm = d => ((d % 360) + 360) % 360;

// Tipus de vent segons d'on bufa (graus), la força (kn) i cap on mira la platja (costa, graus de terra cap al mar).
// Mateix criteri que l'app (isOffshore/isOnshore i tipusDia d'app.js): terral = fins a 75° de la direcció de terra,
// la resta, mesurat des de la direcció del mar (rel): marinada de −10° a +65° (al Masnou, xaloc i migjorn), llevant per
// l'esquerra (mirant al mar) i garbí per la dreta. Amb 135° coincideix amb els límits d'abans (45 · 125 · 200 · 255).
// L'app torna a classificar cada dia amb l'orientació que hagi definit el club (dir i vent es desen per això).
const angD = (a, b) => { const x = Math.abs(norm(a) - norm(b)); return x > 180 ? 360 - x : x; };
export function tipusVent(dir, vent, costa = 135) {
  if (dir == null || vent == null) return null;
  if (vent < 3) return "calma";
  if (angD(dir, costa + 180) <= 75) return "terral";
  let rel = norm(dir - costa); if (rel > 180) rel -= 360;
  if (rel >= -10 && rel <= 65) return "marinada";
  return rel < -10 ? "llevant" : "garbi";
}
// Direcció mitjana vectorial ponderada pel vent
export function vecDir(list) {
  let x = 0, y = 0;
  for (const o of list) if (o.dir != null) { const w = Math.max(o.wind || 0, 0.1); x += Math.sin(o.dir * Math.PI / 180) * w; y += Math.cos(o.dir * Math.PI / 180) * w; }
  return (x || y) ? Math.round(norm(Math.atan2(x, y) * 180 / Math.PI)) : null;
}
