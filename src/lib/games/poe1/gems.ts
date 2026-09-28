import artIndex from "./gem-art-index.json";
import colors from "./gem-colors.json";
import skills from "./skill-names.json";
import tags from "./gem-tags.json";
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

export { orderGems } from "../shared/display";

const ART = artIndex.art as Record<string, string>;
/**
 * Gem art is a layered sheet, the way flask art is: the socket setting and the
 * gem itself side by side in one strip, meant to be stacked into one icon. Most
 * are. Every support's is a plain square, and so are two actives', so which is
 * which is measured when the index is built rather than assumed from the path.
 */
const SINGLE_FRAME = new Set(artIndex.singleFrame as string[]);
const SKILLS = skills as string[];

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
export function gemArt(skill?: string | null): GemArt | null {
  const name = skill?.trim();
  if (!name) return null;

  const direct = ART[name] ?? ART_BY_LOWER[name.toLowerCase()];
  if (direct) return found(direct, name);

  // "Frostblink of Wintry Blast" -> "Frostblink". The base may itself hold an
  // " of " — "Wave of Conviction of Trarthus" — so every split is tried, the
  // longest base first, and only a prefix that is itself a gem counts.
  for (let at = name.lastIndexOf(" of "); at > 0; at = name.lastIndexOf(" of ", at - 1)) {
    const base = ART_BY_LOWER[name.slice(0, at).toLowerCase()];
    if (base) return found(base, name);
  }
  return null;
}

export type { GemArt } from "../shared/display";
import type { GemArt } from "../shared/display";

function found(artPath: string, name: string): GemArt {
  return { src: `/items/${artPath}.png`, name, frames: SINGLE_FRAME.has(artPath) ? 1 : 3 };
}

/**
 * Every active skill gem in the game, for the form that asks which one a
 * character was built around.
 *
 * Active skills only: supports are left out because no character was built
 * around Increased Area of Effect, and putting 250 of them in the list would
 * bury the 339 answers that are real.
 *
 * Resolved on the server and handed to the form as a prop, the arrangement
 * `ItemTooltip` uses for its sections. 5 KB is a fraction of the indexes beside
 * it, but the rule is the same one and there is no reason to spend it on every
 * page that happens to mount a form.
 *
 * The list is a suggestion and not a constraint. A transfigured gem is not in
 * it — RePoE does not carry them — so "Frostblink of Wintry Blast" has to be
 * typed in full, and `gemArt` resolves it through its base gem anyway.
 */
export function skillNames(): string[] {
  return SKILLS;
}

const SKILL_BY_LOWER = new Map(SKILLS.map((name) => [name.toLowerCase(), name]));

/**
 * Spellings the owner's record uses for a gem the game names otherwise. The
 * gem is "Summon Raging Spirit", singular, and nobody says it that way; the
 * record writes the plural on every such build. Read the same way as a gem's
 * own name, so the gem and its art resolve.
 */
const SKILL_ALIASES: Record<string, string> = {
  "summon raging spirits": "Summon Raging Spirit",
  srs: "Summon Raging Spirit",
  la: "Lightning Arrow",
};
for (const [alias, name] of Object.entries(SKILL_ALIASES)) {
  if (!SKILL_BY_LOWER.has(alias)) SKILL_BY_LOWER.set(alias, name);
}

/**
 * The gem's own spelling for text that is exactly a gem's name in any case —
 * "tectonic slam" becomes "Tectonic Slam" — and null for anything else. Like
 * `gemArt`, nothing fuzzier is tried: "poison srs" stays prose.
 */
export function canonicalSkill(text?: string | null): string | null {
  return SKILL_BY_LOWER.get(text?.trim().toLowerCase() ?? "") ?? null;
}

const TAGS_BY_LOWER = new Map(Object.entries(tags as Record<string, string[]>).map(([key, value]) => [key.toLowerCase(), value]));

/**
 * The tags the game shows under a skill gem's name — "Spell, AoE, Fire" — from
 * `gem-tags.json`, generated beside the colours by `npm run gems:index`: the
 * game's own display names ("AoE", not "area") in the game's own order, with
 * the tags it never shows (the attribute, `grants_active_skill`) left out.
 *
 * Matching is the rule `gemArt` follows: exact and case-insensitive, so prose
 * has no tags. Transfigured gems are their own rows in the data and are indexed
 * under their own names; one the snapshot has not caught up with falls back to
 * its base gem's tags, which is right for nearly all of them. An unknown gem
 * has none.
 */
export function gemTags(skill?: string | null): string[] {
  const name = skill?.trim().toLowerCase();
  if (!name) return [];
  const direct = TAGS_BY_LOWER.get(name);
  if (direct) return direct;
  const transfigured = name.match(/^(.+?) of .+$/);
  return (transfigured && TAGS_BY_LOWER.get(transfigured[1])) || [];
}
