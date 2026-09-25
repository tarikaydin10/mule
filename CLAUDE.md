# MULE

Top-down Stealth-Heist im Wärmebild-Look. Der Spieler stiehlt Objekte – und die Beute verändert, wie er sich bewegt und was er kann. Das Tragen ist der Kern, nicht das Stehlen.

## Design-Säulen

1. **Die Beute verändert die Regeln.** Jede Beute hat genau eine dominante Regel auf einer eigenen Achse, dazu optional realistische Nebeneigenschaften.
2. **Map-Regel × Beute-Regel.** Maps und Beuten sind nicht handgebaut kombiniert, sondern über globale Systeme parametrisiert. Jede Kombination macht andere Taktiken leicht oder schwer.
3. **Wärmebild ist Mechanik, nicht nur Optik.** Temperatur ist ein Spielwert: Er bestimmt, wie etwas gerendert wird UND ob Wärmesensoren es erfassen. Eine Quelle der Wahrheit.

## Beute-Archetypen (Achsen)

| Beute | Dominante Achse | Regel |
|---|---|---|
| Server-Block | Hände | Beidhändig: keine Gadgets/Takedowns, langsamer. Abstellen/Aufheben möglich. |
| Kryoprobe | Zeit/Wärme | Startet kalt (im Wärmebild unsichtbar), taut auf, wird heller → Wärmekameras erfassen sie. Voll aufgetaut = Beute verloren. |
| Peilsender | Signal | Pingt periodisch, Ping ist ein Geräuschereignis, das Wachen anlockt. |
| Artefakt | Bewegung | Stöße/Sprinten/Türen treten reduzieren Integrität. Wert skaliert mit Integrität. |

Nebeneigenschaften (z. B. Sprengkopf leicht erschütterungsempfindlich) sind erlaubt, dürfen aber die dominante Achse einer anderen Beute nicht dominieren.

## Maps

- Eine dominante Regel (~60–70 % der Fläche) plus 1–2 kontrastierende Sektionen als alternative Routen.
- Die Beute entscheidet, welche Route sinnvoll ist.
- Sektionen parametrisieren globale Systeme, sie bringen keine eigene Logik mit.

Geplante Map-Typen: Fracht-Dock (dunkel, Wachen in 2er-Teams), Rechenzentrum (Lüfterlärm maskiert Schritte, hohe Sensordichte), Penthouse-Galerie (hell, laute Böden, Lichtschalter, Schächte).

## Globale Systeme

- **Noise:** Geräuschereignisse mit Radius, Oberflächen- und Umgebungsmodifikator (Maskierung durch Lüfter).
- **Light:** Beleuchtungszonen, schaltbar. Beeinflusst Sichtweite der Wachen.
- **Thermal:** Jede Entität hat `temperature` (0–1). Rendering + Wärmesensoren lesen denselben Wert. Umsetzung: Alles wird in dem Grauwert seiner Temperatur gezeichnet (`temperatureTint`), der Kamera-Filter macht daraus das Wärmebild. Tileset-Grafiken sind deshalb nahezu weiß und tragen nur Struktur.
- **Sensors:** Kameras, Laser, Wärmekameras.
- **Guard AI:** Patrouille, Verdacht, Suche, Alarm. Paar-Verhalten (Takedown eines Partners alarmiert den anderen).

**Detection-Modell:** Wachen reagieren auf `wahrgenommen × verdächtig`, nicht nur auf `wahrgenommen`. Aktuell ist alles verdächtig – aber die Trennung bleibt, damit später Social-Stealth-Maps (öffentliche Räume, Kiste als Tarnung) möglich sind.

## Tech-Stack

- Vite + TypeScript (strict)
- Phaser 4 (Rendering, Input, Kamera, Arcade Physics, Tilemaps)
- Tiled für Maps (JSON-Export)
- Wärmebild-Look als WebGL-Kamera-Filter (Phaser-4-Filter mit eigenem Shader; Graustufen aus Temperatur, Rauschen, leichter Bloom, White-Hot/Black-Hot umschaltbar)
- Vitest für die reine Spiellogik
- Kein React im Spiel. Später ggf. für Menüs/Debug-Overlay.

## Architektur-Regeln

- **Logik von Phaser trennen.** Systeme (Noise, Thermal, Detection, Carry, Loot-Effekte) sind reine TS-Module ohne Phaser-Import und damit testbar. Phaser-Szenen verbinden sie nur mit Rendering und Input.
- **Datengetrieben.** Beuten, Map-Sektionen und Wachentypen sind Daten-Definitionen (TS-Objekte), keine Unterklassen.
- **Beute-Effekte als Modifikatoren.** Aufheben hängt Modifikatoren an den Spieler (z. B. `speedMultiplier`, `canSprint`, `handsFree`), Abstellen entfernt sie.
- **Events statt direkter Kopplung** zwischen Systemen (z. B. `noise:emitted`, `loot:damaged`).
- Keine Abstraktion auf Vorrat. Erst bauen, wenn der zweite Anwendungsfall da ist.

**Ordnerstruktur:**
- `src/systems/` – reine Spiellogik ohne Phaser, mit Vitest-Tests daneben (`*.test.ts`). Ein Test bricht ab, sobald hier Phaser importiert wird.
- `src/scenes/` – Phaser-Szenen: verbinden Systeme mit Rendering, Physik und Input.
- `src/render/` – Rendering-Bausteine für Phaser, z. B. der Wärmebild-Filter mit seinem Shader.
- `public/maps/` – Tiled-Maps (JSON, Tilesets eingebettet). Kollision über die Tile-Property `collides`, Spawnpunkte als Objekte im Layer `objects`. Jede Kachel braucht die Property `temperature` (0–1), Wärmequellen sind Objekte vom Typ `heat_source` mit `temperature`.
- `public/tilesets/` – Tileset-Bilder.
- `deploy/` – Server-Konfiguration und Deploy-Anleitung.

## Konventionen

- Code, Bezeichner, Commits: Englisch. Kommunikation mit mir: Deutsch.
- Kleine Schritte, nach jedem Schritt `npm run build` und `npm test` grün.
- Neue Dependencies nur nach Rückfrage.
- Immer die neuesten stabilen Versionen verwenden (npm-Pakete, Node, GitHub Actions). Nennt eine Spezifikation eine ältere Version, gilt trotzdem die neueste, und die Spezifikation wird angepasst.
- Platzhaltergrafik (Rechtecke, Kreise) ist ausdrücklich okay. Der Wärmebild-Filter macht den Look.

## Meilenstein 1: Prototyp

**Ziel:** Beweisen, dass sich dieselbe Map mit zwei Beuten spürbar anders spielt. Wenn nicht, hilft kein weiterer Content.

**Umfang:**
- Map: Fracht-Dock (dunkel, verwinkelt, 2er-Wachen) plus eine helle Glassektion als Abkürzung zur Extraktion
- Beuten: Server-Block und Kryoprobe
- Systeme: Bewegung, Carry, Noise, Thermal (Rendering + eine Wärmekamera), Guard AI mit Paaren, Extraktion, Fail-State

**Nicht im Umfang:** Menüs, Save-System, Sound-Assets, weitere Maps/Beuten, Social Stealth, Waffen außer Takedown.

**Reihenfolge:**
1. Projekt-Setup, Spieler bewegt sich top-down, Kollision mit Wänden, Testmap aus Tiled
2. Wärmebild-Filter (früh, weil er die Identität ist und Lesbarkeit getestet werden muss)
3. Carry-System + Server-Block
4. Noise-System + Guard AI (Patrouille, Hören, Sehen, Paare)
5. Kryoprobe + Wärmekamera
6. Extraktion, Fail-State, Debug-Overlay (Geräuschradien, Sichtkegel, Temperaturen)
