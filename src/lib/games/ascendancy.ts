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
  poe1: { icon: poe1.ascendancyIcon, portrait: poe1.ascendancyPortrait, avatar: poe1.ascendancyAvatar },
  poe2: { icon: poe2.ascendancyIcon, portrait: poe2.ascendancyPortrait, avatar: poe2.ascendancyAvatar },
} satisfies Record<GameId, unknown>;

export function ascendancyIcon(game: GameId, ascendancy?: string | null) {
  return ART[game].icon(ascendancy);
}

export function ascendancyPortrait(game: GameId, ascendancy?: string | null) {
  return ART[game].portrait(ascendancy);
}

/** The face, for a compact banner: its own file in Path of Exile 1, the portrait in Path of Exile 2. */
export function ascendancyAvatar(game: GameId, ascendancy?: string | null) {
  return ART[game].avatar(ascendancy);
}
