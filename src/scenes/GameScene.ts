import * as Phaser from 'phaser';
import type { GameEvent } from '../systems/events';
import { clipPolygonToRect } from '../systems/geometry';
import { DARK_SIGHT, GUARD_SIZE, type GuardMode, type GuardState } from '../systems/guards';
import { GUARDS } from '../systems/guardTypes';
import { parseLevel, type Level, type TiledMap } from '../systems/level';
import { LOOT, type LootKind } from '../systems/loot';
import { directionFromKeys, type Direction, type Vector2 } from '../systems/movement';
import {
  carriedLoot,
  createGameState,
  inExtraction,
  lootInReach,
  securedLoot,
  PLAYER_SIZE,
  step,
  TICK_SECONDS,
  type Command,
  type GameOptions,
  type GameState,
} from '../systems/simulation';
import { visibilityPolygon, visionCone } from '../systems/visibility';

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

// Draw order: world, view cones, loot, people, darkness, noise rings and objective, text.
const DEPTH = { cones: 0.5, loot: 1, player: 2, darkness: 3, noise: 3.5, hud: 4, endScreen: 5 } as const;

// Guard look per mode: body colour and view cone colour.
const GUARD_LOOK: Record<GuardMode, { body: number; cone: number }> = {
  patrol: { body: 0xd9a441, cone: 0xf2d27a },
  investigate: { body: 0xe07b39, cone: 0xf0a060 },
  search: { body: 0xe07b39, cone: 0xf0a060 },
  alarm: { body: 0xd8433a, cone: 0xff5a4a },
};
const NOISE_RING_MS = 450;

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
  private status!: Phaser.GameObjects.Text;
  private guardViews = new Map<string, Phaser.GameObjects.Arc>();
  private guardOverlay!: Phaser.GameObjects.Graphics;
  private darkness!: Phaser.GameObjects.RenderTexture;
  private eraser!: Phaser.GameObjects.Graphics;
  private litFrom: Vector2 | null = null;
  private pending: Command[] = [];
  private lastDirection: Direction = { x: 0, y: 0 };
  private accumulator = 0;
  private options: GameOptions = {};
  private endScreen: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('game');
  }

  /** Receives the debug spawn switch when the scene restarts. */
  init(options: GameOptions = {}): void {
    this.options = options;
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
    this.state = createGameState(this.level, [LOCAL_PLAYER], this.options);
    // Phaser reuses the scene object on restart, so per-run fields are reset here.
    this.lootViews = new Map();
    this.guardViews = new Map();
    this.pending = [];
    this.lastDirection = { x: 0, y: 0 };
    this.accumulator = 0;
    this.litFrom = null;
    this.endScreen = null;

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
    if (this.level.extraction) {
      // The objective stays visible above the darkness.
      const zone = this.level.extraction;
      this.add
        .rectangle(zone.x, zone.y, zone.width, zone.height)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x5fd08a, 0.9)
        .setFillStyle(0x5fd08a, 0.12)
        .setDepth(DEPTH.noise);
    }
    for (const [id, guard] of Object.entries(this.state.guards)) {
      this.guardViews.set(id, this.add.circle(guard.x, guard.y, GUARD_SIZE / 2, GUARD_LOOK.patrol.body).setDepth(DEPTH.player));
    }
    // View cones and suspicion bars, redrawn every frame, under the darkness like everything in the world.
    this.guardOverlay = this.add.graphics().setDepth(DEPTH.cones);
    this.status = this.add
      .text(480, 16, '', { fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setShadow(0, 1, '#000000', 4);
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
    keyboard.on('keydown-F', () => this.pending.push({ type: 'extract', playerId: LOCAL_PLAYER }));
    keyboard.on('keydown-R', () => this.scene.restart(this.options));
    // Debug switch for the gate test: 1, 2, ... spawn only that loot kind, 0 spawns all.
    keyboard.on('keydown', (event: KeyboardEvent) => {
      const kinds = Object.keys(LOOT) as LootKind[];
      const kind = kinds[Number(event.key) - 1];
      if (event.key === '0') {
        this.scene.restart({});
      } else if (/^[1-9]$/.test(event.key) && kind) {
        this.scene.restart({ onlyLoot: kind });
      }
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
      this.showEvents(this.state.events);
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
    this.drawGuards();
    if (this.state.outcome && !this.endScreen) {
      this.showEndScreen();
    }
    this.hint.setText(this.hintText());
    this.status.setText(this.statusText()).setColor(this.anyGuard('alarm') ? '#ff6b5e' : '#f0c070');
  }

  private drawGuards(): void {
    const overlay = this.guardOverlay.clear();
    for (const [id, guard] of Object.entries(this.state.guards)) {
      const look = GUARD_LOOK[guard.mode];
      this.guardViews.get(id)?.setPosition(guard.x, guard.y).setFillStyle(look.body);
      const range = GUARDS[guard.kind].sightRange;
      const fov = GUARDS[guard.kind].fieldOfView;
      // Outer cone: how far the guard sees into light. Inner cone: how far it sees into darkness.
      fillPolygon(overlay, visionCone(this.level, guard, guard.facing, fov, range), look.cone, 0.12);
      fillPolygon(overlay, visionCone(this.level, guard, guard.facing, fov, range * DARK_SIGHT), look.cone, 0.2);
      if (guard.suspicion > 0) {
        const width = 24;
        overlay.fillStyle(0x000000, 0.6).fillRect(guard.x - width / 2, guard.y - 22, width, 4);
        overlay.fillStyle(look.body, 1).fillRect(guard.x - width / 2, guard.y - 22, width * guard.suspicion, 4);
      }
    }
  }

  /** Noise shows as a ring that spreads to how far it carries, above the darkness. */
  private showEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type !== 'noise:emitted') {
        continue;
      }
      const ring = this.add.circle(event.x, event.y, event.radius).setStrokeStyle(2, 0xffffff, 0.5).setDepth(DEPTH.noise);
      ring.setScale(0.1);
      this.tweens.add({
        targets: ring,
        scale: 1,
        alpha: 0,
        duration: NOISE_RING_MS,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
  }

  private anyGuard(mode: GuardMode): boolean {
    return Object.values(this.state.guards).some((guard: GuardState) => guard.mode === mode);
  }

  private statusText(): string {
    if (this.anyGuard('alarm')) {
      return 'ALARM – du wurdest entdeckt';
    }
    if (this.anyGuard('investigate') || this.anyGuard('search')) {
      return 'Eine Wache ist misstrauisch';
    }
    return '';
  }

  private showEndScreen(): void {
    const outcome = this.state.outcome;
    if (!outcome) {
      return;
    }
    const caught = outcome.result === 'caught';
    const detail =
      outcome.result === 'caught'
        ? 'Eine Wache hat dich erwischt. Die Beute bleibt hier.'
        : outcome.loot.length > 0
          ? `Beute: ${outcome.loot.map((kind) => LOOT[kind].name).join(', ')}\nWert: ${formatValue(outcome.value)}`
          : 'Ohne Beute verschwunden. Wert: 0';
    const only = this.options.onlyLoot ? `   ·   nur ${LOOT[this.options.onlyLoot].name} (0: alle)` : '';
    const font = 'Arial, sans-serif';
    this.endScreen = this.add
      .container(480, 270, [
        this.add.rectangle(0, 0, 960, 540, 0x000000, 0.72),
        this.add
          .text(0, -50, caught ? 'Geschnappt' : 'Entkommen', {
            fontFamily: font,
            fontSize: '44px',
            fontStyle: 'bold',
            color: caught ? '#ff6b5e' : '#7ee0a0',
          })
          .setOrigin(0.5),
        this.add
          .text(0, 20, detail, { fontFamily: font, fontSize: '20px', color: '#e9ece6', align: 'center' })
          .setOrigin(0.5, 0),
        this.add
          .text(0, 110, `R: neu starten${only}`, { fontFamily: font, fontSize: '16px', color: '#9aa3ac' })
          .setOrigin(0.5, 0),
      ])
      .setScrollFactor(0)
      .setDepth(DEPTH.endScreen);
  }

  private hintText(): string {
    if (this.state.outcome) {
      return '';
    }
    if (inExtraction(this.state, this.level, LOCAL_PLAYER)) {
      const value = securedLoot(this.state, this.level).reduce((sum, id) => {
        const loot = this.state.loot[id];
        return sum + (loot ? LOOT[loot.kind].value : 0);
      }, 0);
      return `F: verschwinden   ·   gesichert: ${formatValue(value)}`;
    }
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

function fillPolygon(graphics: Phaser.GameObjects.Graphics, polygon: Vector2[], color: number, alpha: number): void {
  const [first, ...rest] = polygon;
  if (!first || rest.length < 2) {
    return;
  }
  graphics.fillStyle(color, alpha).beginPath().moveTo(first.x, first.y);
  for (const point of rest) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.closePath().fillPath();
}

function formatValue(value: number): string {
  return value.toLocaleString('de-DE');
}
