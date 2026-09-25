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
  /** Where loot lies at the start. */
  loot: LootSpawn[];
  /** Areas that change how far noise carries. */
  noiseZones: NoiseZone[];
  /** Where players leave the map with their loot, or null in levels without one. */
  extraction: Rect | null;
  guards: GuardSpawn[];
  thermalCameras: ThermalCameraSpawn[];
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
  /** Patrol route, walked as a loop; the guard starts on the first point. */
  route: Vector2[];
  /** Id of the other guard of the pair, or null. */
  partner: string | null;
}

export interface LootSpawn {
  id: string;
  kind: LootKind;
  x: number;
  y: number;
}

export interface LightZone extends Rect {
  name: string;
  /** 0 is dark, 1 is fully lit. */
  brightness: number;
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
    guards: parseGuards(objects),
    extraction: parseExtraction(objects),
    thermalCameras: parseThermalCameras(objects),
  };
}

/**
 * Point objects of type "thermalCamera" in the layer "objects". Float properties: "angle" in degrees
 * (0 is right, 90 is down), optional "fov" in degrees (default 70) and "range" in px (default 280).
 */
function parseThermalCameras(objects: TiledObject[]): ThermalCameraSpawn[] {
  return objects
    .filter((obj) => obj.type === 'thermalCamera')
    .map((obj) => {
      const angle = property(obj, 'angle');
      const fov = property(obj, 'fov') ?? 70;
      const range = property(obj, 'range') ?? 280;
      if (typeof angle !== 'number' || typeof fov !== 'number' || typeof range !== 'number') {
        throw new Error(`Thermal camera "${obj.name}" needs a number property "angle" (and numbers for "fov" and "range")`);
      }
      return {
        id: `camera-${obj.name}`,
        x: obj.x,
        y: obj.y,
        facing: (angle * Math.PI) / 180,
        fieldOfView: (fov * Math.PI) / 180,
        range,
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

function property(obj: TiledObject, name: string): unknown {
  return obj.properties?.find((p) => p.name === name)?.value;
}

/** Rectangles in the optional object layer "noise" with float properties "surface" and "masking". */
function parseNoiseZones(layer: TiledLayer | undefined): NoiseZone[] {
  return (layer?.objects ?? []).map((obj) => {
    const surface = property(obj, 'surface') ?? 1;
    const masking = property(obj, 'masking') ?? 0;
    if (typeof surface !== 'number' || typeof masking !== 'number' || !obj.width || !obj.height) {
      throw new Error(`Noise zone "${obj.name}" needs a size and number properties "surface" and "masking"`);
    }
    return { name: obj.name, x: obj.x, y: obj.y, width: obj.width, height: obj.height, surface, masking };
  });
}

/**
 * Polyline objects of type "guard" in the layer "objects": the line is the patrol route.
 * String property "kind" names a guard definition, optional "partner" the name of the other guard.
 */
function parseGuards(objects: TiledObject[]): GuardSpawn[] {
  const guards = objects.filter((obj) => obj.type === 'guard');
  const idOf = (obj: TiledObject) => `guard-${obj.name}`;
  return guards.map((obj) => {
    const kind = property(obj, 'kind');
    if (!isGuardKind(kind)) {
      throw new Error(`Guard "${obj.name}" has an unknown kind: ${String(kind)}`);
    }
    if (!obj.polyline || obj.polyline.length < 2) {
      throw new Error(`Guard "${obj.name}" needs a polyline as its patrol route`);
    }
    const partnerName = property(obj, 'partner');
    const partner = typeof partnerName === 'string' ? guards.find((g) => g.name === partnerName) : undefined;
    if (partnerName !== undefined && !partner) {
      throw new Error(`Guard "${obj.name}" names an unknown partner: ${String(partnerName)}`);
    }
    return {
      id: idOf(obj),
      kind,
      route: obj.polyline.map((point) => ({ x: obj.x + point.x, y: obj.y + point.y })),
      partner: partner ? idOf(partner) : null,
    };
  });
}

/** Objects of type "loot" in the layer "objects", with a string property "kind" naming a loot definition. */
function parseLoot(objects: TiledObject[]): LootSpawn[] {
  return objects
    .filter((obj) => obj.type === 'loot')
    .map((obj, index) => {
      const kind = property(obj, 'kind');
      if (!isLootKind(kind)) {
        throw new Error(`Loot "${obj.name}" has an unknown kind: ${String(kind)}`);
      }
      return { id: `loot-${obj.id ?? index}`, kind, x: obj.x, y: obj.y };
    });
}

/** Rectangles in the optional object layer "lights", each with a float property "brightness". */
function parseLights(layer: TiledLayer | undefined): LightZone[] {
  return (layer?.objects ?? []).map((obj) => {
    const brightness = obj.properties?.find((p) => p.name === 'brightness')?.value;
    if (typeof brightness !== 'number' || !obj.width || !obj.height) {
      throw new Error(`Light "${obj.name}" needs a size and a number property "brightness"`);
    }
    return { name: obj.name, x: obj.x, y: obj.y, width: obj.width, height: obj.height, brightness };
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
