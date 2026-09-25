import { describe, expect, it } from 'vitest';
import type { Vector2 } from './movement';
import { levelFromRows } from './testLevel';
import { castRay, visibilityPolygon } from './visibility';

// Ray casting even-odd test, only used to check the polygons.
function contains(polygon: Vector2[], point: Vector2): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Vector2;
    const b = polygon[j] as Vector2;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// 32 px tiles. A pillar in the middle of an open hall.
const hall = levelFromRows([
  '###########',
  '#.........#',
  '#.........#',
  '#....#....#',
  '#.........#',
  '#.........#',
  '###########',
]);
const eye = { x: 48, y: 112 }; // tile (1, 3), same row as the pillar at tile (5, 3)

describe('castRay', () => {
  it('stops at the first wall along the ray', () => {
    // From x 48 to the pillar's left face at x 160.
    expect(castRay(hall, eye, 1, 0, 1000)).toBeCloseTo(112);
  });

  it('stops at the maximum distance in open space', () => {
    expect(castRay(hall, eye, 0, 1, 20)).toBe(20);
  });

  it('returns 0 when starting inside a wall', () => {
    expect(castRay(hall, { x: 10, y: 10 }, 1, 0, 100)).toBe(0);
  });
});

describe('visibilityPolygon', () => {
  const polygon = visibilityPolygon(hall, eye, 1000);

  it('sees open floor in front of the viewer', () => {
    expect(contains(polygon, { x: 120, y: 112 })).toBe(true);
    expect(contains(polygon, { x: 300, y: 50 })).toBe(true);
  });

  it('does not see the floor in the shadow behind the pillar', () => {
    expect(contains(polygon, { x: 250, y: 112 })).toBe(false);
    expect(contains(polygon, { x: 300, y: 112 })).toBe(false);
  });

  it('does not see through the outer walls', () => {
    expect(contains(polygon, { x: 48, y: 10 })).toBe(false);
  });

  it('is limited by the radius', () => {
    const short = visibilityPolygon(hall, eye, 50);
    expect(contains(short, { x: 90, y: 112 })).toBe(true);
    expect(contains(short, { x: 110, y: 112 })).toBe(false);
  });

  it('reveals the faces of walls in view when asked to', () => {
    const face = { x: 164, y: 112 }; // 4 px into the pillar
    expect(contains(polygon, face)).toBe(false);
    expect(contains(visibilityPolygon(hall, eye, 1000, 8), face)).toBe(true);
  });
});
