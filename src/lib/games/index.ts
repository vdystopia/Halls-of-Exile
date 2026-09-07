import { poe1 } from "./poe1";
import { type GameId, type GameModule, GAME_IDS, isGameId } from "./types";

export { GAME_IDS, isGameId };
export type { GameId, GameModule };

/**
 * Path of Exile 2 is not here yet. Until it is, the registry holds one game and
 * every caller already goes through it, so adding the second is a new entry
 * rather than a new branch in every consumer.
 */
const MODULES: Record<GameId, GameModule | undefined> = {
  poe1,
  poe2: undefined,
};

export function gameModule(id: GameId): GameModule {
  const found = MODULES[id];
  if (!found) throw new Error(`No module for game "${id}" yet.`);
  return found;
}

/** The games the archive can actually read today. */
export function availableGames(): GameModule[] {
  return GAME_IDS.map((id) => MODULES[id]).filter((module): module is GameModule => Boolean(module));
}
