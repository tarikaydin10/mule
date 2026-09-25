import { describe, expect, it } from 'vitest';
import { moveAndCollide } from './collision';
import { levelFromRows } from './testLevel';

const room = levelFromRows([
  '#####',
  '#...#',
  '#...#',
  '#...#',
  '#####',
]);
const HALF = 10;
const centre = { x: 80, y: 80 };

describe('moveAndCollide', () => {
  it('moves freely inside open space', () => {
    expect(moveAndCollide(room, centre, HALF, { x: 5, y: -3 })).toEqual({ x: 85, y: 77 });
  });

  it('stops flush against a wall on each side', () => {
    expect(moveAndCollide(room, centre, HALF, { x: 100, y: 0 })).toEqual({ x: 128 - HALF, y: 80 });
    expect(moveAndCollide(room, centre, HALF, { x: -100, y: 0 })).toEqual({ x: 32 + HALF, y: 80 });
    expect(moveAndCollide(room, centre, HALF, { x: 0, y: 100 })).toEqual({ x: 80, y: 128 - HALF });
    expect(moveAndCollide(room, centre, HALF, { x: 0, y: -100 })).toEqual({ x: 80, y: 32 + HALF });
  });

  it('slides along a wall when moving diagonally into it', () => {
    const atRightWall = { x: 128 - HALF, y: 80 };
    expect(moveAndCollide(room, atRightWall, HALF, { x: 4, y: 6 })).toEqual({ x: 128 - HALF, y: 86 });
  });

  it('stays put when pushing into a wall it already touches', () => {
    const atTop = { x: 80, y: 32 + HALF };
    expect(moveAndCollide(room, atTop, HALF, { x: 0, y: -3 })).toEqual(atTop);
  });

  it('lets a box smaller than a tile pass through a one-tile gap', () => {
    const corridor = levelFromRows([
      '#####',
      '#.#.#',
      '#...#',
      '#####',
    ]);
    // Aligned with the gap in column 1, moving up from row 2 into row 1.
    expect(moveAndCollide(corridor, { x: 48, y: 80 }, HALF, { x: 0, y: -30 })).toEqual({ x: 48, y: 50 });
  });

  it('never tunnels through a wall, however large the step', () => {
    const thinWall = levelFromRows([
      '#######',
      '#..#..#',
      '#######',
    ]);
    const result = moveAndCollide(thinWall, { x: 48, y: 48 }, HALF, { x: 500, y: 0 });
    expect(result.x).toBe(96 - HALF);
  });
});
