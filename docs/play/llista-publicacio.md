# Ocata Vent · Llista per publicar al Google Play

*Versió 15/10/2026 (v2: permís de bateria resolt). Basada en el codi del repositori `oriolbarber/OcataVent` d'aquesta data.*

## Resum

L'app d'Android ja existeix (Capacitor 8, paquet `cat.ocatavent.app`, target SDK 36) i es compila sola amb GitHub Actions. Per pujar-la al Play Store falten sobretot **tres coses de codi**, **dues pàgines web públiques** i **una prova tancada de 14 dies amb 12 persones** (si el compte de desenvolupador és personal).

## 1. Canvis al codi abans de pujar res

| # | Què | Per què | Prioritat |
|---|---|---|---|
| 1 | Generar un **AAB** (`./gradlew bundleRelease`) a més de l'APK, al workflow `build-apk.yml` | El Play Store només accepta Android App Bundle per a apps noves. L'APK continua servint per repartir-la a mà | Imprescindible |
| 2 | Signar amb **la clau definitiva** (secrets `APK_KEYSTORE_B64` i `APK_KEYSTORE_PASSWORD`) i activar **Play App Signing** | Sense la clau de pujada no es pot actualitzar mai l'app. Guardar el fitxer `.jks` i la contrasenya en dos llocs segurs | Imprescindible |
| 3 | `versionCode` creixent i `versionName` llegible (ara `2.0.<execució>`) | Ja és així: cada compilació apuja el número. Comprovar que el primer AAB no fa servir un número més baix que cap APK de proves | Comprovar |
| 4 | ~~Permís `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`~~ | **Fet (15/10/2026, commit 4d73935):** tret del manifest. El botó «Obre els ajustos» obre la fitxa de l'app i el soci tria Bateria ▸ Sense restriccions. No cal cap declaració | Fet |
| 5 | ~~Ubicació en segon pla al manifest fusionat~~ | **Comprovat:** el connector `background-geolocation` 1.2.26 no hi afegeix `ACCESS_BACKGROUND_LOCATION` | Fet |
| 6 | Canviar el nom del `manifest.webmanifest`: «Ocata Vent 2 (proves)» → «Ocata Vent» | És el nom que surt a l'iPhone i a Chrome quan s'instal·la com a web | Mitjana |
| 7 | Afegir dues pàgines al repositori (GitHub Pages): `privacitat.html` i `esborrar-compte.html` (esborranys a `docs/legal/`) | El Play Store exigeix un URL públic per a la política de privacitat i un altre per demanar l'esborrat del compte sense l'app | Imprescindible |
| 8 | Afegir a Configuració ▸ Compte un enllaç a la política de privacitat (dins l'app, sense obrir navegador extern) | El Play Store demana que la política sigui accessible també des de l'app | Alta |
| 9 | Afegir un botó **«Denuncia»** a les publicacions, anuncis i perfils, que avisi qui té el permís de moderar | El Play el demana a les apps amb contingut generat per usuaris | Alta |

## 2. Decisions pendents (de la junta i de l'Oriol)

| Decisió | Opcions | Què implica |
|---|---|---|
| **Qui publica l'app** | Compte personal de l'Oriol (25 $, pagament únic) o compte d'organització a nom del club | Personal: cal la prova tancada de 12 persones durant 14 dies, i el nom que surt al Play és el de l'Oriol. Organització: necessita número D-U-N-S del club (gratuït, tarda dies o setmanes) i la verificació és més llarga, però l'app queda a nom del club |
| **Responsable del tractament** | Club Ocata Vent (associació) o l'Oriol | Ha de constar a la política de privacitat. Ara l'app diu «Club Ocata Vent» |
| **Correu de contacte** | Un correu del club (recomanat) | Obligatori a la fitxa del Play i a la política de privacitat. Als documents surt com a `[CORREU DEL CLUB]` |
| **Permís de meteoelmasnou.cat** | Acord per escrit | L'app hi depèn per al vent en directe i les webcams. Publicar-la al Play la fa visible a tothom |
| **Distribució** | Pública, o només per enllaç (prova tancada o interna permanent) | Si només és per al club, es pot quedar en prova tancada/interna sense passar a producció |

## 3. Passos a la consola del Play

1. Crear el compte de desenvolupador a play.google.com/console (25 $) i verificar la identitat.
2. **Crear l'app:** nom «Ocata Vent», idioma per defecte català (ca), App, Gratuïta.
3. **Contingut de l'app** (menú *Supervisa i millora ▸ Contingut de l'app*):
   - Política de privacitat: `https://oriolbarber.github.io/OcataVent/privacitat.html`
   - Accés a l'app: les funcions del Club necessiten compte aprovat → donar un **compte de proves** (correu i contrasenya) ja aprovat, amb instruccions (vegeu el fitxer de classificació).
   - Anuncis: **No**.
   - Classificació de contingut: qüestionari IARC (respostes al fitxer de classificació).
   - Públic objectiu: **18 anys o més**.
   - Seguretat de les dades: respostes al fitxer de seguretat de les dades.
   - Esborrat de comptes: `https://oriolbarber.github.io/OcataVent/esborrar-compte.html`
   - Serveis en primer pla: declaració de la ubicació amb vídeo (fitxer de permisos).
   - Aplicació governamental / financera / de salut: No.
4. **Fitxa de la botiga:** textos (fitxer de la fitxa) i gràfics (carpeta `04_Grafics`).
5. **Categoria:** Esports (alternativa: Temps). Etiquetes: vela, vent, meteorologia.
6. **Prova interna** (fins a 100 persones, sense revisió llarga) per comprovar que l'AAB s'instal·la.
7. **Prova tancada** amb almenys 12 socis durant 14 dies seguits (compte personal). Llista de correus Gmail dels socis.
8. Sol·licitar l'accés a producció i respondre les preguntes sobre la prova.
9. Publicar a producció (o deixar-la en prova tancada si només és per al club).

## 4. Riscos de revisió

- **App que carrega una web** (`server.url` a GitHub Pages): el Play admet apps WebView del propi desenvolupador si aporten funcions d'app. Ocata Vent en té (GPS en segon pla amb servei en primer pla, orientació, pantalla sempre encesa, enllaç `ocatavent://`). Convé dir-ho a la descripció i que l'app funcioni sense connexió (ja ho fa amb l'última previsió).
- **Els canvis de la web arriben sense revisió del Play.** Està permès, però l'app ha de complir les polítiques en tot moment: no afegir mai pagaments, anuncis o funcions noves sensibles sense actualitzar les declaracions.
- **Webcams i mapes de tercers** (Windy, meteoblue, Nàutic Masnou): un revisor pot demanar que demostris que tens permís per mostrar-los. Tenir els permisos per escrit o retirar-los de la versió pública.
- **Open-Meteo** és gratuït només per a ús no comercial. Una app gratuïta, sense anuncis ni pagaments, d'un club, hi encaixa. Si mai es cobra, cal un pla de pagament.
- **Rajoles d'OpenStreetMap:** la política d'ús dels servidors d'OSM no permet un ús intensiu. Per a un club va bé; si l'app creix, cal un proveïdor de mapes propi.
- **Verificació de desenvolupadors d'Android:** Google està implantant la verificació obligatòria de qui distribueix apps, també per APK fora del Play. Segons Bitdefender, a partir del setembre de 2026 s'aplica a uns quants països (Brasil, Indonèsia, Singapur, Tailàndia) i el 2027 a tot el món. Tenir el compte de Play verificat ja hi dona resposta.

## Fonts

- [Requisits de prova per a comptes personals nous (Google Play)](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)
- [Requisits dels serveis en primer pla (Google Play)](https://support.google.com/googleplay/android-developer/answer/13392821)
- [Requisit d'esborrat de comptes (Google Play)](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Verificació de desenvolupadors d'Android (Bitdefender)](https://www.bitdefender.com/en-au/blog/hotforsecurity/google-developer-verification-sideloaded-apps)
