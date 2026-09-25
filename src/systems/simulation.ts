import { moveAndCollide } from './collision';
import type { GameEvent } from './events';
import { createGuards, updateGuards, type GuardState } from './guards';
import { GUARDS } from './guardTypes';
import { insideRect, type Level } from './level';
import { LOOT, type LootKind } from './loot';
import { computeVelocity, STILL, type Direction, type Vector2 } from './movement';
import { FOOTSTEP_INTERVAL_TICKS, FOOTSTEP_RADIUS, noiseRadius } from './noise';
import { createCameras, updateCameras, type CameraState } from './sensors';
import { addTrace, coolTraces, PLAYER_TEMPERATURE, type HeatSource, type HeatTrace } from './thermal';
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
  /** Thermal cameras by id. */
  cameras: Record<string, CameraState>;
  /** Residual heat of footsteps, fading over time. */
  heatTraces: HeatTrace[];
  /** What happened during the last tick. */
  events: GameEvent[];
  /** How the run ended, or null while it is still going. Nothing changes after the end. */
  outcome: Outcome | null;
}

export type Outcome =
  /** Players left through the extraction; `loot` lists what they secured. */
  | { result: 'escaped'; loot: LootKind[]; value: number }
  /** A guard on alarm reached a player. */
  | { result: 'caught' };

export interface PlayerState {
  x: number;
  y: number;
  /** Direction the player wants to move in, set by `move` commands. */
  direction: Direction;
  /** Ticks walked since the last footstep sound. */
  stepTicks: number;
  /** Whether the thermal vision gadget is on; it needs free hands. */
  thermalVision: boolean;
}

export interface LootState {
  kind: LootKind;
  x: number;
  y: number;
  /** Id of the player carrying it; while carried it moves with that player. */
  carriedBy: string | null;
  /** 0 (cold) to 1 (hot). */
  temperature: number;
  /** Set on the first pickup for loot that thaws; from then on it warms up every tick. */
  thawing: boolean;
}

/** Everything a player (or later a remote client) can ask the simulation to do. */
export type Command =
  | { type: 'move'; playerId: string; direction: Direction }
  /** Picks up the nearest loot within reach, if the player carries nothing. */
  | { type: 'pickUp'; playerId: string }
  /** Puts down what the player carries, at the player's feet. */
  | { type: 'drop'; playerId: string }
  /** Ends the run from inside the extraction zone, taking all secured loot. */
  | { type: 'extract'; playerId: string }
  /** Switches the thermal vision gadget on or off; needs free hands. */
  | { type: 'toggleThermal'; playerId: string };

/** What carried loot currently does to a player. */
export interface Modifiers {
  speedMultiplier: number;
  handsFree: boolean;
}

export const PLAYER_SPEED = 160; // px/s
export const PLAYER_SIZE = 20; // px, below the 32 px tile size so one-tile gaps stay passable
export const PICKUP_REACH = 36; // px, from the player's centre to the loot's
export const CATCH_DISTANCE = 22; // px, a guard on alarm this close catches the player

const NO_MODIFIERS: Modifiers = { speedMultiplier: 1, handsFree: true };

export interface GameOptions {
  /** Debug switch: spawn only loot of this kind, to compare runs with a single target. */
  onlyLoot?: LootKind;
}

export function createGameState(level: Level, playerIds: string[], options: GameOptions = {}): GameState {
  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) {
    players[id] = { x: level.spawn.x, y: level.spawn.y, direction: STILL, stepTicks: 0, thermalVision: false };
  }
  const loot: Record<string, LootState> = {};
  for (const spawn of level.loot) {
    if (options.onlyLoot && spawn.kind !== options.onlyLoot) {
      continue;
    }
    loot[spawn.id] = {
      kind: spawn.kind,
      x: spawn.x,
      y: spawn.y,
      carriedBy: null,
      temperature: LOOT[spawn.kind].temperature,
      thawing: false,
    };
  }
  return {
    tick: 0,
    players,
    loot,
    guards: createGuards(level),
    cameras: createCameras(level),
    heatTraces: [],
    events: [],
    outcome: null,
  };
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

/**
 * Loot that leaves when the players extract: lying in the extraction zone, or carried
 * by a player standing in it.
 */
export function securedLoot(state: GameState, level: Level): string[] {
  const zone = level.extraction;
  if (!zone) {
    return [];
  }
  return Object.entries(state.loot)
    .filter(([, loot]) => insideRect(zone, loot))
    .map(([id]) => id);
}

export function inExtraction(state: GameState, level: Level, playerId: string): boolean {
  const player = state.players[playerId];
  return Boolean(player && level.extraction && insideRect(level.extraction, player));
}

/** Everything warm in the world, as the thermal gadget perceives it. */
export function heatSources(state: GameState): HeatSource[] {
  return [
    ...Object.values(state.guards).map((guard) => ({ x: guard.x, y: guard.y, temperature: GUARDS[guard.kind].temperature })),
    ...intruderHeat(state),
  ];
}

/** What thermal cameras watch for: players, loot and their traces. The guards' own body heat is expected. */
export function intruderHeat(state: GameState): HeatSource[] {
  return [
    ...Object.values(state.players).map((player) => ({ x: player.x, y: player.y, temperature: PLAYER_TEMPERATURE })),
    ...Object.values(state.loot).map((loot) => ({ x: loot.x, y: loot.y, temperature: loot.temperature })),
    ...state.heatTraces,
  ];
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
      const loot = target ? state.loot[target] : undefined;
      if (!target || !loot) {
        return state;
      }
      const definition = LOOT[loot.kind];
      const picked = withLoot(state, target, {
        carriedBy: command.playerId,
        x: player.x,
        y: player.y,
        thawing: loot.thawing || definition.thawPerSecond > 0,
      });
      // Loot that needs both hands takes them off the thermal gadget.
      return definition.handsFree
        ? picked
        : { ...picked, players: { ...picked.players, [command.playerId]: { ...player, thermalVision: false } } };
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
    case 'toggleThermal': {
      if (!playerModifiers(state, command.playerId).handsFree) {
        return state;
      }
      return {
        ...state,
        players: { ...state.players, [command.playerId]: { ...player, thermalVision: !player.thermalVision } },
      };
    }
    case 'extract': {
      if (!inExtraction(state, level, command.playerId)) {
        return state;
      }
      const loot = securedLoot(state, level).flatMap((id) => (state.loot[id] ? [state.loot[id].kind] : []));
      const value = loot.reduce((sum, kind) => sum + LOOT[kind].value, 0);
      return { ...state, outcome: { result: 'escaped', loot, value } };
    }
  }
}

/**
 * Applies the commands of this tick, then advances the world by one fixed tick:
 * players move and make footstep noise, then guards react to this tick's noise
 * and to last tick's alerts from their partners.
 */
export function step(state: GameState, commands: readonly Command[], level: Level): GameState {
  if (state.outcome) {
    return state;
  }
  const commanded = commands.reduce(
    (current, command) => applyCommand(current, command, level),
    { ...state, events: [] as GameEvent[] },
  );
  const events = [...commanded.events];
  let heatTraces = coolTraces(commanded.heatTraces, TICK_SECONDS);

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
      heatTraces = addTrace(heatTraces, position);
    }
    players[id] = { ...player, ...position, stepTicks };
  }

  const loot = thaw(followCarriers(commanded.loot, players), events);
  const cameras = updateCameras(commanded.cameras, intruderHeat({ ...commanded, players, loot, heatTraces }), level);
  events.push(...cameras.events);

  const partnerAlerts = state.events.filter((event) => event.type === 'guard:alerted');
  const guards = updateGuards(commanded.guards, Object.values(players), level, [...events, ...partnerAlerts]);

  const caught = Object.values(guards.guards).some(
    (guard) =>
      guard.mode === 'alarm' &&
      Object.values(players).some((player) => Math.hypot(player.x - guard.x, player.y - guard.y) <= CATCH_DISTANCE),
  );

  return {
    tick: commanded.tick + 1,
    players,
    loot,
    guards: guards.guards,
    cameras: cameras.cameras,
    heatTraces,
    events: [...events, ...guards.events],
    outcome: commanded.outcome ?? (caught ? { result: 'caught' } : null),
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

/** Warms thawing loot by one tick; loot that reaches 1 is lost and leaves a `loot:lost` event. */
function thaw(loot: Record<string, LootState>, events: GameEvent[]): Record<string, LootState> {
  const result: Record<string, LootState> = {};
  for (const [id, item] of Object.entries(loot)) {
    if (!item.thawing) {
      result[id] = item;
      continue;
    }
    const temperature = item.temperature + LOOT[item.kind].thawPerSecond * TICK_SECONDS;
    if (temperature >= 1) {
      events.push({ type: 'loot:lost', lootId: id, x: item.x, y: item.y });
      continue;
    }
    result[id] = { ...item, temperature };
  }
  return result;
}

function withLoot(state: GameState, id: string, changes: Partial<LootState>): GameState {
  const loot = state.loot[id];
  return loot ? { ...state, loot: { ...state.loot, [id]: { ...loot, ...changes } } } : state;
}
