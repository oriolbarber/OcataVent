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
  - Auth: Google (només navegador), correu i contrasenya (Email/Password, amb «He oblidat la contrasenya»), i enllaç per correu. Pantalla d'entrada amb «Ja soc soci» / «Alta nova». Socis aprovats per administradors.
  - Administrador inicial (UID de Firebase de l'Oriol): `aHjoROUH3aQsHh6ksS3Tt1p5soF2`.
  - Firestore: cada registre amb `userId`, `clubId` i `visibilitat` (`privat` | `club` | `public`).
- **Tasques programades sense pla Blaze:** GitHub Actions amb `cron`. S'hi fa l'historial d'encerts dels models (desar la previsió a les 7 h i comparar-la a les 22 h).
- **Android (`android-app/`, Capacitor 8):** l'APK carrega la web publicada (`server.url`), així que els canvis de la web hi arriben sols; només cal recompilar si canvia `android-app/`. L'iPhone es queda com a PWA.
  - `native.js` (a la web): si hi ha Capacitor, `window.OV_NATIVE` grava les sortides amb `@capacitor-community/background-geolocation` (servei en primer pla, continua amb la pantalla apagada). A l'app no hi ha «Entra amb Google» (Google no ho permet dins d'una WebView): s'entra amb l'enllaç per correu, que porta `?app=1`; obert al navegador, `native.js` el reenvia a l'app amb `ocatavent://login?link=…` (intent-filter a l'AndroidManifest).
  - Pantalla durant la gravació: es manté encesa (`@capacitor-community/keep-awake`, via `OV_NATIVE.keepAwake`; a la web, Wake Lock API) i `trip.js` la cobreix de negre (`#rideSleep`) després de 40 s sense tocar-la; dos tocs la tornen. Els avisos de seguretat la desperten i queden per sobre.
  - Pantalla completa: `MainActivity.java` amaga la barra de navegació d'Android (torna lliscant des de baix; la barra d'estat es manté). A la web, la pantalla de ruta demana Fullscreen API (`rideFull` a `trip.js`).
  - Compilació: GitHub Actions `build-apk.yml` (en canviar `android-app/` o a mà) → Release «apk», enllaç fix https://github.com/oriolbarber/OcataVent/releases/download/apk/ocata-vent.apk. Signatura amb els secrets `APK_KEYSTORE_B64` i `APK_KEYSTORE_PASSWORD` (àlies `ocatavent`); sense secrets, clau de proves. `versionCode` = número d'execució.

## Núvol (Fase 1, `cloud.js`)
- Firebase es descarrega des de gstatic només si ja s'havia entrat en aquest mòbil (`ov2_cloud`), si s'obre un enllaç d'accés o si es prem «Entra». Sense compte, l'app és la V1.
- El mòbil (IndexedDB) continua sent el magatzem principal; el núvol n'és la còpia. Cada sortida local porta `owner` (UID) i `synced`.
- Col·leccions: `members/{uid}` (nom, correu, `estat`: pendent | aprovat | rebutjat, consentiment), `admins/{uid}`, `sortides/{uid}_{id}` (fitxa) + `sortides/…/trams/{i}` (la sortida sencera en JSON trossejat).
- Regles: `firestore.rules`. Es publiquen soles amb GitHub Actions (`deploy-rules.yml`) en fer push si canvia el fitxer; cal el secret `FIREBASE_SERVICE_ACCOUNT` (JSON de la clau del compte de servei). Si l'acció falla (creu vermella a Actions), les regles NO són al núvol: avisa l'Oriol. Alternativa manual: consola ▸ Firestore ▸ Regles ▸ Publica. Els administradors no veuen les sortides privades.
- Versió del text de consentiment: `CONSENT_V` a `cloud.js`.

## Club (Fase 2, `club.js`)
- Pestanya «Club» (5a): els socis aprovats hi veuen Mur · Avisos · Anuncis · Base. Amb sessió però sense aprovar (sense alta, pendent o rebutjat), la pestanya hi és i només explica què falta (`renderWait`, `OV_CLOUD.status()`). Fa servir `window.OV_CLOUD.ctx()` i l'esdeveniment `ov-cloud`.
- `publicacions/{uid}_{tripId}`: còpia del resum (no enllaç a la sortida privada), ruta opcional simplificada i sense els 200 m inicials i finals, `reaccions` = mapa {uid: up|clap|wow|down}.
- `intencions` (avui, demà o fins a 15 dies vista; s'apunten amb el mapa `apuntats`), `avisos` (hi publiquen membres de la comissió amb el permís `avisos`; administració i premium, a qualsevol comissió; l'autor els edita; `data` opcional de l'activitat: amb data caduquen l'endemà i surten amb una icona a la previsió de 7 dies via `window.OV_EVENTS`; sense data no caduquen; mapa `vist`), `anuncis` (data de caducitat, per defecte +15 dies, màxim 60; + subcol·lecció `interessats`, només la veu l'autor), `presencia/{uid}` (base o aigua).
- Base nàutica del Club Ocata Vent: 41.479804, 2.324024 (`LOCS.masnou.home` a `app.js`).
- Rols al document del soci: `comissions` (ids de `clubs/{clubId}.comissions`) i `responsable`; s'assignen a Configuració ▸ Administració (`admin.js`).

## Administració (`admin.js`)
- Configuració ▸ Administració, visible per a qui té algun permís. Permisos delegables a `members/{uid}.permisos`: `avisos` (publicar avisos de les comissions de què forma part), `altes` (aprovar, rebutjar, treure l'accés), `rols` (comissions i responsable, i crear/reanomenar/eliminar comissions), `permisos` (donar-los), `moderar` (retirar publicacions, «Qui surt» i anuncis d'altres). Els administradors (`admins/` i l'inicial) els tenen tots. Ningú no es canvia l'estat ni els permisos a si mateix.
- Comissions editables a `clubs/{clubId}.comissions` = {id: nom}; si no existeix, Junta, Manteniment i Econòmica. La Junta (`junta`) no es pot eliminar: la fan servir els avisos de seguretat.
- El que caduca (`caduca`) ho esborra qualsevol soci que ho vegi. En esborrar el compte, `OV_CLUB.purge()` treu tot el que el soci ha publicat o marcat.

## Web de gestió (`gestio.html`, `admin.html`, `gestio.js`, `gestio.css`)
- Pàgines a banda, mateix Firebase i mateixa sessió que l'app (mateix origen). S'hi arriba des de Configuració ▸ Administració (enllaç només per a administració i premium) o directament per URL.
- `gestio.html`: el club propi (l'administració pot passar `?club=id`). Socis (comptadors, cerca, filtres per estat i comissió, aprovar/rebutjar, fitxa amb nom, comissions, responsable, permisos, treure l'accés lliscant; CSV) i Comissions (nom del club; crear, reanomenar, eliminar; la Junta és fixa).
- `admin.html`: només administració. Tots els clubs (crear-ne), tots els usuaris, i a la fitxa: Premium i canviar de club (abans treu comissions i responsable).
- Rol **premium** (`members/{uid}.premium`, només el dona l'administració): gestiona el seu club i hi té tots els permisos. Les regles limiten premium i els permisos de gestió al propi club (`sameClub`).
- Les altes noves de l'app entren a `ocatavent` (regla de `members` create); el multiclub de l'app és per a la V3.

## Confidencialitat i amics (`amics.js`)
- Configuració ▸ Confidencialitat: per a «mur», «presencia», «avisos», «intencions» i «anuncis», el soci tria tothom (qualsevol soci aprovat de l'app), club, amics o ningú (només presència i avisos). Avisos de seguretat: a més, «+ gent a la base nàutica» (`avisosBase`, per defecte sí; camp `base` a l'alerta). Es desa a `members/{uid}.privacitat`. Els avisos de les comissions sempre són per a tot el club.
- Cada document compartit porta `visibilitat` i `lectors` (els uid dels amics en desar-lo, només si és «amics»; si no, buit). Les regles fan servir `veu()`; l'app llegeix amb una consulta per nivell (`getVisible` a `club.js`). Quan s'accepta o es treu un amic, `OV_CLUB.refreshLectors()` actualitza els documents propis.
- Amics mutus: botó flotant d'afegir amic a baix a la dreta del Club. `amistats/{uidMenor}_{uidMajor}` (de, a, estat pendent | acceptada). `perfils/{uid}` (nom i club) per trobar socis.

## Pantalla «Nova sortida» (`prep.js`)
- Condicions d'ara per a l'embarcació (mateix càlcul que la portada, `scoreWindow`), hores fins a la posta, millor franja, llum que queda (fins a posta − 30 min), avisos de Meteocat d'avui i bandera.
- Mapa «On ets»: GPS propi només mentre la pantalla és visible i no es grava (per comprovar-lo), base nàutica, distància i rumb fins a la base. Estàtic al dit (zoom amb botons).
- Capes (es desen a `ov2_prep_ly`): Vent (ratlles en un canvas a la capa `prepWind` + etiqueta), Onades (crestes + etiqueta, només sobre el mar) i Pluja (últim fotograma de RainViewer). Les etiquetes s'ancoren a la posició. El (i) explica els colors.
- Màscara del mar: les rajoles d'OSM es carreguen amb `crossOrigin` i es marquen els píxels del color d'aigua (#aad3df). Serveix per a qualsevol platja (V3) sense dibuixar la costa a mà. Si canvia el mapa base, cal revisar aquest color.
- L'app crida `window.renderPrep()` quan arriben dades noves.
- L'efecte de vent i onades (canvas + màscara del mar) és a `fx.js` (`OV_FX(map, tiles, {get, active, onMask})`) i el fan servir «Nova sortida» i el mapa maximitzat de la Previsió.

## Previsió: pantalla completa (`windmap.js`)
- Botó de maximitzar al gràfic per hores i al mapa (`data-wmfull="chart|map"`): la targeta `#windMap` passa a `.full` (fixa, a tota la pantalla). El botó enrere d'Android la tanca (`history.pushState` + `popstate`).
- Gràfic: es redibuixa amb l'amplada i l'alçada lliures (`hourChart(…, Wpx, Hpx)`).
- S'obre en horitzontal: a l'APK amb `@capacitor/screen-orientation`; al navegador, Fullscreen API + `screen.orientation.lock` (a l'iPhone es queda vertical).
- A baix, la línia del temps (`#wmTl`, `tlRender`/`tlSync`): xips de dia i franja d'hores de tota la previsió amb barres del color del veredicte (alçada = vent); l'agulla del mig marca l'hora triada. La taula `#wmScroll` s'amaga a pantalla completa.
- Mapa: es pot moure i ampliar amb els dits i porta l'efecte de vent i onades de l'hora triada. La llegenda és dins del botó (i) de baix a l'esquerra.

## Avisos de seguretat i tasques programades (Fase 3, part 1)
- **Avisos en ruta** (`avisos.js`, al mòbil de qui navega, cada 20 s): sense vent i lluny (< 1 kn 10 min, > 0,5 nm de la base, estació < 4 kn i previsió < mínim de l'embarcació 2 h), vent massa fort (estació per sobre del màxim o de la ratxa màxima de l'embarcació), onades perilloses (previsió de les properes 3 h per sobre de `wMax`). Avís a pantalla amb vibració i so; es desa a `alertes/{uid}_{inici}_{tipus}` perquè el vegi qui el soci tria a Confidencialitat (per defecte, el club i la gent a la base). El marquen com a resolt la Junta, els responsables o qui és a la base.
- **Tornada a la base:** dins de 50 m de la base, després d'haver-se allunyat 150 m, i aturat 2 min → la sortida es desa sola i la presència passa a «a la base».
- **Arribada i sortida de la base sense sortida gravada** (`autoTick` a `club.js`): opcional (`privacitat.autoBase`, per defecte no). Amb l'app oberta: a menys de 50 m durant 10 min seguits → «a la base»; a més de 200 m durant 2 min → deixa d'estar-hi (precisió GPS ≤ 60 m). Freqüència segons la distància: > 2 km cada 10 min amb ubicació aproximada; 200 m–2 km cada 3 min; més a prop o comptant temps, cada minut. Per a l'APK: `window.OV_GEO.getPosition({high, maxAge})` substitueix la lectura, i un geofence natiu pot cridar `OV_CLUB.autoTick(true)`. Sense notificacions: els amics ho veuen a Club ▸ Base.
- **No hi ha avís per no tornar a l'hora prevista** (decisió de l'Oriol). Sense servidor de pagament, els responsables veuen els avisos en obrir l'app (no hi ha notificacions).
- **Encerts dels models** (`encerts.yml`, 4 crons UTC per cobrir horari d'estiu i d'hivern): `scripts/encerts.mjs` desa la previsió de cada model al matí (`data/previsio-avui.json`) i al vespre la compara amb l'estació de 8 a 20 h → `data/encerts.json` (error per model, vent mitjà, tipus: terral, marinada, llevant, garbí, calma). L'app ho mostra al panell de models i ho fa servir quan avui encara no hi ha 3 hores mesurades.
- `scripts/llocs.mjs` duplica LOCS/STATIONS/MODELS d'`app.js`: si canvien, cal canviar-los als dos llocs.

## Icones (editor «Icones Ocata Vent»)
- L'Oriol dibuixa les icones a l'artefacte https://claude.ai/artifact/ShKNihk2UBYD68HwRT75wg i prem «Desa per a l'app».
- Es desen a la base de dades de l'artefacte: col·lecció `icons`, document `boats` (llegeix-lo amb l'eina ArtifactData, acció `get`). Claus: `pati`, `windsurf`, `hobie` (BOAT_IC), `onada` (WAVE_IC), `bandera` (FLAG_IC: traç 1 = pal, la resta farcit), `gps`, `pantalla`, `bateria`, `avisos` (SAFE_IC: caselles de «Nova sortida» i avisos en ruta), `armilla`, `emissora`, `navalla`, `xiulet`, `aigua`, `abric`, `guants`, `mobil`, `bossa`, `sol` (KIT_IC de `trip.js`: recordatori «Ho portes tot?» en començar una sortida, gruix 1,7; al document només hi són si l'Oriol ha desat després d'afegir-les), `logo` (128×128 amb anella i color), `stroke` (gruix, viewBox 24×24).
- `data/icones.json` és una còpia de l'última versió aplicada. Quan l'Oriol digui «aplica les icones», llegeix el document, aplica-les a l'app i actualitza aquesta còpia.

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
