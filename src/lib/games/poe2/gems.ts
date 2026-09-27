import type { Gem } from "../../types";
import type { GemArt, GemColor } from "../poe1/gems";
import index from "./gem-art-index.json";
import skills from "./skill-names.json";
import tags from "./gem-tags.json";

/**
 * Path of Exile 2's gem pictures and skill names, from `npm run gems:poe2`.
 * The same contract as Path of Exile 1's `gems.ts` — exact, case-insensitive
 * matches only, so prose resolves to nothing — against this game's own data:
 * the two games share skill names ("Spark", "Arc") and not the gems behind them.
 *
 * Every picture is one 108x108 frame; there are no layered strips here.
 * Server-only, like the Path of Exile 1 index.
 */
const ART = index.art as Record<string, string>;
const ART_BY_LOWER = new Map(Object.entries(ART).map(([key, value]) => [key.toLowerCase(), value]));
const SKILLS = skills as string[];
const SKILL_BY_LOWER = new Map(SKILLS.map((name) => [name.toLowerCase(), name]));

export function gemArt(skill?: string | null): GemArt | null {
  const name = skill?.trim();
  if (!name) return null;
  const artPath = ART_BY_LOWER.get(name.toLowerCase());
  return artPath ? { src: `/items/poe2/${artPath}.webp`, name, frames: 1 } : null;
}

export function canonicalSkill(text?: string | null): string | null {
  return SKILL_BY_LOWER.get(text?.trim().toLowerCase() ?? "") ?? null;
}

export function skillNames(): string[] {
  return SKILLS;
}

const TAGS_BY_LOWER = new Map(Object.entries(tags as Record<string, string[]>).map(([key, value]) => [key.toLowerCase(), value]));

/**
 * The tags the game shows under a skill gem's name — "Spell, Projectile,
 * Lightning" — from this game's own table, in its own order, with the markup
 * already stripped by `npm run gems:poe2`. A gem the index does not know has
 * none.
 */
export function gemTags(skill?: string | null): string[] {
  return TAGS_BY_LOWER.get(skill?.trim().toLowerCase() ?? "") ?? [];
}

const COLORS = index.colors as Record<string, string>;

/**
 * A gem's colour from Path of Exile 2's own index — never Path of Exile 1's, whose
 * gem of the same name can be a different attribute. A skill an item grants is
 * not a gem anyone can cut, so it is not in the index and reads as uncoloured.
 */
export function gemColor(gem: Pick<Gem, "name" | "gemId" | "color">): GemColor | null {
  const found = gem.color ?? (gem.gemId ? COLORS[gem.gemId] : undefined) ?? COLORS[gem.name.trim()];
  return found === "r" || found === "g" || found === "b" || found === "w" ? found : null;
}
