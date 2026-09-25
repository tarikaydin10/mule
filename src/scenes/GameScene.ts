import * as Phaser from 'phaser';
import { computeVelocity } from '../systems/movement';

const PLAYER_SPEED = 160; // px/s
const PLAYER_SIZE = 20; // px, below the 32 px tile size so one-tile gaps stay passable

type WasdKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

/** Wires the pure systems to Phaser: map loading, rendering, physics and input. */
export class GameScene extends Phaser.Scene {
  private playerBody!: Phaser.Physics.Arcade.Body;
  private keys!: WasdKeys;

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
    map.createLayer('ground', tileset);
    const walls = map.createLayer('walls', tileset);
    if (!walls) {
      throw new Error('Layer "walls" not found in testmap');
    }
    // Collision is authored in Tiled as a bool tile property.
    walls.setCollisionByProperty({ collides: true });

    const spawn = map.findObject('objects', (obj) => obj.name === 'player_spawn');
    if (spawn?.x === undefined || spawn.y === undefined) {
      throw new Error('Object "player_spawn" not found in testmap');
    }

    const player = this.add.rectangle(spawn.x, spawn.y, PLAYER_SIZE, PLAYER_SIZE, 0xf2f2f2);
    this.physics.add.existing(player);
    this.playerBody = player.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(player, walls);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(player, true);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available');
    }
    this.keys = keyboard.addKeys('W,A,S,D') as WasdKeys;
  }

  override update(): void {
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
}
