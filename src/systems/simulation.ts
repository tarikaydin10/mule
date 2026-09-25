import { moveAndCollide } from './collision';
import type { Level } from './level';
import { computeVelocity, STILL, type Direction } from './movement';

/**
 * The whole game state: plain data, serializable as JSON, never stored in Phaser objects.
 * It changes only through commands and `step`.
 */
export interface GameState {
  tick: number;
  players: Record<string, PlayerState>;
}

export interface PlayerState {
  x: number;
  y: number;
  /** Direction the player wants to move in, set by `move` commands. */
  direction: Direction;
}

/** Everything a player (or later a remote client) can ask the simulation to do. */
export type Command = { type: 'move'; playerId: string; direction: Direction };

/** Fixed simulation rate, so every host computes the same result for the same commands. */
export const TICK_RATE = 60;
export const TICK_SECONDS = 1 / TICK_RATE;

export const PLAYER_SPEED = 160; // px/s
export const PLAYER_SIZE = 20; // px, below the 32 px tile size so one-tile gaps stay passable

export function createGameState(level: Level, playerIds: string[]): GameState {
  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) {
    players[id] = { x: level.spawn.x, y: level.spawn.y, direction: STILL };
  }
  return { tick: 0, players };
}

export function applyCommand(state: GameState, command: Command): GameState {
  switch (command.type) {
    case 'move': {
      const player = state.players[command.playerId];
      if (!player) {
        return state;
      }
      return {
        ...state,
        players: { ...state.players, [command.playerId]: { ...player, direction: command.direction } },
      };
    }
  }
}

/** Applies the commands of this tick, then advances the world by one fixed tick. */
export function step(state: GameState, commands: readonly Command[], level: Level): GameState {
  const commanded = commands.reduce(applyCommand, state);
  const players: Record<string, PlayerState> = {};
  for (const [id, player] of Object.entries(commanded.players)) {
    const velocity = computeVelocity(player.direction, PLAYER_SPEED);
    const position = moveAndCollide(level, player, PLAYER_SIZE / 2, {
      x: velocity.x * TICK_SECONDS,
      y: velocity.y * TICK_SECONDS,
    });
    players[id] = { ...player, ...position };
  }
  return { tick: commanded.tick + 1, players };
}
