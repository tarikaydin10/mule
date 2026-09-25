import type { Rect } from './geometry';
import { isGuardKind, type GuardKind } from './guardTypes';
import { isLootKind, type LootKind } from './loot';
import type { Vector2 } from './movement';

/**
 * Static level data parsed straight from the Tiled JSON export, without Phaser,
 * so the same code can run wherever the simulation runs.
 */

export interface Level {
  /** Width and height in tiles. */
  width: number;
  height: number;
  /** Tile edge length in px. */
  tileSize: number;
  /** Row-major, true where a tile blocks movement. */
  solid: boolean[];
  /** Row-major, true for glass: blocks movement and heat, lets light and sight through. */
  glass: boolean[];
  spawn: { x: number; y: number };
  /** Lit areas; everywhere else is dark. */
  lights: LightZone[];
  /** Where loot may lie at the start; one spawn per group is chosen per run. */
  loot: LootSpawn[];
  /** Areas that change how far noise carries. */
  noiseZones: NoiseZone[];
  /** Where players leave the map with their loot, or null in levels without one. */
  extraction: Rect | null;
  guards: GuardSpawn[];
  thermalCameras: ThermalCameraSpawn[];
  /** Places a player can hide in: invisible to eyes, not to thermal cameras. */
  hideSpots: HideSpot[];
  /** Switches that turn a named light or noise zone off and on. */
  switches: SwitchSpawn[];
  /** Readable signs, drawn into the world. */
  signs: Sign[];
}

/** A fixed thermal camera; it registers heat, not light. */
export interface ThermalCameraSpawn {
  id: string;
  x: number;
  y: number;
  /** Viewing direction in radians (0 is right, positive turns clockwise). */
  facing: number;
  /** Full opening angle in radians. */
  fieldOfView: number;
  /** px */
  range: number;
}

export interface NoiseZone extends Rect {
  name: string;
  /** Multiplies footstep noise: above 1 for loud floors like metal grating. */
  surface: number;
  /** 0 to 1, share of every noise drowned out by background sound like fans. */
  masking: number;
}

export interface GuardSpawn {
  id: string;
  kind: GuardKind;
  /** Patrol route, walked as a loop; the guard starts on the first point. A post has one point. */
  route: Vector2[];
  /** Id of the other guard of the pair, or null. */
  partner: string | null;
  /** Seconds to wait at route points, by index. */
  waits: Record<number, number>;
  /** Route indexes of which one becomes this run's chat point (the pair stops there for a while). */
  chatPoints: number[];
  /** A post stands and sweeps its view over an arc instead of walking. */
  post: { facing: number; sweep: number } | null;
  /** Extra points walked after route point `after`, on about half of the loops. */
  detour: { after: number; points: Vector2[] } | null;
}

export interface LootSpawn {
  id: string;
  kind: LootKind;
  x: number;
  y: number;
  /** Spawns sharing a group are alternatives; one of them is chosen per run. Null spawns always. */
  group: string | null;
  variant: string;
}

export interface LightZone extends Rect {
  name: string;
  /** 0 is dark, 1 is fully lit. */
  brightness: number;
}

export interface HideSpot {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface SwitchSpawn {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Name of the light or noise zone it toggles. */
  target: string;
  /** Guard ids that go to look at the zone when it is switched. */
  alerts: string[];
}

export interface Sign {
  text: string;
  x: number;
  y: number;
}

interface TiledProperty {
  name: string;
  value: unknown;
}

interface TiledTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}

interface TiledObject {
  id?: number;
  name: string;
  type?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
  polyline?: Vector2[];
}

interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TiledObject[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

// Tiled stores flip and rotation flags in the top bits of a gid.
const GID_MASK = 0x0fffffff;

/** Tiles in the "walls" layer block movement when their tileset tile has `collides: true`. */
export function parseLevel(map: TiledMap): Level {
  if (map.tilewidth !== map.tileheight) {
    throw new Error('Only square tiles are supported');
  }
  const walls = map.layers.find((layer) => layer.name === 'walls' && layer.type === 'tilelayer');
  if (!walls?.data) {
    throw new Error('Tile layer "walls" is missing');
  }
  const colliding = gidsWith(map.tilesets, 'collides');
  const glassy = gidsWith(map.tilesets, 'glass');
  const objects = map.layers.find((layer) => layer.name === 'objects' && layer.type === 'objectgroup')?.objects ?? [];
  const spawn = objects.find((obj) => obj.name === 'player_spawn');
  if (!spawn) {
    throw new Error('Object "player_spawn" is missing in layer "objects"');
  }
  const guards = parseGuards(objects);
  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    solid: walls.data.map((gid) => colliding.has(gid & GID_MASK)),
    glass: walls.data.map((gid) => glassy.has(gid & GID_MASK)),
    spawn: { x: spawn.x, y: spawn.y },
    lights: parseLights(map.layers.find((layer) => layer.name === 'lights' && layer.type === 'objectgroup')),
    loot: parseLoot(objects),
    noiseZones: parseNoiseZones(map.layers.find((layer) => layer.name === 'noise' && layer.type === 'objectgroup')),
    guards,
    extraction: parseExtraction(objects),
    thermalCameras: parseThermalCameras(objects),
    hideSpots: parseHideSpots(objects),
    switches: parseSwitches(objects, guards),
    signs: objects.filter((obj) => obj.type === 'sign').map((obj) => ({ text: obj.name, x: obj.x, y: obj.y })),
  };
}

function property(obj: TiledObject, name: string): unknown {
  return obj.properties?.find((p) => p.name === name)?.value;
}

function numberProperty(obj: TiledObject, name: string, fallback: number): number {
  const value = property(obj, name) ?? fallback;
  if (typeof value !== 'number') {
    throw new Error(`"${obj.name}" needs a number property "${name}"`);
  }
  return value;
}

function stringProperty(obj: TiledObject, name: string): string | undefined {
  const value = property(obj, name);
  return typeof value === 'string' ? value : undefined;
}

/** The centre of a point or rectangle object. */
function centre(obj: TiledObject): Vector2 {
  return { x: obj.x + (obj.width ?? 0) / 2, y: obj.y + (obj.height ?? 0) / 2 };
}

/**
 * Point objects of type "thermalCamera" in the layer "objects". Float properties: "angle" in degrees
 * (0 is right, 90 is down), optional "fov" in degrees (default 70) and "range" in px (default 280).
 */
function parseThermalCameras(objects: TiledObject[]): ThermalCameraSpawn[] {
  return objects
    .filter((obj) => obj.type === 'thermalCamera')
    .map((obj) => {
      if (typeof property(obj, 'angle') !== 'number') {
        throw new Error(`Thermal camera "${obj.name}" needs a number property "angle"`);
      }
      return {
        id: `camera-${obj.name}`,
        x: obj.x,
        y: obj.y,
        facing: (numberProperty(obj, 'angle', 0) * Math.PI) / 180,
        fieldOfView: (numberProperty(obj, 'fov', 70) * Math.PI) / 180,
        range: numberProperty(obj, 'range', 280),
      };
    });
}

/** The rectangle object of type "extraction" in the layer "objects"; at most one. */
function parseExtraction(objects: TiledObject[]): Rect | null {
  const zones = objects.filter((obj) => obj.type === 'extraction');
  if (zones.length > 1) {
    throw new Error('Only one extraction zone is supported');
  }
  const [zone] = zones;
  if (!zone) {
    return null;
  }
  if (!zone.width || !zone.height) {
    throw new Error(`Extraction "${zone.name}" needs a size`);
  }
  return { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
}

/** True when the point lies inside the rectangle, edges included. */
export function insideRect(rect: Rect, point: Vector2): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Rectangles in the optional object layer "noise" with float properties "surface" and "masking". */
function parseNoiseZones(layer: TiledLayer | undefined): NoiseZone[] {
  return (layer?.objects ?? []).map((obj) => {
    if (!obj.width || !obj.height) {
      throw new Error(`Noise zone "${obj.name}" needs a size`);
    }
    return {
      name: obj.name,
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      surface: numberProperty(obj, 'surface', 1),
      masking: numberProperty(obj, 'masking', 0),
    };
  });
}

/**
 * Objects of type "guard" in the layer "objects". A polyline is a patrol route; a point is a post
 * with "facing" and optional "sweep" in degrees. String property "kind" names a guard definition,
 * optional "partner" the name of the other guard, "wait" lists stops as "index:seconds;…",
 * "chat" lists route indexes as "i,j" of which one becomes the run's chat point.
 * Polylines of type "detour" with "guard" (name) and "after" (route index) are optional side trips.
 */
function parseGuards(objects: TiledObject[]): GuardSpawn[] {
  const guards = objects.filter((obj) => obj.type === 'guard');
  const detours = objects.filter((obj) => obj.type === 'detour');
  const idOf = (obj: TiledObject) => `guard-${obj.name}`;
  return guards.map((obj) => {
    const kind = property(obj, 'kind');
    if (!isGuardKind(kind)) {
      throw new Error(`Guard "${obj.name}" has an unknown kind: ${String(kind)}`);
    }
    const partnerName = property(obj, 'partner');
    const partner = typeof partnerName === 'string' ? guards.find((g) => g.name === partnerName) : undefined;
    if (partnerName !== undefined && !partner) {
      throw new Error(`Guard "${obj.name}" names an unknown partner: ${String(partnerName)}`);
    }
    const route = obj.polyline
      ? obj.polyline.map((point) => ({ x: obj.x + point.x, y: obj.y + point.y }))
      : [{ x: obj.x, y: obj.y }];
    const post = obj.polyline
      ? null
      : { facing: (numberProperty(obj, 'facing', 0) * Math.PI) / 180, sweep: (numberProperty(obj, 'sweep', 120) * Math.PI) / 180 };
    if (obj.polyline && route.length < 2) {
      throw new Error(`Guard "${obj.name}" needs at least two route points`);
    }
    const waits: Record<number, number> = {};
    for (const entry of (stringProperty(obj, 'wait') ?? '').split(';').filter(Boolean)) {
      const [index, seconds] = entry.split(':').map(Number);
      if (!Number.isInteger(index) || !(index! >= 0 && index! < route.length) || !(seconds! > 0)) {
        throw new Error(`Guard "${obj.name}" has an invalid wait entry: ${entry}`);
      }
      waits[index!] = seconds!;
    }
    const chatPoints = (stringProperty(obj, 'chat') ?? '')
      .split(',')
      .filter(Boolean)
      .map((value) => {
        const index = Number(value);
        if (!Number.isInteger(index) || index < 0 || index >= route.length) {
          throw new Error(`Guard "${obj.name}" has an invalid chat point: ${value}`);
        }
        return index;
      });
    const detourObj = detours.find((d) => property(d, 'guard') === obj.name);
    let detour: GuardSpawn['detour'] = null;
    if (detourObj) {
      const after = numberProperty(detourObj, 'after', -1);
      if (!detourObj.polyline || !Number.isInteger(after) || after < 0 || after >= route.length) {
        throw new Error(`Detour for guard "${obj.name}" needs a polyline and a valid "after" index`);
      }
      detour = { after, points: detourObj.polyline.map((point) => ({ x: detourObj.x + point.x, y: detourObj.y + point.y })) };
    }
    return { id: idOf(obj), kind, route, partner: partner ? idOf(partner) : null, waits, chatPoints, post, detour };
  });
}

/**
 * Objects of type "loot" in the layer "objects", with a string property "kind" naming a loot
 * definition. Optional "group" and "variant": one spawn per group is chosen per run.
 */
function parseLoot(objects: TiledObject[]): LootSpawn[] {
  return objects
    .filter((obj) => obj.type === 'loot')
    .map((obj, index) => {
      const kind = property(obj, 'kind');
      if (!isLootKind(kind)) {
        throw new Error(`Loot "${obj.name}" has an unknown kind: ${String(kind)}`);
      }
      const point = centre(obj);
      return {
        id: `loot-${obj.name || obj.id || index}`,
        kind,
        x: point.x,
        y: point.y,
        group: stringProperty(obj, 'group') ?? null,
        variant: stringProperty(obj, 'variant') ?? 'A',
      };
    });
}

/** Rectangles in the optional object layer "lights", each with a float property "brightness". */
function parseLights(layer: TiledLayer | undefined): LightZone[] {
  return (layer?.objects ?? []).map((obj) => {
    const brightness = property(obj, 'brightness');
    if (typeof brightness !== 'number' || !obj.width || !obj.height) {
      throw new Error(`Light "${obj.name}" needs a size and a number property "brightness"`);
    }
    return { name: obj.name, x: obj.x, y: obj.y, width: obj.width, height: obj.height, brightness };
  });
}

/** Point or rectangle objects of type "hideSpot"; the player hides at their centre. */
function parseHideSpots(objects: TiledObject[]): HideSpot[] {
  return objects
    .filter((obj) => obj.type === 'hideSpot')
    .map((obj, index) => ({ id: `hide-${obj.name || obj.id || index}`, name: obj.name, ...centre(obj) }));
}

/**
 * Point objects of type "switch" with a string property "target" naming a light or noise zone,
 * optional "alerts": comma-separated guard names that go to look when it is used.
 */
function parseSwitches(objects: TiledObject[], guards: GuardSpawn[]): SwitchSpawn[] {
  return objects
    .filter((obj) => obj.type === 'switch')
    .map((obj, index) => {
      const target = stringProperty(obj, 'target');
      if (!target) {
        throw new Error(`Switch "${obj.name}" needs a string property "target"`);
      }
      const alerts = (stringProperty(obj, 'alerts') ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => {
          const guard = guards.find((g) => g.id === `guard-${name}`);
          if (!guard) {
            throw new Error(`Switch "${obj.name}" alerts an unknown guard: ${name}`);
          }
          return guard.id;
        });
      return { id: `switch-${obj.name || obj.id || index}`, name: obj.name, ...centre(obj), target, alerts };
    });
}

/** Gids of tileset tiles whose bool property `name` is true. */
function gidsWith(tilesets: TiledTileset[], name: string): Set<number> {
  const gids = new Set<number>();
  for (const tileset of tilesets) {
    for (const tile of tileset.tiles ?? []) {
      if (tile.properties?.some((p) => p.name === name && p.value === true)) {
        gids.add(tileset.firstgid + tile.id);
      }
    }
  }
  return gids;
}

/** What travels along a line of sight: light (normal sight) passes glass, heat does not. */
export type Sense = 'light' | 'heat';

/** Whether a tile blocks a line of sight for the given sense. Outside the map blocks everything. */
export function blocksSight(level: Level, column: number, row: number, sense: Sense): boolean {
  if (!isSolid(level, column, row)) {
    return false;
  }
  return sense === 'heat' || level.glass[row * level.width + column] !== true;
}

/** Everything outside the map counts as solid. */
export function isSolid(level: Level, column: number, row: number): boolean {
  if (column < 0 || row < 0 || column >= level.width || row >= level.height) {
    return true;
  }
  return level.solid[row * level.width + column] === true;
}
