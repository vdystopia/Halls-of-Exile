import index from "./item-art-index.json";

export type { ItemArt } from "../shared/display";
import type { ItemArt } from "../shared/display";

/** A unique adds nothing to its base but its own picture. */
export type UniqueEntry = { art: string; w: number; h: number };

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
const BASES = index.bases as unknown as Record<string, BaseEntry>;
const UNIQUES = index.uniques as Record<string, UniqueEntry>;

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

/**
 * Uniques are keyed on their own name, because dozens of them share one base:
 * every Prismatic Jewel unique drew the Mastery jewel's picture while art was
 * keyed on the base type alone. Only a unique is looked up this way — a rare's
 * name is randomly generated and could collide.
 */
export function findItemArt(item: {
  name: string;
  base: string;
  rarity?: string;
  /** The official CDN picture, when the item came from an API export. */
  iconUrl?: string;
  size?: [number, number];
}): ItemArt | null {
  const rarity = item.rarity?.toUpperCase();
  const unique = rarity === "UNIQUE" || rarity === "RELIC" ? UNIQUES[item.name.trim()] : undefined;
  const entry = unique ?? findItemBase(item);
  // A base the catalogue does not know still has a picture if the item came
  // from the official API, which names the exact image the game serves. That is
  // a remote URL rather than a file in public/, and it is already composited,
  // so a flask fetched this way is one frame rather than three.
  if (!entry) {
    if (!item.iconUrl) return null;
    return { src: item.iconUrl, width: item.size?.[0] ?? 1, height: item.size?.[1] ?? 1, frames: 1 };
  }
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

export function uniqueArtIndexSize(): number {
  return Object.keys(UNIQUES).length;
}
