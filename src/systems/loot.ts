/**
 * Loot is data: each kind lists the modifiers it puts on whoever carries it.
 * Picking it up applies them, putting it down removes them.
 */

export interface LootDefinition {
  name: string;
  /** Multiplies the carrier's walking speed. */
  speedMultiplier: number;
  /** false when the loot needs both hands: no gadgets, no takedowns. */
  handsFree: boolean;
  /** How far the sound of putting it down carries, in px. */
  dropNoiseRadius: number;
  /** What it is worth when it leaves with the player. */
  value: number;
  /** Temperature (0 to 1) when it lies untouched at its spawn. */
  temperature: number;
  /** Warming per second once it has been picked up; at 1 the loot is lost. 0 for loot that keeps its temperature. */
  thawPerSecond: number;
}

export const LOOT = {
  // Switched off: room temperature, so thermal cameras ignore it.
  serverBlock: {
    name: 'Server-Block',
    speedMultiplier: 0.6,
    handsFree: false,
    dropNoiseRadius: 260,
    value: 4000,
    temperature: 0.3,
    thawPerSecond: 0,
  },
  // Cold at first; thermal cameras see it after about 30 s, it is lost after about 60 s.
  cryoSample: {
    name: 'Kryoprobe',
    speedMultiplier: 1,
    handsFree: true,
    dropNoiseRadius: 60,
    value: 7000,
    temperature: 0.03,
    thawPerSecond: 0.97 / 60,
  },
} as const satisfies Record<string, LootDefinition>;

export type LootKind = keyof typeof LOOT;

export function isLootKind(value: unknown): value is LootKind {
  return typeof value === 'string' && Object.hasOwn(LOOT, value);
}
