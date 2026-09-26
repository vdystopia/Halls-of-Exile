import * as poe1 from "./poe1/keystones";
import * as poe2 from "./poe2/keystones";
import type { GameId } from "./types";

export type { KeystoneIcon } from "./poe1/keystones";

/**
 * Keystone icons by game. Several keystones share a name across the games
 * (Ancestral Bond, Chaos Inoculation, Resolute Technique) and each game draws
 * its own, so the lookup goes through the character's game and never by name
 * alone — the rule every art lookup here follows.
 */
const ICONS = { poe1: poe1.keystoneIcon, poe2: poe2.keystoneIcon } satisfies Record<GameId, unknown>;

export function keystoneIcon(game: GameId, name?: string | null) {
  return ICONS[game](name);
}

