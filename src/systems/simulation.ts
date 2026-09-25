import { moveAndCollide } from './collision';
import type { GameEvent } from './events';
import { createGuards, updateGuards, type GuardState } from './guards';
import type { Level } from './level';
import { LOOT, type LootKind } from './loot';
import { computeVelocity, STILL, type Direction, type Vector2 } from './movement';
import { FOOTSTEP_INTERVAL_TICKS, FOOTSTEP_RADIUS, noiseRadius } from './noise';
import { TICK_SECONDS } from './tick';

export { TICK_RATE, TICK_SECONDS } from './tick';

/**
 * The whole game state: plain data, serializable as JSON, never stored in Phaser objects.
 * It changes only through commands and `step`.
 */
export interface GameState {
  tick: number;
  players: Record<string, PlayerState>;
  loot: Record<string, LootState>;
  guards: Record<string, GuardState>;
  /** What happened during the last tick. */
  events: GameEvent[];
}

export interface PlayerState {
  x: number;
  y: number;
  /** Direction the player wants to move in, set by `move` commands. */
  direction: Direction;
  /** Ticks walked since the last footstep sound. */
  stepTicks: number;
}

export interface LootState {
  kind: LootKind;
  x: number;
  y: number;
  /** Id of the player carrying it; while carried it moves with that player. */
  carriedBy: string | null;
}

/** Everything a player (or later a remote client) can ask the simulation to do. */
export type Command =
  | { type: 'move'; playerId: string; direction: Direction }
  /** Picks up the nearest loot within reach, if the player carries nothing. */
  | { type: 'pickUp'; playerId: string }
  /** Puts down what the player carries, at the player's feet. */
  | { type: 'drop'; playerId: string };

/** What carried loot currently does to a player. */
export interface Modifiers {
  speedMultiplier: number;
  handsFree: boolean;
}

export const PLAYER_SPEED = 160; // px/s
export const PLAYER_SIZE = 20; // px, below the 32 px tile size so one-tile gaps stay passable
export const PICKUP_REACH = 36; // px, from the player's centre to the loot's

const NO_MODIFIERS: Modifiers = { speedMultiplier: 1, handsFree: true };

export function createGameState(level: Level, playerIds: string[]): GameState {
  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) {
    players[id] = { x: level.spawn.x, y: level.spawn.y, direction: STILL, stepTicks: 0 };
  }
  const loot: Record<string, LootState> = {};
  for (const spawn of level.loot) {
    loot[spawn.id] = { kind: spawn.kind, x: spawn.x, y: spawn.y, carriedBy: null };
  }
  return { tick: 0, players, loot, guards: createGuards(level), events: [] };
}

/** Id of the loot the player carries, or null. */
export function carriedLoot(state: GameState, playerId: string): string | null {
  return Object.entries(state.loot).find(([, loot]) => loot.carriedBy === playerId)?.[0] ?? null;
}

/** The modifiers of the carried loot, or none when the player carries nothing. */
export function playerModifiers(state: GameState, playerId: string): Modifiers {
  const carried = carriedLoot(state, playerId);
  const loot = carried ? state.loot[carried] : undefined;
  if (!loot) {
    return NO_MODIFIERS;
  }
  const definition = LOOT[loot.kind];
  return { speedMultiplier: definition.speedMultiplier, handsFree: definition.handsFree };
}

/** Id of the nearest loot lying within reach of the player, or null. */
export function lootInReach(state: GameState, playerId: string): string | null {
  const player = state.players[playerId];
  if (!player) {
    return null;
  }
  let nearest: string | null = null;
  let nearestDistance = PICKUP_REACH;
  for (const [id, loot] of Object.entries(state.loot)) {
    const distance = Math.hypot(loot.x - player.x, loot.y - player.y);
    if (loot.carriedBy === null && distance <= nearestDistance) {
      nearest = id;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** Applies one command. Commands that make a sound add a noise event to `state.events`. */
export function applyCommand(state: GameState, command: Command, level: Level): GameState {
  const player = state.players[command.playerId];
  if (!player) {
    return state;
  }
  switch (command.type) {
    case 'move':
      return {
        ...state,
        players: { ...state.players, [command.playerId]: { ...player, direction: command.direction } },
      };
    case 'pickUp': {
      const target = carriedLoot(state, command.playerId) ? null : lootInReach(state, command.playerId);
      return target ? withLoot(state, target, { carriedBy: command.playerId, x: player.x, y: player.y }) : state;
    }
    case 'drop': {
      const carried = carriedLoot(state, command.playerId);
      const loot = carried ? state.loot[carried] : undefined;
      if (!carried || !loot) {
        return state;
      }
      const radius = noiseRadius(level, player, LOOT[loot.kind].dropNoiseRadius, 'impact');
      return {
        ...withLoot(state, carried, { carriedBy: null, x: player.x, y: player.y }),
        events: [...state.events, { type: 'noise:emitted', x: player.x, y: player.y, radius }],
      };
    }
  }
}

/**
 * Applies the commands of this tick, then advances the world by one fixed tick:
 * players move and make footstep noise, then guards react to this tick's noise
 * and to last tick's alerts from their partners.
 */
export function step(state: GameState, commands: readonly Command[], level: Level): GameState {
  const commanded = commands.reduce(
    (current, command) => applyCommand(current, command, level),
    { ...state, events: [] as GameEvent[] },
  );
  const events = [...commanded.events];

  const players: Record<string, PlayerState> = {};
  for (const [id, player] of Object.entries(commanded.players)) {
    const speed = PLAYER_SPEED * playerModifiers(commanded, id).speedMultiplier;
    const velocity = computeVelocity(player.direction, speed);
    const position = moveAndCollide(level, player, PLAYER_SIZE / 2, {
      x: velocity.x * TICK_SECONDS,
      y: velocity.y * TICK_SECONDS,
    });
    const moved = position.x !== player.x || position.y !== player.y;
    let stepTicks = moved ? player.stepTicks + 1 : player.stepTicks;
    if (stepTicks >= FOOTSTEP_INTERVAL_TICKS) {
      stepTicks = 0;
      events.push({ type: 'noise:emitted', ...position, radius: noiseRadius(level, position, FOOTSTEP_RADIUS, 'footstep') });
    }
    players[id] = { ...player, ...position, stepTicks };
  }

  const partnerAlerts = state.events.filter((event) => event.type === 'guard:alerted');
  const guards = updateGuards(commanded.guards, Object.values(players), level, [...events, ...partnerAlerts]);

  return {
    tick: commanded.tick + 1,
    players,
    loot: followCarriers(commanded.loot, players),
    guards: guards.guards,
    events: [...events, ...guards.events],
  };
}

/** Carried loot moves with its carrier, so its position in the state is always current. */
function followCarriers(loot: Record<string, LootState>, players: Record<string, Vector2>): Record<string, LootState> {
  const result: Record<string, LootState> = {};
  for (const [id, item] of Object.entries(loot)) {
    const carrier = item.carriedBy ? players[item.carriedBy] : undefined;
    result[id] = carrier ? { ...item, x: carrier.x, y: carrier.y } : item;
  }
  return result;
}

function withLoot(state: GameState, id: string, changes: Partial<LootState>): GameState {
  const loot = state.loot[id];
  return loot ? { ...state, loot: { ...state.loot, [id]: { ...loot, ...changes } } } : state;
}
