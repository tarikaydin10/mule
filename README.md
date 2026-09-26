# MULE

Top-down Stealth-Heist im Wärmebild-Look. Design, Architektur und Konventionen stehen in [CLAUDE.md](CLAUDE.md).

## Entwicklung

Node siehe `.nvmrc`.

```sh
npm install
npm run dev     # Dev-Server
npm test        # Vitest, reine Spiellogik in src/systems
npm run build   # Typecheck + Produktions-Build nach dist/
```

Vor dem Lauf zeigt ein Briefing Auftrag, Ziele mit Ort und Wert und den Lageplan; Enter startet. Tab öffnet die Karte, Ziele sind im Spiel immer markiert, Objekte in Sichtweite tragen ihren Namen (`docs/demo.md`). Steuerung: WASD bewegt, Shift schleicht (halbes Tempo, lautlos, außer auf Gitterrost), E meint, was vor dem Spieler liegt: Beute aufheben oder abstellen, Schalter umlegen, Versteck betreten oder verlassen. Q schlägt eine Wache nieder, die einem den Rücken zudreht (freie Hände), Leertaste wirft einen von drei Bolzen in Laufrichtung, der sechs Kacheln weiter Lärm macht. T schaltet das Wärmebild ein und aus (nur mit freien Händen), F verschwindet aus der grünen Extraktionszone mit aller Beute, die dort liegt oder getragen wird. R startet neu. Debug: O zeigt das Overlay mit Sichtkegeln, Wegen, Geräuschradien, Zonen und Temperaturen; für den Gate-Test starten 1 (Server-Block) und 2 (Kryoprobe) mit nur einer Beute-Art und fixiertem Zufall, 0 wieder mit allen und neuem Seed. `?map=testmap` lädt die kleine Testmap statt Pier 9.

## Maps

Maps liegen als Tiled-JSON in `public/maps/` und lassen sich direkt in [Tiled](https://www.mapeditor.org/) öffnen. Phaser liest nur eingebettete Tilesets, also neue Tilesets beim Anlegen einbetten. Wände kollidieren über die bool-Property `collides` am Tile im Layer `walls`. Der Spieler startet am Punkt-Objekt `player_spawn` im Layer `objects`. Beute ist ein Punkt-Objekt vom Typ `loot` im Layer `objects`, mit der string-Property `kind`, zum Beispiel `serverBlock`. Wachen sind Polylinien vom Typ `guard`: Die Linie ist ihre Patrouillenroute, `kind` nennt den Wachentyp, zum Beispiel `dockGuard`, und `partner` optional den Namen der anderen Wache im Paar. Die Extraktion ist ein Rechteck-Objekt vom Typ `extraction`. Wärmekameras sind Punkt-Objekte vom Typ `thermalCamera` mit `angle` in Grad, optional `fov` und `range`. Glas ist eine Wandkachel mit der bool-Property `glass`: Man sieht hindurch, Wärme geht nicht durch. Beleuchtete Bereiche sind Rechtecke im Objekt-Layer `lights` mit der float-Property `brightness` zwischen 0 und 1. Alles außerhalb ist dunkel, und der Spieler sieht dort nur, was in Sichtlinie und nah bei ihm liegt. Geräuschzonen sind Rechtecke im Objekt-Layer `noise`: `surface` über 1 macht Schritte lauter, etwa auf Gitterböden, und `masking` zwischen 0 und 1 schluckt Geräusche, etwa durch Lüfter.

## Vor dem Deploy testen

Drei Stufen, jede näher am Server:

1. **Spielen während der Entwicklung:** `npm run dev`, dann <http://localhost:5173>. Änderungen erscheinen sofort.
2. **Das fertige Build:** `npm run build`, dann `npm run preview` und <http://localhost:4173>. Genau die Dateien, die auf den Server gehen.
3. **Wie auf dem Server:** Mit Docker liefert derselbe Caddy mit derselben Site-Datei das Build aus, inklusive Header und Cache-Regeln.

   ```sh
   npm run build
   docker compose -f deploy/local/compose.yml up
   ```

   Dann <http://localhost:8080>. Ein neues `npm run build` ist ohne Neustart sofort sichtbar, beenden mit Strg+C.

Zusätzlich laufen Tests und Build bei jedem Push auf jeden Branch in GitHub Actions. Deployt wird nur `main`.

## Deployment

Jeder Push auf `main` wird getestet, gebaut und auf die Hetzner-CX23 hinter den Edge-Caddy deployt. Einrichtung: [deploy/README.md](deploy/README.md).
