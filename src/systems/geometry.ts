import type { Vector2 } from './movement';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Cuts a polygon down to the part inside an axis-aligned rectangle (Sutherland-Hodgman).
 * The polygon may be concave; the rectangle is convex, which is all the algorithm needs.
 */
export function clipPolygonToRect(points: readonly Vector2[], rect: Rect): Vector2[] {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  let result: Vector2[] = [...points];
  result = clipEdge(result, (p) => p.x >= rect.x, (a, b) => atX(a, b, rect.x));
  result = clipEdge(result, (p) => p.x <= right, (a, b) => atX(a, b, right));
  result = clipEdge(result, (p) => p.y >= rect.y, (a, b) => atY(a, b, rect.y));
  result = clipEdge(result, (p) => p.y <= bottom, (a, b) => atY(a, b, bottom));
  return result;
}

function clipEdge(
  points: Vector2[],
  inside: (p: Vector2) => boolean,
  intersect: (a: Vector2, b: Vector2) => Vector2,
): Vector2[] {
  const output: Vector2[] = [];
  points.forEach((current, i) => {
    const previous = points[(i + points.length - 1) % points.length] as Vector2;
    if (inside(current)) {
      if (!inside(previous)) {
        output.push(intersect(previous, current));
      }
      output.push(current);
    } else if (inside(previous)) {
      output.push(intersect(previous, current));
    }
  });
  return output;
}

function atX(a: Vector2, b: Vector2, x: number): Vector2 {
  return { x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) };
}

function atY(a: Vector2, b: Vector2, y: number): Vector2 {
  return { x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y };
}
