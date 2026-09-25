// First draft of the Pier 9 map (docs/pier9.md) as a Tiled JSON file. Run once:
//   node scripts/make-pier9.mjs
// After that the Tiled file (public/maps/pier9.json) is the source; edit it in Tiled.
//
// Coordinates below are tiles; the map is 100 x 60 with two rows of water at the top.
import { writeFileSync } from 'node:fs';
import { tilesetEntry } from './make-tileset.mjs';

const W = 100;
const H = 60;
const T = 32;

// Cell characters and their tileset gid in the walls layer.
const GID = { '#': 2, G: 3, C: 4, W: 6, P: 7, S: 8 };
const GROUND_GRATING = 5;

const grid = Array.from({ length: H }, () => Array(W).fill('#'));
const ground = Array.from({ length: H }, () => Array(W).fill('.'));

const set = (x, y, c) => {
  if (x < 0 || y < 0 || x >= W || y >= H) throw new Error(`out of map: ${x},${y}`);
  grid[y][x] = c;
};
const fill = (x0, y0, x1, y1, c) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
};
const carve = (x0, y0, x1, y1) => fill(x0, y0, x1, y1, '.');
const door = (...cells) => cells.forEach(([x, y]) => set(x, y, '.'));
const grating = (x0, y0, x1, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ground[y][x] = 'g';
};

// ---------- geometry ----------
fill(0, 0, W - 1, 1, 'W'); // harbour basin

// Kai (quay), quay-wall alley, technical room, hut
carve(1, 3, 17, 17);
carve(19, 7, 21, 17); // Kaimauer alley, walls at x18 and x22
carve(19, 3, 21, 5); // Technikraum
fill(14, 9, 18, 13, '#'); // hut
carve(15, 10, 17, 12);
fill(15, 13, 17, 13, 'G'); // hut window to the south
door([16, 9]); // hut door, north
door([18, 4]); // Technikraum <-> Kai
door([18, 7], [18, 8]); // alley mouth into the lit corner
set(21, 10, 'C'); // bollards as cover in the alley
set(19, 14, 'C');

// Zollgalerie (glazed walkway) with vestibule, stairwell
carve(23, 3, 79, 5);
fill(23, 2, 79, 2, 'G'); // glass over the water
door([22, 3], [22, 4], [22, 5]); // Technikraum <-> gallery
carve(77, 7, 79, 19); // stairwell
door([77, 6], [78, 6], [79, 6]);
door([77, 20], [78, 20], [79, 20]);

// Lagerhalle (hall) with shelves, customs bay, ramps
carve(23, 7, 65, 25);
for (const [x0, x1] of [[26, 38], [42, 62]]) fill(x0, 12, x1, 12, 'S');
for (const [x0, x1] of [[30, 40], [44, 58]]) fill(x0, 18, x1, 18, 'S');
for (const [x0, x1] of [[26, 36], [42, 48], [54, 62]]) fill(x0, 6, x1, 6, 'G'); // window bands to the gallery
fill(30, 19, 30, 25, '#'); // customs bay cage
fill(23, 19, 29, 19, '#');
door([30, 22], [30, 23]);
fill(27, 24, 28, 25, 'C'); // forklift in the bay
door([22, 14], [22, 15]); // west gate into the alley
door([32, 26], [33, 26], [50, 26], [51, 26]); // ramps
door([66, 21], [66, 22]); // east exit into the corridor

// Kühlhaus (cold store)
carve(67, 7, 75, 19);
fill(69, 10, 71, 15, 'C'); // compressor block
door([66, 9], [66, 10]);

// Kreuzung (corridor)
carve(67, 21, 98, 23);

// Zollbüro, server room, side passage, Torhaus
carve(85, 25, 96, 35);
fill(91, 32, 91, 35, '#');
fill(91, 32, 96, 32, '#');
fill(87, 24, 95, 24, 'G'); // office glass front
door([85, 24], [86, 24]); // office door
door([91, 34]); // server room door
door([97, 34]); // server room back door
carve(98, 25, 98, 43); // side passage
door([98, 24]);
carve(89, 37, 96, 43); // Torhaus
door([97, 39], [97, 40]); // Torhaus <-> side passage
door([92, 44], [93, 44]); // Torhaus <-> yard
fill(94, 44, 96, 44, 'G'); // Torhaus window to the yard

// Containerhof (yard) and loading zone
carve(23, 27, 83, 58);
carve(84, 45, 98, 58);
door([98, 44]); // side passage into the yard
grating(30, 27, 35, 29);
grating(48, 27, 53, 29);
grating(23, 36, 25, 57);
fill(46, 28, 47, 29, 'C'); // forklift at the lit east ramp
const row = (y, blocks) => blocks.forEach(([x0, x1]) => fill(x0, y, x1, y + 1, 'C'));
row(34, [[26, 29], [34, 37], [42, 45], [50, 53], [58, 61], [70, 73]]);
row(40, [[28, 31], [36, 39], [52, 55], [60, 63], [74, 77]]); // last one is the reefer
row(46, [[30, 33], [38, 41], [50, 53], [54, 57]]);
door([45, 35]); // open container, hide spot
door([54, 46]); // open container, hide spot
fill(56, 50, 60, 54, '#'); // crane cab
carve(57, 51, 59, 53);
door([56, 52]);
fill(60, 51, 60, 53, 'G');
fill(66, 50, 71, 53, 'C'); // fuel tank

// Zufahrt (entrance yard) and Pumpenhaus
carve(1, 41, 21, 58);
door([22, 50], [22, 51]); // into the yard
carve(1, 19, 21, 39);
fill(4, 22, 5, 30, 'P');
fill(12, 28, 16, 34, 'P');
door([8, 18], [9, 18]); // Pumpenhaus <-> Kai
door([8, 40], [9, 40]); // Pumpenhaus <-> Zufahrt
door([22, 36], [22, 37]); // Pumpenhaus <-> yard

// ---------- objects ----------
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
const guard = (name, points, props = {}) =>
  polyline(name, 'guard', points, [prop('kind', 'dockGuard'), ...Object.entries(props).map(([k, v]) => prop(k, v))]);
const post = (name, [x, y], facing, sweep) =>
  point(name, 'guard', [c(x, y).x, c(x, y).y], [prop('kind', 'dockGuard'), prop('facing', facing), prop('sweep', sweep)]);
const camera = (name, [x, y], angle, range) =>
  point(name, 'thermalCamera', [c(x, y).x, c(x, y).y], [prop('angle', angle), prop('fov', 70), prop('range', range)]);
const loot = (name, kind, [x, y], place, group, variant) =>
  point(name, 'loot', [c(x, y).x, c(x, y).y], [
    prop('kind', kind),
    prop('place', place),
    ...(group ? [prop('group', group), prop('variant', variant)] : []),
  ]);
const hideSpot = (name, label, [x, y]) => point(name, 'hideSpot', [c(x, y).x, c(x, y).y], [prop('label', label)]);
const lightSwitch = (name, label, [x, y], target, alerts) =>
  point(name, 'switch', [c(x, y).x, c(x, y).y], [prop('label', label), prop('target', target), prop('alerts', alerts)]);
const sign = (text, [x, y]) => point(text, 'sign', [c(x, y).x, c(x, y).y]);

const spawn = c(4, 54);
const objects = [
  point('player_spawn', '', [spawn.x, spawn.y]),
  rect('boat', 'extraction', 1, 4, 6, 9, [prop('label', 'Boot')]),

  loot('block_a', 'serverBlock', [94, 34], 'Serverraum hinter dem Büro', 'block', 'A'),
  loot('block_b', 'serverBlock', [25, 22], 'Zollbucht in der Halle', 'block', 'B'),
  loot('probe_a', 'cryoSample', [74, 12], 'Kühlhaus', 'probe', 'A'),
  loot('probe_b', 'cryoSample', [73, 41], 'Kühlcontainer im Hof', 'probe', 'B'),
  loot('papers', 'papers', [88, 30], 'Büro'),
  loot('cashbox', 'cashbox', [89, 38], 'Torhaus'),

  guard('halle_a', [[32, 9], [62, 9], [62, 23], [32, 23]], { partner: 'halle_b', chat: '0,2' }),
  guard('halle_b', [[34, 9], [60, 9], [60, 23], [34, 23]], { partner: 'halle_a', chat: '0,2' }),
  guard('hof_a', [[28, 32], [66, 32], [66, 49], [28, 49]], { partner: 'hof_b', chat: '0,2' }),
  guard('hof_b', [[30, 32], [64, 32], [64, 49], [30, 49]], { partner: 'hof_a', chat: '0,2' }),
  guard('tor_a', [[85, 22], [96, 22], [98, 26], [98, 42], [93, 42]], { partner: 'tor_b', wait: '1:8' }),
  guard('tor_b', [[87, 22], [94, 22], [98, 28], [98, 40], [94, 41]], { partner: 'tor_a', wait: '3:8' }),
  guard('kai', [[8, 15], [13, 15], [13, 8], [8, 8]]),
  polyline('kai_alley', 'detour', [[17, 8], [20, 10], [20, 16], [20, 10], [17, 8]], [prop('guard', 'kai'), prop('after', 2)]),
  post('pfoertner', [95, 38], 90, 120),
  post('hafenmeister', [16, 11], 90, 90),

  camera('treppe', [78, 7], 90, 300),
  camera('mast_ost', [62, 28], 180, 400),
  camera('mast_sued', [46, 57], 270, 280),
  camera('tor', [86, 45], 180, 280),
  camera('pumpenhaus', [10, 19], 90, 280),

  hideSpot('container_1', 'Offener Container', [45, 35]),
  hideSpot('container_2', 'Offener Container', [54, 46]),
  hideSpot('kranhaus', 'Kranhaus', [58, 52]),

  lightSwitch('gallery_lights', 'Galerielicht', [20, 4], 'gallery', 'halle_a,halle_b'),
  lightSwitch('compressor', 'Kompressor', [67, 11], 'coldstore', 'halle_a,halle_b'),

  sign('← Kühlhaus', [68, 21]),
  sign('↑ Galerie', [78, 22]),
  sign('Zoll →', [84, 21]),
  sign('Tor 4', [16, 52]),
];

const lights = [
  rect('gallery', 'light', 23, 3, 76, 5, [prop('brightness', 1)]),
  rect('office', 'light', 85, 25, 96, 31, [prop('brightness', 0.9)]),
  rect('office_back', 'light', 85, 32, 90, 35, [prop('brightness', 0.9)]),
  rect('server', 'light', 92, 33, 96, 35, [prop('brightness', 0.2)]),
  rect('torhaus', 'light', 89, 37, 96, 43, [prop('brightness', 0.4)]),
  rect('east_ramp', 'light', 46, 27, 56, 30, [prop('brightness', 0.7)]),
  rect('customs', 'light', 23, 20, 29, 25, [prop('brightness', 0.6)]),
  rect('tank', 'light', 65, 49, 72, 54, [prop('brightness', 0.7)]),
  rect('hall_emergency', 'light', 24, 13, 64, 17, [prop('brightness', 0.25)]),
  rect('lantern', 'light', 9, 6, 17, 16, [prop('brightness', 0.6)]),
  rect('gate_lamp', 'light', 8, 48, 14, 54, [prop('brightness', 0.5)]),
];

const noise = [
  rect('ramp_west', 'noise', 30, 27, 35, 29, [prop('surface', 1.6)]),
  rect('ramp_east', 'noise', 48, 27, 53, 29, [prop('surface', 1.6)]),
  rect('west_lane', 'noise', 23, 36, 25, 57, [prop('surface', 1.6)]),
  rect('coldstore', 'noise', 67, 7, 75, 19, [prop('masking', 0.5)]),
  rect('generator', 'noise', 64, 48, 73, 55, [prop('masking', 0.4)]),
  rect('pumps', 'noise', 1, 19, 21, 39, [prop('masking', 0.3)]),
];

// ---------- checks ----------
const at = (x, y) => grid[y][x];
for (const obj of objects) {
  if (obj.type === 'loot' || obj.type === 'hideSpot' || obj.type === 'switch' || obj.type === 'thermalCamera' || obj.name === 'player_spawn') {
    const tx = Math.floor(obj.x / T);
    const ty = Math.floor(obj.y / T);
    if (at(tx, ty) !== '.') throw new Error(`${obj.name} sits in a wall at ${tx},${ty}`);
  }
}

// ---------- output ----------
const layer = (id, name, data) => ({ data, height: H, id, name, opacity: 1, type: 'tilelayer', visible: true, width: W, x: 0, y: 0 });
const objectLayer = (id, name, objs) => ({ draworder: 'topdown', id, name, objects: objs, opacity: 1, type: 'objectgroup', visible: true, x: 0, y: 0 });
const briefing = [
  'Pier 9, Nachtschicht. Im Zoll-Lager warten zwei Lieferungen, die morgen früh weg sind.',
  'Hol eine davon. Oder beide, wenn du dich traust.',
  'Rein über die Kaimauer, raus mit dem Boot.',
].join('\n');

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
writeFileSync(new URL('../public/maps/pier9.json', import.meta.url), JSON.stringify(map) + '\n');
console.log(grid.map((r, y) => String(y).padStart(2) + ' ' + r.join('')).join('\n'));
