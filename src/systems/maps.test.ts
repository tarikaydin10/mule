import { describe, expect, it } from 'vitest';
import { isSolid, parseLevel, type Level, type TiledMap } from './level';
import type { Vector2 } from './movement';
import { findPath } from './pathfinding';

/**
 * Lint for the shipped maps: everything the simulation places must sit on a free tile,
 * every route must be walkable, and every objective reachable from the spawn.
 */

// Every shipped map, loaded by Vite at test time.
const files = import.meta.glob<TiledMap>('../../public/maps/*.json', { eager: true, import: 'default' });
const maps = Object.entries(files).map(([path, map]) => ({ name: path.split('/').pop() ?? path, level: parseLevel(map) }));

const free = (level: Level, point: Vector2) =>
  !isSolid(level, Math.floor(point.x / level.tileSize), Math.floor(point.y / level.tileSize));

/** Length of the shortest path in tiles, or Infinity when unreachable. */
function distance(level: Level, from: Vector2, to: Vector2): number {
  const path = findPath(level, from, to);
  if (path.length === 0) {
    const sameTile =
      Math.floor(from.x / level.tileSize) === Math.floor(to.x / level.tileSize) &&
      Math.floor(from.y / level.tileSize) === Math.floor(to.y / level.tileSize);
    return sameTile ? 0 : Infinity;
  }
  let length = 0;
  let previous = from;
  for (const point of path) {
    length += Math.hypot(point.x - previous.x, point.y - previous.y) / level.tileSize;
    previous = point;
  }
  return length;
}

for (const { name, level } of maps) describe(name, () => {
  it('places spawn, loot, cameras, hide spots and switches on free tiles', () => {
    expect(free(level, level.spawn)).toBe(true);
    for (const item of [...level.loot, ...level.thermalCameras, ...level.hideSpots, ...level.switches]) {
      expect(free(level, item), item.id).toBe(true);
    }
  });

  it('gives every guard a walkable route and detour', () => {
    for (const guard of level.guards) {
      for (const point of guard.route) {
        expect(free(level, point), `${guard.id} route`).toBe(true);
      }
      const loop = [...guard.route, guard.route[0] as Vector2];
      for (let i = 0; i + 1 < loop.length; i++) {
        expect(distance(level, loop[i] as Vector2, loop[i + 1] as Vector2), `${guard.id} leg ${i}`).toBeLessThan(Infinity);
      }
      if (guard.detour) {
        let previous = guard.route[guard.detour.after] as Vector2;
        for (const point of guard.detour.points) {
          expect(distance(level, previous, point), `${guard.id} detour`).toBeLessThan(Infinity);
          previous = point;
        }
      }
      if (guard.partner) {
        expect(level.guards.find((g) => g.id === guard.partner)?.partner).toBe(guard.id);
      }
    }
  });

  it('lets the player reach every loot, hide spot, switch and the extraction from the spawn', () => {
    const targets: Vector2[] = [...level.loot, ...level.hideSpots, ...level.switches];
    if (level.extraction) {
      targets.push({ x: level.extraction.x + 8, y: level.extraction.y + 8 });
    }
    for (const target of targets) {
      expect(distance(level, level.spawn, target)).toBeLessThan(Infinity);
    }
  });
});

describe('pier9', () => {
  const pier9 = maps.find((m) => m.name === 'pier9.json')?.level;
  if (!pier9) {
    throw new Error('pier9.json is missing');
  }
  const extraction = { x: pier9.extraction!.x + 48, y: pier9.extraction!.y + 48 };
  const loot = (id: string) => {
    const spawn = pier9.loot.find((l) => l.id === id);
    if (!spawn) {
      throw new Error(`${id} is missing`);
    }
    return spawn;
  };

  it('keeps the return trips inside the design targets', () => {
    // 5 tiles/s with the sample, 3 tiles/s with the block (docs/pier9.md, stage 1).
    expect(distance(pier9, loot('loot-probe_a'), extraction) / 5).toBeLessThan(25);
    expect(distance(pier9, loot('loot-probe_b'), extraction) / 5).toBeLessThan(30);
    expect(distance(pier9, loot('loot-block_a'), extraction) / 3).toBeLessThan(60);
    expect(distance(pier9, loot('loot-block_b'), extraction) / 3).toBeLessThan(45);
  });

  it('has both places for both main targets and the switches named in the concept', () => {
    expect(pier9.loot.filter((l) => l.group === 'block').map((l) => l.variant).sort()).toEqual(['A', 'B']);
    expect(pier9.loot.filter((l) => l.group === 'probe').map((l) => l.variant).sort()).toEqual(['A', 'B']);
    expect(pier9.switches.map((s) => s.target).sort()).toEqual(['coldstore', 'gallery']);
    expect(pier9.lights.some((zone) => zone.name === 'gallery')).toBe(true);
    expect(pier9.noiseZones.some((zone) => zone.name === 'coldstore')).toBe(true);
    expect(pier9.thermalCameras).toHaveLength(5);
    expect(pier9.hideSpots).toHaveLength(3);
  });
});
