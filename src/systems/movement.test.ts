import { describe, expect, it } from 'vitest';
import { computeVelocity, directionFromKeys, STILL } from './movement';

const none = { up: false, down: false, left: false, right: false };

describe('directionFromKeys', () => {
  it('maps keys to axis directions (y grows downward)', () => {
    expect(directionFromKeys(none)).toEqual({ x: 0, y: 0 });
    expect(directionFromKeys({ ...none, right: true })).toEqual({ x: 1, y: 0 });
    expect(directionFromKeys({ ...none, left: true })).toEqual({ x: -1, y: 0 });
    expect(directionFromKeys({ ...none, up: true })).toEqual({ x: 0, y: -1 });
    expect(directionFromKeys({ ...none, down: true, left: true })).toEqual({ x: -1, y: 1 });
  });

  it('cancels opposing keys', () => {
    expect(directionFromKeys({ up: true, down: true, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });
});

describe('computeVelocity', () => {
  it('stands still without a direction', () => {
    expect(computeVelocity(STILL, 160)).toEqual({ x: 0, y: 0 });
  });

  it('moves along a single axis at full speed', () => {
    expect(computeVelocity({ x: 1, y: 0 }, 160)).toEqual({ x: 160, y: 0 });
    expect(computeVelocity({ x: 0, y: -1 }, 160)).toEqual({ x: 0, y: -160 });
  });

  it('keeps diagonal speed equal to straight speed', () => {
    const v = computeVelocity({ x: 1, y: -1 }, 160);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(160);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
  });
});
