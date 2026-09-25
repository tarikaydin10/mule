import { describe, expect, it } from 'vitest';
import { clipPolygonToRect, pointInPolygon } from './geometry';

const area = (points: { x: number; y: number }[]) =>
  Math.abs(
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length] as { x: number; y: number };
      return sum + p.x * q.y - q.x * p.y;
    }, 0) / 2,
  );

describe('clipPolygonToRect', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('keeps a polygon that lies fully inside', () => {
    expect(clipPolygonToRect(square, { x: -5, y: -5, width: 20, height: 20 })).toEqual(square);
  });

  it('returns nothing for a polygon fully outside', () => {
    expect(clipPolygonToRect(square, { x: 20, y: 20, width: 5, height: 5 })).toEqual([]);
  });

  it('cuts a partly overlapping polygon to the overlap', () => {
    const clipped = clipPolygonToRect(square, { x: 5, y: 5, width: 20, height: 20 });
    expect(area(clipped)).toBeCloseTo(25);
    for (const p of clipped) {
      expect(p.x).toBeGreaterThanOrEqual(5);
      expect(p.y).toBeGreaterThanOrEqual(5);
    }
  });

  it('handles concave polygons', () => {
    // An L shape: 10x10 square minus its top-right 5x5 quarter.
    const lShape = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(area(clipPolygonToRect(lShape, { x: 0, y: 0, width: 10, height: 6 }))).toBeCloseTo(35);
  });
});

describe('pointInPolygon', () => {
  // An L shape: a square with its top-right quarter missing.
  const shape = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
    { x: 100, y: 50 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('tells inside from outside, including the notch', () => {
    expect(pointInPolygon({ x: 25, y: 25 }, shape)).toBe(true);
    expect(pointInPolygon({ x: 75, y: 75 }, shape)).toBe(true);
    expect(pointInPolygon({ x: 75, y: 25 }, shape)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 50 }, shape)).toBe(false);
  });

  it('counts the edge as inside', () => {
    expect(pointInPolygon({ x: 0, y: 30 }, shape)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 25 }, shape)).toBe(true);
  });
});
