import * as Phaser from 'phaser';
import { addThermalFilter, type ThermalFilter } from '../render/ThermalFilter';
import { computeVelocity } from '../systems/movement';
import { temperatureTint, togglePolarity } from '../systems/thermal';
import { numberProperty } from '../systems/tiled';

const PLAYER_SPEED = 160; // px/s
const PLAYER_SIZE = 20; // px, below the 32 px tile size so one-tile gaps stay passable
const PLAYER_TEMPERATURE = 0.9; // body heat

type WasdKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

/** Wires the pure systems to Phaser: map loading, rendering, physics and input. */
export class GameScene extends Phaser.Scene {
  private playerBody!: Phaser.Physics.Arcade.Body;
  private keys!: WasdKeys;
  private thermal!: ThermalFilter;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.tilemapTiledJSON('testmap', 'maps/testmap.json');
    this.load.image('tiles-placeholder', 'tilesets/placeholder.png');
  }

  create(): void {
    const map = this.make.tilemap({ key: 'testmap' });
    // First argument is the tileset name inside the Tiled file.
    const tileset = map.addTilesetImage('placeholder', 'tiles-placeholder');
    if (!tileset) {
      throw new Error('Tileset "placeholder" not found in testmap');
    }
    const ground = map.createLayer('ground', tileset);
    const walls = map.createLayer('walls', tileset);
    // Plain (not GPU) layers, because every tile is tinted individually.
    if (!(ground instanceof Phaser.Tilemaps.TilemapLayer) || !(walls instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error('Layers "ground" and "walls" are required in testmap');
    }
    tintTilesByTemperature(ground);
    tintTilesByTemperature(walls);
    // Collision is authored in Tiled as a bool tile property.
    walls.setCollisionByProperty({ collides: true });

    const heatSources = this.createHeatSources(map);

    const spawn = map.findObject('objects', (obj) => obj.name === 'player_spawn');
    if (spawn?.x === undefined || spawn.y === undefined) {
      throw new Error('Object "player_spawn" not found in testmap');
    }

    const player = this.add.rectangle(
      spawn.x,
      spawn.y,
      PLAYER_SIZE,
      PLAYER_SIZE,
      temperatureTint(PLAYER_TEMPERATURE),
    );
    this.physics.add.existing(player);
    this.playerBody = player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(player, walls);
    this.physics.add.collider(player, heatSources);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(player, true);
    this.thermal = addThermalFilter(this.cameras.main);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available');
    }
    this.keys = keyboard.addKeys('W,A,S,D') as WasdKeys;
    keyboard.on('keydown-T', () => {
      this.thermal.polarity = togglePolarity(this.thermal.polarity);
    });
  }

  override update(time: number): void {
    this.thermal.time = time / 1000;
    const velocity = computeVelocity(
      {
        up: this.keys.W.isDown,
        down: this.keys.S.isDown,
        left: this.keys.A.isDown,
        right: this.keys.D.isDown,
      },
      PLAYER_SPEED,
    );
    this.playerBody.setVelocity(velocity.x, velocity.y);
  }

  /** Solid placeholder props from the Tiled objects of type "heat_source". */
  private createHeatSources(map: Phaser.Tilemaps.Tilemap): Phaser.Physics.Arcade.StaticGroup {
    const group = this.physics.add.staticGroup();
    for (const obj of map.getObjectLayer('objects')?.objects ?? []) {
      if (obj.type !== 'heat_source') {
        continue;
      }
      const temperature = numberProperty(obj.properties, 'temperature');
      const { x = 0, y = 0, width = 0, height = 0 } = obj;
      if (temperature === undefined) {
        throw new Error(`Heat source "${obj.name}" has no temperature property`);
      }
      group.add(this.add.rectangle(x + width / 2, y + height / 2, width, height, temperatureTint(temperature)));
    }
    return group;
  }
}

/** Tints every tile in the grey level of its Tiled "temperature" property, which the thermal filter reads. */
function tintTilesByTemperature(layer: Phaser.Tilemaps.TilemapLayer): void {
  layer.forEachTile((tile) => {
    if (tile.index < 0) {
      return;
    }
    const temperature = numberProperty(tile.properties, 'temperature');
    if (temperature === undefined) {
      throw new Error(`Tile ${tile.index} in layer "${layer.layer.name}" has no temperature property`);
    }
    tile.tint = temperatureTint(temperature);
  });
}
