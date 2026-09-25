import { describe, expect, it } from 'vitest';
import { isSolid } from './level';
import type { Vector2 } from './movement';
import { findPath } from './pathfinding';
import { levelFromRows } from './testLevel';

// Two rooms joined by a door in the middle wall (column 4, row 3).
const rooms = levelFromRows([
  '#########',
  '#...#...#',
  '#...#...#',
  '#.......#',
  '#...#...#',
  '#########',
]);
const tileOf = (p: Vector2) => [Math.floor(p.x / 32), Math.floor(p.y / 32)] as const;

describe('findPath', () => {
  it('routes through the door and ends exactly at the target', () => {
    const path = findPath(rooms, { x: 48, y: 48 }, { x: 240, y: 50 });
    expect(path.at(-1)).toEqual({ x: 240, y: 50 });
    expect(path.map(tileOf)).toContainEqual([4, 3]);
    for (const point of path) {
      expect(isSolid(rooms, ...tileOf(point))).toBe(false);
    }
  });

  it('takes the diagonal shortcut in open space', () => {
    const path = findPath(rooms, { x: 48, y: 48 }, { x: 112, y: 112 });
    expect(path.map(tileOf)).toEqual([[2, 2], [3, 3]]);
  });

  it('never cuts across a wall corner', () => {
    const corner = levelFromRows([
      '#####',
      '#..##',
      '#...#',
      '#####',
    ]);
    // From (2,1) to (3,2): the diagonal would clip the wall at (3,1), so it goes around.
    const path = findPath(corner, { x: 80, y: 48 }, { x: 112, y: 80 });
    expect(path.map(tileOf)).toEqual([[2, 2], [3, 2]]);
  });

  it('returns nothing for unreachable or blocked targets', () => {
    const split = levelFromRows(['#######', '#..#..#', '#######']);
    expect(findPath(split, { x: 48, y: 48 }, { x: 144, y: 48 })).toEqual([]);
    expect(findPath(rooms, { x: 48, y: 48 }, { x: 144, y: 48 })).toEqual([]); // into the wall
  });

  it('returns nothing when the target is in the start tile', () => {
    expect(findPath(rooms, { x: 40, y: 40 }, { x: 50, y: 50 })).toEqual([]);
  });
});
