/**
 * How a character played its league: SSF, Hardcore, Ruthless, Trade.
 *
 * These are not leagues. Every league Grinding Gear Games run opens as several
 * parallel variants of one another — Settlers, Hardcore Settlers, SSF Settlers,
 * HC SSF Settlers — which is why the catalogue holds one row for the league and
 * this sits on the character instead. Two characters in the same league can
 * have played it under different rules, and often did.
 *
 * Kept as a set rather than one value because they combine: a character can be
 * Hardcore and SSF at once, and that pairing is the common one.
 *
 * Nothing infers these. The league a character reports to the API is the league
 * it sits in *now*, and migration rewrites exactly the facts that would be read
 * off it — a Hardcore character that died is moved to the softcore parent, so
 * the one field that would say "Hardcore" says the opposite for every character
 * that actually lost its league to a death. That is the same reasoning that
 * keeps the league itself out of an import, and it applies harder here. They
 * are set by hand or not at all.
 *
 * The vocabulary is shared across both games rather than split per game. These
 * are labels, not mechanics — no rule in the archive branches on them — so the
 * cost of one list is a spare word (Ruthless never ran in Path of Exile 2), and
 * the cost of two would be a game branch outside `src/lib/games/`.
 */

export const LEAGUE_MODIFIERS = [
  { id: "hardcore", label: "Hardcore", title: "One death and the character leaves the league" },
  { id: "ssf", label: "SSF", title: "Solo Self-Found: no trading, no party play" },
  { id: "ruthless", label: "Ruthless", title: "Ruthless: drops, crafting and the tree all cut back" },
  { id: "trade", label: "Trade", title: "The ordinary trade league, stated outright" },
] as const;

export type LeagueModifierId = (typeof LEAGUE_MODIFIERS)[number]["id"];

const BY_ID = new Map(LEAGUE_MODIFIERS.map((modifier) => [modifier.id, modifier]));

/** Canonical order is the order above, whatever order they were stored in. */
const ORDER = LEAGUE_MODIFIERS.map((modifier) => modifier.id) as readonly string[];

/**
 * Read the stored column. Unknown words are dropped rather than shown: the
 * column is written by this archive's own forms, so anything else in it is
 * either a hand edit or a word this version no longer knows, and neither is
 * worth rendering as a tag.
 */
export function parseLeagueModifiers(stored: string | null | undefined): LeagueModifierId[] {
  if (!stored) return [];
  const found = new Set<string>();
  for (const part of stored.split(",")) {
    const id = part.trim().toLowerCase();
    if (BY_ID.has(id as LeagueModifierId)) found.add(id);
  }
  return ORDER.filter((id) => found.has(id)) as LeagueModifierId[];
}

/** Back to the column: canonical order, or null for none, never an empty string. */
export function formatLeagueModifiers(ids: readonly string[]): string | null {
  const found = new Set(ids.map((id) => id.trim().toLowerCase()).filter((id) => BY_ID.has(id as LeagueModifierId)));
  const ordered = ORDER.filter((id) => found.has(id));
  return ordered.length ? ordered.join(",") : null;
}

/** The label to draw on a tag. */
export function leagueModifierLabel(id: LeagueModifierId): string {
  return BY_ID.get(id)?.label ?? id;
}

export function leagueModifierTitle(id: LeagueModifierId): string {
  return BY_ID.get(id)?.title ?? "";
}
