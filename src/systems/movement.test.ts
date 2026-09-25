import { describe, expect, it } from 'vitest';
import { computeVelocity, type MoveInput } from './movement';

const idle: MoveInput = { up: false, down: false, left: false, right: false };

describe('computeVelocity', () => {
  it('stands still without input', () => {
    expect(computeVelocity(idle, 160)).toEqual({ x: 0, y: 0 });
  });

  it('moves along a single axis at full speed (y grows downward)', () => {
    expect(computeVelocity({ ...idle, right: true }, 160)).toEqual({ x: 160, y: 0 });
    expect(computeVelocity({ ...idle, left: true }, 160)).toEqual({ x: -160, y: 0 });
    expect(computeVelocity({ ...idle, up: true }, 160)).toEqual({ x: 0, y: -160 });
    expect(computeVelocity({ ...idle, down: true }, 160)).toEqual({ x: 0, y: 160 });
  });

  it('keeps diagonal speed equal to straight speed', () => {
    const v = computeVelocity({ ...idle, up: true, right: true }, 160);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(160);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
  });

  it('cancels opposing directions', () => {
    expect(computeVelocity({ ...idle, left: true, right: true }, 160)).toEqual({ x: 0, y: 0 });
    expect(computeVelocity({ up: true, down: true, left: false, right: true }, 160)).toEqual({ x: 160, y: 0 });
  });
});
