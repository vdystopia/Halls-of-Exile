import index from "./ascendancy-icons.json";

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
