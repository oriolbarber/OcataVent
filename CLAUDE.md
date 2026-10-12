# Ocata Vent 2

App de condicions de navegació per al Club Ocata Vent (El Masnou), amb comptes de socis i dades compartides. És l'evolució de la V1: repo `oriolbarber/mar-del-masnou`, publicada a https://oriolbarber.github.io/mar-del-masnou/.

Pla complet: document «Ocata Vent 2 — usuaris i dades compartides» (Claude Docs, projecte 82697522-2f8c-483d-a42e-38a2bb252f4e).

## Com treballar amb l'Oriol
- **Idioma:** respon sempre en català.
- **Estil de resposta:** concís. Taula abans/després quan hi hagi canvis visibles. Reconeix els errors explícitament. Avisa de les decisions de disseny que prenguis pel teu compte.
- **Estalvi de tokens:**
  - Una tasca per conversa.
  - Fes proves visuals (captures) només si el canvi ho requereix o si ell ho demana.
  - Agrupa els retocs.
- **Commits:** fes commit i push al final de cada canvi. Al service worker, apuja la versió de la memòria cau (`CACHE = "…-vNN"`) perquè els mòbils rebin el canvi.

## Normes de l'app (no negociables)
- **Res obre un navegador extern:** ni enllaços amb `target=_blank` ni iframes que puguin navegar. Els iframes de tercers porten `sandbox="allow-scripts allow-same-origin"`.
- **Tot gran i clar:** mentre navegues, el mòbil s'ha de poder llegir d'un cop d'ull.
- **Esborrar o descartar:** sempre amb confirmació lliscant (`slideConfirm`).
- **Explicacions llargues:** dins un botó (i), no a la vista.
- **Mida de lletra:** «Petita / Gran» (mai «Normal»).
- **Atribució de dades:** el peu de pàgina diu d'on vénen les dades.
- **Correu de l'usuari:** només per identificar-lo, mai s'envia a serveis externs.

## Tecnologia
- **Codi:** HTML, CSS i JavaScript pur, sense framework ni pas de compilació. PWA amb service worker.
- **Publicació:** GitHub Pages.
- **Configurable des del principi, per a la V3 multiclub:** club, platja, coordenades, estacions i orientació de la costa (càlcul del terral). A la V1 això ja és l'objecte `LOCS` d'`app.js`.
- **Backend V2:** Firebase, pla Spark gratuït, regió `eur3`.
  - Auth: Google i enllaç per correu. Socis aprovats per administradors.
  - Administrador inicial (UID de Firebase de l'Oriol): `aHjoROUH3aQsHh6ksS3Tt1p5soF2`.
  - Firestore: cada registre amb `userId`, `clubId` i `visibilitat` (`privat` | `club` | `public`).
- **Tasques programades sense pla Blaze:** GitHub Actions amb `cron`. S'hi fan l'avís «no ha tornat a l'hora» i l'historial d'encerts dels models (desar la previsió a les 7 h i comparar-la a les 22 h).
- **Android:** APK directe amb Capacitor que carrega la web publicada i hi afegeix el GPS en segon pla (foreground service). L'iPhone es queda com a PWA.

## Núvol (Fase 1, `cloud.js`)
- Firebase es descarrega des de gstatic només si ja s'havia entrat en aquest mòbil (`ov2_cloud`), si s'obre un enllaç d'accés o si es prem «Entra». Sense compte, l'app és la V1.
- El mòbil (IndexedDB) continua sent el magatzem principal; el núvol n'és la còpia. Cada sortida local porta `owner` (UID) i `synced`.
- Col·leccions: `members/{uid}` (nom, correu, `estat`: pendent | aprovat | rebutjat, consentiment), `admins/{uid}`, `sortides/{uid}_{id}` (fitxa) + `sortides/…/trams/{i}` (la sortida sencera en JSON trossejat).
- Regles: `firestore.rules` (es publiquen a mà a la consola o amb `firebase deploy --only firestore:rules`). Els administradors no veuen les sortides privades.
- Versió del text de consentiment: `CONSENT_V` a `cloud.js`.

## Club (Fase 2, `club.js`)
- Pestanya «Club» (5a), només visible per a socis aprovats: Mur · Avisos · Anuncis · Base. Fa servir `window.OV_CLOUD.ctx()` i l'esdeveniment `ov-cloud`.
- `publicacions/{uid}_{tripId}`: còpia del resum (no enllaç a la sortida privada), ruta opcional simplificada i sense els 200 m inicials i finals, `reaccions` = mapa {uid: up|clap|wow|down}.
- `intencions` (s'apunten amb el mapa `apuntats`), `avisos` (només hi publiquen membres de la comissió; mapa `vist`), `anuncis` (+ subcol·lecció `interessats`, només la veu l'autor), `presencia/{uid}` (base o aigua; visible per a responsables o tot el club).
- Rols al document del soci: `comissions` (junta, manteniment, economica) i `responsable`; els assigna l'administrador des de Compte.
- El que caduca (`caduca`) ho esborra qualsevol soci que ho vegi. En esborrar el compte, `OV_CLUB.purge()` treu tot el que el soci ha publicat o marcat.

## Fonts de dades (V1)
- **Previsió:** Open-Meteo forecast i marine. Ús no comercial.
- **Estacions:** meteoelmasnou.cat (Meteotemplate). Cal demanar permís per a la V2.
- **Altres fonts:**
  - Avisos SMP: Meteocat.
  - Banderes de platja: dades obertes de la Generalitat.
  - Boia: Ports de l'Estat (Portus).
  - Mapes: Windy i Meteoblue.
  - Radar: RainViewer.
  - Carta nàutica: OpenSeaMap.

## Decisions preses
- La V3 serà oberta a qualsevol club de Catalunya i les Balears.
- No hi haurà menors d'edat com a usuaris.
- Text de consentiment RGPD i botó per esborrar el compte.
- Avís legal: no substitueix el VHF canal 16 ni el 112.

## Pendent de la junta
- Qui rep els avisos.
- Coordenades i radi de la base.
- Llindars d'onada i de ratxa per embarcació.
- Quants socis tenen iPhone.
- Permís de meteoelmasnou.cat.
- Qui és el responsable del tractament de dades.
- Si l'avís de bolcada ha d'estar activat per defecte.
