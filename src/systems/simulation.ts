import { moveAndCollide } from './collision';
import type { GameEvent } from './events';
import { createGuards, inViewCone, knockOut, updateGuards, type GuardContext, type GuardState } from './guards';
import { GUARDS } from './guardTypes';
import { insideRect, type HideSpot, type Level, type SwitchSpawn } from './level';
import { LOOT, type LootKind } from './loot';
import { computeVelocity, STILL, type Direction, type Vector2 } from './movement';
import { FOOTSTEP_INTERVAL_TICKS, FOOTSTEP_RADIUS, noiseRadius, SNEAK_SPEED_FACTOR } from './noise';
import { pick } from './random';
import { createCameras, updateCameras, type CameraState } from './sensors';
import { addTrace, coolTraces, PLAYER_TEMPERATURE, type HeatSource, type HeatTrace } from './thermal';
import { TICK_SECONDS } from './tick';
import { castRay } from './visibility';

export { TICK_RATE, TICK_SECONDS } from './tick';

/**
 * The whole game state: plain data, serializable as JSON, never stored in Phaser objects.
 * It changes only through commands and `step`.
 */
export interface GameState {
  tick: number;
  /** Seed of this run's random choices; the same on every host. */
  seed: number;
  /** Debug: no random choices, first variant everywhere, so runs are comparable. */
  fixed: boolean;
  players: Record<string, PlayerState>;
  loot: Record<string, LootState>;
  guards: Record<string, GuardState>;
  /** Thermal cameras by id. */
  cameras: Record<string, CameraState>;
  /** Residual heat of footsteps, fading over time. */
  heatTraces: HeatTrace[];
  /** Whether each named light or noise zone is on; switches toggle them. */
  zones: Record<string, boolean>;
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
  /** Sneaking: slower and quieter, set by `sneak` commands. */
  sneaking: boolean;
  /** Current velocity in px/s; it follows the wanted direction with some inertia. */
  vx: number;
  vy: number;
  /** Ticks walked since the last footstep sound. */
  stepTicks: number;
  /** Whether the thermal vision gadget is on; it needs free hands. */
  thermalVision: boolean;
  /** Id of the hide spot the player is in, or null. Hidden players cannot move and are not seen. */
  hidden: string | null;
  /** Ticks left before the player can move again after leaving a hide spot. */
  emergeTicks: number;
  /** Bolts left to throw this run. */
  bolts: number;
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
  /** Starts or stops sneaking. */
  | { type: 'sneak'; playerId: string; on: boolean }
  /** Picks up the nearest loot within reach, if the player carries nothing. */
  | { type: 'pickUp'; playerId: string }
  /** Puts down what the player carries, at the player's feet. */
  | { type: 'drop'; playerId: string }
  /** Ends the run from inside the extraction zone, taking all secured loot. */
  | { type: 'extract'; playerId: string }
  /** Switches the thermal vision gadget on or off; needs free hands. */
  | { type: 'toggleThermal'; playerId: string }
  /** Enters the hide spot within reach, or leaves the one the player is in. */
  | { type: 'hide'; playerId: string }
  /** Flips the switch within reach: its zone goes off or on, with a click the named guards check on. */
  | { type: 'toggleSwitch'; playerId: string }
  /** Throws a bolt in the given direction; it lands six tiles away or at the first wall and makes noise. */
  | { type: 'throw'; playerId: string; direction: Direction }
  /** Knocks out the guard within reach whose view cone the player is outside of; needs free hands. */
  | { type: 'takedown'; playerId: string };

/** What carried loot currently does to a player. */
export interface Modifiers {
  speedMultiplier: number;
  handsFree: boolean;
}

export const PLAYER_SPEED = 120; // px/s, walking; guards chase faster than this
// Share of the gap to the wanted velocity closed per tick: starting takes about a tenth of a
// second, stopping a little less. Gives movement weight without making it sluggish.
export const PLAYER_ACCELERATION = 0.28;
export const PLAYER_DECELERATION = 0.4;
export const PLAYER_SIZE = 20; // px, below the 32 px tile size so one-tile gaps stay passable
export const PICKUP_REACH = 36; // px, from the player's centre to the loot's
export const CATCH_DISTANCE = 22; // px, a guard on alarm this close catches the player
export const INTERACT_REACH = 36; // px, to a hide spot or switch
export const TAKEDOWN_REACH = 36; // px, to the guard's centre
export const HIDE_EXIT_TICKS = 30; // half a second in the open before the player can move again
export const BOLTS = 3; // per run
export const THROW_DISTANCE = 192; // px, six tiles
export const THROW_NOISE_RADIUS = 160; // px, five tiles
export const SWITCH_NOISE_RADIUS = 120; // px, the click
export const TAKEDOWN_NOISE_RADIUS = 60; // px, the scuffle

const NO_MODIFIERS: Modifiers = { speedMultiplier: 1, handsFree: true };

export interface GameOptions {
  /** Debug switch: spawn only loot of this kind, to compare runs with a single target. */
  onlyLoot?: LootKind;
  /** Debug switch: no random choices, first variant of everything. */
  fixed?: boolean;
  /** Seed of the run; a fixed run uses 1 when none is given. */
  seed?: number;
}

export function createGameState(level: Level, playerIds: string[], options: GameOptions = {}): GameState {
  const fixed = options.fixed ?? false;
  const seed = (options.seed ?? (fixed ? 1 : 0)) >>> 0;
  const context: GuardContext = { seed, tick: 0, fixed };
  const players: Record<string, PlayerState> = {};
  for (const id of playerIds) {
    players[id] = {
      x: level.spawn.x,
      y: level.spawn.y,
      direction: STILL,
      sneaking: false,
      vx: 0,
      vy: 0,
      stepTicks: 0,
      thermalVision: false,
      hidden: null,
      emergeTicks: 0,
      bolts: BOLTS,
    };
  }
  const loot: Record<string, LootState> = {};
  for (const spawn of level.loot) {
    if (options.onlyLoot && spawn.kind !== options.onlyLoot) {
      continue;
    }
    if (spawn.group !== null && spawn.variant !== chosenVariant(level, spawn.group, seed, fixed)) {
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
  const zones: Record<string, boolean> = {};
  for (const zone of [...level.lights, ...level.noiseZones]) {
    if (zone.name) {
      zones[zone.name] = true;
    }
  }
  return {
    tick: 0,
    seed,
    fixed,
    players,
    loot,
    guards: createGuards(level, context),
    cameras: createCameras(level),
    heatTraces: [],
    zones,
    events: [],
    outcome: null,
  };
}

/** Names of the zones that are switched off. */
export function zonesOff(state: GameState): string[] {
  return Object.keys(state.zones).filter((name) => !state.zones[name]);
}

/** The variant of a loot group that spawns this run: the first when fixed, else drawn from the seed. */
export function chosenVariant(level: Level, group: string, seed: number, fixed: boolean): string {
  const variants = [...new Set(level.loot.filter((l) => l.group === group).map((l) => l.variant))].sort();
  return fixed ? (variants[0] as string) : pick(seed, `loot:${group}`, variants);
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

/** The switch within reach of the player, or null. */
export function switchInReach(state: GameState, level: Level, playerId: string): SwitchSpawn | null {
  return nearest(state.players[playerId], level.switches, INTERACT_REACH);
}

/** The hide spot within reach of the player, or null. */
export function hideSpotInReach(state: GameState, level: Level, playerId: string): HideSpot | null {
  return nearest(state.players[playerId], level.hideSpots, INTERACT_REACH);
}

function nearest<T extends Vector2>(from: Vector2 | undefined, candidates: readonly T[], reach: number): T | null {
  if (!from) {
    return null;
  }
  let best: T | null = null;
  let bestDistance = reach;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - from.x, candidate.y - from.y);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Id of the guard the player could knock out right now: within reach, still standing, and
 * the player outside its view cone. Needs free hands and no hide spot.
 */
export function takedownTarget(state: GameState, playerId: string): string | null {
  const player = state.players[playerId];
  if (!player || player.hidden || !playerModifiers(state, playerId).handsFree) {
    return null;
  }
  const standing = Object.entries(state.guards)
    .filter(([, guard]) => guard.mode !== 'down' && !inViewCone(guard, player))
    .map(([id, guard]) => ({ id, x: guard.x, y: guard.y }));
  return nearest(player, standing, TAKEDOWN_REACH)?.id ?? null;
}

/** Applies one command. Commands that make a sound add a noise event to `state.events`. */
export function applyCommand(state: GameState, command: Command, level: Level): GameState {
  const player = state.players[command.playerId];
  if (!player) {
    return state;
  }
  switch (command.type) {
    case 'move':
      return withPlayer(state, command.playerId, { direction: command.direction });
    case 'sneak':
      return withPlayer(state, command.playerId, { sneaking: command.on });
    case 'pickUp': {
      const target = carriedLoot(state, command.playerId) ? null : lootInReach(state, command.playerId);
      const loot = target ? state.loot[target] : undefined;
      if (!target || !loot || player.hidden) {
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
      if (!carried || !loot || player.hidden) {
        return state;
      }
      const radius = noiseRadius(level, player, LOOT[loot.kind].dropNoiseRadius, 'impact', zonesOff(state));
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
    case 'hide': {
      if (player.hidden) {
        return withPlayer(state, command.playerId, { hidden: null, emergeTicks: HIDE_EXIT_TICKS });
      }
      const spot = hideSpotInReach(state, level, command.playerId);
      return spot ? withPlayer(state, command.playerId, { hidden: spot.id, x: spot.x, y: spot.y }) : state;
    }
    case 'toggleSwitch': {
      const found = player.hidden ? null : switchInReach(state, level, command.playerId);
      if (!found) {
        return state;
      }
      const on = !(state.zones[found.target] ?? true);
      const switched = { ...state, zones: { ...state.zones, [found.target]: on } };
      // The click carries as the world sounds after the switch: fans that just stopped mask nothing.
      const radius = noiseRadius(level, found, SWITCH_NOISE_RADIUS, 'impact', zonesOff(switched));
      return {
        ...switched,
        events: [
          ...state.events,
          { type: 'switch:used', switchId: found.id, zone: found.target, on, x: found.x, y: found.y, alerts: found.alerts },
          { type: 'noise:emitted', x: found.x, y: found.y, radius },
        ],
      };
    }
    case 'throw': {
      const length = Math.hypot(command.direction.x, command.direction.y);
      if (player.hidden || player.bolts <= 0 || length === 0 || !playerModifiers(state, command.playerId).handsFree) {
        return state;
      }
      const dx = command.direction.x / length;
      const dy = command.direction.y / length;
      const hit = castRay(level, player, dx, dy, THROW_DISTANCE);
      // A bolt that hits a wall drops just in front of it.
      const flight = hit < THROW_DISTANCE ? Math.max(0, hit - 4) : THROW_DISTANCE;
      const landing = { x: player.x + dx * flight, y: player.y + dy * flight };
      const radius = noiseRadius(level, landing, THROW_NOISE_RADIUS, 'impact', zonesOff(state));
      return {
        ...withPlayer(state, command.playerId, { bolts: player.bolts - 1 }),
        events: [...state.events, { type: 'noise:emitted', ...landing, radius }],
      };
    }
    case 'takedown': {
      const target = takedownTarget(state, command.playerId);
      const guard = target ? state.guards[target] : undefined;
      if (!target || !guard) {
        return state;
      }
      const knocked = knockOut(state.guards, target);
      const radius = noiseRadius(level, guard, TAKEDOWN_NOISE_RADIUS, 'impact', zonesOff(state));
      return {
        ...state,
        guards: knocked.guards,
        events: [...state.events, { type: 'noise:emitted', x: guard.x, y: guard.y, radius }, ...(knocked.event ? [knocked.event] : [])],
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
  const off = zonesOff(commanded);
  let heatTraces = coolTraces(commanded.heatTraces, TICK_SECONDS);

  const players: Record<string, PlayerState> = {};
  for (const [id, player] of Object.entries(commanded.players)) {
    const speed = PLAYER_SPEED * playerModifiers(commanded, id).speedMultiplier * (player.sneaking ? SNEAK_SPEED_FACTOR : 1);
    // Hidden players stay put, and leaving a hide spot takes a moment.
    const emergeTicks = Math.max(0, player.emergeTicks - 1);
    const wanted = computeVelocity(player.hidden || player.emergeTicks > 0 ? STILL : player.direction, speed);
    const inertia = wanted.x === 0 && wanted.y === 0 ? PLAYER_DECELERATION : PLAYER_ACCELERATION;
    let vx = player.vx + (wanted.x - player.vx) * inertia;
    let vy = player.vy + (wanted.y - player.vy) * inertia;
    if (Math.hypot(vx, vy) < 1) {
      vx = 0;
      vy = 0;
    }
    const position = moveAndCollide(level, player, PLAYER_SIZE / 2, { x: vx * TICK_SECONDS, y: vy * TICK_SECONDS });
    const moved = position.x !== player.x || position.y !== player.y;
    let stepTicks = moved ? player.stepTicks + 1 : player.stepTicks;
    if (stepTicks >= FOOTSTEP_INTERVAL_TICKS) {
      stepTicks = 0;
      const radius = noiseRadius(level, position, FOOTSTEP_RADIUS, player.sneaking ? 'sneak' : 'footstep', off);
      if (radius > 0) {
        events.push({ type: 'noise:emitted', ...position, radius });
      }
      heatTraces = addTrace(heatTraces, position);
    }
    players[id] = { ...player, ...position, vx, vy, stepTicks, emergeTicks };
  }

  const loot = thaw(followCarriers(commanded.loot, players), events);
  const cameras = updateCameras(commanded.cameras, intruderHeat({ ...commanded, players, loot, heatTraces }), level);
  events.push(...cameras.events);

  // Hidden players are neither seen nor caught: a hide spot ends every chase.
  const exposed = Object.values(players).filter((player) => player.hidden === null);
  const partnerAlerts = state.events.filter((event) => event.type === 'guard:alerted');
  const guards = updateGuards(commanded.guards, exposed, level, [...events, ...partnerAlerts], {
    seed: commanded.seed,
    tick: commanded.tick,
    fixed: commanded.fixed,
    zonesOff: off,
  });

  const caught = Object.values(guards.guards).some(
    (guard) =>
      guard.mode === 'alarm' && exposed.some((player) => Math.hypot(player.x - guard.x, player.y - guard.y) <= CATCH_DISTANCE),
  );

  return {
    tick: commanded.tick + 1,
    seed: commanded.seed,
    fixed: commanded.fixed,
    players,
    loot,
    guards: guards.guards,
    cameras: cameras.cameras,
    heatTraces,
    zones: commanded.zones,
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

function withPlayer(state: GameState, id: string, changes: Partial<PlayerState>): GameState {
  const player = state.players[id];
  return player ? { ...state, players: { ...state.players, [id]: { ...player, ...changes } } } : state;
}

function withLoot(state: GameState, id: string, changes: Partial<LootState>): GameState {
  const loot = state.loot[id];
  return loot ? { ...state, loot: { ...state.loot, [id]: { ...loot, ...changes } } } : state;
}
