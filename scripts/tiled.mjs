// Shared helpers for the map generators: a character grid that becomes the walls layer,
// Tiled object builders, and the writer. Coordinates are tiles unless noted.
import { writeFileSync } from 'node:fs';
import { tilesetEntry } from './make-tileset.mjs';

export const T = 32;
// Cell characters and their tileset gid in the walls layer.
export const GID = { '#': 2, G: 3, C: 4, W: 6, P: 7, S: 8 };
export const GROUND_GRATING = 5;

export function createMap(W, H) {
  const grid = Array.from({ length: H }, () => Array(W).fill('#'));
  const ground = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, ch) => {
    if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`out of map: ${x},${y}`);
    grid[y][x] = ch;
  };
  const fill = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch);
  };
  const carve = (x0, y0, x1, y1) => fill(x0, y0, x1, y1, '.');
  const door = (...cells) => cells.forEach(([x, y]) => set(x, y, '.'));
  const grating = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[y][x] = 'g';
  };

  let nextId = 1;
  const c = (x, y) => ({ x: x * T + T / 2, y: y * T + T / 2 });
  const prop = (name, value) => ({ name, type: typeof value === 'number' ? 'float' : 'string', value });
  const point = (name, type, [x, y], properties = []) => ({
    id: nextId++, name, type, point: true, x, y, width: 0, height: 0, rotation: 0, visible: true, properties,
  });
  const rect = (name, type, x0, y0, x1, y1, properties = []) => ({
    id: nextId++, name, type, x: x0 * T, y: y0 * T, width: (x1 - x0 + 1) * T, height: (y1 - y0 + 1) * T, rotation: 0, visible: true, properties,
  });
  const polyline = (name, type, points, properties = []) => {
    const [first] = points.map(([x, y]) => c(x, y));
    return {
      id: nextId++, name, type, x: first.x, y: first.y, width: 0, height: 0, rotation: 0, visible: true, properties,
      polyline: points.map(([x, y]) => ({ x: c(x, y).x - first.x, y: c(x, y).y - first.y })),
    };
  };
  const at = (name, type, [x, y], properties = []) => point(name, type, [c(x, y).x, c(x, y).y], properties);
  const guard = (name, points, props = {}) =>
    polyline(name, 'guard', points, [prop('kind', 'dockGuard'), ...Object.entries(props).map(([k, v]) => prop(k, v))]);
  const post = (name, cell, facing, sweep) => at(name, 'guard', cell, [prop('kind', 'dockGuard'), prop('facing', facing), prop('sweep', sweep)]);
  const camera = (name, cell, angle, range) => at(name, 'thermalCamera', cell, [prop('angle', angle), prop('fov', 70), prop('range', range)]);
  const loot = (name, kind, cell, place, group, variant) =>
    at(name, 'loot', cell, [prop('kind', kind), prop('place', place), ...(group ? [prop('group', group), prop('variant', variant)] : [])]);
  const sign = (text, cell) => at(text, 'sign', cell);
  const hideSpot = (name, label, cell) => at(name, 'hideSpot', cell, [prop('label', label)]);
  const lightSwitch = (name, label, cell, target, alerts) =>
    at(name, 'switch', cell, [prop('label', label), prop('target', target), prop('alerts', alerts)]);
  const spawn = (cell) => at('player_spawn', '', cell);

  /** Checks that placed objects sit on free tiles, then writes the Tiled JSON and prints the grid. */
  const write = (path, { objects, lights, noise, briefing }) => {
    for (const obj of objects) {
      const placed = ['loot', 'hideSpot', 'switch', 'thermalCamera'].includes(obj.type) || obj.name === 'player_spawn';
      if (placed && grid[Math.floor(obj.y / T)][Math.floor(obj.x / T)] !== '.') {
        throw new Error(`${obj.name} sits in a wall at ${Math.floor(obj.x / T)},${Math.floor(obj.y / T)}`);
      }
    }
    const layer = (id, name, data) => ({ data, height: H, id, name, opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 });
    const objectLayer = (id, name, objs) => ({ draworder: 'topdown', id, name, objects: objs, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 });
    const map = {
      compressionlevel: -1,
      properties: [prop('briefing', briefing)],
      height: H,
      infinite: false,
      layers: [
        layer(1, 'ground', ground.flat().map((g) => (g === 'g' ? GROUND_GRATING : 1))),
        layer(2, 'walls', grid.flat().map((ch) => GID[ch] ?? 0)),
        objectLayer(3, 'objects', objects),
        objectLayer(4, 'lights', lights),
        objectLayer(5, 'noise', noise),
      ],
      nextlayerid: 6,
      nextobjectid: nextId,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.11.2',
      tileheight: T,
      tilesets: [tilesetEntry()],
      tilewidth: T,
      type: 'map',
      version: '1.10',
      width: W,
    };
    writeFileSync(new URL(path, import.meta.url), JSON.stringify(map) + '\n');
    console.log(grid.map((r, y) => String(y).padStart(2) + ' ' + r.join('')).join('\n'));
  };

  return { grid, ground, set, fill, carve, door, grating, c, prop, point, rect, polyline, at, guard, post, camera, loot, sign, hideSpot, lightSwitch, spawn, write };
}
