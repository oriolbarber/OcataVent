# Ocata Vent · Fitxa tècnica

*Estat del repositori `oriolbarber/OcataVent` el 14/10/2026. La documentació viva per treballar amb Claude és `CLAUDE.md` del repositori.*

## Identificació

| Camp | Valor |
|---|---|
| Nom | Ocata Vent |
| Paquet d'Android | `cat.ocatavent.app` (no es pot canviar un cop publicat al Play) |
| Versió | 2.0.N (N = número d'execució de GitHub Actions; `versionCode` = N) |
| SDK | mínim 24 (Android 7.0) · compilació 36 · objectiu 36 |
| Esquema d'enllaç | `ocatavent://login` (retorn de l'enllaç d'accés per correu) |
| Web publicada | https://oriolbarber.github.io/OcataVent/ (en proves) |
| V1 | https://oriolbarber.github.io/mar-del-masnou/ (repo `oriolbarber/mar-del-masnou`) |

## Arquitectura

| Peça | Tecnologia | Notes |
|---|---|---|
| App | HTML, CSS i JavaScript sense framework; PWA amb service worker | Cal apujar `CACHE` a `sw.js` a cada canvi |
| Android | Capacitor 8; l'APK carrega la web publicada (`server.url`) | Només cal recompilar si canvia `android-app/` |
| Connectors natius | `background-geolocation` 1.2.26, `keep-awake` 8.0.1, `screen-orientation` 8.0.2, `app` 8.1.2; `BatteryPlugin.java` propi | |
| Comptes i dades | Firebase Authentication + Cloud Firestore (`eur3`), pla Spark gratuït | Regles a `firestore.rules`, es despleguen amb GitHub Actions |
| Tasques programades | GitHub Actions (`encerts.yml`) | Historial d'encerts dels models |
| Web de gestió | `gestio.html` (club) i `admin.html` (administració general) | Mateix Firebase |
| iPhone | PWA (sense app nativa) | Sense gravació amb la pantalla apagada |

## Compilació i signatura

- Workflow `build-apk.yml`: en canviar `android-app/` o a mà. Publica la Release «apk»: `https://github.com/oriolbarber/OcataVent/releases/download/apk/ocata-vent.apk`.
- Signatura: secrets `APK_KEYSTORE_B64` i `APK_KEYSTORE_PASSWORD`, àlies `ocatavent`. Sense secrets, clau de proves (cal desinstal·lar per actualitzar).
- **Per al Play:** afegir `bundleRelease` per generar l'AAB i pujar-lo com a artefacte. Amb Play App Signing, la clau actual passa a ser la *clau de pujada*.

## Secrets i claus (on són, no què són)

| Secret | On | Per a què |
|---|---|---|
| `APK_KEYSTORE_B64`, `APK_KEYSTORE_PASSWORD` | GitHub ▸ Settings ▸ Secrets | Signar l'APK i l'AAB. **Guardar també el `.jks` i la contrasenya fora de GitHub** |
| `FIREBASE_SERVICE_ACCOUNT` | GitHub ▸ Settings ▸ Secrets | Publicar les regles de Firestore |
| Configuració web de Firebase | Al codi (`cloud.js`) | Identificadors públics, no són contrasenyes |

## Comptes i costos

| Servei | Cost | Titular |
|---|---|---|
| GitHub (repositori i Pages) | 0 € | Oriol |
| Firebase (Spark) | 0 € | Oriol |
| Google Play Console | 25 $ un sol cop | Per decidir (Oriol o club) |
| Apple Developer | 99 $/any | No previst (iPhone com a PWA) |
