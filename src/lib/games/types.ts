/**
 * A game's own code lives in `src/lib/games/<game>/`. Pages and components
 * reach it only through the dispatch modules beside this file — `gear.ts`
 * (drawing a build), `builds.ts` (parsing one), `exports.ts` (account
 * exports), `skills.ts`, `classes.ts`, `ascendancy.ts`, `class-colors.ts` —
 * each keyed by game, and shapes shared by both live in `shared/`.
 * `tests/game-separation.test.ts` fails if a page or component imports a
 * game's folder directly.
 */

/**
 * The two games the archive holds. Path of Exile and Path of Exile 2 share a
 * launcher, a publisher and most of their vocabulary, and almost nothing else:
 * an item, a gem and a passive tree mean different things in each, so each game
 * brings its own reading of a build and its own way of drawing one.
 */
export type GameId = "poe1" | "poe2";

export const GAME_IDS: readonly GameId[] = ["poe1", "poe2"];

export function isGameId(value: unknown): value is GameId {
  return value === "poe1" || value === "poe2";
}

/** Each game's name, for a heading on a page that lists both. */
export const GAME_NAMES: Record<GameId, string> = { poe1: "Path of Exile", poe2: "Path of Exile 2" };
