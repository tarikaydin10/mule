import { isSolid, type Level } from './level';
import type { Vector2 } from './movement';

// Keeps an edge that exactly touches a tile boundary from counting as overlap.
const EPSILON = 1e-6;

/**
 * Moves an axis-aligned box (centre + half size) by `delta` and stops it at solid tiles.
 * The axes are resolved one after the other, so the box slides along walls.
 */
export function moveAndCollide(level: Level, position: Vector2, halfSize: number, delta: Vector2): Vector2 {
  // Sub-steps below half a tile, so fast movement cannot tunnel through a wall.
  const maxStep = level.tileSize / 2;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / maxStep));
  let { x, y } = position;
  for (let i = 0; i < steps; i++) {
    x = moveX(level, x, y, halfSize, delta.x / steps);
    y = moveY(level, x, y, halfSize, delta.y / steps);
  }
  return { x, y };
}

function moveX(level: Level, x: number, y: number, half: number, dx: number): number {
  if (dx === 0) {
    return x;
  }
  const size = level.tileSize;
  const next = x + dx;
  const column = dx > 0 ? Math.floor((next + half - EPSILON) / size) : Math.floor((next - half) / size);
  const top = Math.floor((y - half) / size);
  const bottom = Math.floor((y + half - EPSILON) / size);
  for (let row = top; row <= bottom; row++) {
    if (isSolid(level, column, row)) {
      return dx > 0 ? column * size - half : (column + 1) * size + half;
    }
  }
  return next;
}

function moveY(level: Level, x: number, y: number, half: number, dy: number): number {
  if (dy === 0) {
    return y;
  }
  const size = level.tileSize;
  const next = y + dy;
  const row = dy > 0 ? Math.floor((next + half - EPSILON) / size) : Math.floor((next - half) / size);
  const left = Math.floor((x - half) / size);
  const right = Math.floor((x + half - EPSILON) / size);
  for (let column = left; column <= right; column++) {
    if (isSolid(level, column, row)) {
      return dy > 0 ? row * size - half : (row + 1) * size + half;
    }
  }
  return next;
}
