import { describe, expect, it } from 'vitest';
import { numberProperty } from './tiled';

describe('numberProperty', () => {
  it('reads from the Tiled property list used on map objects', () => {
    const properties = [
      { name: 'collides', type: 'bool', value: true },
      { name: 'temperature', type: 'float', value: 0.85 },
    ];
    expect(numberProperty(properties, 'temperature')).toBe(0.85);
  });

  it('reads from the record Phaser builds for tile properties', () => {
    expect(numberProperty({ collides: true, temperature: 0.3 }, 'temperature')).toBe(0.3);
  });

  it('returns undefined when the property is missing or not a number', () => {
    expect(numberProperty([{ name: 'temperature', value: 'hot' }], 'temperature')).toBeUndefined();
    expect(numberProperty({}, 'temperature')).toBeUndefined();
    expect(numberProperty(undefined, 'temperature')).toBeUndefined();
  });
});
