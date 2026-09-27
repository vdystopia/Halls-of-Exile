/**
 * Sorting the class table, pure so it can be tested and so the client
 * component only calls it.
 *
 * The direction is passed into the comparison rather than negating the result,
 * the rule the league index follows: a row with nothing to sort by — no level
 * recorded, no /played — stays at the bottom whichever way the column points,
 * instead of floating to the top on the second click. Ties fall back to the
 * name so the order is stable.
 */
export type ClassSortColumn = "class" | "played" | "characters" | "leagues" | "averageLevel" | "highestLevel";
export type ClassSortDirection = "asc" | "desc";

export type ClassSortable = {
  name: string;
  playedMinutes: number;
  characters: number;
  leagues: number;
  averageLevel: number | null;
  highestLevel: number | null;
};

/** Each column's natural first direction: names read A to Z, figures biggest first. */
export const CLASS_SORT_DEFAULT: Record<ClassSortColumn, ClassSortDirection> = {
  class: "asc",
  played: "desc",
  characters: "desc",
  leagues: "desc",
  averageLevel: "desc",
  highestLevel: "desc",
};

function compareNumbers(a: number | null, b: number | null, direction: ClassSortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

export function sortClassRows<T extends ClassSortable>(rows: T[], column: ClassSortColumn, direction: ClassSortDirection): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return rows.slice().sort((a, b) => {
    switch (column) {
      case "class":
        return direction === "asc" ? byName(a, b) : byName(b, a);
      case "played":
        // A class with no /played recorded at all has nothing to rank by.
        return compareNumbers(a.playedMinutes || null, b.playedMinutes || null, direction) || byName(a, b);
      case "characters":
        return compareNumbers(a.characters, b.characters, direction) || byName(a, b);
      case "leagues":
        return compareNumbers(a.leagues, b.leagues, direction) || byName(a, b);
      case "averageLevel":
        return compareNumbers(a.averageLevel, b.averageLevel, direction) || byName(a, b);
      case "highestLevel":
        return compareNumbers(a.highestLevel, b.highestLevel, direction) || byName(a, b);
    }
  });
}
