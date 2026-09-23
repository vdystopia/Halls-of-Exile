import type { BuildData, Character } from "./types";

/**
 * Search across one player's whole archive: character name, skill, and unique
 * item. It runs over the player's characters in memory rather than in SQL,
 * because two of the three fields live inside the stored build JSON — the gems
 * of every socket group, and the items the build has equipped — and a player's
 * archive is at most a few hundred rows.
 */

export type SearchField = "name" | "skill" | "unique";

export type SearchHit = { field: SearchField; text: string };

export type SearchResult<T extends Character> = { character: T; hits: SearchHit[] };

/** Shorter queries match nearly everything and say nothing. */
export const MIN_QUERY_LENGTH = 2;

export function normaliseQuery(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

/**
 * Items the build actually uses: equipped in a slot or socketed into the
 * passive tree. Path of Building keeps every item a build ever held, and a
 * unique left in the spares list is not one the character wore.
 */
export function uniquesInUse(build: BuildData): string[] {
  const inUse = new Set<number>([...Object.values(build.slots ?? {}), ...(build.treeJewels ?? [])].filter(Boolean));
  const names = new Set<string>();
  for (const item of build.items ?? []) {
    if (!inUse.has(item.id)) continue;
    if (item.rarity !== "UNIQUE" && item.rarity !== "RELIC") continue;
    if (item.name) names.add(item.name);
  }
  return [...names];
}

/** Every skill the character is recorded with: the main skill and each gem. */
export function skillsOf(character: Pick<Character, "mainSkill" | "data">): string[] {
  const names = new Set<string>();
  if (character.mainSkill && character.mainSkill !== "Unknown") names.add(character.mainSkill);
  for (const group of character.data.skillGroups ?? []) {
    for (const gem of group.gems ?? []) if (gem.name) names.add(gem.name);
  }
  return [...names];
}

export function searchCharacters<T extends Character>(characters: T[], rawQuery: string): SearchResult<T>[] {
  const query = normaliseQuery(rawQuery).toLowerCase();
  if (query.length < MIN_QUERY_LENGTH) return [];
  const matches = (value: string) => value.toLowerCase().includes(query);

  const results: SearchResult<T>[] = [];
  for (const character of characters) {
    const hits: SearchHit[] = [];
    if (matches(character.name)) hits.push({ field: "name", text: character.name });
    for (const skill of skillsOf(character)) if (matches(skill)) hits.push({ field: "skill", text: skill });
    for (const unique of uniquesInUse(character.data)) if (matches(unique)) hits.push({ field: "unique", text: unique });
    if (hits.length) results.push({ character, hits });
  }

  // A name match is what someone typing a name wants first; after that, the
  // archive's own order (newest league, then level) is kept as it came in.
  const rank = (result: SearchResult<T>) => (result.hits.some((hit) => hit.field === "name") ? 0 : 1);
  return results
    .map((result, index) => ({ result, index }))
    .sort((a, b) => rank(a.result) - rank(b.result) || a.index - b.index)
    .map(({ result }) => result);
}
