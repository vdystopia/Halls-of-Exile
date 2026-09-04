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

export type BaseEntry = {
  art: string;
  w: number;
  h: number;
  cls: string;
  block?: number;
  /** [level, strength, dexterity, intelligence] */
  req: [number, number, number, number];
};

// JSON widens the requirement tuple to number[] on import; the generator
// guarantees the shape.
const BASES = index as unknown as Record<string, BaseEntry>;

// Longest first, so "Divine Life Flask" wins over "Life Flask" when both appear
// in a magic item's full name.
const KEYS_BY_LENGTH = Object.keys(BASES).sort((a, b) => b.length - a.length);

/**
 * Find the catalogue entry for an item.
 *
 * Rares and uniques carry their base type separately, so those match exactly.
 * Magic and normal items only have one name line, and for magic items it is
 * wrapped in affixes ("Seething Divine Life Flask of Staunching"), so fall back
 * to the longest base name contained in it.
 */
export function findItemBase(item: { name: string; base: string }): BaseEntry | null {
  const exact = BASES[item.base.trim()] ?? BASES[item.name.trim()];
  if (exact) return exact;

  const haystack = `${item.base} ${item.name}`;
  const match = KEYS_BY_LENGTH.find((key) => haystack.includes(key));
  return match ? BASES[match] : null;
}

/** A unique resolves to its base type's art until unique art exists. */
export function findItemArt(item: { name: string; base: string }): ItemArt | null {
  const entry = findItemBase(item);
  if (!entry) return null;
  return {
    src: `/items/${entry.art}.png`,
    width: entry.w,
    height: entry.h,
    frames: entry.art.includes("/Flasks/") ? 3 : 1,
  };
}

export function artIndexSize(): number {
  return KEYS_BY_LENGTH.length;
}
