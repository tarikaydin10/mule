# MULE

Top-down Stealth-Heist. Der Spieler stiehlt Objekte – und die Beute verändert, wie er sich bewegt und was er kann. Das Tragen ist der Kern, nicht das Stehlen.

## Design-Säulen

1. **Die Beute verändert die Regeln.** Jede Beute hat genau eine dominante Regel auf einer eigenen Achse, dazu optional realistische Nebeneigenschaften.
2. **Map-Regel × Beute-Regel.** Maps und Beuten sind nicht handgebaut kombiniert, sondern über globale Systeme parametrisiert. Jede Kombination macht andere Taktiken leicht oder schwer.
3. **Wahrnehmung ist eine Ressource.** Die Standardansicht ist dunkel und lichtgetrieben. Wärmebild und Nachtsicht sind Gadgets mit map-abhängigen Stärken und Schwächen – nach demselben Prinzip wie die Beute.

## Beute-Archetypen (Achsen)

| Beute | Dominante Achse | Regel |
|---|---|---|
| Server-Block | Hände | Beidhändig: keine Gadgets/Takedowns, langsamer. Abstellen/Aufheben möglich. |
| Kryoprobe | Zeit/Wärme | Startet kalt (im Wärmebild unsichtbar), taut auf, wird wärmer → Wärmekameras erfassen sie. Voll aufgetaut = Beute verloren. |
| Peilsender | Signal | Pingt periodisch, Ping ist ein Geräuschereignis, das Wachen anlockt. |
| Artefakt | Bewegung | Stöße/Sprinten/Türen treten reduzieren Integrität. Wert skaliert mit Integrität. |

Nebeneigenschaften (z. B. Sprengkopf leicht erschütterungsempfindlich) sind erlaubt, dürfen aber die dominante Achse einer anderen Beute nicht dominieren.

## Maps

- Eine dominante Regel (~60–70 % der Fläche) plus 1–2 kontrastierende Sektionen als alternative Routen.
- Die Beute entscheidet, welche Route sinnvoll ist.
- Sektionen parametrisieren globale Systeme, sie bringen keine eigene Logik mit.

Geplante Map-Typen: Fracht-Dock (dunkel, Wachen in 2er-Teams), Rechenzentrum (Lüfterlärm maskiert Schritte, hohe Sensordichte), Penthouse-Galerie (hell, laute Böden, Glas, Lichtschalter, Schächte).

Spätere Option (nicht im Prototyp): mehrere Etagen, verbunden über Treppen, Leitern, Aufzüge, Schächte – Gewicht der Beute bestimmt, welche Verbindungen nutzbar sind.

## Gadgets (Wahrnehmung)

| Gadget | Zeigt | Schwäche |
|---|---|---|
| Wärmebild | Temperatur aller Entitäten, Kryoprobe-Zustand, Restwärme | Sieht nicht durch Glas (Glas ist im Infrarot undurchsichtig) |
| Nachtsicht | Dunkle Bereiche aufgehellt | Wird von hellen Lichtquellen geblendet |

Gadgets brauchen freie Hände (→ Konflikt mit Server-Block ist gewollt). Gegner-Wärmekameras nutzen dasselbe Thermal-System.

## Globale Systeme

- **Noise:** Geräuschereignisse mit Radius, Oberflächen- und Umgebungsmodifikator (Maskierung durch Lüfter).
- **Light:** Beleuchtungszonen, schaltbar. Bestimmt Sichtweite der Wachen UND was der Spieler in der Standardansicht sieht.
- **Thermal:** Jede Entität hat `temperature` (0–1). Wärmebild-Gadget und Wärmesensoren lesen denselben Wert. Glas blockiert Thermal-Sicht.
- **Sensors:** Kameras, Laser, Wärmekameras.
- **Guard AI:** Patrouille, Verdacht, Suche, Alarm. Paar-Verhalten (Takedown eines Partners alarmiert den anderen).

**Detection-Modell:** Wachen reagieren auf `wahrgenommen × verdächtig`, nicht nur auf `wahrgenommen`. Aktuell ist alles verdächtig – aber die Trennung bleibt, damit später Social-Stealth-Maps (öffentliche Räume, Kiste als Tarnung) möglich sind.

## Tech-Stack

- Vite + TypeScript (strict)
- Phaser 4 (Rendering, Input, Kamera, Tilemaps). Bewegung und Kollision rechnet die eigene Simulation, nicht Phaser-Physik.
- Tiled für Maps (JSON-Export)
- Licht/Sichtbarkeit über Phaser-Lighting bzw. eigene Maske; Gadget-Ansichten als WebGL-Kamera-Filter (Phaser 4 hat Post-FX-Pipelines durch Filter ersetzt)
- Vitest für die reine Spiellogik
- Kein React im Spiel. Später ggf. für Menüs/Debug-Overlay.

## Architektur-Regeln

- **Logik von Phaser trennen.** Systeme (Noise, Light, Thermal, Detection, Carry, Loot-Effekte) sind reine TS-Module ohne Phaser-Import und damit testbar. Phaser-Szenen verbinden sie nur mit Rendering und Input.
- **Netzwerkfähig bauen (Koop ist geplant).** Input wird in Commands übersetzt; Systeme ändern den Spielzustand ausschließlich über Commands. Der gesamte Spielzustand ist serialisierbar. Kein Spielzustand in Phaser-Objekten.
- **Datengetrieben.** Beuten, Gadgets, Map-Sektionen und Wachentypen sind Daten-Definitionen (TS-Objekte), keine Unterklassen.
- **Beute-Effekte als Modifikatoren.** Aufheben hängt Modifikatoren an den Spieler (z. B. `speedMultiplier`, `canSprint`, `handsFree`), Abstellen entfernt sie.
- **Events statt direkter Kopplung** zwischen Systemen (z. B. `noise:emitted`, `loot:damaged`).
- Keine Abstraktion auf Vorrat. Erst bauen, wenn der zweite Anwendungsfall da ist.

**Umsetzung von Commands und Zustand:**
- `GameState` in `src/systems/simulation.ts` ist reines, JSON-serialisierbares Datenobjekt.
- Er ändert sich nur über `Command`s (`applyCommand`) und `step`, der die Welt um einen festen Tick (60 Hz) weiterrechnet. Gleiche Commands ergeben auf jedem Host dasselbe Ergebnis.
- Die Szene übersetzt Input in Commands (nur bei Änderung, wie ein Netzwerk-Client), ruft `step` im festen Takt auf und zeichnet den Zustand.
- Das Level (`src/systems/level.ts`) wird direkt aus dem Tiled-JSON gelesen, ohne Phaser.
- Beuten sind Daten in `src/systems/loot.ts` (Name und Modifikatoren). Im Zustand liegt jede Beute mit Position und `carriedBy`; die Modifikatoren eines Spielers leitet `playerModifiers` aus der getragenen Beute ab. Aufheben und Abstellen sind Commands (`pickUp`, `drop`), die Simulation prüft Reichweite und freie Hände. Getragen wird genau eine Beute.
- Systeme koppeln über Events (`src/systems/events.ts`): `state.events` enthält, was im letzten Tick passiert ist. Reihenfolge pro Tick: Commands, Spielerbewegung mit Schrittgeräuschen, dann Wachen. Wachen lesen die Geräusche dieses Ticks und die Partner-Alarme (`guard:alerted`) des vorigen.
- Noise (`src/systems/noise.ts`): Schritte und abgestellte Beute erzeugen `noise:emitted` mit Radius. Die Geräuschzone an der Quelle skaliert Schritte mit `surface` und jedes Geräusch mit `1 - masking`.
- Wachen: Typen sind Daten in `src/systems/guardTypes.ts`, das Verhalten steckt in `src/systems/guards.ts`. Modi `patrol`, `investigate`, `search`, `alarm`. Sehen braucht Sichtkegel (oder Armlänge), Sichtlinie und Reichweite; im Dunkeln schrumpft sie auf `DARK_SIGHT` (30 %). Wahrgenommen × verdächtig (`suspiciousness`, derzeit immer 1) füllt `suspicion`, bei 1 gibt es Alarm. Wege plant A* auf dem Kachelraster (`src/systems/pathfinding.ts`).
- Sichtbarkeit ist aus Zustand und Level abgeleitet, kein eigener Zustand: `visibilityPolygon` (`src/systems/visibility.ts`) liefert, was von einem Punkt aus zu sehen ist. Die Szene legt eine Dunkelheitsschicht über die Karte und radiert Sichtfeld, Nahbereich und die gesehenen Teile der Lichtzonen heraus.

**Ordnerstruktur:**
- `src/systems/` – reine Spiellogik ohne Phaser, mit Vitest-Tests daneben (`*.test.ts`). Ein Test bricht ab, sobald hier Phaser importiert wird.
- `src/scenes/` – Phaser-Szenen: übersetzen Input in Commands und zeichnen den Spielzustand.
- `public/maps/` – Tiled-Maps (JSON, Tilesets eingebettet). Kollision über die Tile-Property `collides` im Layer `walls`, Spawnpunkte als Objekte im Layer `objects`. Beuten sind Punkt-Objekte vom Typ `loot` im Layer `objects` mit der string-Property `kind` (Schlüssel aus `LOOT`). Wachen sind Polylinien vom Typ `guard` im Layer `objects`: die Linie ist die Patrouillenroute, string-Properties `kind` (Schlüssel aus `GUARDS`) und optional `partner` (Name der anderen Wache). Lichtzonen sind Rechtecke im Layer `lights` mit der float-Property `brightness` (0–1); alles außerhalb ist dunkel. Geräuschzonen sind Rechtecke im Layer `noise` mit den float-Properties `surface` (Standard 1) und `masking` (Standard 0).
- `public/tilesets/` – Tileset-Bilder, gezeichnet wie unter voller Beleuchtung. Die Dunkelheit legt erst die Szene darüber.
- `deploy/` – Server-Konfiguration, Deploy-Anleitung und lokaler Nachbau des Servers.

## Assets

- Prototyp: Kenney-CC0-Top-down-Assets oder einfache Formen. Null Zeit in Grafik investieren.
- Nur ein Asset-Paket bzw. ein Stil gleichzeitig – konsistent vor hübsch.
- Finale Stilentscheidung erst nach Gate 1.

## Konventionen

- Code, Bezeichner, Commits: Englisch. Kommunikation mit mir: Deutsch.
- Kleine Schritte, nach jedem Schritt `npm run build` und `npm test` grün.
- Neue Dependencies nur nach Rückfrage.
- Immer die neuesten stabilen Versionen verwenden (npm-Pakete, Node, GitHub Actions). Nennt eine Spezifikation eine ältere Version, gilt trotzdem die neueste, und die Spezifikation wird angepasst.

## Roadmap

1. **Prototyp (solo).** Gate: Spielt sich dieselbe Map mit beiden Beuten spürbar anders? Wenn nein → Konzept überarbeiten.
2. **Vertical Slice (solo).** Eine polierte Map, 3–4 Beuten, finaler Stil. Gate: Test mit 3–5 Fremden – würden sie weiterspielen?
3. **Koop-Prototyp.** Symmetrisch, zwei Spieler, host-autoritativ. Beute-Regeln bekommen Koop-Varianten (z. B. Server-Block nur zu zweit tragbar). Gate: Ist es zu zweit besser als allein?
4. **Operator-Modus (asymmetrisch).** Ein Spieler als Drohnen-Operator mit Wärmebild-Feed, einer am Boden. Erst wenn 3 trägt.

## Meilenstein 1: Prototyp

**Umfang:**
- Map: Fracht-Dock (dunkel, verwinkelt, 2er-Wachen) plus eine helle Glassektion als Abkürzung zur Extraktion
- Beuten: Server-Block und Kryoprobe
- Gadget: Wärmebild
- Systeme: Bewegung, Carry, Light, Noise, Thermal, Guard AI mit Paaren, Extraktion, Fail-State

**Nicht im Umfang:** Menüs, Save-System, Sound-Assets, Nachtsicht, weitere Maps/Beuten, Etagen, Koop, Social Stealth, Waffen außer Takedown.

**Reihenfolge:**
1. Projekt-Setup, Command-Layer, Spieler bewegt sich top-down, Kollision mit Wänden, Testmap aus Tiled
2. Licht und Sichtbarkeit (dunkle Standardansicht, Lichtzonen, Sichtfeld des Spielers)
3. Carry-System + Server-Block
4. Noise-System + Guard AI (Patrouille, Hören, Sehen, Paare)
5. Thermal-System, Wärmebild-Gadget, Kryoprobe, Wärmekamera (inkl. Glas blockiert Thermal)
6. Extraktion, Fail-State, Debug-Overlay (Geräuschradien, Sichtkegel, Temperaturen)
