"use strict";
/* ============ Ocata Vent · Editor del plànol de la base (prototip) ============
   Unitats: metres. Origen (0,0) = base nàutica del club. x cap a l'est, y cap al sud (com l'SVG).
   Es desa en aquest navegador (localStorage) i s'exporta/importa en JSON. Encara no va al núvol. */
(() => {
const $ = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const ORIGIN = {lat:41.479804, lon:2.324024};               // Club Ocata Vent (LOCS.masnou.home)
const KEY = "ov_planol_v1";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"})[c]);
const r2 = v => Math.round(v * 100) / 100;
const fmt = v => String(r2(v)).replace(".", ",");

/* ---------- catàleg ---------- */
// Mides estàndard (eslora l × mànega w, metres). El windsurf és provisional: cal confirmar-lo.
const BOATS = {
  pati:     {n:"Patí català", l:5.60, w:1.60},
  hobie:    {n:"Hobie Cat",   l:5.11, w:2.34},
  llaud:    {n:"Llaüd català", l:6.00, w:2.00},
  barca:    {n:"Barca",       l:4.00, w:1.60},
  windsurf: {n:"Windsurf (provisional)", l:2.50, w:0.70}
};
const POLYS = {
  edifici:   {n:"Edifici",          fill:"#9aa3ad", stroke:"#5b636c", op:1},
  mar:       {n:"Mar",              fill:"#8fc3ea", stroke:"#3d86c6", op:1},
  varada:    {n:"Zona de varada",   fill:"#e9d3a6", stroke:"#b58b3d", op:.9},
  pas:       {n:"Pas",              fill:"#ffffff", stroke:"#8a8f96", op:.55, dash:true},
  caiacs:    {n:"Espai de caiacs",  fill:"#cdbdf3", stroke:"#6f55c9", op:.9},
  prohibida: {n:"Zona prohibida",   fill:"url(#hatch)", stroke:"#c3162a", op:1}
};
const POINTS = {
  dutxa:{n:"Dutxa", c:"#2f7fe0", s:"D"}, aigua:{n:"Aigua", c:"#0a9bd6", s:"A"}, extintor:{n:"Extintor", c:"#c3162a", s:"E"},
  dea:{n:"Desfibril·lador", c:"#0a8a4a", s:"♥"}, contenidor:{n:"Contenidors", c:"#5b636c", s:"C"}
};
const ESTATS = {lloc:{n:"Al seu lloc", f:"#ffffff"}, navegant:{n:"Navegant", f:"#4ea6ff"}, reparacio:{n:"En reparació", f:"#ffb547"}};
const MARGIN = {l:0.40, w:0.40};   // la plaça és una mica més gran que l'embarcació

/* ---------- estat ---------- */
const BLANK = () => ({v:1, origin:ORIGIN, bg:{src:"icgc", dx:0, dy:0, s:1, r:0, op:.75, img:null, imgW:100, imgAR:1}, objs:[]});
let doc = load() || BLANK();
let view = {x:-45, y:-35, w:90};           // finestra visible en metres (x, y = cantonada superior esquerra)
let tool = "sel", sel = new Set(), cur = {boat:"pati", place:"pati", poly:"edifici", point:"dutxa"};
let drag = null, draft = null, measure = null, calib = null, askDel = false, rowN = 5, rowGap = 0.4, rowDir = "w";
const undoS = [], redoS = [];

function load(){ try{ const d = JSON.parse(localStorage.getItem(KEY)); return d && d.objs ? d : null; }catch(e){ return null; } }
let saveT = 0;
function save(){ clearTimeout(saveT); saveT = setTimeout(() => { try{ localStorage.setItem(KEY, JSON.stringify(doc)); }catch(e){ tip("No s'ha pogut desar en aquest navegador (massa gran?). Exporta'l."); } }, 250); }
function snapshot(){ undoS.push(JSON.stringify(doc)); if(undoS.length > 80) undoS.shift(); redoS.length = 0; btns(); }
function undo(){ if(!undoS.length) return; redoS.push(JSON.stringify(doc)); doc = JSON.parse(undoS.pop()); clean(); all(); save(); }
function redo(){ if(!redoS.length) return; undoS.push(JSON.stringify(doc)); doc = JSON.parse(redoS.pop()); clean(); all(); save(); }
function clean(){ for(const id of [...sel]) if(!byId(id)) sel.delete(id); askDel = false; }
const uid = () => Math.random().toString(36).slice(2, 9);
const byId = id => doc.objs.find(o => o.id === id);
const selObjs = () => doc.objs.filter(o => sel.has(o.id));

/* ---------- geometria ---------- */
const svg = $("svg"), mapEl = $("map");
const D2R = Math.PI / 180;
const mPerLon = () => 111320 * Math.cos(ORIGIN.lat * D2R), mPerLat = 110540;
const ll2m = (lat, lon) => [(lon - ORIGIN.lon) * mPerLon(), (ORIGIN.lat - lat) * mPerLat];
const rot = (x, y, a) => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [x*c - y*s, x*s + y*c]; };
function toWorld(ev){ const b = svg.getBoundingClientRect(), k = view.w / b.width; return [view.x + (ev.clientX - b.left) * k, view.y + (ev.clientY - b.top) * k]; }
const ppm = () => svg.getBoundingClientRect().width / view.w;   // píxels per metre
function corners(o){   // embarcació o plaça: cantonades del rectangle girat
  const l = o.l / 2, w = o.w / 2;
  return [[-l, -w], [l, -w], [l, w], [-l, w]].map(([x, y]) => { const [a, b] = rot(x, y, o.r); return [o.x + a, o.y + b]; });
}
function inside(p, poly){ let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, yi] = poly[i], [xj, yj] = poly[j];
  if(((yi > p[1]) !== (yj > p[1])) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function bbox(o){ const P = o.k === "poly" ? o.pts : o.k === "point" ? [[o.x - .7, o.y - .7], [o.x + .7, o.y + .7]] : corners(o);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }

/* ---------- siluetes (coordenades locals: proa cap a +x) ---------- */
function hullPath(L, W, x0, y0){   // un buc estret de catamarà, centrat a (x0, y0)
  const l = L/2, w = W/2;
  return `M${x0-l} ${y0-w*.8} L${x0+l*.55} ${y0-w} Q${x0+l*.92} ${y0-w*.7} ${x0+l} ${y0} Q${x0+l*.92} ${y0+w*.7} ${x0+l*.55} ${y0+w} L${x0-l} ${y0+w*.8} Z`;
}
function shape(t, L, W){
  const l = L/2, w = W/2;
  if(t === "pati"){ const hw = 0.36, yy = w - hw/2;
    return `<path d="${hullPath(L, hw, 0, -yy)} ${hullPath(L, hw, 0, yy)}"/>`
      + `<path class="tr" d="M${-l*.30} ${-yy} L${-l*.30} ${yy} M${l*.18} ${-yy} L${l*.18} ${yy}" fill="none" stroke-width="0.12"/>`
      + `<rect class="tr" x="${-l*.27}" y="${-w*.42}" width="${l*.42}" height="${w*.84}" rx=".08" fill-opacity=".55"/>`; }
  if(t === "hobie"){ const hw = 0.42, yy = w - hw/2;
    return `<path d="${hullPath(L, hw, 0, -yy)} ${hullPath(L, hw, 0, yy)}"/>`
      + `<rect class="tr" x="${-l*.62}" y="${-yy}" width="${l*1.05}" height="${yy*2}" fill-opacity=".45"/>`; }
  if(t === "llaud") return `<path d="M${-l} 0 Q${-l*.85} ${-w*.95} ${-l*.2} ${-w} Q${l*.55} ${-w} ${l} 0 Q${l*.55} ${w} ${-l*.2} ${w} Q${-l*.85} ${w*.95} ${-l} 0 Z"/>`;
  if(t === "barca") return `<path d="M${-l} ${-w*.8} L${l*.25} ${-w} Q${l*.85} ${-w*.75} ${l} 0 Q${l*.85} ${w*.75} ${l*.25} ${w} L${-l} ${w*.8} Z"/>`;
  return `<path d="M${-l} ${-w*.6} Q${-l} ${-w} ${-l*.5} ${-w} L${l*.35} ${-w*.85} Q${l} ${-w*.4} ${l} 0 Q${l} ${w*.4} ${l*.35} ${w*.85} L${-l*.5} ${w} Q${-l} ${w} ${-l} ${w*.6} Z"/>`;
}

/* ---------- fons: ortofoto ICGC (o Esri), o imatge pròpia ---------- */
const SRC = {
  icgc: {n:"Ortofoto ICGC", url:(z, x, y) => `https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/orto/MON3857NW/${z}/${x}/${y}.png`, max:20, attr:"Ortofoto © ICGC (CC BY 4.0)"},
  esri: {n:"Esri World Imagery", url:(z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, max:19, attr:"Imatge © Esri"},
  img:  {n:"Imatge pròpia", attr:"Imatge pròpia (només en aquest ordinador)"},
  cap:  {n:"Sense fons", attr:""}
};
const t2lon = (x, z) => x / 2**z * 360 - 180;
const t2lat = (y, z) => { const n = Math.PI - 2*Math.PI*y / 2**z; return Math.atan(Math.sinh(n)) / D2R; };
const lon2t = (lon, z) => (lon + 180) / 360 * 2**z;
const lat2t = (lat, z) => (1 - Math.log(Math.tan(lat*D2R) + 1/Math.cos(lat*D2R)) / Math.PI) / 2 * 2**z;
// Gira (a graus) i escala (k) el fons al voltant del punt c, sense que c es mogui
function bgAround(c, a, k){ const b = doc.bg; const [vx, vy] = rot((b.dx - c[0]) * k, (b.dy - c[1]) * k, a);
  b.dx = c[0] + vx; b.dy = c[1] + vy; b.r = (((b.r + a) % 360) + 540) % 360 - 180; b.s *= k; }
const viewC = () => [view.x + view.w/2, view.y + view.w*aspect()/2];
function bgTransform(){ const b = doc.bg; return `translate(${b.dx} ${b.dy}) rotate(${b.r}) scale(${b.s})`; }
function drawBg(){
  const g = $("gBg"), b = doc.bg, S = SRC[b.src] || SRC.cap; $("attr").textContent = S.attr;
  const op = tool === "bg" ? Math.max(b.op, .9) : b.op;
  if(b.src === "cap"){ g.innerHTML = ""; return; }
  if(b.src === "img"){ g.innerHTML = b.img ? `<g transform="${bgTransform()}" opacity="${op}"><image href="${b.img}" x="${-b.imgW/2}" y="${-b.imgW*b.imgAR/2}" width="${b.imgW}" height="${b.imgW*b.imgAR}" preserveAspectRatio="none"/></g>` : ""; return; }
  // rajoles que cobreixen la vista (amb marge, pel gir i l'escala del fons)
  const mpp = view.w / Math.max(1, svg.getBoundingClientRect().width);
  const z = Math.max(14, Math.min(S.max, Math.round(Math.log2(156543.03 * Math.cos(ORIGIN.lat*D2R) / mpp / Math.max(.2, b.s)))));
  const pad = view.w * .6, vx0 = view.x - pad, vy0 = view.y - pad, vx1 = view.x + view.w + pad, vy1 = view.y + view.w * aspect() + pad;
  const toLL = (x, y) => { const [ux, uy] = rot((x - b.dx)/b.s, (y - b.dy)/b.s, -b.r); return [ORIGIN.lat - uy/mPerLat, ORIGIN.lon + ux/mPerLon()]; };
  const P = [[vx0, vy0], [vx1, vy0], [vx1, vy1], [vx0, vy1]].map(([x, y]) => toLL(x, y));
  const lats = P.map(p => p[0]), lons = P.map(p => p[1]);
  const tx0 = Math.floor(lon2t(Math.min(...lons), z)), tx1 = Math.floor(lon2t(Math.max(...lons), z));
  const ty0 = Math.floor(lat2t(Math.max(...lats), z)), ty1 = Math.floor(lat2t(Math.min(...lats), z));
  if((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 120){ g.innerHTML = ""; return; }
  let h = "";
  for(let x = tx0; x <= tx1; x++) for(let y = ty0; y <= ty1; y++){
    const [ax, ay] = ll2m(t2lat(y, z), t2lon(x, z)), [bx, by] = ll2m(t2lat(y + 1, z), t2lon(x + 1, z));
    h += `<image href="${S.url(z, x, y)}" x="${ax}" y="${ay}" width="${bx - ax + .02}" height="${by - ay + .02}" preserveAspectRatio="none" data-alt="${b.src === "icgc" ? SRC.icgc.url(z, x, y).replace(".png", ".jpeg") : ""}"/>`;
  }
  g.innerHTML = `<g transform="${bgTransform()}" opacity="${op}">${h}</g>`;
  g.querySelectorAll("image").forEach(im => im.addEventListener("error", () => { const a = im.dataset.alt; if(a){ im.dataset.alt = ""; im.setAttribute("href", a); } else im.remove(); }, {once:false}));
}

/* ---------- dibuix ---------- */
const aspect = () => { const b = svg.getBoundingClientRect(); return b.height / Math.max(1, b.width); };
function setView(){ svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.w * aspect()}`); scaleBar(); }
function scaleBar(){
  const p = ppm(), steps = [1, 2, 5, 10, 20, 50, 100, 200]; let m = steps[0];
  for(const s of steps) if(s * p <= 140) m = s;
  $("scale").innerHTML = `${m} m<b style="width:${Math.round(m * p)}px"></b>`;
}
const boatFill = o => (ESTATS[o.estat] || ESTATS.lloc).f;
function drawObjs(){
  const placeOf = {}; doc.objs.filter(o => o.k === "boat" && o.place).forEach(o => placeOf[o.place] = o);
  const lw = Math.max(.05, 1.4 / ppm()), fs = Math.max(.5, Math.min(1.4, 13 / ppm()));
  let gp = "", gl = "", gb = "", gt = "";
  for(const o of doc.objs){
    const S = sel.has(o.id), cls = `o${S ? " sel" : ""}`;
    if(o.k === "poly"){ const T = POLYS[o.t] || POLYS.edifici;
      gp += `<g class="${cls}" data-id="${o.id}"><path d="M${o.pts.map(p => p.join(" ")).join("L")}Z" fill="${T.fill}" fill-opacity="${T.op}" stroke="${S ? "#0a84ff" : T.stroke}" stroke-width="${S ? lw*2 : lw}" ${T.dash ? `stroke-dasharray="${lw*4} ${lw*3}"` : ""}/>`
        + (o.label || T.n ? (() => { const [x0, y0, x1, y1] = bbox(o); return `<text x="${(x0+x1)/2}" y="${(y0+y1)/2}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" class="tx">${esc(o.label || (o.t === "mar" ? "" : T.n))}</text>`; })() : "") + `</g>`; }
    else if(o.k === "place"){ const b = placeOf[o.id];
      gl += `<g class="${cls}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.r})"><rect x="${-o.l/2}" y="${-o.w/2}" width="${o.l}" height="${o.w}" rx=".15" fill="${b ? "none" : "#ffffff"}" fill-opacity=".18" stroke="${S ? "#0a84ff" : "#3b4450"}" stroke-width="${S ? lw*2 : lw}" stroke-dasharray="${lw*5} ${lw*3}"/>`
        + `<text x="${-o.l/2 + .25}" y="${0}" font-size="${fs*.8}" dominant-baseline="middle" class="tx code" transform="rotate(${-o.r} ${-o.l/2 + .25} 0)">${esc(o.label || "")}</text></g>`; }
    else if(o.k === "boat"){
      gb += `<g class="${cls}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.r})" fill="${boatFill(o)}" stroke="${S ? "#0a84ff" : "#1c2530"}" stroke-width="${S ? lw*2 : lw}" stroke-linejoin="round">${shape(o.t, o.l, o.w)}`
        + `<rect x="${-o.l/2}" y="${-o.w/2}" width="${o.l}" height="${o.w}" fill="transparent" stroke="none"/></g>`;
      const lab = o.label || o.vela || ""; if(lab) gt += `<text x="${o.x}" y="${o.y}" font-size="${fs*.8}" text-anchor="middle" dominant-baseline="middle" class="tx boatlab" pointer-events="none">${esc(lab)}</text>`; }
    else if(o.k === "point"){ const T = POINTS[o.t] || POINTS.dutxa, R = Math.max(.45, 9 / ppm());
      gt += `<g class="${cls}" data-id="${o.id}"><circle cx="${o.x}" cy="${o.y}" r="${R}" fill="${T.c}" stroke="${S ? "#0a84ff" : "#fff"}" stroke-width="${S ? lw*2.5 : lw*1.5}"/><text x="${o.x}" y="${o.y}" font-size="${R*1.1}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700" pointer-events="none">${T.s}</text></g>`; }
  }
  $("gPoly").innerHTML = gp; $("gPlace").innerHTML = gl; $("gBoat").innerHTML = gb + gt; $("gPoint").innerHTML = "";
  drawUi();
}
function drawUi(){
  const lw = 1.5 / ppm(), H = 7 / ppm(); let h = "";
  h += `<g pointer-events="none"><circle cx="0" cy="0" r="${4/ppm()}" fill="#c3162a" stroke="#fff" stroke-width="${lw}"/></g>`;   // origen = base nàutica
  const S = selObjs();
  if(S.length === 1 && tool === "sel"){ const o = S[0];
    if(o.k === "boat" || o.k === "place"){ const [hx, hy] = rot(o.l/2 + 18/ppm(), 0, o.r);
      const [ex, ey] = rot(o.l/2, 0, o.r);
      h += `<line x1="${o.x+ex}" y1="${o.y+ey}" x2="${o.x+hx}" y2="${o.y+hy}" stroke="#0a84ff" stroke-width="${lw}" pointer-events="none"/><circle class="h-rot" cx="${o.x+hx}" cy="${o.y+hy}" r="${H}" fill="#fff" stroke="#0a84ff" stroke-width="${lw*1.5}"/>`; }
    if(o.k === "poly") o.pts.forEach((p, i) => { h += `<rect class="h-vx" data-i="${i}" x="${p[0]-H*.8}" y="${p[1]-H*.8}" width="${H*1.6}" height="${H*1.6}" fill="#fff" stroke="#0a84ff" stroke-width="${lw*1.5}"/>`; });
  }
  if(draft){ const P = draft.pts.concat(draft.hover ? [draft.hover] : []);
    h += `<path d="M${P.map(p => p.join(" ")).join("L")}" fill="${(POLYS[draft.t] || POLYS.edifici).fill}" fill-opacity=".35" stroke="#0a84ff" stroke-width="${lw*1.5}" pointer-events="none"/>`;
    draft.pts.forEach((p, i) => h += `<circle cx="${p[0]}" cy="${p[1]}" r="${H*.7}" fill="${i === 0 ? "#0a84ff" : "#fff"}" stroke="#0a84ff" stroke-width="${lw}" pointer-events="none"/>`); }
  if(drag && drag.box){ const [a, b] = drag.box; h += `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(b[0]-a[0])}" height="${Math.abs(b[1]-a[1])}" fill="#0a84ff" fill-opacity=".1" stroke="#0a84ff" stroke-width="${lw}" stroke-dasharray="${lw*4} ${lw*3}" pointer-events="none"/>`; }
  for(const m of [measure, calib && calib.a && {a:calib.a, b:calib.b || calib.hover}].filter(Boolean)) if(m.a && m.b){ const d = Math.hypot(m.b[0]-m.a[0], m.b[1]-m.a[1]);
    h += `<g pointer-events="none"><line x1="${m.a[0]}" y1="${m.a[1]}" x2="${m.b[0]}" y2="${m.b[1]}" stroke="#ffcf33" stroke-width="${lw*2.5}"/><line x1="${m.a[0]}" y1="${m.a[1]}" x2="${m.b[0]}" y2="${m.b[1]}" stroke="#0a1322" stroke-width="${lw}" stroke-dasharray="${lw*4} ${lw*4}"/>`
      + `<text x="${(m.a[0]+m.b[0])/2}" y="${(m.a[1]+m.b[1])/2 - 10/ppm()}" font-size="${14/ppm()}" text-anchor="middle" class="tx measure">${fmt(d)} m</text></g>`; }
  if(tool === "bg" && !calib && doc.bg.src !== "cap"){ const c = viewC(), R = Math.min(view.w, view.w*aspect()) * .32, a = doc.bg.r * D2R, hx = c[0] + Math.cos(a - Math.PI/2)*R, hy = c[1] + Math.sin(a - Math.PI/2)*R;
    h += `<circle cx="${c[0]}" cy="${c[1]}" r="${R}" fill="none" stroke="#ffcf33" stroke-width="${lw*1.5}" stroke-dasharray="${lw*6} ${lw*4}" pointer-events="none"/>`
      + `<line x1="${c[0]}" y1="${c[1]}" x2="${hx}" y2="${hy}" stroke="#ffcf33" stroke-width="${lw*1.5}" pointer-events="none"/><circle cx="${c[0]}" cy="${c[1]}" r="${H*.6}" fill="#ffcf33" pointer-events="none"/>`
      + `<circle class="h-bgrot" cx="${hx}" cy="${hy}" r="${H*1.6}" fill="#ffcf33" stroke="#0a1322" stroke-width="${lw*1.5}"/>`
      + `<text x="${hx}" y="${hy}" font-size="${H*1.7}" text-anchor="middle" dominant-baseline="central" pointer-events="none" fill="#0a1322">⟳</text>`; }
  $("gUi").innerHTML = h;
}
function all(){ setView(); drawBg(); drawObjs(); panel(); btns(); }
function btns(){ $("undo").disabled = !undoS.length; $("redo").disabled = !redoS.length; document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
  svg.classList.toggle("draw", ["boat", "place", "poly", "point", "measure"].includes(tool) || !!(calib && tool === "bg")); }
let tipT = 0; function tip(t, ms){ $("tip").textContent = t || ""; clearTimeout(tipT); if(t && ms !== 0) tipT = setTimeout(() => $("tip").textContent = "", ms || 3500); }
const TIPS = {
  sel:"Clica per seleccionar · Maj+clic o Maj+arrossega per triar-ne diversos · arrossega el fons per moure el plànol",
  boat:"Clica on vols l'embarcació. Si cau dins una plaça lliure, s'hi encaixa sola.",
  place:"Clica on vols la plaça. La mida surt de l'embarcació triada.",
  poly:"Clica els vèrtexs · clica el primer punt o prem Retorn per tancar · Esc per cancel·lar",
  point:"Clica on vols el punt de servei.",
  measure:"Arrossega per mesurar una distància.",
  bg:"Arrossega per moure la foto · roda: escala · cercle groc ⟳, Maj+roda o [ ]: gira"
};
function setTool(t){ tool = t; draft = null; measure = null; calib = null; askDel = false; if(t !== "sel") sel.clear(); tip(TIPS[t], 6000); all(); }

/* ---------- panell lateral ---------- */
const field = (lab, inp) => `<label class="f"><span class="lbl">${lab}</span>${inp}</label>`;
const num = (k, v, step, min) => `<input type="number" data-k="${k}" value="${r2(v)}" step="${step || 0.1}" ${min != null ? `min="${min}"` : ""} inputmode="decimal">`;
const txt = (k, v, ph) => `<input type="text" data-k="${k}" value="${esc(v || "")}" placeholder="${esc(ph || "")}">`;
const opts = (k, M, v) => `<select data-k="${k}">${Object.entries(M).map(([id, T]) => `<option value="${id}"${id === v ? " selected" : ""}>${esc(T.n)}</option>`).join("")}</select>`;
const chips = (attr, M, v) => `<div class="chips">${Object.entries(M).map(([id, T]) => `<button class="chip" data-${attr}="${id}" aria-pressed="${id === v}">${esc(T.n)}</button>`).join("")}</div>`;
function panel(){
  const S = selObjs(), el = $("side"); let h = "";
  if(tool === "boat") h = `<h2>Nova embarcació</h2>${chips("cboat", BOATS, cur.boat)}<p class="note">${fmt(BOATS[cur.boat].l)} × ${fmt(BOATS[cur.boat].w)} m. ${TIPS.boat}</p>`;
  else if(tool === "place") h = `<h2>Nova plaça</h2><p class="note">Per a quin tipus d'embarcació?</p>${chips("cplace", BOATS, cur.place)}<p class="note">${fmt(BOATS[cur.place].l + MARGIN.l)} × ${fmt(BOATS[cur.place].w + MARGIN.w)} m (embarcació + marge). Numeració automàtica (A1, A2…); la pots canviar.</p>`;
  else if(tool === "poly") h = `<h2>Nova zona</h2>${chips("cpoly", POLYS, cur.poly)}<p class="note">${TIPS.poly}</p>${draft && draft.pts.length >= 3 ? `<button class="tb" id="closePoly">Tanca la forma</button>` : ""}`;
  else if(tool === "point") h = `<h2>Nou punt</h2>${chips("cpoint", POINTS, cur.point)}`;
  else if(tool === "measure") h = `<h2>Mesura</h2><p class="note">${TIPS.measure}</p>${measure && measure.b ? `<p style="font:700 1.6rem var(--f-mono);margin:0">${fmt(Math.hypot(measure.b[0]-measure.a[0], measure.b[1]-measure.a[1]))} m</p>` : ""}`;
  else if(tool === "bg"){ const b = doc.bg;
    h = `<h2>Foto de fons</h2>${chips("bgsrc", SRC, b.src)}
      ${b.src === "img" ? `<button class="tb" id="bgFile">${b.img ? "Canvia la imatge" : "Tria una imatge"}</button><input type="file" id="bgFileIn" accept="image/*" hidden>` : ""}
      <p class="note">Ajusta-la fins que les embarcacions (mida real) hi encaixin. ${TIPS.bg}.</p>
      <div class="row3">${field("Escala %", `<input type="number" data-bg="s" value="${Math.round(b.s*1000)/10}" step="0.5">`)}${field("Gir °", `<input type="number" data-bg="r" value="${r2(b.r)}" step="0.5">`)}${field("Opacitat", `<input type="number" data-bg="op" value="${Math.round(b.op*100)}" step="5" min="0" max="100">`)}</div>
      <div class="row2">${field("Despl. x (m)", `<input type="number" data-bg="dx" value="${r2(b.dx)}" step="0.1">`)}${field("Despl. y (m)", `<input type="number" data-bg="dy" value="${r2(b.dy)}" step="0.1">`)}</div>
      <div><span class="lbl">Gira la foto</span><div class="chips" style="margin-top:4px">${[[-5, "↺ 5°"], [-1, "↺ 1°"], [-.1, "↺ 0,1°"], [.1, "↻ 0,1°"], [1, "↻ 1°"], [5, "↻ 5°"]].map(([a, t]) => `<button class="chip" data-bgrot="${a}">${t}</button>`).join("")}</div>
        <p class="note" style="margin-top:4px">També arrossegant el cercle groc ⟳, amb Maj+roda o girant amb dos dits.</p></div>
      <button class="tb" id="calib" aria-pressed="${!!calib}">Calibra amb una mesura</button>
      ${calib ? `<p class="note">${!calib.a ? "Clica un extrem d'una cosa de mida coneguda a la foto (un patí, un edifici)." : !calib.b ? "Clica l'altre extrem." : ""}</p>${calib.b ? `${field("Mida real (m)", `<input type="number" id="calibM" step="0.01" value="5.6">`)}<button class="tb" id="calibOk">Aplica l'escala</button>` : ""}` : ""}
      <button class="tb" id="bgReset">Torna a l'ajust inicial</button>`; }
  else if(S.length === 1){ const o = S[0];
    if(o.k === "boat"){ const P = doc.objs.filter(x => x.k === "place");
      h = `<h2>${esc(BOATS[o.t]?.n || "Embarcació")}</h2>
        ${field("Tipus", opts("t", BOATS, o.t))}
        <div class="row2">${field("Nom", txt("label", o.label, "Garbinada"))}${field("Vela / matrícula", txt("vela", o.vela, "1234"))}</div>
        ${field("Propietari/a", txt("prop", o.prop, "Nom i cognoms"))}
        ${field("Estat", opts("estat", ESTATS, o.estat || "lloc"))}
        ${field("Plaça", `<select data-k="place"><option value="">Sense plaça</option>${P.map(p => `<option value="${p.id}"${p.id === o.place ? " selected" : ""}>${esc(p.label || "(sense codi)")}</option>`).join("")}</select>`)}
        <details><summary>Mida i posició</summary><div class="row3" style="margin-top:8px">${field("Eslora", num("l", o.l, .01, .5))}${field("Mànega", num("w", o.w, .01, .2))}${field("Gir °", num("r", o.r, 5))}</div></details>`; }
    else if(o.k === "place"){ const b = doc.objs.find(x => x.k === "boat" && x.place === o.id);
      h = `<h2>Plaça ${esc(o.label || "")}</h2>${field("Codi", txt("label", o.label, "A1"))}
        <p class="note">${b ? `Ocupada: ${esc(b.label || BOATS[b.t]?.n)}${b.prop ? " · " + esc(b.prop) : ""}` : "Lliure"}</p>
        <div class="row3">${field("Llarg", num("l", o.l, .05, .5))}${field("Ample", num("w", o.w, .05, .2))}${field("Gir °", num("r", o.r, 5))}</div>`; }
    else if(o.k === "poly") h = `<h2>${esc(POLYS[o.t]?.n || "Zona")}</h2>${field("Tipus", opts("t", POLYS, o.t))}${field("Etiqueta", txt("label", o.label, POLYS[o.t]?.n))}
        <p class="note">Arrossega els quadrats per moure vèrtexs · doble clic a la vora per afegir-ne un · Alt+clic en un vèrtex per treure'l.</p>`;
    else if(o.k === "point") h = `<h2>${esc(POINTS[o.t]?.n || "Punt")}</h2>${field("Tipus", opts("t", POINTS, o.t))}${field("Etiqueta", txt("label", o.label, ""))}`;
    if(o.k === "boat" || o.k === "place") h += rowBox();
    h += delBox(1);
  }
  else if(S.length > 1) h = `<h2>${S.length} elements</h2><p class="note">Arrossega'n un per moure'ls tots · fletxes: 10 cm (Maj: 1 m) · Q/E: gira 5° cadascun.</p>${delBox(S.length)}`;
  else h = `<h2>Plànol</h2><p class="note">${TIPS.sel}</p>
      <p class="note">Tecles: V selecciona · B embarcació · P plaça · Z zona · S punt · M mesura · F fons · Ctrl+D duplica · Supr esborra · Ctrl+Z desfés.</p>
      <p class="note"><b>${doc.objs.filter(o => o.k === "boat").length}</b> embarcacions · <b>${doc.objs.filter(o => o.k === "place").length}</b> places (${doc.objs.filter(o => o.k === "place" && !doc.objs.some(b => b.place === o.id)).length} lliures)</p>
      <p class="note">Prototip: es desa en aquest navegador. Fes servir «Exporta» per guardar-ne una còpia.</p>
      <details><summary>Mides de les plantilles</summary><p class="note">${Object.values(BOATS).map(b => `${esc(b.n)}: ${fmt(b.l)} × ${fmt(b.w)} m`).join("<br>")}</p></details>`;
  el.innerHTML = h;
}
const rowBox = () => `<details${rowN ? "" : ""}><summary>Duplica en fila</summary><div class="row3" style="margin-top:8px">${field("Quantes", `<input type="number" id="rowN" value="${rowN}" min="1" max="40" step="1">`)}${field("Separació", `<input type="number" id="rowGap" value="${rowGap}" step="0.05" min="0">`)}${field("Cap a", `<select id="rowDir"><option value="w"${rowDir === "w" ? " selected" : ""}>Al costat</option><option value="l"${rowDir === "l" ? " selected" : ""}>Darrere</option></select>`)}</div><button class="tb" id="rowGo" style="margin-top:8px">Crea la fila</button></details>`;
const delBox = n => askDel ? `<div class="slide" id="delSlide"><input type="range" min="0" max="100" value="0" aria-label="Llisca per esborrar"><i></i><span>Llisca per esborrar${n > 1 ? " (" + n + ")" : ""}</span></div><button class="tb" id="delNo">Cancel·la</button>` : `<button class="tb" id="delAsk">Esborra${n > 1 ? " (" + n + ")" : ""}</button>`;

$("side").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if(d.cboat){ cur.boat = d.cboat; panel(); return; }
  if(d.cplace){ cur.place = d.cplace; panel(); return; }
  if(d.cpoly){ cur.poly = d.cpoly; if(draft) draft.t = d.cpoly; panel(); drawUi(); return; }
  if(d.cpoint){ cur.point = d.cpoint; panel(); return; }
  if(d.bgrot){ snapshot(); bgAround(viewC(), +d.bgrot, 1); save(); drawBg(); drawUi(); panelLater(); return; }
  if(d.bgsrc){ snapshot(); doc.bg.src = d.bgsrc; save(); all(); return; }
  if(b.id === "closePoly"){ finishPoly(); return; }
  if(b.id === "bgFile"){ $("bgFileIn").click(); return; }
  if(b.id === "calib"){ calib = calib ? null : {}; panel(); drawUi(); btns(); return; }
  if(b.id === "calibOk"){ const m = parseFloat(String($("calibM").value).replace(",", ".")); if(!(m > 0) || !calib || !calib.b) return;
    const d0 = Math.hypot(calib.b[0]-calib.a[0], calib.b[1]-calib.a[1]); if(d0 <= 0) return;
    snapshot(); const k = m / d0, b0 = doc.bg, c = calib.a;   // escala al voltant del primer punt
    b0.dx = c[0] + (b0.dx - c[0]) * k; b0.dy = c[1] + (b0.dy - c[1]) * k; b0.s *= k; calib = null; save(); all(); tip("Escala aplicada.", 2500); return; }
  if(b.id === "bgReset"){ snapshot(); Object.assign(doc.bg, {dx:0, dy:0, s:1, r:0}); save(); all(); return; }
  if(b.id === "delAsk"){ askDel = true; panel(); bindSlide(); return; }
  if(b.id === "delNo"){ askDel = false; panel(); return; }
  if(b.id === "rowGo"){ makeRow(); return; }
});
$("side").addEventListener("input", e => { const t = e.target; if(!t.dataset.bg) return; const k = t.dataset.bg, v = parseFloat(String(t.value).replace(",", ".")); if(!isFinite(v)) return;
  doc.bg[k] = k === "s" ? Math.max(.01, v/100) : k === "op" ? Math.max(0, Math.min(1, v/100)) : v; save(); drawBg(); drawUi(); });
$("side").addEventListener("change", e => {
  const t = e.target;
  if(t.id === "bgFileIn"){ const f = t.files[0]; if(!f) return; const rd = new FileReader();
    rd.onload = () => { const im = new Image(); im.onload = () => { snapshot();
      // reduïm la imatge perquè càpiga al navegador (màx. 2400 px)
      const k = Math.min(1, 2400 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width*k); c.height = Math.round(im.height*k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      Object.assign(doc.bg, {img:c.toDataURL("image/jpeg", .82), imgAR:c.height / c.width, imgW:100, dx:0, dy:0, s:1, r:0}); save(); all(); tip("Imatge carregada. Ara calibra-la amb una mesura o escala-la a mà.", 5000); };
      im.src = rd.result; }; rd.readAsDataURL(f); return; }
  if(t.id === "rowN"){ rowN = Math.max(1, Math.min(40, parseInt(t.value) || 1)); return; }
  if(t.id === "rowGap"){ rowGap = Math.max(0, parseFloat(t.value) || 0); return; }
  if(t.id === "rowDir"){ rowDir = t.value; return; }
  if(t.dataset.bg){ snapshot(); const k = t.dataset.bg, v = parseFloat(String(t.value).replace(",", ".")); if(!isFinite(v)) return;
    doc.bg[k] = k === "s" ? Math.max(.01, v/100) : k === "op" ? Math.max(0, Math.min(1, v/100)) : v; save(); drawBg(); return; }
  const k = t.dataset.k, S = selObjs(); if(!k || S.length !== 1) return; const o = S[0]; snapshot();
  let v = t.value;
  if(["l", "w", "r"].includes(k)){ v = parseFloat(String(v).replace(",", ".")); if(!isFinite(v)) return; }
  if(k === "t" && o.k === "boat"){ o.t = v; o.l = BOATS[v].l; o.w = BOATS[v].w; }
  else if(k === "place"){ assign(o, v || null, true); }
  else o[k] = v;
  if(o.k === "place" && ["l", "w", "r"].includes(k)) follow(o);
  save(); drawObjs(); panel();
});
function bindSlide(){ const s = $("delSlide"); if(!s) return; const inp = s.querySelector("input"), knob = s.querySelector("i");
  const upd = () => knob.style.left = `calc(${inp.value}% - ${inp.value * .41}px + 3px)`;
  inp.addEventListener("input", upd);
  const end = () => { if(+inp.value >= 92) delSel(); else { inp.value = 0; upd(); } };
  inp.addEventListener("change", end); inp.addEventListener("pointerup", end); }

/* ---------- accions ---------- */
function nextCode(){ const used = new Set(doc.objs.filter(o => o.k === "place").map(o => o.label)); let i = 1; while(used.has("A" + i)) i++; return "A" + i; }
function add(o){ snapshot(); o.id = uid(); doc.objs.push(o); sel = new Set([o.id]); save(); return o; }
function assign(boat, placeId, keepPos){
  for(const b of doc.objs) if(b.k === "boat" && b !== boat && placeId && b.place === placeId) b.place = null;   // una embarcació per plaça
  boat.place = placeId; if(!placeId) return; const p = byId(placeId); if(!p || keepPos === false) return;
  boat.x = p.x; boat.y = p.y; boat.r = p.r;
}
function follow(p){ const b = doc.objs.find(x => x.k === "boat" && x.place === p.id); if(b){ b.x = p.x; b.y = p.y; b.r = p.r; } }
function placeAt(pt, except){ return doc.objs.find(o => o.k === "place" && o.id !== except && inside(pt, corners(o))); }
function delSel(){ snapshot(); const ids = new Set(sel);
  doc.objs.forEach(o => { if(o.k === "boat" && ids.has(o.place)) o.place = null; });
  doc.objs = doc.objs.filter(o => !ids.has(o.id)); sel.clear(); askDel = false; save(); all(); tip("Esborrat. Ctrl+Z per desfer.", 3000); }
function dupSel(){ const S = selObjs(); if(!S.length) return; snapshot(); const nw = new Set();
  for(const o of S){ const c = JSON.parse(JSON.stringify(o)); c.id = uid();
    if(c.k === "poly") c.pts = c.pts.map(p => [p[0] + 1, p[1] + 1]); else { c.x += 1; c.y += 1; }
    if(c.k === "place") c.label = nextCode(); if(c.k === "boat") c.place = null; doc.objs.push(c); nw.add(c.id); }
  sel = nw; save(); all(); }
function makeRow(){ const o = selObjs()[0]; if(!o) return; snapshot(); const nw = new Set([o.id]);
  const step = rowDir === "w" ? o.w + rowGap : o.l + rowGap, [ux, uy] = rowDir === "w" ? rot(0, 1, o.r) : rot(-1, 0, o.r);
  for(let i = 1; i < rowN; i++){ const c = JSON.parse(JSON.stringify(o)); c.id = uid(); c.x = o.x + ux*step*i; c.y = o.y + uy*step*i;
    if(c.k === "place") c.label = nextCode(); if(c.k === "boat"){ c.place = null; c.label = ""; c.vela = ""; c.prop = ""; }
    doc.objs.push(c); nw.add(c.id); }
  sel = nw; save(); all(); tip(`Fila de ${rowN} creada.`, 2500); }
function finishPoly(){ if(!draft || draft.pts.length < 3){ draft = null; drawUi(); return; } const t = draft.t, pts = draft.pts; draft = null; add({k:"poly", t, pts, label:""}); tool = "sel"; all(); }
function rotSel(a){ const S = selObjs().filter(o => o.k !== "poly" && o.k !== "point"); if(!S.length) return; snapshot();
  S.forEach(o => { o.r = ((o.r + a) % 360 + 360) % 360; if(o.k === "place") follow(o); }); save(); drawObjs(); panel(); }
function nudge(dx, dy){ const S = selObjs(); if(!S.length) return; snapshot(); moveObjs(S, dx, dy); save(); drawObjs(); }
function moveObjs(S, dx, dy){ for(const o of S){ if(o.k === "poly") o.pts = o.pts.map(p => [p[0] + dx, p[1] + dy]); else { o.x += dx; o.y += dy; } if(o.k === "place") follow(o); } }

/* ---------- ratolí i dits ---------- */
const ptrs = new Map();
function hitId(ev){ const g = ev.target.closest && ev.target.closest("[data-id]"); return g ? g.dataset.id : null; }
svg.addEventListener("pointerdown", ev => {
  svg.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if(ptrs.size === 2 && tool === "bg"){ const [a, b] = [...ptrs.values()]; if(drag && drag.bg){ /* ja hi havia un dit movent */ } snapshot(); drag = {bgpinch:true, d0:Math.hypot(a[0]-b[0], a[1]-b[1]), a0:Math.atan2(b[1]-a[1], b[0]-a[0]) / D2R}; return; }
  if(ptrs.size === 2){ const [a, b] = [...ptrs.values()]; drag = {pinch:true, d0:Math.hypot(a[0]-b[0], a[1]-b[1]), w0:view.w, c:toWorld({clientX:(a[0]+b[0])/2, clientY:(a[1]+b[1])/2})}; return; }
  const p = toWorld(ev);
  if(ev.button === 1 || ev.button === 2){ drag = {pan:true, sx:ev.clientX, sy:ev.clientY, v:{...view}}; svg.classList.add("panning"); return; }
  if(tool === "boat"){ const T = BOATS[cur.boat], pl = placeAt(p); const o = add({k:"boat", t:cur.boat, x:p[0], y:p[1], r:0, l:T.l, w:T.w, label:"", vela:"", prop:"", estat:"lloc", place:null});
    if(pl && !doc.objs.some(b => b.k === "boat" && b.place === pl.id && b !== o)) assign(o, pl.id); save(); drawObjs(); panel(); return; }
  if(tool === "place"){ const T = BOATS[cur.place]; add({k:"place", t:cur.place, x:p[0], y:p[1], r:0, l:T.l + MARGIN.l, w:T.w + MARGIN.w, label:nextCode()}); drawObjs(); panel(); return; }
  if(tool === "point"){ add({k:"point", t:cur.point, x:p[0], y:p[1], label:""}); drawObjs(); panel(); return; }
  if(tool === "poly"){ if(!draft) draft = {t:cur.poly, pts:[]};
    if(draft.pts.length >= 3 && Math.hypot(p[0]-draft.pts[0][0], p[1]-draft.pts[0][1]) < 10/ppm()){ finishPoly(); return; }
    draft.pts.push(p); drawUi(); panel(); return; }
  if(tool === "measure"){ measure = {a:p, b:p}; drag = {measure:true}; drawUi(); return; }
  if(tool === "bg" && ev.target.classList.contains("h-bgrot")){ snapshot(); const c = viewC(); drag = {bgrot:true, c, a0:Math.atan2(p[1]-c[1], p[0]-c[0]) / D2R}; return; }
  if(tool === "bg"){ if(calib){ if(!calib.a) calib.a = p; else if(!calib.b) calib.b = p; else { calib.a = p; calib.b = null; } panel(); drawUi(); return; }
    snapshot(); drag = {bg:true, p0:p, dx:doc.bg.dx, dy:doc.bg.dy}; return; }
  // selecció
  if(ev.target.classList.contains("h-rot")){ const o = selObjs()[0]; snapshot(); drag = {rot:o}; return; }
  if(ev.target.classList.contains("h-vx")){ const o = selObjs()[0], i = +ev.target.dataset.i;
    if(ev.altKey && o.pts.length > 3){ snapshot(); o.pts.splice(i, 1); save(); drawObjs(); return; }
    snapshot(); drag = {vx:o, i}; return; }
  const id = hitId(ev);
  if(id){ if(ev.shiftKey){ sel.has(id) ? sel.delete(id) : sel.add(id); } else if(!sel.has(id)) sel = new Set([id]);
    askDel = false; snapshot(); drag = {move:true, p0:p, last:p, moved:false}; drawObjs(); panel(); return; }
  if(ev.shiftKey){ drag = {box:[p, p]}; return; }
  if(sel.size){ sel.clear(); askDel = false; drawObjs(); panel(); }
  drag = {pan:true, sx:ev.clientX, sy:ev.clientY, v:{...view}}; svg.classList.add("panning");
});
svg.addEventListener("pointermove", ev => {
  if(ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
  const p = toWorld(ev);
  if(drag && drag.bgpinch && ptrs.size === 2){ const [a, b] = [...ptrs.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]), an = Math.atan2(b[1]-a[1], b[0]-a[0]) / D2R;
    const c = toWorld({clientX:(a[0]+b[0])/2, clientY:(a[1]+b[1])/2}); let da = an - drag.a0; if(da > 180) da -= 360; if(da < -180) da += 360;
    bgAround(c, da, d / Math.max(10, drag.d0)); drag.d0 = d; drag.a0 = an; drawBg(); drawUi(); return; }
  if(drag && drag.pinch && ptrs.size === 2){ const [a, b] = [...ptrs.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]); zoomAt(drag.c, drag.w0 * drag.d0 / Math.max(10, d) / view.w); return; }
  if(tool === "poly" && draft){ draft.hover = p; drawUi(); }
  if(tool === "bg" && calib && calib.a && !calib.b){ calib.hover = p; drawUi(); }
  if(!drag) return;
  if(drag.pan){ const k = view.w / svg.getBoundingClientRect().width; view.x = drag.v.x - (ev.clientX - drag.sx)*k; view.y = drag.v.y - (ev.clientY - drag.sy)*k; setView(); bgLater(); return; }
  if(drag.measure){ measure.b = p; drawUi(); panel(); return; }
  if(drag.bgrot){ const a = Math.atan2(p[1]-drag.c[1], p[0]-drag.c[0]) / D2R; let da = a - drag.a0; if(da > 180) da -= 360; if(da < -180) da += 360;
    bgAround(drag.c, da, 1); drag.a0 = a; drawBg(); drawUi(); return; }
  if(drag.bg){ doc.bg.dx = drag.dx + p[0] - drag.p0[0]; doc.bg.dy = drag.dy + p[1] - drag.p0[1]; $("gBg").firstChild && $("gBg").firstChild.setAttribute("transform", bgTransform()); return; }
  if(drag.box){ drag.box[1] = p; drawUi(); return; }
  if(drag.rot){ const o = drag.rot; let a = Math.atan2(p[1] - o.y, p[0] - o.x) / D2R; if(!ev.altKey) a = Math.round(a / 5) * 5; o.r = (a + 360) % 360; if(o.k === "place") follow(o); drawObjs(); return; }
  if(drag.vx){ drag.vx.pts[drag.i] = p; drawObjs(); return; }
  if(drag.move){ const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1]; drag.last = p; drag.moved = true; moveObjs(selObjs(), dx, dy); drawObjs(); }
});
function endPtr(ev){
  ptrs.delete(ev.pointerId); svg.classList.remove("panning");
  if(!drag) return; const d = drag; drag = null;
  if(d.pinch){ bgLater(); return; }
  if(d.bgpinch){ save(); drawBg(); panel(); return; }
  if(d.box){ const [a, b] = d.box, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    doc.objs.forEach(o => { const [bx0, by0, bx1, by1] = bbox(o); if(bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1) sel.add(o.id); }); drawObjs(); panel(); return; }
  if(d.move){ if(!d.moved){ undoS.pop(); btns(); return; }
    const S = selObjs();
    if(S.length === 1 && S[0].k === "boat"){ const o = S[0], pl = placeAt([o.x, o.y]);   // encaixa a la plaça si cau dins
      if(pl && (!doc.objs.some(b => b.k === "boat" && b.place === pl.id && b !== o))) assign(o, pl.id);
      else if(!pl || pl.id !== o.place) o.place = null; }
    save(); drawObjs(); panel(); return; }
  if(d.bg || d.bgrot){ save(); drawBg(); drawUi(); panel(); return; }
  if(d.rot || d.vx){ save(); panel(); return; }
}
svg.addEventListener("pointerup", endPtr); svg.addEventListener("pointercancel", endPtr);
svg.addEventListener("contextmenu", e => e.preventDefault());
svg.addEventListener("dblclick", ev => {   // doble clic a la vora d'una zona: afegeix un vèrtex
  if(tool !== "sel") return; const o = selObjs()[0]; if(!o || o.k !== "poly") return; const p = toWorld(ev);
  let best = -1, bd = Infinity;
  o.pts.forEach((a, i) => { const b = o.pts[(i + 1) % o.pts.length], dx = b[0]-a[0], dy = b[1]-a[1], t = Math.max(0, Math.min(1, ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / (dx*dx + dy*dy || 1)));
    const d = Math.hypot(a[0] + t*dx - p[0], a[1] + t*dy - p[1]); if(d < bd){ bd = d; best = i; } });
  if(bd < 12 / ppm()){ snapshot(); o.pts.splice(best + 1, 0, p); save(); drawObjs(); }
});
svg.addEventListener("wheel", ev => {
  ev.preventDefault(); const p = toWorld(ev);
  if(tool === "bg" && !ev.ctrlKey){ const b = doc.bg;
    if(ev.shiftKey){ bgAround(p, (ev.deltaY || ev.deltaX) > 0 ? .5 : -.5, 1); }
    else { const k = ev.deltaY > 0 ? 1/1.01 : 1.01; b.dx = p[0] + (b.dx - p[0])*k; b.dy = p[1] + (b.dy - p[1])*k; b.s *= k; }
    save(); drawBg(); drawUi(); panelLater(); return; }
  zoomAt(p, ev.deltaY > 0 ? 1.15 : 1/1.15);
}, {passive:false});
function zoomAt(p, k){ const w = Math.max(4, Math.min(800, view.w * k)), f = w / view.w; view.x = p[0] - (p[0] - view.x)*f; view.y = p[1] - (p[1] - view.y)*f; view.w = w; setView(); drawObjs(); bgLater(); }
let bgT = 0; function bgLater(){ clearTimeout(bgT); bgT = setTimeout(drawBg, 120); }
let pT = 0; function panelLater(){ clearTimeout(pT); pT = setTimeout(panel, 200); }
function fit(){ if(!doc.objs.length){ view = {x:-45, y:-35, w:90}; all(); return; }
  const B = doc.objs.map(bbox), x0 = Math.min(...B.map(b => b[0])), y0 = Math.min(...B.map(b => b[1])), x1 = Math.max(...B.map(b => b[2])), y1 = Math.max(...B.map(b => b[3]));
  const w = Math.max(10, (x1 - x0) * 1.15, (y1 - y0) * 1.15 / aspect()); view = {x:(x0 + x1)/2 - w/2, y:(y0 + y1)/2 - w*aspect()/2, w}; all(); }
$("zin").onclick = () => zoomAt([view.x + view.w/2, view.y + view.w*aspect()/2], 1/1.4);
$("zout").onclick = () => zoomAt([view.x + view.w/2, view.y + view.w*aspect()/2], 1.4);
$("zfit").onclick = fit;

/* ---------- teclat ---------- */
document.addEventListener("keydown", ev => {
  if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { if(ev.key === "Escape") document.activeElement.blur(); return; }
  const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
  if(ctrl && k.toLowerCase() === "z"){ ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if(ctrl && k.toLowerCase() === "y"){ ev.preventDefault(); redo(); return; }
  if(ctrl && k.toLowerCase() === "d"){ ev.preventDefault(); dupSel(); return; }
  if(ctrl && k.toLowerCase() === "a"){ ev.preventDefault(); sel = new Set(doc.objs.map(o => o.id)); drawObjs(); panel(); return; }
  if(k === "Escape"){ if(draft){ draft = null; drawUi(); panel(); } else if(tool !== "sel") setTool("sel"); else { sel.clear(); askDel = false; drawObjs(); panel(); } return; }
  if(k === "Enter" && draft){ finishPoly(); return; }
  if((k === "Delete" || k === "Backspace") && sel.size){ askDel = true; panel(); bindSlide(); tip("Confirma-ho lliscant al panell.", 2500); return; }
  if(tool === "bg" && (k === "[" || k === "]")){ snapshot(); bgAround(viewC(), (k === "]" ? 1 : -1) * (ev.shiftKey ? .1 : .5), 1); save(); drawBg(); drawUi(); panelLater(); return; }
  const step = ev.shiftKey ? 1 : .1;
  if(k === "ArrowLeft"){ ev.preventDefault(); nudge(-step, 0); return; } if(k === "ArrowRight"){ ev.preventDefault(); nudge(step, 0); return; }
  if(k === "ArrowUp"){ ev.preventDefault(); nudge(0, -step); return; } if(k === "ArrowDown"){ ev.preventDefault(); nudge(0, step); return; }
  if(k === "q" || k === "Q"){ rotSel(-5); return; } if(k === "e" || k === "E"){ rotSel(5); return; } if(k === "r" || k === "R"){ rotSel(90); return; }
  const T = {v:"sel", b:"boat", p:"place", z:"poly", s:"point", m:"measure", f:"bg"}[k.toLowerCase()]; if(T && !ctrl) setTool(T);
});

/* ---------- barra superior ---------- */
document.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));
$("undo").onclick = undo; $("redo").onclick = redo;
$("exp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], {type:"application/json"}));
  a.download = "planol-base-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
$("imp").onclick = () => $("impF").click();
$("impF").onchange = e => { const f = e.target.files[0]; if(!f) return; f.text().then(t => { try{ const d = JSON.parse(t); if(!d.objs) throw 0; snapshot(); doc = Object.assign(BLANK(), d); sel.clear(); save(); fit(); tip("Plànol importat.", 2500); }catch(err){ tip("Aquest fitxer no és un plànol vàlid."); } }); e.target.value = ""; };
window.addEventListener("resize", () => { setView(); drawObjs(); bgLater(); });

/* ---------- estil del text (es llegeix sobre la foto) ---------- */
const st = document.createElement("style");
st.textContent = `.tx{fill:#0a1322;font-family:var(--f-body);font-weight:700;paint-order:stroke;stroke:#ffffffd9;stroke-width:.12px;stroke-linejoin:round}
.tx.code{font-family:var(--f-mono)} .tx.measure{stroke-width:.3px;font-family:var(--f-mono)} .boatlab{font-family:var(--f-mono)}
.o{cursor:move} .tr{fill:inherit} .h-rot{cursor:grab} .h-vx{cursor:move}`;
document.head.appendChild(st);

setTool("sel"); if(doc.objs.length) fit(); else all();
tip("Prototip de l'editor. Comença per «Fons» per ajustar la foto, o posa-hi places i embarcacions.", 7000);
})();
