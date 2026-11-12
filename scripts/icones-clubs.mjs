// Icona i manifest de l'app per a cada club (multiclub). Ho fa l'acció «Icones dels clubs» (icones-clubs.yml).
// Llegeix el directori públic de Firestore (directori/{id}: nom, titol, icona) i, per a cada club que no sigui
// Ocata Vent, escriu c/{id}/: manifest.webmanifest, icon-192/512.png, maskable-192/512.png, apple-touch-icon.png
// i hash.txt (sha-256 del text de la icona: la web de gestió el compara per dir si ja és a punt).
// Sense icona pròpia, el manifest du el nom del club i les icones d'Ocata Vent.
// L'app (index.html) apunta al manifest del club si s'obre amb ?club={id} o si el soci és d'aquell club.
import fs from "node:fs/promises";
import crypto from "node:crypto";
import sharp from "sharp";

const URL0 = "https://firestore.googleapis.com/v1/projects/ocatavent/databases/(default)/documents/directori?pageSize=300";
const BG = "#ffffff";   // fons de la icona emmascarable i de la d'iPhone (els logos amb transparència hi queden bé)
const sv = f => (f && (f.stringValue ?? (f.booleanValue === undefined ? "" : f.booleanValue))) ?? "";

const res = await fetch(URL0);
if(!res.ok){ console.error("No s'ha pogut llegir el directori:", res.status); process.exit(1); }
const docs = (await res.json()).documents || [];
let changed = 0;

for(const d of docs){
  const id = d.name.split("/").pop();
  if(id === "ocatavent" || !/^[a-z0-9-]{1,40}$/.test(id)) continue;
  const nom = String(sv(d.fields?.nom) || id).slice(0, 80), titol = String(sv(d.fields?.titol) || "").slice(0, 24);
  const icona = String(sv(d.fields?.icona) || "");
  const dir = `c/${id}`, hash = crypto.createHash("sha256").update(icona + "|" + nom + "|" + titol).digest("hex").slice(0, 16);
  const old = await fs.readFile(`${dir}/hash.txt`, "utf8").catch(() => "");
  if(old.split("\n")[0].trim() === hash) continue;
  await fs.mkdir(dir, {recursive:true});

  let own = false;
  const m = icona.match(/^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/);
  if(m){
    try{
      const src = Buffer.from(m[2], "base64");
      const sq = n => sharp(src, {density:384}).resize(n, n, {fit:"contain", background:{r:0, g:0, b:0, alpha:0}}).png();
      // emmascarable: el logo al 76 % (zona segura d'Android) sobre fons blanc
      const pad = async (n, k) => { const s = Math.round(n * k);
        return sharp({create:{width:n, height:n, channels:4, background:BG}}).composite([{input:await sq(s).toBuffer(), gravity:"center"}]).png(); };
      await (await sq(192)).toFile(`${dir}/icon-192.png`);
      await (await sq(512)).toFile(`${dir}/icon-512.png`);
      await (await pad(192, .76)).toFile(`${dir}/maskable-192.png`);
      await (await pad(512, .76)).toFile(`${dir}/maskable-512.png`);
      await (await pad(180, .86)).toFile(`${dir}/apple-touch-icon.png`);
      own = true;
    }catch(e){ console.error(id, "icona no vàlida:", e.message); }
  }
  const v = "?h=" + hash.slice(0, 8);
  const ic = own ? [
    {src:"icon-192.png" + v, sizes:"192x192", type:"image/png", purpose:"any"},
    {src:"icon-512.png" + v, sizes:"512x512", type:"image/png", purpose:"any"},
    {src:"maskable-192.png" + v, sizes:"192x192", type:"image/png", purpose:"maskable"},
    {src:"maskable-512.png" + v, sizes:"512x512", type:"image/png", purpose:"maskable"}]
  : [{src:"../../icons/icon-192.png?v=3", sizes:"192x192", type:"image/png", purpose:"any"},
     {src:"../../icons/icon-512.png?v=3", sizes:"512x512", type:"image/png", purpose:"any"},
     {src:"../../icons/maskable-192.png?v=3", sizes:"192x192", type:"image/png", purpose:"maskable"},
     {src:"../../icons/maskable-512.png?v=3", sizes:"512x512", type:"image/png", purpose:"maskable"}];
  if(!own) await fs.rm(`${dir}/apple-touch-icon.png`, {force:true});
  // Nom curt (sota la icona): el títol del club; si no n'hi ha, el nom sense «Club Nàutic…», tallat per paraules (≤ 15)
  const cut = t => t.length <= 15 ? t : t.split(" ").reduce((a, w) => (a + " " + w).trim().length <= 15 ? (a + " " + w).trim() : a, "") || t.slice(0, 15);
  const short = titol || (nom.length <= 15 ? nom : cut(nom.replace(/^(Club|Centre)\s+(Nàutic|de Vela|Vela|Esportiu|Natació)?\s*/i, "")));
  const man = {name:nom, short_name:short, id:"./?club=" + id, description:`App de navegació de ${nom}: vent, onades, sortides i club.`,
    lang:"ca", start_url:"../../?club=" + id, scope:"../../", display:"standalone", orientation:"portrait",
    background_color:"#ffffff", theme_color:"#dc3427", icons:ic};
  await fs.writeFile(`${dir}/manifest.webmanifest`, JSON.stringify(man, null, 2) + "\n");
  await fs.writeFile(`${dir}/hash.txt`, hash + "\n" + (own ? "propia" : "ocatavent") + "\n");
  console.log(id, own ? "icona pròpia" : "icona d'Ocata Vent", hash);
  changed++;
}
console.log(changed ? `${changed} clubs actualitzats.` : "Sense canvis.");
