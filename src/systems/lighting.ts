import type { Level } from './level';
import type { Vector2 } from './movement';

/**
 * Brightness at a point: the brightest light zone containing it, 0 outside all zones.
 * Zones named in `off` are switched off and give no light.
 */
export function illuminationAt(level: Level, point: Vector2, off: readonly string[] = []): number {
  let brightness = 0;
  for (const zone of level.lights) {
    const inside =
      point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height;
    if (inside && zone.brightness > brightness && !off.includes(zone.name)) {
      brightness = zone.brightness;
    }
  }
  return brightness;
}
