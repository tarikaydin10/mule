import type { Level } from './level';

/**
 * Builds a level from rows of text for tests: '#' is solid, '.' is free.
 * The spawn is the centre of the tile marked 'P'.
 */
export function levelFromRows(rows: string[], tileSize = 32): Level {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  let spawn = { x: 0, y: 0 };
  rows.forEach((row, y) => {
    const x = row.indexOf('P');
    if (x >= 0) {
      spawn = { x: x * tileSize + tileSize / 2, y: y * tileSize + tileSize / 2 };
    }
  });
  return { width, height, tileSize, solid: rows.join('').split('').map((c) => c === '#'), spawn, lights: [], loot: [], noiseZones: [], guards: [] };
}
