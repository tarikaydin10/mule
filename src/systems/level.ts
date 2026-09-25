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
  spawn: { x: number; y: number };
  /** Lit areas; everywhere else is dark. */
  lights: LightZone[];
  /** Where loot lies at the start. */
  loot: LootSpawn[];
  /** Areas that change how far noise carries. */
  noiseZones: NoiseZone[];
  guards: GuardSpawn[];
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
  const colliding = collidingGids(map.tilesets);
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
    spawn: { x: spawn.x, y: spawn.y },
    lights: parseLights(map.layers.find((layer) => layer.name === 'lights' && layer.type === 'objectgroup')),
    loot: parseLoot(objects),
    noiseZones: parseNoiseZones(map.layers.find((layer) => layer.name === 'noise' && layer.type === 'objectgroup')),
    guards: parseGuards(objects),
  };
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

function collidingGids(tilesets: TiledTileset[]): Set<number> {
  const gids = new Set<number>();
  for (const tileset of tilesets) {
    for (const tile of tileset.tiles ?? []) {
      if (tile.properties?.some((p) => p.name === 'collides' && p.value === true)) {
        gids.add(tileset.firstgid + tile.id);
      }
    }
  }
  return gids;
}

/** Everything outside the map counts as solid. */
export function isSolid(level: Level, column: number, row: number): boolean {
  if (column < 0 || row < 0 || column >= level.width || row >= level.height) {
    return true;
  }
  return level.solid[row * level.width + column] === true;
}
