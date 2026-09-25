import type { GameEvent } from './events';
import type { ThermalCameraSpawn, Level } from './level';
import { THERMAL_DETECTION, type HeatSource } from './thermal';
import { TICK_SECONDS } from './tick';
import { castRay, normalizeAngle } from './visibility';

export interface CameraState {
  /** 0 to 1; filled while the camera registers heat, alarm at 1. */
  suspicion: number;
  /** Ticks until the camera may call the alarm again. */
  cooldownTicks: number;
}

const SUSPICION_PER_SECOND = 2; // about half a second of heat in view raises the alarm
const SUSPICION_DECAY_PER_SECOND = 0.5;
const ALARM_REPEAT_TICKS = 30; // while it keeps seeing heat, the camera updates the guards twice a second

export function createCameras(level: Level): Record<string, CameraState> {
  return Object.fromEntries(level.thermalCameras.map((camera) => [camera.id, { suspicion: 0, cooldownTicks: 0 }]));
}

/** Whether a thermal camera registers a heat source: warm enough, in the cone, heat line of sight. */
export function cameraDetects(level: Level, camera: ThermalCameraSpawn, source: HeatSource): boolean {
  if (source.temperature < THERMAL_DETECTION) {
    return false;
  }
  const dx = source.x - camera.x;
  const dy = source.y - camera.y;
  const distance = Math.hypot(dx, dy);
  if (distance > camera.range) {
    return false;
  }
  if (distance === 0) {
    return true;
  }
  if (Math.abs(normalizeAngle(Math.atan2(dy, dx) - camera.facing)) > camera.fieldOfView / 2) {
    return false;
  }
  return castRay(level, camera, dx / distance, dy / distance, distance, 'heat') >= distance;
}

/** Advances all thermal cameras by one tick; returns `sensor:alarm` events when one goes off. */
export function updateCameras(
  cameras: Record<string, CameraState>,
  sources: readonly HeatSource[],
  level: Level,
): { cameras: Record<string, CameraState>; events: GameEvent[] } {
  const next: Record<string, CameraState> = {};
  const events: GameEvent[] = [];
  for (const spawn of level.thermalCameras) {
    const state = cameras[spawn.id] ?? { suspicion: 0, cooldownTicks: 0 };
    const detected = sources.find((source) => cameraDetects(level, spawn, source));
    const suspicion = detected
      ? Math.min(1, state.suspicion + SUSPICION_PER_SECOND * TICK_SECONDS)
      : Math.max(0, state.suspicion - SUSPICION_DECAY_PER_SECOND * TICK_SECONDS);
    let cooldownTicks = Math.max(0, state.cooldownTicks - 1);
    if (detected && suspicion >= 1 && cooldownTicks === 0) {
      events.push({ type: 'sensor:alarm', cameraId: spawn.id, x: detected.x, y: detected.y });
      cooldownTicks = ALARM_REPEAT_TICKS;
    }
    next[spawn.id] = { suspicion, cooldownTicks };
  }
  return { cameras: next, events };
}
