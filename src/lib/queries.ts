import { db } from "./db";
import { emptyBuild } from "./games/poe1/pob";
import { leagueTitle } from "./format";
import type { GameId } from "./games/types";
import { parseLeagueModifiers } from "./league-modifiers";
import type { BuildData, Character, League, LeagueWithProgress, User } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function mapUser(row: Row): User {
  return {
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    poeAccount: row.poe_account ?? null,
    createdAt: row.created_at,
  };
}

function mapLeague(row: Row): League {
  return {
    id: row.id,
    game: row.game,
    slug: row.slug,
    patch: row.patch,
    kind: row.kind,
    parent: row.parent,
    name: row.name,
    expansion: row.expansion,
    startDate: row.start_date,
    endDate: row.end_date,
    endDateEstimated: row.end_date_estimated,
    datesUncertain: row.dates_uncertain,
    challengeTotal: row.challenge_total,
    isCustom: row.is_custom,
    sortOrder: row.sort_order,
  };
}

function mapCharacter(row: Row): Character {
  let data: BuildData;
  try {
    data = { ...emptyBuild(), ...(JSON.parse(row.data) as BuildData) };
  } catch {
    data = emptyBuild();
  }
  return {
    id: row.id,
    userId: row.user_id,
    leagueId: row.league_id,
    slug: row.slug,
    name: row.name,
    className: row.class_name,
    ascendancy: row.ascendancy,
    level: row.level,
    mainSkill: row.main_skill,
    skillGem: row.skill_gem ?? null,
    leagueModifiers: parseLeagueModifiers(row.league_modifiers),
    notes: row.notes,
    playedMinutes: row.played_minutes ?? null,
    isFavorite: row.is_favorite,
    pobCode: row.pob_code,
    pobUrl: row.pob_url,
    retiredAt: null,
    createdAt: row.created_at,
    data,
  };
}

export type UserSummary = User & {
  tagline: string | null;
  characterCount: number;
  leagueCount: number;
  highestLevel: number | null;
  latestPatch: string | null;
  latestLeague: string | null;
};

export function listUsers(): UserSummary[] {
  const rows = db
    .prepare(
      `SELECT u.*,
              (SELECT COUNT(*) FROM characters c WHERE c.user_id = u.id)                      AS character_count,
              (SELECT COUNT(DISTINCT c.league_id) FROM characters c WHERE c.user_id = u.id)   AS league_count,
              (SELECT MAX(c.level) FROM characters c WHERE c.user_id = u.id)                  AS highest_level,
              (SELECT l.patch FROM characters c JOIN leagues l ON l.id = c.league_id
                 WHERE c.user_id = u.id ORDER BY l.sort_order DESC LIMIT 1)                   AS latest_patch,
              (SELECT l.name FROM characters c JOIN leagues l ON l.id = c.league_id
                 WHERE c.user_id = u.id ORDER BY l.sort_order DESC LIMIT 1)                   AS latest_league
       FROM users u
       ORDER BY character_count DESC, u.username COLLATE NOCASE ASC`,
    )
    .all() as Row[];
  return rows.map((row) => ({
    ...mapUser(row),
    tagline: row.tagline,
    characterCount: row.character_count,
    leagueCount: row.league_count,
    highestLevel: row.highest_level,
    latestPatch: row.latest_patch,
    latestLeague: row.latest_league,
  }));
}

export function getUser(username: string): (User & { tagline: string | null }) | null {
  const row = db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`).get(username) as Row;
  return row ? { ...mapUser(row), tagline: row.tagline } : null;
}

export function listLeaguesForUser(userId: number): LeagueWithProgress[] {
  const rows = db
    .prepare(
      `SELECT l.*,
              COALESCE(cc.character_count, 0) AS character_count,
              cc.max_level                    AS max_level,
              r.challenges_completed          AS challenges_completed,
              r.challenge_total               AS challenge_total_override,
              r.notes                         AS notes
       FROM leagues l
       LEFT JOIN (
         SELECT league_id, COUNT(*) AS character_count, MAX(level) AS max_level
         FROM characters WHERE user_id = ? GROUP BY league_id
       ) cc ON cc.league_id = l.id
       LEFT JOIN league_records r ON r.league_id = l.id AND r.user_id = ?
       ORDER BY l.sort_order DESC`,
    )
    .all(userId, userId) as Row[];
  return rows.map((row) => ({
    ...mapLeague(row),
    characterCount: row.character_count,
    maxLevel: row.max_level,
    challengesCompleted: row.challenges_completed,
    challengeTotalOverride: row.challenge_total_override,
    notes: row.notes,
  }));
}

export function listAllLeagues(): League[] {
  const rows = db.prepare(`SELECT * FROM leagues ORDER BY sort_order DESC`).all() as Row[];
  return rows.map(mapLeague);
}

/**
 * A league is addressed by its game and its slug. The patch alone stopped
 * working when Path of Exile 2 arrived (both games ship a 1.0) and the slug
 * alone stopped working when events arrived (both games have an "unspecified").
 */
export function getLeague(game: string, slug: string): League | null {
  const row = db
    .prepare(`SELECT * FROM leagues WHERE game = ? AND slug = ?`)
    .get(game, slug) as Row;
  return row ? mapLeague(row) : null;
}

export function getLeagueProgress(userId: number, leagueId: number) {
  const row = db
    .prepare(`SELECT * FROM league_records WHERE user_id = ? AND league_id = ?`)
    .get(userId, leagueId) as Row;
  return row
    ? {
        challengesCompleted: row.challenges_completed as number | null,
        challengeTotal: row.challenge_total as number | null,
        notes: row.notes as string | null,
      }
    : null;
}

export function listCharacters(userId: number, leagueId: number): Character[] {
  const rows = db
    .prepare(
      `SELECT * FROM characters WHERE user_id = ? AND league_id = ?
       ORDER BY is_favorite DESC, level DESC, name COLLATE NOCASE ASC`,
    )
    .all(userId, leagueId) as Row[];
  return rows.map(mapCharacter);
}

/** A character with its league, as the player page's lists draw it. */
export type PlayerCharacter = Character & {
  game: GameId;
  leagueSlug: string;
  patch: string | null;
  leagueName: string;
  /** The one format for a league anywhere, from `leagueTitle`: brackets and all. */
  leagueTitle: string;
};

/**
 * The card needs the league's game and slug to build a link, not its patch: a
 * patch does not identify a row and the URL carries the slug.
 */
export function listRecentCharacters(
  userId: number,
  limit = 6,
): PlayerCharacter[] {
  const rows = db
    .prepare(
      `SELECT c.*, l.game AS game, l.slug AS league_slug, l.patch AS patch, l.name AS league_name,
              l.kind AS league_kind, l.parent AS league_parent, l.expansion AS league_expansion
       FROM characters c JOIN leagues l ON l.id = c.league_id
       WHERE c.user_id = ?
       ORDER BY c.is_favorite DESC, l.sort_order DESC, c.level DESC
       LIMIT ?`,
    )
    .all(userId, limit) as Row[];
  return rows.map((row) => ({
    ...mapCharacter(row),
    game: row.game,
    leagueSlug: row.league_slug,
    patch: row.patch,
    leagueName: row.league_name,
    leagueTitle: leagueTitle({
      patch: row.patch,
      name: row.league_name,
      kind: row.league_kind,
      parent: row.league_parent,
      expansion: row.league_expansion,
    }),
  }));
}

/** Every character a player has, with its league, for the player page's rollups and highlights. */
export function listPlayerCharacters(
  userId: number,
): PlayerCharacter[] {
  const rows = db
    .prepare(
      `SELECT c.*, l.game AS game, l.slug AS league_slug, l.patch AS patch, l.name AS league_name,
              l.kind AS league_kind, l.parent AS league_parent, l.expansion AS league_expansion
       FROM characters c JOIN leagues l ON l.id = c.league_id
       WHERE c.user_id = ?
       ORDER BY l.sort_order DESC, c.level DESC`,
    )
    .all(userId) as Row[];
  return rows.map((row) => ({
    ...mapCharacter(row),
    game: row.game,
    leagueSlug: row.league_slug,
    patch: row.patch,
    leagueName: row.league_name,
    leagueTitle: leagueTitle({
      patch: row.patch,
      name: row.league_name,
      kind: row.league_kind,
      parent: row.league_parent,
      expansion: row.league_expansion,
    }),
  }));
}


export function getCharacter(userId: number, leagueId: number, slug: string): Character | null {
  const row = db
    .prepare(`SELECT * FROM characters WHERE user_id = ? AND league_id = ? AND slug = ?`)
    .get(userId, leagueId, slug) as Row;
  return row ? mapCharacter(row) : null;
}

/**
 * Neighbouring leagues for walking the archive one league at a time, within the
 * league's own game: `sort_order` runs across both games by date, so without
 * the filter 0.3 would lead to a Path of Exile 1 league that ran beside it.
 */
export function getAdjacentLeagues(
  userId: number,
  game: GameId,
  sortOrder: number,
): { previous: League | null; next: League | null } {
  const played = `AND EXISTS (SELECT 1 FROM characters c WHERE c.league_id = leagues.id AND c.user_id = ?)`;
  const pick = (comparison: string, direction: string, onlyPlayed: boolean) => {
    const sql = `SELECT * FROM leagues WHERE game = ? AND sort_order ${comparison} ? ${onlyPlayed ? played : ""}
                 ORDER BY sort_order ${direction} LIMIT 1`;
    const args = onlyPlayed ? [game, sortOrder, userId] : [game, sortOrder];
    const row = db.prepare(sql).get(...args) as Row;
    return row ? mapLeague(row) : null;
  };
  return {
    previous: pick("<", "DESC", true) ?? pick("<", "DESC", false),
    next: pick(">", "ASC", true) ?? pick(">", "ASC", false),
  };
}

export function getUserTotals(userId: number) {
  const row = db
    .prepare(
      `SELECT COUNT(*)                     AS characters,
              COUNT(DISTINCT league_id)    AS leagues,
              MAX(level)                   AS highest_level,
              SUM(COALESCE(played_minutes, 0)) AS played_minutes,
              SUM(CASE WHEN played_minutes > 0 THEN 1 ELSE 0 END) AS played_recorded,
              SUM(CASE WHEN level >= 90 THEN 1 ELSE 0 END) AS level_90s
       FROM characters WHERE user_id = ?`,
    )
    .get(userId) as Row;
  return {
    characters: row.characters as number,
    leagues: row.leagues as number,
    highestLevel: row.highest_level as number | null,
    playedMinutes: (row.played_minutes as number) ?? 0,
    /** How many characters have a /played, so the total can say what it covers. */
    playedRecorded: (row.played_recorded as number) ?? 0,
    level90s: (row.level_90s as number) ?? 0,
  };
}

export function getArchiveTotals() {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM users)      AS users,
              (SELECT COUNT(*) FROM characters) AS characters,
              -- leagues someone has actually archived a character in...
              (SELECT COUNT(DISTINCT league_id) FROM characters) AS leagues,
              -- ...and the size of the catalogue itself, which proves the seed ran
              (SELECT COUNT(*) FROM leagues)    AS catalogue`,
    )
    .get() as Row;
  return {
    users: row.users as number,
    characters: row.characters as number,
    leagues: row.leagues as number,
    catalogue: row.catalogue as number,
  };
}

/** Whether a character holds an account export underneath its build, for the build to fall back to. */
export function hasStoredExport(characterId: number): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM characters WHERE id = ? AND source_payload IS NOT NULL`).get(characterId));
}

/**
 * Names a character can share: placeholders for a name the record never held
 * (the Path of Exile 2 beta characters are "Unnamed Exile"), which are not names.
 */
const PLACEHOLDER_NAMES = new Set(["unnamed exile", "unknown"]);

/**
 * Another character of this player's in this game with the same name, if there
 * is one. A name is unique within a game — the game itself enforces that per
 * realm — so a second one is either the same character added twice or a
 * mistake, and the caller asks before replacing it rather than keeping both.
 */
export function findNamesake(
  userId: number,
  game: GameId,
  name: string,
  exceptId?: number,
): { id: number; slug: string; leagueSlug: string; leagueTitle: string } | null {
  if (PLACEHOLDER_NAMES.has(name.trim().toLowerCase())) return null;
  const row = db
    .prepare(
      `SELECT c.id, c.slug, l.slug AS league_slug, l.patch, l.name AS league_name, l.kind, l.parent, l.expansion
         FROM characters c JOIN leagues l ON l.id = c.league_id
        WHERE c.user_id = ? AND l.game = ? AND c.name = ? COLLATE NOCASE AND c.id IS NOT ?
        LIMIT 1`,
    )
    .get(userId, game, name.trim(), exceptId ?? null) as Row | undefined;
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    leagueSlug: row.league_slug,
    leagueTitle: leagueTitle({ patch: row.patch, name: row.league_name, kind: row.kind, parent: row.parent, expansion: row.expansion }),
  };
}
