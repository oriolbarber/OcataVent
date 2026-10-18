# Ocata Vent · Formulari «Seguretat de les dades» (Google Play)

*Respostes proposades a partir del codi del 18/10/2026 (`cloud.js`, `club.js`, `amics.js`, `sos.js`, `firestore.rules`). Si l'app canvia, cal revisar-les.*

## Preguntes generals

| Pregunta | Resposta | Motiu |
|---|---|---|
| L'app recull o comparteix algun tipus de dada d'usuari obligatori? | **Sí** | Amb compte de soci es desen nom, correu, sortides i ubicació a Firebase |
| Totes les dades recollides s'encripten en trànsit? | **Sí** | Tot va per HTTPS (`cleartext: false` a Capacitor) |
| Proporcioneu una manera de sol·licitar l'esborrat de les dades? | **Sí** | Botó a ⋮ ▸ Compte ▸ Esborra el compte, i pàgina web `esborrar-compte.html` |
| Compte: com es crea? | Nom d'usuari (correu) i contrasenya, i enllaç per correu (OAuth de Google només a la web) | |
| URL d'esborrat del compte | https://oriolbarber.github.io/OcataVent/esborrar-compte.html | |
| Esborrat parcial de dades sense esborrar el compte? | **Sí** | Cada sortida, publicació, anunci o avís es pot esborrar per separat |

## Tipus de dades

Marcar **Recollides**; **no** marcar «Compartides» (Firebase és un proveïdor de serveis, i el que veuen altres socis ho comparteix el mateix usuari amb una acció seva, que el Play no compta com a compartir).

| Categoria del Play | Tipus | Recollida | Opcional | Finalitats | Detall |
|---|---|---|---|---|---|
| Ubicació | **Ubicació precisa** | Sí | Sí | Funcionalitat de l'app | Ruta GPS de les sortides desades al núvol; posició mentre navegues (presència) i durant un avís de seguretat, només si l'usuari ho activa |
| Ubicació | **Ubicació aproximada** | Sí | Sí | Funcionalitat de l'app | Marcar-se a la base automàticament (lectures aproximades quan és lluny) |
| Informació personal | **Nom** | Sí | Sí | Funcionalitat de l'app, gestió del compte | Nom i cognoms per a l'alta i perquè el club el vegi |
| Informació personal | **Adreça electrònica** | Sí | Sí | Gestió del compte | Inici de sessió i aprovació de l'alta. No s'envia a cap altre servei |
| Informació personal | **Número de telèfon** | Sí | Sí | Funcionalitat de l'app | Opcional; només el veuen la Junta i el permís «Seguretat» del club, per trucar si el soci envia un avís des de l'aigua |
| Informació personal | **Identificadors d'usuari** | Sí | Sí | Gestió del compte | UID de Firebase |
| Activitat a l'app | **Altres continguts generats per l'usuari** | Sí | Sí | Funcionalitat de l'app | Comentaris de sortides, avisos de comissions, anuncis, «Qui surt» |
| Activitat a l'app | **Interaccions amb l'app** | Sí | Sí | Funcionalitat de l'app | Reaccions, «Hi vaig», «M'interessa», «Vist», amistats |

**«Opcional = Sí»** perquè l'app es pot fer servir sencera sense compte (previsió, gravació i historial queden al mòbil).

**«Processament efímer»:** No (les dades es desen fins que l'usuari les esborra; la presència i les intencions caduquen soles).

## No es recull

- Cap identificador del dispositiu, ni d'anuncis.
- Cap dada de salut, financera, de contactes, fotos, àudio, missatges privats ni historial web.
- Cap analítica ni informe d'errors (no hi ha Google Analytics, Crashlytics ni similars).

## Avisos per comprovar abans d'enviar

- **Serveis de tercers carregats des del mòbil** (Open-Meteo, meteoelmasnou.cat, Meteocat, Generalitat, Ports de l'Estat, RainViewer, OpenStreetMap, OpenSeaMap, Google Fonts, cdnjs, gstatic): reben l'adreça IP del mòbil, com qualsevol web. No reben la ubicació de l'usuari (es demana la previsió de la platja, amb coordenades fixes).
- **Mapes de Windy i meteoblue i webcams** dins de marcs: aquests serveis poden fer servir galetes pròpies. Esmentat a la política de privacitat.
- Si algun dia s'afegeixen notificacions push (Firebase Cloud Messaging), caldrà declarar **Identificadors del dispositiu**.
