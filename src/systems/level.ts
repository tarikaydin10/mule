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
}

interface TiledProperty {
  name: string;
  value: unknown;
}

interface TiledTileset {
  firstgid: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}

interface TiledLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: { name: string; x: number; y: number }[];
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
  const spawn = map.layers
    .find((layer) => layer.name === 'objects' && layer.type === 'objectgroup')
    ?.objects?.find((obj) => obj.name === 'player_spawn');
  if (!spawn) {
    throw new Error('Object "player_spawn" is missing in layer "objects"');
  }
  return {
    width: map.width,
    height: map.height,
    tileSize: map.tilewidth,
    solid: walls.data.map((gid) => colliding.has(gid & GID_MASK)),
    spawn: { x: spawn.x, y: spawn.y },
  };
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
