"use strict";
/* ============ Catàleg únic d'embarcacions ============
   Una sola llista per a tota l'app: barra de dalt i llindars (app.js), plànol de la base (planol-core.js), Mur, «Qui surt» i sortides.
   Cada tipus: n = nom, s = nom curt, f = família, ic = icona (BOAT_IC), l × w = mida estàndard en metres (plaça del plànol),
   sh = silueta al plànol (pati | cat | llaud | barca | taula; sense = monocasc), c = llindars per defecte:
   min / iMin / iMax / max = vent (kn), gust = ratxa màxima (kn), wOk / wMax = onada còmoda / màxima (m).
   Claus: no es poden canviar mai (són a les sortides, publicacions i fitxes desades al núvol). Les de rem i motor tenen min = iMin = 0:
   sense vent és ideal. Onada curta (pMin): de moment només la porten per defecte el foil, el kite i el pàdel. */
(function(){
const FAMS = {
  vela:  "Vela lleugera",
  cat:   "Catamarans",
  taula: "Taula",
  rem:   "Rem i pala",
  trad:  "Tradicional i quilla",
  motor: "Motor"
};
// pMin = període mínim de l'onada (s): per sota, «onada curta» i la nota baixa. null = indiferent (per defecte)
const c = (min, iMin, iMax, max, gust, wOk, wMax, pMin) => ({min, iMin, iMax, max, gust, wOk, wMax, pMin: pMin || null});
const LIST = {
  pati:       {n:"Patí català",          s:"Patí",       f:"vela",  ic:"pati",  l:5.60, w:1.60, sh:"pati",  c:c(5, 8, 16, 20, 24, 0.6, 1.2)},
  ilca:       {n:"ILCA / Làser",         s:"ILCA",       f:"vela",  ic:"vela1", l:4.23, w:1.42,               c:c(6, 9, 18, 22, 26, 0.7, 1.3)},
  optimist:   {n:"Optimist",             s:"Optimist",   f:"vela",  ic:"opti",  l:2.31, w:1.13,               c:c(4, 6, 12, 15, 18, 0.4, 0.6)},
  v420:       {n:"420",                  s:"420",        f:"vela",  ic:"vela2", l:4.20, w:1.71,               c:c(6, 9, 16, 20, 24, 0.6, 1.2)},
  v470:       {n:"470",                  s:"470",        f:"vela",  ic:"vela2", l:4.70, w:1.68,               c:c(6, 9, 17, 21, 25, 0.7, 1.3)},
  snipe:      {n:"Snipe",                s:"Snipe",      f:"vela",  ic:"vela2", l:4.72, w:1.52,               c:c(5, 8, 15, 18, 22, 0.6, 1.1)},
  v29er:      {n:"29er",                 s:"29er",       f:"vela",  ic:"skiff", l:4.45, w:1.77,               c:c(8, 11, 20, 22, 26, 0.7, 1.3)},
  vaurien:    {n:"Vaurien",              s:"Vaurien",    f:"vela",  ic:"vela2", l:4.08, w:1.47,               c:c(5, 7, 13, 16, 20, 0.5, 1.0)},
  escola:     {n:"Bot d'escola (Raquero, RS Quest, Bahia…)", s:"Bot d'escola", f:"vela", ic:"escola", l:4.30, w:1.75, c:c(5, 7, 13, 16, 20, 0.5, 0.9)},
  hobie:      {n:"Hobie Cat 16",         s:"Hobie",      f:"cat",   ic:"hobie", l:5.11, w:2.34, sh:"cat",   c:c(6, 10, 18, 22, 26, 0.8, 1.5)},
  catesc:     {n:"Catamarà d'escola (Hobie 14, Dragoon, Topaz)", s:"Cat d'escola", f:"cat", ic:"cat1", l:4.25, w:2.25, sh:"cat", c:c(6, 8, 14, 16, 20, 0.5, 1.0)},
  nacra:      {n:"Nacra 15 / 17",        s:"Nacra",      f:"cat",   ic:"hobie", l:5.25, w:2.60, sh:"cat",   c:c(8, 11, 18, 20, 25, 0.8, 1.5)},
  windsurf:   {n:"Windsurf",             s:"Windsurf",   f:"taula", ic:"windsurf", l:2.50, w:0.70, sh:"taula", c:c(10, 14, 24, 30, 34, 1.2, 2.2)},
  wing:       {n:"Wing foil",            s:"Wing",       f:"taula", ic:"wing",  l:2.00, w:0.80, sh:"taula", c:c(10, 13, 22, 28, 32, 0.8, 1.5, 5)},
  kite:       {n:"Kitesurf",             s:"Kite",       f:"taula", ic:"kite",  l:1.50, w:0.50, sh:"taula", c:c(11, 14, 24, 30, 34, 1.0, 2.0, 4)},
  iqfoil:     {n:"iQFoil",               s:"iQFoil",     f:"taula", ic:"iqfoil", l:2.20, w:0.95, sh:"taula", c:c(7, 10, 22, 26, 30, 0.6, 1.2, 5)},
  caiac:      {n:"Caiac de mar",         s:"Caiac",      f:"rem",   ic:"caiac", l:4.80, w:0.65, sh:"taula", c:c(0, 0, 8, 15, 20, 0.4, 0.8)},
  padel:      {n:"Pàdel surf",           s:"Pàdel",      f:"rem",   ic:"padel", l:3.30, w:0.80, sh:"taula", c:c(0, 0, 6, 10, 14, 0.3, 0.6, 6)},
  llagutrem:  {n:"Llagut de rem",        s:"Llagut",     f:"rem",   ic:"rem",   l:7.50, w:1.80, sh:"llaud", c:c(0, 0, 8, 14, 18, 0.4, 0.8)},
  barca:      {n:"Barca",                s:"Barca",      f:"rem",   ic:"barca", l:4.00, w:1.60, sh:"barca", c:c(0, 0, 10, 16, 22, 0.5, 1.0)},
  llaud:      {n:"Llaüd de vela llatina", s:"Llaüd",     f:"trad",  ic:"llati", l:6.00, w:2.00, sh:"llaud", c:c(5, 7, 14, 18, 22, 0.6, 1.0)},
  creuer:     {n:"Creuer lleuger (J/70, J/80…)", s:"Creuer", f:"trad", ic:"creuer", l:6.90, w:2.25,          c:c(6, 8, 18, 25, 30, 1.0, 1.8)},
  semirigida: {n:"Semirígida",           s:"Semirígida", f:"motor", ic:"neuma", l:4.50, w:2.00, sh:"barca", c:c(0, 0, 15, 22, 28, 0.8, 1.5)}
};
// Icones (24 × 24, traç): el contingut del <svg> que dibuixa boatIcon a app.js. pati, windsurf i hobie vénen de l'editor d'icones
// («aplica les icones»: es copien aquí); la resta són provisionals, es poden redibuixar a l'editor amb la mateixa clau.
const IC = {
  pati: `<path d="M17 3.5L18.5 16.5"/><path d="M17 4L8 15L18 15"/><path d="M3 17.5L21.5 17.5L21.5 19L4.5 19Z"/><path d="M2 19L20.5 19"/>`,
  windsurf: `<path d="M3 20.5c4 1.2 13 1.2 18-1.5"/><path d="M8.5 19.5 13 2.5"/><path d="M13 2.5c4.5 3 6.5 8 5.5 13L9.6 18"/><path d="M10.6 11.5l7.6 1.2"/>`,
  hobie: `<path d="M16 1L15.5 16.5"/><path d="M16.5 5.5L20 15L16.5 14.5"/><path d="M16 1.5L7 14L14.5 14.5"/><path d="M3 17.5L21 17.5L20 19.5L5 19.5Z"/><path d="M3.5 20L18 20"/>`,
  cat1: `<path d="M15 3L15 16"/><path d="M15 3.5L7 15.5H15"/><path d="M3 17.5L21 17.5L20 19.5L5 19.5Z"/><path d="M3.5 20L18 20"/>`,
  vela1: `<path d="M14 2.5L14.4 16"/><path d="M13.9 3L6 15.5H14.3"/><path d="M3 17.5H21L18.5 20.5H6Z"/>`,
  vela2: `<path d="M13 2L13.3 16"/><path d="M12.7 3L5 15.5H12.9"/><path d="M13.7 4.5L19.5 15.5H13.8"/><path d="M3 17.5H21L18.5 20.5H6Z"/>`,
  skiff: `<path d="M11 2L11.3 16"/><path d="M10.7 3L4.5 15.5H10.9"/><path d="M11.4 3.5C17 6 20 10 21 15.5H11.6"/><path d="M3 17.5H22L19.5 20.5H6Z"/>`,
  escola: `<path d="M12 4L12.3 15.5"/><path d="M11.7 5L6 15H11.9"/><path d="M12.6 6.5L17 15H12.7"/><path d="M2.5 16.5H21.5L19 21H5Z"/><path d="M8 18.7H16"/>`,
  opti: `<path d="M9 3V16"/><path d="M9.2 3.5L17 6.5L16.2 15H9.2"/><path d="M9.4 15L16.8 6.8"/><path d="M4 17.5H20V19.5L18.5 20.8H5.5L4 19.5Z"/>`,
  llati: `<path d="M10 9V16"/><path d="M3.5 14.5L19.5 3"/><path d="M19.5 3C18 9.5 15 13.5 10.2 15.5L3.5 14.5"/><path d="M2.5 17.5H21.5Q19.5 21 12 21Q4.5 21 2.5 17.5Z"/>`,
  creuer: `<path d="M12 2V14"/><path d="M11.6 3L5 13H11.7"/><path d="M12.5 4.5L18.5 13H12.6"/><path d="M2.5 15H21.5L19 18.5H5Z"/><path d="M11 18.5L11.6 21.5H13.4L13 18.5"/>`,
  caiac: `<path d="M2 18.5c5 2.2 15 2.2 20 0c-5-2.2-15-2.2-20 0Z"/><path d="M6.5 5.5L17.5 15.5"/><path d="M4.2 2.6L7.9 4.2L6.3 6.9L3.4 5Z"/><path d="M19.8 18.4L16.1 16.8L17.7 14.1L20.6 16Z"/>`,
  rem: `<path d="M2 12.5H22L19.5 16.5H4.5Z"/><path d="M7 12.5L4.5 20.5"/><path d="M12 12.5L9.5 20.5"/><path d="M17 12.5L14.5 20.5"/><circle cx="7" cy="10" r="1.3"/><circle cx="12" cy="10" r="1.3"/><circle cx="17" cy="10" r="1.3"/>`,
  barca: `<path d="M2.5 13H21.5L18.5 18H5.5Z"/><path d="M10 13L6.5 21"/><path d="M14 13L17.5 21"/>`,
  wing: `<path d="M4.5 13C4.5 6.5 9.5 3 18.5 3C17.5 9.5 13 13 4.5 13Z"/><path d="M8 10.8L15.5 5.2"/><path d="M3.5 17.5H20.5"/><path d="M12 17.5V21.5M9 21.5H15"/>`,
  kite: `<path d="M3.5 7.5C7 3 17 3 20.5 7.5L18.5 9C15.5 6.3 8.5 6.3 5.5 9Z"/><path d="M5.5 9L11 16.5M18.5 9L13 16.5"/><path d="M10 16.5H14"/><path d="M3.5 19.5C8 21.2 16 21.2 20.5 19"/>`,
  iqfoil: `<path d="M3 16.5c4 1 13 1 18-1"/><path d="M8.5 15.5L12.5 2.5"/><path d="M12.5 2.5c4 3 6 7 5 11L9.4 14"/><path d="M12 17.3V21.5M9 21.5H15"/>`,
  padel: `<path d="M2 18.5c5 2 15 2 20 0c-5-2-15-2-20 0Z"/><path d="M14.6 3L12.4 14.2"/><path d="M13.3 3H16"/><path d="M11.4 13.8L11.9 17.4L13.6 14.4Z"/>`,
  neuma: `<path d="M5 14H19.5A2.5 2.5 0 0 1 19.5 19H6.5L3.5 16.5Z"/><path d="M9 14V10.5H13.5L15.5 14"/><path d="M21.5 11V16"/>`
};
window.OV_BOATS = {FAMS, LIST, IC};
})();
