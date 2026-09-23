import { db } from "./db";
import type { GameId } from "./games/types";

/**
 * One player's whole archive as a single JSON document, so it can be moved to
 * another instance or handed to its owner. The format is documented in
 * docs/export-format.md; bump EXPORT_VERSION on any change a reader would have
 * to know about, and keep additions additive the way BuildData's are.
 */

export const EXPORT_FORMAT = "halls-of-exile/player-export";
export const EXPORT_VERSION = 1;

/** How a character or a league record points at its league: the catalogue key. */
export type LeagueRef = { game: GameId; slug: string };

export type ExportedLeague = LeagueRef & {
  patch: string | null;
  kind: string | null;
  parent: string | null;
  name: string;
  expansion: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateEstimated: boolean;
  datesUncertain: boolean;
  challengeTotal: number | null;
  /** false: a built-in catalogue row, re-created by code on any instance. true: added by hand. */
  isCustom: boolean;
};

export type ExportedLeagueRecord = {
  league: LeagueRef;
  challengesCompleted: number | null;
  /** The player's override of the league's challenge total, if they set one. */
  challengeTotal: number | null;
  notes: string | null;
};

export type ExportedCharacter = {
  league: LeagueRef;
  slug: string;
  name: string;
  className: string;
  ascendancy: string | null;
  level: number | null;
  mainSkill: string | null;
  notes: string | null;
  playedMinutes: number | null;
  isFavorite: boolean;
  /** The Path of Building share code, the source the build can be re-parsed from. */
  pobCode: string | null;
  pobUrl: string | null;
  /** Which parser wrote `build`; a reader with a newer parser can re-parse from `pobCode`. */
  parserVersion: number;
  createdAt: string;
  /** The stored build exactly as the archive holds it (BuildData). */
  build: Record<string, unknown>;
};

export type PlayerExport = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  player: { username: string; firstName: string; tagline: string | null; createdAt: string };
  /** Every league a character or league record below refers to, and no others. */
  leagues: ExportedLeague[];
  leagueRecords: ExportedLeagueRecord[];
  characters: ExportedCharacter[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function parseBuild(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function buildPlayerExport(username: string, now: Date = new Date()): PlayerExport | null {
  const user = db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`).get(username) as Row;
  if (!user) return null;

  const characters = db
    .prepare(
      `SELECT c.*, l.game AS league_game, l.slug AS league_slug
       FROM characters c JOIN leagues l ON l.id = c.league_id
       WHERE c.user_id = ?
       ORDER BY l.sort_order ASC, c.created_at ASC, c.id ASC`,
    )
    .all(user.id) as Row[];
  const records = db
    .prepare(
      `SELECT r.*, l.game AS league_game, l.slug AS league_slug
       FROM league_records r JOIN leagues l ON l.id = r.league_id
       WHERE r.user_id = ?
       ORDER BY l.sort_order ASC`,
    )
    .all(user.id) as Row[];
  const leagues = db
    .prepare(
      `SELECT * FROM leagues
       WHERE id IN (SELECT league_id FROM characters WHERE user_id = ?
                    UNION SELECT league_id FROM league_records WHERE user_id = ?)
       ORDER BY sort_order ASC`,
    )
    .all(user.id, user.id) as Row[];

  const ref = (row: Row): LeagueRef => ({ game: row.league_game, slug: row.league_slug });

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    player: {
      username: user.username,
      firstName: user.first_name,
      tagline: user.tagline ?? null,
      createdAt: user.created_at,
    },
    leagues: leagues.map((row) => ({
      game: row.game,
      slug: row.slug,
      patch: row.patch,
      kind: row.kind,
      parent: row.parent,
      name: row.name,
      expansion: row.expansion,
      startDate: row.start_date,
      endDate: row.end_date,
      endDateEstimated: Boolean(row.end_date_estimated),
      datesUncertain: Boolean(row.dates_uncertain),
      challengeTotal: row.challenge_total,
      isCustom: Boolean(row.is_custom),
    })),
    leagueRecords: records.map((row) => ({
      league: ref(row),
      challengesCompleted: row.challenges_completed,
      challengeTotal: row.challenge_total,
      notes: row.notes,
    })),
    characters: characters.map((row) => ({
      league: ref(row),
      slug: row.slug,
      name: row.name,
      className: row.class_name,
      ascendancy: row.ascendancy,
      level: row.level,
      mainSkill: row.main_skill,
      notes: row.notes,
      playedMinutes: row.played_minutes ?? null,
      isFavorite: Boolean(row.is_favorite),
      pobCode: row.pob_code,
      pobUrl: row.pob_url,
      parserVersion: row.parser_version ?? 0,
      createdAt: row.created_at,
      build: parseBuild(row.data),
    })),
  };
}

/** `halls-of-exile-<user>-2026-09-23.json` */
export function exportFileName(username: string, now: Date = new Date()): string {
  return `halls-of-exile-${username}-${now.toISOString().slice(0, 10)}.json`;
}
