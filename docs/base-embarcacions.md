# Base i embarcacions — decisions (15-10-2026)

Pestanya Club ▸ **Base** (primera: Base · Mur · Avisos · Anuncis). Dins de Base: «Embarcacions» (per defecte) i «Qui hi ha» (presència actual).

## Plànol
- Esquema dibuixat (net, sense els patins de la foto). Mentre s'edita, ortofoto de l'ICGC esvaïda per calcar.
- La imatge de fons s'ajusta **a mà** (moure, escalar, girar) fins que les embarcacions, que tenen mida estàndard, hi encaixin. L'ortofoto ja ve a escala, però també es pot ajustar.
- Editor complet a l'**ordinador** (web de gestió); al mòbil, retocs: moure, assignar, canviar estat.
- Tipus d'objecte: embarcacions, places, edificis, zones (varada, pas, prohibida), el mar (línia de costa) i punts de servei (dutxa, aigua, extintor, desfibril·lador, contenidors).
- **Només es dibuixen les places** (16-10-2026): cada plaça diu per a quin tipus d'embarcació és (mida estàndard + marge) i s'hi assigna l'embarcació (fitxa). L'embarcació no es dibuixa a mà: la seva silueta surt dins la plaça quan és a la varada; navegant o en reparació, la plaça es pinta del color de l'estat; lliure, vora discontínua. Les embarcacions sense plaça surten en una llista.
- Guardat per club, amb coordenades reals (serveix per a la V3 multiclub).

## Fitxa de l'embarcació
- Nom, tipus, plaça, núm. de vela/matrícula, propietari i copropietaris, foto i notes.
- Foto: Firebase Storage demana el pla de pagament; es desa comprimida (~800 px, < 100 KB) en un document a part de Firestore i només es descarrega en obrir la fitxa.
- Propietaris sense app i embarcacions del club: mateixos camps; les dona d'alta qui té el permís «embarcacions».
- Els socis també omplen les dades de la seva embarcació des de l'app (16-10-2026): queden pendents de validar fins que Manteniment les valida o les edita.
- Nom del propietari: per defecte el veu tot el club; el propietari el pot amagar (llavors només Manteniment i Junta).
- Historial de canvis (moure, reassignar, estat) dins la fitxa, plegat (desplegable).
- **Poca informació a la vista**: el que no és essencial, dins una (i) o un desplegable.

## Estats (colors)
- A la varada (silueta blanca dins la plaça) · Navegant (plaça blava) · En reparació (plaça taronja). Plaça lliure: vora discontínua. La meva: vora blava gruixuda.
- «Navegant» automàtic: en començar una sortida (a «Nova sortida» es tria l'embarcació si se'n té més d'una); torna a «al seu lloc» en tornar a la base.

## Comunicació
- «Pregunta al propietari»: fil privat per embarcació (qui pregunta ↔ propietari).
- «Avisa d'un fet»: l'obre qualsevol soci; el reben el propietari i Manteniment; el tanquen el propietari o Manteniment.
- Sense notificacions push: puntet vermell a Club en obrir l'app.

## Permisos
- `planol` (dibuixar edificis, zones, places, mar, punts): per defecte la Junta.
- `embarcacions` (altes i baixes, places, propietaris, fitxes de qui no té app): per defecte Manteniment.
- El propietari canvia l'estat, les notes i la foto de les seves.

## Fora d'abast (de moment)
- Llista d'espera, quotes de plaça, inventari de material. Les dades s'entren a mà (no hi ha llista per importar).

## Fases
- A (feta, 16-10-2026): plànol, editor al núvol, places, fitxes, foto, nom ocult, historial i pestanya Base a l'app.
- C (feta, 16-10-2026): avisos de la base (notes i incidències per a tot el club), «Avisa d'un fet» (propietari + Manteniment) i «Pregunta al propietari» (fil privat), amb respostes i tancament.
- B (feta, 16-10-2026): a «Nova sortida» es tria l'embarcació (o «Cap»); en començar passa a «navegant» i en acabar torna «a la varada», amb historial.
- Base és una sola pàgina (16-10-2026): vent i qui hi ha a dalt, plànol, avisos, les meves embarcacions i mapa de presència. L'app no enllaça l'editor (només la web de gestió).

## Mides estàndard (eslora × mànega)
- Patí català 5,60 × 1,60 m · Hobie Cat 5,11 × 2,34 m · Llaüd català 6 × 2 m · Barca 4 × 1,6 m.
- Windsurf: provisional 2,5 × 0,7 m (cal confirmar).
- Caiacs: no es dibuixen; van en un «Espai de caiacs» (zona) amb prestatgeries.

- **Vista a l'app:** el plànol és fix a l'app. L'enquadrament (`vista`, metres) el dibuixa qui té el permís de plànol amb l'eina «Vista app» de l'editor; sense enquadrament es veu tot el plànol.
