"use strict";
/* ============ Ocata Vent · Editor del plànol de la base (prototip) ============
   Unitats: metres. Origen (0,0) = base nàutica del club. x cap a l'est, y cap al sud (com l'SVG).
   Amb sessió i permís, es desa al núvol del club (planol-cloud.js). Amb ?local=1 (o sense permís), és el prototip local (localStorage + JSON). */
(() => {
const $ = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const ORIGIN = {lat:41.479804, lon:2.324024};               // Club Ocata Vent (LOCS.masnou.home)
const KEY = "ov_planol_v1";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"})[c]);
const r2 = v => Math.round(v * 100) / 100;
const fmt = v => String(r2(v)).replace(".", ",");

/* ---------- catàleg (planol-core.js) ---------- */
const {BOATS, POLYS, POINTS, ESTATS, MARGIN} = window.OV_PLAN;

/* ---------- estat ---------- */
const BLANK = () => ({v:1, origin:ORIGIN, bg:{src:"icgc", dx:0, dy:0, s:1, r:0, op:.75, img:null, imgW:100, imgAR:1}, objs:[]});
const CLOUD = window.OV_PLAN_CLOUD || null;
let cl = null, can = {plan:true, boats:true};          // cl: connexió amb el núvol un cop carregada
let doc = CLOUD ? BLANK() : (load() || BLANK());
doc.objs.forEach(o => { if(o.k === "boat"){ delete o.x; delete o.y; delete o.r; delete o.l; delete o.w; if(o.estat === undefined) o.estat = "lloc"; } });
let view = {x:-45, y:-35, w:90};           // finestra visible en metres (x, y = cantonada superior esquerra)
let tool = "sel", sel = new Set(), cur = {boat:"pati", place:"pati", poly:"edifici", point:"dutxa"};
let ghost = null, clip = null, lastPt = [0, 0];   // ghost: plaça (o enganxat) que segueix el cursor abans de deixar-la
cur.rot = 0;
let askBoatDel = false;
let drag = null, draft = null, measure = null, calib = null, askDel = false, rowN = 5, rowGap = 0.4, rowDir = "w";
const undoS = [], redoS = [];

function load(){ try{ const d = JSON.parse(localStorage.getItem(KEY)); return d && d.objs ? d : null; }catch(e){ return null; } }
let saveT = 0;
function save(){ if(cl){ cl.save(doc); if(doc.bg.img) try{ localStorage.setItem(KEY + "_img_" + cl.club, JSON.stringify({img:doc.bg.img, imgW:doc.bg.imgW, imgAR:doc.bg.imgAR})); }catch(e){} return; }
  clearTimeout(saveT); saveT = setTimeout(() => { try{ localStorage.setItem(KEY, JSON.stringify(doc)); }catch(e){ tip("No s'ha pogut desar en aquest navegador (massa gran?). Exporta'l."); } }, 250); }
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
// Encaix: busca el desplaçament més petit que fa coincidir una cantonada de «mine» amb una dels altres
function snapOff(mine, others){
  const thr = 14 / ppm(); let best = null;
  for(const a of mine) for(const b of others){ const d = Math.hypot(b[0]-a[0], b[1]-a[1]); if(d < thr && (!best || d < best.d)) best = {d, dx:b[0]-a[0], dy:b[1]-a[1], pt:b}; }
  return best;
}
const otherCorners = ex => doc.objs.filter(o => o.k === "place" && !ex.has(o.id)).flatMap(corners)
  .concat(doc.objs.filter(o => o.k === "poly" && o.t === "edifici" && !ex.has(o.id)).flatMap(o => o.pts));
const placeCornersOf = L => L.filter(o => o.k === "place").flatMap(corners).concat(L.filter(o => o.k === "poly").flatMap(o => o.pts));
function inside(p, poly){ let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const [xi, yi] = poly[i], [xj, yj] = poly[j];
  if(((yi > p[1]) !== (yj > p[1])) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function bbox(o){ if(o.k === "boat"){ const p = o.place && byId(o.place); return p ? bbox(p) : [0, 0, 0, 0]; } const P = o.k === "poly" ? o.pts : o.k === "point" ? [[o.x - .7, o.y - .7], [o.x + .7, o.y + .7]] : corners(o);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }

/* ---------- siluetes (coordenades locals: proa cap a +x) ---------- */
const shape = window.OV_PLAN.shape;

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
  let gp = "", gl = "", gb = "", gt = "", gs = "";
  const SH = [-Math.sin(20 * D2R), -Math.cos(20 * D2R)];   // direcció de l'ombra (x est, y sud): cap a 340°
  for(const o of doc.objs) if(o.k === "poly" && o.t === "edifici" && o.ombra !== "no" && !sel.has(o.id) && !(drag && drag.vx === o)){
    const L = (o.h || 3) * .6, dx = SH[0]*L, dy = SH[1]*L, P = o.pts, Q = P.map(q => [q[0] + dx, q[1] + dy]);
    // peces separades (si fossin un sol traç, les de sentit contrari s'anul·larien); l'opacitat del grup evita que es dupliquin
    gs += `<path d="M${Q.map(q => q.join(" ")).join("L")}Z"/>` + P.map((a, i) => { const b = P[(i + 1) % P.length], c = Q[(i + 1) % P.length], d = Q[i]; return `<path d="M${a.join(" ")}L${b.join(" ")}L${c.join(" ")}L${d.join(" ")}Z"/>`; }).join("");
  }
  for(const o of doc.objs){
    const S = sel.has(o.id), cls = `o${S ? " sel" : ""}`;
    if(o.k === "poly"){ const T = POLYS[o.t] || POLYS.edifici;
      gp += `<g class="${cls}" data-id="${o.id}"><path d="M${o.pts.map(p => p.join(" ")).join("L")}Z" fill="${T.fill}" fill-opacity="${T.op}" stroke="${S ? "#0a84ff" : T.stroke}" stroke-width="${S ? lw*2 : lw}" ${T.dash ? `stroke-dasharray="${lw*4} ${lw*3}"` : ""}/>`
        + (o.label || T.n ? (() => { const [x0, y0, x1, y1] = bbox(o); return `<text x="${(x0+x1)/2}" y="${(y0+y1)/2}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" class="tx">${esc(o.label || (o.t === "mar" ? "" : T.n))}</text>`; })() : "") + `</g>`; }
    else if(o.k === "place"){ const b = placeOf[o.id], E = b ? (ESTATS[b.estat] || ESTATS.lloc) : null, home = b && (b.estat || "lloc") === "lloc";
      // A la varada: es veu la silueta de l'embarcació. Navegant o en reparació: la plaça es pinta del color de l'estat. Lliure: vora discontínua.
      const st = S ? "#0a84ff" : !b ? "#3b4450" : home ? "#1c2530" : E.s, sw = S ? lw*2 : lw;
      gl += `<g class="${cls}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.r})">`
        + `<rect x="${-o.l/2}" y="${-o.w/2}" width="${o.l}" height="${o.w}" rx=".15" fill="${!b ? "#ffffff" : home ? "#ffffff" : E.f}" fill-opacity="${!b ? .18 : home ? .01 : .55}" stroke="${st}" stroke-width="${sw}" ${!b ? `stroke-dasharray="${lw*5} ${lw*3}"` : ""}/>`
        + (home ? `<g fill="#ffffff" stroke="#1c2530" stroke-width="${lw}" stroke-linejoin="round" pointer-events="none">${shape(b.t, BOATS[b.t]?.l || o.l - MARGIN.l, BOATS[b.t]?.w || o.w - MARGIN.w)}</g>` : "")
        + (b && b.pendent ? `<rect x="${-o.l/2 - lw*2}" y="${-o.w/2 - lw*2}" width="${o.l + lw*4}" height="${o.w + lw*4}" rx=".2" fill="none" stroke="#e07a00" stroke-width="${lw*2}" stroke-dasharray="${lw*4} ${lw*2}" pointer-events="none"/>` : "")
        + `<text x="${-o.l/2 + .25}" y="${0}" font-size="${fs*.8}" dominant-baseline="middle" class="tx code" transform="rotate(${-o.r} ${-o.l/2 + .25} 0)" pointer-events="none">${esc(o.label || "")}</text></g>`;
      const lab = b ? (b.label || b.vela || "") : ""; if(lab) gt += `<text x="${o.x}" y="${o.y}" font-size="${fs*.8}" text-anchor="middle" dominant-baseline="middle" class="tx boatlab" pointer-events="none">${esc(lab)}</text>`; }
    else if(o.k === "boat"){ /* no es dibuixa a mà: surt a la seva plaça */ }
    else if(o.k === "point"){ const T = POINTS[o.t] || POINTS.dutxa, R = Math.max(.45, 9 / ppm());
      gt += `<g class="${cls}" data-id="${o.id}"><circle cx="${o.x}" cy="${o.y}" r="${R}" fill="${T.c}" stroke="${S ? "#0a84ff" : "#fff"}" stroke-width="${S ? lw*2.5 : lw*1.5}"/><text x="${o.x}" y="${o.y}" font-size="${R*1.1}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700" pointer-events="none">${T.s}</text></g>`; }
  }
  $("gPoly").innerHTML = (gs ? `<g fill="#0a1322" opacity=".3" pointer-events="none">${gs}</g>` : "") + gp; $("gPlace").innerHTML = gl; $("gBoat").innerHTML = gb + gt; $("gPoint").innerHTML = "";
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
  if(ghost && (tool === "place" || tool === "paste")){
    for(const o of ghost.objs){
      if(o.k === "place") h += `<g transform="translate(${o.x} ${o.y}) rotate(${o.r})" pointer-events="none"><rect x="${-o.l/2}" y="${-o.w/2}" width="${o.l}" height="${o.w}" rx=".15" fill="#0a84ff" fill-opacity=".28" stroke="#0a84ff" stroke-width="${lw*1.5}"/>`
        + `<g fill="#ffffff" fill-opacity=".6" stroke="#0a84ff" stroke-width="${lw*.8}">${shape(o.t, BOATS[o.t]?.l || o.l - MARGIN.l, BOATS[o.t]?.w || o.w - MARGIN.w)}</g></g>`
        + `<circle cx="${corners(o)[0][0]}" cy="${corners(o)[0][1]}" r="${H*.6}" fill="#0a84ff" pointer-events="none"/>`;
      else if(o.k === "poly") h += `<path d="M${o.pts.map(q => q.join(" ")).join("L")}Z" fill="#0a84ff" fill-opacity=".25" stroke="#0a84ff" stroke-width="${lw*1.5}" pointer-events="none"/>`;
      else if(o.k === "point") h += `<circle cx="${o.x}" cy="${o.y}" r="${H}" fill="#0a84ff" fill-opacity=".5" pointer-events="none"/>`;
    }
    if(ghost.snap) h += `<circle cx="${ghost.snap[0]}" cy="${ghost.snap[1]}" r="${H*1.3}" fill="none" stroke="#ffcf33" stroke-width="${lw*3}" pointer-events="none"/>`;
  }
  if(drag && drag.snap) h += `<circle cx="${drag.snap[0]}" cy="${drag.snap[1]}" r="${H*1.3}" fill="none" stroke="#ffcf33" stroke-width="${lw*3}" pointer-events="none"/>`;
  if(draft){ const P = draft.pts.concat(draft.hover ? [draft.hover] : []);
    h += `<path d="M${P.map(p => p.join(" ")).join("L")}" fill="${(POLYS[draft.t] || POLYS.edifici).fill}" fill-opacity=".35" stroke="#0a84ff" stroke-width="${lw*1.5}" pointer-events="none"/>`;
    draft.pts.forEach((p, i) => h += `<circle cx="${p[0]}" cy="${p[1]}" r="${H*.7}" fill="${i === 0 ? "#0a84ff" : "#fff"}" stroke="#0a84ff" stroke-width="${lw}" pointer-events="none"/>`); }
  if(drag && drag.box){ const [a, b] = drag.box; h += `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(b[0]-a[0])}" height="${Math.abs(b[1]-a[1])}" fill="#0a84ff" fill-opacity=".1" stroke="#0a84ff" stroke-width="${lw}" stroke-dasharray="${lw*4} ${lw*3}" pointer-events="none"/>`; }
  for(const m of [measure, calib && calib.a && {a:calib.a, b:calib.b || calib.hover}].filter(Boolean)) if(m.a && m.b){ const d = Math.hypot(m.b[0]-m.a[0], m.b[1]-m.a[1]);
    h += `<g pointer-events="none"><line x1="${m.a[0]}" y1="${m.a[1]}" x2="${m.b[0]}" y2="${m.b[1]}" stroke="#ffcf33" stroke-width="${lw*2.5}"/><line x1="${m.a[0]}" y1="${m.a[1]}" x2="${m.b[0]}" y2="${m.b[1]}" stroke="#0a1322" stroke-width="${lw}" stroke-dasharray="${lw*4} ${lw*4}"/>`
      + `<text x="${(m.a[0]+m.b[0])/2}" y="${(m.a[1]+m.b[1])/2 - 10/ppm()}" font-size="${14/ppm()}" text-anchor="middle" class="tx measure">${fmt(d)} m</text></g>`; }
  if(tool === "bg" && !calib && doc.bg.src !== "cap"){ const c = viewC(), R = Math.min(view.w, view.w*aspect()) * .28, a = doc.bg.r * D2R, hx = c[0] + Math.cos(a)*R, hy = c[1] + Math.sin(a)*R;
    h += `<circle cx="${c[0]}" cy="${c[1]}" r="${R}" fill="none" stroke="#ffcf33" stroke-width="${lw*1.5}" stroke-dasharray="${lw*6} ${lw*4}" pointer-events="none"/>`
      + `<line x1="${c[0]}" y1="${c[1]}" x2="${hx}" y2="${hy}" stroke="#ffcf33" stroke-width="${lw*1.5}" pointer-events="none"/><circle cx="${c[0]}" cy="${c[1]}" r="${H*.6}" fill="#ffcf33" pointer-events="none"/>`
      + `<circle class="h-bgrot" cx="${hx}" cy="${hy}" r="${H*1.6}" fill="#ffcf33" stroke="#0a1322" stroke-width="${lw*1.5}"/>`
      + `<text x="${hx}" y="${hy}" font-size="${H*1.7}" text-anchor="middle" dominant-baseline="central" pointer-events="none" fill="#0a1322">⟳</text>`; }
  if(tool === "app") h = vistaSvg(lw) + h;
  $("gUi").innerHTML = h; if($("bgbar")) bgBar();
}
/* ---------- enquadrament de l'app (doc.vista, metres) ---------- */
const r1 = v => Math.round(v * 10) / 10;
function rectOf([a, b]){ return {x:r1(Math.min(a[0], b[0])), y:r1(Math.min(a[1], b[1])), w:r1(Math.abs(b[0] - a[0])), h:r1(Math.abs(b[1] - a[1]))}; }
function autoVista(){ const B = doc.objs.filter(o => o.k !== "boat").map(bbox); if(!B.length) return null; const m = 1.5;
  const x0 = Math.min(...B.map(b => b[0])) - m, y0 = Math.min(...B.map(b => b[1])) - m; return {x:r1(x0), y:r1(y0), w:r1(Math.max(...B.map(b => b[2])) + m - x0), h:r1(Math.max(...B.map(b => b[3])) + m - y0)}; }
// mòbil vertical: la targeta fa ~340 px d'ample i com a molt ~600 px d'alt
const phonePpm = v => Math.min(340 / v.w, 600 / v.h);
function vistaSvg(lw){ const live = drag && drag.vista ? rectOf(drag.vista) : null, v = live || doc.vista || autoVista(); if(!v) return "";
  const auto = !live && !doc.vista, c = auto ? "#8a94a3" : "#ff8a00", B = 1e5;
  return `<g pointer-events="none"><path d="M${-B} ${-B}H${B}V${B}H${-B}Z M${v.x} ${v.y}V${v.y + v.h}H${v.x + v.w}V${v.y}Z" fill="#0a1322" fill-opacity=".45" fill-rule="evenodd"/>`
    + `<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" fill="none" stroke="${c}" stroke-width="${lw*3}" stroke-dasharray="${lw*8} ${lw*5}"/>`
    + `<text x="${v.x + 6/ppm()}" y="${v.y - 6/ppm()}" font-size="${13/ppm()}" class="tx measure">${auto ? "Automàtic (tot el plànol)" : "Vista de l'app"} · ${fmt(v.w)} × ${fmt(v.h)} m</text></g>`; }
function all(){ setView(); drawBg(); drawObjs(); panel(); btns(); }
function bgBar(){ const on = tool === "bg" && doc.bg.src !== "cap" && !calib; $("bgbar").hidden = !on; mapEl.classList.toggle("bgmode", tool === "bg");
  $("bgdeg").textContent = String(Math.round(doc.bg.r * 10) / 10).replace(".", ",") + "°"; }
function btns(){ bgBar(); $("undo").disabled = !undoS.length; $("redo").disabled = !redoS.length; document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
  svg.classList.toggle("draw", ["boat", "place", "poly", "point", "measure", "paste", "app"].includes(tool) || !!(calib && tool === "bg")); }
let tipT = 0; function tip(t, ms){ $("tip").textContent = t || ""; clearTimeout(tipT); if(t && ms !== 0) tipT = setTimeout(() => $("tip").textContent = "", ms || 3500); }
const TIPS = {
  sel:"Clica per seleccionar · Maj+clic o Maj+arrossega per triar-ne diversos · arrossega el fons per moure el plànol",
  boat:"Clica on vols l'embarcació. Si cau dins una plaça lliure, s'hi encaixa sola.",
  place:"La plaça segueix el cursor agafada per la cantonada (punt blau) i s'enganxa a les cantonades properes (cercle groc). R gira 90°, Q/E 5°. Clica per deixar-la.",
  paste:"El que has copiat segueix el cursor i s'enganxa a les cantonades. R gira 90°. Clica per enganxar · Esc per acabar.",
  poly:"Clica els vèrtexs · clica el primer punt o prem Retorn per tancar · Esc per cancel·lar",
  point:"Clica on vols el punt de servei.",
  measure:"Arrossega per mesurar una distància.",
  app:"Arrossega un rectangle: és el que veuran els socis a l'app (Club ▸ Base), fix, sense moure'l ni ampliar-lo.",
  bg:"Arrossega per moure la foto · roda: escala · cercle groc ⟳, Maj+roda o [ ]: gira"
};
function setTool(t){ if(!can.plan && planTools.includes(t)){ noPlan(); return; } tool = t; ghost = null; draft = null; measure = null; calib = null; askDel = false; if(t !== "sel") sel.clear(); tip(TIPS[t], 6000); all(); }

/* ---------- panell lateral ---------- */
const field = (lab, inp) => `<label class="f"><span class="lbl">${lab}</span>${inp}</label>`;
const num = (k, v, step, min) => `<input type="number" data-k="${k}" value="${r2(v)}" step="${step || 0.1}" ${min != null ? `min="${min}"` : ""} inputmode="decimal">`;
const txt = (k, v, ph) => `<input type="text" data-k="${k}" value="${esc(v || "")}" placeholder="${esc(ph || "")}">`;
const opts = (k, M, v) => `<select data-k="${k}">${Object.entries(M).map(([id, T]) => `<option value="${id}"${id === v ? " selected" : ""}>${esc(T.n)}</option>`).join("")}</select>`;
const chips = (attr, M, v) => `<div class="chips">${Object.entries(M).map(([id, T]) => `<button class="chip" data-${attr}="${id}" aria-pressed="${id === v}">${esc(T.n)}</button>`).join("")}</div>`;
function panel(){
  const S = selObjs(), el = $("side"); let h = "";
  if(tool === "boat") h = `<h2>Nova embarcació</h2>${chips("cboat", BOATS, cur.boat)}<p class="note">${fmt(BOATS[cur.boat].l)} × ${fmt(BOATS[cur.boat].w)} m. ${TIPS.boat}</p>`;
  else if(tool === "place") h = `<h2>Nova plaça</h2><p class="note">Per a quin tipus d'embarcació?</p>${chips("cplace", BOATS, cur.place)}<p class="note">${fmt(BOATS[cur.place].l + MARGIN.l)} × ${fmt(BOATS[cur.place].w + MARGIN.w)} m (embarcació + marge). Numeració automàtica (A1, A2…).</p>
    <div><span class="lbl">Gir · ${cur.rot}°</span><div class="chips" style="margin-top:4px">${[0, 90, 180, 270].map(a => `<button class="chip" data-crot="${a}" aria-pressed="${cur.rot === a}">${a}°</button>`).join("")}<button class="chip" data-crot="-5">−5°</button><button class="chip" data-crot="+5">+5°</button></div></div>
    <p class="note">${TIPS.place}</p>`;
  else if(tool === "paste") h = `<h2>Enganxa</h2><p class="note">${TIPS.paste}</p><button class="tb" id="clipRot">Gira 90°</button>`;
  else if(tool === "poly") h = `<h2>Nova zona</h2>${chips("cpoly", POLYS, cur.poly)}<p class="note">${TIPS.poly}</p>${draft && draft.pts.length >= 3 ? `<button class="tb" id="closePoly">Tanca la forma</button>` : ""}`;
  else if(tool === "point") h = `<h2>Nou punt</h2>${chips("cpoint", POINTS, cur.point)}`;
  else if(tool === "app"){ const v = doc.vista || autoVista(), px = v ? Math.round(phonePpm(v) * (BOATS.pati.l + MARGIN.l)) : 0;
    h = `<h2>Vista de l'app</h2><p class="note">${TIPS.app}</p>
      <p class="note">${doc.vista ? `Ara: <b>${fmt(doc.vista.w)} × ${fmt(doc.vista.h)} m</b>.` : "Ara és <b>automàtic</b>: tot el que hi ha dibuixat."}${v ? ` Al mòbil, una plaça de patí farà uns <b>${px} px</b>${px < 30 ? " (petita: enquadra menys espai)" : ""}.` : ""}</p>
      <p class="note">El mòbil és vertical: un rectangle quadrat o més alt que ample s'hi veu més gran.</p>
      <button class="tb" id="vistaAuto"${doc.vista ? "" : " disabled"}>Torna a l'automàtic</button>`; }
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
    if(o.k === "place"){ const b = doc.objs.find(x => x.k === "boat" && x.place === o.id), free = doc.objs.filter(x => x.k === "boat" && (!x.place || !byId(x.place)));
      h = `<h2>Plaça ${esc(o.label || "")}</h2>
        ${can.plan ? `<div class="row2">${field("Codi", txt("label", o.label, "A1"))}${field("Per a", opts("pt", BOATS, o.t))}</div>` : `<p class="note">Per a ${esc(BOATS[o.t]?.n || "")}</p>`}
        <span class="lbl">Embarcació</span>
        ${b && b.pendent ? `<div style="padding:8px 10px;border-radius:10px;border:2px dashed #e07a00;display:flex;gap:8px;align-items:center;justify-content:space-between"><span class="note"><b>Pendent de validar</b> · ho ha proposat ${esc(b.prop || "un soci")}</span>${can.boats ? `<button class="tb" id="boatOk">Valida</button>` : ""}</div>` : ""}
        ${!can.boats ? `<p class="note">${b ? esc((b.label || BOATS[b.t]?.n) + " · " + (ESTATS[b.estat] || ESTATS.lloc).n) : "Lliure"}. Les embarcacions les gestiona Manteniment.</p>` : b ? `<div class="row2">${field("Nom", `<input type="text" data-bk="label" value="${esc(b.label || "")}" placeholder="Garbinada">`)}${field("Vela / matrícula", `<input type="text" data-bk="vela" value="${esc(b.vela || "")}" placeholder="1234">`)}</div>
          ${cl ? field("Propietari/a (soci de l'app)", `<select data-bk="propUid"><option value="">— Ningú amb app / del club —</option>${cl.members.map(m => `<option value="${m.uid}"${m.uid === b.propUid ? " selected" : ""}>${esc(m.nom)}</option>`).join("")}</select>`) : ""}
          ${field(cl ? "Nom del propietari/a (si no té app, o del club)" : "Propietari/a", `<input type="text" data-bk="prop" value="${esc(b.prop || "")}" placeholder="Nom i cognoms">`)}
          ${cl ? `${field("Copropietaris", `<input type="text" data-bk="coprop" value="${esc(b.coprop || "")}" placeholder="Separats per comes">`)}
            <label class="cl-sw" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="note">Amaga el nom del propietari al club (només el veuen Manteniment i Junta)</span><input type="checkbox" data-bk="ocult"${b.ocult ? " checked" : ""}></label>
            ${field("Notes", `<input type="text" data-bk="notes" value="${esc(b.notes || "")}" placeholder="Observacions">`)}
            ${(b.historial || []).length ? `<details><summary>Historial (${b.historial.length})</summary><p class="note">${b.historial.slice().reverse().map(x => `${new Date(x.at).toLocaleDateString("ca", {day:"numeric", month:"short"})} · ${esc(x.que)}${x.qui ? " · " + esc(x.qui) : ""}`).join("<br>")}</p></details>` : ""}` : ""}
          <div class="row2">${field("Estat", `<select data-bk="estat">${Object.entries(ESTATS).map(([k, T]) => `<option value="${k}"${k === (b.estat || "lloc") ? " selected" : ""}>${T.n}</option>`).join("")}</select>`)}${field("Tipus", `<select data-bk="t">${Object.entries(BOATS).map(([k, T]) => `<option value="${k}"${k === b.t ? " selected" : ""}>${esc(T.n)}</option>`).join("")}</select>`)}</div>
          <div class="row2"><button class="tb" id="boatOut">Treu-la de la plaça</button><button class="tb" id="boatDelAsk">Dona-la de baixa</button></div>
          ${askBoatDel ? `<div class="slide" id="boatSlide"><input type="range" min="0" max="100" value="0" aria-label="Llisca per donar de baixa l'embarcació"><i></i><span>Llisca per donar-la de baixa</span></div>` : ""}`
        : `<p class="note">Lliure.</p><button class="tb" id="boatNew">Hi poso una embarcació</button>
          ${free.length ? field("O una de les que no tenen plaça", `<select id="boatPick"><option value="">Tria-la…</option>${free.map(x => `<option value="${x.id}">${esc((x.label || BOATS[x.t]?.n) + (x.prop ? " · " + x.prop : ""))}</option>`).join("")}</select>`) : ""}`}
        ${can.plan ? `<details><summary>Mida i gir</summary><div class="row3" style="margin-top:8px">${field("Llarg", num("l", o.l, .05, .5))}${field("Ample", num("w", o.w, .05, .2))}${field("Gir °", num("r", o.r, 5))}</div></details>` : ""}`; }
    else if(o.k === "poly") h = `<h2>${esc(POLYS[o.t]?.n || "Zona")}</h2>${field("Tipus", opts("t", POLYS, o.t))}${field("Etiqueta", txt("label", o.label, POLYS[o.t]?.n))}
        ${o.t === "edifici" ? `<div class="row2" style="align-items:end"><label class="f"><span class="lbl">Ombra</span><select data-k="ombra"><option value="si"${o.ombra !== "no" ? " selected" : ""}>Sí</option><option value="no"${o.ombra === "no" ? " selected" : ""}>No</option></select></label>${field("Alçada (m)", num("h", o.h || 3, .5, .5))}</div>` : ""}
        <p class="note">Arrossega els quadrats per moure vèrtexs · doble clic a la vora per afegir-ne un · Alt+clic en un vèrtex per treure'l.</p>`;
    else if(o.k === "point") h = `<h2>${esc(POINTS[o.t]?.n || "Punt")}</h2>${field("Tipus", opts("t", POINTS, o.t))}${field("Etiqueta", txt("label", o.label, ""))}`;
    if(can.plan){ if(o.k === "place") h += rowBox(); h += clipRow() + delBox(1); }
  }
  else if(S.length > 1) h = `<h2>${S.length} elements</h2><p class="note">Arrossega'n un per moure'ls tots (s'enganxen a les cantonades; Alt per no enganxar) · fletxes: 10 cm (Maj: 1 m) · Q/E: gira 5° cadascun.</p>${clipRow()}${delBox(S.length)}`;
  else h = `<h2>Plànol</h2><p class="note">${TIPS.sel}</p>
      <div class="chips" style="gap:10px;font-size:.85rem">${[["#ffffff", "#1c2530", "A la varada (silueta)"], ["#4ea6ff", "#1f6fc4", "Navegant"], ["#ffb547", "#b86a00", "En reparació"], ["transparent", "#3b4450", "Lliure (discontínua)"]].map(([f, c, t]) => `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:18px;height:12px;border-radius:3px;background:${f};border:2px ${f === "transparent" ? "dashed" : "solid"} ${c}"></i>${t}</span>`).join("")}</div>
      ${(P => P.length ? `<div style="padding:8px 10px;border-radius:10px;border:2px dashed #e07a00"><b>${P.length} pendents de validar</b><p class="note">${P.map(x => { const pl = byId(x.place); return `${esc(x.label || BOATS[x.t]?.n)} · ${pl ? "plaça " + esc(pl.label || "") : "sense plaça"} · ${esc(x.prop || "")}`; }).join("<br>")}</p><p class="note">Toca la plaça (vora taronja) per validar-la.</p></div>` : "")(doc.objs.filter(x => x.k === "boat" && x.pendent))}
      ${(f => f.length ? `<details><summary>Sense plaça (${f.length})</summary><p class="note">${f.map(x => esc((x.label || BOATS[x.t]?.n) + (x.prop ? " · " + x.prop : ""))).join("<br>")}</p><p class="note">Tria una plaça lliure per posar-n'hi una.</p></details>` : "")(doc.objs.filter(x => x.k === "boat" && (!x.place || !byId(x.place))))}
      ${clip ? `<button class="tb" id="pst">Enganxa (${clip.objs.length})</button>` : ""}
      <p class="note">Tecles: Ctrl+C / Ctrl+X / Ctrl+V copia, retalla i enganxa · V selecciona · P plaça · Z zona · S punt · M mesura · F fons · Ctrl+D duplica · Supr esborra · Ctrl+Z desfés.</p>
      <p class="note"><b>${doc.objs.filter(o => o.k === "boat").length}</b> embarcacions · <b>${doc.objs.filter(o => o.k === "place").length}</b> places (${doc.objs.filter(o => o.k === "place" && !doc.objs.some(b => b.place === o.id)).length} lliures)</p>
      <p class="note">${cl ? "Els canvis es desen sols al núvol del club. «Exporta» en guarda una còpia." : "Prototip local: es desa en aquest navegador. «Exporta» en guarda una còpia."}</p>
      <details><summary>Mides de les plantilles</summary><p class="note">${Object.values(BOATS).map(b => `${esc(b.n)}: ${fmt(b.l)} × ${fmt(b.w)} m`).join("<br>")}</p></details>`;
  el.innerHTML = h;
}
const clipRow = () => `<div class="row3"><button class="tb" id="cpy" title="Ctrl+C">Copia</button><button class="tb" id="cut" title="Ctrl+X">Retalla</button><button class="tb" id="pst" title="Ctrl+V"${clip ? "" : " disabled"}>Enganxa</button></div>`;
const rowBox = () => `<details${rowN ? "" : ""}><summary>Duplica en fila</summary><div class="row3" style="margin-top:8px">${field("Quantes", `<input type="number" id="rowN" value="${rowN}" min="1" max="40" step="1">`)}${field("Separació", `<input type="number" id="rowGap" value="${rowGap}" step="0.05" min="0">`)}${field("Cap a", `<select id="rowDir"><option value="w"${rowDir === "w" ? " selected" : ""}>Al costat</option><option value="l"${rowDir === "l" ? " selected" : ""}>Darrere</option></select>`)}</div><button class="tb" id="rowGo" style="margin-top:8px">Crea la fila</button></details>`;
const delBox = n => askDel ? `<div class="slide" id="delSlide"><input type="range" min="0" max="100" value="0" aria-label="Llisca per esborrar"><i></i><span>Llisca per esborrar${n > 1 ? " (" + n + ")" : ""}</span></div><button class="tb" id="delNo">Cancel·la</button>` : `<button class="tb" id="delAsk">Esborra${n > 1 ? " (" + n + ")" : ""}</button>`;

$("side").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return; const d = b.dataset;
  if(d.crot){ const v = d.crot; cur.rot = v[0] === "+" || v[0] === "-" ? ((cur.rot + +v) % 360 + 360) % 360 : +v; ghostPlace(lastPt); drawUi(); panel(); return; }
  if(b.id === "clipRot"){ rotClip(90); return; }
  if(b.id === "cpy"){ copySel(false); return; } if(b.id === "cut"){ copySel(true); return; } if(b.id === "pst"){ startPaste(); return; }
  if(d.cboat){ cur.boat = d.cboat; panel(); return; }
  if(d.cplace){ cur.place = d.cplace; panel(); return; }
  if(d.cpoly){ cur.poly = d.cpoly; if(draft) draft.t = d.cpoly; panel(); drawUi(); return; }
  if(d.cpoint){ cur.point = d.cpoint; panel(); return; }
  if(d.bgrot){ snapshot(); bgAround(viewC(), +d.bgrot, 1); save(); drawBg(); drawUi(); panelLater(); return; }
  if(d.bgsrc){ snapshot(); doc.bg.src = d.bgsrc; save(); all(); return; }
  if(b.id === "closePoly"){ finishPoly(); return; }
  if(b.id === "vistaAuto"){ snapshot(); doc.vista = null; save(); drawUi(); panel(); return; }
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
  if(b.id === "boatNew"){ const p = selObjs()[0]; if(!p) return; snapshot(); doc.objs.push({id:uid(), k:"boat", t:p.t || "pati", label:"", vela:"", prop:"", estat:"lloc", place:p.id}); save(); drawObjs(); panel(); return; }
  if(b.id === "boatDelAsk"){ askBoatDel = !askBoatDel; panel(); bindSlide("boatSlide", () => { const p = selObjs()[0], bt = p && doc.objs.find(x => x.k === "boat" && x.place === p.id); if(!bt) return;
    snapshot(); doc.objs = doc.objs.filter(x => x !== bt); askBoatDel = false; save(); drawObjs(); panel(); tip("Embarcació donada de baixa. Ctrl+Z per desfer.", 3000); }); return; }
  if(b.id === "boatOk"){ const p = selObjs()[0], bt = p && doc.objs.find(x => x.k === "boat" && x.place === p.id); if(!bt) return; snapshot(); bt.pendent = false; save(); drawObjs(); panel(); tip("Validada.", 2000); return; }
  if(b.id === "boatOut"){ const p = selObjs()[0], bt = p && doc.objs.find(x => x.k === "boat" && x.place === p.id); if(!bt) return; snapshot(); bt.place = null; save(); drawObjs(); panel(); tip("Ara és a «Sense plaça» (panell general).", 3000); return; }
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
  if(t.id === "boatPick" && t.value){ const p = selObjs()[0], bt = byId(t.value); if(!p || !bt) return; snapshot(); bt.place = p.id; save(); drawObjs(); panel(); return; }
  if(t.dataset.bk){ const p = selObjs()[0], bt = p && doc.objs.find(x => x.k === "boat" && x.place === p.id); if(!bt || !can.boats) return; snapshot();
    const k = t.dataset.bk; bt[k] = t.type === "checkbox" ? t.checked : t.value;
    if(k === "propUid" && cl){ const m = cl.members.find(x => x.uid === t.value); if(m) bt.prop = m.nom; } save(); drawObjs(); if(t.tagName === "SELECT" || t.type === "checkbox") panel(); return; }
  const k = t.dataset.k, S = selObjs(); if(!k || S.length !== 1) return; const o = S[0]; snapshot();
  let v = t.value;
  if(["l", "w", "r", "h"].includes(k)){ v = parseFloat(String(v).replace(",", ".")); if(!isFinite(v)) return; }
  if(k === "pt" && o.k === "place"){ o.t = v; o.l = BOATS[v].l + MARGIN.l; o.w = BOATS[v].w + MARGIN.w; }
  else if(k === "place"){ assign(o, v || null, true); }
  else o[k] = v;
  if(o.k === "place" && ["l", "w", "r"].includes(k)) follow(o);
  save(); drawObjs(); panel();
});
function bindSlide(id, fn){ const s = $(id || "delSlide"); if(!s) return; fn = fn || delSel; const inp = s.querySelector("input"), knob = s.querySelector("i");
  const upd = () => knob.style.left = `calc(${inp.value}% - ${inp.value * .41}px + 3px)`;
  inp.addEventListener("input", upd);
  const end = () => { if(+inp.value >= 92) fn(); else { inp.value = 0; upd(); } };
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
function ghostPlace(p){
  const T = BOATS[cur.place], l = T.l + MARGIN.l, w = T.w + MARGIN.w, [ox, oy] = rot(l/2, w/2, cur.rot);
  const g = {k:"place", t:cur.place, x:p[0] + ox, y:p[1] + oy, r:cur.rot, l, w};
  const sn = snapOff(corners(g), otherCorners(new Set())); if(sn){ g.x += sn.dx; g.y += sn.dy; }
  ghost = {objs:[g], snap:sn && sn.pt};
}
function clipBox(L){ const B = L.map(o => o.k === "poly" ? bboxPts(o.pts) : o.k === "point" ? [o.x, o.y, o.x, o.y] : bboxPts(corners(o))); return [Math.min(...B.map(b => b[0])), Math.min(...B.map(b => b[1]))]; }
const bboxPts = P => [Math.min(...P.map(q => q[0])), Math.min(...P.map(q => q[1])), Math.max(...P.map(q => q[0])), Math.max(...P.map(q => q[1]))];
function shifted(L, dx, dy){ return L.map(o => { const c = JSON.parse(JSON.stringify(o)); if(c.k === "poly") c.pts = c.pts.map(q => [q[0] + dx, q[1] + dy]); else { c.x += dx; c.y += dy; } return c; }); }
function ghostPaste(p){
  if(!clip) return; const [x0, y0] = clipBox(clip.objs); let L = shifted(clip.objs, p[0] - x0, p[1] - y0);
  const sn = snapOff(placeCornersOf(L), otherCorners(new Set())); if(sn) L = shifted(L, sn.dx, sn.dy);
  ghost = {objs:L, snap:sn && sn.pt};
}
function copySel(cut){
  const S = selObjs(); if(!S.length) return;
  clip = {objs:JSON.parse(JSON.stringify(S)), cut, boats:cut ? doc.objs.filter(b => b.k === "boat" && S.some(o => o.id === b.place)).map(b => b.id) : []};
  if(cut){ snapshot(); const ids = new Set(sel); doc.objs = doc.objs.filter(o => !ids.has(o.id)); sel.clear(); save(); all(); tip(`Retallat (${S.length}). Ctrl+V per enganxar-ho on vulguis; l'embarcació de cada plaça la segueix.`, 4500); }
  else tip(`Copiat (${S.length}). Ctrl+V per enganxar-ho.`, 2500);
  btns();
}
function pasteNow(){
  if(!ghost || !clip) return; snapshot(); const nw = new Set(), used = new Set(doc.objs.map(o => o.id));
  for(const o of ghost.objs){ const c = JSON.parse(JSON.stringify(o));
    if(!clip.cut || used.has(c.id)) c.id = uid();       // el primer cop després de retallar, conserva l'id (i l'embarcació assignada)
    if(c.k === "place" && (!clip.cut || doc.objs.some(x => x.k === "place" && x.label === c.label))) c.label = nextCode();
    doc.objs.push(c); used.add(c.id); nw.add(c.id); }
  clip.cut = false; sel = nw; save(); drawObjs(); panel(); tip("Enganxat. Clica de nou per enganxar-ne una altra còpia, o Esc.", 3000);
}
function startPaste(){ if(!clip || !clip.objs.length){ tip("No hi ha res copiat.", 2000); return; } setTool("paste"); ghostPaste(lastPt); drawUi(); }
function rotClip(a){   // gira el que s'enganxarà, al voltant del seu centre
  const B = clip.objs.map(o => o.k === "poly" ? bboxPts(o.pts) : o.k === "point" ? [o.x, o.y, o.x, o.y] : bboxPts(corners(o)));
  const cx = (Math.min(...B.map(b => b[0])) + Math.max(...B.map(b => b[2]))) / 2, cy = (Math.min(...B.map(b => b[1])) + Math.max(...B.map(b => b[3]))) / 2;
  clip.objs.forEach(o => { const f = q => { const [x, y] = rot(q[0] - cx, q[1] - cy, a); return [cx + x, cy + y]; };
    if(o.k === "poly") o.pts = o.pts.map(f); else { [o.x, o.y] = f([o.x, o.y]); if(o.r != null) o.r = ((o.r + a) % 360 + 360) % 360; } });
  ghostPaste(lastPt); drawUi(); }
function finishPoly(){ if(!draft || draft.pts.length < 3){ draft = null; drawUi(); return; } const t = draft.t, pts = draft.pts; draft = null; add({k:"poly", t, pts, label:""}); tool = "sel"; all(); }
function rotSel(a){ const S = selObjs().filter(o => o.k !== "poly" && o.k !== "point"); if(!S.length) return; snapshot();
  S.forEach(o => { o.r = ((o.r + a) % 360 + 360) % 360; if(o.k === "place") follow(o); }); save(); drawObjs(); panel(); }
function nudge(dx, dy){ const S = selObjs(); if(!S.length) return; snapshot(); moveObjs(S, dx, dy); save(); drawObjs(); }
function moveObjs(S, dx, dy){ for(const o of S){ if(o.k === "poly") o.pts = o.pts.map(p => [p[0] + dx, p[1] + dy]); else { o.x += dx; o.y += dy; } if(o.k === "place") follow(o); } }

/* ---------- ratolí i dits ---------- */
const ptrs = new Map();
function hitId(ev){ const g = ev.target.closest && ev.target.closest("[data-id]"); return g ? g.dataset.id : null; }
const planTools = ["place", "poly", "point", "paste", "bg", "app"];
function noPlan(){ tip("No tens permís per editar el plànol (només les embarcacions).", 3000); }
svg.addEventListener("pointerdown", ev => {
  svg.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if(ptrs.size === 2 && tool === "bg"){ const [a, b] = [...ptrs.values()]; if(drag && drag.bg){ /* ja hi havia un dit movent */ } snapshot(); drag = {bgpinch:true, d0:Math.hypot(a[0]-b[0], a[1]-b[1]), a0:Math.atan2(b[1]-a[1], b[0]-a[0]) / D2R}; return; }
  if(ptrs.size === 2){ const [a, b] = [...ptrs.values()]; drag = {pinch:true, d0:Math.hypot(a[0]-b[0], a[1]-b[1]), w0:view.w, c:toWorld({clientX:(a[0]+b[0])/2, clientY:(a[1]+b[1])/2})}; return; }
  const p = toWorld(ev);
  if(!can.plan && planTools.includes(tool)){ noPlan(); return; }
  if(ev.button === 1 || ev.button === 2){ drag = {pan:true, sx:ev.clientX, sy:ev.clientY, v:{...view}}; svg.classList.add("panning"); return; }
  if(tool === "boat"){ const T = BOATS[cur.boat], pl = placeAt(p); const o = add({k:"boat", t:cur.boat, x:p[0], y:p[1], r:0, l:T.l, w:T.w, label:"", vela:"", prop:"", estat:"lloc", place:null});
    if(pl && !doc.objs.some(b => b.k === "boat" && b.place === pl.id && b !== o)) assign(o, pl.id); save(); drawObjs(); panel(); return; }
  if(tool === "place"){ ghostPlace(p); const g = ghost.objs[0]; add(Object.assign({}, g, {label:nextCode()})); ghostPlace(p); drawObjs(); panel(); return; }
  if(tool === "paste"){ ghostPaste(p); pasteNow(); ghostPaste(p); drawUi(); return; }
  if(tool === "point"){ add({k:"point", t:cur.point, x:p[0], y:p[1], label:""}); drawObjs(); panel(); return; }
  if(tool === "poly"){ if(!draft) draft = {t:cur.poly, pts:[]};
    if(draft.pts.length >= 3 && Math.hypot(p[0]-draft.pts[0][0], p[1]-draft.pts[0][1]) < 10/ppm()){ finishPoly(); return; }
    draft.pts.push(p); drawUi(); panel(); return; }
  if(tool === "measure"){ measure = {a:p, b:p}; drag = {measure:true}; drawUi(); return; }
  if(tool === "app"){ drag = {vista:[p, p]}; drawUi(); return; }
  if(tool === "bg" && ev.target.classList.contains("h-bgrot")){ snapshot(); const c = viewC(); drag = {bgrot:true, c, a0:Math.atan2(p[1]-c[1], p[0]-c[0]) / D2R}; return; }
  if(tool === "bg"){ if(calib){ if(!calib.a) calib.a = p; else if(!calib.b) calib.b = p; else { calib.a = p; calib.b = null; } panel(); drawUi(); return; }
    snapshot(); drag = {bg:true, p0:p, dx:doc.bg.dx, dy:doc.bg.dy}; return; }
  // selecció
  if(ev.target.classList.contains("h-rot")){ const o = selObjs()[0]; snapshot(); drag = {rot:o}; return; }
  if(ev.target.classList.contains("h-vx")){ const o = selObjs()[0], i = +ev.target.dataset.i;
    if(ev.altKey && o.pts.length > 3){ snapshot(); o.pts.splice(i, 1); save(); drawObjs(); return; }
    snapshot(); drag = {vx:o, i}; return; }
  const id = hitId(ev);
  if(id && !can.plan){ askBoatDel = false; sel = new Set([id]); drawObjs(); panel(); return; }   // sense permís de plànol: només selecciona (per obrir la fitxa)
  if(id){ if(ev.shiftKey){ sel.has(id) ? sel.delete(id) : sel.add(id); } else if(!sel.has(id)) sel = new Set([id]);
    askDel = false; askBoatDel = false; snapshot(); drag = {move:true, p0:p, last:p, moved:false, orig:JSON.parse(JSON.stringify(selObjs()))}; drawObjs(); panel(); return; }
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
  lastPt = p;
  if(tool === "poly" && draft){ draft.hover = p; drawUi(); }
  if(tool === "place" && !drag){ ghostPlace(p); drawUi(); }
  if(tool === "paste" && !drag){ ghostPaste(p); drawUi(); }
  if(tool === "bg" && calib && calib.a && !calib.b){ calib.hover = p; drawUi(); }
  if(!drag) return;
  if(drag.pan){ const k = view.w / svg.getBoundingClientRect().width; view.x = drag.v.x - (ev.clientX - drag.sx)*k; view.y = drag.v.y - (ev.clientY - drag.sy)*k; setView(); bgLater(); return; }
  if(drag.measure){ measure.b = p; drawUi(); panel(); return; }
  if(drag.bgrot){ const a = Math.atan2(p[1]-drag.c[1], p[0]-drag.c[0]) / D2R; let da = a - drag.a0; if(da > 180) da -= 360; if(da < -180) da += 360;
    bgAround(drag.c, da, 1); drag.a0 = a; drawBg(); drawUi(); return; }
  if(drag.bg){ doc.bg.dx = drag.dx + p[0] - drag.p0[0]; doc.bg.dy = drag.dy + p[1] - drag.p0[1]; $("gBg").firstChild && $("gBg").firstChild.setAttribute("transform", bgTransform()); return; }
  if(drag.box){ drag.box[1] = p; drawUi(); return; }
  if(drag.vista){ drag.vista[1] = p; drawUi(); return; }
  if(drag.rot){ const o = drag.rot; let a = Math.atan2(p[1] - o.y, p[0] - o.x) / D2R; if(!ev.altKey) a = Math.round(a / 5) * 5; o.r = (a + 360) % 360; if(o.k === "place") follow(o); drawObjs(); return; }
  if(drag.vx){ drag.vx.pts[drag.i] = p; drawObjs(); return; }
  if(drag.move){ let dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1]; drag.moved = drag.moved || Math.hypot(dx, dy) * ppm() > 2;
    const moved = shifted(drag.orig, dx, dy), sn = ev.altKey ? null : snapOff(placeCornersOf(moved), otherCorners(sel));
    if(sn){ dx += sn.dx; dy += sn.dy; } drag.snap = sn && sn.pt;
    for(const o0 of drag.orig){ const o = byId(o0.id); if(!o) continue; if(o.k === "poly") o.pts = o0.pts.map(q => [q[0] + dx, q[1] + dy]); else { o.x = o0.x + dx; o.y = o0.y + dy; } }
    drawObjs(); }
});
function endPtr(ev){
  ptrs.delete(ev.pointerId); svg.classList.remove("panning");
  if(!drag) return; const d = drag; drag = null;
  if(d.pinch){ bgLater(); return; }
  if(d.bgpinch){ save(); drawBg(); panel(); return; }
  if(d.vista){ const v = rectOf(d.vista); if(v.w < 3 || v.h < 3){ drawUi(); tip("Arrossega un rectangle més gran.", 2500); return; } snapshot(); doc.vista = v; save(); drawUi(); panel(); tip("Enquadrament desat. Així es veurà a l'app.", 3000); return; }
  if(d.box){ const [a, b] = d.box, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    doc.objs.forEach(o => { if(o.k === "boat") return; const [bx0, by0, bx1, by1] = bbox(o); if(bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1) sel.add(o.id); }); drawObjs(); panel(); return; }
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
  const B = doc.objs.filter(o => o.k !== "boat").map(bbox); if(!B.length){ view = {x:-45, y:-35, w:90}; all(); return; } const x0 = Math.min(...B.map(b => b[0])), y0 = Math.min(...B.map(b => b[1])), x1 = Math.max(...B.map(b => b[2])), y1 = Math.max(...B.map(b => b[3]));
  const w = Math.max(10, (x1 - x0) * 1.15, (y1 - y0) * 1.15 / aspect()); view = {x:(x0 + x1)/2 - w/2, y:(y0 + y1)/2 - w*aspect()/2, w}; all(); }
$("zin").onclick = () => zoomAt([view.x + view.w/2, view.y + view.w*aspect()/2], 1/1.4);
$("zout").onclick = () => zoomAt([view.x + view.w/2, view.y + view.w*aspect()/2], 1.4);
$("zfit").onclick = fit;
$("bgbar").addEventListener("click", e => { const b = e.target.closest("button"); if(!b) return; snapshot();
  if(b.dataset.bgrot) bgAround(viewC(), +b.dataset.bgrot, 1); else if(b.dataset.bgsc) bgAround(viewC(), 0, +b.dataset.bgsc);
  save(); drawBg(); drawUi(); panelLater(); });

/* ---------- teclat ---------- */
document.addEventListener("keydown", ev => {
  if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { if(ev.key === "Escape") document.activeElement.blur(); return; }
  const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
  if(ctrl && k.toLowerCase() === "z"){ ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if(ctrl && k.toLowerCase() === "y"){ ev.preventDefault(); redo(); return; }
  if(!can.plan && (ctrl && "dxv".includes(k.toLowerCase()) || ["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "q", "Q", "e", "E", "r", "R"].includes(k))){ if(sel.size || ctrl) noPlan(); return; }
  if(ctrl && k.toLowerCase() === "d"){ ev.preventDefault(); dupSel(); return; }
  if(ctrl && k.toLowerCase() === "c"){ ev.preventDefault(); copySel(false); return; }
  if(ctrl && k.toLowerCase() === "x"){ ev.preventDefault(); copySel(true); return; }
  if(ctrl && k.toLowerCase() === "v"){ ev.preventDefault(); startPaste(); return; }
  if(ctrl && k.toLowerCase() === "a"){ ev.preventDefault(); sel = new Set(doc.objs.filter(o => o.k !== "boat").map(o => o.id)); drawObjs(); panel(); return; }
  if(k === "Escape"){ if(draft){ draft = null; drawUi(); panel(); } else if(tool !== "sel") setTool("sel"); else { sel.clear(); askDel = false; drawObjs(); panel(); } return; }
  if(k === "Enter" && draft){ finishPoly(); return; }
  if((k === "Delete" || k === "Backspace") && sel.size){ askDel = true; panel(); bindSlide(); tip("Confirma-ho lliscant al panell.", 2500); return; }
  if(tool === "bg" && (k === "[" || k === "]")){ snapshot(); bgAround(viewC(), (k === "]" ? 1 : -1) * (ev.shiftKey ? .1 : .5), 1); save(); drawBg(); drawUi(); panelLater(); return; }
  const step = ev.shiftKey ? 1 : .1;
  if(k === "ArrowLeft"){ ev.preventDefault(); nudge(-step, 0); return; } if(k === "ArrowRight"){ ev.preventDefault(); nudge(step, 0); return; }
  if(k === "ArrowUp"){ ev.preventDefault(); nudge(0, -step); return; } if(k === "ArrowDown"){ ev.preventDefault(); nudge(0, step); return; }
  if(tool === "place" && "qQeErR".includes(k)){ cur.rot = ((cur.rot + ({q:-5, e:5, r:90})[k.toLowerCase()]) % 360 + 360) % 360; ghostPlace(lastPt); drawUi(); panel(); return; }
  if(tool === "paste" && "rR".includes(k)){ rotClip(90); return; }
  if(k === "q" || k === "Q"){ rotSel(-5); return; } if(k === "e" || k === "E"){ rotSel(5); return; } if(k === "r" || k === "R"){ rotSel(90); return; }
  const T = {v:"sel", p:"place", z:"poly", s:"point", m:"measure", f:"bg", a:"app"}[k.toLowerCase()]; if(T && !ctrl) setTool(T);
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

window.addEventListener("ov-plan-status", e => { const el = $("cloudSt"); if(el){ el.textContent = e.detail.t; el.classList.toggle("err", e.detail.err); } if(e.detail.err) tip(e.detail.t + " Els canvis es tornaran a provar de desar al proper canvi; si continua, exporta'l.", 0); });
if(CLOUD){
  tool = "sel"; all(); tip("Carregant el plànol del club…", 0);
  CLOUD.ready.then(r => {
    if(r.error){ const T = {login:"Entra primer a l'app amb el teu compte (mateix navegador) i torna aquí.", perm:"No tens permís per editar el plànol ni les embarcacions. Ho pot fer la Junta, Manteniment o qui en tingui el permís.", net:"No s'ha pogut connectar amb el núvol.", load:"No s'ha pogut carregar el plànol. " + (r.msg || "")};
      $("side").innerHTML = `<h2>Plànol del club</h2><p class="note">${T[r.error] || T.load}</p><a class="tb" href="./" target="_top">Obre l'app</a><a class="tb" href="?local=1">Prova l'editor sense núvol</a>`; tip(""); return; }
    cl = r; can = r.can; doc = r.doc; undoS.length = 0; redoS.length = 0;
    try{ const im = JSON.parse(localStorage.getItem(KEY + "_img_" + cl.club)); if(im && im.img) Object.assign(doc.bg, im); }catch(e){}
    $("cloudSt").textContent = "Club: " + cl.clubNom + (can.plan ? "" : " · només embarcacions") + (can.boats ? "" : " · només plànol");
    document.querySelectorAll("[data-tool]").forEach(b => { if(!can.plan && planTools.includes(b.dataset.tool)) b.hidden = true; });
    ["imp"].forEach(id => { if(!can.plan) $(id).hidden = true; });
    setTool("sel"); fit(); tip("Plànol del club carregat. Els canvis es desen sols al núvol.", 4000);
  });
} else { setTool("sel"); if(doc.objs.length) fit(); else all(); }
if(!CLOUD) tip("Prototip local (sense núvol). Comença per «Fons» per ajustar la foto, o posa-hi places.", 7000);
})();
