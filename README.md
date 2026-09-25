# MULE

Top-down Stealth-Heist im Wärmebild-Look. Design, Architektur und Konventionen stehen in [CLAUDE.md](CLAUDE.md).

## Entwicklung

Node siehe `.nvmrc`.

```sh
npm install
npm run dev     # Dev-Server, ?debug in der URL zeigt die Physik-Hitboxen
npm test        # Vitest, reine Spiellogik in src/systems
npm run build   # Typecheck + Produktions-Build nach dist/
```

Steuerung: WASD bewegt, T schaltet das Wärmebild zwischen White-Hot und Black-Hot um.

## Maps

Maps liegen als Tiled-JSON in `public/maps/` und lassen sich direkt in [Tiled](https://www.mapeditor.org/) öffnen. Phaser liest nur eingebettete Tilesets, also neue Tilesets beim Anlegen einbetten. Wände kollidieren über die bool-Property `collides` am Tile. Der Spieler startet am Punkt-Objekt `player_spawn` im Layer `objects`. Jede Kachel braucht die float-Property `temperature` zwischen 0 und 1, sonst bricht das Spiel mit einer Meldung ab. Wärmequellen sind Rechteck-Objekte vom Typ `heat_source` mit derselben Property.

## Vor dem Deploy testen

Drei Stufen, jede näher am Server:

1. **Spielen während der Entwicklung:** `npm run dev`, dann <http://localhost:5173>. Änderungen erscheinen sofort, `?debug` zeigt die Hitboxen.
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
