/**
 * Temperature is a game value in [0, 1]. Rendering and heat sensors read the same number:
 * the scene draws every object in the grey level of its temperature, and the thermal
 * filter turns that grey level into the thermal image.
 */

/** White-hot shows heat bright, black-hot shows heat dark. */
export type ThermalPolarity = 'white-hot' | 'black-hot';

export function clampTemperature(temperature: number): number {
  if (Number.isNaN(temperature)) {
    return 0;
  }
  return Math.min(1, Math.max(0, temperature));
}

/** The 0xRRGGBB grey whose brightness encodes the temperature, used to tint what gets rendered. */
export function temperatureTint(temperature: number): number {
  const level = Math.round(clampTemperature(temperature) * 255);
  return (level << 16) | (level << 8) | level;
}

export function togglePolarity(polarity: ThermalPolarity): ThermalPolarity {
  return polarity === 'white-hot' ? 'black-hot' : 'white-hot';
}
