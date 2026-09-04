import index from "./item-art-index.json";

export type ItemArt = {
  /** Path under public/, e.g. /items/Art/2DItems/Rings/AmethystRing.png */
  src: string;
  /** Inventory footprint, which is the aspect the art is drawn at. */
  width: number;
  height: number;
  /**
   * Flask art ships as a horizontal sheet of three layers — glass, metal frame
   * and liquid — that the game composites into one flask. Every flask image is
   * such a sheet and nothing else is, verified against all 512 downloaded
   * images. Anything else is a single frame.
   */
  frames: number;
};

// JSON tuples widen to (string | number)[] on import; the generator guarantees the shape.
const ART = index as unknown as Record<string, [string, number, number]>;

// Longest first, so "Divine Life Flask" wins over "Life Flask" when both appear
// in a magic item's full name.
const KEYS_BY_LENGTH = Object.keys(ART).sort((a, b) => b.length - a.length);

function toArt(entry: [string, number, number]): ItemArt {
  return {
    src: `/items/${entry[0]}.png`,
    width: entry[1],
    height: entry[2],
    frames: entry[0].includes("/Flasks/") ? 3 : 1,
  };
}

/**
 * Find the art for an item.
 *
 * Rares and uniques carry their base type separately, so those match exactly.
 * Magic and normal items only have one name line, and for magic items it is
 * wrapped in affixes ("Seething Divine Life Flask of Staunching"), so fall back
 * to the longest base name contained in it.
 *
 * A unique resolves to its base type's art until unique art exists.
 */
export function findItemArt(item: { name: string; base: string }): ItemArt | null {
  const exact = ART[item.base.trim()] ?? ART[item.name.trim()];
  if (exact) return toArt(exact);

  const haystack = `${item.base} ${item.name}`;
  const match = KEYS_BY_LENGTH.find((key) => haystack.includes(key));
  return match ? toArt(ART[match]) : null;
}

export function artIndexSize(): number {
  return KEYS_BY_LENGTH.length;
}
