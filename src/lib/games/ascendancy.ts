import * as poe1 from "./poe1/ascendancy";
import * as poe2 from "./poe2/ascendancy";
import type { GameId } from "./types";

/**
 * Ascendancy art by game. Path of Exile 2 has no full `GameModule` yet, but its
 * characters are listed and have pages, and two ascendancy names — Deadeye and
 * Pathfinder — exist in both games as different classes. So the art is looked
 * up through the character's game here rather than by name alone, and this
 * folder stays the only place that knows which game is which.
 */
const ART = {
  poe1: { icon: poe1.ascendancyIcon, portrait: poe1.ascendancyPortrait },
  poe2: { icon: poe2.ascendancyIcon, portrait: poe2.ascendancyPortrait },
} satisfies Record<GameId, unknown>;

export function ascendancyIcon(game: GameId, ascendancy?: string | null) {
  return ART[game].icon(ascendancy);
}

export function ascendancyPortrait(game: GameId, ascendancy?: string | null) {
  return ART[game].portrait(ascendancy);
}
