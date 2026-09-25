// The demo map (docs/demo.md): a compact Pier 9 built from the script of the first three
// minutes. Run once:
//   node scripts/make-demo.mjs
// After that the Tiled file (public/maps/demo.json) is the source; edit it in Tiled.
//
// Coordinates below are tiles; the map is 60 x 40 with the harbour along the west edge.
import { createMap } from './tiled.mjs';

const W = 60;
const H = 40;
const { fill, carve, door, grating, rect, prop, guard, post, camera, loot, sign, hideSpot, lightSwitch, spawn, write } = createMap(W, H);

// ---------- geometry ----------
fill(0, 0, 1, H - 1, 'W'); // harbour

// Kai (quay): the boat, the lantern, the way in
carve(2, 24, 13, 38);
// Steg: catwalk along the water from the quay up to the corridor, loud grating
carve(2, 16, 4, 23);
grating(2, 16, 4, 23);
// Corridor along the three rooms, with the gate down into the yard
carve(5, 17, 44, 19);
carve(29, 20, 31, 21);
// Hof (yard)
carve(20, 22, 45, 38);
// Gasse (lane) between quay and yard, with an open container beside it
carve(14, 30, 19, 33);
fill(16, 28, 18, 29, 'C');
door([17, 29]);
// Open container in the corridor's south wall, sealed from the yard
fill(13, 20, 15, 21, 'C');
door([14, 20]);
// Container rows in the yard, one of them open
const row = (y, blocks) => blocks.forEach(([x0, x1]) => fill(x0, y, x1, y + 1, 'C'));
row(28, [[22, 25], [34, 37], [40, 43]]);
row(33, [[24, 27], [30, 33], [38, 41]]);
door([31, 33]);

// Büro (office, north-west) with the server room behind it and a window band to the corridor
carve(5, 4, 16, 15);
fill(5, 9, 10, 9, '#');
fill(10, 4, 10, 9, '#');
door([7, 9]); // server room door
fill(12, 6, 14, 7, 'C'); // desk
door([10, 16]); // office door
fill(12, 16, 15, 16, 'G');

// Lager (storage, north middle) with shelves
carve(18, 4, 32, 15);
fill(21, 8, 29, 8, 'S');
fill(21, 11, 29, 11, 'S');
door([25, 16]);

// Kühlhaus (cold store, north-east) with the compressor block
carve(34, 4, 44, 15);
fill(38, 7, 40, 10, 'C');
door([39, 16]);

// ---------- objects ----------
const objects = [
  spawn([8, 33]),
  rect('boat', 'extraction', 2, 30, 4, 35, [prop('label', 'Boot')]),

  loot('block', 'serverBlock', [7, 6], 'Serverraum', 'block', 'A'),
  loot('probe', 'cryoSample', [43, 5], 'Kühlhaus', 'probe', 'A'),
  loot('papers', 'papers', [15, 6], 'Büro'),
  loot('cashbox', 'cashbox', [25, 10], 'Lager'),

  guard('gasse', [[17, 32], [26, 32]], { wait: '0:3' }),
  guard('hof_a', [[21, 24], [44, 24], [44, 37], [21, 37]], { partner: 'hof_b', chat: '0,2' }),
  guard('hof_b', [[23, 24], [44, 24], [44, 37], [23, 37]], { partner: 'hof_a', chat: '0,2' }),
  guard('buero_a', [[6, 11], [15, 11], [15, 14], [6, 14]], { partner: 'buero_b', chat: '1,3' }),
  guard('buero_b', [[8, 11], [15, 11], [15, 14], [8, 14]], { partner: 'buero_a', chat: '1,3' }),
  guard('lager', [[19, 6], [31, 6], [31, 14], [19, 14]], { wait: '1:4;3:4' }),
  post('steg', [3, 24], 270, 60),

  camera('steg_kamera', [2, 16], 90, 260),
  camera('gassen_kamera', [20, 30], 180, 200),

  hideSpot('kiste_gasse', 'Offener Container', [17, 29]),
  hideSpot('kiste_hof', 'Offener Container', [31, 33]),
  hideSpot('kiste_gang', 'Offener Container', [14, 20]),

  lightSwitch('hoflicht', 'Hoflicht', [28, 22], 'hoflicht', 'hof_a,hof_b'),
  lightSwitch('buerolicht', 'Bürolicht', [12, 17], 'buero', 'buero_a,buero_b'),

  sign('Hof →', [12, 31]),
  sign('↑ Steg', [4, 26]),
  sign('↑ Büro · Lager · Kühlhaus', [30, 23]),
  sign('← Büro', [20, 18]),
  sign('↑ Lager', [25, 19]),
  sign('Kühlhaus →', [36, 18]),
];

const lights = [
  rect('laterne', 'light', 8, 29, 13, 33, [prop('brightness', 0.6)]),
  rect('hoflicht', 'light', 27, 22, 33, 26, [prop('brightness', 0.8)]),
  rect('buero', 'light', 5, 10, 16, 15, [prop('brightness', 0.9)]),
  rect('server', 'light', 5, 4, 9, 8, [prop('brightness', 0.15)]),
  rect('notlicht', 'light', 5, 17, 44, 19, [prop('brightness', 0.25)]),
];

const noise = [
  rect('steg', 'noise', 2, 16, 4, 23, [prop('surface', 1.6)]),
  rect('kuehlhaus', 'noise', 34, 4, 44, 15, [prop('masking', 0.5)]),
];

const briefing = [
  'Pier 9, Nachtschicht. Im Zoll-Lager warten zwei Lieferungen, die morgen früh weg sind.',
  'Hol eine davon. Oder beide, wenn du dich traust.',
  'Rein und raus über das Boot am Kai. Der Steg ist kurz, der Hof ist groß.',
].join('\n');

write('../public/maps/demo.json', { objects, lights, noise, briefing });
