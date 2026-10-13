// Configuració compartida pels scripts de GitHub Actions.
// Ha de coincidir amb LOCS, STATIONS i MODELS d'app.js (V3 multiclub: d'aquí sortirà la configuració per club).
export const LLOCS = {
  masnou:   {nom: "El Masnou", lat: 41.4766, lon: 2.3185, estacio: "https://www.meteoelmasnou.cat", nomEstacio: "El Masnou"},
  badalona: {nom: "Badalona",  lat: 41.4461, lon: 2.2506, estacio: "https://badalona.meteoelmasnou.cat", nomEstacio: "Badalona"}
};
// Clau de l'app → nom del model a l'API d'Open-Meteo («auto» és la barreja per defecte, best_match)
export const MODELS = {auto: "best_match", arome: "meteofrance_seamless", ecmwf: "ecmwf_ifs", icon: "icon_eu", ukmo: "ukmo_global_deterministic_10km"};
export const HORES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];   // hores de navegació que es comparen
export const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const norm = d => ((d % 360) + 360) % 360;

// Tipus de vent a la costa del Maresme segons la direcció d'on bufa (graus) i la força (kn)
export function tipusVent(dir, vent) {
  if (dir == null || vent == null) return null;
  if (vent < 3) return "calma";
  const x = norm(dir);
  if (x >= 255 || x < 45) return "terral";     // mestral, tramuntana, ponent: de terra cap al mar
  if (x < 125) return "llevant";
  if (x < 200) return "marinada";              // xaloc i migjorn: la marinada de les tardes d'estiu
  return "garbi";
}
// Direcció mitjana vectorial ponderada pel vent
export function vecDir(list) {
  let x = 0, y = 0;
  for (const o of list) if (o.dir != null) { const w = Math.max(o.wind || 0, 0.1); x += Math.sin(o.dir * Math.PI / 180) * w; y += Math.cos(o.dir * Math.PI / 180) * w; }
  return (x || y) ? Math.round(norm(Math.atan2(x, y) * 180 / Math.PI)) : null;
}
