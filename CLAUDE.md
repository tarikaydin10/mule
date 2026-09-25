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

## Missionsstruktur

- **Briefing (minimal):** Ein Auftrag, mehrere mögliche Ziele mit unterschiedlichem Wert, Ausrüstungswahl. Keine Festlegung auf eine Beute.
- **Vor Ort:** Alle Ziele liegen auf der Map. Der Spieler entscheidet mit echten Informationen, kann sich umentscheiden (Beute abstellen, andere nehmen) oder gierig werden (mehrere Beuten = Nachteile stapeln sich oder mehrere Gänge).
- **Belohnung balanciert die Wahl:** Die schwierigere Beute muss spürbar mehr wert sein, sonst wird die leichte zur einzigen Wahl.
- **Ausrüstung vor, Beute nach dem Briefing ist gewollt:** Die Ausrüstungswahl ist eine Wette auf die spätere Entscheidung.
- **Hinweise (später, ab Vertical Slice):** Optional auffindbare Informationen (belauschte Gespräche, Wartungspläne). Sie liefern Informationen, keine Lösungen, und sind nie Pflicht.

## Spieler-Verben

Bewegen und Aufheben reichen nicht für eine reife Umgebung. Vier Werkzeuge, jedes mit Preis, alle über die globalen Systeme abgebildet. `E` ist die eine Interaktionstaste und meint, was gerade vor dem Spieler liegt.

| Verb | Bedingung | Wirkung | Preis |
|---|---|---|---|
| Takedown (`Q`) | freie Hände, Wache von hinten, außerhalb ihres Sichtkegels | Wache liegt am Boden | Partner geht in Alarm; jede Wache, die die liegende sieht, ebenso |
| Wurf (`Leertaste`) | freie Hände, 3 Bolzen pro Lauf | Geräusch 6 Kacheln in Laufrichtung, Radius 5 Kacheln | die nächste Wache geht nachsehen, Bolzen ist weg |
| Verstecken (`E` am Versteck) | Versteck in Reichweite | für Augen unsichtbar, keine Bewegung, Verlassen dauert 0,5 s | Metall ist kein Glas: warme Beute im Versteck sehen Wärmekameras trotzdem |
| Schalten (`E` am Schalter) | Schalter in Reichweite | Licht- oder Geräuschzone aus oder an | Klack-Geräusch am Schalter; benannte Wachen kommen nachsehen |

Konsistenzregel: Jede Interaktion zeigt vorher in der Hinweiszeile, was passiert, und nachher in der Welt, was passiert ist.

## Gadgets (Wahrnehmung)

| Gadget | Zeigt | Schwäche |
|---|---|---|
| Wärmebild | Temperatur aller Entitäten, Kryoprobe-Zustand, Restwärme | Sieht nicht durch Glas (Glas ist im Infrarot undurchsichtig) |
| Nachtsicht | Dunkle Bereiche aufgehellt | Wird von hellen Lichtquellen geblendet |

Gadgets brauchen freie Hände (→ Konflikt mit Server-Block ist gewollt). Gegner-Wärmekameras nutzen dasselbe Thermal-System.

## Globale Systeme

- **Noise:** Geräuschereignisse mit Radius, Oberflächen- und Umgebungsmodifikator (Maskierung durch Lüfter).
- **Light:** Beleuchtungszonen, schaltbar über Schalter-Objekte. Bestimmt Sichtweite der Wachen UND was der Spieler in der Standardansicht sieht.
- **Thermal:** Jede Entität hat `temperature` (0–1). Wärmebild-Gadget und Wärmesensoren lesen denselben Wert. Glas blockiert Thermal-Sicht.
- **Sensors:** Kameras, Laser, Wärmekameras.
- **Guard AI:** Patrouille, Posten, Verdacht, Suche, Alarm, wachsam, am Boden. Paare laufen versetzt auf derselben Route und halten an Plauderpunkten an. Paar-Verhalten (Takedown eines Partners alarmiert den anderen). Nach einer Suche ohne Fund bleibt eine Wache 60 s wachsam (weiterer Kegel, schnellerer Verdacht) und kehrt an einen zufälligen Punkt ihrer Runde zurück. Alarm ist Jagd, nicht Ende: Sichtlinie 4 s gebrochen führt in die Suche.

**Detection-Modell:** Wachen reagieren auf `wahrgenommen × verdächtig`, nicht nur auf `wahrgenommen`. Aktuell ist alles verdächtig – aber die Trennung bleibt, damit später Social-Stealth-Maps (öffentliche Räume, Kiste als Tarnung) möglich sind.

**Fairness-Regeln** (Vertrag zwischen Map und Spieler, jede Stufe wird dagegen getestet): sichtbar, bevor gefährlich · Entdeckung dauert auf Distanz mindestens 1 s · Alarm hat einen Ausgang · kein Raum ohne zweiten Ausgang (Ausnahme: Taschen mit Versteck) · jeder Weg für jede Beute, die Map setzt Preise, keine Verbote · Werkzeuge haben Preise · die Welt erklärt sich selbst: Objekte tragen ihren Namen, Ziele sind markiert, Tasten stehen nur im Briefing und in der Hinweiszeile.

**Demo-Prinzip** (`docs/demo.md`): Das Spiel wird vom ersten Erlebnis her gebaut, nicht von der Raumtabelle. In jeder Sekunde weiß der Spieler, wo er ist, was er will und was er hier tun kann. Erst das Drehbuch der ersten drei Minuten, dann die Map dazu.

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
- Rundenende: `state.outcome` ist `null`, solange die Runde läuft. `extract` in der Extraktionszone beendet sie als `escaped` mit der gesicherten Beute (liegt in der Zone oder wird dort getragen) und ihrem Wert, eine Wache im Alarm in `CATCH_DISTANCE` als `caught`. Danach ändert `step` nichts mehr. Mehrere Gänge sind möglich: Beute in der Zone ablegen, weitere holen.
- Debug-Schalter für das Gate: `createGameState(..., { onlyLoot })` spawnt nur eine Beute-Art; im Spiel die Tasten 1, 2 … (0: alle).
- Debug-Overlay (Taste O): Sichtkegel und Wege der Wachen mit Modus, Verdacht und Temperatur, Wärmekameras mit Erfassungsstand, Geräuschradien der letzten Sekunde, Temperaturen von Spieler und Beute, Licht- und Geräuschzonen. Es zeichnet über der Dunkelheit und ungefiltert.
- Zufall pro Lauf: `state.seed` ist Teil des Zustands (Koop: auf allen Hosts gleich), `src/systems/random.ts` liefert daraus deterministische Zahlen. Gezogen werden der Platz jeder Beute-Gruppe, der Plauderpunkt jedes Paars und Umwege von Wachen. `createGameState(..., { fixed: true })` (Taste 1/2/0 im Spiel) fixiert alles auf die erste Variante für den Gate-Test.
- Schaltbare Zonen: `state.zones` hält je Zonenname, ob sie an ist. `illuminationAt` und `noiseRadius` nehmen die abgeschalteten Zonen entgegen. Schalter sind Objekte, Command `toggleSwitch`.
- Verstecke: `player.hidden` ist die Id des Versteck-Objekts oder `null`. Versteckte Spieler stehen auf dem Versteck, bewegen sich nicht, sind für Wachen kein Ziel und werden nicht gefangen (ein Versteck beendet jede Jagd); getragene Beute bleibt für Wärmekameras sichtbar. Command `hide` betritt oder verlässt; nach dem Verlassen vergehen `HIDE_EXIT_TICKS` (0,5 s), bevor der Spieler wieder läuft. Aufheben, Abstellen, Werfen und Schalten gehen nicht aus dem Versteck.
- Wurf: Command `throw` mit Richtung (die Szene schickt die letzte Laufrichtung); der Bolzen landet 6 Kacheln entfernt oder kurz vor der ersten Wand und erzeugt `noise:emitted` mit 5 Kacheln Radius (Geräuschzone am Landepunkt gilt). `player.bolts` zählt von 3 herunter. Braucht freie Hände.
- Takedown: Command `takedown`; Wache in `TAKEDOWN_REACH`, Spieler außerhalb ihres Sichtkegels (`inViewCone`), freie Hände. Die Wache geht in `down`, Event `guard:alerted` mit `alarm` für den Partner, dazu ein kleines Geräusch. Liegende Wachen sind Ziele für `sightStrength` anderer Wachen; ein Fund alarmiert die findende Wache. Damit das Anschleichen möglich ist, bemerken Wachen auf Armlänge alles außer direkt hinter sich (Blindwinkel 90°).
- Die eine Interaktionstaste: Die Szene fragt in dieser Reihenfolge, was `E` gerade tut: Versteck verlassen · Beute aufheben (freie Hände) · Schalter · Versteck betreten · Beute abstellen. Die Simulation prüft jeden Command noch einmal selbst.
- Schalter machen ein Klack (`SWITCH_NOISE_RADIUS`) in der Welt, wie sie nach dem Schalten klingt: Der Knall des Kompressor-Schalters ist nicht mehr maskiert. Die Szene zeichnet abgeschaltete Lichtzonen dunkel und den Schalter grau.
- Map-Auswahl: `?map=pier9` (Standard) oder `?map=testmap`. Schilder sind Objekte vom Typ `sign`, ihr Name ist der Text.
- Affordance (`docs/demo.md`): Die Map trägt ihr Briefing als Map-Property `briefing`; Beuten die string-Property `place` (Ort für das Briefing), Verstecke und Schalter `label` (Name für den Spieler, sonst der Objektname). Die Szene zeigt vor dem Lauf das Briefing mit Lageplan (Kollisionsschicht klein gezeichnet, Du, Van, Ziele), auf Tab die Karte, im Spiel Zielmarker mit Pfeilen am Bildschirmrand und Entfernung, Namen an sichtbaren Objekten und Sätze in der Statuszeile als Antwort auf Ereignisse.
- Thermal (`src/systems/thermal.ts`): Temperaturen 0–1 stehen in den Daten (Wachentypen, Beuten) bzw. im Zustand (Beute, Wärmespuren). Annahme: Der Anzug des Spielers maskiert Körperwärme (`PLAYER_TEMPERATURE` 0,25), Wärmekameras reagieren ab `THERMAL_DETECTION` 0,5 – sonst sähen sie den Spieler immer und die Kryoprobe-Regel liefe ins Leere. Die Kryoprobe taut ab dem ersten Aufheben auf und geht bei 1 verloren (`loot:lost`). Schritte hinterlassen Restwärme unter der Schwelle.
- Wärmekameras (`src/systems/sensors.ts`) sehen Spieler, Beute und Spuren über der Schwelle im Kegel mit Wärme-Sichtlinie (nicht durch Glas), nicht aber Wachen; nach etwa 0,5 s gibt es `sensor:alarm`, alle Wachen gehen in Alarm.
- Wärmebild-Gadget: `thermalVision` im Spielerzustand, Command `toggleThermal` nur mit freien Händen; beidhändige Beute schaltet es aus. Die Szene färbt dann alles in den Grauwert seiner Temperatur und aktiviert den Kamera-Filter (`src/render/`). Texte zeichnet eine zweite Kamera ohne Filter.
- Sichtbarkeit ist aus Zustand und Level abgeleitet, kein eigener Zustand: `visibilityPolygon` (`src/systems/visibility.ts`) liefert, was von einem Punkt aus zu sehen ist. Die Szene legt eine Dunkelheitsschicht über die Karte und radiert Sichtfeld, Nahbereich und die gesehenen Teile der Lichtzonen heraus.

**Ordnerstruktur:**
- `src/systems/` – reine Spiellogik ohne Phaser, mit Vitest-Tests daneben (`*.test.ts`). Ein Test bricht ab, sobald hier Phaser importiert wird.
- `src/scenes/` – Phaser-Szenen: übersetzen Input in Commands und zeichnen den Spielzustand.
- `src/render/` – Rendering-Bausteine für Phaser, z. B. der Wärmebild-Filter mit seinem Shader.
- `docs/` – Konzepte, z. B. `docs/pier9.md` für die erste richtige Map.
- `scripts/` – Generatoren: `make-tileset.mjs` (Platzhalter-Tileset) und `make-pier9.mjs` (erster Entwurf der Map; danach ist die Tiled-Datei die Quelle).
- `public/maps/` – Tiled-Maps (JSON, Tilesets eingebettet). Kollision über die Tile-Property `collides` im Layer `walls`; Glas-Kacheln haben zusätzlich `glass` (Licht und Sicht gehen durch, Wärme nicht; `blocksSight(..., 'light' | 'heat')`), Spawnpunkte als Objekte im Layer `objects`. Beuten sind Punkt-Objekte vom Typ `loot` im Layer `objects` mit der string-Property `kind` (Schlüssel aus `LOOT`); optional `group` und `variant`: aus jeder Gruppe wird pro Lauf eine Variante gezogen (`fixed`: die alphabetisch erste). Verstecke sind Objekte vom Typ `hideSpot`, Schalter vom Typ `switch` mit `target` (Zonenname), optional `alerts` (Wachennamen, kommagetrennt), Schilder vom Typ `sign`. Die Extraktion ist ein Rechteck vom Typ `extraction` im Layer `objects` (höchstens eines). Wärmekameras sind Punkt-Objekte vom Typ `thermalCamera` mit den float-Properties `angle` (Grad, 0 = rechts, 90 = unten), optional `fov` (Grad, Standard 70) und `range` (px, Standard 280). Wachen sind Polylinien vom Typ `guard` im Layer `objects`: die Linie ist die Patrouillenroute, string-Properties `kind` (Schlüssel aus `GUARDS`) und optional `partner` (Name der anderen Wache), `wait` (`index:sekunden;…`, Halt an Routenpunkten), `chat` (`index,index`: pro Lauf wird ein Plauderpunkt gezogen, 6 s). Ein Punkt-Objekt vom Typ `guard` ist ein Posten: `facing` (Grad) und `sweep` (Grad, Standard 120). Polylinien vom Typ `detour` mit `guard` (Name) und `after` (Routenindex) sind Umwege, die die Wache pro Runde mit 50 % nimmt. Lichtzonen sind Rechtecke im Layer `lights` mit der float-Property `brightness` (0–1); alles außerhalb ist dunkel. Geräuschzonen sind Rechtecke im Layer `noise` mit den float-Properties `surface` (Standard 1) und `masking` (Standard 0). Zonen mit Namen sind über Schalter schaltbar.
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
- Map: Fracht-Dock „Pier 9“ (Konzept in `docs/pier9.md`): dunkel, verwinkelt, 2er-Wachen, drei Rückwege, davon einer eine helle Glasgalerie als Abkürzung zur Extraktion
- Beuten: Server-Block und Kryoprobe, beide gleichzeitig auf der Map, je zwei mögliche Plätze pro Lauf, Spieler wählt vor Ort. Dazu Nebenbeute ohne Regel (Frachtpapiere, Zollkasse)
- Spieler-Verben: Takedown, Wurf, Verstecken, Schalten (siehe oben)
- Beute-Wert pro Ziel (einfacher Zahlenwert, am Ende angezeigt)
- Demo-Affordance: Briefing mit Lageplan, Karte, Zielmarker, Namen an Objekten, Statuszeile mit Antworten (`docs/demo.md`)
- Debug-Schalter: nur eine der beiden Beuten spawnen (nötig, um das Gate sauber zu testen)
- Gadget: Wärmebild (feste Ausrüstung, keine Auswahl)
- Systeme: Bewegung, Carry, Light, Noise, Thermal, Guard AI mit Paaren, Extraktion, Fail-State

**Nicht im Umfang:** Ausrüstungswahl, Hinweise, Menüs, Save-System, Sound-Assets, Nachtsicht, weitere Maps/Beuten, Etagen, Türen, Sprinten, Verkleidung, Wegtragen von Wachen, Koop, Social Stealth, Waffen außer Takedown.

**Reihenfolge:**
1. Projekt-Setup, Command-Layer, Spieler bewegt sich top-down, Kollision mit Wänden, Testmap aus Tiled
2. Licht und Sichtbarkeit (dunkle Standardansicht, Lichtzonen, Sichtfeld des Spielers)
3. Carry-System + Server-Block
4. Noise-System + Guard AI (Patrouille, Hören, Sehen, Paare)
5. Thermal-System, Wärmebild-Gadget, Kryoprobe, Wärmekamera (inkl. Glas blockiert Thermal)
6. Extraktion, Fail-State, Beute-Wert-Anzeige, Debug-Overlay (Geräuschradien, Sichtkegel, Temperaturen), Debug-Schalter für Beuten-Spawn

Schritte 1–6 sind auf der Testmap umgesetzt. Danach Pier 9 in sechs Stufen (`docs/pier9.md`): Rohbau und Netz · Wachen mit Gewohnheiten · Sensorik und Zonen · Verben · Zufall und Feinschliff mit Gate-Test · nach dem Gate: Alarmstufe, hörbare Wachenschritte. Stand: Stufen 1–4 gebaut, Seed und Debug-Fixierung aus Stufe 5 ebenfalls. Vor dem Gate kommt die Demo (`docs/demo.md`): D1 Affordance-Schicht, D2 kompakte Demo-Map aus dem Drehbuch, D3 Feinschliff. Die Testmap hat zum Ausprobieren ein Versteck (`crate`) und zwei Schalter neben dem Spawn.
