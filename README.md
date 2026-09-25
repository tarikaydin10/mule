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

Steuerung: WASD.

## Maps

Maps liegen als Tiled-JSON in `public/maps/` und lassen sich direkt in [Tiled](https://www.mapeditor.org/) öffnen. Phaser liest nur eingebettete Tilesets, also neue Tilesets beim Anlegen einbetten. Wände kollidieren über die bool-Property `collides` am Tile im Layer `walls`. Der Spieler startet am Punkt-Objekt `player_spawn` im Layer `objects`. Beleuchtete Bereiche sind Rechtecke im Objekt-Layer `lights` mit der float-Property `brightness` zwischen 0 und 1. Alles außerhalb ist dunkel, und der Spieler sieht dort nur, was in Sichtlinie und nah bei ihm liegt.

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
