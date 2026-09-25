import type { GameId } from "./games/types";

/**
 * The facts about one character that a player's rollups are built from. The
 * skill is resolved before it gets here (see `buildSkill`), so this module
 * holds no game data and runs anywhere.
 */
export type MetricCharacter = {
  game: GameId;
  className: string | null;
  ascendancy: string | null;
  level: number | null;
  playedMinutes: number | null;
  leagueId: number;
  skill: string | null;
};

export type Rollup = {
  /** What the row is called: a class, an ascendancy, or a skill. */
  name: string;
  /** False for the "Unknown" bucket, which is drawn without a class's colours. */
  known: boolean;
  characters: number;
  /** Distinct leagues these characters were played in. */
  leagues: number;
  /** Summed over the characters whose /played was recorded; the rest add nothing. */
  playedMinutes: number;
  /** How many of `characters` have a /played at all, so a total can say what it covers. */
  playedRecorded: number;
  /** Over characters with a known level; null when none has one. */
  averageLevel: number | null;
  highestLevel: number | null;
  level90s: number;
  /** The skill the most of these characters were built around, ties to the one played longest. */
  topSkill: string | null;
  /** The classes a skill was played on, most characters first. Empty for class rows. */
  classes: string[];
  /** A class's ascendancies. Empty below the top level. */
  children: Rollup[];
};

const known = (value: string | null) => (value && value.trim() && value !== "Unknown" ? value : null);

/** Most characters first, then most /played, then by name so the order is stable. */
function byWeight(a: Rollup, b: Rollup): number {
  return (
    Number(b.known) - Number(a.known) ||
    b.characters - a.characters ||
    b.playedMinutes - a.playedMinutes ||
    a.name.localeCompare(b.name)
  );
}

/** Group by a key, keeping the first-seen spelling as the group's name. */
function groupBy(characters: MetricCharacter[], key: (c: MetricCharacter) => string | null) {
  const groups = new Map<string, { name: string; members: MetricCharacter[] }>();
  for (const character of characters) {
    const name = key(character);
    const id = name?.toLowerCase() ?? "";
    const group = groups.get(id) ?? { name: name ?? "", members: [] };
    group.members.push(character);
    groups.set(id, group);
  }
  return [...groups.values()];
}

/** The most common value, ties going to the one with more /played. */
function mostCommon(members: MetricCharacter[], value: (c: MetricCharacter) => string | null): string[] {
  return groupBy(
    members.filter((c) => value(c)),
    value,
  )
    .map((group) => ({
      name: group.name,
      count: group.members.length,
      played: group.members.reduce((sum, c) => sum + (c.playedMinutes ?? 0), 0),
    }))
    .sort((a, b) => b.count - a.count || b.played - a.played || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

function summarise(name: string | null, members: MetricCharacter[], fallback: string): Rollup {
  const levels = members.map((c) => c.level).filter((level): level is number => typeof level === "number");
  const played = members.filter((c) => c.playedMinutes && c.playedMinutes > 0);
  return {
    name: name ?? fallback,
    known: name !== null,
    characters: members.length,
    leagues: new Set(members.map((c) => c.leagueId)).size,
    playedMinutes: played.reduce((sum, c) => sum + (c.playedMinutes ?? 0), 0),
    playedRecorded: played.length,
    averageLevel: levels.length ? levels.reduce((sum, level) => sum + level, 0) / levels.length : null,
    highestLevel: levels.length ? Math.max(...levels) : null,
    level90s: levels.filter((level) => level >= 90).length,
    topSkill: mostCommon(members, (c) => c.skill)[0] ?? null,
    classes: [],
    children: [],
  };
}

/**
 * A player's characters by class, and each class by ascendancy. One list per
 * game: Witch and Ranger are classes in both games and different classes in
 * each, so they are never added together.
 */
export function rollupByClass(characters: MetricCharacter[]): { game: GameId; classes: Rollup[] }[] {
  const games = [...new Set(characters.map((c) => c.game))].sort();
  return games.map((game) => {
    const mine = characters.filter((c) => c.game === game);
    const classes = groupBy(mine, (c) => known(c.className)).map(({ members }) => {
      const row = summarise(known(members[0].className), members, "Unknown class");
      row.children = groupBy(members, (c) => known(c.ascendancy))
        .map((group) => summarise(known(group.members[0].ascendancy), group.members, "Ascendancy unknown"))
        .sort(byWeight);
      return row;
    });
    return { game, classes: classes.sort(byWeight) };
  });
}

/**
 * Builds by the skill they were built around, longest /played first — the
 * question is which build got the hours, and a skill tried on five characters
 * for an evening each has not earned more than one played for a whole league.
 * Characters with no skill recorded are left out rather than pooled. A skill is
 * kept per game: the two games share skill names and nothing else about them.
 */
export function rollupBySkill(characters: MetricCharacter[]): (Rollup & { game: GameId })[] {
  const games = [...new Set(characters.map((c) => c.game))];
  return games
    .flatMap((game) =>
      groupBy(
        characters.filter((c) => c.game === game && c.skill),
        (c) => c.skill,
      ).map(({ name, members }) => ({
        ...summarise(name, members, name),
        game,
        topSkill: null,
        classes: mostCommon(members, (c) => known(c.ascendancy) ?? known(c.className)),
      })),
    )
    .sort(
      (a, b) => b.playedMinutes - a.playedMinutes || b.characters - a.characters || a.name.localeCompare(b.name),
    );
}
