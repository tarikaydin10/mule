import { describe, expect, it } from 'vitest';
import type { Level } from './level';
import { cameraDetects, createCameras, updateCameras } from './sensors';
import { levelFromRows } from './testLevel';
import { THERMAL_DETECTION } from './thermal';
import { TICK_RATE } from './tick';

// Camera in the left of a corridor, looking right; a glass pane at tile (6, 1).
const base = levelFromRows(['##########', '#.....G..#', '##########']);
const camera = { id: 'cam', x: 48, y: 48, facing: 0, fieldOfView: Math.PI / 2, range: 400 };
const level: Level = { ...base, thermalCameras: [camera] };
const warm = (x: number) => ({ x, y: 48, temperature: THERMAL_DETECTION + 0.1 });

describe('cameraDetects', () => {
  it('registers warm sources in its cone', () => {
    expect(cameraDetects(level, camera, warm(150))).toBe(true);
  });

  it('ignores anything colder than the detection threshold', () => {
    expect(cameraDetects(level, camera, { x: 150, y: 48, temperature: THERMAL_DETECTION - 0.01 })).toBe(false);
  });

  it('does not see behind itself or beyond its range', () => {
    expect(cameraDetects(level, { ...camera, facing: Math.PI }, warm(150))).toBe(false);
    expect(cameraDetects(level, { ...camera, range: 50 }, warm(150))).toBe(false);
  });

  it('does not see heat through glass', () => {
    expect(cameraDetects(level, camera, warm(250))).toBe(false);
  });
});

describe('updateCameras', () => {
  const run = (ticks: number, sources: { x: number; y: number; temperature: number }[]) => {
    let cameras = createCameras(level);
    const events = [];
    for (let i = 0; i < ticks; i++) {
      const result = updateCameras(cameras, sources, level);
      cameras = result.cameras;
      events.push(...result.events);
    }
    return { cameras, events };
  };

  it('raises the alarm after about half a second of heat in view', () => {
    expect(run(TICK_RATE / 4, [warm(150)]).events).toEqual([]);
    const { events } = run(TICK_RATE, [warm(150)]);
    expect(events[0]).toEqual({ type: 'sensor:alarm', cameraId: 'cam', x: 150, y: 48 });
  });

  it('repeats the alarm while the heat stays in view, not every tick', () => {
    const { events } = run(2 * TICK_RATE, [warm(150)]);
    expect(events.length).toBeGreaterThan(1);
    expect(events.length).toBeLessThan(TICK_RATE / 2);
  });

  it('stays quiet without warm sources', () => {
    expect(run(2 * TICK_RATE, [{ x: 150, y: 48, temperature: 0.2 }]).events).toEqual([]);
  });
});
