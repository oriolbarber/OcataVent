"use strict";
/* ============ Ocata Vent · vent i onades pintats sobre un mapa Leaflet (estil Windy) ============
   El fan servir «Nova sortida» (prep.js) i el mapa maximitzat de la Previsió (windmap.js).
   - Vent: ratlles que avancen cap on bufa (més ràpides com més vent) amb una cua curta.
   - Onades: crestes (arcs) que avancen cap on va l'onada, només sobre el mar. El mar es troba pel color d'aigua
     de les rajoles d'OpenStreetMap (#aad3df): cal que la capa de rajoles porti crossOrigin:"anonymous".
   Ús: const fx = OV_FX(map, tiles, {get: () => ({wind, dir, wave, wdir, per}), active: () => bool, onMask: n => …});
       fx.set({vent, onades}); fx.kick() (torna a pintar); fx.reset() (noves dades o tema); fx.stop(). */
window.OV_FX = function(map, tiles, o){
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pane = map.createPane(o.pane || "fxWind"); pane.style.zIndex = 450; pane.style.pointerEvents = "none";
  const cvS = document.createElement("canvas"), cv = document.createElement("canvas");
  cvS.className = cv.className = "prep-cv"; pane.appendChild(cvS); pane.appendChild(cv);
  const cs = cvS.getContext("2d"), cx = cv.getContext("2d");
  let on = {vent:true, onades:true}, parts = [], crests = [], mask = null, raf = 0;
  const isDark = () => { const th = document.documentElement.dataset.theme; return th === "dark" || (!th && matchMedia("(prefers-color-scheme: dark)").matches); };

  function size(){
    const s = map.getSize(), dpr = Math.min(2, devicePixelRatio || 1);
    [[cv, cx], [cvS, cs]].forEach(([c, g]) => {
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
      if(c.width !== Math.round(s.x * dpr) || c.height !== Math.round(s.y * dpr)){
        c.width = Math.round(s.x * dpr); c.height = Math.round(s.y * dpr); c.style.width = s.x + "px"; c.style.height = s.y + "px";
        g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    });
    parts = []; crests = [];
  }
  // Màscara del mar: es dibuixen les rajoles en un canvas i es marquen els píxels del color de l'aigua
  function buildMask(silent){
    const s = map.getSize(); if(!s.x) return;
    const m = document.createElement("canvas"); m.width = s.x; m.height = s.y;
    const g = m.getContext("2d", {willReadFrequently:true});
    Object.values(tiles._tiles || {}).forEach(t => {
      const im = t.el; if(!im || !im.complete || !im.naturalWidth) return;
      const z = t.coords.z, a = map.latLngToContainerPoint(map.unproject(L.point(t.coords.x * 256, t.coords.y * 256), z)),
        b = map.latLngToContainerPoint(map.unproject(L.point((t.coords.x + 1) * 256, (t.coords.y + 1) * 256), z));
      g.drawImage(im, a.x, a.y, b.x - a.x, b.y - a.y);
    });
    try{
      const d = g.getImageData(0, 0, s.x, s.y), px = d.data; let n = 0;
      for(let i = 0; i < px.length; i += 4){
        const sea = Math.abs(px[i] - 170) < 14 && Math.abs(px[i+1] - 211) < 14 && Math.abs(px[i+2] - 223) < 14;
        px[i] = px[i+1] = px[i+2] = 0; px[i+3] = sea ? 255 : 0; if(sea) n++;
      }
      g.putImageData(d, 0, 0); mask = m; if(!silent && o.onMask) o.onMask(n);
    }catch(e){ mask = null; if(!silent && o.onMask) o.onMask(false); }
  }
  function windStep(w, s){
    const N = Math.round(s.x * s.y / 2600);
    const to = ((w.dir ?? 0) + 180) * Math.PI / 180, sp = (reduce ? 14 : 0.35 + Math.min(30, w.wind || 0) * 0.09), ux = Math.sin(to) * sp, uy = -Math.cos(to) * sp;
    while(parts.length < N) parts.push({x: Math.random() * s.x, y: Math.random() * s.y, age: Math.random() * 90, life: 60 + Math.random() * 60, j: 0.7 + Math.random() * 0.6});
    if(reduce) cx.clearRect(0, 0, s.x, s.y);
    else { cx.globalCompositeOperation = "destination-out"; cx.fillStyle = "rgba(0,0,0,.1)"; cx.fillRect(0, 0, s.x, s.y); cx.globalCompositeOperation = "source-over"; }
    cx.strokeStyle = isDark() ? "rgba(255,255,255,.75)" : "rgba(10,30,60,.55)"; cx.lineWidth = 1.6; cx.lineCap = "round";
    cx.beginPath();
    if(w.dir != null && (w.wind || 0) >= 0.5) parts.forEach(p => {
      const nx = p.x + ux * p.j, ny = p.y + uy * p.j;
      cx.moveTo(p.x, p.y); cx.lineTo(nx, ny); p.x = nx; p.y = ny; p.age++;
      if(p.age > p.life || p.x < -5 || p.y < -5 || p.x > s.x + 5 || p.y > s.y + 5){ p.x = Math.random() * s.x; p.y = Math.random() * s.y; p.age = 0; }
    });
    cx.stroke();
  }
  function seaStep(w, s){
    cs.clearRect(0, 0, s.x, s.y);
    if(!mask || w.wdir == null || w.wave == null) return;
    const N = Math.round(s.x * s.y / 5200), to = (w.wdir + 180) * Math.PI / 180, ux = Math.sin(to), uy = -Math.cos(to);
    const sp = reduce ? 0 : 0.12 + Math.min(12, w.per || 5) * 0.025, len = 6 + Math.min(2, w.wave) * 9;
    while(crests.length < N) crests.push({x: Math.random() * s.x, y: Math.random() * s.y, age: Math.random() * 200, life: 140 + Math.random() * 120});
    cs.lineWidth = 2.2; cs.lineCap = "round";
    const col = isDark() ? "120,190,255" : "10,90,190";
    crests.forEach(p => {
      const a = Math.sin(Math.PI * Math.min(1, p.age / p.life));          // apareix i s'esvaeix
      cs.strokeStyle = `rgba(${col},${(0.85 * a).toFixed(2)})`;
      cs.beginPath();   // arc amb la panxa cap on avança l'onada
      cs.moveTo(p.x - uy * len - ux * 3, p.y + ux * len - uy * 3);
      cs.quadraticCurveTo(p.x + ux * 3, p.y + uy * 3, p.x + uy * len - ux * 3, p.y - ux * len - uy * 3);
      cs.stroke();
      p.x += ux * sp; p.y += uy * sp; p.age++;
      if(p.age > p.life || p.x < -20 || p.y < -20 || p.x > s.x + 20 || p.y > s.y + 20){ p.x = Math.random() * s.x; p.y = Math.random() * s.y; p.age = 0; }
    });
    cs.globalCompositeOperation = "destination-in"; cs.drawImage(mask, 0, 0, s.x, s.y); cs.globalCompositeOperation = "source-over";   // retalla al mar
  }
  function step(){
    raf = 0;
    const w = o.get(); if(!w || !(on.vent || on.onades) || !o.active()) return;
    const s = map.getSize(); if(!s.x) return;
    if(on.vent) windStep(w, s);
    if(on.onades) seaStep(w, s);
    if(!reduce) raf = requestAnimationFrame(step);
  }
  tiles.on("load", () => buildMask());
  // en moure el mapa es refà la màscara amb les rajoles que ja hi ha (sense avisar: potser encara se'n carreguen); en acabar de carregar, es refà i s'avisa
  map.on("zoomend moveend resize", () => { size(); buildMask(true); });
  map.on("zoomstart", () => { mask = null; });
  size();
  return {
    set(v){ on = Object.assign({}, on, v); cv.style.display = on.vent ? "" : "none"; cvS.style.display = on.onades ? "" : "none"; this.kick(); },
    kick(){ if(!raf && (on.vent || on.onades) && o.active()) raf = requestAnimationFrame(step); },
    reset(){ parts = []; crests = []; cx.clearRect(0, 0, cv.width, cv.height); cs.clearRect(0, 0, cvS.width, cvS.height); this.kick(); },
    stop(){ cancelAnimationFrame(raf); raf = 0; },
    size, buildMask, hasMask: () => !!mask
  };
};
