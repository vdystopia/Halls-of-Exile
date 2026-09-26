import { leagueLabel } from "./format";

/** The three things the league index filters on. An empty set means "all". */
export type LeagueFilters = { games: Set<string>; patches: Set<string>; names: Set<string> };
export type Facet = keyof LeagueFilters;

type Filterable = {
  game: string;
  patch: string | null;
  name: string;
  expansion?: string | null;
  kind?: string | null;
  parent?: string | null;
};

const VALUE: Record<Facet, (league: Filterable) => string> = {
  games: (league) => league.game,
  patches: (league) => league.patch ?? "",
  names: (league) => leagueLabel(league),
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
