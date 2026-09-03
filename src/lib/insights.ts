import { classLine } from "./format";
import type { Character } from "./types";

/** Small summary chips: which ascendancies a player ran in a league. */
export function getCharacterCountByClass(characters: Character[]): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const character of characters) {
    const label = classLine(character.className, character.ascendancy).split(" · ")[0];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
