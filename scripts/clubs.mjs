// Genera clubs.js (window.OV_CLUBS) a partir de data/clubs.csv (vela.cat) i data/platges.txt (banderes de la Generalitat).
// Ús: node scripts/clubs.mjs   → per afegir o corregir un club, edita el CSV (o OVERRIDES) i torna'l a executar.
// Per a cada club calcula: comarca i zones d'avisos de Meteocat, orientació de la platja (terral), punt d'onatge mar endins,
// estació local si n'hi ha una a menys de 4 km, i la platja amb bandera més propera (a menys de 2 km).
import {readFileSync, writeFileSync} from "node:fs";

const ROOT = new URL("..", import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), "utf8");

// ---------- comarques: codi de Meteocat (terra) i zona de mar (comarquesAmbMar.json, comprovat 18-10-2026) ----------
// Ordre de la costa, de nord a sud (ordre de la llista del selector)
const COMARQUES = [
  ["Alt Empordà", 2, 99], ["Baix Empordà", 10, 98], ["Selva", 34, 97], ["Maresme", 21, 96], ["Barcelonès", 13, 95],
  ["Baix Llobregat", 11, 91], ["Garraf", 17, 93], ["Baix Penedès", 12, 92], ["Tarragonès", 36, 94], ["Baix Camp", 8, 90],
  ["Baix Ebre", 9, 89], ["Montsià", 22, 88]
];
// Municipi → [comarca, cap on mira la platja en graus (terral = vent des de terra)]. L'orientació és aproximada.
const MUNI = {
  "Portbou": ["Alt Empordà", 90], "Llançà": ["Alt Empordà", 20], "El Port de la Selva": ["Alt Empordà", 350], "Roses": ["Alt Empordà", 180],
  "Empuriabrava": ["Alt Empordà", 110], "Sant Pere Pescador": ["Alt Empordà", 90], "L'Escala": ["Alt Empordà", 70],
  "L'Estartit": ["Baix Empordà", 100], "Pals": ["Baix Empordà", 90], "Begur": ["Baix Empordà", 90], "Tamariu": ["Baix Empordà", 120],
  "Llafranc": ["Baix Empordà", 150], "Calella de Palafrugell": ["Baix Empordà", 140], "Palamós": ["Baix Empordà", 160],
  "Platja d'Aro": ["Baix Empordà", 135], "Sant Feliu de Guíxols": ["Baix Empordà", 150],
  "Lloret de Mar": ["Selva", 165], "Blanes": ["Selva", 165],
  "Malgrat de Mar": ["Maresme", 140], "Pineda de Mar": ["Maresme", 140], "Calella": ["Maresme", 140], "Sant Pol de Mar": ["Maresme", 145],
  "Canet de Mar": ["Maresme", 140], "Arenys de Mar": ["Maresme", 140], "Sant Andreu de Llavaneres": ["Maresme", 140], "Mataró": ["Maresme", 140],
  "Vilassar de Mar": ["Maresme", 145], "Premià de Mar": ["Maresme", 145], "El Masnou": ["Maresme", 135], "Montgat": ["Maresme", 135],
  "Badalona": ["Barcelonès", 125], "Sant Adrià de Besòs": ["Barcelonès", 130], "Barcelona": ["Barcelonès", 135],
  "El Prat de Llobregat": ["Baix Llobregat", 170], "Castelldefels": ["Baix Llobregat", 180],
  "Garraf": ["Garraf", 190], "Sitges": ["Garraf", 185], "Vilanova i la Geltrú": ["Garraf", 190], "Cubelles": ["Garraf", 180],
  "Calafell": ["Baix Penedès", 170], "El Vendrell": ["Baix Penedès", 170], "Coma-ruga": ["Baix Penedès", 170],
  "Creixell": ["Tarragonès", 165], "Torredembarra": ["Tarragonès", 155], "Altafulla": ["Tarragonès", 155], "Tarragona": ["Tarragonès", 150],
  "Salou": ["Tarragonès", 175], "Cambrils": ["Baix Camp", 150], "L'Hospitalet de l'Infant": ["Baix Camp", 135],
  "L'Ametlla de Mar": ["Baix Ebre", 120], "L'Ampolla": ["Baix Ebre", 100],
  "La Ràpita": ["Montsià", 160], "Les Cases d'Alcanar": ["Montsià", 120]
};
// Estacions locals (claus de STATIONS a app.js) i on són. Es fan servir fins a MAX_ST km.
const ST = {masnou:[41.4790, 2.3170], ocata:[41.4798, 2.3240], badalona:[41.4517, 2.2475], vilassar:[41.5044, 2.3978], portbcn:[41.3680, 2.1900]};
const MAX_ST = 4, MAX_BEACH = 2;
// Correccions i dades que el CSV no té. Les claus antigues es mantenen (les tenen desades els mòbils).
const KEYS = {"OCATA VENT, C":"masnou", "MASNOU, CN EL":"cnmasnou", "VILASSAR DE MAR, CN":"vilassar", "BADALONA, CNAT":"badalona",
  "CMV-IND":"cmv", "PATI DE VELA BARCELONA, CLUB":"barceloneta"};
const SKIP = new Set(["INDIVIDUAL", "PRAT, CM"]);   // PRAT, CM = mateixa instal·lació que PRAT, CM - CENTRE
const NAMES = {"CMV-IND":"Centre Municipal de Vela", "PRAT, CM - CENTRE":"CM El Prat", "CNCB & CV PALAMOS":"CN Costa Brava i CV Palamós",
  "VELA FORUM":"Vela Fòrum", "VELA MATARO":"Vela Mataró", "OCATA VENT, C":"Club Ocata Vent", "MASNOU, CN EL":"Club Nàutic El Masnou",
  "VILASSAR DE MAR, CN":"CN Vilassar de Mar", "BADALONA, CNAT":"Club Natació Badalona", "PATI DE VELA BARCELONA, CLUB":"Club Patí Vela Barcelona",
  "BARCELONA, CNAT":"Club Natació Barcelona", "BARCELONA, RCM":"Reial Club Marítim de Barcelona", "BARCELONA, RCN":"Reial Club Nàutic de Barcelona",
  "TARRAGONA, RCN":"Reial Club Nàutic de Tarragona", "PORT OLIMPIC, CMAR":"Club de Mar Port Olímpic", "SITGES, C DE MAR":"Club de Mar Sitges",
  "VILANOVA I LA GELTRU, C DE MAR":"Club de Mar Vilanova i la Geltrú", "TORREDEMBARRA, ASS. CMAR":"Associació Club de Mar Torredembarra",
  "VENT BADALONA, ASS. ESP. DEL":"Associació Esportiva del Vent Badalona", "T. CALAFELL, CLUB NÀUTIC":"Club Nàutic Calafell",
  "F. EMPURIABRAVA, CV":"CV Empuriabrava", "ROSES, GEN":"GEN Roses", "FORÇA 3, AEV":"AEV Força 3", "EOLIS KITE, C E":"CE Eolis Kite",
  "LA SURFERA GIRONINA, CE":"CE La Surfera Gironina", "ROC ROI BCN, ESCOLA DE VELA":"Escola de Vela Roc Roi", "VELA ADAPTADA, ESCOLA DE":"Escola de Vela Adaptada",
  "SANT CARLES DE LA RÀPITA, CN":"CN La Ràpita", "BALLENA ALEGRE-2, CV LA":"CV La Ballena Alegre", "MAR I VENT CANET, C":"Club Mar i Vent Canet",
  "COMA-RUGA, CN":"CN Coma-ruga", "PORT BOU, CN":"CN Portbou"};
const MUNIFIX = {"Barcelona (seu) / L'Estartit (activitat)":"L'Estartit", "Coma-ruga":"Coma-ruga"};
const OVERRIDES = {   // dades curades a mà (estacions dobles, platges, nom curt de l'estació)
  masnou:   {home:[41.479804, 2.324024], lat:41.4766, lon:2.3185, mlat:41.465, mlon:2.33, wm:[41.4795, 2.3265],
             stations:["masnou","ocata"], st:"masnou", stNote:null, beaches:{"081189-p1":"Platja d'Ocata", "081189-p0":"Platja del Masnou"}, flag:"081189-p1"},
  cnmasnou: {lat:41.4766, lon:2.3185, mlat:41.465, mlon:2.33, stations:["masnou","ocata"], st:"masnou", stNote:null,
             beaches:{"081189-p0":"Platja del Masnou", "081189-p1":"Platja d'Ocata"}, flag:"081189-p0"},
  badalona: {beaches:{"080155-p5":"Platja dels Patins de Vela", "080155-p6":"Platja dels Pescadors"}, flag:"080155-p5", stNote:"Estació a Dalt de la Vila, lluny del mar"}
};
// Llocs que no són a vela.cat
const EXTRA = [{key:"marbella", name:"Base Nàutica Mar Bella", muni:"Barcelona", lat:41.3962, lon:2.2098}];

// ---------- utilitats ----------
function csv(text){
  const rows = []; let row = [], f = "", q = false;
  for(let i = 0; i < text.length; i++){ const c = text[i];
    if(q){ if(c === '"'){ if(text[i+1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
    else if(c === '"') q = true; else if(c === ","){ row.push(f); f = ""; }
    else if(c === "\n"){ row.push(f.replace(/\r$/, "")); rows.push(row); row = []; f = ""; } else f += c; }
  if(f || row.length){ row.push(f); rows.push(row); }
  const H = rows.shift(); return rows.filter(r => r.length > 1).map(r => Object.fromEntries(H.map((h, i) => [h, r[i] ?? ""])));
}
const R = Math.PI / 180;
const km = (a, b) => { const x = (b[1]-a[1]) * R * Math.cos((a[0]+b[0]) / 2 * R), y = (b[0]-a[0]) * R; return 6371 * Math.hypot(x, y); };
const move = (p, deg, d) => [+(p[0] + d / 111.2 * Math.cos(deg * R)).toFixed(4), +(p[1] + d / (111.2 * Math.cos(p[0] * R)) * Math.sin(deg * R)).toFixed(4)];
const LOW = new Set(["de", "del", "dels", "la", "les", "el", "els", "i", "per"]);
function title(s){
  return s.toLowerCase().split(/\s+/).map((w, i) => {
    if(i && LOW.has(w)) return w;
    if(/^[ld]'/.test(w)) return (i ? w[0] : w[0].toUpperCase()) + "'" + w[2].toUpperCase() + w.slice(3);
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ").replace(/-(\p{L})/gu, (m, c) => "-" + c.toUpperCase()).replace(/^Cn /, "CN ");
}
const ABBR = {CN:"CN", CV:"CV", CM:"CM", C:"Club", CE:"CE", AE:"AE"};
function pretty(raw){
  if(NAMES[raw]) return NAMES[raw];
  const m = raw.match(/^(.+?),\s*(.+)$/);
  if(!m) return title(raw);
  let [, place, kind] = m, art = "";
  const k = kind.match(/^(\S+)\s+(EL|LA|L')$/); if(k){ kind = k[1]; art = k[2]; }
  const pl = title(place);
  return `${ABBR[kind] || title(kind)} ${art ? (art === "L'" ? "L'" + pl : title(art) + " " + pl) : pl}`;
}
const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- platges ----------
const BEACH = read("data/platges.txt").split("\n").filter(l => l && !l.startsWith("#")).map(l => { const [c, n, la, lo] = l.split("|"); return {c, n, p:[+la, +lo]}; });

// ---------- clubs ----------
const out = {}, warn = [];
const rows = csv(read("data/clubs.csv").replace(/^\uFEFF/, "")).filter(r => r.latitud && r.longitud && !SKIP.has(r.club))
  .map(r => ({raw:r.club, key:KEYS[r.club], name:pretty(r.club), muni:MUNIFIX[r.poblacio] || r.poblacio, lat:+r.latitud, lon:+r.longitud, approx:r.font_coordenades === "aproximada"}))
  .concat(EXTRA);
for(const c of rows){
  const mu = MUNI[c.muni]; if(!mu){ warn.push(`Sense comarca: ${c.name} (${c.muni})`); continue; }
  const [com, coast] = mu, cc = COMARQUES.find(x => x[0] === com);
  const home = [+c.lat.toFixed(5), +c.lon.toFixed(5)], sea = move(home, coast, 1.5);
  let key = c.key || slug(c.name); while(out[key] && !c.key) key += "-2";
  const near = Object.entries(ST).map(([k, p]) => [k, km(home, p)]).filter(x => x[1] <= MAX_ST).sort((a, b) => a[1] - b[1]);
  const st = near.length ? near[0] : null;
  const bs = BEACH.map(b => Object.assign({d:km(home, b.p)}, b)).filter(b => b.d <= MAX_BEACH).sort((a, b) => a.d - b.d).slice(0, 2);
  out[key] = Object.assign({
    name:c.name, muni:c.muni, com, lat:home[0], lon:home[1], mlat:sea[0], mlon:sea[1], home, wm:home, coast,
    stations: st ? [st[0]] : [], st: st ? st[0] : null, stNote: st && st[0] === "badalona" ? "Estació a Dalt de la Vila, lluny del mar" : st && st[1] >= 1.5 ? `Estació a uns ${String(Math.round(st[1] * 2) / 2).replace(".", ",")} km` : null,
    smp:[cc[1], cc[2]], beaches:Object.fromEntries(bs.map(b => [b.c, b.n])), flag: bs[0]?.c ?? null
  }, c.approx ? {approx:true} : {}, OVERRIDES[key] || {});
}
const ord = Object.fromEntries(COMARQUES.map((c, i) => [c[0], i]));
const sorted = Object.fromEntries(Object.entries(out).sort(([, a], [, b]) => ord[a.com] - ord[b.com] || a.name.localeCompare(b.name, "ca")));
const js = `"use strict";
// GENERAT per scripts/clubs.mjs a partir de data/clubs.csv (vela.cat) i data/platges.txt. No l'editis a mà.
// ${Object.keys(sorted).length} clubs. Camps: vegeu LOCS a app.js.
window.OV_CLUBS = ${JSON.stringify(sorted).replace(/\},"/g, '},\n"')};
`;
writeFileSync(new URL("clubs.js", ROOT), js);
const n = Object.values(sorted);
console.log(`${n.length} clubs · amb estació: ${n.filter(c => c.stations.length).length} · amb bandera: ${n.filter(c => c.flag).length}`);
warn.forEach(w => console.warn(w));
