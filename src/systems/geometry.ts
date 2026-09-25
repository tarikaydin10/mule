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

/** Whether a point lies inside a polygon (even-odd rule); points on an edge count as inside. */
export function pointInPolygon(point: Vector2, polygon: readonly Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Vector2;
    const b = polygon[j] as Vector2;
    if (onSegment(point, a, b)) {
      return true;
    }
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

function onSegment(p: Vector2, a: Vector2, b: Vector2): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6) {
    return false;
  }
  return p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
}
