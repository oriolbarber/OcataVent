"use strict";
/* ============ Ocata Vent · límit de distància a la costa sobre un mapa Leaflet (decisió de l'Oriol, 1-11-2026) ============
   Línia discontínua amb l'etiqueta «2 mn» i el mar de més enllà una mica més fosc. La distància màxima és el llindar
   `mn` de l'embarcació triada (crit[act].mn, per defecte 2; buit = sense límit).
   La costa es treu de les rajoles d'OpenStreetMap (píxels del color d'aigua #aad3df, com la màscara de fx.js):
   cal crossOrigin:"anonymous" a la capa de rajoles. Es fan servir totes les rajoles carregades (també les que
   sobresurten de la pantalla). Si no hi ha terra a la vista, no es dibuixa res (no se sap on és la costa).
   Ús: OV_LIMIT(map, tiles) → {refresh()}. L'esdeveniment «ov-limit» (canvi d'embarcació o de llindar) el refà. */
window.OV_LIMIT_NM = () => { try{ const c = crit[act]; return c && c.mn > 0 ? +c.mn : 0; }catch(e){ return 0; } };
window.OV_LIMIT = function(map, tiles){
  const pane = map.createPane("ovLimit"); pane.style.zIndex = 350; pane.style.pointerEvents = "none";   // sobre les rajoles, sota la ruta
  const cv = document.createElement("canvas"); cv.className = "ov-limit"; pane.appendChild(cv);
  const g = cv.getContext("2d");
  const NM = 1852, MIN_BLOB = 50000;   // m²: taques de «terra» més petites (rètols, boies) no compten com a costa
  const isDark = () => { const th = document.documentElement.dataset.theme; return th === "dark" || (!th && matchMedia("(prefers-color-scheme: dark)").matches); };
  let tmr = 0;

  function clear(){ g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); }
  function draw(){
    const nm = window.OV_LIMIT_NM(), s = map.getSize();
    const dpr = Math.min(2, devicePixelRatio || 1);
    L.DomUtil.setPosition(cv, map.containerPointToLayerPoint([0, 0]));
    if(cv.width !== Math.round(s.x * dpr) || cv.height !== Math.round(s.y * dpr)){ cv.width = Math.round(s.x * dpr); cv.height = Math.round(s.y * dpr); cv.style.width = s.x + "px"; cv.style.height = s.y + "px"; }
    clear(); cv.style.display = "";
    if(!nm || !s.x) return;
    // 1. rajoles carregades del zoom actual → canvas (pot ser més gran que la pantalla)
    const z = Math.round(map.getZoom()), ts = Object.values(tiles._tiles || {}).filter(t => t.coords.z === z && t.el && t.el.complete && t.el.naturalWidth);
    if(!ts.length) return;
    const box = ts.map(t => [map.latLngToContainerPoint(map.unproject(L.point(t.coords.x * 256, t.coords.y * 256), z)), map.latLngToContainerPoint(map.unproject(L.point((t.coords.x + 1) * 256, (t.coords.y + 1) * 256), z))]);
    let ax = Math.min(...box.map(b => b[0].x)), ay = Math.min(...box.map(b => b[0].y)), bx = Math.max(...box.map(b => b[1].x)), by = Math.max(...box.map(b => b[1].y));
    ax = Math.max(ax, -s.x); ay = Math.max(ay, -s.y); bx = Math.min(bx, 2 * s.x); by = Math.min(by, 2 * s.y);   // com a molt 3 × la pantalla
    const W = Math.round(bx - ax), H = Math.round(by - ay); if(W < 8 || H < 8) return;
    const m = document.createElement("canvas"); m.width = W; m.height = H;
    const mg = m.getContext("2d", {willReadFrequently:true});
    ts.forEach((t, i) => { const [a, b] = box[i]; mg.drawImage(t.el, a.x - ax, a.y - ay, b.x - a.x, b.y - a.y); });
    let px; try{ px = mg.getImageData(0, 0, W, H).data; }catch(e){ return; }   // sense crossOrigin no es pot llegir
    // 2. graella: cada cel·la és mar (1), terra (0) o desconeguda (-1, sense rajola)
    const c = Math.max(3, Math.ceil(Math.sqrt(W * H / 60000))), gw = Math.ceil(W / c), gh = Math.ceil(H / c), N = gw * gh;
    const cell = new Int8Array(N);
    for(let j = 0; j < gh; j++) for(let i = 0; i < gw; i++){
      let sea = 0, kn = 0, tot = 0;
      for(let y = j * c; y < Math.min(H, (j + 1) * c); y++) for(let x = i * c; x < Math.min(W, (i + 1) * c); x++){
        const k = (y * W + x) * 4; tot++; if(px[k + 3] < 200) continue; kn++;
        if(Math.abs(px[k] - 170) < 14 && Math.abs(px[k + 1] - 211) < 14 && Math.abs(px[k + 2] - 223) < 14) sea++;
      }
      cell[j * gw + i] = kn < tot / 2 ? -1 : sea >= kn / 2 ? 1 : 0;
    }
    // 3. treu les taques de terra petites envoltades de mar (rètols, boies, rutes de ferri)
    const mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (256 * Math.pow(2, map.getZoom())), cm = c * mpp;
    const seen = new Uint8Array(N), stack = []; let land = 0;
    for(let q = 0; q < N; q++){ if(cell[q] !== 0 || seen[q]) continue;
      const blob = []; stack.push(q); seen[q] = 1;
      while(stack.length){ const p = stack.pop(); blob.push(p); const i = p % gw, j = (p - i) / gw;
        [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].forEach(([x, y]) => { if(x < 0 || y < 0 || x >= gw || y >= gh) return; const r = y * gw + x; if(cell[r] === 0 && !seen[r]){ seen[r] = 1; stack.push(r); } }); }
      if(blob.length * cm * cm < MIN_BLOB) blob.forEach(p => cell[p] = 1); else land += blob.length;
    }
    if(!land) return;   // sense terra a la vista no se sap on és la costa
    // 4. distància exacta a la terra més propera (Felzenszwalb), en cel·les²
    const INF = 1e12, D = new Float64Array(N);
    for(let q = 0; q < N; q++) D[q] = cell[q] === 0 ? 0 : INF;
    const edt = (f, n) => { const d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1); let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
      for(let q = 1; q < n; q++){ let sx; do{ const p = v[k]; sx = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p); if(sx <= zz[k]) k--; else break; }while(k >= 0); k++; v[k] = q; zz[k] = sx; zz[k + 1] = INF; }
      k = 0; for(let q = 0; q < n; q++){ while(zz[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; } return d; };
    for(let i = 0; i < gw; i++){ const f = new Float64Array(gh); for(let j = 0; j < gh; j++) f[j] = D[j * gw + i]; const d = edt(f, gh); for(let j = 0; j < gh; j++) D[j * gw + i] = d[j]; }
    for(let j = 0; j < gh; j++){ const d = edt(D.subarray(j * gw, (j + 1) * gw), gw); for(let i = 0; i < gw; i++) D[j * gw + i] = d[i]; }
    const Lc = nm * NM / cm;   // límit en cel·les
    const val = q => cell[q] === -1 ? NaN : cell[q] === 0 ? -Lc : Math.sqrt(D[q]) - Lc;   // > 0 = més enllà del límit
    // 5. mar de més enllà, més fosc (imatge petita ampliada amb suavitzat → vora suau)
    const im = document.createElement("canvas"); im.width = gw; im.height = gh;
    const ig = im.getContext("2d"), id = ig.createImageData(gw, gh), dk = isDark();
    let beyond = 0;
    for(let q = 0; q < N; q++){ const v = val(q); if(!(v > 0)) continue; beyond++; const k = q * 4; id.data[k] = dk ? 0 : 6; id.data[k + 1] = dk ? 0 : 24; id.data[k + 2] = dk ? 0 : 60; id.data[k + 3] = dk ? 85 : 60; }
    if(!beyond) return;   // tot el mar visible és dins del límit
    ig.putImageData(id, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = true;
    g.drawImage(im, ax, ay, gw * c, gh * c);
    // 6. línia del límit (marching squares sobre els centres de les cel·les), unida en polilínies perquè el traç discontinu es vegi
    const segs = [];
    const P = (i, j) => [ax + (i + 0.5) * c, ay + (j + 0.5) * c];
    const lerp = (p, q, a, b) => { const t = a / (a - b); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    for(let j = 0; j < gh - 1; j++) for(let i = 0; i < gw - 1; i++){
      const a = val(j * gw + i), b = val(j * gw + i + 1), d = val((j + 1) * gw + i), e = val((j + 1) * gw + i + 1);
      if(isNaN(a) || isNaN(b) || isNaN(d) || isNaN(e)) continue;
      const pa = P(i, j), pb = P(i + 1, j), pd = P(i, j + 1), pe = P(i + 1, j + 1), pts = [];
      if((a > 0) !== (b > 0)) pts.push(lerp(pa, pb, a, b));
      if((b > 0) !== (e > 0)) pts.push(lerp(pb, pe, b, e));
      if((e > 0) !== (d > 0)) pts.push(lerp(pe, pd, e, d));
      if((d > 0) !== (a > 0)) pts.push(lerp(pd, pa, d, a));
      if(pts.length === 2) segs.push(pts); else if(pts.length === 4){ segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
    }
    const key = p => Math.round(p[0] * 20) + "," + Math.round(p[1] * 20), ends = new Map();
    segs.forEach((sg, n) => sg.forEach((p, e) => { const k = key(p); if(!ends.has(k)) ends.set(k, []); ends.get(k).push([n, e]); }));
    const used = new Uint8Array(segs.length), lines = [];
    for(let n = 0; n < segs.length; n++){ if(used[n]) continue; used[n] = 1;
      const ln = [segs[n][0], segs[n][1]];
      for(const dir of [1, 0]){   // allarga per tots dos caps
        for(;;){ const tip = dir ? ln[ln.length - 1] : ln[0], nx = (ends.get(key(tip)) || []).find(([m]) => !used[m]); if(!nx) break;
          used[nx[0]] = 1; const p = segs[nx[0]][1 - nx[1]]; if(dir) ln.push(p); else ln.unshift(p); } }
      lines.push(ln);
    }
    g.lineJoin = "round"; g.lineCap = "round"; g.setLineDash([8, 6]);
    lines.forEach(ln => { g.beginPath(); ln.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
      g.strokeStyle = dk ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.7)"; g.lineWidth = 4.5; g.stroke();
      g.strokeStyle = dk ? "rgba(255,255,255,.85)" : "rgba(8,40,90,.85)"; g.lineWidth = 2; g.stroke(); });
    g.setLineDash([]);
    // 7. etiqueta «2 mn» al punt de la línia més llarga més proper al centre de la pantalla
    const long = lines.filter(ln => ln.length > 6).sort((p, q) => q.length - p.length)[0];
    if(long){
      const inside = long.filter(p => p[0] > 30 && p[0] < s.x - 30 && p[1] > 20 && p[1] < s.y - 20);
      const pt = inside.sort((p, q) => Math.hypot(p[0] - s.x / 2, p[1] - s.y / 2) - Math.hypot(q[0] - s.x / 2, q[1] - s.y / 2))[0];
      if(pt){
        const txt = String(nm).replace(".", ",") + " mn";
        g.font = "700 12px system-ui, sans-serif"; const tw = g.measureText(txt).width, w = tw + 12, h = 20;
        g.fillStyle = dk ? "rgba(15,23,36,.92)" : "rgba(255,255,255,.95)"; g.strokeStyle = dk ? "rgba(255,255,255,.85)" : "rgba(8,40,90,.85)"; g.lineWidth = 1.5;
        g.beginPath(); (g.roundRect ? g.roundRect(pt[0] - w / 2, pt[1] - h / 2, w, h, 10) : g.rect(pt[0] - w / 2, pt[1] - h / 2, w, h)); g.fill(); g.stroke();
        g.fillStyle = dk ? "#fff" : "#08285a"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, pt[0], pt[1] + 0.5);
      }
    }
  }
  const later = (t = 120) => { clearTimeout(tmr); tmr = setTimeout(() => { try{ draw(); }catch(e){ clear(); } }, t); };
  tiles.on("load", () => later(60));
  map.on("moveend zoomend resize", () => later());
  map.on("zoomstart", () => { cv.style.display = "none"; });
  addEventListener("ov-limit", () => later(0));
  addEventListener("mm-theme", () => later(0));
  later(300);
  return {refresh: () => later(0)};
};
