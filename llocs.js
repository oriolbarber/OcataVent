"use strict";
/* ============ Selector de club o lloc: mapa amb punts + cerca per nom ============ */
// Es llegeix de LOCS (app.js). Verd = club amb estació (vent mesurat); gris = només previsió.
// Pensat per créixer a tots els clubs de Catalunya: la llista ja ve ordenada per comarca i la cerca filtra mapa i llista alhora.
(() => {
  const C_ST = "#1D9E75", C_FC = "#888780";
  const keys = Object.keys(LOCS);
  const hasSt = k => (LOCS[k].stations || []).length > 0;
  const norm = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let el = null, map = null, marks = {}, q = "", onlySt = false;
  const nSt = keys.filter(hasSt).length;

  function build(){
    el = document.createElement("div");
    el.className = "loc-sheet"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Tria club o lloc");
    el.innerHTML = `<div class="ls-h"><h2>On navegues?</h2><button type="button" class="ib" id="lsClose" aria-label="Tanca">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <input type="search" id="lsQ" placeholder="Vilassar, Mar Bella…" aria-label="Cerca per nom" autocomplete="off">
      <div class="ls-map" id="lsMap"></div>
      <div class="ls-leg"><button type="button" id="lsSt" aria-pressed="false"><i style="background:${C_ST}"></i>Amb estació (${nSt})</button><span><i style="background:${C_FC}"></i>Només previsió (${keys.length - nSt})</span></div>
      <div class="ls-list" id="lsList"></div>`;
    document.body.appendChild(el);
    el.querySelector("#lsClose").addEventListener("click", () => close(true));
    el.querySelector("#lsQ").addEventListener("input", e => { q = norm(e.target.value.trim()); paint(true); });
    el.querySelector("#lsSt").addEventListener("click", e => { onlySt = !onlySt; e.currentTarget.setAttribute("aria-pressed", String(onlySt)); paint(true); });
    el.querySelector("#lsList").addEventListener("click", e => { const r = e.target.closest("[data-k]"); if(r) pick(r.dataset.k); });
  }
  function initMap(){
    const box = el.querySelector("#lsMap");
    map = typeof baseMap === "function" ? baseMap(box) : L.map(box);
    if(typeof baseMap !== "function") L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, attribution:"© OpenStreetMap"}).addTo(map);
    keys.forEach(k => { const o = LOCS[k];
      marks[k] = L.circleMarker(o.home, {radius:7, weight:2, color:"#fff", fillColor: hasSt(k) ? C_ST : C_FC, fillOpacity:1})
        .bindTooltip(o.name, {direction:"top", offset:[0, -8]}).on("click", () => pick(k)).addTo(map); });
    keys.filter(hasSt).forEach(k => marks[k].bringToFront());   // els verds, per sobre
  }
  const match = k => { if(onlySt && !hasSt(k)) return false; if(!q) return true; const o = LOCS[k]; return norm(`${o.name} ${o.muni} ${o.com}`).includes(q); };
  function paint(fit){
    const vis = keys.filter(match);
    keys.forEach(k => { const sel = k === locKey, on = vis.includes(k);
      marks[k].setStyle({radius: sel ? 11 : 7, color: sel ? "#0b1f33" : "#fff", weight: sel ? 3 : 2, opacity: on ? 1 : .25, fillOpacity: on ? 1 : .25});
      if(sel) marks[k].bringToFront(); });
    if(fit && !q && !onlySt) map.setView(LOC.home, 10);   // en obrir: el club actual i els del voltant
    else if(fit){ const pts = (vis.length ? vis : keys).map(k => LOCS[k].home);
      if(pts.length === 1) map.setView(pts[0], 13); else map.fitBounds(pts, {padding:[28, 28], maxZoom:13}); }
    const byCom = {}; vis.forEach(k => (byCom[LOCS[k].com] = byCom[LOCS[k].com] || []).push(k));
    el.querySelector("#lsList").innerHTML = vis.length ? Object.keys(byCom).map(c => `<div class="ls-com">${esc(c)}</div>` + byCom[c].map(k => { const o = LOCS[k];
      const src = hasSt(k) ? o.stations.map(s => STATIONS[s]?.name).filter(Boolean).join(" + ") + (o.stNote ? " · " + o.stNote.toLowerCase() : "") : "Només previsió";
      return `<button type="button" class="ls-row${k === locKey ? " sel" : ""}" data-k="${k}" aria-pressed="${k === locKey}">
        <i style="background:${hasSt(k) ? C_ST : C_FC}"></i><span><b>${esc(o.name)}</b><small>${esc(o.muni)} · ${esc(src)}</small></span>
        ${k === locKey ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>` : ""}</button>`; }).join("")).join("")
      : `<p class="note">Cap club ni lloc amb aquest nom.</p>`;
  }
  function open(){
    if(!el) build();
    el.hidden = false; document.body.classList.add("ls-open");
    history.pushState({ls:1}, "");
    if(!map) initMap();
    setTimeout(() => { map.invalidateSize(); paint(true);
      const r = el.querySelector(".ls-row.sel"); if(r) r.scrollIntoView({block:"center"}); }, 30);   // la llista, al club actual
  }
  function close(back){ if(!el || el.hidden) return; el.hidden = true; document.body.classList.remove("ls-open"); if(back && history.state && history.state.ls) history.back(); }
  function pick(k){ if(k === locKey){ close(true); return; } close(false); setLoc(k); }
  addEventListener("popstate", () => close(false));
  [$("locBtn"), $("locPick")].forEach(b => b && b.addEventListener("click", open));
  window.OV_LOCS = {open, close};
})();
