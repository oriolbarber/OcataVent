"use strict";
/* ============ Ocata Vent · Plànol de la base: nucli compartit ============
   El fan servir l'editor (planol.html) i l'app (Club ▸ Base). Unitats: metres; origen = base nàutica; x cap a l'est, y cap al sud.
   Dades al núvol: clubs/{club}/planol/actual (places, zones, punts, fons) i embarcacions/{id} (fitxes, assignades a una plaça). */
(() => {
const D2R = Math.PI / 180;
const rot = (x, y, a) => { const c = Math.cos(a * D2R), s = Math.sin(a * D2R); return [x*c - y*s, x*s + y*c]; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"})[c]);

// Mides estàndard (eslora l × mànega w, metres). El windsurf és provisional.
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
  prohibida: {n:"Zona prohibida",   fill:"url(#ovHatch)", stroke:"#c3162a", op:1}
};
const POINTS = {
  dutxa:{n:"Dutxa", c:"#2f7fe0", s:"D"}, aigua:{n:"Aigua", c:"#0a9bd6", s:"A"}, extintor:{n:"Extintor", c:"#c3162a", s:"E"},
  dea:{n:"Desfibril·lador", c:"#0a8a4a", s:"♥"}, contenidor:{n:"Contenidors", c:"#5b636c", s:"C"}
};
const ESTATS = {lloc:{n:"A la varada", c:"Varada", f:"#ffffff", s:"#1c2530"}, navegant:{n:"Navegant", f:"#4ea6ff", s:"#1f6fc4"}, reparacio:{n:"En reparació", c:"Reparació", f:"#ffb547", s:"#b86a00"}};
const MARGIN = {l:0.40, w:0.40};   // la plaça és una mica més gran que l'embarcació
const SHADOW = [-Math.sin(20 * D2R), -Math.cos(20 * D2R)];   // sol del migdia una mica de llevant: l'ombra va cap a 340°

function hullPath(L, W, x0, y0){
  const l = L/2, w = W/2;
  return `M${x0-l} ${y0-w*.8} L${x0+l*.55} ${y0-w} Q${x0+l*.92} ${y0-w*.7} ${x0+l} ${y0} Q${x0+l*.92} ${y0+w*.7} ${x0+l*.55} ${y0+w} L${x0-l} ${y0+w*.8} Z`;
}
// Silueta (coordenades locals, proa cap a +x)
function shape(t, L, W){
  const l = L/2, w = W/2;
  if(t === "pati"){ const hw = 0.36, yy = w - hw/2;
    return `<path d="${hullPath(L, hw, 0, -yy)} ${hullPath(L, hw, 0, yy)}"/>`
      + `<path d="M${-l*.30} ${-yy} L${-l*.30} ${yy} M${l*.18} ${-yy} L${l*.18} ${yy}" fill="none" stroke-width="0.12"/>`
      + `<rect x="${-l*.27}" y="${-w*.42}" width="${l*.42}" height="${w*.84}" rx=".08" fill-opacity=".55"/>`; }
  if(t === "hobie"){ const hw = 0.42, yy = w - hw/2;
    return `<path d="${hullPath(L, hw, 0, -yy)} ${hullPath(L, hw, 0, yy)}"/>`
      + `<rect x="${-l*.62}" y="${-yy}" width="${l*1.05}" height="${yy*2}" fill-opacity=".45"/>`; }
  if(t === "llaud") return `<path d="M${-l} 0 Q${-l*.85} ${-w*.95} ${-l*.2} ${-w} Q${l*.55} ${-w} ${l} 0 Q${l*.55} ${w} ${-l*.2} ${w} Q${-l*.85} ${w*.95} ${-l} 0 Z"/>`;
  if(t === "barca") return `<path d="M${-l} ${-w*.8} L${l*.25} ${-w} Q${l*.85} ${-w*.75} ${l} 0 Q${l*.85} ${w*.75} ${l*.25} ${w} L${-l} ${w*.8} Z"/>`;
  return `<path d="M${-l} ${-w*.6} Q${-l} ${-w} ${-l*.5} ${-w} L${l*.35} ${-w*.85} Q${l} ${-w*.4} ${l} 0 Q${l} ${w*.4} ${l*.35} ${w*.85} L${-l*.5} ${w} Q${-l} ${w} ${-l} ${w*.6} Z"/>`;
}
function corners(o){ const l = o.l / 2, w = o.w / 2;
  return [[-l, -w], [l, -w], [l, w], [-l, w]].map(([x, y]) => { const [a, b] = rot(x, y, o.r || 0); return [o.x + a, o.y + b]; }); }
function bbox(o){ const P = o.k === "poly" ? o.pts : o.k === "point" ? [[o.x - .7, o.y - .7], [o.x + .7, o.y + .7]] : corners(o);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
// Ombra d'un edifici: el polígon desplaçat + una peça per costat (peces separades: un sol traç s'anul·laria)
function shadowSvg(o){
  const L = (o.h || 3) * .6, dx = SHADOW[0]*L, dy = SHADOW[1]*L, P = o.pts, Q = P.map(q => [q[0] + dx, q[1] + dy]);
  return `<path d="M${Q.map(q => q.join(" ")).join("L")}Z"/>` + P.map((a, i) => { const b = P[(i + 1) % P.length], c = Q[(i + 1) % P.length], d = Q[i];
    return `<path d="M${a.join(" ")}L${b.join(" ")}L${c.join(" ")}L${d.join(" ")}Z"/>`; }).join("");
}
const DEFS = `<defs><pattern id="ovHatch" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v1" stroke="#c3162a" stroke-width=".25"/></pattern></defs>`;

/* Dibuix de només lectura (app): zones amb ombra, places pintades segons l'embarcació, siluetes a la varada, punts.
   opts: {ppm (píxels per metre), mine (Set d'ids d'embarcació meves), sel (id de plaça seleccionada)} */
function render(plan, boats, opts){
  opts = opts || {}; const ppm = opts.ppm || 8, lw = Math.max(.05, 1.4 / ppm), fs = Math.max(.5, Math.min(1.6, 13 / ppm));
  const objs = (plan && plan.objs) || [], byPlace = {}; (boats || []).forEach(b => { if(b.place) byPlace[b.place] = b; });
  let sh = "", gp = "", gl = "", gt = "";
  for(const o of objs){
    if(o.k === "poly"){ const T = POLYS[o.t] || POLYS.edifici;
      if(o.t === "edifici" && o.ombra !== "no") sh += shadowSvg(o);
      const [x0, y0, x1, y1] = bbox(o), lab = o.label || (o.t === "mar" ? "" : T.n);
      gp += `<path d="M${o.pts.map(p => p.join(" ")).join("L")}Z" fill="${T.fill}" fill-opacity="${T.op}" stroke="${T.stroke}" stroke-width="${lw}" ${T.dash ? `stroke-dasharray="${lw*4} ${lw*3}"` : ""}/>`
        + (lab ? `<text x="${(x0+x1)/2}" y="${(y0+y1)/2}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" class="ovp-tx">${esc(lab)}</text>` : ""); }
    else if(o.k === "place"){ const b = byPlace[o.id], E = b ? (ESTATS[b.estat] || ESTATS.lloc) : null, home = b && (b.estat || "lloc") === "lloc";
      const mine = b && opts.mine && opts.mine.has(b.id), selp = opts.sel === o.id;
      const st = selp ? "#0a84ff" : mine ? "#0a1322" : !b ? "#3b4450" : home ? "#1c2530" : E.s, sw = selp ? lw*2 : mine ? lw*1.6 : lw;
      gl += `<g data-place="${esc(o.id)}" transform="translate(${o.x} ${o.y}) rotate(${o.r || 0})">`
        + `<rect x="${-o.l/2}" y="${-o.w/2}" width="${o.l}" height="${o.w}" rx=".15" fill="${!b || home ? "#ffffff" : E.f}" fill-opacity="${!b ? .25 : home ? .01 : .6}" stroke="${st}" stroke-width="${sw}" ${!b ? `stroke-dasharray="${lw*5} ${lw*3}"` : ""}/>`
        + (home ? `<g fill="#ffffff" stroke="#1c2530" stroke-width="${lw}" stroke-linejoin="round" pointer-events="none">${shape(b.t, BOATS[b.t]?.l || o.l - MARGIN.l, BOATS[b.t]?.w || o.w - MARGIN.w)}</g>` : "")
        + (b && b.pendent ? `<rect x="${-o.l/2 - lw*2}" y="${-o.w/2 - lw*2}" width="${o.l + lw*4}" height="${o.w + lw*4}" rx=".2" fill="none" stroke="#e07a00" stroke-width="${lw*2}" stroke-dasharray="${lw*4} ${lw*2}" pointer-events="none"/>` : "")
        + `<text x="${-o.l/2 + .25}" y="0" font-size="${fs*.8}" dominant-baseline="middle" class="ovp-tx ovp-code" transform="rotate(${-(o.r || 0)} ${-o.l/2 + .25} 0)" pointer-events="none">${esc(o.label || "")}</text></g>`;
      const lab = b ? (b.label || b.vela || "") : ""; if(lab && ppm > 9) gt += `<text x="${o.x}" y="${o.y}" font-size="${fs*.75}" text-anchor="middle" dominant-baseline="middle" class="ovp-tx ovp-code" pointer-events="none">${esc(lab)}</text>`; }
    else if(o.k === "point"){ const T = POINTS[o.t] || POINTS.dutxa, R = Math.max(.45, 9 / ppm);
      gt += `<g pointer-events="none"><circle cx="${o.x}" cy="${o.y}" r="${R}" fill="${T.c}" stroke="#fff" stroke-width="${lw*1.5}"/><text x="${o.x}" y="${o.y}" font-size="${R*1.1}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700">${T.s}</text></g>`; }
  }
  return DEFS + (sh ? `<g fill="#0a1322" opacity=".3" pointer-events="none">${sh}</g>` : "") + `<g pointer-events="none">${gp}</g>` + gl + gt;
}
function extent(plan){ const B = ((plan && plan.objs) || []).map(bbox); if(!B.length) return null;
  return [Math.min(...B.map(b => b[0])), Math.min(...B.map(b => b[1])), Math.max(...B.map(b => b[2])), Math.max(...B.map(b => b[3]))]; }

// Firestore no accepta llistes dins de llistes: els vèrtexs es desen com una llista plana [x1, y1, x2, y2…] (camp «p»), arrodonits al mil·límetre
const r3 = v => Math.round(v * 1000) / 1000;
function toStore(objs){ return (objs || []).map(o => { const c = Object.assign({}, o);
  if(c.pts){ c.p = c.pts.flatMap(q => [r3(q[0]), r3(q[1])]); delete c.pts; }
  ["x", "y", "l", "w", "r", "h"].forEach(k => { if(typeof c[k] === "number") c[k] = r3(c[k]); }); return c; }); }
function fromStore(objs){ return (objs || []).map(o => { if(!o.p) return o; const c = Object.assign({}, o), P = [];
  for(let i = 0; i + 1 < c.p.length; i += 2) P.push([c.p[i], c.p[i + 1]]); c.pts = P; delete c.p; return c; }); }

window.OV_PLAN = {toStore, fromStore, BOATS, POLYS, POINTS, ESTATS, MARGIN, SHADOW, D2R, rot, esc, hullPath, shape, corners, bbox, shadowSvg, render, extent, DEFS};
})();
