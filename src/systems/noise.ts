import type { Level } from './level';
import type { Vector2 } from './movement';

export const FOOTSTEP_RADIUS = 110; // px, walking
export const FOOTSTEP_INTERVAL_TICKS = 18; // about three steps per second

/** Footsteps depend on the floor; impacts, like loot hitting the ground, do not. */
export type NoiseKind = 'footstep' | 'impact';

/**
 * How far a noise made at `at` carries. The noise zone there scales footsteps by its
 * `surface` factor (loud floors) and every noise by (1 - `masking`) (fans drowning it out).
 * A zone named in `off` is switched off, like fans that stand still, and changes nothing.
 */
export function noiseRadius(
  level: Level,
  at: Vector2,
  baseRadius: number,
  kind: NoiseKind,
  off: readonly string[] = [],
): number {
  const zone = level.noiseZones.find(
    (z) => !off.includes(z.name) && at.x >= z.x && at.x <= z.x + z.width && at.y >= z.y && at.y <= z.y + z.height,
  );
  if (!zone) {
    return baseRadius;
  }
  return baseRadius * (kind === 'footstep' ? zone.surface : 1) * (1 - zone.masking);
}

export function canHear(listener: Vector2, noise: { x: number; y: number; radius: number }, hearing: number): boolean {
  return Math.hypot(noise.x - listener.x, noise.y - listener.y) <= noise.radius * hearing;
}
