import { describe, expect, it } from 'vitest';
import type { GameEvent } from './events';
import {
  ALERT_SECONDS,
  CHAT_SECONDS,
  createGuards,
  knockOut,
  LOST_SECONDS,
  sightStrength,
  updateGuards,
  type GuardContext,
  type GuardState,
} from './guards';
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
function run(
  level: Level,
  ticks: number,
  targets: Vector2[] = [],
  start = createGuards(level),
  extra: GameEvent[] = [],
  context: GuardContext = { seed: 0, tick: 0, fixed: true },
) {
  let guards = start;
  let previous: GameEvent[] = [];
  const all: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const incoming = [...(i === 0 ? extra : []), ...previous];
    const result = updateGuards(guards, targets, level, incoming, { ...context, tick: context.tick + i });
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
  it('splits the search: the partner goes halfway and keeps the other in sight', () => {
    const level = hall({ partner: true });
    const noise: GameEvent = { type: 'noise:emitted', ...tile(3, 6), radius: 60 }; // only guard a hears it
    const { guards } = run(level, 2, [], undefined, [noise]);
    expect(guards.a?.mode).toBe('investigate');
    expect(guards.a?.target).toEqual(tile(3, 6));
    expect(guards.b?.mode).toBe('investigate');
    const b = createGuards(level).b as GuardState;
    expect(guards.b?.target?.y).toBe((b.y + tile(3, 6).y) / 2);
    expect(Math.abs((guards.b?.target?.x ?? 0) - (b.x + tile(3, 6).x) / 2)).toBeLessThan(2);
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

describe('habits', () => {
  it('stops at route points with a wait, and at the chat point of the run', () => {
    const level = hall();
    const spawn = level.guards[0] as NonNullable<Level['guards'][0]>;
    spawn.waits = { 1: 2 };
    spawn.chatPoints = [0];
    // From (2,5) to (11,5): 9 tiles at 2.19 tiles/s = about 4.1 s, then 2 s wait at index 1.
    const arrive = Math.ceil((9 * 32) / GUARDS.dockGuard.patrolSpeed * TICK_RATE) + 2;
    const atPoint = guardA(run(level, arrive).guards);
    expect(atPoint.waitTicks).toBeGreaterThan(0);
    expect(atPoint.x).toBeCloseTo(tile(11, 5).x, 0);
    const later = guardA(run(level, arrive + TICK_RATE, [], undefined).guards);
    expect(later.waitTicks).toBeGreaterThan(0); // still within the 2 s
    const gone = guardA(run(level, arrive + 2 * TICK_RATE + 5).guards);
    expect(gone.waitTicks).toBe(0);
    expect(gone.x).toBeLessThan(tile(11, 5).x);
    // The chat point is index 0 in a fixed run; the guard stops there for CHAT_SECONDS when it comes back.
    const back = arrive + 2 * TICK_RATE + Math.ceil((9 * 32) / GUARDS.dockGuard.patrolSpeed * TICK_RATE) + 2;
    expect(guardA(run(level, back).guards).waitTicks).toBeCloseTo(CHAT_SECONDS * TICK_RATE, -1);
  });

  it('draws the chat point from the seed, the same for both guards of a pair', () => {
    const level = hall({ partner: true });
    for (const guard of level.guards) {
      guard.chatPoints = [0, 1];
    }
    const picks = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const guards = createGuards(level, { seed, tick: 0, fixed: false });
      expect(guards.a?.chatIndex).toBe(guards.b?.chatIndex);
      picks.add(guards.a?.chatIndex as number);
    }
    expect(picks).toEqual(new Set([0, 1]));
    expect(createGuards(level).a?.chatIndex).toBe(0);
  });

  it('sweeps a post over its arc and returns to it after investigating', () => {
    const base = levelFromRows(rows);
    const level: Level = {
      ...base,
      lights: everywhereLit,
      guards: [{ ...guardSpawn('p', [tile(6, 5)]), post: { facing: 0, sweep: Math.PI / 2 } }],
    };
    const facings = new Set<number>();
    let guards = createGuards(level);
    for (let i = 0; i < 6 * TICK_RATE; i++) {
      guards = updateGuards(guards, [], level, []).guards;
      facings.add(Math.round((guards.p?.facing ?? 0) * 100));
    }
    const values = [...facings].map((f) => f / 100);
    expect(Math.max(...values)).toBeCloseTo(Math.PI / 4, 1);
    expect(Math.min(...values)).toBeCloseTo(-Math.PI / 4, 1);
    expect(guards.p).toMatchObject({ x: tile(6, 5).x, y: tile(6, 5).y, mode: 'patrol' });
    // A noise sends it off; afterwards it walks back to its post.
    const noise: GameEvent = { type: 'noise:emitted', ...tile(2, 5), radius: 200 };
    let sent = updateGuards(guards, [], level, [noise]).guards;
    expect(sent.p?.mode).toBe('investigate');
    for (let i = 0; i < 12 * TICK_RATE; i++) {
      sent = updateGuards(sent, [], level, []).guards;
    }
    expect(sent.p?.mode).toBe('patrol');
    expect(Math.hypot((sent.p?.x ?? 0) - tile(6, 5).x, (sent.p?.y ?? 0) - tile(6, 5).y)).toBeLessThan(2);
  });

  it('ends a chase when the target is lost: search, then patrol on edge', () => {
    const level = hall();
    const target = tile(9, 5);
    let guards = run(level, 3 * TICK_RATE, [target]).guards;
    expect(guardA(guards).mode).toBe('alarm');
    // The target vanishes; the guard reaches the last known spot and loses the trail.
    guards = run(level, (LOST_SECONDS + 3) * TICK_RATE, [], guards).guards;
    expect(guardA(guards).mode).toBe('search');
    guards = run(level, (GUARDS.dockGuard.searchSeconds + 1) * TICK_RATE, [], guards).guards;
    expect(guardA(guards).mode).toBe('patrol');
    expect(guardA(guards).alertTicks).toBeGreaterThan((ALERT_SECONDS - 10) * TICK_RATE);
  });

  it('sees wider and gets suspicious faster while on edge', () => {
    const level = hall();
    const calm = guardA(createGuards(level));
    const edgy = { ...calm, alertTicks: 100 };
    // Just outside the normal 100 degree cone: 55 degrees off centre, upwards into open floor.
    const off = { x: calm.x + 100 * Math.cos(-0.96), y: calm.y + 100 * Math.sin(-0.96) };
    expect(sightStrength(level, calm, off)).toBe(0);
    expect(sightStrength(level, edgy, off)).toBeGreaterThan(0);
    const ahead = { x: calm.x + 100, y: calm.y };
    const calmAfter = run(level, 10, [ahead]).guards;
    const edgyAfter = run(level, 10, [ahead], { a: edgy }).guards;
    expect(guardA(edgyAfter).suspicion).toBeGreaterThan(guardA(calmAfter).suspicion);
  });

  it('knocks a guard out, alerts its partner, and raises the alarm when the body is found', () => {
    const level = hall({ partner: true });
    const { guards: after, event } = knockOut(createGuards(level), 'a');
    expect(after.a?.mode).toBe('down');
    expect(event).toEqual({ type: 'guard:alerted', guardId: 'a', alarm: true, x: after.a?.x, y: after.a?.y });
    const reacted = run(level, 1, [], after, event ? [event] : []).guards;
    expect(reacted.b?.mode).toBe('alarm');
    expect(reacted.a?.mode).toBe('down');

    // A third guard walking past the body finds it.
    const finder: Level = {
      ...level,
      guards: [...level.guards, guardSpawn('c', [tile(2, 6), tile(11, 6)])],
    };
    const down = knockOut(createGuards(finder), 'a').guards;
    const { guards: found, events } = updateGuards({ ...down, c: { ...(down.c as GuardState), x: tile(4, 5).x, y: tile(4, 5).y, facing: Math.PI } }, [], finder, []);
    expect(found.c?.mode).toBe('alarm');
    expect(found.a?.found).toBe(true);
    expect(events).toContainEqual({ type: 'guard:alerted', guardId: 'c', alarm: true, x: down.a?.x, y: down.a?.y });
  });

  it('takes its detour on some loops, never in a fixed run', () => {
    const base = levelFromRows(rows);
    const spawn = guardSpawn('d', [tile(2, 5), tile(6, 5)], { detour: { after: 1, points: [tile(6, 2)] } });
    const level: Level = { ...base, lights: everywhereLit, guards: [spawn] };
    const visitsTop = (seed: number, fixed: boolean) => {
      let guards = createGuards(level, { seed, tick: 0, fixed });
      let top = false;
      for (let i = 0; i < 20 * TICK_RATE; i++) {
        guards = updateGuards(guards, [], level, [], { seed, tick: i, fixed }).guards;
        if ((guards.d?.y ?? 999) < tile(3, 5).y) {
          top = true;
        }
      }
      return top;
    };
    expect(visitsTop(1, true)).toBe(false);
    const seeds = Array.from({ length: 8 }, (_, i) => visitsTop(i + 1, false));
    expect(seeds).toContain(true);
  });
});
