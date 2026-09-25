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
}

export const LOOT = {
  serverBlock: { name: 'Server-Block', speedMultiplier: 0.6, handsFree: false, dropNoiseRadius: 260, value: 4000 },
} as const satisfies Record<string, LootDefinition>;

export type LootKind = keyof typeof LOOT;

export function isLootKind(value: unknown): value is LootKind {
  return typeof value === 'string' && Object.hasOwn(LOOT, value);
}
