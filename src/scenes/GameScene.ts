import * as Phaser from 'phaser';
import { parseLevel, type Level, type TiledMap } from '../systems/level';
import { directionFromKeys, type Direction } from '../systems/movement';
import {
  createGameState,
  PLAYER_SIZE,
  step,
  TICK_SECONDS,
  type Command,
  type GameState,
} from '../systems/simulation';

const LOCAL_PLAYER = 'p1';
// After a long stall (tab in background) the simulation catches up at most this far.
const MAX_TICKS_PER_FRAME = 5;

type WasdKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

/**
 * Translates input into commands, runs the simulation in fixed ticks and draws the result.
 * No game state lives here: the rectangle only mirrors `state`.
 */
export class GameScene extends Phaser.Scene {
  private level!: Level;
  private state!: GameState;
  private keys!: WasdKeys;
  private playerView!: Phaser.GameObjects.Rectangle;
  private pending: Command[] = [];
  private lastDirection: Direction = { x: 0, y: 0 };
  private accumulator = 0;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.tilemapTiledJSON('testmap', 'maps/testmap.json');
    this.load.image('tiles-placeholder', 'tilesets/placeholder.png');
  }

  create(): void {
    // The simulation reads the raw Tiled JSON; Phaser only uses the same file for drawing.
    const tiled = this.cache.tilemap.get('testmap') as { data: TiledMap } | undefined;
    if (!tiled) {
      throw new Error('Map "testmap" is not loaded');
    }
    this.level = parseLevel(tiled.data);
    this.state = createGameState(this.level, [LOCAL_PLAYER]);

    const map = this.make.tilemap({ key: 'testmap' });
    // First argument is the tileset name inside the Tiled file.
    const tileset = map.addTilesetImage('placeholder', 'tiles-placeholder');
    if (!tileset) {
      throw new Error('Tileset "placeholder" not found in testmap');
    }
    map.createLayer('ground', tileset);
    map.createLayer('walls', tileset);

    const player = this.state.players[LOCAL_PLAYER];
    if (!player) {
      throw new Error('Local player is missing from the game state');
    }
    this.playerView = this.add.rectangle(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, 0xf2f2f2);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.playerView, true);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available');
    }
    this.keys = keyboard.addKeys('W,A,S,D') as WasdKeys;
  }

  override update(_time: number, delta: number): void {
    this.collectInput();

    this.accumulator = Math.min(this.accumulator + delta / 1000, MAX_TICKS_PER_FRAME * TICK_SECONDS);
    while (this.accumulator >= TICK_SECONDS) {
      this.state = step(this.state, this.pending, this.level);
      this.pending = [];
      this.accumulator -= TICK_SECONDS;
    }

    const player = this.state.players[LOCAL_PLAYER];
    if (player) {
      this.playerView.setPosition(player.x, player.y);
    }
  }

  /** Sends a move command only when the direction changes, as a network client would. */
  private collectInput(): void {
    const direction = directionFromKeys({
      up: this.keys.W.isDown,
      down: this.keys.S.isDown,
      left: this.keys.A.isDown,
      right: this.keys.D.isDown,
    });
    if (direction.x !== this.lastDirection.x || direction.y !== this.lastDirection.y) {
      this.pending.push({ type: 'move', playerId: LOCAL_PLAYER, direction });
      this.lastDirection = direction;
    }
  }
}
