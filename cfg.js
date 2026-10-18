"use strict";
/* ============ Ocata Vent 2 · Configuració: menú ⋮ i pantalles ============
   El botó ⋮ de la capçalera obre un menú (estil WhatsApp) amb els apartats.
   Cada apartat és una pantalla (.cfg-pg) que entra de dreta a esquerra; la fletxa enrere (o el botó enrere
   d'Android) la fa sortir cap a la dreta. Les subpantalles s'apilen igual.
   Navegació: data-cfg="pàgina" en qualsevol botó; data-back per tornar. Quan s'obre una pantalla s'emet
   l'esdeveniment «ov-cfg» (detail.pg) perquè cada mòdul la pinti.
   Historial: cada pantalla afegeix {cfg: profunditat} a history; popstate torna a aquella profunditat. */
(() => {
const panel = $("viewPanel"), menu = $("cfgMenu"), scrim = $("cfgScrim"), btn = $("themeBtn");
if(!panel || !menu || !btn) return;
const BACK = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7"/></svg>`;
const DUR = 300;
const pg = k => panel.querySelector(`.cfg-pg[data-pg="${k}"]`);
const stack = [];
let savedY = 0;

// barra superior de cada pantalla: fletxa enrere · títol al centre
panel.querySelectorAll(".cfg-pg").forEach(p => {
  const bar = document.createElement("div"); bar.className = "cfg-bar";
  bar.innerHTML = `<button type="button" class="cfg-back" data-back aria-label="Enrere">${BACK}</button><h2></h2><span></span>`;
  bar.querySelector("h2").textContent = p.dataset.title || "";
  p.prepend(bar); p.setAttribute("role", "region"); p.setAttribute("aria-label", p.dataset.title || "");
});
function title(k, t){ const p = pg(k); if(!p) return; p.dataset.title = t; p.querySelector(".cfg-bar h2").textContent = t; p.setAttribute("aria-label", t); }

/* ---------- menú ⋮ ---------- */
const menuOpen = () => !menu.hidden;
function openMenu(){
  // només els apartats que té aquesta persona (Administració i Privadesa depenen del compte)
  menu.querySelectorAll("[data-for]").forEach(el => { const p = pg(el.dataset.for); el.hidden = !p || p.hidden; });
  menu.hidden = false; scrim.hidden = false; btn.setAttribute("aria-expanded", "true");
  try{ history.pushState({cfgMenu:1}, ""); }catch(e){}
  setTimeout(() => menu.querySelector(".cfg-mi:not([hidden])")?.focus({preventScroll:true}), 30);
}
function closeMenu(viaHistory){
  if(!menuOpen()) return;
  menu.hidden = true; scrim.hidden = true; btn.setAttribute("aria-expanded", "false");
  if(!viaHistory && history.state && history.state.cfgMenu) history.back();
}
btn.addEventListener("click", () => { if(menuOpen()) closeMenu(); else openMenu(); });
scrim.addEventListener("click", () => closeMenu());

/* ---------- pantalles ---------- */
function show(k){
  const p = pg(k); if(!p || p.hidden) return false;
  if(!stack.length){ panel.hidden = false; savedY = scrollY; }   // la pàgina de sota no es toca: en tancar, es torna a on eres
  const prev = stack.length ? pg(stack[stack.length - 1]) : null;
  stack.push(k);
  const body = p.querySelector(".cfg-body"); if(body) body.scrollTop = 0;
  p.classList.remove("under");
  void p.offsetWidth;                       // parteix de fora de la pantalla perquè es vegi entrar
  p.classList.add("on");
  if(prev){ prev.classList.add("under"); prev.classList.remove("on"); }
  window.dispatchEvent(new CustomEvent("ov-cfg", {detail:{pg:k}}));
  setTimeout(() => { if(stack[stack.length - 1] === k) p.querySelector(".cfg-back")?.focus({preventScroll:true}); }, DUR);
  return true;
}
// obre una pantalla des d'un botó (menú o fila) i en deixa constància a l'historial
function go(k){
  if(stack[stack.length - 1] === k) return;
  const fromMenu = menuOpen();
  if(fromMenu){ menu.hidden = true; scrim.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  if(!show(k)) return;
  try{ if(fromMenu && history.state && history.state.cfgMenu) history.replaceState({cfg:stack.length}, ""); else history.pushState({cfg:stack.length}, ""); }catch(e){}
}
function pop(){
  const k = stack.pop(); if(!k) return;
  const p = pg(k); p.classList.remove("on", "under");
  const top = stack.length ? pg(stack[stack.length - 1]) : null;
  if(top){ top.classList.remove("under"); top.classList.add("on"); window.dispatchEvent(new CustomEvent("ov-cfg", {detail:{pg:stack[stack.length - 1], back:true}})); }
  else setTimeout(() => { if(!stack.length){ panel.hidden = true; if(Math.abs(scrollY - savedY) > 2) scrollTo(0, savedY); btn.focus({preventScroll:true}); } }, DUR);
}
// la fletxa: fa servir l'historial (així el botó enrere d'Android i la fletxa fan el mateix)
function back(){ if(history.state && history.state.cfg === stack.length) history.back(); else pop(); }
addEventListener("popstate", e => {
  const st = e.state || {}, target = st.cfg || 0;
  if(menuOpen() && !st.cfgMenu) closeMenu(true);
  if(stack.length > target && $("clSheet")){   // hi ha un full obert a sobre: primer es tanca el full
    window.OV_CLUB?.closeSheet(); try{ history.pushState({cfg:stack.length}, ""); }catch(err){} return; }
  while(stack.length > target) pop();
});

document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-cfg],[data-back]"); if(!t) return;
  if(!t.closest("#viewPanel") && !t.closest("#cfgMenu")) return;
  e.preventDefault();
  if(t.hasAttribute("data-back")) back(); else go(t.dataset.cfg);
});
document.addEventListener("keydown", e => {
  if(e.key !== "Escape" || $("clSheet")) return;
  if(menuOpen()) closeMenu(); else if(stack.length) back();
});
// moure el focus amb les fletxes dins del menú
menu.addEventListener("keydown", e => {
  if(e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const L = [...menu.querySelectorAll(".cfg-mi:not([hidden])")], i = L.indexOf(document.activeElement);
  e.preventDefault(); L[(i + (e.key === "ArrowDown" ? 1 : L.length - 1)) % L.length]?.focus();
});

window.OV_CFG = {
  go, back, title,
  // obrir un apartat des de fora (p. ex. «Canvia-ho» de la Base): si cal, primer el pare
  open(k, parent){ if(parent && stack[stack.length - 1] !== parent && !stack.includes(parent)) go(parent); go(k); },
  current: () => stack[stack.length - 1] || null,
  isOpen: k => stack.includes(k)
};
})();
