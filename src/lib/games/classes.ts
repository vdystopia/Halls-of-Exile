import { ASCENDANCIES as POE1_ASCENDANCIES } from "../leagues";
import { ASCENDANCIES as POE2_ASCENDANCIES } from "./poe2/classes";
import type { GameId } from "./types";

/**
 * Each game's classes and their ascendancies, for a form that asks. Ranger and
 * Witch are classes in both games with different ascendancies, so the list is
 * always the character's own game's.
 */
export function ascendanciesFor(game: GameId): Record<string, string[]> {
  return game === "poe2" ? POE2_ASCENDANCIES : POE1_ASCENDANCIES;
}
