import { leagueLabel } from "./format";

/** The four things the league index filters on. An empty set means "all". */
export type LeagueFilters = { games: Set<string>; patches: Set<string>; names: Set<string>; kinds: Set<string> };
export type Facet = keyof LeagueFilters;

type Filterable = {
  game: string;
  slug: string;
  patch: string | null;
  name: string;
  expansion?: string | null;
  kind?: string | null;
  parent?: string | null;
};

/**
 * Events the owner counts as core leagues (2026-09-28): "it also has
 * challenges, so it's a league by my definition". The catalogue keeps 0.5.5 an
 * event, because it runs beside 0.5 rather than after it and its label names
 * that parent; only the index's filter reads this list. Keyed `game/slug`.
 */
const CORE_EVENTS = new Set(["poe2/0.5.5"]);

/**
 * Whether a row is a core league or an event, as the index's "kind" filter
 * sees it. Filtered to leagues alone, Path of Exile 1 is one row per patch,
 * 1.0 to 3.29, and Path of Exile 2 is 0.1 to 0.5.5: the gauntlets, the
 * Phrecia runs, the closed betas and "Unspecified league" are all events.
 */
export function leagueKind(league: Pick<Filterable, "game" | "slug" | "kind">): "league" | "event" {
  if (league.kind !== "event") return "league";
  return CORE_EVENTS.has(`${league.game}/${league.slug}`) ? "league" : "event";
}

const VALUE: Record<Facet, (league: Filterable) => string> = {
  games: (league) => league.game,
  patches: (league) => league.patch ?? "",
  names: (league) => leagueLabel(league),
  kinds: leagueKind,
};

/** Whether a league passes every filter, leaving out `skip`. */
export function passes(league: Filterable, filters: LeagueFilters, skip?: Facet): boolean {
  return (Object.keys(VALUE) as Facet[]).every(
    (facet) => facet === skip || !filters[facet].size || filters[facet].has(VALUE[facet](league)),
  );
}

/**
 * What one filter offers: the values of the rows the *other* filters leave, so
 * no choice can empty the table — offering every value let "Path of Exile 2"
 * with "3.25" leave nothing. A value already ticked stays offered, so it can
 * always be unticked.
 */
export function facetValues(leagues: Filterable[], filters: LeagueFilters, facet: Facet): string[] {
  const values = new Set(leagues.filter((league) => passes(league, filters, facet)).map(VALUE[facet]));
  for (const chosen of filters[facet]) values.add(chosen);
  return [...values];
}
