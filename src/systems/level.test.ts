import { describe, expect, it } from 'vitest';
import { isSolid, parseLevel, type TiledMap } from './level';

const tiledMap: TiledMap = {
  width: 3,
  height: 2,
  tilewidth: 32,
  tileheight: 32,
  layers: [
    { name: 'ground', type: 'tilelayer', data: [1, 1, 1, 1, 1, 1] },
    // gid 2 is the colliding wall; the third one carries a horizontal flip flag
    { name: 'walls', type: 'tilelayer', data: [2, 0, 2 | 0x80000000, 0, 1, 0] },
    { name: 'objects', type: 'objectgroup', objects: [{ name: 'player_spawn', x: 48, y: 40 }] },
  ],
  tilesets: [
    {
      firstgid: 1,
      tiles: [{ id: 1, properties: [{ name: 'collides', value: true }] }],
    },
  ],
};

describe('parseLevel', () => {
  it('marks wall tiles whose tileset tile collides as solid, ignoring flip flags', () => {
    const level = parseLevel(tiledMap);
    expect(level.solid).toEqual([true, false, true, false, false, false]);
    expect(level).toMatchObject({ width: 3, height: 2, tileSize: 32 });
  });

  it('reads the player spawn', () => {
    expect(parseLevel(tiledMap).spawn).toEqual({ x: 48, y: 40 });
  });

  it('fails loudly when the spawn is missing', () => {
    const withoutSpawn = { ...tiledMap, layers: tiledMap.layers.filter((layer) => layer.name !== 'objects') };
    expect(() => parseLevel(withoutSpawn)).toThrow('player_spawn');
  });
});

describe('parseLevel lights', () => {
  const zone = (brightness: unknown) => ({
    name: 'lamp',
    x: 32,
    y: 0,
    width: 64,
    height: 32,
    properties: [{ name: 'brightness', value: brightness }],
  });
  const withLights = (objects: object[]): TiledMap => ({
    ...tiledMap,
    layers: [...tiledMap.layers, { name: 'lights', type: 'objectgroup', objects } as TiledMap['layers'][number]],
  });

  it('reads light zones with their brightness', () => {
    expect(parseLevel(withLights([zone(0.8)])).lights).toEqual([
      { name: 'lamp', x: 32, y: 0, width: 64, height: 32, brightness: 0.8 },
    ]);
  });

  it('treats a map without a lights layer as completely dark', () => {
    expect(parseLevel(tiledMap).lights).toEqual([]);
  });

  it('fails loudly when a zone has no brightness', () => {
    expect(() => parseLevel(withLights([zone('bright')]))).toThrow('brightness');
  });
});

describe('parseLevel loot', () => {
  const withObjects = (objects: object[]): TiledMap => ({
    ...tiledMap,
    layers: tiledMap.layers.map((layer) =>
      layer.name === 'objects' ? { ...layer, objects: [...(layer.objects ?? []), ...objects] } : layer,
    ) as TiledMap['layers'],
  });
  const block = (kind: unknown) => ({ id: 7, name: 'rack', type: 'loot', x: 64, y: 16, properties: [{ name: 'kind', value: kind }] });

  it('reads loot objects with their kind and a stable id', () => {
    expect(parseLevel(withObjects([block('serverBlock')])).loot).toEqual([{ id: 'loot-7', kind: 'serverBlock', x: 64, y: 16 }]);
  });

  it('fails loudly on an unknown loot kind', () => {
    expect(() => parseLevel(withObjects([block('toaster')]))).toThrow('unknown kind');
  });
});

describe('isSolid', () => {
  it('treats everything outside the map as solid', () => {
    const level = parseLevel(tiledMap);
    expect(isSolid(level, 1, 0)).toBe(false);
    expect(isSolid(level, 0, 0)).toBe(true);
    expect(isSolid(level, -1, 0)).toBe(true);
    expect(isSolid(level, 3, 1)).toBe(true);
    expect(isSolid(level, 0, 2)).toBe(true);
  });
});
