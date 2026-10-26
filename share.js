"use strict";
/* ============ Ocata Vent 2 · comparteix una sortida (imatge per al WhatsApp) ============
   En acabar una sortida, el resum porta el botó «Comparteix la sortida»: dibuixa una targeta (quadrada per a xats o
   vertical per a estats) amb la ruta acolorida per velocitat sobre la costa real, el vent, les xifres i un comentari,
   i obre el full de compartir del mòbil amb la imatge i un text. Tot es fa al mòbil, sense servidor.
   Costa: tessel·les vectorials d'OpenFreeMap (OpenStreetMap), per a qualsevol punt de la costa. Sense connexió, mar llis. */
(() => {
  /* ===== Lector mínim de tessel·les vectorials (MVT) ===== */
  // Només llegeix el que cal per dibuixar: capes, propietats i geometries.
  function mvtDecode(buf, wanted){
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let p = 0;
    const varint = () => { let r = 0, s = 0, c;
      do { c = b[p++]; if (s < 28) r |= (c & 0x7f) << s; else r += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80);
      return r >>> 0 === r ? r >>> 0 : r; };
    // Fi d'un camp amb longitud (cal llegir la longitud abans de sumar-la a p)
    const upto = () => { const n = varint(); return p + n; };
    const skip = t => { if (t === 0) varint(); else if (t === 1) p += 8; else if (t === 2) p = upto(); else if (t === 5) p += 4; };
    const str = (e) => new TextDecoder().decode(b.subarray(p, e));
    const out = {};
    while (p < b.length) {
      const tag = varint(), f = tag >> 3, t = tag & 7;
      if (f !== 3 || t !== 2) { skip(t); continue; }
      const end = upto();
      const L = { name: "", extent: 4096, keys: [], values: [], feats: [] };
      while (p < end) {
        const lt = varint(), lf = lt >> 3, ltt = lt & 7;
        if (lf === 1) { const e = upto(); L.name = str(e); p = e; }
        else if (lf === 5) L.extent = varint();
        else if (lf === 3) { const e = upto(); L.keys.push(str(e)); p = e; }
        else if (lf === 4) { const e = upto(); let v = null;
          while (p < e) { const vt = varint(), vf = vt >> 3;
            if (vf === 1) { const se = upto(); v = str(se); p = se; }
            else if (vf === 2) { v = new DataView(b.buffer, b.byteOffset + p, 4).getFloat32(0, true); p += 4; }
            else if (vf === 3) { v = new DataView(b.buffer, b.byteOffset + p, 8).getFloat64(0, true); p += 8; }
            else if (vf === 4) { let r = 0n, sh = 0n, c; do { c = b[p++]; r |= BigInt(c & 0x7f) << sh; sh += 7n; } while (c & 0x80); v = Number(BigInt.asIntN(64, r)); } // int64 (pot ser negatiu)
            else if (vf === 5) v = varint();
            else if (vf === 6) { const z = varint(); v = (z >>> 1) ^ -(z & 1); }
            else if (vf === 7) v = !!varint();
            else skip(vt & 7); }
          L.values.push(v); p = e; }
        else if (lf === 2) { const e = upto(); L.feats.push([p, e]); p = e; }
        else skip(ltt);
      }
      p = end;
      if (wanted && !wanted.includes(L.name)) continue;
      out[L.name] = { extent: L.extent, features: L.feats.map(([s, e]) => feature(s, e, L)) };
    }
    return out;
  
    function feature(s, e, L) {
      const save = p; p = s;
      let type = 0, tags = [], geom = [];
      const packed = () => { const pe = upto(), a = []; while (p < pe) a.push(varint()); return a; };
      while (p < e) { const ft = varint(), ff = ft >> 3;
        if (ff === 2) tags = packed(); else if (ff === 3) type = varint(); else if (ff === 4) geom = packed(); else skip(ft & 7); }
      p = save;
      const props = {};
      for (let i = 0; i < tags.length; i += 2) props[L.keys[tags[i]]] = L.values[tags[i + 1]];
      // Geometria: llista d'anells/línies en coordenades de tessel·la
      const rings = []; let x = 0, y = 0, cur = null;
      for (let i = 0; i < geom.length;) {
        const c = geom[i++], id = c & 7, n = c >> 3;
        if (id === 7) { if (cur && cur.length) cur.push(cur[0]); continue; }
        for (let k = 0; k < n; k++) {
          const dx = geom[i++], dy = geom[i++];
          x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
          if (id === 1) { cur = [[x, y]]; rings.push(cur); } else cur.push([x, y]);
        }
      }
      return { type, props, rings };
    }
  }

  /* ===== Mapa: costa real des de tessel·les vectorials d'OpenStreetMap ===== */
  // OpenFreeMap (esquema OpenMapTiles): gratuït, també per a ús comercial, sense clau. Serveix per a qualsevol punt
  // de la costa (o un embassament): es dibuixa la capa «water» sobre un fons de terra, amb els colors de la targeta.
  // L'adreça de les tessel·les canvia a cada actualització del mapa: es llegeix de l'estil.
  const MAP = {style:"https://tiles.openfreemap.org/styles/liberty", layer:"water", maxz:14, maxTiles:16, timeout:9000};
  const tileMem = new Map();   // només en memòria: compartir ja demana connexió
  let tileTpl = null;
  const coast = {key:"", status:"idle", tiles:[], failAt:0};

  async function fetchBytes(url, signal){
    const r = await fetch(url, {signal});
    if(r.status === 204) return new Uint8Array(0);   // tessel·la buida
    if(!r.ok) throw new Error(r.status);
    let b = new Uint8Array(await r.arrayBuffer());
    if(b[0] === 0x1f && b[1] === 0x8b)   // comprimida sense avisar-ho a la capçalera
      b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    return b;
  }
  async function getTemplate(signal){
    if(window.OV_SHARE_TEST) return OV_SHARE_TEST.tpl;
    if(tileTpl) return tileTpl;
    const st = await (await fetch(MAP.style, {signal})).json();
    const src = Object.values(st.sources).find(s => s.type === "vector");
    const tj = src.tiles ? src : await (await fetch(src.url, {signal})).json();
    return tileTpl = tj.tiles[0];
  }
  async function getTile(z, x, y, signal){
    const k = z+"/"+x+"/"+y; if(tileMem.has(k)) return tileMem.get(k);
    const url = (await getTemplate(signal)).replace("{z}", z).replace("{x}", x).replace("{y}", y);
    const L = mvtDecode(await fetchBytes(url, signal), [MAP.layer])[MAP.layer] || {extent:4096, features:[]};
    const t = {z, x, y, extent:L.extent, polys:L.features.filter(f => f.type === 3)};
    if(tileMem.size > 80) tileMem.delete(tileMem.keys().next().value);
    tileMem.set(k, t); return t;
  }
  const lon2tx = (lon, z) => (lon + 180) / 360 * 2**z;
  const lat2ty = (lat, z) => { const r = lat*Math.PI/180; return (1 - Math.log(Math.tan(r) + 1/Math.cos(r))/Math.PI) / 2 * 2**z; };
  const tx2lon = (x, z) => x / 2**z * 360 - 180;
  const ty2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2*y/2**z))) * 180/Math.PI;

  // Carrega les tessel·les que cobreixen el mapa de la targeta (bbox = [O, S, E, N])
  async function loadCoast(bbox){
    const key = bbox.map(v => v.toFixed(4)).join(",");
    // Mateix mapa: no es torna a demanar (si ha fallat, es reintenta passats 30 s)
    if(coast.key === key && (coast.status !== "fail" || Date.now() - coast.failAt < 30000)) return;
    coast.key = key; coast.status = "loading"; coast.tiles = []; redraw();
    const T = window.OV_SHARE_TEST;
    const range = z => ({x0:Math.floor(lon2tx(bbox[0], z)), x1:Math.floor(lon2tx(bbox[2], z)), y0:Math.floor(lat2ty(bbox[3], z)), y1:Math.floor(lat2ty(bbox[1], z))});
    let z = T ? T.z : MAP.maxz, r = range(z);
    while(!T && z > 1 && (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAP.maxTiles){ z--; r = range(z); }
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), MAP.timeout);
    try{
      const jobs = [];
      for(let x = r.x0; x <= r.x1; x++) for(let y = r.y0; y <= r.y1; y++) jobs.push(getTile(z, x, y, ctl.signal));
      const tiles = await Promise.all(jobs);
      if(coast.key !== key) return;
      coast.tiles = tiles; coast.status = "ok";
    }catch(e){ if(coast.key === key){ coast.status = "fail"; coast.failAt = Date.now(); } }
    finally{ clearTimeout(tm); }
    redraw();
  }

  /* ===== Dades de la sortida per a la targeta ===== */
  const HIDE_M = 200;   // «Amaga inici i final»: metres que no es dibuixen a cada punta
  function prepare(trip){
    const s = trip.summary || summarize(trip), seg = segments(trip), d = new Date(trip.start);
    const byB = new Map(); let maxSeg = null;
    seg.forEach(g => { const moving = g.dt <= 120 && g.kn > 0.8;
      byB.set(g.b, {v: moving ? g.smooth : 0, gap: g.dt > GAP_S});
      if(moving && (!maxSeg || g.smooth > maxSeg.smooth)) maxSeg = g; });
    const pts = trip.pts.map((p, i) => Object.assign({p:[p.lon, p.lat], ll:p}, i ? byB.get(p) || {v:0, gap:false} : {v:0, gap:false}));
    const first = trip.pts[0], last = trip.pts[trip.pts.length - 1];
    // Lloc: el club més proper a l'inici (≤ 6 km); si no n'hi ha, cap
    let place = "", best = 6000;
    for(const k in LOCS){ const L = LOCS[k], h = L.home || [L.lat, L.lon]; const dd = hav(first, {lat:h[0], lon:h[1]});
      if(dd < best){ best = dd; place = L.muni || L.name || ""; } }
    // Amaga les puntes per defecte si no s'ha sortit (ni arribat) a menys de 300 m d'una base nàutica coneguda
    const nearBase = p => Object.values(LOCS).some(L => L.home && hav(p, {lat:L.home[0], lon:L.home[1]}) < 300);
    const W = s.wind || {};
    const brand = store.get("ov2_brand");
    return {
      trip, s, pts, maxPt: maxSeg ? maxSeg.b : null,
      clubName: (brand && brand.titol) || "Ocata Vent", club: ((brand && brand.titol) || "Ocata Vent").toUpperCase(), place,
      boat: DEFAULTS[trip.act]?.name || "",
      date: d.toLocaleDateString("ca", {weekday:"short", day:"numeric", month:"short"}) + " · " + pad(d.getHours()) + ":" + pad(d.getMinutes()),
      wind: W.dir != null && W.min != null ? {dir:W.dir, name:windName(W.dir), min:Math.round(W.min), max:Math.round(W.max), src: /^estació/.test(W.src || "") ? "estació" : "model"} : null,
      hideDefault: !(nearBase(first) && nearBase(last)),
      roundTrip: hav(first, last) < 150
    };
  }
  const fmt1 = x => (Math.round(x*10)/10).toFixed(1).replace(".", ",");
  const durTxt = ms => { const m = Math.round(ms/60000); return m < 60 ? m + " min" : Math.floor(m/60) + " h " + pad(m % 60); };
  const windTxt = w => w.min === w.max ? w.name + " " + w.min : w.name + " " + w.min + "–" + w.max;
  function shownPts(D){
    const P = D.pts; if(!O.hide || P.length < 3) return P;
    const a = P[0].ll, b = P[P.length - 1].ll; let i = 0, j = P.length - 1;
    while(i < j && hav(P[i].ll, a) < HIDE_M) i++;
    while(j > i && hav(P[j].ll, b) < HIDE_M) j--;
    return P.slice(i, j + 1);
  }
  function message(D){
    const c = (O.comment || "").trim(), s = D.s;
    return [D.boat, fmt1(s.distNm) + " mn en " + durTxt(s.dur), D.wind ? windTxt(D.wind) + " kn" : "", "màx. " + fmt1(s.maxKn) + " kn ⛵"].filter(Boolean).join(" · ")
      + (c ? "\n" + c : "") + "\n— " + D.clubName;
  }

  /* ===== Dibuix de la targeta (1080 px d'ample) ===== */
  const PAL = {
    dark: {bg:"#0b1d2e", sea:"#0f2c46", land:"#2c3d3f", coast:"#7d9bb5", text:"#ffffff", muted:"#9fb3c8", chip:"rgba(5,18,30,.8)", route:"#ffffff", halo:"rgba(0,0,0,.55)"},
    light:{bg:"#ffffff", sea:"#d8ecfb", land:"#eef1e7", coast:"#8fa7bd", text:"#0b1d2e", muted:"#5b6b7b", chip:"rgba(255,255,255,.92)", route:"#0b1d2e", halo:"rgba(255,255,255,.85)"}
  };
  // Color de la velocitat, relatiu a la màxima de la sortida (així es veu la variació amb qualsevol embarcació)
  const STOPS = [[0,[59,130,246]], [.35,[20,184,166]], [.6,[234,179,8]], [.8,[249,115,22]], [1,[239,68,68]]];
  function speedColor(v, vmax){ const t = Math.min(1, vmax ? v/vmax : 0);
    for(let i = 1; i < STOPS.length; i++) if(t <= STOPS[i][0]){ const [t0, c0] = STOPS[i-1], [t1, c1] = STOPS[i], u = (t - t0)/(t1 - t0);
      return "rgb(" + c0.map((c, j) => Math.round(c + (c1[j] - c)*u)).join(",") + ")"; }
    return "rgb(239,68,68)"; }
  const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
  const F = (w, s) => w + " " + s + "px " + FONT;

  let D = null, cv = null, ctx = null, O = null, el = null, msgDirty = false;
  function rr(x, y, w, h, r){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function redraw(){ if(el && D) draw(); }

  function draw(){
    const W = 1080, vt = O.fmt === "vt", H = vt ? 1920 : 1080, C = O.light ? PAL.light : PAL.dark, M = 48;
    cv.width = W; cv.height = H; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // Capçalera: club, lloc · embarcació, data
    const y = vt ? 110 : 92;
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; ctx.fillStyle = C.text; ctx.font = F(800, vt ? 64 : 54); ctx.fillText(D.club, M, y);
    if(D.place){ ctx.fillStyle = C.muted; ctx.font = F(500, vt ? 34 : 30); ctx.fillText(D.place, M, y + (vt ? 50 : 42)); }
    ctx.textAlign = "right"; ctx.fillStyle = C.text; ctx.font = F(700, vt ? 40 : 34); ctx.fillText(D.boat, W - M, y);
    ctx.fillStyle = C.muted; ctx.font = F(500, vt ? 34 : 30); ctx.fillText(D.date, W - M, y + (vt ? 50 : 42));
    // Mapa
    const my = vt ? 220 : 170, mh = vt ? 1000 : 600, mw = W - 2*M;
    drawMap(M, my, mw, mh, C);
    // Xifres
    const s = D.s, sy = my + mh + (vt ? 50 : 36);
    const ST = [["Distància", fmt1(s.distNm), "mn"], ["Temps", durTxt(s.dur), ""], ["Màxima", fmt1(s.maxKn), "kn"], ["Mitjana", fmt1(s.avgKn), "kn"]];
    ST.forEach((v, i) => vt ? stat(v, M + (i % 2)*(mw/2), sy + Math.floor(i/2)*190, C, 96) : stat(v, M + i*(mw/4), sy, C, 66));
    // Comentari
    const c = (O.comment || "").trim();
    if(c){ ctx.textAlign = "left"; ctx.fillStyle = C.text; ctx.font = F(500, vt ? 42 : 34);
      wrap("«" + c + "»", M, vt ? sy + 430 : sy + 150, mw, vt ? 54 : 40, vt ? 2 : 1); }
    // Peu, amb l'atribució obligatòria del mapa quan n'hi ha
    ctx.textAlign = "center"; ctx.fillStyle = C.muted; ctx.font = F(600, vt ? 30 : 24);
    ctx.fillText("⛵ Ocata Vent" + (D.wind ? (D.wind.src === "estació" ? " · vent real de l'estació" : " · vent del model") : ""), W/2, H - (vt ? 96 : 62));
    if(coast.status === "ok"){ ctx.font = F(500, vt ? 22 : 19); ctx.fillText("Mapa © OpenMapTiles · dades © col·laboradors d'OpenStreetMap", W/2, H - (vt ? 56 : 30)); }
  }
  function stat([label, val, unit], x, y, C, size){
    ctx.textAlign = "left"; ctx.fillStyle = C.muted; ctx.font = F(700, size*.36); ctx.fillText(label.toUpperCase(), x, y + size*.35);
    ctx.fillStyle = C.text; ctx.font = F(800, size); ctx.fillText(val, x, y + size*1.3);
    if(unit){ const w = ctx.measureText(val).width; ctx.fillStyle = C.muted; ctx.font = F(700, size*.45); ctx.fillText(" " + unit, x + w, y + size*1.3); }
  }
  function wrap(t, x, y, w, lh, max){ const words = t.split(" "); let line = "", n = 0;
    for(let i = 0; i < words.length; i++){ const test = line ? line + " " + words[i] : words[i];
      if(ctx.measureText(test).width > w && line){
        if(n === max - 1){ while(ctx.measureText(line + "…»").width > w) line = line.slice(0, -1); ctx.fillText(line + "…»", x, y + n*lh); return; }
        ctx.fillText(line, x, y + n*lh); n++; line = words[i]; }
      else line = test; }
    ctx.fillText(line, x, y + n*lh); }

  function drawMap(x, y, w, h, C){
    const sp = shownPts(D), vmax = D.s.maxKn || 1;
    // Projecció ajustada al que es dibuixa, amb marge
    const lons = sp.map(o => o.p[0]), lats = sp.map(o => o.p[1]);
    const cx = (Math.min(...lons) + Math.max(...lons))/2, cy = (Math.min(...lats) + Math.max(...lats))/2, cosL = Math.cos(cy*Math.PI/180);
    const dx = Math.max((Math.max(...lons) - Math.min(...lons))*cosL, 2e-3), dy = Math.max(Math.max(...lats) - Math.min(...lats), 2e-3);
    const k = Math.min(w*.78/dx, h*.7/dy);
    const P = p => [x + w/2 + (p[0] - cx)*cosL*k, y + h/2 - (p[1] - cy)*k];
    loadCoast([cx - w/2/(cosL*k), cy - h/2/k, cx + w/2/(cosL*k), cy + h/2/k]);

    ctx.save(); rr(x, y, w, h, 28); ctx.clip();
    if(coast.status === "ok"){ ctx.fillStyle = C.land; ctx.fillRect(x, y, w, h); drawCoast(C, P); }
    else { ctx.fillStyle = C.sea; ctx.fillRect(x, y, w, h); }

    const occ = [];   // punts ocupats: les etiquetes van on no tapen res
    if(O.route){
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); sp.forEach((o, i) => { const q = P(o.p); occ.push(q); i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
      ctx.strokeStyle = C.halo; ctx.lineWidth = 18; ctx.stroke();
      for(let i = 1; i < sp.length; i++){ ctx.beginPath(); ctx.moveTo(...P(sp[i-1].p)); ctx.lineTo(...P(sp[i].p));
        // Trams sense GPS: discontinus i neutres (no se'n sap la velocitat)
        ctx.setLineDash(sp[i].gap ? [12, 16] : []);
        ctx.strokeStyle = sp[i].gap ? C.muted : O.speed ? speedColor(sp[i].v, vmax) : C.route; ctx.lineWidth = sp[i].gap ? 6 : 10; ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // Inici i final: rodona = inici, quadrat = final (es distingeixen sense color)
    const marks = [];
    if(!O.hide){ const a = P(D.pts[0].p), b = P(D.pts[D.pts.length - 1].p);
      if(D.roundTrip) marks.push({q:a, sh:"dot", t:"Inici i final"});
      else marks.push({q:a, sh:"dot", t:"Inici"}, {q:b, sh:"sq", t:"Final"}); }
    marks.forEach(m => { occ.push(m.q); ctx.fillStyle = C.text; ctx.lineWidth = 6; ctx.strokeStyle = C.bg;
      if(m.sh === "dot"){ ctx.beginPath(); ctx.arc(...m.q, 16, 0, 7); } else rr(m.q[0] - 15, m.q[1] - 15, 30, 30, 4);
      ctx.fill(); ctx.stroke(); });

    // Etiquetes: cada una al lloc que tapa menys ruta i no en trepitja cap altra
    const placed = [];
    const score = b => { let s = 0;
      if(b.x < x + 12 || b.y < y + 12 || b.x + b.w > x + w - 12 || b.y + b.h > y + h - 12) s += 1e6;
      for(const q of occ) if(q[0] > b.x - 14 && q[0] < b.x + b.w + 14 && q[1] > b.y - 14 && q[1] < b.y + b.h + 14) s += 1;
      for(const p of placed) if(b.x < p.x + p.w + 10 && b.x + b.w + 10 > p.x && b.y < p.y + p.h + 10 && b.y + b.h + 10 > p.y) s += 1e4;
      return s; };
    const best = cands => { let bb = cands[0], bs = Infinity; for(const c of cands){ const s = score(c); if(s < bs){ bs = s; bb = c; } } placed.push(bb); return bb; };
    const corners = (bw, bh) => [{x:x+24, y:y+24, w:bw, h:bh}, {x:x+w-24-bw, y:y+24, w:bw, h:bh}, {x:x+24, y:y+h-24-bh, w:bw, h:bh}, {x:x+w-24-bw, y:y+h-24-bh, w:bw, h:bh}];
    const near = (q, t, s) => { ctx.font = F(800, s); const bw = ctx.measureText(t).width + s*.9, bh = s*1.5, g = 26;
      return [{x:q[0]+g, y:q[1]-bh/2}, {x:q[0]-g-bw, y:q[1]-bh/2}, {x:q[0]-bw/2, y:q[1]-g-bh}, {x:q[0]-bw/2, y:q[1]+g}, {x:q[0]+g*.7, y:q[1]-g*.7-bh}, {x:q[0]-g*.7-bw, y:q[1]+g*.7}]
        .map(b => Object.assign(b, {w:bw, h:bh})); };
    if(D.wind){ ctx.font = F(800, 40); const ww = Math.max(300, ctx.measureText(windTxt(D.wind)).width + 140); windChip(best(corners(ww, 120)), C); }
    if(O.route && O.speed) legend(best(corners(336, 50)), C, vmax);
    marks.forEach(m => chip(m.t, best(near(m.q, m.t, 30)), C, 30));
    if(O.route && O.speed && D.maxPt){
      const mp = sp.find(o => o.ll === D.maxPt);
      if(mp){ const q = P(mp.p); ctx.beginPath(); ctx.arc(...q, 14, 0, 7); ctx.fillStyle = "#ef4444"; ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.stroke(); const t = fmt1(vmax) + " kn"; chip(t, best(near(q, t, 34)), C, 34); }
    }
    if(coast.status === "loading") chip("Carregant el mapa…", {x:x + w/2 - 150, y:y + h/2 - 26}, C, 30);
    ctx.restore();
  }
  // Terra de fons i, a sobre, l'aigua de cada tessel·la (mar, llacs, embassaments)
  function drawCoast(C, P){
    for(const t of coast.tiles){
      const z = t.z, E = t.extent, ll = (px, py) => P([tx2lon(t.x + px/E, z), ty2lat(t.y + py/E, z)]);
      const a = ll(0, 0), b = ll(E, E);
      ctx.save(); ctx.beginPath(); ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.clip();
      ctx.beginPath();
      for(const f of t.polys) for(const r of f.rings) r.forEach((p, i) => { const q = ll(p[0], p[1]); i ? ctx.lineTo(...q) : ctx.moveTo(...q); });
      ctx.fillStyle = C.sea; ctx.fill("evenodd");
      // Línia de costa, sense els trams que són vores de la tessel·la
      const edge = (p, q) => (p[0] <= 0 && q[0] <= 0) || (p[0] >= E && q[0] >= E) || (p[1] <= 0 && q[1] <= 0) || (p[1] >= E && q[1] >= E);
      ctx.beginPath();
      for(const f of t.polys) for(const r of f.rings) r.forEach((p, i) => { const q = ll(p[0], p[1]); (!i || edge(r[i-1], p)) ? ctx.moveTo(...q) : ctx.lineTo(...q); });
      ctx.strokeStyle = C.coast; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke();
      ctx.restore();
    }
  }
  function chip(t, b, C, s){ ctx.font = F(800, s); const w = ctx.measureText(t).width + s*.9, h = s*1.5;
    rr(b.x, b.y, w, h, h/2); ctx.fillStyle = C.chip; ctx.fill(); ctx.fillStyle = C.text; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(t, b.x + s*.45, b.y + h/2 + 1); ctx.textBaseline = "alphabetic"; }
  function windChip(b, C){ const {x, y, w, h} = b; rr(x, y, w, h, 24); ctx.fillStyle = C.chip; ctx.fill();
    // Fletxa cap on bufa el vent
    ctx.save(); ctx.translate(x + 62, y + h/2); ctx.rotate((D.wind.dir + 180)*Math.PI/180); ctx.fillStyle = "#38bdf8";
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(22, 8); ctx.lineTo(7, 2); ctx.lineTo(7, 36); ctx.lineTo(-7, 36); ctx.lineTo(-7, 2); ctx.lineTo(-22, 8); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.textAlign = "left"; ctx.fillStyle = C.text; ctx.font = F(800, 40); ctx.fillText(windTxt(D.wind), x + 112, y + 56);
    ctx.fillStyle = C.muted; ctx.font = F(600, 26); ctx.fillText("kn · " + D.wind.src, x + 112, y + 92); }
  function legend(b, C, vmax){ const {x, y, w, h} = b; rr(x, y, w, h, 25); ctx.fillStyle = C.chip; ctx.fill();
    const g = ctx.createLinearGradient(x + 70, 0, x + w - 86, 0); STOPS.forEach(([t, c]) => g.addColorStop(t, "rgb(" + c + ")"));
    rr(x + 70, y + 17, w - 156, 16, 8); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = C.text; ctx.font = F(700, 24); ctx.textAlign = "right"; ctx.fillText("0", x + 58, y + 34);
    ctx.textAlign = "left"; ctx.fillText(fmt1(vmax) + " kn", x + w - 76, y + 34); }

  /* ===== Pantalla «Comparteix la sortida» ===== */
  const SHARE_IC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  const TOGS = [["route", "Ruta"], ["speed", "Velocitat"], ["hide", "Amaga inici i final"], ["light", "Targeta clara"]];

  function open(trip){
    if(el || !trip || !trip.pts || trip.pts.length < 2) return;
    D = prepare(trip); msgDirty = false; coast.key = "";
    const saved = store.get("ov2_share") || {};
    O = {fmt: saved.fmt || "sq", light: !!saved.light, route: saved.route !== false, speed: saved.speed !== false, hide: D.hideDefault, comment: trip.name || ""};
    el = document.createElement("div");
    el.className = "shr"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Comparteix la sortida");
    el.innerHTML = `<div class="shr-bar"><button type="button" class="shr-back" id="shrBack" aria-label="Enrere">←</button><b>Comparteix la sortida</b><span></span></div>
      <div class="shr-body">
        <div class="seg shr-seg" role="group" aria-label="Format de la imatge" id="shrFmt"><button type="button" data-v="sq">Quadrat · xat</button><button type="button" data-v="vt">Vertical · estat</button></div>
        <canvas id="shrCv" aria-label="Imatge de la sortida"></canvas>
        <div class="shr-tg">${TOGS.map(([k, t]) => `<button type="button" class="shr-t" data-k="${k}">${t}</button>`).join("")}</div>
        <input class="field" id="shrCom" type="text" maxlength="90" placeholder="Comentari (opcional)" aria-label="Comentari de la imatge">
        <textarea class="field shr-msg" id="shrMsg" rows="3" aria-label="Text que acompanya la imatge"></textarea>
        <div class="shr-act"><button type="button" class="btn cl-pri shr-go" id="shrGo">${SHARE_IC}Comparteix</button><button type="button" class="btn" id="shrCopy">Copia el text</button></div>
        <p class="shr-note" id="shrNote" role="status" hidden></p>
      </div>`;
    document.body.appendChild(el);
    cv = el.querySelector("#shrCv"); ctx = cv.getContext("2d");
    const com = el.querySelector("#shrCom"), msg = el.querySelector("#shrMsg");
    com.value = O.comment;
    const sync = () => {
      el.querySelectorAll("#shrFmt button").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === O.fmt));
      el.querySelectorAll(".shr-t").forEach(b => { b.setAttribute("aria-pressed", !!O[b.dataset.k]); b.disabled = b.dataset.k === "speed" && !O.route; });
      el.classList.toggle("vt", O.fmt === "vt");
      store.set("ov2_share", {fmt:O.fmt, light:O.light, route:O.route, speed:O.speed});
      if(!msgDirty) msg.value = message(D);
      draw();
    };
    el.querySelectorAll("#shrFmt button").forEach(b => b.onclick = () => { O.fmt = b.dataset.v; sync(); });
    el.querySelectorAll(".shr-t").forEach(b => b.onclick = () => { O[b.dataset.k] = !O[b.dataset.k]; sync(); });
    com.oninput = () => { O.comment = com.value; sync(); };
    msg.oninput = () => { msgDirty = true; };
    el.querySelector("#shrCopy").onclick = async () => { try{ await navigator.clipboard.writeText(msg.value); note("Text copiat"); }catch(e){ msg.select(); note("Selecciona'l i copia'l"); } };
    el.querySelector("#shrGo").onclick = () => share(msg.value);
    el.querySelector("#shrBack").onclick = () => { if(history.state && history.state.shr) history.back(); else close(); };
    try{ history.pushState({shr:1}, ""); }catch(e){}
    sync();
  }
  function close(){ if(!el) return; el.remove(); el = null; cv = ctx = null; }
  window.addEventListener("popstate", () => { if(el) close(); });
  // Missatge flotant sobre el botó (abans quedava sota la imatge, fora de la vista)
  function note(t, ms){ const n = el && el.querySelector("#shrNote"); if(!n) return; n.textContent = t; n.hidden = !t;
    clearTimeout(note.tm); if(t) note.tm = setTimeout(() => { n.hidden = true; }, ms || 4000); }
  const busy = on => { const b = el && el.querySelector("#shrGo"); if(!b) return; b.disabled = on; b.classList.toggle("busy", on); };
  const canceled = e => e && (e.name === "AbortError" || /cancel/i.test(e.message || e.errorMessage || ""));

  async function share(text){
    busy(true);
    try{
      // Si el mapa encara es carrega, s'espera (com a molt el temps màxim de càrrega) i es comparteix igualment
      for(let i = 0; coast.status === "loading" && i < MAP.timeout/250 + 4; i++){ note("Carregant el mapa…"); await new Promise(r => setTimeout(r, 250)); }
      draw();
      const blob = await new Promise(r => cv.toBlob(r, "image/png"));
      const d = new Date(D.trip.start), name = "sortida-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".png";
      const CAP = window.Capacitor;
      if(CAP && CAP.isNativePlatform && CAP.isNativePlatform()){
        // APK: la WebView no té Web Share; es desa a la memòria cau de l'app i s'obre el full de compartir d'Android
        const has = n => CAP.isPluginAvailable ? CAP.isPluginAvailable(n) : !!(CAP.Plugins && CAP.Plugins[n]);
        if(!has("Share") || !has("Filesystem")){
          try{ await navigator.clipboard.writeText(text); }catch(e){}
          note("Aquesta versió de l'app no pot compartir imatges. Instal·la l'APK nou (el text ja és copiat).", 9000); return;
        }
        try{
          const Fs = CAP.registerPlugin("Filesystem"), Sh = CAP.registerPlugin("Share");
          const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
          const w = await Fs.writeFile({path:name, data:b64, directory:"CACHE"});
          note("");
          await Sh.share({files:[w.uri], text, dialogTitle:"Comparteix la sortida"});
        }catch(e){ if(!canceled(e)) note("No s'ha pogut compartir: " + (e && (e.message || e.errorMessage) || e), 9000); }
        return;
      }
      const file = new File([blob], name, {type:"image/png"});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        try{ note(""); await navigator.share({files:[file], text}); return; }
        catch(e){ if(canceled(e)) return; }   // si el navegador no ho deixa, es desa la imatge
      }
      // Ordinador (o navegador sense compartir fitxers): es desa la imatge i es copia el text
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      try{ await navigator.clipboard.writeText(text); }catch(e){}
      note("Imatge desada i text copiat");
    }catch(e){ note("No s'ha pogut preparar la imatge: " + (e && e.message || e), 9000); }
    finally{ busy(false); }
  }

  function button(box, trip){ // al resum de la sortida
    if(!box || !trip || !trip.pts || trip.pts.length < 2) return;
    box.innerHTML = `<button type="button" class="btn cl-pri shr-open">${SHARE_IC}Comparteix la sortida</button>`;
    box.firstChild.onclick = () => open(trip);
  }
  window.OV_SHARE = {open, button, close};
})();
