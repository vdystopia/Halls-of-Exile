import artIndex from "./gem-art-index.json";
import colors from "./gem-colors.json";
import type { Gem } from "../../types";

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

/**
 * A colour the source stated beats any lookup — the official API reports a
 * gem's attribute outright. Otherwise the metadata id is exact and the name is
 * the fallback for anything missing.
 */
export function gemColor(gem: Pick<Gem, "name" | "gemId" | "color">): GemColor | null {
  const found = gem.color ?? (gem.gemId ? COLORS[gem.gemId] : undefined) ?? COLORS[gem.name.trim()];
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

const ART = artIndex as Record<string, string>;

// Matching is case-insensitive because the owner's own record writes a skill
// the way it was spoken ("righteous fire"), not the way the game capitalises it.
const ART_BY_LOWER: Record<string, string> = {};
for (const [key, value] of Object.entries(ART)) {
  const lower = key.toLowerCase();
  if (!ART_BY_LOWER[lower]) ART_BY_LOWER[lower] = value;
}

/**
 * The gem's inventory picture, for the skill a character was built around.
 *
 * Resolved on the server: the index is 102 KB and, like the item art index and
 * the colour index beside it, has no business in the browser.
 *
 * Matching is exact — a metadata id, a display name, or a display name without
 * its trailing "Support" — and case-insensitive, and nothing else is attempted.
 * That is deliberate: this is also handed the record's prose for a character
 * with no exact skill recorded yet, and prose must resolve to nothing rather
 * than to a picture of whichever gem it happens to share a word with. "poison
 * srs" naming Summon Raging Spirit is an inference, and an inference belongs in
 * the `skill_gem` column where a person put it, not in a fuzzy match here.
 *
 * A transfigured gem ("Frostblink of Wintry Blast") carries its base gem's
 * picture and RePoE does not list it, so it falls back to the base gem — the
 * same route gem-colors.json takes through the base's metadata id.
 */
export function gemArt(skill?: string | null): { src: string; name: string } | null {
  const name = skill?.trim();
  if (!name) return null;

  const direct = ART[name] ?? ART_BY_LOWER[name.toLowerCase()];
  if (direct) return { src: `/items/${direct}.png`, name };

  // "Frostblink of Wintry Blast" -> "Frostblink". Only one " of " is stripped,
  // and only when what precedes it is itself a gem.
  const transfigured = name.match(/^(.+?) of .+$/);
  if (transfigured) {
    const base = ART_BY_LOWER[transfigured[1].toLowerCase()];
    if (base) return { src: `/items/${base}.png`, name };
  }
  return null;
}
