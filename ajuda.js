"use strict";
/* ============ Ocata Vent 2 · ⋮ ▸ Ajuda i comentaris ============
   Guia d'ús (docs/guia.html dins l'app) · Envia comentaris (prepara un correu a l'equip de l'app) ·
   Condicions i privadesa (avís de seguretat, condicions d'ús, política de privacitat, fonts de dades) ·
   Informació de l'app (versió, club, plataforma).
   Els comentaris s'envien amb l'app de correu del mòbil (no hi ha servidor de correu): FEEDBACK_MAIL, de moment el de l'Oriol. */
(() => {
const FEEDBACK_MAIL = "oriolbarber@gmail.com";   // de moment; quan el club en tingui un, canviar-lo aquí
const CHEV = `<svg class="cfg-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
const ic = p => `<span class="cfg-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg></span>`;
const IC = {
  guia:`<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h6M8 11h6"/>`,
  fb:`<path d="M4 5h16v11H9l-5 4z"/><path d="M12 8v3M12 13.5v.3"/>`,
  legal:`<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>`,
  info:`<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.3"/>`,
  warn:`<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>`,
  data:`<path d="M4 18c3-6 5-9 8-9s5 3 8 9"/><path d="M8 18h8M12 3v3"/>`,
  user:`<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>`
};
const row = (go, icon, t, sub) => `<button type="button" class="cfg-row" data-cfg="${go}">${ic(IC[icon])}<span class="cfg-rt"><b>${esc(t)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${CHEV}</button>`;
let ver = "";
const loadVer = () => ver ? Promise.resolve(ver) : fetch("sw.js", {cache:"no-cache"}).then(r => r.text()).then(t => { const m = t.match(/CACHE\s*=\s*"([^"]+)"/); ver = m ? m[1].replace(/^ocatavent2-/, "") : ""; return ver; }).catch(() => "");
const platform = () => window.OV_NATIVE ? "App d'Android" : matchMedia("(display-mode: standalone)").matches ? "App instal·lada (web)" : "Navegador";
const account = () => { const s = window.OV_CLOUD?.status ? OV_CLOUD.status() : null; return {null:"sense compte", "sense-alta":"sense alta", pendent:"alta pendent", rebutjat:"no aprovat", aprovat:"soci aprovat"}[s] || "sense compte"; };
const device = () => { const u = navigator.userAgent, a = u.match(/Android [\d.]+/), i = u.match(/(iPhone|iPad).*?OS ([\d_]+)/);
  return a ? a[0] : i ? i[1] + " iOS " + i[2].replace(/_/g, ".") : /Mac/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "Altres"; };

/* ---------- pantalla principal ---------- */
function renderHelp(){
  $("helpBody").innerHTML = `<div class="cfg-grp">
      ${row("help-guia", "guia", "Guia d'ús", "Com funciona l'app, pas a pas")}
      ${row("help-fb", "fb", "Envia comentaris", "Problemes, idees o dubtes")}
      ${row("help-legal", "legal", "Condicions i privadesa", "Seguretat, condicions d'ús i dades")}
    </div>
    <div class="cfg-grp">${row("help-info", "info", "Informació de l'app", "")}</div>`;
}

/* ---------- comentaris ---------- */
const FB = {tipus:"Problema", text:"", tech:true};
function techInfo(){ return [`Versió: ${ver || "?"}`, `Plataforma: ${platform()}`, `Dispositiu: ${device()}`, `Pantalla: ${screen.width}×${screen.height}`, `Club: ${typeof LOC !== "undefined" ? LOC.name : "?"}`, `Compte: ${account()}`].join("\n"); }
function renderFb(){
  const b = $("helpFbBody");
  b.innerHTML = `<div class="cfg-grp hf-intro">
      <div class="hf-it">${ic(IC.warn)}<span>Explica'ns problemes, com ara errors o coses que no funcionen, o idees per millorar l'app.</span></div>
      <div class="hf-it">${ic(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6"/>`)}<span>Al correu hi pots afegir captures de pantalla perquè ho entenguem millor.</span></div></div>
    <span class="lbl cfg-h">Què ens vols dir</span>
    <div class="seg cfg-seg" role="group" aria-label="Tipus de comentari" id="hfTipus">${["Problema", "Idea", "Dubte"].map(t => `<button type="button" data-hft="${t}" aria-pressed="${FB.tipus === t}">${t}</button>`).join("")}</div>
    <label class="acc-f"><span class="lbl">Descripció</span><textarea class="field hf-ta" id="hfText" rows="6" maxlength="1500" placeholder="${FB.tipus === "Problema" ? "Què ha passat i què esperaves que passés" : FB.tipus === "Idea" ? "Què t'agradaria que fes l'app" : "Què vols saber"}">${esc(FB.text)}</textarea></label>
    <label class="cl-sw hf-sw"><span><b>Inclou informació tècnica</b><small class="note">Versió, mòbil i club. No inclou el teu nom ni les teves dades.</small></span><input type="checkbox" class="switch" id="hfTech"${FB.tech ? " checked" : ""}></label>
    <button type="button" class="btn cl-pri acc-wide" id="hfSend"${FB.text.trim().length < 3 ? " disabled" : ""}>Prepara el correu</button>
    <p class="note">S'obrirà la teva app de correu amb el missatge preparat per a l'equip de l'app; l'envies des d'allà. Per a emergències al mar: VHF canal 16 o 112.</p>`;
}
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-hft]");
  if(t){ FB.tipus = t.dataset.hft; FB.text = $("hfText")?.value || FB.text; renderFb(); return; }
  if(e.target.closest && e.target.closest("#hfSend")){
    FB.text = ($("hfText")?.value || "").trim(); if(FB.text.length < 3) return;
    const subject = `Ocata Vent · ${FB.tipus}`, body = FB.text + (FB.tech ? "\n\n— Informació tècnica —\n" + techInfo() : "");
    location.href = `mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
});
document.addEventListener("input", e => { if(e.target.id !== "hfText") return; FB.text = e.target.value; const s = $("hfSend"); if(s) s.disabled = FB.text.trim().length < 3; });
document.addEventListener("change", e => { if(e.target.id === "hfTech") FB.tech = e.target.checked; });

/* ---------- condicions i privadesa ---------- */
function renderLegal(){
  $("helpLegalBody").innerHTML = `<div class="warnbox hl-safe"><b>Ocata Vent és una ajuda per decidir, no un sistema de seguretat.</b> No substitueix l'emissora VHF (canal 16), el 112 ni les indicacions del club, del port o dels socorristes. La decisió de sortir i la seguretat a l'aigua són de cada navegant.</div>
    <div class="cfg-grp">
      ${row("help-cond", "legal", "Condicions d'ús", "Qui ofereix l'app, comptes i responsabilitat")}
      ${row("help-priv", "user", "Política de privacitat", "Quines dades es desen, qui les veu i els teus drets")}
      ${row("help-fonts", "data", "Fonts de dades i llicències", "D'on surten la previsió, les estacions i els mapes")}
    </div>
    <div class="cfg-grp"><button type="button" class="cfg-row" data-cfg="acc">${ic(IC.user)}<span class="cfg-rt"><b>Esborrar el compte</b><small>A ⋮ ▸ Compte, al final de la pantalla</small></span>${CHEV}</button></div>
    <p class="note">Només per a persones de 18 anys o més.</p>`;
}
const S = (h, ...p) => `<h3>${h}</h3>` + p.map(x => x.startsWith("<ul") ? x : `<p>${x}</p>`).join("");
function renderCond(){
  $("helpCondBody").innerHTML = S("1. Qui ofereix l'app", `Ocata Vent és una app gratuïta del <b>Club Ocata Vent</b> (El Masnou), desenvolupada per Oriol Barber. Contacte: ${FEEDBACK_MAIL}.`)
    + S("2. Per a què serveix", "Ajuda a valorar les condicions per navegar amb embarcacions lleugeres, a gravar sortides i a compartir informació entre els socis. <b>És una ajuda per decidir, no un sistema de seguretat.</b>")
    + S("3. Seguretat al mar", `<ul><li>La decisió de sortir a navegar, i la seguretat a l'aigua, són responsabilitat de cada navegant.</li><li>Les previsions poden fallar, les estacions poden donar lectures errònies o deixar de funcionar, i el GPS i la connexió mòbil poden fallar al mar.</li><li>Els avisos de seguretat en ruta només funcionen amb l'app oberta o gravant, amb cobertura i amb compte aprovat. Ningú no està obligat a respondre'ls i no hi ha cap servei de vigilància darrere.</li><li>L'app no substitueix l'emissora VHF (canal 16), el 112, les indicacions del club, del port o dels socorristes, ni la normativa de la platja.</li><li>Porta sempre l'armilla i el material de seguretat adequat a l'embarcació.</li></ul>`)
    + S("4. Comptes de soci", `<ul><li>Només per a persones de 18 anys o més.</li><li>L'administració del club aprova les altes i pot retirar l'accés.</li><li>Cadascú és responsable del que publica. No es pot publicar contingut ofensiu, il·legal, publicitat no relacionada amb el club ni dades d'altres persones sense permís.</li><li>Les persones amb el permís de moderar poden retirar el contingut que no compleixi aquestes condicions.</li></ul>`)
    + S("5. Dades personals", "Vegeu la política de privacitat, a la pantalla anterior.")
    + S("6. Contingut de tercers", "Les dades meteorològiques, els mapes i les webcams són de tercers. Són propietat dels seus autors i se'n fan servir segons les seves condicions. El club no en garanteix l'exactitud ni la disponibilitat.")
    + S("7. Responsabilitat", "L'app s'ofereix tal com és, de manera gratuïta i sense garanties de funcionament continu. En la mesura que ho permeti la llei, el club i el desenvolupador no responen dels danys derivats de decisions preses a partir de la informació de l'app.")
    + S("8. Canvis", "Aquestes condicions es poden actualitzar. Si el canvi és important, l'app ho avisarà.");
}
const FONTS = [
  ["Open-Meteo", "Previsió (AROME, ICON, ECMWF, UKMO) i onatge · CC BY 4.0, ús no comercial"],
  ["meteoelmasnou.cat", "Vent en directe d'Ocata, El Masnou i Badalona"],
  ["Port de Barcelona i CN Vilassar", "Vent en directe de les seves estacions"],
  ["Meteocat", "Avisos de situacions meteorològiques de perill · dades obertes de la Generalitat"],
  ["Generalitat de Catalunya", "Bandera i estat de les platges · dades obertes"],
  ["Ports de l'Estat", "Onada mesurada a la boia de Barcelona"],
  ["Windy i meteoblue", "Mapes animats de vent i onades, i webcam de Badalona"],
  ["Nàutic Masnou", "Webcam de la platja"],
  ["RainViewer", "Radar de pluja"],
  ["OpenStreetMap i OpenSeaMap", "Mapa base (ODbL) i carta nàutica (CC BY-SA)"],
  ["Google Firebase", "Comptes i base de dades, en servidors de la Unió Europea"]
];
const LIBS = "Capacitor (MIT) · Leaflet (BSD-2) · Firebase JS SDK (Apache-2.0) · Lletres IBM Plex i Rajdhani (SIL OFL)";
function renderFonts(){
  $("helpFontsBody").innerHTML = `<div class="cfg-grp">${FONTS.map(([t, d]) => `<div class="cfg-row" style="cursor:default"><span class="cfg-rt"><b>${esc(t)}</b><small>${esc(d)}</small></span></div>`).join("")}</div>
    <p class="note">Les dades són dels seus autors i se'n fan servir segons les seves condicions. El club no en garanteix l'exactitud ni la disponibilitat.</p>
    <span class="lbl cfg-h">Biblioteques de codi</span><p class="note">${esc(LIBS)}</p>`;
}

/* ---------- informació de l'app ---------- */
function renderInfo(){
  const r = (t, v) => `<div class="cfg-row" style="cursor:default"><span class="cfg-rt"><small>${esc(t)}</small><b>${esc(v)}</b></span></div>`;
  $("helpInfoBody").innerHTML = `<div class="cfg-grp"><div class="cfg-prof"><img src="icons/logo.svg?v=3" alt="" width="60" height="60" style="border-radius:50%"><div class="acc-who" style="flex:1"><b>Ocata Vent</b><span>Club Ocata Vent · El Masnou</span></div></div></div>
    <div class="cfg-grp">${r("Versió", ver || "…")}${r("Plataforma", platform())}${r("Club o lloc", typeof LOC !== "undefined" ? LOC.name : "")}${r("Compte", account())}${r("Desenvolupament", "Oriol Barber, amb el Club Ocata Vent")}</div>
    <p class="note">App gratuïta i sense anuncis per als socis. © 2026 Club Ocata Vent.</p>`;
}

window.addEventListener("ov-cfg", e => { const k = e.detail && e.detail.pg;
  if(k === "help") renderHelp();
  if(k === "help-fb"){ renderFb(); loadVer(); }
  if(k === "help-legal") renderLegal();
  if(k === "help-cond") renderCond();
  if(k === "help-fonts") renderFonts();
  if(k === "help-info"){ renderInfo(); loadVer().then(() => { if(window.OV_CFG?.current() === "help-info") renderInfo(); }); }
  // documents del mateix lloc, dins de l'app (es carreguen només el primer cop que s'obren)
  if(k === "help-guia"){ const f = $("helpGuia"); if(!f.src) f.src = "docs/guia.html"; }
  if(k === "help-priv"){ const f = $("helpPriv"); if(!f.src) f.src = "docs/legal/privacitat.html"; }
});
})();
