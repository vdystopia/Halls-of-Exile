import type { BuildData } from "../types";
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
 * One Path of Exile 2 build from the sources a character has: the Path of
 * Building 2 code when there is one, in full, and the site's export only when
 * there is not.
 *
 * The code is the complete source — passive tree with both weapon sets, skill
 * gems, tree jewels, gear, config, notes and its engine's stats — so a code
 * alone is enough to archive a character, and when both exist the code replaces
 * everything the export brought. The export's payload is still kept on the row:
 * it is the one record of the game's own figures and last login, and a
 * character whose code is later removed falls back to it.
 */
export function composePoe2Build(pobCode: string | null, sitePayload: StoredPoe2Export | null): BuildData | null {
  if (pobCode) return parsePob2(pobCode);
  return sitePayload ? rebuildFromStoredPoe2(sitePayload) : null;
}

/**
 * The build a character should hold, from the sources it has. Path of Exile 1
 * keeps its rule — whichever source was applied last is the build — and Path of
 * Exile 2 takes its code over its export (see `composePoe2Build`). Null when there is nothing to
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
