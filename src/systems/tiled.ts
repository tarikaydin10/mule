/** Custom property as Tiled writes it into the JSON export. */
interface TiledProperty {
  name: string;
  value: unknown;
}

/**
 * Reads a numeric custom property. Accepts both shapes Phaser hands out:
 * the raw Tiled list on map objects, and a name-to-value record on tiles.
 */
export function numberProperty(properties: unknown, name: string): number | undefined {
  const value = Array.isArray(properties)
    ? (properties as TiledProperty[]).find((property) => property.name === name)?.value
    : typeof properties === 'object' && properties !== null
      ? (properties as Record<string, unknown>)[name]
      : undefined;
  return typeof value === 'number' ? value : undefined;
}
