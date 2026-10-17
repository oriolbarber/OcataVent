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
- **Aprofita l'espai (a cada millora):** text en línia i no apilat; dades curtes a la mateixa fila; accions secundàries com a icones a la fila del peu; res en columnes estretes que obliguin a partir paraules. Comprova-ho a 400 px d'amplada.
- **Esborrar o descartar:** sempre amb confirmació lliscant (`slideConfirm`).
- **Explicacions llargues:** dins un botó (i), no a la vista.
- **Mida de lletra:** «Petita / Gran» (mai «Normal»).
- **Atribució de dades:** el peu de pàgina diu d'on vénen les dades.
- **Correu de l'usuari:** només per identificar-lo, mai s'envia a serveis externs.

## Tecnologia
- **Codi:** HTML, CSS i JavaScript pur, sense framework ni pas de compilació. PWA amb service worker.
- **Publicació:** GitHub Pages.
- **Configurable des del principi, per a la V3 multiclub:** club, platja, coordenades, estacions i orientació de la costa (càlcul del terral). A la V1 això ja és l'objecte `LOCS` d'`app.js`.
- **Llocs = clubs (`LOCS`, `app.js`):** Club Ocata Vent (`masnou`), Club Nàutic El Masnou (`cnmasnou`, mateixa meteo, base pròpia), CN Vilassar (`vilassar`), Badalona, Base Nàutica Mar Bella (`marbella`), Centre Municipal de Vela (`cmv`), Club Patí Vela Barcelona (`barceloneta`). Camps: `name`, `muni`, `com`, coordenades, `home` (base), `coast` (terral), `stations` (pot ser buit = només previsió), `stNote`, `smp`, `beaches`/`flag` (null = sense bandera). Objectiu (decisió de l'Oriol): tots els clubs de Catalunya amb previsió, i estacions locals a poc a poc.
- **Selector (`llocs.js`):** el nom sota «Ocata Vent» a la capçalera (o Configuració ▸ Ubicació) obre un full amb mapa Leaflet (verd = amb estació, gris = només previsió), cerca per nom/municipi/comarca i llista per comarca. Triar recarrega l'app (`setLoc`).
- **Tipus d'estació (`STATIONS[k].type`):** sense tipus = Meteotemplate; `pbcn` = Port de Barcelona (CSV de dades obertes, m/s, hora UTC, + històric de 3 dies per a les hores mesurades i la comparació de models); `wcloud` = Weathercloud (`/device/values/{codi}`, m/s, sense ratxa ni historial). Port i Weathercloud no tenen CORS: només funcionen a l'APK (`OV_NATIVE.http`); al navegador, «sense dades · model». Comprovat el 18-10-2026.
- **Backend V2:** Firebase, pla Spark gratuït, regió `eur3`.
  - Auth: Google (només navegador), correu i contrasenya (Email/Password, amb «He oblidat la contrasenya»), i enllaç per correu. Pantalla d'entrada amb «Ja soc soci» / «Alta nova». Socis aprovats per administradors.
  - Administrador inicial (UID de Firebase de l'Oriol): `aHjoROUH3aQsHh6ksS3Tt1p5soF2`.
  - Firestore: cada registre amb `userId`, `clubId` i `visibilitat` (`privat` | `club` | `public`).
- **Tasques programades sense pla Blaze:** GitHub Actions amb `cron`. S'hi fa l'historial d'encerts dels models (desar la previsió a les 7 h i comparar-la a les 22 h).
- **Android (`android-app/`, Capacitor 8):** l'APK carrega la web publicada (`server.url`), així que els canvis de la web hi arriben sols; només cal recompilar si canvia `android-app/`. L'iPhone es queda com a PWA.
  - `native.js` (a la web): si hi ha Capacitor, `window.OV_NATIVE` grava les sortides amb `@capacitor-community/background-geolocation` (servei en primer pla, continua amb la pantalla apagada). A l'app no hi ha «Entra amb Google» (Google no ho permet dins d'una WebView): s'entra amb l'enllaç per correu, que porta `?app=1`; obert al navegador, `native.js` el reenvia a l'app amb `ocatavent://login?link=…` (intent-filter a l'AndroidManifest).
  - Pantalla durant la gravació: es manté encesa (`@capacitor-community/keep-awake`, via `OV_NATIVE.keepAwake`; a la web, Wake Lock API) i `trip.js` la cobreix de negre (`#rideSleep`) després de 40 s sense tocar-la; dos tocs la tornen. Els avisos de seguretat la desperten i queden per sobre.
  - Bateria: `BatteryPlugin.java` (`OvBattery`): `check()` diu si l'app està exclosa de l'optimització; `open()` obre la fitxa de l'app (el soci tria Bateria ▸ Sense restriccions). **No** es fa servir `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`: és un permís restringit al Google Play.
  - Pantalla completa: `MainActivity.java` amaga la barra de navegació d'Android (torna lliscant des de baix; la barra d'estat es manté). A la web, la pantalla de ruta demana Fullscreen API (`rideFull` a `trip.js`).
  - Widget de la pantalla d'inici (`VentWidget.java`, layout `widget_vent.xml`, 4×2): `widgetPush` (a `renderNow`, `app.js`) envia a `OvWidget.save` (`WidgetPlugin.java`, SharedPreferences `ov_widget`) el veredicte d'ara (`scoreWindow`) i 48 h de previsió per hores (`scoreHour`). Android el refresca cada 30 min sense obrir l'app: dades d'ara si tenen < 45 min (amb l'estació), si no la previsió de l'hora en curs; més enllà de 48 h, «obre l'app». No descarrega res pel seu compte. L'icona de l'app és fixa (decisió: el widget en lloc de canviar-la de color).
  - Compilació: GitHub Actions `build-apk.yml` (en canviar `android-app/` o a mà) → Release «apk», enllaç fix https://github.com/oriolbarber/OcataVent/releases/download/apk/ocata-vent.apk. Signatura amb els secrets `APK_KEYSTORE_B64` i `APK_KEYSTORE_PASSWORD` (àlies `ocatavent`); sense secrets, clau de proves. `versionCode` = número d'execució.

## Núvol (Fase 1, `cloud.js`)
- Firebase es descarrega des de gstatic només si ja s'havia entrat en aquest mòbil (`ov2_cloud`), si s'obre un enllaç d'accés o si es prem «Entra». Sense compte, l'app és la V1.
- El mòbil (IndexedDB) continua sent el magatzem principal; el núvol n'és la còpia. Cada sortida local porta `owner` (UID) i `synced`.
- Col·leccions: `members/{uid}` (nom, correu, `estat`: pendent | aprovat | rebutjat, consentiment), `admins/{uid}`, `sortides/{uid}_{id}` (fitxa) + `sortides/…/trams/{i}` (la sortida sencera en JSON trossejat).
- Regles: `firestore.rules`. Es publiquen soles amb GitHub Actions (`deploy-rules.yml`) en fer push si canvia el fitxer; cal el secret `FIREBASE_SERVICE_ACCOUNT` (JSON de la clau del compte de servei). Si l'acció falla (creu vermella a Actions), les regles NO són al núvol: avisa l'Oriol. Alternativa manual: consola ▸ Firestore ▸ Regles ▸ Publica. Els administradors no veuen les sortides privades.
- Versió del text de consentiment: `CONSENT_V` a `cloud.js`.

## Club (Fase 2, `club.js`)
- Pestanya «Club» (5a): els socis aprovats hi veuen Mur · Avisos · Anuncis · Base. Amb sessió però sense aprovar (sense alta, pendent o rebutjat), la pestanya hi és i només explica què falta (`renderWait`, `OV_CLOUD.status()`). Fa servir `window.OV_CLOUD.ctx()` i l'esdeveniment `ov-cloud`.
- `publicacions/{uid}_{tripId}`: còpia del resum (no enllaç a la sortida privada), ruta opcional simplificada i sencera (se surt de la base nàutica, no de casa; decisió de l'Oriol), `reaccions` = mapa {uid: up|clap|wow|down}.
- `intencions` (avui, demà o fins a 15 dies vista; s'apunten amb el mapa `apuntats`; cada una mostra la idoneïtat d'aquella hora i les 2 següents per a l'embarcació, amb `scoreHour` — `intentFit` a `club.js` —, també al formulari), `avisos` (hi publiquen membres de la comissió amb el permís `avisos`; administració i premium, a qualsevol comissió; l'autor els edita; `data` opcional de l'activitat: amb data caduquen l'endemà i surten amb una icona a la previsió de 7 dies via `window.OV_EVENTS`; sense data no caduquen; mapa `vist`; opcional `inscripcio` = «Pregunta qui s'apunta» → botó «M'hi apunto» i mapa `apuntats` {uid: nom}, cadascú la seva clau; **recordatori** `remindEvents`: en obrir o tornar a l'app, full amb els avisos amb data de demà i d'avui, per a tothom que els veu, un cop per avís i dia en aquest mòbil (`ov2_avis_pop`); no surt mentre es grava una sortida; no hi ha notificacions push), `anuncis` (data de caducitat, per defecte +15 dies, màxim 60; + subcol·lecció `interessats`, només la veu l'autor), `presencia/{uid}` (base o aigua).
- «Qui surt» compacte: indicador d'idoneïtat petit (`miniGauge`) a la cantonada dreta, botó a sota; vent/onada en una línia del color del veredicte.
- Avisos compactes: data de l'activitat a la capçalera; autor, data, «s'esborra», vistos, Edita (llapis), Retira (paperera) i Marca en una fila. Plegats: barra del color de la comissió, títol i data curta.
- Accions entre socis (reaccions, «M'hi apunto» d'avisos i «Qui surt», «Marca», «M'interessa»): només es repinta l'element (`paintReacts`, `paintItem` amb `data-item="col:id"` i `avisCard`/`intentItem`/`anCard`), un toc alhora (`busyT`, `reactBusy`), es rellegeix el document per tenir l'estat real i l'error surt dins l'element.
- Actualització en segon pla cada 20 s amb la pestanya del Club oberta: torna a llegir les dades de la secció i redibuixa només si han canviat (no ho fa amb un full obert, filtres, lliscant, desfent o confirmant).
- Llistes de noms (apuntats d'avisos i «Qui surt», interessats dels anuncis propis): el nombre + una (i) que desplega tots els noms en xips, «Tu» primer (`who()`, estat a `ui.whoOpen["col:id"]`).
- Anuncis: categoria i «fins al» a dalt; al peu, autor i data (o, si és teu, quants interessats i qui) amb llapis i paperera.
- Avisos vistos: es pleguen en una línia 1 h després de marcar-los (`AV_FOLD`; hora local a `ov2_avis_vist`; vistos des d'un altre mòbil, plegats). Es despleguen tocant-los i es tornen a plegar amb la fletxa.
- Mur: lliscar una sortida → arxiva, ← esborra (`ov2_mur_arx_{uid}` / `ov2_mur_del_{uid}`, només en aquest mòbil), amb «Desfés» 6 s. Si és pròpia, ← la retira del mur per a tothom quan s'acaba el temps de desfer. Filtres ▸ Mostra: Mur / Arxivades.
- **Base i embarcacions (Fase A feta):** decisions a `docs/base-embarcacions.md`. Pestanyes del Club: Base · Mur · Avisos · Anuncis. **Base és una sola pàgina** (`renderBaseTab`): capçalera simètrica (dues caselles: a la base · navegant, amb els noms) i el botó «Soc a la base» / «Marxo de la base» a tot l'ample (`baseTop`, `presBtn`; sense previsió del temps, decisió de l'Oriol) · plànol (`renderBoats`/`drawPlan`/`boatSheet`) · avisos de la base (`fetsCard`) · les meves embarcacions · «Qui et veu aquí» plegat (sense botó de començar sortida, decisió de l'Oriol) (`<details>`, estat a `ui.privOpen`), amb el nivell de visibilitat i l'interruptor «Marca'm a la base automàticament» (`#pvAuto`, el gestiona `amics.js`); sense llistes ni mapa de qui hi ha (`renderBase`). L'app no enllaça l'editor: només la web de gestió.
  - Avisos de la base: col·lecció `fets` (tipus nota | fet | pregunta; `public` = sense embarcació; fet d'una embarcació: autor, propietari i Manteniment; pregunta: autor i propietari; `respostes` ≤ 40, `vist`, `darrer`, `estat` obert|tancat). Els `public` (notes i avisos generals, `fetsPub`) surten sencers a Avisos (secció «Base nàutica», filtre `base`; compten al punt d'Avisos, `unreadN`) i a la Base com a línia amb icona (`bs-mark`); els d'embarcació, sencers a la Base i amb marca ! / ? a la plaça (`fetMarks`). Punt vermell a la pestanya Base amb els nous no públics (`fetsUnread`).
  - Plànol a l'app: fix (sense moure'l ni ampliar-lo), tocar una plaça obre la fitxa. Enquadrament `vista` = {x, y, w, h} en metres a `clubs/{club}/planol/actual`, que es dibuixa a l'editor amb l'eina «Vista app» (permís de plànol); sense `vista`, tot el plànol. La targeta pren la proporció de la vista (màx. 72vh).
  - Nucli compartit `planol-core.js` (`window.OV_PLAN`: catàleg BOATS/POLYS/POINTS/ESTATS, `shape`, `render`, ombres). Unitats: metres, origen = base nàutica, y cap al sud.
  - Editor `planol.html` + `planol.js` + `planol-cloud.js` (fora del service worker, per a ordinador; enllaç a la web de gestió i a Club ▸ Base). Amb sessió desa al núvol; amb `?local=1`, prototip a `localStorage`. Només es dibuixen places (amb tipus); l'embarcació s'assigna a la plaça i la silueta surt quan és a la varada.
  - Firestore: `clubs/{club}/planol/actual` (objs, bg sense imatge pròpia) i `embarcacions/{id}` (clubId, t, label, vela, prop, propUid, coprop, ocult, estat lloc|navegant|reparacio, notes, place, historial ≤ 20) + `privat/p` (nom ocult) + `foto/f` (JPEG base64 < 150 kB, retall 3:2 fet pel soci amb `cropPhoto`; Storage demana pla de pagament).
  - Permisos: `planol` (o comissió Junta) dibuixa; `embarcacions` (o Manteniment) gestiona fitxes i places; el propietari (`propUid`) canvia estat, notes, foto i nom ocult. Regles `canPlan`/`canBoats`.
  - Els socis proposen les dades de la seva embarcació (tipus, nom, vela, copropietaris, plaça) des de l'app (`newBoatSheet`, `dataForm`): queden amb `pendent: true` (vora taronja al plànol) fins que Manteniment les valida (`pendent: false`) o les corregeix. Les regles obliguen `pendent` quan el propietari toca aquestes dades; el propietari pot retirar la proposta mentre és pendent.
  - Fase B: a «Nova sortida» (`#tripBoat`, `tripBoatUI`) el soci tria l'embarcació (o «Cap»; per defecte la del mateix tipus que l'activitat; les en reparació no). `OV_CLUB.tripStart` → `tripBoatStart` la posa «navegant» (encara que la presència sigui «Ningú») i desa `ov2_trip_boat`; `tripEnd` → `tripBoatEnd` la torna «a la varada» si encara és navegant. Si l'acabament no arriba al núvol, es reintenta en tornar a obrir l'app. Fase C (avisos de fets i preguntes) feta.
- Base nàutica del Club Ocata Vent: 41.479804, 2.324024 (`LOCS.masnou.home` a `app.js`).
- Al document del soci: `comissions` (ids de `clubs/{clubId}.comissions`), rols i permisos (vegeu Web de gestió). L'antic camp `responsable` es converteix en el permís `seguretat` quan es desen els rols d'aquella persona; mentrestant les regles el continuen acceptant.

## Administració (`admin.js`)
- Configuració ▸ Administració, visible per a qui té algun permís. Permisos delegables a `members/{uid}.permisos`: `seguretat` (resoldre avisos de seguretat en ruta; la Junta també ho pot fer), `avisos` (publicar avisos de les comissions de què forma part), `altes` (aprovar, rebutjar, treure l'accés), `rols` (comissions i responsable, i crear/reanomenar/eliminar comissions), `permisos` (donar-los), `moderar` (retirar publicacions, «Qui surt» i anuncis d'altres del propi club; el contingut «tothom» d'un altre club només es pot amagar per al club: camp `amagat` = llista d'ids de club, regla `amagaOk`, filtrat a `getVisible`). Els administradors (`admins/` i l'inicial) els tenen tots. Ningú no es canvia l'estat ni els permisos a si mateix.
- Comissions editables a `clubs/{clubId}.comissions` = {id: nom}; si no existeix, Junta, Manteniment i Econòmica. La Junta (`junta`) no es pot eliminar: la fan servir els avisos de seguretat.
- El que caduca (`caduca`) ho esborra qualsevol soci que ho vegi. En esborrar el compte, `OV_CLUB.purge()` treu tot el que el soci ha publicat o marcat.

## Web de gestió (`gestio.html`, `admin.html`, `gestio.js`, `gestio.css`)
- Pàgines a banda, mateix Firebase i mateixa sessió que l'app (mateix origen). S'hi arriba des de Configuració ▸ Administració (enllaç només per a administració i premium) o directament per URL.
- `gestio.html`: el club propi (l'administració pot passar `?club=id`). Pestanyes Socis · Rols · Comissions · **Plànol** (l'editor `planol.html?embed=1` dins un iframe del mateix origen; la Junta i Manteniment sense premium hi entren directament per `planol.html`). Socis (comptadors, cerca, filtres per estat i comissió, aprovar/rebutjar, fitxa amb nom, comissions, responsable, permisos, treure l'accés lliscant; CSV) i Comissions (nom del club; crear, reanomenar, eliminar; la Junta és fixa).
- `admin.html`: només administració. Tots els clubs (crear-ne), tots els usuaris, i a la fitxa: Premium i canviar de club (abans treu comissions i responsable).
- **Rols** (paquets de permisos amb nom): plantilles globals a `config/global.plantilles` (admin.html; per defecte Secretaria, Comunicació, Coordinació, Monitoratge) → es copien a `clubs/{id}.rols` en crear un club; cada club els edita a gestio.html ▸ Rols (amb la taula «Qui pot fer què»). Al soci: `rolsClub` (ids) i `permisosExtra` (excepcions); la web recalcula `permisos` (efectius) en assignar un rol o canviar-ne els permisos (`setPerms`, `recalc`). Les regles només miren `permisos`. Ningú no es recalcula a si mateix. A l'app, la fitxa del soci només mostra els permisos i enllaça a la web.
- admin.html també gestiona l'administració global (`admins/{uid}`, només l'administració inicial n'afegeix o en treu) i mostra el catàleg de permisos.
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
- A baix, la línia del temps (`#wmTl`, `tlRender`/`tlSync`): xips de dia i franja d'hores de tota la previsió amb barres del color del veredicte (alçada = vent); l'agulla del mig marca l'hora triada. La mateixa línia del temps surt també sota el mapa en vertical (sense pantalla completa) i mou el gràfic i les etiquetes del mapa; la taula de dades per hores (`#wmScroll`) s'ha tret (decisió de l'Oriol: les dades ja són a «Hores d'avui»).
- Mapa: es pot moure i ampliar amb els dits i porta l'efecte de vent i onades de l'hora triada. La llegenda és dins del botó (i) de baix a l'esquerra.

## Avisos de seguretat i tasques programades (Fase 3, part 1)
- **Avisos en ruta** (`avisos.js`, al mòbil de qui navega, cada 20 s): sense vent i lluny (< 1 kn 10 min, > 0,5 nm de la base, estació < 4 kn i previsió < mínim de l'embarcació 2 h), vent massa fort (estació per sobre del màxim o de la ratxa màxima de l'embarcació), onades perilloses (previsió de les properes 3 h per sobre de `wMax`). Avís a pantalla amb vibració i so que **proposa** avisar el club: només es desa a `alertes/{uid}_{inici}_{tipus}` si el navegant prem «Avisa el club» (decisió de l'Oriol: avisos fiables, els autoritza qui navega). Un cop enviat, es retira lliscant «Estic bé, anul·la'l» (més difícil que enviar-lo); també s'esborra en acabar la sortida. Ho veu qui el soci tria a Confidencialitat (per defecte, el club i la gent a la base); amb «Ningú», en prémer el botó s'envia al club. El marquen com a resolt la Junta, qui té el permís `seguretat` (o premium) o qui és a la base.
- **Demana ajuda** (botó «Ajuda» a dalt de la pantalla de navegació, només amb compte aprovat): demana confirmació i envia un avís tipus `ajuda` (mateix flux que els altres).
- **Ajuda en curs** (`sos.js`): qui veu un avís prem «Vaig a ajudar» al Club (màxim 3 persones, també a les regles; el navegant rep qui arriba i qui marxa, i la caixa «Avís enviat» diu qui el socorre) → s'afegeix a `alertes/{id}.ajudants.{uid}` = {nom, lat, lon, at} i hi envia la posició cada 20 s. El navegant escolta el seu avís en directe (`onSnapshot`): surt «MISSATGE REBUT per NOM» i un mapa amb tots dos mòbils; mentre l'avís és actiu, el navegant hi puja la posició (20 s si algú hi va, si no 60 s). El mapa es minimitza i es torna a obrir amb el triangle d'emergència sobre el logo (i a la pantalla de navegació). S'acaba quan el navegant anul·la (lliscant), acaba la sortida, algú el resol o qui ajuda ho deixa. Sessió a `ov2_sos`.
- **Tornada a la base:** dins de 50 m de la base durant 10 min seguits, després d'haver-se allunyat 150 m → la sortida es desa sola i la presència passa a «a la base».
- **Arribada i sortida de la base sense sortida gravada** (`autoTick` a `club.js`): opcional (`privacitat.autoBase`, per defecte no). Amb l'app oberta: a menys de 50 m durant 10 min seguits → «a la base»; a més de 200 m durant 2 min → deixa d'estar-hi (precisió GPS ≤ 60 m). Freqüència segons la distància: > 2 km cada 10 min amb ubicació aproximada; 200 m–2 km cada 3 min; més a prop o comptant temps, cada minut. Per a l'APK: `window.OV_GEO.getPosition({high, maxAge})` substitueix la lectura, i un geofence natiu pot cridar `OV_CLUB.autoTick(true)`. Sense notificacions: els amics ho veuen a Club ▸ Base.
- **No hi ha avís per no tornar a l'hora prevista** (decisió de l'Oriol). Sense servidor de pagament, els responsables veuen els avisos en obrir l'app (no hi ha notificacions).
- **Encerts dels models** (`encerts.yml`, 4 crons UTC per cobrir horari d'estiu i d'hivern): `scripts/encerts.mjs` desa la previsió de cada model al matí (`data/previsio-avui.json`) i al vespre la compara amb l'estació de 8 a 20 h → `data/encerts.json` (error per model, vent mitjà, tipus: terral, marinada, llevant, garbí, calma). L'app ho mostra al panell de models i ho fa servir quan avui encara no hi ha 3 hores mesurades.
- `scripts/llocs.mjs` duplica LOCS/STATIONS/MODELS d'`app.js`: si canvien, cal canviar-los als dos llocs.

## Icones (editor «Icones Ocata Vent»)
- L'Oriol dibuixa les icones a l'artefacte https://claude.ai/artifact/ShKNihk2UBYD68HwRT75wg i prem «Desa per a l'app».
- Es desen a la base de dades de l'artefacte: col·lecció `icons`, document `boats` (llegeix-lo amb l'eina ArtifactData, acció `get`). Claus: `pati`, `windsurf`, `hobie` (BOAT_IC), `onada` (WAVE_IC), `bandera` (FLAG_IC: traç 1 = pal, la resta farcit), `gps`, `pantalla`, `bateria`, `avisos` (SAFE_IC: caselles de «Nova sortida» i avisos en ruta), `armilla`, `emissora`, `navalla`, `xiulet`, `aigua`, `abric`, `guants`, `mobil`, `bossa`, `sol` (KIT_IC de `trip.js`: recordatori «Ho portes tot?» en començar una sortida, gruix 1,7; al document només hi són si l'Oriol ha desat després d'afegir-les), `logo` (128×128 amb anella i color), `stroke` (gruix, viewBox 24×24).
- `data/icones.json` és una còpia de l'última versió aplicada. Quan l'Oriol digui «aplica les icones», llegeix el document, aplica-les a l'app i actualitza aquesta còpia.

## Documentació (`docs/`)
- **L'original és el repo**, no el Drive ni cap artefacte. Índex i pendents: `docs/README.md`. Guia: `docs/guia.html` (també imprimible en A4). Play Store: `docs/play/`. Legal: `docs/legal/`.
- **Estalvi de tokens en editar documentació:**
  - Canvis amb Edit, només del fragment afectat (`grep -n` per trobar-lo). No llegir ni reescriure el document sencer.
  - Agrupar en el mateix commit el canvi de codi i el de la guia que l'explica.
  - El PDF no es genera a mà: en fer push de `docs/guia.html`, l'acció `docs.yml` el publica a la Release «docs» (enllaç fix https://github.com/oriolbarber/OcataVent/releases/download/docs/guia-ocata-vent.pdf). La guia en línia (GitHub Pages) s'actualitza sola.
  - No republicar artefactes ni pujar res al Drive en cada canvi. Al Drive (`htmls ▸ Idoneïtat_OcataVent`) només s'hi copia una instantània quan l'Oriol ho demani («puja la documentació al Drive»), d'un sol cop, seguint la skill gestio-projectes-drive.
- Quan un canvi de l'app afecti el que fa el soci, actualitzar la secció de la guia en el mateix commit.

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
- V3: el logo del club ha de ser editable per a cada club (ara és fix a `icons/logo.svg`).
- La V3 serà oberta a qualsevol club de Catalunya i les Balears.
- No hi haurà menors d'edat com a usuaris.
- Text de consentiment RGPD i botó per esborrar el compte.
- Avisos de Meteocat (Previsió): es pleguen en una línia tocant-los (`ov_smp_fold`, en aquest mòbil).
- Avís legal: no substitueix el VHF canal 16 ni el 112.

## Pendent de la junta
- Qui rep els avisos.
- Coordenades i radi de la base.
- Llindars d'onada i de ratxa per embarcació.
- Quants socis tenen iPhone.
- Permís de meteoelmasnou.cat.
- Qui és el responsable del tractament de dades.
- Si l'avís de bolcada ha d'estar activat per defecte.
