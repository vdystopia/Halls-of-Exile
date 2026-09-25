import type { ItemArt } from "../poe1/item-art";
import index from "./item-art-index.json";

type Entry = { art: string; w: number; h: number };

const BASES = index.bases as Record<string, Entry>;
const UNIQUES = index.uniques as Record<string, Entry>;
// Longest first, so "Ultimate Life Flask" wins over "Life Flask" inside a magic
// item's full name.
const KEYS_BY_LENGTH = Object.keys(BASES).sort((a, b) => b.length - a.length);

/**
 * Path of Exile 2's picture for an item, from `npm run art:poe2`. The same
 * rules as Path of Exile 1's lookup: a unique by its own name, a rare or normal
 * item by its base, a magic item by the longest base named inside its affixed
 * name. An item read off the site names the exact picture the game serves, and
 * where this index has nothing, that is used instead. Every picture here is a
 * single frame.
 */
export function findItemArt(item: {
  name: string;
  base: string;
  rarity?: string;
  iconUrl?: string;
  size?: [number, number];
}): ItemArt | null {
  const rarity = item.rarity?.toUpperCase();
  const unique = rarity === "UNIQUE" || rarity === "RELIC" ? UNIQUES[item.name.trim()] : undefined;
  const haystack = `${item.base} ${item.name}`;
  const contained = KEYS_BY_LENGTH.find((key) => haystack.includes(key));
  const entry = unique ?? BASES[item.base.trim()] ?? BASES[item.name.trim()] ?? (contained ? BASES[contained] : undefined);
  if (entry) return { src: `/items/poe2/${entry.art}.webp`, width: entry.w, height: entry.h, frames: 1 };
  if (!item.iconUrl) return null;
  return { src: item.iconUrl, width: item.size?.[0] ?? 1, height: item.size?.[1] ?? 1, frames: 1 };
}
