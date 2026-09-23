import { classLine } from "./format";
import type { Character } from "./types";

/**
 * Sorting and filtering for a league page's character list. It runs over the
 * list already loaded for the page rather than in SQL: a league holds tens of
 * characters, not thousands, and the class a character is filed under
 * (ascendancy, else class) is the same rule `classLine` already applies.
 */

export const SORTS = [
  { key: "", label: "Favourites, then level" },
  { key: "level", label: "Level" },
  { key: "name", label: "Name" },
  { key: "class", label: "Class" },
  { key: "skill", label: "Main skill" },
  { key: "played", label: "/played" },
  { key: "added", label: "Recently added" },
] as const;

export type SortKey = (typeof SORTS)[number]["key"];

export type CharacterQuery = { sort: SortKey; className: string; skill: string };

const UNKNOWN_CLASS = "class unknown";

/** The label a character is grouped under: its ascendancy, else its class. */
export function classLabel(character: Pick<Character, "className" | "ascendancy">): string {
  return classLine(character.className, character.ascendancy).split(" · ")[0];
}

function skillLabel(character: Pick<Character, "mainSkill">): string | null {
  const skill = character.mainSkill?.trim();
  return skill && skill !== "Unknown" ? skill : null;
}

/** Read the query string, dropping anything that is not a known sort. */
export function readCharacterQuery(params: Record<string, string | string[] | undefined>): CharacterQuery {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  const sort = one(params.sort);
  return {
    sort: (SORTS.some((option) => option.key === sort) ? sort : "") as SortKey,
    className: one(params.class),
    skill: one(params.skill),
  };
}

/** The values the filters offer: only what this list actually contains. */
export function characterFacets(characters: Character[]): { classes: string[]; skills: string[] } {
  const classes = new Set<string>();
  // Keyed case-insensitively, as the filter matches: "tornado shot" typed by
  // hand and "Tornado Shot" from an import are one option.
  const skills = new Map<string, string>();
  for (const character of characters) {
    classes.add(classLabel(character));
    const skill = skillLabel(character);
    if (skill && !skills.has(skill.toLowerCase())) skills.set(skill.toLowerCase(), skill);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  // "class unknown" is not a class, so it goes last rather than among the Cs.
  const sortedClasses = [...classes].filter((label) => label !== UNKNOWN_CLASS).sort(byName);
  if (classes.has(UNKNOWN_CLASS)) sortedClasses.push(UNKNOWN_CLASS);
  return { classes: sortedClasses, skills: [...skills.values()].sort(byName) };
}

/** Missing values always sort last, whichever way the column runs. */
function compareMissingLast<T>(a: T | null, b: T | null, compare: (x: T, y: T) => number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
const descending = (a: number, b: number) => b - a;

export function applyCharacterQuery(characters: Character[], query: CharacterQuery): Character[] {
  const skillFilter = query.skill.toLowerCase();
  const classFilter = query.className.toLowerCase();
  const filtered = characters.filter(
    (character) =>
      (!classFilter || classLabel(character).toLowerCase() === classFilter) &&
      (!skillFilter || (skillLabel(character) ?? "").toLowerCase() === skillFilter),
  );

  const byName = (a: Character, b: Character) => text(a.name, b.name);
  const byLevel = (a: Character, b: Character) => compareMissingLast(a.level, b.level, descending);
  const comparators: Record<SortKey, (a: Character, b: Character) => number> = {
    "": (a, b) => b.isFavorite - a.isFavorite || byLevel(a, b) || byName(a, b),
    level: (a, b) => byLevel(a, b) || byName(a, b),
    name: byName,
    class: (a, b) =>
      compareMissingLast(
        classLabel(a) === UNKNOWN_CLASS ? null : classLabel(a),
        classLabel(b) === UNKNOWN_CLASS ? null : classLabel(b),
        text,
      ) ||
      byLevel(a, b) ||
      byName(a, b),
    skill: (a, b) => compareMissingLast(skillLabel(a), skillLabel(b), text) || byLevel(a, b) || byName(a, b),
    played: (a, b) => compareMissingLast(a.playedMinutes, b.playedMinutes, descending) || byName(a, b),
    added: (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id,
  };
  return [...filtered].sort(comparators[query.sort]);
}
