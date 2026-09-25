import { describe, expect, it } from 'vitest';
import { draw, pick, random } from './random';

describe('random', () => {
  it('is deterministic for a seed and spreads over [0, 1)', () => {
    const a = random(42);
    const b = random(42);
    const values = Array.from({ length: 200 }, () => a());
    expect(Array.from({ length: 200 }, () => b())).toEqual(values);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(60);
  });

  it('draws independently per key and picks options', () => {
    expect(draw(7, 'a')).toBe(draw(7, 'a'));
    expect(draw(7, 'a')).not.toBe(draw(7, 'b'));
    const picks = new Set(Array.from({ length: 50 }, (_, i) => pick(i, 'chat', ['x', 'y'])));
    expect(picks).toEqual(new Set(['x', 'y']));
  });
});
