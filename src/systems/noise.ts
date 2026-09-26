import type { Level } from './level';
import type { Vector2 } from './movement';

export const FOOTSTEP_RADIUS = 110; // px, walking
export const FOOTSTEP_INTERVAL_TICKS = 18; // about three steps per second
// Sneaking: half the speed, and silent on a plain floor. A loud floor still gives it away:
// a sneaking step there carries by how much louder the floor is than a plain one.
export const SNEAK_SPEED_FACTOR = 0.5;

/**
 * Footsteps depend on the floor, sneaking steps only on loud floors; impacts, like loot
 * hitting the ground, do not depend on it.
 */
export type NoiseKind = 'footstep' | 'sneak' | 'impact';

/**
 * How far a noise made at `at` carries. The noise zone there scales footsteps by its
 * `surface` factor (loud floors), sneaking steps by (`surface` - 1), and every noise by
 * (1 - `masking`) (fans drowning it out). A zone named in `off` is switched off, like fans
 * that stand still, and changes nothing. Returns 0 for a noise nobody could hear.
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
    return kind === 'sneak' ? 0 : baseRadius;
  }
  const floor = kind === 'footstep' ? zone.surface : kind === 'sneak' ? Math.max(0, zone.surface - 1) : 1;
  return baseRadius * floor * (1 - zone.masking);
}

export function canHear(listener: Vector2, noise: { x: number; y: number; radius: number }, hearing: number): boolean {
  return Math.hypot(noise.x - listener.x, noise.y - listener.y) <= noise.radius * hearing;
}
