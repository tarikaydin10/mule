import { describe, expect, it } from 'vitest';
import { illuminationAt } from './lighting';
import { levelFromRows } from './testLevel';

const level = {
  ...levelFromRows(['....', '....']),
  lights: [
    { name: 'lamp', x: 0, y: 0, width: 64, height: 64, brightness: 0.5 },
    { name: 'spot', x: 32, y: 0, width: 32, height: 32, brightness: 0.9 },
  ],
};

describe('illuminationAt', () => {
  it('is 0 outside every light zone', () => {
    expect(illuminationAt(level, { x: 100, y: 10 })).toBe(0);
  });

  it('takes the brightest zone containing the point', () => {
    expect(illuminationAt(level, { x: 10, y: 10 })).toBe(0.5);
    expect(illuminationAt(level, { x: 40, y: 10 })).toBe(0.9);
  });
});
