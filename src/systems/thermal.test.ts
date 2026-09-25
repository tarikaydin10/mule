import { describe, expect, it } from 'vitest';
import { clampTemperature, temperatureTint, togglePolarity } from './thermal';

describe('clampTemperature', () => {
  it('keeps values inside [0, 1] and treats NaN as cold', () => {
    expect(clampTemperature(0.4)).toBe(0.4);
    expect(clampTemperature(-2)).toBe(0);
    expect(clampTemperature(3)).toBe(1);
    expect(clampTemperature(Number.NaN)).toBe(0);
  });
});

describe('temperatureTint', () => {
  it('maps cold to black and hot to white', () => {
    expect(temperatureTint(0)).toBe(0x000000);
    expect(temperatureTint(1)).toBe(0xffffff);
  });

  it('is a neutral grey whose level follows the temperature', () => {
    expect(temperatureTint(0.5)).toBe(0x808080);
    expect(temperatureTint(0.1)).toBe(0x1a1a1a);
  });

  it('clamps out-of-range temperatures', () => {
    expect(temperatureTint(1.7)).toBe(0xffffff);
    expect(temperatureTint(-1)).toBe(0x000000);
  });
});

describe('togglePolarity', () => {
  it('switches between white-hot and black-hot', () => {
    expect(togglePolarity('white-hot')).toBe('black-hot');
    expect(togglePolarity('black-hot')).toBe('white-hot');
  });
});
