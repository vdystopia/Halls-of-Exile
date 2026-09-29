import {
  canonicalSkill as poe1Canonical,
  gemArt as poe1Art,
  gemColor as poe1Color,
  gemTags as poe1Tags,
  type GemArt,
  type GemColor,
  skillNames as poe1Names,
} from "./poe1/gems";
import {
  canonicalSkill as poe2Canonical,
  gemArt as poe2Art,
  gemColor as poe2Color,
  gemTags as poe2Tags,
  skillNames as poe2Names,
} from "./poe2/gems";
import type { GameId } from "./types";

/**
 * Skill names and gem art by game. The two games share skill names ("Spark",
 * "Arc") and nothing behind them, so a name is always looked up in its own
 * game's index: a Path of Exile 1 gem's picture on a Path of Exile 2 character
 * would be a different skill's.
 */
const SKILLS = {
  poe1: { canonical: poe1Canonical, art: poe1Art, color: poe1Color, names: poe1Names, tags: poe1Tags },
  poe2: { canonical: poe2Canonical, art: poe2Art, color: poe2Color, names: poe2Names, tags: poe2Tags },
} satisfies Record<
  GameId,
  {
    canonical: (text?: string | null) => string | null;
    art: (name?: string | null) => GemArt | null;
    color: (gem: { name: string }) => GemColor | null;
    names: () => string[];
    tags: (name?: string | null) => string[];
  }
>;

/**
 * The classes a skill's tag is drawn with: its gem's attribute colour on the
 * text and the border — red for strength, green for dexterity, blue for
 * intelligence, bone for none — or the generic gem teal when the index does
 * not know the gem's colour.
 */
const TAG_CLASS: Record<GemColor, string> = {
  r: "border-socket-r/60 text-socket-r",
  g: "border-socket-g/60 text-socket-g",
  b: "border-socket-b/60 text-socket-b",
  w: "border-socket-w/60 text-socket-w",
};

/**
 * A skill's gem colour. The recorded gem may be typed in any case ("ice crash"),
 * and a transfigured gem ("Frostblink of Wintry Blast") takes its base gem's
 * colour: the index is keyed on the gem's own spelling, so both are resolved
 * before the lookup.
 */
function skillColor(game: GameId, name?: string | null): GemColor | null {
  const proper = (SKILLS[game].canonical(name) ?? name ?? "").trim();
  const base = proper.split(" of ")[0];
  return proper ? (SKILLS[game].color({ name: proper }) ?? SKILLS[game].color({ name: base })) : null;
}

export function skillTagClass(game: GameId, name?: string | null): string {
  const color = skillColor(game, name);
  return color ? TAG_CLASS[color] : "border-rarity-gem/60 text-rarity-gem";
}

/** The border alone, for a card framed in its skill's attribute colour. */
const BORDER_CLASS: Record<GemColor, string> = {
  r: "border-socket-r/70",
  g: "border-socket-g/70",
  b: "border-socket-b/70",
  w: "border-socket-w/70",
};

export function skillBorderClass(game: GameId, name?: string | null): string | null {
  const color = skillColor(game, name);
  return color ? BORDER_CLASS[color] : null;
}

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
  // The typed gem in the game's own spelling where it is one — "sunder" is
  // Sunder, and the owner's "summon raging spirits" is Summon Raging Spirit —
  // else as typed, so a transfigured gem the list lacks still reaches the art.
  const typed = skillGem?.trim() || null;
  const candidate = (typed && (SKILLS[game].canonical(typed) ?? typed)) || SKILLS[game].canonical(mainSkill);
  return candidate && SKILLS[game].art(candidate) ? candidate : null;
}

export function skillArt(game: GameId, name?: string | null): GemArt | null {
  return SKILLS[game].art(name);
}

/**
 * The tags the game shows on a skill's gem — "Spell, AoE, Fire" — from its own
 * game's table. Given what `buildSkill` returned, so prose and an unknown gem
 * have none; a Path of Exile 2 Spark is tagged by Path of Exile 2's table.
 */
export function skillTags(game: GameId, name?: string | null): string[] {
  return SKILLS[game].tags(name);
}

/** The active skills a form offers for a character of this game. */
export function skillNamesFor(game: GameId): string[] {
  return SKILLS[game].names();
}
