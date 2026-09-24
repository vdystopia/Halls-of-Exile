import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db } from "./db";
import { leagueTitle } from "./format";
import {
  buildFromPoeExport,
  POE_API_VERSION,
  PoeExportError,
  readPoeExport,
  storedPayload,
  type PoeExport,
} from "./games/poe1/poe-api";
import { getLeague } from "./queries";

/**
 * Importing a whole account from Grinding Gear Games' own character endpoints.
 *
 * The input is an export from `poe-char-export`, which reads an account's
 * characters tab — the same data the profile page shows — and writes one JSON
 * file. The archive never fetches it itself: the endpoints are undocumented,
 * anonymous and rate-limited, and Cloudflare challenges datacentre addresses,
 * so collection belongs on a machine with a residential address. That machine
 * is the one the archive runs on, so `collect.ps1` closes the loop without a
 * person in it.
 *
 * Two callers share everything here. The upload page plans an import, shows it,
 * and applies the rows that were ticked. `POST /api/import/poe` applies the
 * matched rows and nothing else — see `applyImport`.
 *
 * What no export carries is the league a character belongs to. Every character
 * migrates to a permanent league when its own ends, so the league it is in now
 * says nothing about where it was played; the collector guesses from the last
 * login time and grades its own guess, and the owner's record — which is
 * first-hand — beats that guess every time. So a character already in the
 * archive is matched by name and enriched where it already sits, and one that
 * is not is created only in a league chosen by hand.
 */
export type ImportRow = {
  name: string;
  level: number | null;
  className: string | null;
  ascendancy: string | null;
  /** The league the character sits in now, which is usually a permanent one. */
  currentLeague: string;
  action: "update" | "create" | "ambiguous";
  /** Where the archive already holds this character. */
  target?: { game: string; league: string; leagueTitle: string; slug: string };
  /** How many archived characters share the name, when more than one does. */
  matches?: number;
  /** The exporter's guess at the origin league, and how sure it was of it. */
  suggested?: string | null;
  confidence?: string | null;
};

export type ImportPlan = {
  account: string;
  generatedAt: string | null;
  rows: ImportRow[];
  /** The staged upload this plan was read from; see `stageExport`. */
  token: string;
};

export type ImportResult = {
  imported: number;
  created: number;
  /** The names actually written, so a caller can name the ones that were not. */
  written: string[];
  /** League keys touched, as `<game>/<slug>`, for cache revalidation. */
  touched: Set<string>;
};

type MatchRow = {
  id: number;
  slug: string;
  game: string;
  league: string;
  name: string;
  class_name: string;
  ascendancy: string | null;
  main_skill: string | null;
};

export type ImportUser = { id: number; username: string };

function matchesFor(userId: number, name: string): MatchRow[] {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.class_name, c.ascendancy, c.main_skill, l.game, l.slug AS league
         FROM characters c JOIN leagues l ON l.id = c.league_id
        WHERE c.user_id = ? AND c.name = ? COLLATE NOCASE
        ORDER BY l.sort_order`,
    )
    .all(userId, name) as MatchRow[];
}

/**
 * Where an upload waits between being looked at and being imported.
 *
 * It has to wait somewhere. React resets a form once its action returns, which
 * takes the chosen file with it, so the second button would submit an empty
 * file input — and re-uploading several megabytes to answer "yes, do it" would
 * be wasteful even if it worked. The file is written once, under a random name,
 * and the plan carries the name.
 *
 * Staged files are deleted on the way in, an hour after they were written. A
 * restart between the two steps loses the staging directory and the upload
 * starts again, which is the right failure: nothing is half-imported.
 */
const STAGE_DIR = path.join(os.tmpdir(), "halls-imports");
const STAGE_TTL_MS = 60 * 60 * 1000;

function sweepStage() {
  if (!fs.existsSync(STAGE_DIR)) return;
  const cutoff = Date.now() - STAGE_TTL_MS;
  for (const name of fs.readdirSync(STAGE_DIR)) {
    const file = path.join(STAGE_DIR, name);
    try {
      if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file);
    } catch {
      // Another request got there first.
    }
  }
}

export function stageExport(body: string): string {
  fs.mkdirSync(STAGE_DIR, { recursive: true });
  sweepStage();
  const token = randomUUID();
  fs.writeFileSync(path.join(STAGE_DIR, `${token}.json`), body);
  return token;
}

export function readStaged(token: string): PoeExport {
  // The token names a file, so it must not be able to name any other one.
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new PoeExportError("That upload is no longer here — choose it again.");
  const file = path.join(STAGE_DIR, `${token}.json`);
  if (!fs.existsSync(file)) throw new PoeExportError("That upload is no longer here — choose it again.");
  return readPoeExport(fs.readFileSync(file, "utf8"));
}

/**
 * The player an export belongs to, by the account it was read from.
 *
 * Recorded on the player rather than passed in, so the collector script does
 * not have to know the mapping: it reads the accounts out of the archive, and
 * every export says which one it came from.
 */
export function playerForAccount(account: string): ImportUser | null {
  const row = db
    .prepare(`SELECT id, username FROM users WHERE poe_account = ? COLLATE NOCASE`)
    .get(account.trim()) as ImportUser | undefined;
  return row ?? null;
}

export function planFor(userId: number, exported: PoeExport, token: string): ImportPlan {
  const rows: ImportRow[] = exported.characters.map((character) => {
    const found = matchesFor(userId, character.name);
    const single = found.length === 1 ? found[0] : null;
    const league = single ? getLeague(single.game, single.league) : null;
    return {
      name: character.name,
      level: character.level,
      className: character.baseClass,
      ascendancy: character.ascendancy,
      currentLeague: character.league,
      action: found.length === 0 ? "create" : found.length === 1 ? "update" : "ambiguous",
      target: single
        ? {
            game: single.game,
            league: single.league,
            leagueTitle: league ? leagueTitle(league) : single.league,
            slug: single.slug,
          }
        : undefined,
      matches: found.length > 1 ? found.length : undefined,
      // Only offered where the collector called it certain, which means the
      // character is still in a league that has not ended. Anything weaker is
      // a prior, not a fact, and is left for the owner to answer.
      suggested: character.originConfidence === "certain" ? character.originPatch : null,
      confidence: character.originConfidence,
    };
  });
  return { account: exported.account, generatedAt: exported.generatedAt, rows, token };
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

function uniqueSlug(userId: number, leagueId: number, base: string): string {
  const taken = db
    .prepare(`SELECT slug FROM characters WHERE user_id = ? AND league_id = ?`)
    .all(userId, leagueId)
    .map((row) => (row as { slug: string }).slug);
  if (!taken.includes(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/**
 * Apply an export to a player's characters, in one transaction.
 *
 * `include` decides which of the export's characters are touched at all, and
 * `leagueFor` answers the one question the export cannot: which league a
 * character the archive has never seen belongs in. Returning null skips it.
 * The unattended caller passes a `leagueFor` that always returns null, so a
 * scheduled run can only ever fill in characters that already exist — it never
 * guesses a league, and it never has to be watched.
 */
export function applyImport(
  user: ImportUser,
  exported: PoeExport,
  options: { include: (name: string) => boolean; leagueFor: (name: string) => string | null },
): ImportResult {
  const update = db.prepare(
    `UPDATE characters
        SET class_name = ?, ascendancy = ?, level = ?, main_skill = ?,
            data = ?, source_payload = ?, api_version = ?
      WHERE id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO characters
       (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, notes,
        played_minutes, is_favorite, pob_code, pob_url, data, parser_version, source_payload, api_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL, ?, 0, ?, ?)`,
  );

  let imported = 0;
  let created = 0;
  const written: string[] = [];
  const touched = new Set<string>();
  // A record with nothing to say writes "Unknown" rather than leaving a blank,
  // so that reads as absent — otherwise a real value would lose to a placeholder.
  const known = (value: string | null) => (value && value !== "Unknown" ? value : null);

  const run = db.transaction(() => {
    for (const character of exported.characters) {
      if (!options.include(character.name)) continue;
      const build = buildFromPoeExport(character, exported);
      const payload = JSON.stringify(storedPayload(character, exported));
      const data = JSON.stringify(build);
      const found = matchesFor(user.id, character.name);

      if (found.length === 1) {
        const existing = found[0];
        // Class, ascendancy and level come from the game itself and replace what
        // was written down. The main skill does not: the record names the build
        // — "golemancer corrupting fever exsanguinate" — where the export can
        // only name the gem with the most supports linked to it.
        update.run(
          character.baseClass ?? known(existing.class_name) ?? "Unknown",
          character.ascendancy ?? known(existing.ascendancy),
          character.level,
          known(existing.main_skill) ?? build.mainSkill ?? null,
          data,
          payload,
          POE_API_VERSION,
          existing.id,
        );
        imported += 1;
        written.push(character.name);
        touched.add(`${existing.game}/${existing.league}`);
        continue;
      }
      if (found.length > 1) continue;

      const slug = options.leagueFor(character.name);
      if (!slug) continue;
      const league = getLeague("poe1", slug);
      if (!league) continue;
      insert.run(
        user.id,
        league.id,
        uniqueSlug(user.id, league.id, slugify(character.name)),
        character.name,
        character.baseClass ?? "Unknown",
        character.ascendancy,
        character.level,
        build.mainSkill ?? null,
        data,
        payload,
        POE_API_VERSION,
      );
      created += 1;
      imported += 1;
      written.push(character.name);
      touched.add(`${league.game}/${league.slug}`);
    }
  });
  run();

  return { imported, created, written, touched };
}
