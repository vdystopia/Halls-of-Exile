import { db } from "./db";
import { parsePlayed } from "./format";
import { emptyBuild } from "./games/poe1/pob";
import { isGameId, type GameId } from "./games/types";
import { formatLeagueModifiers, type LeagueModifierId } from "./league-modifiers";
import { findNamesake } from "./queries";
import type { League } from "./types";

/**
 * The owner's record, uploaded as a spreadsheet.
 *
 * The initial population starts here, before any export: one row per character
 * with the facts no export carries — /played, notes, the build, the league —
 * and the name the export will later be matched on. `npm run seed:atlas` does
 * the same job from a JSON file checked into the repository; this is the same
 * rule set behind an upload, so the record can be corrected and re-applied
 * without a deploy.
 *
 * The rules, which are the atlas importer's:
 * - A row is matched to a character by player, league and name. Matched, it
 *   updates in place; unmatched, it is created with a build that holds nothing.
 * - A character that holds a build (a code or an export) keeps it: the row
 *   fills the record fields it has blank — /played, notes, main skill — and
 *   sets the failed mark, and touches nothing else. Level, class and
 *   ascendancy on such a character came from the build and are left alone.
 * - A name already archived in another league of the same game is reported and
 *   skipped rather than duplicated or moved: a name belongs to one character
 *   per game, and which league is right is a question for a person.
 * - A row whose league the catalogue lacks is reported and skipped.
 *
 * Columns are found by header, case-insensitively, and the headers can be any
 * of the spellings in `COLUMNS`. Only the name is required; the game defaults
 * to Path of Exile and the league to "unspecified".
 */

export type RecordRow = {
  line: number;
  name: string;
  game: GameId;
  /** The league as written: a slug, a patch or a name. Resolved against the catalogue. */
  league: string | null;
  level: number | null;
  className: string | null;
  ascendancy: string | null;
  mainSkill: string | null;
  skillGem: string | null;
  playedMinutes: number | null;
  notes: string | null;
  modifiers: LeagueModifierId[];
  failed: boolean;
};

export type RecordSheet = {
  rows: RecordRow[];
  /** Rows that could not be read, with the reason, each naming its line. */
  problems: string[];
};

export type RecordResult = {
  created: number;
  updated: number;
  /** Characters holding a build, which took only their blank record fields. */
  filled: number;
  skipped: { name: string; reason: string }[];
};

/** Every header spelling accepted, by the field it fills. */
const COLUMNS: Record<string, string[]> = {
  name: ["name", "character", "character name"],
  game: ["game"],
  league: ["league", "patch", "league slug"],
  level: ["level", "lvl"],
  className: ["class", "classname", "class name"],
  ascendancy: ["ascendancy", "ascendancy class"],
  mainSkill: ["main skill", "mainskill", "skill", "build"],
  skillGem: ["skill gem", "skillgem", "gem"],
  played: ["played", "/played", "playtime", "time played", "played minutes", "playedminutes", "hours"],
  notes: ["notes", "note", "memories"],
  mode: ["mode", "modifiers", "how played"],
  failed: ["failed", "status", "outcome", "result"],
  player: ["player", "username", "user"],
};

/**
 * RFC 4180: fields separated by commas, quoted with double quotes, a quote
 * inside a quoted field doubled, and a newline allowed inside quotes. A tab
 * separated file, which a spreadsheet's "copy" produces, is read as well.
 */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const separator = body.split(/\r?\n/, 1)[0]?.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let at = 0; at < body.length; at += 1) {
    const char = body[at];
    if (quoted) {
      if (char === '"') {
        if (body[at + 1] === '"') {
          field += '"';
          at += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[at + 1] === "\n") at += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // A trailing blank line, or blank lines anywhere, are not rows.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const norm = (value: string) => value.trim().toLowerCase().replace(/[_\s]+/g, " ");

/** The spreadsheet's "failed" marker, however it was written. */
export function readFailed(value: string | null, mainSkill: string | null, notes: string | null): boolean {
  const flag = value ? norm(value) : "";
  if (flag && ["failed", "fail", "yes", "y", "true", "1", "x", "abandoned"].includes(flag)) return true;
  // The owner's record writes the build itself as "failed slammer".
  return /^failed\b/i.test(mainSkill ?? "") || /^failed\b/i.test(notes ?? "");
}

/** "Hardcore / SSF", "SSF → league", "SSF (in league)": the words are the modifiers. */
export function readModifiers(mode: string | null): LeagueModifierId[] {
  const text = (mode ?? "").toLowerCase();
  const found: LeagueModifierId[] = [];
  if (/\bhc\b|hardcore/.test(text)) found.push("hardcore");
  if (/\bssf\b/.test(text)) found.push("ssf");
  if (/ruthless/.test(text)) found.push("ruthless");
  if (/\btrade\b/.test(text)) found.push("trade");
  return found;
}

/** Read the sheet: a header row, then one row per character. */
export function readRecordSheet(text: string, options: { player?: string } = {}): RecordSheet {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], problems: ["The file has no rows under its header."] };

  const header = table[0].map(norm);
  const at = (field: keyof typeof COLUMNS) => {
    const index = header.findIndex((cell) => COLUMNS[field].includes(cell));
    return index < 0 ? null : index;
  };
  const columns = Object.fromEntries(Object.keys(COLUMNS).map((field) => [field, at(field)])) as Record<
    keyof typeof COLUMNS,
    number | null
  >;
  if (columns.name === null) {
    return { rows: [], problems: [`No name column. The header needs one of: ${COLUMNS.name.join(", ")}.`] };
  }

  const rows: RecordRow[] = [];
  const problems: string[] = [];
  for (const [offset, cells] of table.slice(1).entries()) {
    const line = offset + 2;
    const cell = (field: keyof typeof COLUMNS) => {
      const index = columns[field];
      const value = index === null ? undefined : cells[index];
      return value?.trim() ? value.trim() : null;
    };
    const name = cell("name");
    if (!name) {
      problems.push(`Line ${line}: no name.`);
      continue;
    }
    const player = cell("player");
    if (options.player && player && player.toLowerCase() !== options.player.toLowerCase()) {
      problems.push(`Line ${line} (${name}): filed under ${player}, not ${options.player}; skipped.`);
      continue;
    }
    const gameCell = (cell("game") ?? "poe1").toLowerCase().replace(/\s+/g, "");
    const game = gameCell === "2" || gameCell === "poe2" || gameCell === "pathofexile2" ? "poe2" : gameCell === "1" || gameCell === "pathofexile" ? "poe1" : gameCell;
    if (!isGameId(game)) {
      problems.push(`Line ${line} (${name}): unknown game "${cell("game")}".`);
      continue;
    }
    const levelCell = cell("level");
    const level = levelCell ? Number(levelCell) : null;
    if (levelCell && (!Number.isInteger(level) || level! < 1 || level! > 100)) {
      problems.push(`Line ${line} (${name}): level "${levelCell}" is not 1–100.`);
      continue;
    }
    const playedCell = cell("played");
    const playedIndex = columns.played;
    // A column headed "played minutes" is minutes; anything else goes through
    // the same parser the forms use, where a bare number is hours.
    const minutesHeader = playedIndex !== null && ["played minutes", "playedminutes"].includes(header[playedIndex]);
    const playedMinutes = playedCell
      ? minutesHeader
        ? Math.round(Number(playedCell)) || null
        : parsePlayed(playedCell)
      : null;
    if (playedCell && playedMinutes === null) {
      problems.push(`Line ${line} (${name}): could not read /played "${playedCell}".`);
      continue;
    }
    const mainSkill = cell("mainSkill");
    const notes = cell("notes");
    rows.push({
      line,
      name,
      game,
      league: cell("league"),
      level,
      className: cell("className"),
      ascendancy: cell("ascendancy"),
      mainSkill,
      skillGem: cell("skillGem"),
      playedMinutes,
      notes,
      modifiers: readModifiers(cell("mode")),
      failed: readFailed(cell("failed"), mainSkill, notes),
    });
  }
  return { rows, problems };
}

/** A league by slug, then by patch (when one league has it), then by name. */
export function resolveLeague(leagues: League[], game: GameId, written: string | null): League | null {
  const mine = leagues.filter((league) => league.game === game);
  const wanted = (written ?? "unspecified").trim().toLowerCase();
  const bySlug = mine.find((league) => league.slug.toLowerCase() === wanted);
  if (bySlug) return bySlug;
  const byPatch = mine.filter((league) => league.patch?.toLowerCase() === wanted && league.kind !== "event");
  if (byPatch.length === 1) return byPatch[0];
  const byName = mine.filter((league) => league.name.toLowerCase() === wanted);
  return byName.length === 1 ? byName[0] : null;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return slug || "character";
}

/** Apply the sheet to a player's archive. One transaction: all of it or none. */
export function applyRecord(userId: number, rows: RecordRow[], leagues: League[]): RecordResult {
  const result: RecordResult = { created: 0, updated: 0, filled: 0, skipped: [] };

  const findHere = db.prepare(
    `SELECT id, pob_code IS NOT NULL OR source_payload IS NOT NULL OR json_extract(data, '$.items[0]') IS NOT NULL AS built
       FROM characters WHERE user_id = ? AND league_id = ? AND name = ? COLLATE NOCASE`,
  );
  const takenSlugs = db.prepare(`SELECT slug FROM characters WHERE user_id = ? AND league_id = ?`);
  const insert = db.prepare(
    `INSERT INTO characters
       (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, skill_gem, league_modifiers,
        notes, played_minutes, is_favorite, failed, pob_code, pob_url, data, parser_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, 0)`,
  );
  const rewrite = db.prepare(
    `UPDATE characters SET class_name = ?, ascendancy = ?, level = ?, main_skill = ?,
                           skill_gem = COALESCE(?, skill_gem), league_modifiers = COALESCE(?, league_modifiers),
                           notes = ?, played_minutes = ?, failed = ?, data = ?
     WHERE id = ?`,
  );
  const fill = db.prepare(
    `UPDATE characters SET main_skill = COALESCE(main_skill, ?), skill_gem = COALESCE(skill_gem, ?),
                           league_modifiers = COALESCE(league_modifiers, ?),
                           notes = COALESCE(notes, ?), played_minutes = COALESCE(played_minutes, ?), failed = ?
     WHERE id = ?`,
  );

  db.transaction(() => {
    for (const row of rows) {
      const league = resolveLeague(leagues, row.game, row.league);
      if (!league) {
        result.skipped.push({ name: row.name, reason: `no ${row.game} league "${row.league ?? "unspecified"}" in the catalogue` });
        continue;
      }
      const modifiers = row.modifiers.length ? formatLeagueModifiers(row.modifiers) : null;
      const existing = findHere.get(userId, league.id, row.name) as { id: number; built: number } | undefined;
      if (existing) {
        if (existing.built) {
          fill.run(row.mainSkill, row.skillGem, modifiers, row.notes, row.playedMinutes, row.failed ? 1 : 0, existing.id);
          result.filled += 1;
        } else {
          rewrite.run(
            row.className ?? "Unknown",
            row.ascendancy,
            row.level,
            row.mainSkill,
            row.skillGem,
            modifiers,
            row.notes,
            row.playedMinutes,
            row.failed ? 1 : 0,
            JSON.stringify(manualBuild(row)),
            existing.id,
          );
          result.updated += 1;
        }
        continue;
      }
      const namesake = findNamesake(userId, row.game, row.name);
      if (namesake) {
        result.skipped.push({ name: row.name, reason: `already archived in ${namesake.leagueTitle}` });
        continue;
      }
      const taken = (takenSlugs.all(userId, league.id) as { slug: string }[]).map((r) => r.slug);
      let slug = slugify(row.name);
      for (let suffix = 2; taken.includes(slug); suffix += 1) slug = `${slugify(row.name)}-${suffix}`;
      insert.run(
        userId,
        league.id,
        slug,
        row.name,
        row.className ?? "Unknown",
        row.ascendancy,
        row.level,
        row.mainSkill,
        row.skillGem,
        modifiers,
        row.notes,
        row.playedMinutes,
        row.failed ? 1 : 0,
        JSON.stringify(manualBuild(row)),
      );
      result.created += 1;
    }
  })();
  return result;
}

/** The build a hand-written character carries: the record's facts and nothing else. */
function manualBuild(row: RecordRow) {
  return {
    ...emptyBuild(),
    source: "manual",
    className: row.className ?? undefined,
    ascendClassName: row.ascendancy ?? undefined,
    level: row.level ?? undefined,
    mainSkill: row.mainSkill ?? undefined,
  };
}
