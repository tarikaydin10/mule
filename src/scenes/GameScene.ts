import * as Phaser from 'phaser';
import { clipPolygonToRect } from '../systems/geometry';
import { parseLevel, type Level, type TiledMap } from '../systems/level';
import { directionFromKeys, type Direction, type Vector2 } from '../systems/movement';
import {
  createGameState,
  PLAYER_SIZE,
  step,
  TICK_SECONDS,
  type Command,
  type GameState,
} from '../systems/simulation';
import { visibilityPolygon } from '../systems/visibility';

const LOCAL_PLAYER = 'p1';
// After a long stall (tab in background) the simulation catches up at most this far.
// Slow frames below that are caught up in full, so the game never runs in slow motion.
const MAX_CATCH_UP_SECONDS = 0.25;

// What the player sees. Darkness is the remaining opacity of the black layer over the map.
const SIGHT_RADIUS = 420; // px
const NEAR_RADIUS = 96; // px, the player makes out shapes close by even in the dark
const WALL_REVEAL = 6; // px, faces of walls in view stay visible
const DARKNESS_OUT_OF_SIGHT = 0.92;
const DARKNESS_IN_SIGHT = 0.72; // dark area the player has line of sight to
const NEAR_ERASE = 0.45; // applied twice, at the full and at 60 % of NEAR_RADIUS, for a soft edge

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
  private darkness!: Phaser.GameObjects.RenderTexture;
  private eraser!: Phaser.GameObjects.Graphics;
  private litFrom: Vector2 | null = null;
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

    this.darkness = this.add.renderTexture(0, 0, map.widthInPixels, map.heightInPixels).setOrigin(0, 0);
    // Not on the display list: only used to cut shapes out of the darkness.
    this.eraser = this.make.graphics({}, false);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.playerView, true);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available');
    }
    this.keys = keyboard.addKeys('W,A,S,D') as WasdKeys;
  }

  override update(): void {
    this.collectInput();

    // Wall-clock time, not Phaser's smoothed delta: that one is capped to 60 fps while the
    // window is unfocused or recovering from a stall, which would run the simulation slow.
    this.accumulator = Math.min(this.accumulator + this.game.loop.rawDelta / 1000, MAX_CATCH_UP_SECONDS);
    while (this.accumulator >= TICK_SECONDS) {
      this.state = step(this.state, this.pending, this.level);
      this.pending = [];
      this.accumulator -= TICK_SECONDS;
    }

    const player = this.state.players[LOCAL_PLAYER];
    if (player) {
      this.playerView.setPosition(player.x, player.y);
      this.drawDarkness(player);
    }
  }

  /** Redraws the darkness layer when the player has moved: dark, except what the player can see. */
  private drawDarkness(eye: Vector2): void {
    if (this.litFrom && this.litFrom.x === eye.x && this.litFrom.y === eye.y) {
      return;
    }
    this.litFrom = { x: eye.x, y: eye.y };

    const sight = visibilityPolygon(this.level, eye, SIGHT_RADIUS, WALL_REVEAL);
    const eraser = this.eraser.clear();
    // Erasing with alpha a keeps (1 - a) of the darkness; overlapping shapes multiply.
    erase(eraser, sight, 1 - DARKNESS_IN_SIGHT / DARKNESS_OUT_OF_SIGHT);
    erase(eraser, visibilityPolygon(this.level, eye, NEAR_RADIUS, WALL_REVEAL), NEAR_ERASE);
    erase(eraser, visibilityPolygon(this.level, eye, NEAR_RADIUS * 0.6, WALL_REVEAL), NEAR_ERASE);
    for (const zone of this.level.lights) {
      erase(eraser, clipPolygonToRect(sight, zone), zone.brightness);
    }
    this.darkness.clear().fill(0x000000, DARKNESS_OUT_OF_SIGHT).erase(eraser).render();
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

function erase(graphics: Phaser.GameObjects.Graphics, polygon: Vector2[], alpha: number): void {
  const [first, ...rest] = polygon;
  if (!first || rest.length < 2) {
    return;
  }
  graphics.fillStyle(0xffffff, alpha).beginPath().moveTo(first.x, first.y);
  for (const point of rest) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.closePath().fillPath();
}
