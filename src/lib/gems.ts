import colors from "./gem-colors.json";
import type { Gem } from "./types";

/**
 * A gem's colour is its attribute: red strength, green dexterity, blue
 * intelligence, white none. Path of Building's export does not carry it, so it
 * is looked up in an index generated from RePoE by `npm run gems:index`.
 *
 * Resolved on the server — the index is 58 KB and has no business in the
 * browser, the same rule the item art index follows.
 */
export type GemColor = "r" | "g" | "b" | "w";

const COLORS = colors as Record<string, string>;

/** The metadata id is exact; the name is the fallback for anything missing. */
export function gemColor(gem: Pick<Gem, "name" | "gemId">): GemColor | null {
  const found = (gem.gemId ? COLORS[gem.gemId] : undefined) ?? COLORS[gem.name.trim()];
  return found === "r" || found === "g" || found === "b" || found === "w" ? found : null;
}

/** Path of Exile draws a gem's name in its own colour; white gems read as bone. */
export const GEM_COLOR_CLASS: Record<GemColor, string> = {
  r: "text-socket-r",
  g: "text-socket-g",
  b: "text-socket-b",
  w: "text-socket-w",
};

/**
 * Active gems first, supports after them, each in the order the build lists
 * them. Path of Building has no notion of a group's primary skill, and a group
 * of four golems has four equal actives, so nothing is promoted.
 */
export function orderGems<T extends { support: boolean }>(gems: T[]): T[] {
  return [...gems.filter((gem) => !gem.support), ...gems.filter((gem) => gem.support)];
}
