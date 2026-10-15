# Ocata Vent · Permisos d'Android i declaracions

*Permisos de `android-app/android/app/src/main/AndroidManifest.xml` del 15/10/2026 (v2: sense el permís de bateria).*

## Permisos que demana l'app

| Permís | Per a què | Declaració al Play |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Previsió, estacions, compte i club; saber si hi ha connexió | No |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Gravar la ruta, distància a la base, presència i avisos | Formulari de seguretat de dades |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | Continuar gravant la ruta amb la pantalla apagada (notificació fixa «Ocata Vent està gravant la sortida») | **Sí: servei en primer pla de tipus ubicació** |
| `POST_NOTIFICATIONS` | Mostrar la notificació fixa mentre grava (Android 13+) | No |
| `WAKE_LOCK` | Pantalla encesa durant la gravació | No |
| `VIBRATE` | Vibració dels avisos de seguretat | No |

## Declaració del servei en primer pla (ubicació)

A *Supervisa i millora ▸ Contingut de l'app ▸ Serveis en primer pla*:

**Cas d'ús:** «Background Location Updates: User-initiated location sharing» no encaixa del tot; triar **«Background Location Updates: Navigation»** o escriure'l a mà: *Recording a user-started sailing trip (GPS track)*.

**Descripció de la funció (en anglès):**
> When the user taps "Start trip", the app starts a location foreground service that records the GPS track of a sailing trip (position, speed and heading every few seconds). Sailors keep the phone in a waterproof case with the screen off to save battery, so the recording must continue while the app is not visible. A persistent notification is shown during the whole recording, and the service stops when the user ends the trip or returns to the club's base.

**Impacte si el sistema l'atura o la retarda (en anglès):**
> The recorded track would have gaps or end early, so distance, speeds and the trip summary would be wrong. In-trip safety checks (no wind far from shore, too much wind, dangerous waves) would also stop, and the sailor's position would not be available to the club if they ask for help.

**Vídeo de demostració (guió, 30–45 s, enregistrament de pantalla del mòbil penjat a YouTube com a «no llistat»):**
1. Obrir l'app i anar a la pestanya **Sortida**.
2. Mostrar les comprovacions (GPS, pantalla, bateria) i prémer **Comença la sortida**.
3. Acceptar el permís d'ubicació.
4. Desplegar la barra de notificacions: es veu la notificació fixa d'Ocata Vent.
5. Bloquejar la pantalla uns segons, desbloquejar-la i mostrar que la ruta continua.
6. Prémer **Atura ▸ Desa la sortida**: la notificació desapareix.

## Optimització de bateria

**Resolt el 15/10/2026.** L'app ja no demana `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, que el Play restringeix.

| | Abans | Ara |
|---|---|---|
| Permís al manifest | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Cap |
| Botó a «Nova sortida» | «Treu la restricció» | «Obre els ajustos» |
| Què obre | Diàleg del sistema «Permet» | Fitxa de l'app; el soci tria Bateria ▸ Sense restriccions (si el fabricant no la deixa obrir, la llista d'optimització de bateria) |
| Comprovació | `isIgnoringBatteryOptimizations` | Igual (no necessita permís) |
| Declaració al Play | Justificació obligatòria | Cap |

## Ubicació en segon pla (`ACCESS_BACKGROUND_LOCATION`)

**Comprovat el 15/10/2026:** ni l'app ni el connector `@capacitor-community/background-geolocation` 1.2.26 la declaren. El servei en primer pla s'inicia mentre l'app és visible, i Android permet llegir la ubicació sense aquest permís. No cal la declaració d'ubicació en segon pla.
