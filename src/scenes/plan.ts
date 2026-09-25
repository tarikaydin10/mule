import * as Phaser from 'phaser';
import type { Level } from '../systems/level';
import type { Vector2 } from '../systems/movement';

/** Where the site plan sits on screen: `scale` screen px per world px, top-left at (x, y). */
export interface PlanLayout {
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fits the whole level into the box, centred, keeping its proportions. */
export function planLayout(level: Level, box: { x: number; y: number; width: number; height: number }): PlanLayout {
  const worldWidth = level.width * level.tileSize;
  const worldHeight = level.height * level.tileSize;
  const scale = Math.min(box.width / worldWidth, box.height / worldHeight);
  const width = worldWidth * scale;
  const height = worldHeight * scale;
  return { scale, x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

export function toPlan(layout: PlanLayout, point: Vector2): Vector2 {
  return { x: layout.x + point.x * layout.scale, y: layout.y + point.y * layout.scale };
}

/**
 * Draws the site plan from the level itself: floor dark, walls light, glass blue, lit zones
 * faintly yellow, the extraction green. No second data format: the collision layer is the plan.
 */
export function drawPlan(g: Phaser.GameObjects.Graphics, level: Level, layout: PlanLayout, zonesOff: readonly string[]): void {
  const t = level.tileSize * layout.scale;
  g.fillStyle(0x14171b, 1).fillRect(layout.x, layout.y, layout.width, layout.height);
  for (const zone of level.lights) {
    if (!zonesOff.includes(zone.name)) {
      const p = toPlan(layout, zone);
      g.fillStyle(0xf0d060, 0.1 + 0.25 * zone.brightness).fillRect(p.x, p.y, zone.width * layout.scale, zone.height * layout.scale);
    }
  }
  // Runs of solid tiles per row become one rectangle each.
  for (let row = 0; row < level.height; row++) {
    let start = -1;
    let glassRun = false;
    for (let col = 0; col <= level.width; col++) {
      const index = row * level.width + col;
      const solid = col < level.width && level.solid[index] === true;
      const glass = solid && level.glass[index] === true;
      if (start >= 0 && (!solid || glass !== glassRun)) {
        g.fillStyle(glassRun ? 0x7fc8e6 : 0x8a9099, glassRun ? 0.9 : 0.85).fillRect(
          layout.x + start * t,
          layout.y + row * t,
          (col - start) * t,
          t,
        );
        start = -1;
      }
      if (solid && start < 0) {
        start = col;
        glassRun = glass;
      }
    }
  }
  if (level.extraction) {
    const p = toPlan(layout, level.extraction);
    g.fillStyle(0x5fd08a, 0.35).fillRect(p.x, p.y, level.extraction.width * layout.scale, level.extraction.height * layout.scale);
    g.lineStyle(1, 0x5fd08a, 1).strokeRect(p.x, p.y, level.extraction.width * layout.scale, level.extraction.height * layout.scale);
  }
}
