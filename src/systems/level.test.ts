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

  it('marks glass tiles, which are solid for movement too', () => {
    const glassMap: TiledMap = {
      ...tiledMap,
      tilesets: [
        {
          firstgid: 1,
          tiles: [
            { id: 1, properties: [{ name: 'collides', value: true }] },
            { id: 2, properties: [{ name: 'collides', value: true }, { name: 'glass', value: true }] },
          ],
        },
      ],
      layers: tiledMap.layers.map((layer) => (layer.name === 'walls' ? { ...layer, data: [2, 3, 0, 0, 0, 0] } : layer)),
    };
    const level = parseLevel(glassMap);
    expect(level.solid.slice(0, 2)).toEqual([true, true]);
    expect(level.glass.slice(0, 2)).toEqual([false, true]);
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

describe('parseLevel guards and noise zones', () => {
  const withLayers = (objects: object[], noise: object[] = []): TiledMap => ({
    ...tiledMap,
    layers: [
      ...tiledMap.layers.map((layer) =>
        layer.name === 'objects' ? { ...layer, objects: [...(layer.objects ?? []), ...objects] } : layer,
      ),
      { name: 'noise', type: 'objectgroup', objects: noise },
    ] as TiledMap['layers'],
  });
  const guard = (name: string, props: object[]) => ({
    id: 1,
    name,
    type: 'guard',
    x: 16,
    y: 16,
    polyline: [{ x: 0, y: 0 }, { x: 64, y: 0 }],
    properties: props,
  });

  it('reads guards with their absolute route and partner', () => {
    const level = parseLevel(
      withLayers([
        guard('left', [{ name: 'kind', value: 'dockGuard' }, { name: 'partner', value: 'right' }]),
        guard('right', [{ name: 'kind', value: 'dockGuard' }, { name: 'partner', value: 'left' }]),
      ]),
    );
    expect(level.guards[0]).toEqual({
      id: 'guard-left',
      kind: 'dockGuard',
      route: [{ x: 16, y: 16 }, { x: 80, y: 16 }],
      partner: 'guard-right',
    });
  });

  it('fails loudly on an unknown guard kind or partner', () => {
    expect(() => parseLevel(withLayers([guard('x', [{ name: 'kind', value: 'ninja' }])]))).toThrow('unknown kind');
    expect(() =>
      parseLevel(withLayers([guard('x', [{ name: 'kind', value: 'dockGuard' }, { name: 'partner', value: 'nobody' }])])),
    ).toThrow('unknown partner');
  });

  it('reads noise zones with defaults for missing properties', () => {
    const level = parseLevel(
      withLayers([], [{ name: 'fans', x: 0, y: 0, width: 64, height: 32, properties: [{ name: 'masking', value: 0.6 }] }]),
    );
    expect(level.noiseZones).toEqual([{ name: 'fans', x: 0, y: 0, width: 64, height: 32, surface: 1, masking: 0.6 }]);
  });
});

describe('parseLevel extraction', () => {
  const withObjects = (objects: object[]): TiledMap => ({
    ...tiledMap,
    layers: tiledMap.layers.map((layer) =>
      layer.name === 'objects' ? { ...layer, objects: [...(layer.objects ?? []), ...objects] } : layer,
    ) as TiledMap['layers'],
  });

  it('reads the extraction zone, or null when there is none', () => {
    const zone = { name: 'van', type: 'extraction', x: 0, y: 32, width: 64, height: 32 };
    expect(parseLevel(withObjects([zone])).extraction).toEqual({ x: 0, y: 32, width: 64, height: 32 });
    expect(parseLevel(tiledMap).extraction).toBeNull();
  });
});

describe('parseLevel thermal cameras', () => {
  it('reads cameras with angle in degrees and defaults for fov and range', () => {
    const map: TiledMap = {
      ...tiledMap,
      layers: tiledMap.layers.map((layer) =>
        layer.name === 'objects'
          ? { ...layer, objects: [...(layer.objects ?? []), { name: 'door', type: 'thermalCamera', x: 40, y: 8, properties: [{ name: 'angle', value: 90 }] }] }
          : layer,
      ) as TiledMap['layers'],
    };
    const [camera] = parseLevel(map).thermalCameras;
    expect(camera).toMatchObject({ id: 'camera-door', x: 40, y: 8, range: 280 });
    expect(camera?.facing).toBeCloseTo(Math.PI / 2);
    expect(camera?.fieldOfView).toBeCloseTo((70 * Math.PI) / 180);
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
