import { describe, expect, it } from 'vitest';
import type { GameEvent } from './events';
import { createGuards, sightStrength, updateGuards, type GuardState } from './guards';
import { GUARDS } from './guardTypes';
import type { Level } from './level';
import type { Vector2 } from './movement';
import { guardSpawn, levelFromRows } from './testLevel';
import { TICK_RATE } from './tick';

// A 14 x 8 hall with a pillar at tile (7, 3); 32 px tiles.
const rows = [
  '##############',
  '#............#',
  '#............#',
  '#......#.....#',
  '#............#',
  '#............#',
  '#............#',
  '##############',
];
const tile = (column: number, row: number): Vector2 => ({ x: column * 32 + 16, y: row * 32 + 16 });
const everywhereLit = [{ name: 'lamps', x: 0, y: 0, width: 1000, height: 1000, brightness: 1 }];

function hall(options: { lit?: boolean; partner?: boolean } = {}): Level {
  const base = levelFromRows(rows);
  return {
    ...base,
    lights: options.lit === false ? [] : everywhereLit,
    guards: [
      guardSpawn('a', [tile(2, 5), tile(11, 5)], { partner: options.partner ? 'b' : null }),
      ...(options.partner
        ? [guardSpawn('b', [tile(2, 1), tile(11, 1)], { partner: 'a' })]
        : []),
    ],
  };
}

/** Runs the guards for a number of ticks against fixed targets and collects all events. */
function run(level: Level, ticks: number, targets: Vector2[] = [], start = createGuards(level), extra: GameEvent[] = []) {
  let guards = start;
  let previous: GameEvent[] = [];
  const all: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const incoming = [...(i === 0 ? extra : []), ...previous];
    const result = updateGuards(guards, targets, level, incoming);
    guards = result.guards;
    previous = result.events;
    all.push(...result.events);
  }
  return { guards, events: all };
}

const guardA = (guards: Record<string, GuardState>) => guards.a as GuardState;

describe('createGuards', () => {
  it('starts every guard on its first route point, facing the second, on patrol', () => {
    const guard = guardA(createGuards(hall()));
    expect(guard).toMatchObject({ x: 80, y: 176, mode: 'patrol', suspicion: 0, routeIndex: 1 });
    expect(guard.facing).toBeCloseTo(0);
  });
});

describe('patrol', () => {
  it('walks towards the next route point at patrol speed', () => {
    const guard = guardA(run(hall(), TICK_RATE).guards);
    expect(guard.x).toBeCloseTo(80 + GUARDS.dockGuard.patrolSpeed, 0);
    expect(guard.mode).toBe('patrol');
  });

  it('turns around at the end of the route and walks back', () => {
    const distance = 9 * 32;
    const ticks = Math.ceil((distance / GUARDS.dockGuard.patrolSpeed) * TICK_RATE) + 30;
    const guard = guardA(run(hall(), ticks).guards);
    expect(guard.x).toBeLessThan(tile(11, 5).x);
    expect(Math.abs(guard.facing)).toBeCloseTo(Math.PI);
  });
});

describe('sightStrength', () => {
  const at = (x: number, y: number, facing = 0): GuardState => ({ ...guardA(createGuards(hall())), x, y, facing });

  it('sees a target ahead in the light, stronger when closer', () => {
    const near = sightStrength(hall(), at(80, 176), { x: 150, y: 176 });
    const far = sightStrength(hall(), at(80, 176), { x: 300, y: 176 });
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it('does not see behind itself, except right next to it', () => {
    expect(sightStrength(hall(), at(200, 176), { x: 100, y: 176 })).toBe(0);
    expect(sightStrength(hall(), at(200, 176), { x: 180, y: 176 })).toBeGreaterThan(0);
  });

  it('does not see through walls', () => {
    // The pillar at tile (7, 3) lies between the two points.
    expect(sightStrength(hall(), at(tile(4, 3).x, tile(4, 3).y), tile(10, 3))).toBe(0);
  });

  it('sees much less far in the dark', () => {
    const target = { x: 250, y: 176 };
    expect(sightStrength(hall(), at(80, 176), target)).toBeGreaterThan(0);
    expect(sightStrength(hall({ lit: false }), at(80, 176), target)).toBe(0);
  });
});

describe('suspicion and alarm', () => {
  it('goes to look at a target it sees, then raises the alarm when perception builds up', () => {
    const level = hall();
    const target = tile(9, 5);
    const glimpse = run(level, 1, [target]);
    expect(guardA(glimpse.guards).mode).toBe('investigate');
    expect(glimpse.events).toContainEqual({ type: 'guard:alerted', guardId: 'a', alarm: false, ...target });

    const detected = run(level, 3 * TICK_RATE, [target]);
    expect(guardA(detected.guards).mode).toBe('alarm');
    expect(guardA(detected.guards).suspicion).toBe(1);
    expect(detected.events).toContainEqual({ type: 'guard:alerted', guardId: 'a', alarm: true, ...target });
  });

  it('lets suspicion fade when the target is gone before the alarm', () => {
    const level = hall();
    const noticed = run(level, 10, [tile(9, 5)]).guards;
    expect(guardA(noticed).suspicion).toBeGreaterThan(0);
    const later = run(level, 2 * TICK_RATE, [], noticed).guards;
    expect(guardA(later).suspicion).toBe(0);
  });
});

describe('hearing', () => {
  const noiseAt = (point: Vector2, radius: number): GameEvent => ({ type: 'noise:emitted', ...point, radius });

  it('investigates a noise within earshot, even behind its back', () => {
    const guard = guardA(run(hall(), 1, [], undefined, [noiseAt(tile(1, 1), 200)]).guards);
    expect(guard.mode).toBe('investigate');
    expect(guard.target).toEqual(tile(1, 1));
  });

  it('ignores noise that does not reach it', () => {
    const guard = guardA(run(hall(), 1, [], undefined, [noiseAt(tile(12, 1), 50)]).guards);
    expect(guard.mode).toBe('patrol');
  });

  it('searches the spot, then returns to its route', () => {
    const level = hall();
    const heard = run(level, 1, [], undefined, [noiseAt(tile(4, 5), 200)]).guards;
    const arrived = run(level, 2 * TICK_RATE, [], heard).guards;
    expect(guardA(arrived).mode).toBe('search');
    const done = run(level, (GUARDS.dockGuard.searchSeconds + 1) * TICK_RATE, [], arrived).guards;
    expect(guardA(done).mode).toBe('patrol');
  });
});

describe('pairs', () => {
  it('sends the partner to the same spot when one guard becomes suspicious', () => {
    const level = hall({ partner: true });
    const noise: GameEvent = { type: 'noise:emitted', ...tile(3, 6), radius: 60 }; // only guard a hears it
    const { guards } = run(level, 2, [], undefined, [noise]);
    expect(guards.a?.mode).toBe('investigate');
    expect(guards.b?.mode).toBe('investigate');
    expect(guards.b?.target).toEqual(tile(3, 6));
  });

  it('puts the partner on alarm when one guard raises it', () => {
    const level = hall({ partner: true });
    const alarm: GameEvent = { type: 'guard:alerted', guardId: 'a', alarm: true, ...tile(6, 6) };
    const { guards } = run(level, 1, [], undefined, [alarm]);
    expect(guards.b?.mode).toBe('alarm');
  });
});

describe('guard state', () => {
  it('stays JSON-serializable', () => {
    const { guards } = run(hall({ partner: true }), 90, [tile(9, 5)]);
    expect(JSON.parse(JSON.stringify(guards))).toEqual(guards);
  });
});
