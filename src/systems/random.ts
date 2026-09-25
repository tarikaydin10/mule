/**
 * Deterministic random numbers from a seed, so every host draws the same values for the
 * same run (mulberry32). Never use Math.random inside the simulation.
 */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A derived seed for one decision, so a change in one draw never shifts the others. */
export function deriveSeed(seed: number, key: string): number {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** One value in [0, 1) for a decision named by `key`. */
export function draw(seed: number, key: string): number {
  return random(deriveSeed(seed, key))();
}

export function pick<T>(seed: number, key: string, options: readonly T[]): T {
  const option = options[Math.floor(draw(seed, key) * options.length)];
  if (option === undefined) {
    throw new Error(`Nothing to pick for "${key}"`);
  }
  return option;
}
