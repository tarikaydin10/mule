import { describe, expect, it } from 'vitest';
import {
  addTrace,
  coolTraces,
  HEAT_TRACE_COOLING_PER_SECOND,
  HEAT_TRACE_LIMIT,
  HEAT_TRACE_TEMPERATURE,
  PLAYER_TEMPERATURE,
  temperatureTint,
  THERMAL_DETECTION,
} from './thermal';

describe('thermal values', () => {
  it('keeps the masked player and residual heat below what thermal cameras register', () => {
    expect(PLAYER_TEMPERATURE).toBeLessThan(THERMAL_DETECTION);
    expect(HEAT_TRACE_TEMPERATURE).toBeLessThan(THERMAL_DETECTION);
  });
});

describe('heat traces', () => {
  it('cool down and disappear once faded', () => {
    const traces = addTrace([], { x: 10, y: 20 });
    expect(traces).toEqual([{ x: 10, y: 20, temperature: HEAT_TRACE_TEMPERATURE }]);
    expect(coolTraces(traces, 1)[0]?.temperature).toBeCloseTo(HEAT_TRACE_TEMPERATURE - HEAT_TRACE_COOLING_PER_SECOND);
    expect(coolTraces(traces, 60)).toEqual([]);
  });

  it('keep only the newest ones', () => {
    let traces = addTrace([], { x: 0, y: 0 });
    for (let i = 1; i <= HEAT_TRACE_LIMIT; i++) {
      traces = addTrace(traces, { x: i, y: 0 });
    }
    expect(traces).toHaveLength(HEAT_TRACE_LIMIT);
    expect(traces[0]?.x).toBe(1);
  });
});

describe('temperatureTint', () => {
  it('maps cold to black and hot to white, clamped', () => {
    expect(temperatureTint(0)).toBe(0x000000);
    expect(temperatureTint(0.5)).toBe(0x808080);
    expect(temperatureTint(2)).toBe(0xffffff);
  });
});
