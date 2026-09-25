// Writes the placeholder tileset (public/tilesets/placeholder.png): 32 px tiles drawn as they
// look under full light; the darkness layer is added by the scene. Run: node scripts/make-tileset.mjs
//
// Tile ids (gid = id + 1 in the maps):
//   0 floor   1 wall   2 glass   3 container   4 grating   5 water   6 pipe   7 shelf
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const T = 32;
export const TILES = ['floor', 'wall', 'glass', 'container', 'grating', 'water', 'pipe', 'shelf'];
const W = TILES.length * T;
const H = T;

const rgb = (r, g, b) => [r, g, b, 255];
const grey = (v) => rgb(v, v, v);

const painters = {
  floor: (x, y) => grey(x === 0 || y === 0 ? 112 : 98),
  wall: (x, y) => grey(x < 2 || y < 2 || x > T - 3 || y > T - 3 ? 214 : 178),
  glass: (x, y) => {
    const frame = x < 3 || x > T - 4;
    const glint = y > 6 && y < 10 && x > 6 && x < 20;
    return frame ? rgb(150, 170, 185) : glint ? rgb(225, 240, 250) : rgb(150, 195, 220);
  },
  container: (x, y) => {
    const rib = x % 8 === 3 || x % 8 === 4;
    const edge = x < 2 || y < 2 || x > T - 3 || y > T - 3;
    return edge ? rgb(120, 78, 52) : rib ? rgb(196, 122, 74) : rgb(176, 108, 66);
  },
  grating: (x, y) => ((x % 4 === 0 || y % 4 === 0) ? grey(130) : grey(84)),
  water: (x, y) => {
    const wave = (y + Math.round(3 * Math.sin(x / 4))) % 8 === 0;
    return wave ? rgb(70, 110, 140) : rgb(38, 72, 100);
  },
  pipe: (x, y) => {
    const core = x > 6 && x < T - 7;
    const highlight = x > 9 && x < 14;
    return core ? (highlight ? grey(200) : grey(150)) : grey(98);
  },
  shelf: (x, y) => {
    const post = x < 3 || x > T - 4;
    const beam = y % 8 < 2;
    return post || beam ? rgb(170, 150, 110) : rgb(120, 104, 74);
  },
};

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const tile = TILES[Math.floor(x / T)];
    raw.set(painters[tile](x % T, y), y * (W * 4 + 1) + 1 + x * 4);
  }
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
writeFileSync(
  new URL('../public/tilesets/placeholder.png', import.meta.url),
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);

/** The tileset entry for a Tiled map, with the collision and glass properties. */
export function tilesetEntry() {
  const bool = (name) => ({ name, type: 'bool', value: true });
  const solid = ['wall', 'glass', 'container', 'water', 'pipe', 'shelf'];
  return {
    columns: TILES.length,
    firstgid: 1,
    image: '../tilesets/placeholder.png',
    imageheight: H,
    imagewidth: W,
    margin: 0,
    name: 'placeholder',
    spacing: 0,
    tilecount: TILES.length,
    tileheight: T,
    tilewidth: T,
    tiles: TILES.flatMap((tile, id) => {
      const properties = [];
      if (solid.includes(tile)) properties.push(bool('collides'));
      if (tile === 'glass') properties.push(bool('glass'));
      return properties.length ? [{ id, properties }] : [];
    }),
  };
}
