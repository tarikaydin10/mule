/** Directional input as plain booleans, independent of any input library. */
export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface Vector2 {
  x: number;
  y: number;
}

/**
 * Turns directional input into a top-down velocity in px/s.
 * Opposing directions cancel out; diagonals are normalized so they are not faster.
 */
export function computeVelocity(input: MoveInput, speed: number): Vector2 {
  const dx = Number(input.right) - Number(input.left);
  const dy = Number(input.down) - Number(input.up);
  if (dx === 0 && dy === 0) {
    return { x: 0, y: 0 };
  }
  const scale = speed / Math.hypot(dx, dy);
  return { x: dx * scale, y: dy * scale };
}
