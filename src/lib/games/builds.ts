import type { BuildData, ParsedItem } from "../types";
import { decodePobCode, parsePob, PARSER_VERSION, PobError } from "./poe1/pob";
import { codeGame, parsePob2, POE2_PARSER_VERSION } from "./poe2/pob";
import { rebuildFromStoredPoe2, type StoredPoe2Export } from "./poe2/site-export";
import type { GameId } from "./types";

/**
 * Share codes by game, and how a character's sources combine into one build.
 *
 * A share code says which game it is for — `<PathOfBuilding2>` or
 * `<PathOfBuilding>` — and a character belongs to one game through its league.
 * A code for the other game is refused by name rather than half-read: Path of
 * Exile 1's parser would find no `PathOfBuilding` root in a Path of Building 2
 * code, and the reverse would draw one game's passives on the other's tree.
 */
export function parseCodeFor(game: GameId, code: string): BuildData {
  const found = codeGame(decodePobCode(code));
  if (found && found !== game) {
    throw new PobError(
      found === "poe2"
        ? "That is a Path of Building 2 code, for a Path of Exile 2 character — this one is Path of Exile."
        : "That is a Path of Building code for Path of Exile 1 — this character is Path of Exile 2.",
    );
  }
  return game === "poe2" ? parsePob2(code) : parsePob(code);
}

/** The share-code parser version a character of this game is current at. */
export function parserVersionFor(game: GameId): number {
  return game === "poe2" ? POE2_PARSER_VERSION : PARSER_VERSION;
}

/**
 * One Path of Exile 2 build from whichever of its two sources a character has.
 *
 * They know different things, and neither is complete:
 *
 *   - The site's export has the gear as the game shows it — its own figures,
 *     requirements and pictures — and the skills items grant. No tree, no
 *     skill-slot gems, no stats.
 *   - A Path of Building 2 code has the passive tree with both weapon sets, the
 *     skill gems, the jewels in the tree, config, notes and its engine's stats,
 *     and gear as Path of Building's text, without pictures or the game's own
 *     requirement figures.
 *
 * So with both, the gear is the site's and everything else the code's; the tree
 * jewels come from the code, because the site does not list them, and are given
 * ids clear of the site's items so the two lists cannot collide. With one, it
 * is that one. Each source replacing only what it owns is what lets either be
 * refreshed without undoing the other.
 */
export function composePoe2Build(pobCode: string | null, sitePayload: StoredPoe2Export | null): BuildData | null {
  const pob = pobCode ? parsePob2(pobCode) : null;
  const site = sitePayload ? rebuildFromStoredPoe2(sitePayload) : null;
  if (!pob || !site) return pob ?? site;

  const JEWEL_OFFSET = 100000;
  const pobItems = new Map(pob.items.map((item) => [item.id, item]));
  const jewels: ParsedItem[] = (pob.treeJewels ?? [])
    .map((id) => pobItems.get(id))
    .filter((item): item is ParsedItem => Boolean(item))
    .map((item) => ({ ...item, id: item.id + JEWEL_OFFSET }));

  return {
    ...pob,
    items: [...site.items, ...jewels],
    slots: site.slots,
    treeJewels: jewels.map((item) => item.id),
    origin: site.origin,
  };
}

/**
 * The build a character should hold, from the sources it has. Path of Exile 1
 * keeps its rule — whichever source was applied last is the build — and Path of
 * Exile 2 combines both (see `composePoe2Build`). Null when there is nothing to
 * build from.
 */
export function composeBuild(
  game: GameId,
  sources: { pobCode: string | null; sitePayload: unknown; fallback: BuildData | null },
): BuildData | null {
  if (game === "poe2") {
    const stored = (sources.sitePayload as StoredPoe2Export | null)?.game === "poe2" ? (sources.sitePayload as StoredPoe2Export) : null;
    return composePoe2Build(sources.pobCode, stored);
  }
  return sources.fallback;
}
