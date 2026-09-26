import * as poe1 from "./poe1/ascendancy";
import * as poe2 from "./poe2/ascendancy";
import type { GameId } from "./types";

/**
 * Ascendancy art by game. Two ascendancy names — Deadeye and Pathfinder —
 * exist in both games as different classes. So the art is looked
 * up through the character's game here rather than by name alone, and this
 * folder stays the only place that knows which game is which.
 *
 * Each takes the class as well: a character with no ascendancy — under the
 * level for one, or a record that names only the class — is drawn as its
 * class, from the class's own picture on each game's wiki. The ascendancy
 * decides when there is one; the class is only read when there is not.
 *
 * The owner's record writes "Unknown" where it has no value, for the class
 * and the ascendancy both, and `classLine` already reads that as nothing. So
 * does this: an "Unknown" ascendancy is no ascendancy, and the class is drawn.
 */
const known = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "Unknown" ? trimmed : null;
};

const ART = {
  poe1: { icon: poe1.ascendancyIcon, portrait: poe1.ascendancyPortrait, avatar: poe1.ascendancyAvatar },
  poe2: { icon: poe2.ascendancyIcon, portrait: poe2.ascendancyPortrait, avatar: poe2.ascendancyAvatar },
} satisfies Record<GameId, unknown>;

export function ascendancyIcon(game: GameId, ascendancy?: string | null, className?: string | null) {
  return ART[game].icon(known(ascendancy), known(className));
}

export function ascendancyPortrait(game: GameId, ascendancy?: string | null, className?: string | null) {
  return ART[game].portrait(known(ascendancy), known(className));
}

/** The face, for a compact banner: its own file in Path of Exile 1, the portrait in Path of Exile 2. */
export function ascendancyAvatar(game: GameId, ascendancy?: string | null, className?: string | null) {
  return ART[game].avatar(known(ascendancy), known(className));
}
