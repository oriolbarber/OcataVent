// Fonts de dades meteo que llegeix el servidor (Cloud Functions) per desar-ne una còpia a Firestore (meteo/*).
// Han de coincidir amb STATIONS, URL_FC, URL_MA i URL_ALT d'app.js: si canvien allà, cal canviar-les aquí.
// Les hores locals (taula de Meteotemplate) es llegeixen amb TZ=Europe/Madrid (el fixa index.js).

export const UA = {"User-Agent": "OcataVent/2 (+https://oriolbarber.github.io/OcataVent/)"};
const KMH = 0.539957, MS = 1.943844;
const UNIT_KN = {kmh: KMH, "km/h": KMH, ms: MS, "m/s": MS, mph: 0.868976, kt: 1, kn: 1, kts: 1};
const OBS_PARAMS = "avgbracketLWbracketR,maxbracketLGbracketR,avgbracketLBbracketR,avgbracketLTbracketR";

export const STATIONS = {
  ocata:    {url: "https://ocata2.meteoelmasnou.cat/meteotemplateLive.txt"},
  masnou:   {url: "https://www.meteoelmasnou.cat/meteotemplateLive.txt"},
  badalona: {url: "https://badalona.meteoelmasnou.cat/meteotemplateLive.txt"},
  portbcn:  {type: "pbcn",
    url:  "https://opendata.portdebarcelona.cat/dataset/1afd4f4d-f329-4959-b1d3-252d973a9c3b/resource/d4263236-5d2a-486e-9ba9-9c4cb27ddc8a/download/14-bocananord_opd_10m.csv",
    hist: "https://opendata.portdebarcelona.cat/dataset/1afd4f4d-f329-4959-b1d3-252d973a9c3b/resource/b724b1e7-26e3-4c6f-80d1-65a0b507065f/download/14-bocananord_opd_10m_hist.csv"},
  vilassar: {type: "wcloud", url: "https://app.weathercloud.net/device/values/0732654059", headers: {"X-Requested-With": "XMLHttpRequest"}}
};

const num = v => { const n = parseFloat(String(v ?? "").replace(/"/g, "")); return Number.isFinite(n) ? n : null; };
const r1 = v => v == null ? null : Math.round(v * 10) / 10;
const pad = n => String(n).padStart(2, "0");
const fmtLocal = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

async function get(u, headers, timeout = 15000) {
  const r = await fetch(u, {headers: {...UA, ...(headers || {})}, signal: AbortSignal.timeout(timeout)});
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r;
}

// Port de Barcelona: CSV (de vegades TOA5 amb 4 línies de capçalera) → [{t, wind, gust, dir, temp}] en nusos, hora UTC
export function pbcnParse(txt) {
  let L = txt.trim().split(/\r?\n/); const hi = L.findIndex(l => l.includes('"TIMESTAMP"') || l.startsWith("TIMESTAMP")); if (hi < 0) return []; L = L.slice(hi); if (L.length < 2) return [];
  const H = L[0].split(",").map(s => s.replace(/"/g, "").trim()), ix = n => H.indexOf(n);
  const iT = ix("TIMESTAMP"), iW = ix("VV_S_WVT"), iD = ix("DV_D1_WVT"), iG = ix("VV10m3Seg_Max") >= 0 ? ix("VV10m3Seg_Max") : ix("VV_Max");
  return L.slice(1).map(r => { const c = r.split(","), m = (c[iT] || "").match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); if (!m) return null;
    const w = num(c[iW]), g = num(c[iG]);
    return {t: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), wind: w == null ? null : w * MS, gust: g == null ? null : g * MS, dir: num(c[iD]), temp: null}; })
    .filter(Boolean).sort((a, b) => a.t - b.t);
}

// Taula interactiva de Meteotemplate (HTML) → registres de 5 min en nusos (hora local)
const strip = s => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
export function parseTaula(html) {
  const head = (html.match(/<thead[\s\S]*?<\/thead>/i) || [""])[0], ths = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => strip(m[1]).toLowerCase());
  const f = UNIT_KN[((ths[1] || "").match(/\(([^)]+)\)/) || [])[1]?.replace(/\s/g, "") ?? ""] ?? KMH;
  const body = (html.match(/<tbody[\s\S]*?<\/tbody>/i) || [""])[0], out = [];
  for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const td = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => strip(m[1]));
    const m = td[0]?.match(/(\d\d)[\/.](\d\d)[\/.](\d{2,4})\s+(\d\d)[:.](\d\d)/); if (!m) continue;
    const w = num(td[1]), g = num(td[2]);
    out.push({t: new Date(m[3].length === 4 ? +m[3] : 2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime(),
      wind: w == null ? null : w * f, gust: g == null ? null : g * f, dir: num(td[3]), temp: num(td[4])});
  }
  return out.sort((a, b) => a.t - b.t);
}

// Lectura d'ara d'una estació → {wind, gust, dir, temp, hum, pres, at} (nusos; at en ms)
export async function stLive(key) {
  const S = STATIONS[key], r = await get(S.url + "?t=" + Date.now(), S.headers);
  if (S.type === "pbcn") { const L = pbcnParse(await r.text()), o = L[L.length - 1]; return o && o.wind != null ? {wind: o.wind, gust: o.gust, dir: o.dir, temp: null, hum: null, pres: null, at: o.t} : null; }
  const j = await r.json();
  if (S.type === "wcloud") { const W = num(j.wspdavg ?? j.wspd); if (W == null) return null;
    return {wind: W * MS, gust: null, dir: num(j.wdiravg ?? j.wdir), temp: num(j.temp), hum: num(j.hum), pres: num(j.bar), at: (num(j.epoch) || 0) * 1000}; }
  const W = num(j.W); if (W == null) return null;
  const G = num(j.G);
  return {wind: W * KMH, gust: G == null ? null : G * KMH, dir: num(j.B), temp: num(j.T), hum: num(j.H), pres: num(j.P), at: (num(j.U) || 0) * 1000};
}

// Registres de les últimes 24 h (Meteotemplate i port). Weathercloud no en té: els acumula index.js amb les lectures d'ara.
export async function stRecs24(key) {
  const S = STATIONS[key], to = Date.now(), from = to - 24 * 3600e3;
  if (S.type === "wcloud") return null;
  if (S.type === "pbcn") {
    const [h, l] = await Promise.all([get(S.hist + "?t=" + to, null, 30000).then(r => r.text()), get(S.url + "?t=" + to).then(r => r.text()).catch(() => "")]);
    const by = new Map(); [...pbcnParse(h), ...pbcnParse(l)].forEach(o => by.set(o.t, o));
    return [...by.values()].filter(o => o.t >= from).sort((a, b) => a.t - b.t);
  }
  const base = new URL(S.url).origin;
  const q = `value=all&interval=custom&from=${encodeURIComponent(fmtLocal(from))}&to=${encodeURIComponent(fmtLocal(to))}&parameters=${OBS_PARAMS}&t=${to}`;
  return parseTaula(await (await get(base + "/pages/station/tableAjax.php?" + q, null, 30000)).text());
}

// Format compacte per a Firestore: [t, vent, ratxa, direcció, temperatura]
export const packRec = o => [o.t, r1(o.wind), r1(o.gust), o.dir == null ? null : Math.round(o.dir), r1(o.temp)];
export const packLive = o => o && {wind: r1(o.wind), gust: r1(o.gust), dir: o.dir == null ? null : Math.round(o.dir), temp: r1(o.temp), hum: o.hum == null ? null : Math.round(o.hum), pres: r1(o.pres), at: o.at};

/* ---------- previsió (Open-Meteo): les mateixes tres consultes que fa l'app ---------- */
export const ALT_APIS = ["meteofrance_seamless", "ecmwf_ifs", "icon_eu", "ukmo_global_deterministic_10km"];
export function omUrls(L, apikey) {
  const host = s => apikey ? `https://customer-${s}.open-meteo.com` : `https://${s}.open-meteo.com`, key = apikey ? "&apikey=" + encodeURIComponent(apikey) : "";
  return {
    fc: `${host("api")}/v1/forecast?latitude=${L.lat}&longitude=${L.lon}` +
      "&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
      "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
      "&daily=sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min" +
      "&wind_speed_unit=kn&timezone=Europe%2FMadrid&forecast_days=16" + key,
    ma: `${host("marine-api")}/v1/marine?latitude=${L.mlat}&longitude=${L.mlon}` +
      "&hourly=wave_height,wave_direction,wave_period,swell_wave_peak_period,sea_surface_temperature" +
      "&current=wave_height,wave_direction,wave_period,sea_surface_temperature" +
      "&cell_selection=sea&timezone=Europe%2FMadrid&forecast_days=16&past_days=1" + key,
    alt: `${host("api")}/v1/forecast?latitude=${L.lat}&longitude=${L.lon}` +
      "&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&models=" + ALT_APIS.join(",") +
      "&wind_speed_unit=kn&timezone=Europe%2FMadrid&forecast_days=7" + key
  };
}
export async function previsio(L, apikey) {
  const U = omUrls(L, apikey), j = u => get(u, null, 30000).then(r => r.json());
  const fc = await j(U.fc);   // sense la previsió principal no es desa res
  const ma = await j(U.ma).catch(() => j(U.ma.replace("forecast_days=16", "forecast_days=8"))).catch(() => null);
  const alt = await j(U.alt).catch(() => null);
  return {fc, ma, alt};
}
