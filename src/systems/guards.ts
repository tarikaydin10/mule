import { moveAndCollide } from './collision';
import type { GameEvent } from './events';
import { GUARDS, type GuardKind } from './guardTypes';
import type { GuardSpawn, Level } from './level';
import { illuminationAt } from './lighting';
import type { Vector2 } from './movement';
import { canHear } from './noise';
import { findPath } from './pathfinding';
import { draw, pick } from './random';
import { TICK_RATE, TICK_SECONDS } from './tick';
import { castRay, normalizeAngle } from './visibility';

/**
 * patrol: walks the route, waits at some points; a post stands and sweeps its view.
 * investigate: goes to a spot where something was seen or heard. search: looks around there.
 * alarm: the target was recognised; chases it, and searches where it was last seen.
 * down: knocked out; lies where it fell until another guard finds it.
 */
export type GuardMode = 'patrol' | 'investigate' | 'search' | 'alarm' | 'down';

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
  /** Remaining stop at a route point. */
  waitTicks: number;
  /** Route index the pair stops at for a chat this run, or -1. */
  chatIndex: number;
  /** Completed patrol loops, used to decide detours. */
  loops: number;
  /** While above 0 the guard is on edge: wider view cone, faster suspicion. */
  alertTicks: number;
  /** Ticks since the chased target was last seen. */
  lostTicks: number;
  /** Direction of a post's sweep: 1 or -1. */
  sweepDirection: number;
  /** A knocked-out guard that another guard has already found. */
  found: boolean;
}

/** What the guards need to know about the run beyond the level. */
export interface GuardContext {
  seed: number;
  tick: number;
  /** Debug: no random choices, so runs are comparable. */
  fixed: boolean;
  /** Names of light zones that are switched off; guards see less there. */
  zonesOff?: readonly string[];
}

export const GUARD_SIZE = 20; // px

// A target is noticed at arm's length whichever way the guard faces, except straight behind:
// that blind spot is what a takedown needs.
const PERIPHERAL_RADIUS = 28;
const REAR_BLIND_HALF_ANGLE = (3 / 4) * Math.PI;
// In darkness a guard still sees this share of its full sight range.
export const DARK_SIGHT = 0.3;
const SUSPICION_DECAY_PER_SECOND = 0.25;
const SEARCH_TURN_PER_SECOND = 1.6; // rad/s
const SWEEP_PER_SECOND = 0.6; // rad/s, a post looking around
export const CHAT_SECONDS = 6;
/** After a search without a find the guard stays on edge for this long. */
export const ALERT_SECONDS = 60;
const ALERT_FOV_FACTOR = 1.3;
const ALERT_SUSPICION_FACTOR = 1.5;
/** In alarm: this long without seeing the target, and having reached its last position, ends the chase. */
export const LOST_SECONDS = 4;
const DETOUR_CHANCE = 0.5;

export function createGuards(level: Level, context: GuardContext = { seed: 0, tick: 0, fixed: true }): Record<string, GuardState> {
  const guards: Record<string, GuardState> = {};
  for (const spawn of level.guards) {
    const start = spawn.route[0] as Vector2;
    const next = spawn.route[1] ?? start;
    const chatIndex =
      spawn.chatPoints.length === 0
        ? -1
        : context.fixed
          ? (spawn.chatPoints[0] as number)
          : pick(context.seed, `${chatKey(spawn)}:chat`, spawn.chatPoints);
    guards[spawn.id] = {
      kind: spawn.kind,
      x: start.x,
      y: start.y,
      facing: spawn.post ? spawn.post.facing : Math.atan2(next.y - start.y, next.x - start.x),
      mode: 'patrol',
      suspicion: 0,
      routeIndex: spawn.route.length > 1 ? 1 : 0,
      path: [],
      target: null,
      searchTicks: 0,
      waitTicks: 0,
      chatIndex,
      loops: 0,
      alertTicks: 0,
      lostTicks: 0,
      sweepDirection: 1,
      found: false,
    };
  }
  return guards;
}

/** Both guards of a pair draw the same chat point, so the key is the pair's, not the guard's. */
function chatKey(spawn: GuardSpawn): string {
  return spawn.partner ? [spawn.id, spawn.partner].sort().join('+') : spawn.id;
}

/**
 * How strongly a guard perceives a target: 0 when unseen, up to 1 point-blank.
 * The target must be in the view cone (or right next to the guard, but not straight behind),
 * in line of sight, and within sight range, which shrinks in the dark and with the light
 * zones in `zonesOff`. An alert guard looks wider.
 */
export function sightStrength(level: Level, guard: GuardState, target: Vector2, zonesOff: readonly string[] = []): number {
  if (guard.mode === 'down') {
    return 0;
  }
  const definition = GUARDS[guard.kind];
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return 1;
  }
  const range = definition.sightRange * (DARK_SIGHT + (1 - DARK_SIGHT) * illuminationAt(level, target, zonesOff));
  if (distance > range) {
    return 0;
  }
  const offCentre = offCentreAngle(guard, target);
  if (distance > PERIPHERAL_RADIUS ? !inViewCone(guard, target) : offCentre > REAR_BLIND_HALF_ANGLE) {
    return 0;
  }
  if (castRay(level, guard, dx / distance, dy / distance, distance) < distance) {
    return 0;
  }
  return Math.max(0.25, 1 - distance / range);
}

/** Whether the target lies inside the guard's view cone, ignoring distance, light and walls. */
export function inViewCone(guard: GuardState, target: Vector2): boolean {
  const fieldOfView = GUARDS[guard.kind].fieldOfView * (guard.alertTicks > 0 ? ALERT_FOV_FACTOR : 1);
  return offCentreAngle(guard, target) <= fieldOfView / 2;
}

/** Angle between the guard's facing and the direction to the target, 0 to π. */
function offCentreAngle(guard: GuardState, target: Vector2): number {
  return Math.abs(normalizeAngle(Math.atan2(target.y - guard.y, target.x - guard.x) - guard.facing));
}

/**
 * How suspicious a perceived target is. Guards react to perceived × suspicious; for now
 * everything is suspicious, but keeping the factor apart allows social stealth later.
 */
function suspiciousness(_target: Vector2): number {
  return 1;
}

/** Knocks a guard out: it lies where it stands. Returns the alert its partner will react to. */
export function knockOut(guards: Record<string, GuardState>, id: string): { guards: Record<string, GuardState>; event: GameEvent | null } {
  const guard = guards[id];
  if (!guard || guard.mode === 'down') {
    return { guards, event: null };
  }
  const down: GuardState = { ...guard, mode: 'down', suspicion: 0, path: [], target: null, waitTicks: 0, searchTicks: 0 };
  return {
    guards: { ...guards, [id]: down },
    event: { type: 'guard:alerted', guardId: id, alarm: true, x: guard.x, y: guard.y },
  };
}

/**
 * Advances all guards by one tick. Reads this tick's noise and last tick's alerts from
 * `events`, and returns the guards plus the alerts they raise. Knocked-out guards do
 * nothing, but every other guard that sees one raises the alarm.
 */
export function updateGuards(
  guards: Record<string, GuardState>,
  targets: Vector2[],
  level: Level,
  events: readonly GameEvent[],
  context: GuardContext = { seed: 0, tick: 0, fixed: true },
): { guards: Record<string, GuardState>; events: GameEvent[] } {
  const next: Record<string, GuardState> = {};
  const raised: GameEvent[] = [];
  const bodies = Object.entries(guards)
    .filter(([, guard]) => guard.mode === 'down' && !guard.found)
    .map(([id, guard]) => ({ id, x: guard.x, y: guard.y }));
  const foundBodies = new Set<string>();

  for (const [id, guard] of Object.entries(guards)) {
    const spawn = level.guards.find((g) => g.id === id);
    if (!spawn || guard.mode === 'down') {
      next[id] = guard;
      continue;
    }
    const seenBody = bodies.find((body) => body.id !== id && sightStrength(level, guard, body, context.zonesOff) > 0);
    if (seenBody) {
      foundBodies.add(seenBody.id);
    }
    const body = seenBody ? { x: seenBody.x, y: seenBody.y } : null;
    const { state, alert } = updateGuard(id, guard, spawn, targets, level, events, context, body);
    next[id] = state;
    if (alert) {
      raised.push(alert);
    }
  }
  for (const id of foundBodies) {
    const body = next[id];
    if (body) {
      next[id] = { ...body, found: true };
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
  context: GuardContext,
  seenBody: Vector2 | null,
): { state: GuardState; alert?: GameEvent } {
  const definition = GUARDS[guard.kind];
  let state: GuardState = { ...guard, alertTicks: Math.max(0, guard.alertTicks - 1) };
  let alert: GameEvent | undefined;
  const onEdge = state.alertTicks > 0;

  // Perception
  let seenAt: Vector2 | null = null;
  let strongest = 0;
  for (const target of targets) {
    const perceived = sightStrength(level, state, target, context.zonesOff) * suspiciousness(target);
    if (perceived > strongest) {
      strongest = perceived;
      seenAt = { x: target.x, y: target.y };
    }
  }
  const gain = definition.suspicionPerSecond * (onEdge ? ALERT_SUSPICION_FACTOR : 1);
  const suspicion =
    strongest > 0
      ? Math.min(1, state.suspicion + gain * strongest * TICK_SECONDS)
      : state.mode === 'alarm'
        ? state.suspicion
        : Math.max(0, state.suspicion - SUSPICION_DECAY_PER_SECOND * TICK_SECONDS);
  state = { ...state, suspicion };
  const heard = state.mode === 'alarm' ? null : nearestHeardNoise(state, definition.hearing, events);
  const partnerAlert = events.find(
    (e): e is Extract<GameEvent, { type: 'guard:alerted' }> => e.type === 'guard:alerted' && e.guardId === spawn.partner,
  );
  // A thermal camera going off puts every guard on alarm.
  const sensorAlarm = events.find((e): e is Extract<GameEvent, { type: 'sensor:alarm' }> => e.type === 'sensor:alarm');
  // A switch names the guards that go to look.
  const switchUsed = events.find(
    (e): e is Extract<GameEvent, { type: 'switch:used' }> => e.type === 'switch:used' && e.alerts.includes(id),
  );

  // Decision
  const calm = state.mode === 'patrol';
  if (seenBody) {
    state = goTo({ ...state, mode: 'alarm', lostTicks: 0 }, seenBody, level);
    alert = { type: 'guard:alerted', guardId: id, alarm: true, ...seenBody };
  } else if (state.mode !== 'alarm' && suspicion >= 1 && seenAt) {
    state = goTo({ ...state, mode: 'alarm', lostTicks: 0 }, seenAt, level);
    alert = { type: 'guard:alerted', guardId: id, alarm: true, ...seenAt };
  } else if (state.mode === 'alarm') {
    const lead = seenAt ?? sensorAlarm;
    if (lead) {
      state = goTo({ ...state, lostTicks: 0 }, lead, level);
    } else {
      state = { ...state, lostTicks: state.lostTicks + 1 };
    }
  } else if (sensorAlarm) {
    state = goTo({ ...state, mode: 'alarm', lostTicks: 0 }, sensorAlarm, level);
  } else if (seenAt ?? heard) {
    const spot = (seenAt ?? heard) as Vector2;
    state = goTo({ ...state, mode: 'investigate' }, spot, level);
    if (calm) {
      alert = { type: 'guard:alerted', guardId: id, alarm: false, ...spot };
    }
  } else if (switchUsed && calm) {
    state = goTo({ ...state, mode: 'investigate' }, switchUsed, level);
  } else if (partnerAlert && partnerAlert.alarm) {
    // Reacting to the partner raises no alert of its own, so a pair cannot echo forever.
    state = goTo({ ...state, mode: 'alarm', lostTicks: 0 }, partnerAlert, level);
  } else if (partnerAlert && calm) {
    // The pair splits the search: the partner goes halfway and keeps the other in sight.
    const halfway = { x: (state.x + partnerAlert.x) / 2, y: (state.y + partnerAlert.y) / 2 };
    state = goTo({ ...state, mode: 'investigate' }, halfway, level);
  }

  // Action
  switch (state.mode) {
    case 'patrol': {
      state = patrol(state, spawn, level, context);
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
          ? { ...state, searchTicks, facing: turn(state.facing, SEARCH_TURN_PER_SECOND) }
          : backToPatrol(state, spawn, level, context);
      break;
    }
    case 'alarm': {
      if (state.path.length > 0) {
        state = walk(state, definition.chaseSpeed, level);
      } else if (state.lostTicks >= LOST_SECONDS * TICK_RATE) {
        // Lost the target and reached where it was: look around, then go back on edge.
        state = { ...state, mode: 'search', searchTicks: Math.round(definition.searchSeconds * TICK_RATE), suspicion: 0.5 };
      } else {
        state = { ...state, facing: turn(state.facing, SEARCH_TURN_PER_SECOND) };
      }
      break;
    }
    case 'down':
      break;
  }
  return alert ? { state, alert } : { state };
}

/** Walks the route with its stops; a post stands and sweeps. */
function patrol(guard: GuardState, spawn: GuardSpawn, level: Level, context: GuardContext): GuardState {
  const definition = GUARDS[guard.kind];
  if (guard.waitTicks > 0) {
    return { ...guard, waitTicks: guard.waitTicks - 1 };
  }
  if (spawn.post && guard.path.length === 0) {
    const home = spawn.route[0] as Vector2;
    if (Math.hypot(home.x - guard.x, home.y - guard.y) > 1) {
      return walk({ ...guard, path: findPath(level, guard, home) }, definition.patrolSpeed, level);
    }
    return sweep(guard, spawn.post.facing, spawn.post.sweep);
  }
  let planned = guard;
  if (planned.path.length === 0) {
    planned = nextRoutePoint(planned, spawn, level, context);
    if (planned.path.length === 0) {
      return planned;
    }
  }
  const walked = walk(planned, definition.patrolSpeed, level);
  if (walked.path.length === 0) {
    // Arrived at a route point: stop there when the route says so.
    const arrivedAt = (walked.routeIndex + spawn.route.length - 1) % spawn.route.length;
    const wait = (spawn.waits[arrivedAt] ?? 0) + (arrivedAt === walked.chatIndex ? CHAT_SECONDS : 0);
    if (wait > 0) {
      return { ...walked, waitTicks: Math.round(wait * TICK_RATE) };
    }
  }
  return walked;
}

/** Plans the way to the next route point, with the detour on some loops. */
function nextRoutePoint(guard: GuardState, spawn: GuardSpawn, level: Level, context: GuardContext): GuardState {
  const count = spawn.route.length;
  if (count < 2) {
    return guard;
  }
  const justReached = (guard.routeIndex + count - 1) % count;
  let loops = guard.loops;
  if (justReached === count - 1) {
    loops += 1;
  }
  let detour: Vector2[] = [];
  if (spawn.detour && justReached === spawn.detour.after) {
    const takes = !context.fixed && draw(context.seed, `${spawn.id}:detour:${loops}`) < DETOUR_CHANCE;
    if (takes) {
      detour = spawn.detour.points;
    }
  }
  // At most one full loop, in case the guard already stands on route points.
  for (let tries = 0; tries < count; tries++) {
    const index = (guard.routeIndex + tries) % count;
    const stops = [...detour, spawn.route[index] as Vector2];
    const path = pathThrough(level, guard, stops);
    if (path.length > 0) {
      return { ...guard, path, routeIndex: (index + 1) % count, loops };
    }
    detour = [];
  }
  return { ...guard, loops };
}

/** After a search without a find: back on the route, on edge, at a random point of it. */
function backToPatrol(guard: GuardState, spawn: GuardSpawn, level: Level, context: GuardContext): GuardState {
  const count = spawn.route.length;
  const routeIndex = context.fixed || count < 2 ? guard.routeIndex : Math.floor(draw(context.seed, `${spawn.id}:return:${context.tick}`) * count);
  const home = spawn.route[routeIndex] as Vector2;
  return {
    ...guard,
    mode: 'patrol',
    searchTicks: 0,
    target: null,
    lostTicks: 0,
    alertTicks: Math.round(ALERT_SECONDS * TICK_RATE),
    routeIndex: (routeIndex + 1) % count,
    path: findPath(level, guard, home),
  };
}

function sweep(guard: GuardState, centre: number, arc: number): GuardState {
  const offset = normalizeAngle(guard.facing - centre);
  let direction = guard.sweepDirection;
  if (offset >= arc / 2) {
    direction = -1;
  } else if (offset <= -arc / 2) {
    direction = 1;
  }
  return { ...guard, sweepDirection: direction, facing: normalizeAngle(guard.facing + direction * SWEEP_PER_SECOND * TICK_SECONDS) };
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
    return { ...guard, target: { x: target.x, y: target.y }, waitTicks: 0 };
  }
  return { ...guard, target: { x: target.x, y: target.y }, path: findPath(level, guard, target), waitTicks: 0 };
}

/** A path through several stops in order; empty when any leg is unreachable. */
function pathThrough(level: Level, from: Vector2, stops: Vector2[]): Vector2[] {
  const path: Vector2[] = [];
  let previous = from;
  for (const stop of stops) {
    const leg = findPath(level, previous, stop);
    if (leg.length === 0) {
      const sameTile =
        Math.floor(previous.x / level.tileSize) === Math.floor(stop.x / level.tileSize) &&
        Math.floor(previous.y / level.tileSize) === Math.floor(stop.y / level.tileSize);
      if (!sameTile) {
        return [];
      }
      path.push(stop);
    } else {
      path.push(...leg);
    }
    previous = stop;
  }
  return path;
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

function turn(facing: number, radiansPerSecond: number): number {
  return normalizeAngle(facing + radiansPerSecond * TICK_SECONDS);
}
