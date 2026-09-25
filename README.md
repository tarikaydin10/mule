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

Steuerung: WASD.

## Maps

Maps liegen als Tiled-JSON in `public/maps/` und lassen sich direkt in [Tiled](https://www.mapeditor.org/) öffnen. Phaser liest nur eingebettete Tilesets, also neue Tilesets beim Anlegen einbetten. Wände kollidieren über die bool-Property `collides` am Tile. Der Spieler startet am Punkt-Objekt `player_spawn` im Layer `objects`.

## Deployment

Jeder Push auf `main` wird getestet, gebaut und auf den VPS deployt. Einrichtung: [deploy/README.md](deploy/README.md).
