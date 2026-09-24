import index from "./ascendancy-icons.json";
import portraitIndex from "./ascendancy-portraits.json";

/** Where the emblem sits on the sheet, and how big the sheet is. */
export type AscendancyIcon = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sheetWidth: number;
  sheetHeight: number;
};

/** The sheet is fetched by `npm run art:fetch` and served from public/. */
export const ASCENDANCY_SHEET = "/ascendancy.webp";

const ICONS = index.icons as Record<string, { x: number; y: number; w: number; h: number }>;

/**
 * Every ascendancy's emblem lives in one sprite sheet from the passive tree,
 * so a character's icon is a crop rather than a file of its own. A character
 * with no ascendancy — anything under level 68, or one that never took one —
 * has no emblem to show, and neither does a name the tree does not carry.
 */
export function ascendancyIcon(ascendancy?: string | null): AscendancyIcon | null {
  const box = ascendancy ? ICONS[ascendancy.trim()] : undefined;
  if (!box) return null;
  return { src: ASCENDANCY_SHEET, ...box, sheetWidth: index.sheetWidth, sheetHeight: index.sheetHeight };
}

export function ascendancySheetUrl(): string {
  return index.sheet;
}

/** The class portrait: a whole file, not a crop, and always this shape. */
export type AscendancyPortrait = {
  src: string;
  width: number;
  height: number;
};

const PORTRAITS = portraitIndex.portraits as Record<string, string>;

/**
 * The ascendancy's key art, as the game draws it on the selection screen.
 *
 * This is a different picture from `ascendancyIcon`, not a bigger one. The
 * emblem is a crop of the passive tree's sprite sheet, drawn on the tree, and
 * composed with its lower half empty so the tree's lines can run through it; at
 * header size that empty half is most of the tile. The portrait is the wide
 * painting of the class, and it is what the character page shows.
 *
 * The emblem is still the right choice where a character is one row in a list,
 * so `CharacterCard` keeps it.
 *
 * Indexed under id and display name both, for the same reason the emblem is:
 * Warden was Raider, and which name a build carries depends on the version of
 * Path of Building that exported it. Both resolve to the one file.
 */
export function ascendancyPortrait(ascendancy?: string | null): AscendancyPortrait | null {
  const slug = ascendancy ? PORTRAITS[ascendancy.trim()] : undefined;
  if (!slug) return null;
  return { src: `/ascendancy/${slug}.webp`, width: portraitIndex.width, height: portraitIndex.height };
}
