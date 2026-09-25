import { canonicalSkill as poe1Canonical, gemArt as poe1Art, type GemArt, skillNames as poe1Names } from "./poe1/gems";
import { canonicalSkill as poe2Canonical, gemArt as poe2Art, skillNames as poe2Names } from "./poe2/gems";
import type { GameId } from "./types";

/**
 * Skill names and gem art by game. The two games share skill names ("Spark",
 * "Arc") and nothing behind them, so a name is always looked up in its own
 * game's index: a Path of Exile 1 gem's picture on a Path of Exile 2 character
 * would be a different skill's.
 */
const SKILLS = {
  poe1: { canonical: poe1Canonical, art: poe1Art, names: poe1Names },
  poe2: { canonical: poe2Canonical, art: poe2Art, names: poe2Names },
} satisfies Record<
  GameId,
  {
    canonical: (text?: string | null) => string | null;
    art: (name?: string | null) => GemArt | null;
    names: () => string[];
  }
>;

/**
 * The skill a character was built around, for grouping: the recorded gem, else
 * the record's own words when they are exactly a gem's name. Either way it has
 * to resolve to a gem this game's index can draw — the rule the character header
 * follows — so prose ("poison srs") and a gem the index does not know yet never
 * become a build without a picture. A gem that goes missing here means the index
 * is stale: refresh it (`npm run gems:index`, `npm run gems:art`) rather than
 * loosening this.
 */
export function buildSkill(game: GameId, skillGem: string | null, mainSkill: string | null): string | null {
  const candidate = skillGem?.trim() || SKILLS[game].canonical(mainSkill);
  return candidate && SKILLS[game].art(candidate) ? candidate : null;
}

export function skillArt(game: GameId, name?: string | null): GemArt | null {
  return SKILLS[game].art(name);
}

/** The active skills a form offers for a character of this game. */
export function skillNamesFor(game: GameId): string[] {
  return SKILLS[game].names();
}
