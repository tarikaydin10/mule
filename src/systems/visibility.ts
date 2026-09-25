import { blocksSight, type Level, type Sense } from './level';
import type { Vector2 } from './movement';

// Rays around the full circle, so open areas get a round edge.
const CIRCLE_RAYS = 96;
// Extra rays just beside every wall corner, so shadow edges run exactly along the walls.
const CORNER_OFFSET = 1e-4;

/**
 * The area visible from `origin` up to `radius`, as polygon points sorted by angle.
 * Walls block sight. `wallReveal` lets each ray reach that many px into the wall it hits,
 * so the faces of walls in view are part of the area. Light passes glass, heat does not.
 */
export function visibilityPolygon(
  level: Level,
  origin: Vector2,
  radius: number,
  wallReveal = 0,
  sense: Sense = 'light',
): Vector2[] {
  const angles: number[] = [];
  for (let i = 0; i < CIRCLE_RAYS; i++) {
    angles.push((i / CIRCLE_RAYS) * Math.PI * 2 - Math.PI);
  }
  for (const corner of wallCornersNear(level, origin, radius, sense)) {
    const angle = Math.atan2(corner.y - origin.y, corner.x - origin.x);
    angles.push(angle - CORNER_OFFSET, angle, angle + CORNER_OFFSET);
  }
  angles.sort((a, b) => a - b);

  return angles.map((angle) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hit = castRay(level, origin, dx, dy, radius, sense);
    const distance = hit < radius ? Math.min(hit + wallReveal, radius) : radius;
    return { x: origin.x + dx * distance, y: origin.y + dy * distance };
  });
}

/**
 * The part of the visible area inside a view cone: `facing` is the centre angle in radians,
 * `fieldOfView` the full opening angle. Returns a closed polygon starting at the origin.
 */
export function visionCone(
  level: Level,
  origin: Vector2,
  facing: number,
  fieldOfView: number,
  radius: number,
  sense: Sense = 'light',
): Vector2[] {
  const half = fieldOfView / 2;
  const relative = (point: Vector2) => normalizeAngle(Math.atan2(point.y - origin.y, point.x - origin.x) - facing);
  const edge = (angle: number): Vector2 => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const distance = castRay(level, origin, dx, dy, radius, sense);
    return { x: origin.x + dx * distance, y: origin.y + dy * distance };
  };
  const inside = visibilityPolygon(level, origin, radius, 0, sense)
    .map((point) => ({ point, angle: relative(point) }))
    .filter(({ angle }) => angle > -half && angle < half)
    .sort((a, b) => a.angle - b.angle)
    .map(({ point }) => point);
  return [{ x: origin.x, y: origin.y }, edge(facing - half), ...inside, edge(facing + half)];
}

/** Maps an angle to [-PI, PI). */
export function normalizeAngle(angle: number): number {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/** Distance along a unit direction until the ray enters a tile that blocks `sense`, at most `maxDistance`. */
export function castRay(
  level: Level,
  origin: Vector2,
  dx: number,
  dy: number,
  maxDistance: number,
  sense: Sense = 'light',
): number {
  const size = level.tileSize;
  let column = Math.floor(origin.x / size);
  let row = Math.floor(origin.y / size);
  if (blocksSight(level, column, row, sense)) {
    return 0;
  }
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const deltaX = dx !== 0 ? size / Math.abs(dx) : Infinity;
  const deltaY = dy !== 0 ? size / Math.abs(dy) : Infinity;
  let nextX = dx !== 0 ? ((dx > 0 ? (column + 1) * size - origin.x : origin.x - column * size) / Math.abs(dx)) : Infinity;
  let nextY = dy !== 0 ? ((dy > 0 ? (row + 1) * size - origin.y : origin.y - row * size) / Math.abs(dy)) : Infinity;

  for (;;) {
    let distance: number;
    if (nextX < nextY) {
      distance = nextX;
      column += stepX;
      nextX += deltaX;
    } else {
      distance = nextY;
      row += stepY;
      nextY += deltaY;
    }
    if (distance >= maxDistance) {
      return maxDistance;
    }
    if (blocksSight(level, column, row, sense)) {
      return distance;
    }
  }
}

/**
 * Grid points where a shadow edge can start: the outer and inner corners of walls.
 * Points inside a wall block or along a straight wall need no ray of their own.
 */
function wallCornersNear(level: Level, origin: Vector2, radius: number, sense: Sense): Vector2[] {
  const size = level.tileSize;
  const first = (value: number) => Math.floor((value - radius) / size);
  const last = (value: number) => Math.ceil((value + radius) / size);
  const corners: Vector2[] = [];
  for (let row = first(origin.y); row <= last(origin.y); row++) {
    for (let column = first(origin.x); column <= last(origin.x); column++) {
      // The four tiles around grid point (column, row).
      const topLeft = blocksSight(level, column - 1, row - 1, sense);
      const topRight = blocksSight(level, column, row - 1, sense);
      const bottomLeft = blocksSight(level, column - 1, row, sense);
      const bottomRight = blocksSight(level, column, row, sense);
      const solid = Number(topLeft) + Number(topRight) + Number(bottomLeft) + Number(bottomRight);
      const diagonal = solid === 2 && topLeft === bottomRight;
      if (solid === 1 || solid === 3 || diagonal) {
        corners.push({ x: column * size, y: row * size });
      }
    }
  }
  return corners;
}
