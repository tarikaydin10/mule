import * as Phaser from 'phaser';
import { clipPolygonToRect } from '../systems/geometry';
import { parseLevel, type Level, type TiledMap } from '../systems/level';
import { LOOT, type LootKind } from '../systems/loot';
import { directionFromKeys, type Direction, type Vector2 } from '../systems/movement';
import {
  carriedLoot,
  createGameState,
  lootInReach,
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

// Placeholder look per loot kind: size in px and fill colour.
const LOOT_LOOK: Record<LootKind, { width: number; height: number; color: number }> = {
  serverBlock: { width: 26, height: 18, color: 0x5b8fd6 },
};

// Draw order: world, loot, player, darkness, hint line.
const DEPTH = { loot: 1, player: 2, darkness: 3, hud: 4 } as const;

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
  private lootViews = new Map<string, Phaser.GameObjects.Rectangle>();
  private hint!: Phaser.GameObjects.Text;
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
    this.playerView = this.add.rectangle(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, 0xf2f2f2).setDepth(DEPTH.player);
    for (const [id, loot] of Object.entries(this.state.loot)) {
      const look = LOOT_LOOK[loot.kind];
      this.lootViews.set(id, this.add.rectangle(loot.x, loot.y, look.width, look.height, look.color).setDepth(DEPTH.loot));
    }
    this.hint = this.add
      .text(16, 540 - 16, '', { fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#e9ece6' })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setShadow(0, 1, '#000000', 3);

    this.darkness = this.add
      .renderTexture(0, 0, map.widthInPixels, map.heightInPixels)
      .setOrigin(0, 0)
      .setDepth(DEPTH.darkness);
    // Not on the display list: only used to cut shapes out of the darkness.
    this.eraser = this.make.graphics({}, false);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.playerView, true);

    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available');
    }
    this.keys = keyboard.addKeys('W,A,S,D') as WasdKeys;
    // E picks up or puts down; the simulation decides whether it is possible.
    keyboard.on('keydown-E', () => {
      const type = carriedLoot(this.state, LOCAL_PLAYER) ? 'drop' : 'pickUp';
      this.pending.push({ type, playerId: LOCAL_PLAYER });
    });
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
    for (const [id, loot] of Object.entries(this.state.loot)) {
      // Carried loot sits on top of the carrier.
      this.lootViews.get(id)?.setPosition(loot.x, loot.y).setDepth(loot.carriedBy ? DEPTH.player + 0.5 : DEPTH.loot);
    }
    this.hint.setText(this.hintText());
  }

  private hintText(): string {
    const carried = carriedLoot(this.state, LOCAL_PLAYER);
    const carriedKind = carried ? this.state.loot[carried]?.kind : undefined;
    if (carriedKind) {
      const loot = LOOT[carriedKind];
      const effects = [
        loot.speedMultiplier < 1 ? 'langsamer' : null,
        loot.handsFree ? null : 'beide Hände belegt',
      ].filter(Boolean);
      return `Trägt: ${loot.name}${effects.length ? ` (${effects.join(', ')})` : ''}   ·   E: abstellen`;
    }
    const reachable = lootInReach(this.state, LOCAL_PLAYER);
    const reachableKind = reachable ? this.state.loot[reachable]?.kind : undefined;
    return reachableKind ? `E: ${LOOT[reachableKind].name} aufheben` : '';
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
