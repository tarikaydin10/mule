import type { Level } from './level';

/**
 * Builds a level from rows of text for tests: '#' is a wall, 'G' is glass, '.' is free.
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
  const cells = rows.join('').split('');
  return {
    width,
    height,
    tileSize,
    solid: cells.map((c) => c === '#' || c === 'G'),
    glass: cells.map((c) => c === 'G'),
    spawn,
    lights: [],
    loot: [],
    noiseZones: [],
    guards: [],
    extraction: null,
  };
}
