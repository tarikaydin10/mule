/**
 * Temperature is a game value from 0 (cold) to 1 (hot). The thermal vision gadget and
 * thermal cameras read the same values; heat does not pass glass.
 */

/** The suit masks body heat, so thermal cameras miss the player; carried heat gives them away. */
export const PLAYER_TEMPERATURE = 0.25;
/** Thermal cameras react to anything at least this warm. */
export const THERMAL_DETECTION = 0.5;

/** Footsteps leave residual heat that fades; below the detection threshold on purpose. */
export const HEAT_TRACE_TEMPERATURE = 0.4;
export const HEAT_TRACE_COOLING_PER_SECOND = 0.04;
export const HEAT_TRACE_MIN = 0.05;
export const HEAT_TRACE_LIMIT = 80;

export interface HeatSource {
  x: number;
  y: number;
  temperature: number;
}

export type HeatTrace = HeatSource;

/** Cools every trace by one tick and drops those that have faded. */
export function coolTraces(traces: readonly HeatTrace[], seconds: number): HeatTrace[] {
  return traces
    .map((trace) => ({ ...trace, temperature: trace.temperature - HEAT_TRACE_COOLING_PER_SECOND * seconds }))
    .filter((trace) => trace.temperature >= HEAT_TRACE_MIN);
}

/** Adds a trace, keeping only the newest HEAT_TRACE_LIMIT. */
export function addTrace(traces: readonly HeatTrace[], at: { x: number; y: number }): HeatTrace[] {
  return [...traces, { x: at.x, y: at.y, temperature: HEAT_TRACE_TEMPERATURE }].slice(-HEAT_TRACE_LIMIT);
}

/** The 0xRRGGBB grey whose brightness is the temperature, for drawing the thermal view. */
export function temperatureTint(temperature: number): number {
  const level = Math.round(Math.min(1, Math.max(0, temperature)) * 255);
  return (level << 16) | (level << 8) | level;
}
