import { describe, expect, it } from 'vitest';
import { LOOT } from './loot';
import {
  applyCommand,
  carriedLoot,
  createGameState,
  lootInReach,
  PICKUP_REACH,
  PLAYER_SIZE,
  PLAYER_SPEED,
  playerModifiers,
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
    expect(state).toEqual({ tick: 0, players: { p1: { x: 112, y: 80, direction: { x: 0, y: 0 } } }, loot: {} });
  });
});

describe('applyCommand', () => {
  it('sets the direction of the commanded player without touching the old state', () => {
    const state = createGameState(level, ['p1']);
    const next = applyCommand(state, move(1, 0));
    expect(next.players.p1?.direction).toEqual({ x: 1, y: 0 });
    expect(state.players.p1?.direction).toEqual({ x: 0, y: 0 });
  });

  it('ignores commands for unknown players', () => {
    const state = createGameState(level, ['p1']);
    expect(applyCommand(state, { type: 'move', playerId: 'ghost', direction: { x: 1, y: 0 } })).toBe(state);
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
    expect(start().loot).toEqual({ block: { kind: 'serverBlock', x: 142, y: 80, carriedBy: null } });
  });

  it('finds loot within reach and ignores loot beyond it', () => {
    expect(lootInReach(start(), 'p1')).toBe('block');
    const far = createGameState({ ...withBlock, loot: [{ id: 'block', kind: 'serverBlock', x: 112 + PICKUP_REACH + 1, y: 80 }] }, ['p1']);
    expect(lootInReach(far, 'p1')).toBeNull();
    expect(applyCommand(far, pickUp)).toBe(far);
  });

  it('picks up loot in reach and applies its modifiers', () => {
    const carrying = applyCommand(start(), pickUp);
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
    const dropped = applyCommand(moved, drop);
    expect(dropped.loot.block).toEqual({ kind: 'serverBlock', x: moved.players.p1?.x, y: moved.players.p1?.y, carriedBy: null });
    expect(playerModifiers(dropped, 'p1')).toEqual({ speedMultiplier: 1, handsFree: true });
  });

  it('carries only one thing: picking up with full hands does nothing', () => {
    const two = createGameState(
      { ...withBlock, loot: [...withBlock.loot, { id: 'second', kind: 'serverBlock', x: 120, y: 80 }] },
      ['p1'],
    );
    const carrying = applyCommand(two, pickUp);
    expect(applyCommand(carrying, pickUp)).toBe(carrying);
  });

  it('ignores drop with empty hands', () => {
    const state = start();
    expect(applyCommand(state, drop)).toBe(state);
  });

  it('keeps the state JSON-serializable while carrying', () => {
    const state = run(start(), [[pickUp, move(1, 1)], []]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
