import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createGameState,
  PLAYER_SIZE,
  PLAYER_SPEED,
  step,
  TICK_SECONDS,
  type Command,
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
    expect(state).toEqual({ tick: 0, players: { p1: { x: 112, y: 80, direction: { x: 0, y: 0 } } } });
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
