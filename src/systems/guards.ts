import { moveAndCollide } from './collision';
import type { GameEvent } from './events';
import { GUARDS, type GuardKind } from './guardTypes';
import type { GuardSpawn, Level } from './level';
import { illuminationAt } from './lighting';
import type { Vector2 } from './movement';
import { canHear } from './noise';
import { findPath } from './pathfinding';
import { TICK_RATE, TICK_SECONDS } from './tick';
import { castRay, normalizeAngle } from './visibility';

/**
 * patrol: walks the route. investigate: goes to a spot where something was seen or heard.
 * search: looks around at that spot. alarm: the target was recognised; chases it.
 */
export type GuardMode = 'patrol' | 'investigate' | 'search' | 'alarm';

export interface GuardState {
  kind: GuardKind;
  x: number;
  y: number;
  /** Viewing direction in radians. */
  facing: number;
  mode: GuardMode;
  /** 0 to 1; perceiving a target raises it, at 1 the alarm goes off. */
  suspicion: number;
  /** Route point the guard is walking to. */
  routeIndex: number;
  /** Remaining points to walk through. */
  path: Vector2[];
  /** The spot being investigated or the target's last known position. */
  target: Vector2 | null;
  searchTicks: number;
}

export const GUARD_SIZE = 20; // px

// A target is noticed at arm's length whichever way the guard faces.
const PERIPHERAL_RADIUS = 28;
// In darkness a guard still sees this share of its full sight range.
export const DARK_SIGHT = 0.3;
const SUSPICION_DECAY_PER_SECOND = 0.25;
const SEARCH_TURN_PER_SECOND = 1.6; // rad/s

export function createGuards(level: Level): Record<string, GuardState> {
  const guards: Record<string, GuardState> = {};
  for (const spawn of level.guards) {
    const [start, next] = spawn.route as [Vector2, Vector2];
    guards[spawn.id] = {
      kind: spawn.kind,
      x: start.x,
      y: start.y,
      facing: Math.atan2(next.y - start.y, next.x - start.x),
      mode: 'patrol',
      suspicion: 0,
      routeIndex: 1,
      path: [],
      target: null,
      searchTicks: 0,
    };
  }
  return guards;
}

/**
 * How strongly a guard perceives a target: 0 when unseen, up to 1 point-blank.
 * The target must be in the view cone (or right next to the guard), in line of sight,
 * and within sight range, which shrinks in the dark.
 */
export function sightStrength(level: Level, guard: GuardState, target: Vector2): number {
  const definition = GUARDS[guard.kind];
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return 1;
  }
  const range = definition.sightRange * (DARK_SIGHT + (1 - DARK_SIGHT) * illuminationAt(level, target));
  if (distance > range) {
    return 0;
  }
  const offCentre = Math.abs(normalizeAngle(Math.atan2(dy, dx) - guard.facing));
  if (distance > PERIPHERAL_RADIUS && offCentre > definition.fieldOfView / 2) {
    return 0;
  }
  if (castRay(level, guard, dx / distance, dy / distance, distance) < distance) {
    return 0;
  }
  return Math.max(0.25, 1 - distance / range);
}

/**
 * How suspicious a perceived target is. Guards react to perceived × suspicious; for now
 * everything is suspicious, but keeping the factor apart allows social stealth later.
 */
function suspiciousness(_target: Vector2): number {
  return 1;
}

/**
 * Advances all guards by one tick. Reads this tick's noise and last tick's partner alerts
 * from `events`, and returns the guards plus the alerts they raise.
 */
export function updateGuards(
  guards: Record<string, GuardState>,
  targets: Vector2[],
  level: Level,
  events: readonly GameEvent[],
): { guards: Record<string, GuardState>; events: GameEvent[] } {
  const next: Record<string, GuardState> = {};
  const raised: GameEvent[] = [];
  for (const [id, guard] of Object.entries(guards)) {
    const spawn = level.guards.find((g) => g.id === id);
    if (!spawn) {
      next[id] = guard;
      continue;
    }
    const { state, alert } = updateGuard(id, guard, spawn, targets, level, events);
    next[id] = state;
    if (alert) {
      raised.push(alert);
    }
  }
  return { guards: next, events: raised };
}

function updateGuard(
  id: string,
  guard: GuardState,
  spawn: GuardSpawn,
  targets: Vector2[],
  level: Level,
  events: readonly GameEvent[],
): { state: GuardState; alert?: GameEvent } {
  const definition = GUARDS[guard.kind];
  let state = guard;
  let alert: GameEvent | undefined;

  // Perception
  let seenAt: Vector2 | null = null;
  let strongest = 0;
  for (const target of targets) {
    const perceived = sightStrength(level, state, target) * suspiciousness(target);
    if (perceived > strongest) {
      strongest = perceived;
      seenAt = { x: target.x, y: target.y };
    }
  }
  const suspicion =
    strongest > 0
      ? Math.min(1, state.suspicion + definition.suspicionPerSecond * strongest * TICK_SECONDS)
      : state.mode === 'alarm'
        ? state.suspicion
        : Math.max(0, state.suspicion - SUSPICION_DECAY_PER_SECOND * TICK_SECONDS);
  state = { ...state, suspicion };
  const heard = nearestHeardNoise(state, definition.hearing, events);
  const partnerAlert = events.find(
    (e): e is Extract<GameEvent, { type: 'guard:alerted' }> => e.type === 'guard:alerted' && e.guardId === spawn.partner,
  );
  // A thermal camera going off puts every guard on alarm.
  const sensorAlarm = events.find((e): e is Extract<GameEvent, { type: 'sensor:alarm' }> => e.type === 'sensor:alarm');

  // Decision
  const calm = state.mode === 'patrol';
  if (state.mode !== 'alarm' && suspicion >= 1 && seenAt) {
    state = goTo({ ...state, mode: 'alarm' }, seenAt, level);
    alert = { type: 'guard:alerted', guardId: id, alarm: true, ...seenAt };
  } else if (state.mode === 'alarm') {
    const lead = seenAt ?? sensorAlarm;
    if (lead) {
      state = goTo(state, lead, level);
    }
  } else if (seenAt ?? heard) {
    const spot = (seenAt ?? heard) as Vector2;
    state = goTo({ ...state, mode: 'investigate' }, spot, level);
    if (calm) {
      alert = { type: 'guard:alerted', guardId: id, alarm: false, ...spot };
    }
  } else if (sensorAlarm) {
    state = goTo({ ...state, mode: 'alarm' }, sensorAlarm, level);
  } else if (partnerAlert && (partnerAlert.alarm || calm)) {
    // Reacting to the partner raises no alert of its own, so a pair cannot echo forever.
    state = goTo({ ...state, mode: partnerAlert.alarm ? 'alarm' : 'investigate' }, partnerAlert, level);
  }

  // Action
  switch (state.mode) {
    case 'patrol': {
      if (state.path.length === 0) {
        state = nextRoutePoint(state, spawn, level);
      }
      state = walk(state, definition.patrolSpeed, level);
      break;
    }
    case 'investigate': {
      state = walk(state, definition.investigateSpeed, level);
      if (state.path.length === 0) {
        state = { ...state, mode: 'search', searchTicks: Math.round(definition.searchSeconds * TICK_RATE) };
      }
      break;
    }
    case 'search': {
      const searchTicks = state.searchTicks - 1;
      state =
        searchTicks > 0
          ? { ...state, searchTicks, facing: turn(state.facing) }
          : { ...state, mode: 'patrol', searchTicks: 0, target: null, path: [] };
      break;
    }
    case 'alarm': {
      state = state.path.length > 0 ? walk(state, definition.chaseSpeed, level) : { ...state, facing: turn(state.facing) };
      break;
    }
  }
  return alert ? { state, alert } : { state };
}

function nearestHeardNoise(guard: GuardState, hearing: number, events: readonly GameEvent[]): Vector2 | null {
  let nearest: Vector2 | null = null;
  let nearestDistance = Infinity;
  for (const event of events) {
    if (event.type !== 'noise:emitted' || !canHear(guard, event, hearing)) {
      continue;
    }
    const distance = Math.hypot(event.x - guard.x, event.y - guard.y);
    if (distance < nearestDistance) {
      nearest = { x: event.x, y: event.y };
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** Sets a new target and plans a path there, unless it is in the same tile as the current one. */
function goTo(guard: GuardState, target: Vector2, level: Level): GuardState {
  const size = level.tileSize;
  const sameTile =
    guard.target !== null &&
    Math.floor(guard.target.x / size) === Math.floor(target.x / size) &&
    Math.floor(guard.target.y / size) === Math.floor(target.y / size);
  if (sameTile && guard.path.length > 0) {
    return { ...guard, target: { x: target.x, y: target.y } };
  }
  return { ...guard, target: { x: target.x, y: target.y }, path: findPath(level, guard, target) };
}

function nextRoutePoint(guard: GuardState, spawn: GuardSpawn, level: Level): GuardState {
  const count = spawn.route.length;
  // At most one full loop, in case the guard already stands on route points.
  for (let tries = 0; tries < count; tries++) {
    const index = (guard.routeIndex + tries) % count;
    const path = findPath(level, guard, spawn.route[index] as Vector2);
    if (path.length > 0) {
      return { ...guard, path, routeIndex: (index + 1) % count };
    }
  }
  return guard;
}

/** Moves along the path by one tick at `speed`, facing the way it walks. */
function walk(guard: GuardState, speed: number, level: Level): GuardState {
  let budget = speed * TICK_SECONDS;
  let position: Vector2 = { x: guard.x, y: guard.y };
  const path = [...guard.path];
  while (budget > 0 && path.length > 0) {
    const next = path[0] as Vector2;
    const distance = Math.hypot(next.x - position.x, next.y - position.y);
    const share = distance <= budget ? 1 : budget / distance;
    position = moveAndCollide(level, position, GUARD_SIZE / 2, {
      x: (next.x - position.x) * share,
      y: (next.y - position.y) * share,
    });
    if (distance <= budget) {
      path.shift();
    }
    budget -= distance;
  }
  const dx = position.x - guard.x;
  const dy = position.y - guard.y;
  const facing = dx !== 0 || dy !== 0 ? Math.atan2(dy, dx) : guard.facing;
  return { ...guard, ...position, path, facing };
}

function turn(facing: number): number {
  return normalizeAngle(facing + SEARCH_TURN_PER_SECOND * TICK_SECONDS);
}
