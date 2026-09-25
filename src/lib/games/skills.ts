import { canonicalSkill as poe1Canonical, gemArt as poe1Art, type GemArt } from "./poe1/gems";
import type { GameId } from "./types";

/**
 * Skill names and gem art by game. Only Path of Exile 1 has a gem index yet, so
 * a Path of Exile 2 skill keeps the spelling it was recorded with and draws no
 * picture — the two games share skill names, and a Path of Exile 1 gem's art
 * on a Path of Exile 2 character would be a different skill's.
 */
const SKILLS = {
  poe1: { canonical: poe1Canonical, art: poe1Art },
  poe2: { canonical: () => null, art: () => null },
} satisfies Record<GameId, { canonical: (text?: string | null) => string | null; art: (name?: string | null) => GemArt | null }>;

/**
 * The skill a character was built around, for grouping: the recorded gem, else
 * the record's own words when they are exactly a gem's name, else those words.
 * "Unknown" is the record saying it does not know, and is not a skill.
 */
export function buildSkill(game: GameId, skillGem: string | null, mainSkill: string | null): string | null {
  const recorded = (value: string | null) => (value?.trim() && value.trim() !== "Unknown" ? value.trim() : null);
  return recorded(skillGem) || SKILLS[game].canonical(mainSkill) || recorded(mainSkill);
}

export function skillArt(game: GameId, name?: string | null): GemArt | null {
  return SKILLS[game].art(name);
}
