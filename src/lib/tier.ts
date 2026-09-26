import type { Character } from "./types";

/**
 * How finished a character's record is, as one of three tiers.
 *
 * The initial population comes in two halves: the owner's record (a spreadsheet
 * with /played, notes, the build and the league for every character) and the
 * game's own exports (gear, gems and, for Path of Exile, the tree). A character
 * is finished when it has both, and a Path of Building code on top is the best
 * a record can be. The tier is derived from the row every time it is read, so
 * a character moves up the moment it meets the rule and nothing has to be
 * re-stamped.
 *
 * - Tier 3: something a person has to supply is still missing — /played, notes,
 *   the main skill or the league — or nothing has been imported for it yet.
 * - Tier 2: every one of those is filled and the game's export has been applied.
 * - Tier 1: every one of those is filled and a Path of Building code holds the
 *   build. A code outranks an export (for Path of Exile 2 it is the whole
 *   build), so a character added from a code alone, the way ongoing characters
 *   are, reaches tier 1 without an export.
 *
 * What an export cannot carry is never held against a character: a Path of
 * Exile 2 site export has no tree and no skill gems, and a character imported
 * that way is tier 2 all the same.
 *
 * "Class" is the owner's word for this; it is called a tier here because the
 * archive already uses "class" for Witch and Marauder.
 */
export type Tier = 1 | 2 | 3;

export const TIER_LABELS: Record<Tier, string> = {
  1: "Tier 1 · build code",
  2: "Tier 2 · imported",
  3: "Tier 3 · incomplete",
};

export type TierReport = {
  tier: Tier;
  /** What still keeps it out of tier 2, in the words the matrix shows. Empty at tier 1 and 2. */
  missing: string[];
};

/** The subset of a character the tier is read from; `Character` satisfies it. */
export type TierInput = Pick<Character, "playedMinutes" | "notes" | "mainSkill" | "skillGem" | "pobCode" | "hasExport" | "data"> & {
  /** The league's slug, so "unspecified" can be told from a real league. */
  leagueSlug: string;
};

const CODE_SOURCES = new Set(["pob"]);

export function characterTier(character: TierInput): TierReport {
  const missing: string[] = [];
  if (!character.playedMinutes || character.playedMinutes <= 0) missing.push("/played");
  if (!character.notes?.trim()) missing.push("notes");
  // The record writes "Unknown" where it has no answer; that is no answer.
  const known = (value: string | null) => Boolean(value?.trim()) && value!.trim() !== "Unknown";
  if (!known(character.skillGem) && !known(character.mainSkill)) missing.push("main skill");
  if (character.leagueSlug === "unspecified") missing.push("league");

  const hasCode = Boolean(character.pobCode) && CODE_SOURCES.has(character.data.source);
  const hasImport = character.hasExport;
  if (!hasCode && !hasImport) missing.push("gear from the game");

  if (missing.length) return { tier: 3, missing };
  return { tier: hasCode ? 1 : 2, missing: [] };
}
