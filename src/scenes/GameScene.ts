import * as Phaser from 'phaser';
import { addThermalFilter, type ThermalFilter } from '../render/ThermalFilter';
import type { GameEvent } from '../systems/events';
import { clipPolygonToRect, pointInPolygon } from '../systems/geometry';
import { DARK_SIGHT, GUARD_SIZE, type GuardMode, type GuardState } from '../systems/guards';
import { GUARDS } from '../systems/guardTypes';
import { insideRect, parseLevel, type Level, type TiledMap } from '../systems/level';
import { illuminationAt } from '../systems/lighting';
import { LOOT, type LootKind } from '../systems/loot';
import { directionFromKeys, type Direction, type Vector2 } from '../systems/movement';
import {
  carriedLoot,
  createGameState,
  hideSpotInReach,
  inExtraction,
  lootInReach,
  PLAYER_SIZE,
  securedLoot,
  step,
  switchInReach,
  takedownTarget,
  TICK_SECONDS,
  zonesOff,
  type Command,
  type GameOptions,
  type GameState,
  type PlayerState,
} from '../systems/simulation';
import { PLAYER_TEMPERATURE, temperatureTint } from '../systems/thermal';
import { TICK_RATE } from '../systems/tick';
import { visibilityPolygon, visionCone } from '../systems/visibility';
import { drawPlan, planLayout, toPlan, type PlanLayout } from './plan';

const LOCAL_PLAYER = 'p1';
const DEFAULT_MAP = 'demo';
const WIDTH = 960;
const HEIGHT = 540;
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
// Thermal vision needs no light, but heat does not pass glass.
const THERMAL_RANGE = 380; // px
// In thermal vision the surroundings are drawn at this grey: cold, but with walls still readable.
const THERMAL_AMBIENT_TINT = 0x303030;

// Placeholder look per loot kind: size in px and fill colour.
const LOOT_LOOK: Record<LootKind, { width: number; height: number; color: number }> = {
  serverBlock: { width: 26, height: 18, color: 0x5b8fd6 },
  cryoSample: { width: 12, height: 18, color: 0x8fe3f0 },
  papers: { width: 14, height: 10, color: 0xe8e2c8 },
  cashbox: { width: 16, height: 12, color: 0x9ab06a },
};

// Draw order: world, heat traces, view cones, loot, people, darkness, noise rings and objective.
const DEPTH = { traces: 0.3, cones: 0.5, loot: 1, player: 2, darkness: 3, noise: 3.5 } as const;
// View cones are drawn strong enough to read as torch beams through the darkness the player
// can see into, and to all but vanish behind the darkness they cannot.
const BEAM_ALPHA = { far: 0.35, near: 0.55 } as const;

// Guard look per mode: body colour and view cone colour.
const GUARD_LOOK: Record<GuardMode, { body: number; cone: number }> = {
  patrol: { body: 0xd9a441, cone: 0xf2d27a },
  investigate: { body: 0xe07b39, cone: 0xf0a060 },
  search: { body: 0xe07b39, cone: 0xf0a060 },
  alarm: { body: 0xd8433a, cone: 0xff5a4a },
  down: { body: 0x5a5f66, cone: 0x5a5f66 },
};
const THERMAL_CAMERA_COLOR = 0x7fc8e6;
const HIDE_SPOT_COLOR = 0x8fb37a;
const SWITCH_COLOR = 0xf0d060;
const SWITCH_OFF_COLOR = 0x6a6a6a;
const FACING_UP: Direction = { x: 0, y: -1 };
const NOISE_RING_MS = 450;
const MESSAGE_MS = 3500;
const DEBUG_NOISE_MS = 1000;
const DEBUG_FONT = { fontFamily: 'Menlo, Consolas, monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#000000a0' };

// Affordance: the world names itself and the objectives are always marked (docs/demo.md).
const FONT = 'Arial, sans-serif';
const LABEL_NEAR = 130; // px, objects this close are named even in the dark
const MARKER_MARGIN = 30; // px, arrows to off-screen objectives sit inside this edge
const EXTRACTION_COLOR = 0x5fd08a;
const MAP_TITLES: Record<string, string> = { demo: 'Pier 9', pier9: 'Pier 9 · groß', testmap: 'Testmap' };
const OVERLAY_DEPTH = 10;

type WasdKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

/** What the scene is started with: the map to load plus the simulation's options. */
export interface SceneOptions extends GameOptions {
  map?: string;
  /** Whether the briefing is shown first (default); a quick restart skips it. */
  briefing?: boolean;
}

/**
 * Translates input into commands, runs the simulation in fixed ticks and draws the result.
 * No game state lives here: every view only mirrors `state`.
 *
 * Two cameras: the main camera shows the world and carries the thermal filter; the HUD
 * camera shows only the text, so the filter never touches it.
 */
export class GameScene extends Phaser.Scene {
  private level!: Level;
  private state!: GameState;
  private options: SceneOptions = {};
  private keys!: WasdKeys;
  private pending: Command[] = [];
  private lastDirection: Direction = { x: 0, y: 0 };
  /** Last direction the player walked in: where a bolt goes. */
  private facing: Direction = FACING_UP;
  private accumulator = 0;

  private hudCamera!: Phaser.Cameras.Scene2D.Camera;
  private thermalFilter!: ThermalFilter;
  private thermalShown = false;
  private tileLayers: Phaser.Tilemaps.TilemapLayer[] = [];
  private playerView!: Phaser.GameObjects.Rectangle;
  private lootViews = new Map<string, Phaser.GameObjects.Rectangle>();
  private guardViews = new Map<string, Phaser.GameObjects.Arc>();
  private switchViews = new Map<string, Phaser.GameObjects.Rectangle>();
  private overlay!: Phaser.GameObjects.Graphics;
  private traces!: Phaser.GameObjects.Graphics;
  private darkness!: Phaser.GameObjects.RenderTexture;
  private eraser!: Phaser.GameObjects.Graphics;
  private litFrom: { x: number; y: number; thermal: boolean; off: string } | null = null;

  private hint!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private message: { text: string; until: number } | null = null;
  private endScreen: Phaser.GameObjects.Container | null = null;

  // Affordance: briefing before the run, map on Tab, names on seen objects, marked objectives.
  private phase: 'briefing' | 'running' = 'briefing';
  private briefingView: Phaser.GameObjects.Container | null = null;
  private mapView: Phaser.GameObjects.Container | null = null;
  /** What the player currently sees; objects inside it get their name. */
  private sight: Vector2[] = [];
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private markers!: Phaser.GameObjects.Graphics;
  private markerTexts = new Map<string, Phaser.GameObjects.Text>();
  private lastCarried: string | null = null;
  private lastHidden: string | null = null;

  private debug = false;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private debugLabels = new Map<string, Phaser.GameObjects.Text>();
  private debugInfo!: Phaser.GameObjects.Text;
  private recentNoise: { x: number; y: number; radius: number; until: number }[] = [];

  constructor() {
    super('game');
  }

  /** Receives the map and the debug options on start and restart. */
  init(options: SceneOptions = {}): void {
    this.options = options;
  }

  private get mapKey(): string {
    return this.options.map ?? DEFAULT_MAP;
  }

  preload(): void {
    this.load.tilemapTiledJSON(this.mapKey, `maps/${this.mapKey}.json`);
    this.load.image('tiles-placeholder', 'tilesets/placeholder.png');
  }

  create(): void {
    // The simulation reads the raw Tiled JSON; Phaser only uses the same file for drawing.
    const tiled = this.cache.tilemap.get(this.mapKey) as { data: TiledMap } | undefined;
    if (!tiled) {
      throw new Error(`Map "${this.mapKey}" is not loaded`);
    }
    this.level = parseLevel(tiled.data);
    // Every run draws its own seed unless one is given; a fixed run (debug keys 1, 2) keeps the
    // simulation's fixed seed, so it takes the first variant of everything.
    const drawn = this.options.fixed || this.options.seed !== undefined ? {} : { seed: (Math.random() * 0x100000000) >>> 0 };
    this.state = createGameState(this.level, [LOCAL_PLAYER], { ...this.options, ...drawn });
    // Phaser reuses the scene object on restart, so per-run fields are reset here.
    this.pending = [];
    this.lastDirection = { x: 0, y: 0 };
    this.facing = FACING_UP;
    this.accumulator = 0;
    this.thermalShown = false;
    this.lootViews = new Map();
    this.guardViews = new Map();
    this.switchViews = new Map();
    this.litFrom = null;
    this.message = null;
    this.endScreen = null;
    this.debugLabels = new Map();
    this.recentNoise = [];
    this.briefingView = null;
    this.mapView = null;
    this.sight = [];
    this.labels = new Map();
    this.markerTexts = new Map();
    this.lastCarried = null;
    this.lastHidden = null;

    this.hudCamera = this.cameras.add(0, 0, WIDTH, HEIGHT);
    this.createWorld();
    this.createHud();

    this.thermalFilter = addThermalFilter(this.cameras.main);
    this.thermalFilter.setActive(false);
    this.bindKeys();
    if (this.options.briefing === false) {
      this.phase = 'running';
    } else {
      this.showBriefing();
    }
  }

  override update(): void {
    // The briefing and the map pause the run: nothing moves while the player reads.
    if (this.phase === 'briefing' || this.mapView) {
      return;
    }
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
    if (!player) {
      return;
    }
    this.noticeChanges(player);
    const thermal = player.thermalVision;
    if (thermal !== this.thermalShown) {
      this.setThermalView(thermal);
    }
    this.thermalFilter.time = this.time.now / 1000;

    // Hidden: only a faint outline shows where the player is.
    this.playerView
      .setPosition(player.x, player.y)
      .setFillStyle(thermal ? temperatureTint(PLAYER_TEMPERATURE) : 0xf2f2f2)
      .setAlpha(player.hidden ? 0.35 : 1);
    this.drawSwitches();
    this.drawLoot(thermal);
    this.drawGuards(thermal);
    this.drawHeat(thermal);
    this.drawDarkness(player, thermal);
    this.drawLabels(player, thermal);
    this.drawMarkers(player);

    if (this.state.outcome && !this.endScreen) {
      this.showEndScreen();
    }
    this.hint.setText(this.hintText());
    const status = this.statusText();
    this.status.setText(status.text).setColor(status.color);
    this.drawDebug();
  }

  // World

  private createWorld(): void {
    const map = this.make.tilemap({ key: this.mapKey });
    // First argument is the tileset name inside the Tiled file.
    const tileset = map.addTilesetImage('placeholder', 'tiles-placeholder');
    const ground = tileset ? map.createLayer('ground', tileset) : null;
    const walls = tileset ? map.createLayer('walls', tileset) : null;
    // Plain (not GPU) layers, because the thermal view tints every tile.
    if (!(ground instanceof Phaser.Tilemaps.TilemapLayer) || !(walls instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error('Tileset "placeholder" and layers "ground" and "walls" are required');
    }
    this.tileLayers = [ground, walls];
    this.world(ground);
    this.world(walls);

    const player = this.state.players[LOCAL_PLAYER];
    if (!player) {
      throw new Error('Local player is missing from the game state');
    }
    this.playerView = this.world(this.add.rectangle(player.x, player.y, PLAYER_SIZE, PLAYER_SIZE, 0xf2f2f2)).setDepth(
      DEPTH.player,
    );
    for (const [id, loot] of Object.entries(this.state.loot)) {
      const look = LOOT_LOOK[loot.kind];
      this.lootViews.set(
        id,
        this.world(this.add.rectangle(loot.x, loot.y, look.width, look.height, look.color)).setDepth(DEPTH.loot),
      );
    }
    for (const [id, guard] of Object.entries(this.state.guards)) {
      this.guardViews.set(
        id,
        this.world(this.add.circle(guard.x, guard.y, GUARD_SIZE / 2, GUARD_LOOK.patrol.body)).setDepth(DEPTH.player),
      );
    }
    for (const camera of this.level.thermalCameras) {
      this.world(this.add.rectangle(camera.x, camera.y, 10, 10, 0x39424c).setStrokeStyle(1, THERMAL_CAMERA_COLOR)).setDepth(
        DEPTH.player,
      );
    }
    for (const spot of this.level.hideSpots) {
      // An open container or cabin: a marked square the player can step into.
      this.world(this.add.rectangle(spot.x, spot.y, 28, 28, HIDE_SPOT_COLOR, 0.25).setStrokeStyle(2, HIDE_SPOT_COLOR, 0.9)).setDepth(
        DEPTH.loot,
      );
    }
    for (const found of this.level.switches) {
      this.switchViews.set(
        found.id,
        this.world(this.add.rectangle(found.x, found.y, 10, 14, SWITCH_COLOR).setStrokeStyle(1, 0x2a2a2a)).setDepth(DEPTH.loot),
      );
    }
    if (this.level.extraction) {
      // The objective stays visible above the darkness.
      const zone = this.level.extraction;
      this.world(this.add.rectangle(zone.x, zone.y, zone.width, zone.height))
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x5fd08a, 0.9)
        .setFillStyle(0x5fd08a, 0.12)
        .setDepth(DEPTH.noise);
    }
    for (const sign of this.level.signs) {
      this.world(
        this.add
          .text(sign.x, sign.y, sign.text, { fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#d8dcc8' })
          .setOrigin(0.5)
          .setAlpha(0.85),
      ).setDepth(DEPTH.loot);
    }
    // View cones and suspicion bars, redrawn every frame, under the darkness like everything in
    // the world: the darkness the player sees into lets them through like torch beams.
    this.overlay = this.world(this.add.graphics()).setDepth(DEPTH.cones);
    this.traces = this.world(this.add.graphics()).setDepth(DEPTH.traces);
    this.darkness = this.world(this.add.renderTexture(0, 0, map.widthInPixels, map.heightInPixels))
      .setOrigin(0, 0)
      .setDepth(DEPTH.darkness);
    // Not on the display list: only used to cut shapes out of the darkness.
    this.eraser = this.make.graphics({}, false);

    // Both cameras follow the player the same way, so the HUD camera can also draw world-space
    // debug shapes; fixed HUD text uses scroll factor 0.
    for (const camera of [this.cameras.main, this.hudCamera]) {
      camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
      camera.startFollow(this.playerView, true);
    }
  }

  /** Marks an object as part of the world: the HUD camera does not draw it. */
  private world<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.hudCamera.ignore(object);
    return object;
  }

  /** Marks an object as HUD: the world camera, and with it the thermal filter, does not draw it. */
  private hud<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.cameras.main.ignore(object);
    return object;
  }

  private setThermalView(on: boolean): void {
    this.thermalShown = on;
    this.thermalFilter.setActive(on);
    for (const layer of this.tileLayers) {
      layer.forEachTile((tile) => {
        tile.tint = on ? THERMAL_AMBIENT_TINT : 0xffffff;
      });
    }
    this.litFrom = null;
  }

  private drawLoot(thermal: boolean): void {
    for (const [id, view] of this.lootViews) {
      const loot = this.state.loot[id];
      if (!loot) {
        // Lost, like a thawed cryo sample.
        view.destroy();
        this.lootViews.delete(id);
        continue;
      }
      // Carried loot sits on top of the carrier.
      view
        .setPosition(loot.x, loot.y)
        .setDepth(loot.carriedBy ? DEPTH.player + 0.5 : DEPTH.loot)
        .setFillStyle(thermal ? temperatureTint(loot.temperature) : LOOT_LOOK[loot.kind].color);
    }
  }

  /** A switch shows the state of its zone: bright while on, grey while off. */
  private drawSwitches(): void {
    for (const found of this.level.switches) {
      const on = this.state.zones[found.target] ?? true;
      this.switchViews.get(found.id)?.setFillStyle(on ? SWITCH_COLOR : SWITCH_OFF_COLOR);
    }
  }

  private drawGuards(thermal: boolean): void {
    const overlay = this.overlay.clear();
    for (const [id, guard] of Object.entries(this.state.guards)) {
      const look = GUARD_LOOK[guard.mode];
      const definition = GUARDS[guard.kind];
      this.guardViews
        .get(id)
        ?.setPosition(guard.x, guard.y)
        .setFillStyle(thermal ? temperatureTint(definition.temperature) : look.body);
      if (thermal) {
        // Thermal vision shows heat, not where anyone is looking.
        continue;
      }
      // Outer cone: how far the guard sees into light. Inner cone: how far it sees into darkness.
      const range = definition.sightRange;
      fillPolygon(overlay, visionCone(this.level, guard, guard.facing, definition.fieldOfView, range), look.cone, BEAM_ALPHA.far);
      fillPolygon(
        overlay,
        visionCone(this.level, guard, guard.facing, definition.fieldOfView, range * DARK_SIGHT),
        look.cone,
        BEAM_ALPHA.near,
      );
      if (guard.suspicion > 0) {
        const width = 24;
        overlay.fillStyle(0x000000, 0.6).fillRect(guard.x - width / 2, guard.y - 22, width, 4);
        overlay.fillStyle(look.body, 1).fillRect(guard.x - width / 2, guard.y - 22, width * guard.suspicion, 4);
      }
    }
    if (!thermal) {
      for (const camera of this.level.thermalCameras) {
        const cone = visionCone(this.level, camera, camera.facing, camera.fieldOfView, camera.range, 'heat');
        fillPolygon(overlay, cone, THERMAL_CAMERA_COLOR, BEAM_ALPHA.far);
      }
    }
  }

  /** Residual heat of footsteps, only visible in thermal vision. */
  private drawHeat(thermal: boolean): void {
    const traces = this.traces.clear();
    if (!thermal) {
      return;
    }
    for (const trace of this.state.heatTraces) {
      traces.fillStyle(temperatureTint(trace.temperature), 1).fillCircle(trace.x, trace.y, 5);
    }
  }

  /**
   * Redraws the darkness layer when the player has moved or switched vision. Normal vision:
   * dark, except what the player can see. Thermal vision: black, except what heat reaches.
   */
  private drawDarkness(eye: Vector2, thermal: boolean): void {
    const off = zonesOff(this.state);
    const offKey = off.join(',');
    const lit = this.litFrom;
    if (lit && lit.x === eye.x && lit.y === eye.y && lit.thermal === thermal && lit.off === offKey) {
      return;
    }
    this.litFrom = { x: eye.x, y: eye.y, thermal, off: offKey };

    const eraser = this.eraser.clear();
    if (thermal) {
      this.sight = visibilityPolygon(this.level, eye, THERMAL_RANGE, WALL_REVEAL, 'heat');
      erase(eraser, this.sight, 1);
      this.darkness.clear().fill(0x000000, 1).erase(eraser).render();
      return;
    }
    const sight = visibilityPolygon(this.level, eye, SIGHT_RADIUS, WALL_REVEAL);
    this.sight = sight;
    // Erasing with alpha a keeps (1 - a) of the darkness; overlapping shapes multiply.
    erase(eraser, sight, 1 - DARKNESS_IN_SIGHT / DARKNESS_OUT_OF_SIGHT);
    erase(eraser, visibilityPolygon(this.level, eye, NEAR_RADIUS, WALL_REVEAL), NEAR_ERASE);
    erase(eraser, visibilityPolygon(this.level, eye, NEAR_RADIUS * 0.6, WALL_REVEAL), NEAR_ERASE);
    for (const zone of this.level.lights) {
      if (!off.includes(zone.name)) {
        erase(eraser, clipPolygonToRect(sight, zone), zone.brightness);
      }
    }
    this.darkness.clear().fill(0x000000, DARKNESS_OUT_OF_SIGHT).erase(eraser).render();
  }

  /** Noise shows as a ring that spreads to how far it carries; everything else answers in a sentence. */
  private showEvents(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'loot:lost') {
        this.say('Die Kryoprobe ist aufgetaut und verloren.');
      }
      if (event.type === 'switch:used') {
        const found = this.level.switches.find((s) => s.id === event.switchId);
        const coming = event.alerts.length;
        const who = coming === 0 ? '' : coming === 1 ? ' Eine Wache kommt nachsehen.' : ` ${coming} Wachen kommen nachsehen.`;
        this.say(`${found?.label ?? 'Schalter'} ${event.on ? 'an' : 'aus'}.${who}`);
      }
      if (event.type === 'guard:alerted' && event.alarm && this.state.guards[event.guardId]?.mode === 'down') {
        this.say('Wache am Boden. Wer sie findet, schlägt Alarm.');
      }
      if (event.type !== 'noise:emitted') {
        continue;
      }
      this.recentNoise.push({ x: event.x, y: event.y, radius: event.radius, until: this.time.now + DEBUG_NOISE_MS });
      const ring = this.world(this.add.circle(event.x, event.y, event.radius))
        .setStrokeStyle(2, 0xffffff, 0.5)
        .setDepth(DEPTH.noise)
        .setScale(0.1);
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

  // HUD

  private createHud(): void {
    const font = 'Arial, sans-serif';
    this.status = this.hud(
      this.add
        .text(WIDTH / 2, 16, '', { fontFamily: font, fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setShadow(0, 1, '#000000', 4),
    );
    this.hint = this.hud(
      this.add
        .text(16, HEIGHT - 16, '', { fontFamily: font, fontSize: '18px', color: '#e9ece6', wordWrap: { width: WIDTH - 300 } })
        .setOrigin(0, 1)
        .setScrollFactor(0)
        .setShadow(0, 1, '#000000', 3),
    );
    this.hud(
      this.add
        .text(WIDTH - 16, HEIGHT - 16, 'Tab Karte  ·  T Wärmebild  ·  F aussteigen  ·  R neu', { fontFamily: font, fontSize: '13px', color: '#9aa3ac' })
        .setOrigin(1, 1)
        .setScrollFactor(0)
        .setShadow(0, 1, '#000000', 3),
    );
    this.markers = this.hud(this.add.graphics()).setScrollFactor(0);
    this.debugGraphics = this.hud(this.add.graphics());
    this.debugInfo = this.hud(this.add.text(8, 8, '', DEBUG_FONT).setScrollFactor(0));
  }

  // Affordance

  /** Puts a sentence into the status line for a moment. */
  private say(text: string): void {
    this.message = { text, until: this.time.now + MESSAGE_MS };
  }

  /** Picking something up or hiding gets an answer that names the rule. */
  private noticeChanges(player: PlayerState): void {
    const carried = carriedLoot(this.state, LOCAL_PLAYER);
    const kind = carried ? this.state.loot[carried]?.kind : undefined;
    if (carried && carried !== this.lastCarried && kind) {
      this.say(`${LOOT[kind].name}: ${lootRule(kind)}.`);
    }
    this.lastCarried = carried;
    if (player.hidden && player.hidden !== this.lastHidden) {
      this.say('Versteckt. Hier sieht dich keine Wache.');
    }
    this.lastHidden = player.hidden;
  }

  /**
   * Briefing: the job in three sentences, the targets with place and value, the site plan
   * with "Du", the targets and the exit, and the keys. Enter starts the run.
   */
  private showBriefing(): void {
    this.phase = 'briefing';
    const title = MAP_TITLES[this.mapKey] ?? this.mapKey;
    const items: Phaser.GameObjects.GameObject[] = [this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0b0d10, 0.96).setOrigin(0)];
    items.push(this.add.text(48, 36, title.toUpperCase(), { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#f0a23b' }));
    const brief = this.add.text(48, 84, this.level.briefing || 'Kein Briefing für diese Map.', {
      fontFamily: FONT,
      fontSize: '17px',
      color: '#e9ece6',
      wordWrap: { width: 430 },
      lineSpacing: 5,
    });
    items.push(brief);
    let y = brief.y + brief.height + 26;
    const byValue = Object.entries(this.state.loot).sort(([, a], [, b]) => LOOT[b.kind].value - LOOT[a.kind].value);
    const lists: [string, typeof byValue][] = [
      ['ZIELE', byValue.filter(([id]) => this.isTarget(id))],
      ['NEBENBEUTE', byValue.filter(([id]) => !this.isTarget(id))],
    ];
    for (const [heading, entries] of lists) {
      if (entries.length === 0) {
        continue;
      }
      items.push(this.add.text(48, y, heading, { fontFamily: FONT, fontSize: '13px', color: '#9aa3ac' }));
      y += 24;
      for (const [id, loot] of entries) {
        const definition = LOOT[loot.kind];
        const place = this.level.loot.find((spawn) => spawn.id === id)?.place;
        items.push(this.add.rectangle(56, y + 10, 12, 12, LOOT_LOOK[loot.kind].color));
        const name = this.add.text(72, y, `${definition.name}${place ? `  ·  ${place}` : ''}`, {
          fontFamily: FONT,
          fontSize: '17px',
          fontStyle: 'bold',
          color: '#e9ece6',
          wordWrap: { width: 340 },
        });
        items.push(name);
        items.push(this.add.text(478, y, formatValue(definition.value), { fontFamily: FONT, fontSize: '17px', color: '#f0a23b' }).setOrigin(1, 0));
        const rule = this.add.text(72, y + name.height + 4, lootRule(loot.kind), { fontFamily: FONT, fontSize: '13px', color: '#9aa3ac', wordWrap: { width: 400 } });
        items.push(rule);
        y += name.height + 8 + rule.height + 6;
      }
      y += 4;
    }
    if (this.level.extraction) {
      items.push(this.add.text(48, y + 2, `Ausstieg: ${this.level.extraction.label}`, { fontFamily: FONT, fontSize: '15px', color: '#7ee0a0' }));
    }
    items.push(...this.planItems(planLayout(this.level, { x: 520, y: 48, width: 400, height: 400 })));
    items.push(
      this.add
        .text(WIDTH / 2, HEIGHT - 46, 'WASD laufen  ·  E benutzen  ·  Q Takedown  ·  Leertaste Bolzen  ·  T Wärmebild  ·  Tab Karte  ·  F aussteigen', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#9aa3ac',
        })
        .setOrigin(0.5),
      this.add.text(WIDTH / 2, HEIGHT - 20, 'Enter: los', { fontFamily: FONT, fontSize: '17px', fontStyle: 'bold', color: '#f0a23b' }).setOrigin(0.5),
    );
    this.briefingView = this.hud(this.add.container(0, 0, items).setScrollFactor(0)).setDepth(OVERLAY_DEPTH);
  }

  /**
   * Mission targets get arrows from anywhere; side loot only shows once it is on screen.
   * Loot in a group is a target; a map without groups makes everything a target.
   */
  private isTarget(lootId: string): boolean {
    const grouped = this.level.loot.filter((spawn) => spawn.group !== null);
    return grouped.length === 0 || grouped.some((spawn) => spawn.id === lootId);
  }

  private startRun(): void {
    this.briefingView?.destroy();
    this.briefingView = null;
    this.phase = 'running';
    this.accumulator = 0;
  }

  /** The map on Tab: the same plan as in the briefing, with the player where they are now. */
  private toggleMap(): void {
    if (this.mapView) {
      this.mapView.destroy();
      this.mapView = null;
      return;
    }
    if (this.phase !== 'running' || this.state.outcome) {
      return;
    }
    const items: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0b0d10, 0.92).setOrigin(0),
      this.add.text(WIDTH / 2, 22, 'KARTE', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#f0a23b' }).setOrigin(0.5),
      ...this.planItems(planLayout(this.level, { x: 60, y: 48, width: WIDTH - 120, height: HEIGHT - 100 })),
      this.add.text(WIDTH / 2, HEIGHT - 22, 'Tab: weiter', { fontFamily: FONT, fontSize: '15px', color: '#9aa3ac' }).setOrigin(0.5),
    ];
    this.mapView = this.hud(this.add.container(0, 0, items).setScrollFactor(0)).setDepth(OVERLAY_DEPTH);
  }

  /** The site plan with its markers: loot lying around, the exit, and "Du". */
  private planItems(layout: PlanLayout): Phaser.GameObjects.GameObject[] {
    const plan = this.add.graphics();
    drawPlan(plan, this.level, layout, zonesOff(this.state));
    const marks = this.add.graphics();
    const items: Phaser.GameObjects.GameObject[] = [plan, marks];
    const label = (at: Vector2, text: string, color: string, dy: number) =>
      items.push(this.add.text(at.x, at.y + dy, text, { fontFamily: FONT, fontSize: '12px', color }).setOrigin(0.5, 1).setShadow(0, 1, '#000000', 3));
    // Targets are named on the plan; side loot is only a dot, so the names stay readable.
    for (const [id, loot] of Object.entries(this.state.loot)) {
      if (loot.carriedBy) {
        continue;
      }
      const at = toPlan(layout, loot);
      marks.fillStyle(LOOT_LOOK[loot.kind].color, 1).fillCircle(at.x, at.y, 4);
      if (this.isTarget(id)) {
        label(at, LOOT[loot.kind].name, cssColor(LOOT_LOOK[loot.kind].color), -7);
      }
    }
    const zone = this.level.extraction;
    if (zone) {
      label(toPlan(layout, { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }), zone.label, '#7ee0a0', -4);
    }
    const player = this.state.players[LOCAL_PLAYER];
    if (player) {
      const at = toPlan(layout, player);
      marks.fillStyle(0xffffff, 1).fillCircle(at.x, at.y, 4).lineStyle(1, 0xffffff, 0.8).strokeCircle(at.x, at.y, 8);
      label(at, 'Du', '#ffffff', -11);
    }
    return items;
  }

  /** Names what the player can see: hide spots, switches, cameras and guards. */
  private drawLabels(player: PlayerState, thermal: boolean): void {
    const off = zonesOff(this.state);
    const seen = (at: Vector2) =>
      Math.hypot(at.x - player.x, at.y - player.y) <= LABEL_NEAR ||
      (pointInPolygon(at, this.sight) && (thermal || illuminationAt(this.level, at, off) > 0));
    const wanted = new Map<string, { x: number; y: number; text: string; color: string }>();
    for (const spot of this.level.hideSpots) {
      if (seen(spot)) {
        wanted.set(spot.id, { x: spot.x, y: spot.y - 18, text: `${spot.label} · Versteck`, color: '#b9d6a3' });
      }
    }
    for (const found of this.level.switches) {
      if (seen(found)) {
        const on = this.state.zones[found.target] ?? true;
        wanted.set(found.id, { x: found.x, y: found.y - 12, text: `${found.label} · Schalter${on ? '' : ' · aus'}`, color: '#f0d060' });
      }
    }
    for (const camera of this.level.thermalCameras) {
      if (seen(camera)) {
        wanted.set(camera.id, { x: camera.x, y: camera.y - 10, text: 'Wärmekamera', color: '#7fc8e6' });
      }
    }
    for (const [id, guard] of Object.entries(this.state.guards)) {
      if (seen(guard)) {
        wanted.set(id, { x: guard.x, y: guard.y - 26, text: guardLabel(guard), color: cssColor(GUARD_LOOK[guard.mode].body) });
      }
    }
    for (const [key, view] of this.labels) {
      if (!wanted.has(key)) {
        view.setVisible(false);
      }
    }
    for (const [key, want] of wanted) {
      const view =
        this.labels.get(key) ??
        this.hud(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#ffffff' }).setOrigin(0.5, 1).setShadow(0, 1, '#000000', 3));
      this.labels.set(key, view);
      view.setPosition(Math.round(want.x), Math.round(want.y)).setText(want.text).setColor(want.color).setVisible(true);
    }
  }

  /**
   * Objectives are always marked: loot lying around and the exit. On screen a mark above the
   * object; off screen an arrow at the edge with the name and the distance.
   */
  private drawMarkers(player: PlayerState): void {
    const g = this.markers.clear();
    const camera = this.cameras.main;
    const zone = this.level.extraction;
    const targets: { key: string; x: number; y: number; text: string; color: number }[] = [];
    for (const [id, loot] of Object.entries(this.state.loot)) {
      if (loot.carriedBy || (zone && insideRect(zone, loot))) {
        continue;
      }
      targets.push({ key: id, x: loot.x, y: loot.y, text: LOOT[loot.kind].name, color: LOOT_LOOK[loot.kind].color });
    }
    if (zone && !inExtraction(this.state, this.level, LOCAL_PLAYER)) {
      targets.push({ key: 'extraction', x: zone.x + zone.width / 2, y: zone.y + zone.height / 2, text: zone.label, color: EXTRACTION_COLOR });
    }
    const used = new Set<string>();
    for (const target of targets) {
      const sx = target.x - camera.scrollX;
      const sy = target.y - camera.scrollY;
      const onScreen = sx >= MARKER_MARGIN && sx <= WIDTH - MARKER_MARGIN && sy >= MARKER_MARGIN && sy <= HEIGHT - MARKER_MARGIN;
      if (!onScreen && target.key !== 'extraction' && !this.isTarget(target.key)) {
        continue;
      }
      used.add(target.key);
      const view =
        this.markerTexts.get(target.key) ??
        this.hud(this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffffff' }).setScrollFactor(0).setShadow(0, 1, '#000000', 4));
      this.markerTexts.set(target.key, view);
      let x = sx;
      let y = sy - 24;
      if (onScreen) {
        view.setText(target.text);
        g.fillStyle(target.color, 0.95).fillTriangle(sx, sy - 13, sx - 5, sy - 21, sx + 5, sy - 21);
      } else {
        // Along the line from the screen centre, stopped at the margin; the arrow points on.
        const dx = sx - WIDTH / 2;
        const dy = sy - HEIGHT / 2;
        const k = Math.min(dx !== 0 ? (WIDTH / 2 - MARKER_MARGIN) / Math.abs(dx) : Infinity, dy !== 0 ? (HEIGHT / 2 - MARKER_MARGIN) / Math.abs(dy) : Infinity);
        const ex = WIDTH / 2 + dx * k;
        const ey = HEIGHT / 2 + dy * k;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        g.fillStyle(target.color, 1).fillTriangle(ex + ux * 9, ey + uy * 9, ex - ux * 5 - uy * 7, ey - uy * 5 + ux * 7, ex - ux * 5 + uy * 7, ey - uy * 5 - ux * 7);
        const metres = Math.round(Math.hypot(target.x - player.x, target.y - player.y) / this.level.tileSize);
        view.setText(`${target.text} · ${metres} m`);
        // The text sits inward of the arrow, clear of it whatever its length.
        const pad = 12 + (Math.abs(ux) * view.width) / 2 + (Math.abs(uy) * view.height) / 2;
        x = Math.min(Math.max(ex - ux * pad, 60), WIDTH - 60);
        y = Math.min(Math.max(ey - uy * pad, 36), HEIGHT - 44);
      }
      view.setOrigin(0.5, onScreen ? 1 : 0.5).setPosition(Math.round(x), Math.round(y)).setColor(cssColor(target.color)).setVisible(true);
    }
    for (const [key, view] of this.markerTexts) {
      if (!used.has(key)) {
        view.setVisible(false);
      }
    }
  }

  /**
   * Debug overlay (O): what the systems see, drawn above the darkness and without the filter.
   * Guard view cones with mode, suspicion and temperature, thermal cameras, noise radii of the
   * last second, temperatures of players and loot, light and noise zones.
   */
  private drawDebug(): void {
    const g = this.debugGraphics.clear();
    const used = new Set<string>();
    const label = (key: string, x: number, y: number, text: string) => {
      used.add(key);
      const existing = this.debugLabels.get(key);
      const view = existing ?? this.hud(this.add.text(0, 0, '', DEBUG_FONT).setOrigin(0.5, 1));
      this.debugLabels.set(key, view);
      view.setPosition(Math.round(x), Math.round(y)).setText(text).setVisible(true);
    };
    const pct = (value: number) => `${Math.round(value * 100)}%`;
    const temp = (value: number) => value.toFixed(2);

    if (this.debug) {
      const off = zonesOff(this.state);
      for (const zone of this.level.lights) {
        const isOff = off.includes(zone.name);
        g.lineStyle(1, 0xfff2a0, isOff ? 0.25 : 0.6).strokeRect(zone.x, zone.y, zone.width, zone.height);
        label(`light-${zone.name}`, zone.x + zone.width / 2, zone.y + 14, `Licht ${zone.name} ${isOff ? 'AUS' : zone.brightness}`);
      }
      for (const zone of this.level.noiseZones) {
        const isOff = off.includes(zone.name);
        g.lineStyle(1, 0xc0a0ff, isOff ? 0.25 : 0.6).strokeRect(zone.x + 2, zone.y + 2, zone.width - 4, zone.height - 4);
        label(
          `noise-${zone.name}`,
          zone.x + zone.width / 2,
          zone.y + zone.height - 4,
          `Geräusch ${zone.name} ${isOff ? 'AUS' : `×${zone.surface} −${pct(zone.masking)}`}`,
        );
      }
      this.recentNoise = this.recentNoise.filter((noise) => noise.until > this.time.now);
      for (const noise of this.recentNoise) {
        g.lineStyle(1, 0xffffff, 0.8).strokeCircle(noise.x, noise.y, noise.radius);
      }
      for (const [id, guard] of Object.entries(this.state.guards)) {
        const definition = GUARDS[guard.kind];
        const color = GUARD_LOOK[guard.mode].cone;
        strokePolygon(g, visionCone(this.level, guard, guard.facing, definition.fieldOfView, definition.sightRange), color, 0.9);
        strokePolygon(
          g,
          visionCone(this.level, guard, guard.facing, definition.fieldOfView, definition.sightRange * DARK_SIGHT),
          color,
          0.9,
        );
        for (const point of guard.path) {
          g.fillStyle(color, 0.8).fillCircle(point.x, point.y, 2);
        }
        label(id, guard.x, guard.y - 14, `${guard.mode} ${pct(guard.suspicion)} · ${temp(definition.temperature)}`);
      }
      for (const camera of this.level.thermalCameras) {
        strokePolygon(g, visionCone(this.level, camera, camera.facing, camera.fieldOfView, camera.range, 'heat'), THERMAL_CAMERA_COLOR, 0.9);
        label(camera.id, camera.x, camera.y - 8, `Wärmekamera ${pct(this.state.cameras[camera.id]?.suspicion ?? 0)}`);
      }
      for (const [id, player] of Object.entries(this.state.players)) {
        label(id, player.x, player.y - 14, `Spieler ${temp(PLAYER_TEMPERATURE)}${player.hidden ? ' · versteckt' : ''} · Bolzen ${player.bolts}`);
      }
      for (const [id, loot] of Object.entries(this.state.loot)) {
        label(id, loot.x, loot.y + 22, `${LOOT[loot.kind].name} ${temp(loot.temperature)}`);
      }
    }
    for (const [key, view] of this.debugLabels) {
      if (!used.has(key)) {
        view.setVisible(false);
      }
    }
    this.debugInfo.setText(
      this.debug
        ? `DEBUG (O)   Tick ${this.state.tick} · ${(this.state.tick / TICK_RATE).toFixed(1)} s   ·   Seed ${this.state.seed}${this.state.fixed ? ' (fixiert)' : ''}   ·   Beute-Spawn: 1 Server-Block, 2 Kryoprobe, 0 alle${this.options.onlyLoot ? ` (aktiv: ${LOOT[this.options.onlyLoot].name})` : ''}`
        : '',
    );
  }

  private anyGuard(mode: GuardMode): boolean {
    return Object.values(this.state.guards).some((guard: GuardState) => guard.mode === mode);
  }

  private statusText(): { text: string; color: string } {
    if (this.anyGuard('alarm')) {
      return { text: 'ALARM – du wurdest entdeckt', color: '#ff6b5e' };
    }
    if (this.message && this.time.now < this.message.until) {
      return { text: this.message.text, color: '#8fe3f0' };
    }
    if (this.anyGuard('investigate') || this.anyGuard('search')) {
      return { text: 'Eine Wache ist misstrauisch', color: '#f0c070' };
    }
    return { text: '', color: '#ffffff' };
  }

  /** What E does right now: the first thing in front of the player, in the order the simulation checks. */
  private interaction(): { command: Command; text: string } | null {
    const player = this.state.players[LOCAL_PLAYER];
    if (!player || this.state.outcome) {
      return null;
    }
    if (player.hidden) {
      return { command: { type: 'hide', playerId: LOCAL_PLAYER }, text: 'E: Versteck verlassen' };
    }
    const carried = carriedLoot(this.state, LOCAL_PLAYER);
    const reachable = carried ? null : lootInReach(this.state, LOCAL_PLAYER);
    const reachableKind = reachable ? this.state.loot[reachable]?.kind : undefined;
    if (reachableKind) {
      return {
        command: { type: 'pickUp', playerId: LOCAL_PLAYER },
        text: `E: ${LOOT[reachableKind].name} aufheben (Wert ${formatValue(LOOT[reachableKind].value)})`,
      };
    }
    const found = switchInReach(this.state, this.level, LOCAL_PLAYER);
    if (found) {
      const on = this.state.zones[found.target] ?? true;
      return {
        command: { type: 'toggleSwitch', playerId: LOCAL_PLAYER },
        text: `E: ${found.name.replace(/_/g, ' ')} ${on ? 'ausschalten' : 'einschalten'}`,
      };
    }
    const spot = hideSpotInReach(this.state, this.level, LOCAL_PLAYER);
    if (spot) {
      return { command: { type: 'hide', playerId: LOCAL_PLAYER }, text: `E: verstecken (${spot.name.replace(/_/g, ' ')})` };
    }
    return carried ? { command: { type: 'drop', playerId: LOCAL_PLAYER }, text: 'E: abstellen' } : null;
  }

  private hintText(): string {
    const player = this.state.players[LOCAL_PLAYER];
    if (!player || this.state.outcome) {
      return '';
    }
    const parts: string[] = [];
    if (inExtraction(this.state, this.level, LOCAL_PLAYER)) {
      const value = securedLoot(this.state, this.level).reduce((sum, id) => {
        const loot = this.state.loot[id];
        return sum + (loot ? LOOT[loot.kind].value : 0);
      }, 0);
      parts.push(`F: verschwinden (gesichert: ${formatValue(value)})`);
    }
    const carried = carriedLoot(this.state, LOCAL_PLAYER);
    const carriedState = carried ? this.state.loot[carried] : undefined;
    if (carriedState) {
      const loot = LOOT[carriedState.kind];
      const effects = [
        loot.speedMultiplier < 1 ? 'langsamer' : null,
        loot.handsFree ? null : 'beide Hände belegt: kein Wärmebild, kein Wurf, kein Takedown',
        carriedState.thawing ? `${Math.round(carriedState.temperature * 100)} % aufgetaut` : null,
      ].filter(Boolean);
      parts.push(`Trägt: ${loot.name}${effects.length ? ` (${effects.join(', ')})` : ''}`);
    }
    const interaction = this.interaction();
    if (interaction) {
      parts.push(interaction.text);
    }
    if (takedownTarget(this.state, LOCAL_PLAYER)) {
      parts.push('Q: Takedown');
    }
    if (!player.hidden && player.bolts > 0 && (!carriedState || LOOT[carriedState.kind].handsFree)) {
      parts.push(`Leertaste: Bolzen werfen (${player.bolts})`);
    }
    return parts.join('   ·   ');
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
    const seconds = Math.round(this.state.tick / TICK_RATE);
    const again = this.options.onlyLoot
      ? `R: nochmal (nur ${LOOT[this.options.onlyLoot].name}, fixiert)   ·   0: alles`
      : 'R: nochmal   ·   1: nur Server-Block   ·   2: nur Kryoprobe';
    const font = 'Arial, sans-serif';
    this.endScreen = this.hud(
      this.add.container(WIDTH / 2, HEIGHT / 2, [
        this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.72),
        this.add
          .text(0, -50, caught ? 'Geschnappt' : 'Entkommen', {
            fontFamily: font,
            fontSize: '44px',
            fontStyle: 'bold',
            color: caught ? '#ff6b5e' : '#7ee0a0',
          })
          .setOrigin(0.5),
        this.add
          .text(0, 20, `${detail}\nZeit: ${seconds} s`, { fontFamily: font, fontSize: '20px', color: '#e9ece6', align: 'center' })
          .setOrigin(0.5, 0),
        this.add.text(0, 120, again, { fontFamily: font, fontSize: '16px', color: '#9aa3ac' }).setOrigin(0.5, 0),
      ]).setScrollFactor(0),
    );
  }

  // Input

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input is not available');
    }
    this.keys = keyboard.addKeys('W,A,S,D') as WasdKeys;
    // Tab must not leave the canvas, Space must not scroll the page.
    keyboard.addCapture(['TAB', 'SPACE']);
    keyboard.on('keydown-ENTER', () => {
      if (this.phase === 'briefing') {
        this.startRun();
      }
    });
    keyboard.on('keydown-TAB', () => this.toggleMap());
    // E means whatever is in front of the player; the simulation checks it again.
    keyboard.on('keydown-E', () => {
      const interaction = this.interaction();
      if (interaction) {
        this.send(interaction.command);
      }
    });
    keyboard.on('keydown-Q', () => this.send({ type: 'takedown', playerId: LOCAL_PLAYER }));
    keyboard.on('keydown-SPACE', () => this.send({ type: 'throw', playerId: LOCAL_PLAYER, direction: this.facing }));
    keyboard.on('keydown-T', () => this.send({ type: 'toggleThermal', playerId: LOCAL_PLAYER }));
    keyboard.on('keydown-F', () => this.send({ type: 'extract', playerId: LOCAL_PLAYER }));
    // A quick restart skips the briefing: the plan is known by then.
    keyboard.on('keydown-R', () => this.scene.restart({ ...this.options, briefing: false }));
    keyboard.on('keydown-O', () => {
      this.debug = !this.debug;
    });
    // Debug switch for the gate test: 1, 2, ... spawn only that loot kind, with every random
    // choice fixed so runs are comparable; 0 spawns all again, with a fresh seed.
    keyboard.on('keydown', (event: KeyboardEvent) => {
      const kinds = Object.keys(LOOT) as LootKind[];
      const kind = kinds[Number(event.key) - 1];
      if (event.key === '0') {
        this.scene.restart({ map: this.options.map });
      } else if (/^[1-9]$/.test(event.key) && kind) {
        this.scene.restart({ map: this.options.map, onlyLoot: kind, fixed: true });
      }
    });
  }

  /** Queues a command for the next tick, unless the run is paused for reading. */
  private send(command: Command): void {
    if (this.phase === 'running' && !this.mapView) {
      this.pending.push(command);
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
      if (direction.x !== 0 || direction.y !== 0) {
        this.facing = direction;
      }
    }
  }
}

function erase(graphics: Phaser.GameObjects.Graphics, polygon: Vector2[], alpha: number): void {
  fillPolygon(graphics, polygon, 0xffffff, alpha);
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

function strokePolygon(graphics: Phaser.GameObjects.Graphics, polygon: Vector2[], color: number, alpha: number): void {
  const [first, ...rest] = polygon;
  if (!first || rest.length < 2) {
    return;
  }
  graphics.lineStyle(1, color, alpha).beginPath().moveTo(first.x, first.y);
  for (const point of rest) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.closePath().strokePath();
}

function formatValue(value: number): string {
  return value.toLocaleString('de-DE');
}

/** What carrying this loot does, in the words of the briefing and the status line. */
function lootRule(kind: LootKind): string {
  const definition = LOOT[kind];
  const parts: string[] = [];
  if (!definition.handsFree) {
    parts.push('beide Hände: kein Wärmebild, kein Takedown, kein Wurf');
  }
  if (definition.speedMultiplier < 1) {
    parts.push(`Tempo ${Math.round(definition.speedMultiplier * 100)} %`);
  }
  if (definition.thawPerSecond > 0) {
    parts.push(`taut nach dem Aufheben auf, nach ${Math.round((1 - definition.temperature) / definition.thawPerSecond)} s verloren`);
  }
  if (definition.dropNoiseRadius >= 100) {
    parts.push('laut beim Abstellen');
  }
  return parts.join(', ') || 'leicht, eine Hand';
}

function guardLabel(guard: GuardState): string {
  switch (guard.mode) {
    case 'patrol':
      return 'Wache';
    case 'investigate':
    case 'search':
      return 'Wache · sucht';
    case 'alarm':
      return 'Wache · Alarm';
    case 'down':
      return 'Wache · am Boden';
  }
}

function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
