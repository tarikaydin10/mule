/** Guard types are data, like loot. */
export interface GuardDefinition {
  name: string;
  /** px/s while walking the route, going to look at something, and chasing. */
  patrolSpeed: number;
  investigateSpeed: number;
  chaseSpeed: number;
  /** How far the guard sees a target standing in full light, in px. */
  sightRange: number;
  /** Full opening angle of the view cone, in radians. */
  fieldOfView: number;
  /** Multiplies the radius of every noise when checking whether this guard hears it. */
  hearing: number;
  /** Suspicion gained per second at the strongest perception; the alarm goes off at 1. */
  suspicionPerSecond: number;
  /** How long the guard looks around at a spot before going back to the route. */
  searchSeconds: number;
  /** Body heat, 0 to 1: guards show up bright in thermal vision. */
  temperature: number;
}

export const GUARDS = {
  dockGuard: {
    name: 'Dock-Wache',
    patrolSpeed: 70,
    investigateSpeed: 100,
    chaseSpeed: 135, // faster than a walking player: a chase is only escaped by breaking the line of sight
    sightRange: 300,
    fieldOfView: (100 * Math.PI) / 180,
    hearing: 1,
    suspicionPerSecond: 1.5,
    searchSeconds: 4,
    temperature: 0.85,
  },
} as const satisfies Record<string, GuardDefinition>;

export type GuardKind = keyof typeof GUARDS;

export function isGuardKind(value: unknown): value is GuardKind {
  return typeof value === 'string' && Object.hasOwn(GUARDS, value);
}
