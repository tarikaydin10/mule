/** A direction on each axis: -1, 0 or 1. Up is -1 on y. */
export interface Direction {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

export interface Vector2 {
  x: number;
  y: number;
}

export const STILL: Direction = { x: 0, y: 0 };

/** Pressed directional keys, independent of any input library. */
export interface DirectionalKeys {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Opposing keys cancel each other out. */
export function directionFromKeys(keys: DirectionalKeys): Direction {
  return {
    x: axis(keys.left, keys.right),
    y: axis(keys.up, keys.down),
  };
}

function axis(negative: boolean, positive: boolean): -1 | 0 | 1 {
  if (negative === positive) {
    return 0;
  }
  return negative ? -1 : 1;
}

/** Top-down velocity in px/s. Diagonals are normalized so they are not faster. */
export function computeVelocity(direction: Direction, speed: number): Vector2 {
  if (direction.x === 0 && direction.y === 0) {
    return { x: 0, y: 0 };
  }
  const scale = speed / Math.hypot(direction.x, direction.y);
  return { x: direction.x * scale, y: direction.y * scale };
}
