import { describe, expect, it } from 'vitest';
import { LOOT } from './loot';
import { FOOTSTEP_INTERVAL_TICKS, FOOTSTEP_RADIUS } from './noise';
import { HEAT_TRACE_TEMPERATURE, PLAYER_TEMPERATURE } from './thermal';
import { TICK_RATE } from './tick';
import {
  applyCommand,
  CATCH_DISTANCE,
  carriedLoot,
  createGameState,
  inExtraction,
  lootInReach,
  PICKUP_REACH,
  PLAYER_SIZE,
  PLAYER_SPEED,
  heatSources,
  playerModifiers,
  securedLoot,
  step,
  TICK_SECONDS,
  type Command,
  type GameState,
} from './simulation';
import { levelFromRows } from './testLevel';

const level = levelFromRows([
  '#######',
  '#.....#',
  '#..P..#',
  '#.....#',
  '#######',
]);
const move = (x: -1 | 0 | 1, y: -1 | 0 | 1): Command => ({ type: 'move', playerId: 'p1', direction: { x, y } });

describe('createGameState', () => {
  it('places every player at the spawn, standing still', () => {
    const state = createGameState(level, ['p1']);
    expect(state).toEqual({
      tick: 0,
      players: { p1: { x: 112, y: 80, direction: { x: 0, y: 0 }, stepTicks: 0, thermalVision: false } },
      loot: {},
      guards: {},
      cameras: {},
      heatTraces: [],
      events: [],
      outcome: null,
    });
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
  it('advances the tick and moves by speed times the fixed tick length', () => {
    const next = step(createGameState(level, ['p1']), [move(1, 0)], level);
    expect(next.tick).toBe(1);
    expect(next.players.p1?.x).toBeCloseTo(112 + PLAYER_SPEED * TICK_SECONDS);
    expect(next.players.p1?.y).toBe(80);
  });

  it('keeps moving in the last commanded direction until a new command arrives', () => {
    let state = step(createGameState(level, ['p1']), [move(0, 1)], level);
    state = step(state, [], level);
    expect(state.players.p1?.y).toBeCloseTo(80 + 2 * PLAYER_SPEED * TICK_SECONDS);
    state = step(state, [move(0, 0)], level);
    expect(state.players.p1?.y).toBeCloseTo(80 + 2 * PLAYER_SPEED * TICK_SECONDS);
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
  const withBlock = { ...level, loot: [{ id: 'block', kind: 'serverBlock' as const, x: 142, y: 80 }] };
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
    const far = createGameState({ ...withBlock, loot: [{ id: 'block', kind: 'serverBlock', x: 112 + PICKUP_REACH + 1, y: 80 }] }, ['p1']);
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
    expect(state.players.p1?.y).toBeCloseTo(80 + PLAYER_SPEED * LOOT.serverBlock.speedMultiplier * TICK_SECONDS);
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
      { ...withBlock, loot: [...withBlock.loot, { id: 'second', kind: 'serverBlock', x: 120, y: 80 }] },
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
    const withBlock = { ...level, loot: [{ id: 'block', kind: 'serverBlock' as const, x: 112, y: 80 }] };
    const carrying = step(createGameState(withBlock, ['p1']), [{ type: 'pickUp', playerId: 'p1' }], withBlock);
    const dropped = step(carrying, [{ type: 'drop', playerId: 'p1' }], withBlock);
    expect(dropped.events).toContainEqual({ type: 'noise:emitted', x: 112, y: 80, radius: LOOT.serverBlock.dropNoiseRadius });
  });
});

describe('extraction and outcome', () => {
  // Extraction zone over the left column of the room; two server blocks: one in the zone, one outside.
  const extractionLevel = {
    ...level,
    extraction: { x: 32, y: 32, width: 32, height: 96 },
    loot: [
      { id: 'inside', kind: 'serverBlock' as const, x: 48, y: 48 },
      { id: 'outside', kind: 'serverBlock' as const, x: 144, y: 80 },
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
    const guard = {
      kind: 'dockGuard' as const, x: 112 + CATCH_DISTANCE - 1, y: 80, facing: Math.PI, mode: 'alarm' as const,
      suspicion: 1, routeIndex: 0, path: [], target: null, searchTicks: 0,
    };
    const guardLevel = { ...level, guards: [{ id: 'g', kind: 'dockGuard' as const, route: [{ x: 150, y: 80 }, { x: 180, y: 80 }], partner: null }] };
    expect(step({ ...state, guards: { g: guard } }, [], guardLevel).outcome).toEqual({ result: 'caught' });
  });

  it('freezes the game once the run has ended', () => {
    const ended = { ...createGameState(level, ['p1']), outcome: { result: 'caught' as const } };
    expect(step(ended, [move(1, 0)], level)).toBe(ended);
  });

  it('spawns only one kind of loot when the debug switch asks for it', () => {
    const mixed = { ...level, loot: [{ id: 'a', kind: 'serverBlock' as const, x: 50, y: 50 }] };
    expect(Object.keys(createGameState(mixed, ['p1'], { onlyLoot: 'serverBlock' }).loot)).toEqual(['a']);
  });
});

describe('thermal', () => {
  const lootLevel = {
    ...level,
    loot: [
      { id: 'probe', kind: 'cryoSample' as const, x: 112, y: 80 },
      { id: 'block', kind: 'serverBlock' as const, x: 144, y: 80 },
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
    const blockOnly = { ...level, loot: [{ id: 'block', kind: 'serverBlock' as const, x: 112, y: 80 }] };
    const state = ticks(step(createGameState(blockOnly, ['p1']), [pickUp], blockOnly), 5 * TICK_RATE, blockOnly);
    expect(state.loot.block?.temperature).toBe(LOOT.serverBlock.temperature);
  });

  it('switches thermal vision only with free hands, and two-handed loot switches it off', () => {
    const blockOnly = { ...level, loot: [{ id: 'block', kind: 'serverBlock' as const, x: 112, y: 80 }] };
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
      guards: [{ id: 'g', kind: 'dockGuard' as const, route: [{ x: 90, y: 80 }, { x: 180, y: 80 }], partner: null }],
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
      guards: [{ id: 'g', kind: 'dockGuard' as const, route: [{ x: 176, y: 48 }, { x: 176, y: 112 }], partner: null }],
      loot: [{ id: 'probe', kind: 'cryoSample' as const, x: 112, y: 80 }],
    };
    let state = createGameState(camLevel, ['p1']);
    state = { ...state, loot: { probe: { ...(state.loot.probe as NonNullable<typeof state.loot.probe>), temperature: 0.8 } } };
    state = ticks(state, TICK_RATE, camLevel);
    expect(state.guards.g?.mode).toBe('alarm');
  });
});
