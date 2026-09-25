import index from "./league-logos.json";
import type { League } from "./types";

export type LeagueLogo = {
  src: string;
  width: number;
  height: number;
  /** The wiki file it came from, for anyone checking the choice. */
  file: string;
  /** The game's own logo, standing in where the wiki has none for this league. */
  generic?: boolean;
};

const LOGOS = index as Record<string, LeagueLogo>;

/**
 * A league's logo, fetched from the community wikis by `npm run leagues:art`.
 * Keyed by game and slug, the catalogue's own key: the slug alone repeats
 * across the games and the patch does not identify a row. A user-added league
 * has no entry and draws nothing.
 */
export function leagueLogo(league: Pick<League, "game" | "slug">): LeagueLogo | null {
  return LOGOS[`${league.game}/${league.slug}`] ?? null;
}
