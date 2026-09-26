import { describe, expect, it } from 'vitest';
import { createGuards, inViewCone } from './guards';
import { LOOT } from './loot';
import { FOOTSTEP_INTERVAL_TICKS, FOOTSTEP_RADIUS, SNEAK_SPEED_FACTOR } from './noise';
import { HEAT_TRACE_TEMPERATURE, PLAYER_TEMPERATURE } from './thermal';
import { TICK_RATE } from './tick';
import {
  applyCommand,
  BOLTS,
  CATCH_DISTANCE,
  carriedLoot,
  createGameState,
  inExtraction,
  lootInReach,
  PICKUP_REACH,
  PLAYER_ACCELERATION,
  PLAYER_SIZE,
  PLAYER_SPEED,
  heatSources,
  HIDE_EXIT_TICKS,
  hideSpotInReach,
  playerModifiers,
  securedLoot,
  step,
  switchInReach,
  takedownTarget,
  TAKEDOWN_REACH,
  THROW_DISTANCE,
  THROW_NOISE_RADIUS,
  TICK_SECONDS,
  type Command,
  type GameState,
} from './simulation';
import { guardSpawn, levelFromRows, lootSpawn } from './testLevel';

const level = levelFromRows([
  '#######',
  '#.....#',
  '#..P..#',
  '#.....#',
  '#######',
]);
const move = (x: -1 | 0 | 1, y: -1 | 0 | 1): Command => ({ type: 'move', playerId: 'p1', direction: { x, y } });

/** Distance covered in `ticks` from standstill towards `speed`, with the player's inertia. */
function travelled(ticks: number, speed: number): number {
  let velocity = 0;
  let distance = 0;
  for (let i = 0; i < ticks; i++) {
    velocity += (speed - velocity) * PLAYER_ACCELERATION;
    distance += velocity * TICK_SECONDS;
  }
  return distance;
}

describe('createGameState', () => {
  it('places every player at the spawn, standing still', () => {
    const state = createGameState(level, ['p1']);
    expect(state).toEqual({
      tick: 0,
      seed: 0,
      fixed: false,
      players: {
        p1: {
          x: 112,
          y: 80,
          direction: { x: 0, y: 0 },
          sneaking: false,
          vx: 0,
          vy: 0,
          stepTicks: 0,
          thermalVision: false,
          hidden: null,
          emergeTicks: 0,
          bolts: BOLTS,
        },
      },
      loot: {},
      guards: {},
      cameras: {},
      heatTraces: [],
      zones: {},
      events: [],
      outcome: null,
    });
  });

  it('starts every named light and noise zone switched on', () => {
    const zoned = {
      ...level,
      lights: [{ name: 'lamp', x: 0, y: 0, width: 32, height: 32, brightness: 1 }],
      noiseZones: [{ name: 'fans', x: 0, y: 0, width: 32, height: 32, surface: 1, masking: 0.5 }],
    };
    expect(createGameState(zoned, ['p1']).zones).toEqual({ lamp: true, fans: true });
  });
});

describe('applyCommand', () => {
  it('sets the direction of the commanded player without touching the old state', () => {
    const state = createGameState(level, ['p1']);
    const next = applyCommand(state, move(1, 0), level);
    expect(next.players.p1?.direction).toEqual({ x: 1, y: 0 });
    expect(state.players.p1?.direction).toEqual({ x: 0, y: 0 });
  });

  it('ignores commands for unknown players', () => {
    const state = createGameState(level, ['p1']);
    expect(applyCommand(state, { type: 'move', playerId: 'ghost', direction: { x: 1, y: 0 } }, level)).toBe(state);
  });
});

describe('step', () => {
  it('advances the tick and starts moving with inertia towards the walking speed', () => {
    const next = step(createGameState(level, ['p1']), [move(1, 0)], level);
    expect(next.tick).toBe(1);
    expect(next.players.p1?.x).toBeCloseTo(112 + travelled(1, PLAYER_SPEED));
    expect(next.players.p1?.y).toBe(80);
    let state = next;
    for (let i = 0; i < 30; i++) {
      state = step(state, [], level);
    }
    expect(state.players.p1?.vx).toBeCloseTo(PLAYER_SPEED, 1);
  });

  it('keeps moving in the last commanded direction until a new command arrives, then rolls out', () => {
    let state = step(createGameState(level, ['p1']), [move(0, 1)], level);
    state = step(state, [], level);
    expect(state.players.p1?.y).toBeCloseTo(80 + travelled(2, PLAYER_SPEED));
    const stopped = step(state, [move(0, 0)], level);
    // Rolling out: still moving, but slower than before.
    expect(stopped.players.p1!.y).toBeGreaterThan(state.players.p1!.y);
    expect(stopped.players.p1!.vy).toBeLessThan(state.players.p1!.vy);
    let rest = stopped;
    for (let i = 0; i < 30; i++) {
      rest = step(rest, [], level);
    }
    expect(rest.players.p1?.vy).toBe(0);
  });

  it('stops the player at walls', () => {
    let state = createGameState(level, ['p1']);
    state = step(state, [move(-1, 0)], level);
    for (let i = 0; i < 120; i++) {
      state = step(state, [], level);
    }
    expect(state.players.p1?.x).toBe(32 + PLAYER_SIZE / 2);
  });

  it('is deterministic and keeps the state JSON-serializable', () => {
    const commands = [[move(1, 1)], [], [move(-1, 0)], [], [move(0, -1)]];
    const run = () => commands.reduce((state, tick) => step(state, tick, level), createGameState(level, ['p1']));
    const a = run();
    expect(run()).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

describe('carrying loot', () => {
  // The server block lies 30 px right of the spawn, within reach.
  const withBlock = { ...level, loot: [lootSpawn('block', 'serverBlock', 142, 80)] };
  const pickUp: Command = { type: 'pickUp', playerId: 'p1' };
  const drop: Command = { type: 'drop', playerId: 'p1' };
  const start = () => createGameState(withBlock, ['p1']);
  const run = (state: GameState, commands: Command[][]) => commands.reduce((s, tick) => step(s, tick, withBlock), state);

  it('places loot from the level, lying on the floor', () => {
    expect(start().loot).toEqual({
      block: { kind: 'serverBlock', x: 142, y: 80, carriedBy: null, temperature: LOOT.serverBlock.temperature, thawing: false },
    });
  });

  it('finds loot within reach and ignores loot beyond it', () => {
    expect(lootInReach(start(), 'p1')).toBe('block');
    const far = createGameState({ ...withBlock, loot: [lootSpawn('block', 'serverBlock', 112 + PICKUP_REACH + 1, 80)] }, ['p1']);
    expect(lootInReach(far, 'p1')).toBeNull();
    expect(applyCommand(far, pickUp, withBlock)).toBe(far);
  });

  it('picks up loot in reach and applies its modifiers', () => {
    const carrying = applyCommand(start(), pickUp, withBlock);
    expect(carriedLoot(carrying, 'p1')).toBe('block');
    expect(playerModifiers(carrying, 'p1')).toEqual({ speedMultiplier: 0.6, handsFree: false });
    expect(playerModifiers(start(), 'p1')).toEqual({ speedMultiplier: 1, handsFree: true });
  });

  it('slows the carrier down by the loot speed multiplier', () => {
    const state = run(start(), [[pickUp, move(0, 1)]]);
    expect(state.players.p1?.y).toBeCloseTo(80 + travelled(1, PLAYER_SPEED * LOOT.serverBlock.speedMultiplier));
  });

  it('moves carried loot along with the carrier', () => {
    const state = run(start(), [[pickUp, move(0, 1)], [], []]);
    expect(state.loot.block).toMatchObject({ x: state.players.p1?.x, y: state.players.p1?.y, carriedBy: 'p1' });
  });

  it('puts loot down at the feet and removes its modifiers', () => {
    const moved = run(start(), [[pickUp, move(0, 1)], [], [move(0, 0)]]);
    const dropped = applyCommand(moved, drop, withBlock);
    expect(dropped.loot.block).toMatchObject({ kind: 'serverBlock', x: moved.players.p1?.x, y: moved.players.p1?.y, carriedBy: null });
    expect(playerModifiers(dropped, 'p1')).toEqual({ speedMultiplier: 1, handsFree: true });
  });

  it('carries only one thing: picking up with full hands does nothing', () => {
    const two = createGameState(
      { ...withBlock, loot: [...withBlock.loot, lootSpawn('second', 'serverBlock', 120, 80)] },
      ['p1'],
    );
    const carrying = applyCommand(two, pickUp, withBlock);
    expect(applyCommand(carrying, pickUp, withBlock)).toBe(carrying);
  });

  it('ignores drop with empty hands', () => {
    const state = start();
    expect(applyCommand(state, drop, withBlock)).toBe(state);
  });

  it('keeps the state JSON-serializable while carrying', () => {
    const state = run(start(), [[pickUp, move(1, 1)], []]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('noise', () => {
  const walkTicks = (state: GameState, ticks: number, lvl = level) => {
    let current = step(state, [move(1, 0)], lvl);
    const noises = [...current.events];
    for (let i = 1; i < ticks; i++) {
      current = step(current, [], lvl);
      noises.push(...current.events);
    }
    return { state: current, noises: noises.filter((e) => e.type === 'noise:emitted') };
  };

  it('makes a footstep sound after walking for the footstep interval', () => {
    const { noises } = walkTicks(createGameState(level, ['p1']), FOOTSTEP_INTERVAL_TICKS);
    expect(noises).toHaveLength(1);
    expect(noises[0]).toMatchObject({ type: 'noise:emitted', radius: FOOTSTEP_RADIUS });
  });

  it('stays silent while standing still', () => {
    let state = createGameState(level, ['p1']);
    for (let i = 0; i < FOOTSTEP_INTERVAL_TICKS * 2; i++) {
      state = step(state, [], level);
      expect(state.events).toEqual([]);
    }
  });

  it('keeps events only for the tick they happened in', () => {
    const { state } = walkTicks(createGameState(level, ['p1']), FOOTSTEP_INTERVAL_TICKS);
    expect(step(state, [], level).events).toEqual([]);
  });

  it('applies the noise zone at the source: loud floors carry footsteps further, fans mask everything', () => {
    const everywhere = { x: 0, y: 0, width: 1000, height: 1000 };
    const loudFloor = { ...level, noiseZones: [{ name: 'grating', ...everywhere, surface: 1.5, masking: 0 }] };
    const fans = { ...level, noiseZones: [{ name: 'fans', ...everywhere, surface: 1, masking: 0.5 }] };
    expect(walkTicks(createGameState(loudFloor, ['p1']), FOOTSTEP_INTERVAL_TICKS, loudFloor).noises[0]?.radius).toBe(FOOTSTEP_RADIUS * 1.5);
    expect(walkTicks(createGameState(fans, ['p1']), FOOTSTEP_INTERVAL_TICKS, fans).noises[0]?.radius).toBe(FOOTSTEP_RADIUS * 0.5);
  });

  it('makes a loud sound when heavy loot is put down', () => {
    const withBlock = { ...level, loot: [lootSpawn('block', 'serverBlock', 112, 80)] };
    const carrying = step(createGameState(withBlock, ['p1']), [{ type: 'pickUp', playerId: 'p1' }], withBlock);
    const dropped = step(carrying, [{ type: 'drop', playerId: 'p1' }], withBlock);
    expect(dropped.events).toContainEqual({ type: 'noise:emitted', x: 112, y: 80, radius: LOOT.serverBlock.dropNoiseRadius });
  });
});

describe('extraction and outcome', () => {
  // Extraction zone over the left column of the room; two server blocks: one in the zone, one outside.
  const extractionLevel = {
    ...level,
    extraction: { x: 32, y: 32, width: 32, height: 96, label: 'Van' },
    loot: [
      lootSpawn('inside', 'serverBlock', 48, 48),
      lootSpawn('outside', 'serverBlock', 144, 80),
    ],
  };
  const extract: Command = { type: 'extract', playerId: 'p1' };
  const walkLeft = (state: GameState) => {
    let current = step(state, [move(-1, 0)], extractionLevel);
    for (let i = 0; i < 60; i++) {
      current = step(current, [], extractionLevel);
    }
    return current;
  };

  it('ignores extract outside the zone', () => {
    const state = createGameState(extractionLevel, ['p1']);
    expect(inExtraction(state, extractionLevel, 'p1')).toBe(false);
    expect(applyCommand(state, extract, extractionLevel)).toBe(state);
  });

  it('escapes with the loot lying in the zone plus what the player carries into it', () => {
    let state = createGameState(extractionLevel, ['p1']);
    state = step(state, [{ type: 'pickUp', playerId: 'p1' }], extractionLevel); // picks up "outside" in reach
    expect(carriedLoot(state, 'p1')).toBe('outside');
    state = walkLeft(state);
    expect(inExtraction(state, extractionLevel, 'p1')).toBe(true);
    expect(securedLoot(state, extractionLevel).sort()).toEqual(['inside', 'outside']);
    const ended = step(state, [extract], extractionLevel);
    expect(ended.outcome).toEqual({ result: 'escaped', loot: ['serverBlock', 'serverBlock'], value: 2 * LOOT.serverBlock.value });
  });

  it('can escape empty-handed, worth nothing', () => {
    const empty = { ...extractionLevel, loot: [] };
    let state = step(createGameState(empty, ['p1']), [move(-1, 0)], empty);
    for (let i = 0; i < 60; i++) state = step(state, [], empty);
    expect(step(state, [extract], empty).outcome).toEqual({ result: 'escaped', loot: [], value: 0 });
  });

  it('is caught when a guard on alarm reaches the player', () => {
    const state = createGameState(level, ['p1']);
    const guardLevel = { ...level, guards: [guardSpawn('g', [{ x: 150, y: 80 }, { x: 180, y: 80 }], { partner: null })] };
    const guard = { ...createGuards(guardLevel).g!, x: 112 + CATCH_DISTANCE - 1, y: 80, facing: Math.PI, mode: 'alarm' as const, suspicion: 1 };
    expect(step({ ...state, guards: { g: guard } }, [], guardLevel).outcome).toEqual({ result: 'caught' });
  });

  it('freezes the game once the run has ended', () => {
    const ended = { ...createGameState(level, ['p1']), outcome: { result: 'caught' as const } };
    expect(step(ended, [move(1, 0)], level)).toBe(ended);
  });

  it('spawns only one kind of loot when the debug switch asks for it', () => {
    const mixed = { ...level, loot: [lootSpawn('a', 'serverBlock', 50, 50)] };
    expect(Object.keys(createGameState(mixed, ['p1'], { onlyLoot: 'serverBlock' }).loot)).toEqual(['a']);
  });
});

describe('thermal', () => {
  const lootLevel = {
    ...level,
    loot: [
      lootSpawn('probe', 'cryoSample', 112, 80),
      lootSpawn('block', 'serverBlock', 144, 80),
    ],
  };
  const pickUp: Command = { type: 'pickUp', playerId: 'p1' };
  const drop: Command = { type: 'drop', playerId: 'p1' };
  const toggle: Command = { type: 'toggleThermal', playerId: 'p1' };
  const ticks = (state: GameState, count: number, lvl = lootLevel) => {
    let current = state;
    for (let i = 0; i < count; i++) current = step(current, [], lvl);
    return current;
  };

  it('keeps the cryo sample cold until it is picked up', () => {
    const state = ticks(createGameState(lootLevel, ['p1']), 5 * TICK_RATE);
    expect(state.loot.probe?.temperature).toBe(LOOT.cryoSample.temperature);
  });

  it('thaws the cryo sample from the first pickup on, even after it is put down again', () => {
    let state = step(createGameState(lootLevel, ['p1']), [pickUp], lootLevel);
    expect(state.loot.probe?.carriedBy).toBe('p1');
    state = step(state, [drop], lootLevel);
    state = ticks(state, 10 * TICK_RATE);
    expect(state.loot.probe?.temperature).toBeCloseTo(LOOT.cryoSample.temperature + LOOT.cryoSample.thawPerSecond * (10 + 2 / TICK_RATE), 3);
  });

  it('loses the cryo sample once fully thawed', () => {
    let state = step(createGameState(lootLevel, ['p1']), [pickUp], lootLevel);
    const seconds = Math.ceil((1 - LOOT.cryoSample.temperature) / LOOT.cryoSample.thawPerSecond) + 1;
    let lost = false;
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      state = step(state, [], lootLevel);
      lost ||= state.events.some((e) => e.type === 'loot:lost' && e.lootId === 'probe');
    }
    expect(lost).toBe(true);
    expect(state.loot.probe).toBeUndefined();
    expect(carriedLoot(state, 'p1')).toBeNull();
  });

  it('keeps the server block at room temperature', () => {
    const blockOnly = { ...level, loot: [lootSpawn('block', 'serverBlock', 112, 80)] };
    const state = ticks(step(createGameState(blockOnly, ['p1']), [pickUp], blockOnly), 5 * TICK_RATE, blockOnly);
    expect(state.loot.block?.temperature).toBe(LOOT.serverBlock.temperature);
  });

  it('switches thermal vision only with free hands, and two-handed loot switches it off', () => {
    const blockOnly = { ...level, loot: [lootSpawn('block', 'serverBlock', 112, 80)] };
    let state = applyCommand(createGameState(blockOnly, ['p1']), toggle, blockOnly);
    expect(state.players.p1?.thermalVision).toBe(true);
    state = applyCommand(state, pickUp, blockOnly);
    expect(state.players.p1?.thermalVision).toBe(false);
    expect(applyCommand(state, toggle, blockOnly)).toBe(state);
  });

  it('keeps thermal vision on while carrying the one-handed cryo sample', () => {
    let state = applyCommand(createGameState(lootLevel, ['p1']), toggle, lootLevel);
    state = applyCommand(state, pickUp, lootLevel);
    expect(carriedLoot(state, 'p1')).toBe('probe');
    expect(state.players.p1?.thermalVision).toBe(true);
  });

  it('leaves residual heat at every footstep', () => {
    let state = step(createGameState(level, ['p1']), [move(1, 0)], level);
    state = ticks(state, FOOTSTEP_INTERVAL_TICKS, level);
    expect(state.heatTraces).toHaveLength(1);
    expect(state.heatTraces[0]?.temperature).toBeLessThanOrEqual(HEAT_TRACE_TEMPERATURE);
  });

  it('lists players, guards, loot and traces as heat sources', () => {
    const state = createGameState(lootLevel, ['p1']);
    expect(heatSources(state)).toEqual([
      { x: 112, y: 80, temperature: PLAYER_TEMPERATURE },
      { x: 112, y: 80, temperature: LOOT.cryoSample.temperature },
      { x: 144, y: 80, temperature: LOOT.serverBlock.temperature },
    ]);
  });

  it('does not let thermal cameras react to the guards themselves', () => {
    const camLevel = {
      ...level,
      thermalCameras: [{ id: 'cam', x: 48, y: 80, facing: 0, fieldOfView: Math.PI / 2, range: 300 }],
      // The guard walks right through the camera's view.
      guards: [guardSpawn('g', [{ x: 90, y: 80 }, { x: 180, y: 80 }], { partner: null })],
    };
    // No players, so nothing but the guard is warm in view.
    const state = ticks(createGameState(camLevel, []), 2 * TICK_RATE, camLevel);
    expect(state.guards.g?.mode).toBe('patrol');
    expect(state.cameras.cam?.suspicion).toBe(0);
  });

  it('puts every guard on alarm when a thermal camera sees heat', () => {
    // A camera looks at the spawn; a warm source there is what a thawed probe would be.
    const camLevel = {
      ...level,
      thermalCameras: [{ id: 'cam', x: 48, y: 80, facing: 0, fieldOfView: Math.PI / 2, range: 300 }],
      guards: [guardSpawn('g', [{ x: 176, y: 48 }, { x: 176, y: 112 }], { partner: null })],
      loot: [lootSpawn('probe', 'cryoSample', 112, 80)],
    };
    let state = createGameState(camLevel, ['p1']);
    state = { ...state, loot: { probe: { ...(state.loot.probe as NonNullable<typeof state.loot.probe>), temperature: 0.8 } } };
    state = ticks(state, TICK_RATE, camLevel);
    expect(state.guards.g?.mode).toBe('alarm');
  });
});

describe('hiding', () => {
  // A hide spot 30 px right of the spawn, and a guard on alarm right next to it.
  const spot = { id: 'box', name: 'container', label: 'Kiste', x: 142, y: 80 };
  const hideLevel = { ...level, hideSpots: [spot], guards: [guardSpawn('g', [{ x: 150, y: 80 }, { x: 180, y: 80 }])] };
  const hide: Command = { type: 'hide', playerId: 'p1' };
  const start = () => createGameState(hideLevel, ['p1']);

  it('finds a hide spot within reach', () => {
    expect(hideSpotInReach(start(), hideLevel, 'p1')).toEqual(spot);
    expect(hideSpotInReach(start(), { ...hideLevel, hideSpots: [{ ...spot, x: 200 }] }, 'p1')).toBeNull();
  });

  it('enters the spot, stands still there and is neither seen nor caught', () => {
    let state = step(start(), [hide, move(1, 0)], hideLevel);
    expect(state.players.p1).toMatchObject({ hidden: 'box', x: spot.x, y: spot.y });
    const guard = { ...createGuards(hideLevel).g!, x: spot.x + 10, y: spot.y, facing: Math.PI, mode: 'alarm' as const, suspicion: 1 };
    state = step({ ...state, guards: { g: guard } }, [], hideLevel);
    expect(state.players.p1).toMatchObject({ x: spot.x, y: spot.y });
    expect(state.outcome).toBeNull();
    expect(state.guards.g?.lostTicks).toBe(1);
  });

  it('takes half a second in the open before moving again after leaving', () => {
    let state = step(start(), [hide], hideLevel);
    state = step(state, [hide, move(1, 0)], hideLevel);
    expect(state.players.p1?.hidden).toBeNull();
    expect(state.players.p1?.x).toBe(spot.x);
    for (let i = 0; i < HIDE_EXIT_TICKS - 1; i++) {
      state = step(state, [], hideLevel);
    }
    expect(state.players.p1?.x).toBe(spot.x);
    state = step(state, [], hideLevel);
    expect(state.players.p1?.x).toBeGreaterThan(spot.x);
  });

  it('takes carried loot along, which thermal cameras still see', () => {
    const withLoot = { ...hideLevel, loot: [lootSpawn('probe', 'cryoSample', 112, 80)] };
    let state = step(createGameState(withLoot, ['p1']), [{ type: 'pickUp', playerId: 'p1' }], withLoot);
    state = step(state, [hide], withLoot);
    expect(state.loot.probe).toMatchObject({ carriedBy: 'p1', x: spot.x, y: spot.y });
    expect(state.players.p1?.hidden).toBe('box');
  });

  it('does not pick up, drop or throw from inside', () => {
    const withLoot = { ...hideLevel, loot: [lootSpawn('block', 'serverBlock', 142, 80)] };
    let state = step(createGameState(withLoot, ['p1']), [hide], withLoot);
    state = step(state, [{ type: 'pickUp', playerId: 'p1' }, { type: 'throw', playerId: 'p1', direction: { x: 1, y: 0 } }], withLoot);
    expect(state.loot.block?.carriedBy).toBeNull();
    expect(state.players.p1?.bolts).toBe(BOLTS);
  });
});

describe('switches', () => {
  const everywhere = { x: 0, y: 0, width: 224, height: 160 };
  const switchLevel = {
    ...level,
    lights: [{ name: 'lamp', ...everywhere, brightness: 1 }],
    noiseZones: [{ name: 'fans', ...everywhere, surface: 1, masking: 0.5 }],
    switches: [
      { id: 'sw-light', name: 'light', label: 'Licht', x: 142, y: 80, target: 'lamp', alerts: ['g'] },
      { id: 'sw-fans', name: 'fans', label: 'Lüfter', x: 60, y: 80, target: 'fans', alerts: [] },
    ],
  };
  const toggle: Command = { type: 'toggleSwitch', playerId: 'p1' };

  it('finds the switch within reach', () => {
    expect(switchInReach(createGameState(switchLevel, ['p1']), switchLevel, 'p1')?.id).toBe('sw-light');
  });

  it('switches the zone off and on again, with a click and the alert for the named guards', () => {
    let state = step(createGameState(switchLevel, ['p1']), [toggle], switchLevel);
    expect(state.zones).toEqual({ lamp: false, fans: true });
    expect(state.events).toContainEqual({
      type: 'switch:used', switchId: 'sw-light', zone: 'lamp', on: false, x: 142, y: 80, alerts: ['g'],
    });
    // Masked by the fans still running.
    expect(state.events).toContainEqual({ type: 'noise:emitted', x: 142, y: 80, radius: 60 });
    state = step(state, [toggle], switchLevel);
    expect(state.zones.lamp).toBe(true);
  });

  it('lets a switched-off noise zone stop masking', () => {
    let state = step(createGameState(switchLevel, ['p1']), [move(-1, 0)], switchLevel);
    for (let i = 0; i < 10; i++) {
      state = step(state, [], switchLevel);
    }
    state = step(state, [move(0, 0), toggle], switchLevel);
    expect(switchInReach(state, switchLevel, 'p1')?.id).toBe('sw-fans');
    expect(state.zones.fans).toBe(false);
    // The click of the fan switch itself is no longer masked.
    expect(state.events).toContainEqual({ type: 'noise:emitted', x: 60, y: 80, radius: 120 });
    let footstep: { radius: number } | undefined;
    state = step(state, [move(1, 0)], switchLevel);
    for (let i = 0; i < FOOTSTEP_INTERVAL_TICKS && !footstep; i++) {
      state = step(state, [], switchLevel);
      footstep = state.events.find((e) => e.type === 'noise:emitted');
    }
    expect(footstep?.radius).toBe(FOOTSTEP_RADIUS);
  });

  it('keeps guards from seeing far into a light zone that is off', () => {
    const guardLevel = { ...switchLevel, guards: [guardSpawn('g', [{ x: 176, y: 112 }, { x: 176, y: 48 }])] };
    const guard = { ...createGuards(guardLevel).g!, x: 176, y: 80, facing: Math.PI };
    // The player stands 128 px away: in sight when lit, beyond the dark sight range when not.
    const start = createGameState(guardLevel, ['p1']);
    const apart = { ...start, players: { p1: { ...start.players.p1!, x: 48 } }, guards: { g: guard } };
    expect(step(apart, [], guardLevel).guards.g?.suspicion).toBeGreaterThan(0);
    expect(step({ ...apart, zones: { lamp: false, fans: true } }, [], guardLevel).guards.g?.suspicion).toBe(0);
  });
});

describe('throwing', () => {
  const throwRight: Command = { type: 'throw', playerId: 'p1', direction: { x: 1, y: 0 } };
  // Room wide enough for a full throw to the right of the spawn.
  const wide = levelFromRows(['#############', '#P...........#', '#############']);

  it('lands six tiles away and makes noise there, spending a bolt', () => {
    const state = step(createGameState(wide, ['p1']), [throwRight], wide);
    expect(state.players.p1?.bolts).toBe(BOLTS - 1);
    expect(state.events).toContainEqual({ type: 'noise:emitted', x: 48 + THROW_DISTANCE, y: 48, radius: THROW_NOISE_RADIUS });
  });

  it('drops in front of the first wall', () => {
    const state = step(createGameState(level, ['p1']), [throwRight], level);
    const noise = state.events.find((e) => e.type === 'noise:emitted');
    // The east wall starts at x = 192.
    expect(noise?.x).toBeGreaterThan(150);
    expect(noise?.x).toBeLessThan(192);
  });

  it('runs out after the last bolt, and needs free hands', () => {
    let state = createGameState(wide, ['p1']);
    for (let i = 0; i < BOLTS + 1; i++) {
      state = step(state, [throwRight], wide);
    }
    expect(state.players.p1?.bolts).toBe(0);
    expect(state.events).toEqual([]);
    const withBlock = { ...wide, loot: [lootSpawn('block', 'serverBlock', 48, 48)] };
    const carrying = step(createGameState(withBlock, ['p1']), [{ type: 'pickUp', playerId: 'p1' }], withBlock);
    expect(step(carrying, [throwRight], withBlock).players.p1?.bolts).toBe(BOLTS);
  });

  it('draws the nearest guard to the landing spot', () => {
    const guardLevel = { ...wide, guards: [guardSpawn('g', [{ x: 368, y: 48 }, { x: 336, y: 48 }])] };
    const state = step(createGameState(guardLevel, ['p1']), [throwRight], guardLevel);
    expect(state.guards.g?.mode).toBe('investigate');
    expect(state.guards.g?.target).toEqual({ x: 48 + THROW_DISTANCE, y: 48 });
  });
});

describe('takedown', () => {
  const takedown: Command = { type: 'takedown', playerId: 'p1' };
  const pairLevel = {
    ...level,
    guards: [
      guardSpawn('a', [{ x: 140, y: 80 }, { x: 180, y: 80 }], { partner: 'b' }),
      guardSpawn('b', [{ x: 180, y: 112 }, { x: 140, y: 112 }], { partner: 'a' }),
    ],
  };
  // Guard a stands 28 px right of the spawn; facing right, its back is to the player.
  const withGuard = (facing: number) => {
    const state = createGameState(pairLevel, ['p1']);
    return { ...state, guards: { ...state.guards, a: { ...state.guards.a!, x: 140, facing } } };
  };

  it('targets a guard within reach only from outside its view cone', () => {
    expect(takedownTarget(withGuard(0), 'p1')).toBe('a');
    expect(inViewCone(withGuard(Math.PI).guards.a!, { x: 112, y: 80 })).toBe(true);
    expect(takedownTarget(withGuard(Math.PI), 'p1')).toBeNull();
  });

  it('puts the guard down, alarms its partner and makes a small noise', () => {
    const state = step(withGuard(0), [takedown], pairLevel);
    expect(state.guards.a?.mode).toBe('down');
    expect(state.guards.b?.mode).toBe('alarm');
    expect(state.events).toContainEqual({ type: 'noise:emitted', x: 140, y: 80, radius: 60 });
    expect(takedownTarget(state, 'p1')).toBeNull();
  });

  it('needs free hands', () => {
    const withBlock = { ...pairLevel, loot: [lootSpawn('block', 'serverBlock', 112, 80)] };
    const carrying = step({ ...withGuard(0), loot: createGameState(withBlock, ['p1']).loot }, [{ type: 'pickUp', playerId: 'p1' }], withBlock);
    expect(carriedLoot(carrying, 'p1')).toBe('block');
    expect(takedownTarget(carrying, 'p1')).toBeNull();
  });
});

describe('sneaking', () => {
  const sneak: Command = { type: 'sneak', playerId: 'p1', on: true };
  const wide = levelFromRows(['#############', '#P...........#', '#############']);
  const walk = (state: GameState, ticks: number) => {
    let current = state;
    const noises: number[] = [];
    for (let i = 0; i < ticks; i++) {
      current = step(current, [], wide);
      noises.push(...current.events.flatMap((e) => (e.type === 'noise:emitted' ? [e.radius] : [])));
    }
    return { state: current, noises };
  };

  it('halves the speed and makes no sound on a plain floor, but still leaves heat', () => {
    const walking = walk(step(createGameState(wide, ['p1']), [move(1, 0)], wide), FOOTSTEP_INTERVAL_TICKS);
    const sneaking = walk(step(createGameState(wide, ['p1']), [move(1, 0), sneak], wide), FOOTSTEP_INTERVAL_TICKS);
    expect(sneaking.state.players.p1!.x - 48).toBeCloseTo((walking.state.players.p1!.x - 48) * SNEAK_SPEED_FACTOR);
    expect(walking.noises).toEqual([FOOTSTEP_RADIUS]);
    expect(sneaking.noises).toEqual([]);
    expect(sneaking.state.heatTraces).toHaveLength(1);
  });

  it('still gives the player away on a loud floor, by how much louder it is', () => {
    const grating = { ...wide, noiseZones: [{ name: 'grating', x: 0, y: 0, width: 416, height: 96, surface: 1.6, masking: 0 }] };
    let state = step(createGameState(grating, ['p1']), [move(1, 0), sneak], grating);
    let radius = 0;
    for (let i = 0; i < FOOTSTEP_INTERVAL_TICKS; i++) {
      state = step(state, [], grating);
      radius = state.events.find((e) => e.type === 'noise:emitted')?.radius ?? radius;
    }
    expect(radius).toBeCloseTo(FOOTSTEP_RADIUS * 0.6);
    expect(radius).toBeGreaterThan(TAKEDOWN_REACH);
  });

  it('stops sneaking on command', () => {
    const state = step(step(createGameState(wide, ['p1']), [sneak], wide), [{ type: 'sneak', playerId: 'p1', on: false }], wide);
    expect(state.players.p1?.sneaking).toBe(false);
  });
});
