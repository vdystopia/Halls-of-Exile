/**
 * The shapes and classes the pages draw both games with. Each game resolves
 * its own pictures, tooltips and gem colours (see `gear.ts`); what they hand a
 * component is in these shapes, so a component never imports a game's folder.
 */

/** A gem's picture, and how many frames are stacked to draw it. */
export type GemArt = { src: string; name: string; frames: number };

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

/** A mod line and the tags it was stored with: crafted, fractured, rune… */
export type ModParts = { text: string; tags: string[] };

export type SectionKind =
  | "quality"
  | "anoint"
  | "special"
  | "defences"
  | "sockets"
  | "requires"
  | "implicit"
  | "enchant"
  | "explicit"
  | "footer";

export type TooltipLine = ModParts;
export type TooltipSection = { kind: SectionKind; lines: TooltipLine[] };

export const SOCKET_COLOR_CLASS: Record<string, string> = {
  R: "bg-socket-r",
  G: "bg-socket-g",
  B: "bg-socket-b",
  W: "bg-socket-w",
  A: "bg-socket-a",
  D: "bg-socket-d",
};

export function rarityClass(rarity: string): string {
  switch (rarity.toUpperCase()) {
    case "UNIQUE":
    case "RELIC":
      return "text-rarity-unique";
    case "RARE":
      return "text-rarity-rare";
    case "MAGIC":
      return "text-rarity-magic";
    default:
      return "text-rarity-normal";
  }
}

/**
 * Active gems first, supports after them, each in the order the build lists
 * them. Neither Path of Building has a notion of a group's primary skill, and a
 * group of four golems has four equal actives, so nothing is promoted.
 */
export function orderGems<T extends { support: boolean }>(gems: T[]): T[] {
  return [...gems.filter((gem) => !gem.support), ...gems.filter((gem) => gem.support)];
}
