/**
 * What happened during one tick. Systems talk through these instead of calling each other;
 * the state keeps the events of the last tick, so they are part of what a host sends out.
 */
export type GameEvent =
  /** A sound anyone within `radius` can hear. The radius already includes floor and masking. */
  | { type: 'noise:emitted'; x: number; y: number; radius: number }
  /** A guard became suspicious of a spot or raised the alarm; its partner reacts next tick. */
  | { type: 'guard:alerted'; guardId: string; alarm: boolean; x: number; y: number };
