import { db } from "./db";
import { emptyBuild } from "./pob";
import type { BuildData, Character, League, LeagueWithProgress, User } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function mapUser(row: Row): User {
  return { id: row.id, username: row.username, firstName: row.first_name, createdAt: row.created_at };
}

function mapLeague(row: Row): League {
  return {
    id: row.id,
    patch: row.patch,
    name: row.name,
    expansion: row.expansion,
    startDate: row.start_date,
    endDate: row.end_date,
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
    notes: row.notes,
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

export function getLeagueByPatch(patch: string): League | null {
  const row = db.prepare(`SELECT * FROM leagues WHERE patch = ?`).get(patch) as Row;
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

export function listRecentCharacters(userId: number, limit = 6): (Character & { patch: string; leagueName: string })[] {
  const rows = db
    .prepare(
      `SELECT c.*, l.patch AS patch, l.name AS league_name
       FROM characters c JOIN leagues l ON l.id = c.league_id
       WHERE c.user_id = ?
       ORDER BY c.is_favorite DESC, l.sort_order DESC, c.level DESC
       LIMIT ?`,
    )
    .all(userId, limit) as Row[];
  return rows.map((row) => ({ ...mapCharacter(row), patch: row.patch, leagueName: row.league_name }));
}

export function getCharacter(userId: number, leagueId: number, slug: string): Character | null {
  const row = db
    .prepare(`SELECT * FROM characters WHERE user_id = ? AND league_id = ? AND slug = ?`)
    .get(userId, leagueId, slug) as Row;
  return row ? mapCharacter(row) : null;
}

/** Neighbouring leagues for walking the archive one league at a time. */
export function getAdjacentLeagues(userId: number, sortOrder: number): { previous: League | null; next: League | null } {
  const played = `AND EXISTS (SELECT 1 FROM characters c WHERE c.league_id = leagues.id AND c.user_id = ?)`;
  const pick = (comparison: string, direction: string, onlyPlayed: boolean) => {
    const sql = `SELECT * FROM leagues WHERE sort_order ${comparison} ? ${onlyPlayed ? played : ""}
                 ORDER BY sort_order ${direction} LIMIT 1`;
    const args = onlyPlayed ? [sortOrder, userId] : [sortOrder];
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
              SUM(CASE WHEN level >= 90 THEN 1 ELSE 0 END) AS level_90s
       FROM characters WHERE user_id = ?`,
    )
    .get(userId) as Row;
  const challenges = db
    .prepare(
      `SELECT SUM(COALESCE(challenges_completed, 0)) AS completed,
              SUM(CASE WHEN COALESCE(r.challenges_completed, 0) >= COALESCE(r.challenge_total, l.challenge_total)
                       THEN 1 ELSE 0 END) AS full_clears
       FROM league_records r JOIN leagues l ON l.id = r.league_id
       WHERE r.user_id = ?`,
    )
    .get(userId) as Row;
  return {
    characters: row.characters as number,
    leagues: row.leagues as number,
    highestLevel: row.highest_level as number | null,
    level90s: (row.level_90s as number) ?? 0,
    challengesCompleted: (challenges?.completed as number) ?? 0,
    fullClears: (challenges?.full_clears as number) ?? 0,
  };
}

export function getArchiveTotals() {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM users)      AS users,
              (SELECT COUNT(*) FROM characters) AS characters,
              (SELECT COUNT(*) FROM leagues)    AS leagues`,
    )
    .get() as Row;
  return { users: row.users as number, characters: row.characters as number, leagues: row.leagues as number };
}
