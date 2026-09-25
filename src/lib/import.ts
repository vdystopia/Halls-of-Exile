import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db } from "./db";
import { leagueTitle } from "./format";
import {
  buildFromExport,
  exportVersion,
  PoeExportError,
  readAccountExport,
  storedPayloadFor,
  type AccountExport,
} from "./games/exports";
import type { GameId } from "./games/types";
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
  /**
   * The archived character already has a build. Overwriting it replaces what
   * was archived with what the account holds today, which is not the same
   * thing — so it never happens without being asked for by name.
   */
  finalised?: boolean;
  /** How many archived characters share the name, when more than one does. */
  matches?: number;
  /** The exporter's guess at the origin league, and how sure it was of it. */
  suggested?: string | null;
  confidence?: string | null;
  /**
   * What the skill field starts out holding: the skill already archived where
   * there is one, and the exporter's guess where there is not. The guess is the
   * active gem with the most supports linked to it, which is right often enough
   * to be worth offering and wrong often enough that it is only ever a default.
   */
  skill?: string | null;
  /** True where the field is showing a guess rather than something recorded. */
  skillGuessed?: boolean;
};

export type ImportPlan = {
  /** Which game the export is from; rows only ever match that game's characters. */
  game: GameId;
  account: string;
  /** Characters in the file that could not be read, named so the page can say so. */
  skippedCharacters: string[];
  generatedAt: string | null;
  rows: ImportRow[];
  /** The staged upload this plan was read from; see `stageExport`. */
  token: string;
};

export type ImportResult = {
  imported: number;
  created: number;
  /** Characters that already held a build and were deliberately left alone. */
  skipped: string[];
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
  skill_gem: string | null;
  /** 1 once a build has come from somewhere — a share code or an export. */
  imported: number;
};

export type ImportUser = { id: number; username: string };

/**
 * Archived characters with this name, in this game only. Names are unique per
 * realm, not across games, and a Path of Exile 2 export must never fill or skip
 * a Path of Exile 1 character that happens to share a name.
 */
function matchesFor(userId: number, game: GameId, name: string): MatchRow[] {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.class_name, c.ascendancy, c.main_skill, c.skill_gem, l.game, l.slug AS league,
              (c.pob_code IS NOT NULL OR c.source_payload IS NOT NULL) AS imported
         FROM characters c JOIN leagues l ON l.id = c.league_id
        WHERE c.user_id = ? AND l.game = ? AND c.name = ? COLLATE NOCASE
        ORDER BY l.sort_order`,
    )
    .all(userId, game, name) as MatchRow[];
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

export function readStaged(token: string): AccountExport {
  // The token names a file, so it must not be able to name any other one.
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new PoeExportError("That upload is no longer here — choose it again.");
  const file = path.join(STAGE_DIR, `${token}.json`);
  if (!fs.existsSync(file)) throw new PoeExportError("That upload is no longer here — choose it again.");
  return readAccountExport(fs.readFileSync(file, "utf8"));
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

/**
 * Record the account an export came from, if the player has none yet.
 *
 * The counterpart to `backfillAccounts`, which does the same thing on boot from
 * payloads already stored: this catches the first import, before there is any
 * payload to read it out of. So handing an account to `collect.ps1` once is
 * enough — the archive keeps it, and the flag is never needed again.
 *
 * It only ever fills a blank, and never takes an account another player holds:
 * posting one player's export under another's name must not quietly move it.
 */
export function rememberAccount(userId: number, account: string): void {
  const name = account.trim();
  if (!name) return;
  const user = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(userId) as
    | { poe_account: string | null }
    | undefined;
  if (!user || user.poe_account) return;
  if (db.prepare(`SELECT 1 FROM users WHERE poe_account = ? COLLATE NOCASE AND id <> ?`).get(name, userId)) return;
  db.prepare(`UPDATE users SET poe_account = ? WHERE id = ?`).run(name, userId);
}

export function planFor(userId: number, exported: AccountExport, token: string): ImportPlan {
  const rows: ImportRow[] = exported.characters.map((character) => {
    const found = matchesFor(userId, exported.game, character.name);
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
      finalised: single ? single.imported === 1 : undefined,
      matches: found.length > 1 ? found.length : undefined,
      // A league is only ever chosen for a character being created, so the
      // guess is only offered for one. Offering it on a matched row put a tick
      // in the box of a character that was already archived.
      //
      // Only offered where the collector called it certain, which means the
      // character is still in a league that has not ended. Anything weaker is
      // a prior, not a fact, and is left for the owner to answer.
      suggested:
        found.length === 0 && character.originConfidence === "certain" ? character.originPatch : null,
      confidence: character.originConfidence,
      // What is already recorded wins over the guess, so opening the page and
      // importing without touching anything cannot quietly replace an answer
      // someone gave with one the exporter reached for.
      skill: single?.skill_gem ?? character.mainSkill,
      skillGuessed: !single?.skill_gem && Boolean(character.mainSkill),
    };
  });
  return {
    game: exported.game,
    account: exported.account,
    skippedCharacters: exported.skippedCharacters,
    generatedAt: exported.generatedAt,
    rows,
    token,
  };
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
 * An archived character is a record of what a character *was*. The account is a
 * record of what it *is*, and for anything but the current league those are not
 * the same thing: gear gets stripped for the next build, gems get pulled, trees
 * get respecced, and a character that was finished two years ago now reads as
 * an empty shell. So once a character holds a build, nothing writes over it
 * again unless it is asked for by name — `overwrite` is per character, and the
 * unattended caller has none.
 *
 * That leaves three outcomes. A matched character with nothing in it is filled.
 * A matched character that already holds a build is skipped and named. A
 * character the archive has never seen needs a league, which is the other thing
 * an export cannot answer, so `leagueFor` decides — returning null skips it.
 */
export function applyImport(
  user: ImportUser,
  exported: AccountExport,
  options: {
    include: (name: string) => boolean;
    leagueFor: (name: string) => string | null;
    /** Replace a character that already holds a build. Off unless asked. */
    overwrite?: (name: string) => boolean;
    /**
     * The skill a person chose for this character on the upload page, which is
     * the answer this archive prefers over any derived one — that field is the
     * primary source, and `skill_gem` is what draws the gem beside the name.
     *
     * Absent for the unattended caller, which has nobody to ask, so an
     * automated import keeps the old behaviour: fill a blank from the
     * exporter's guess and never touch one that is already answered.
     */
    skillFor?: (name: string) => string | null;
  },
): ImportResult {
  const update = db.prepare(
    `UPDATE characters
        SET class_name = ?, ascendancy = ?, level = ?, main_skill = ?, skill_gem = ?,
            data = ?, source_payload = ?, api_version = ?
      WHERE id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO characters
       (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, skill_gem, notes,
        played_minutes, is_favorite, pob_code, pob_url, data, parser_version, source_payload, api_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL, ?, 0, ?, ?)`,
  );

  let imported = 0;
  let created = 0;
  const skipped: string[] = [];
  const written: string[] = [];
  const touched = new Set<string>();
  // A record with nothing to say writes "Unknown" rather than leaving a blank,
  // so that reads as absent — otherwise a real value would lose to a placeholder.
  const known = (value: string | null) => (value && value !== "Unknown" ? value : null);

  const run = db.transaction(() => {
    for (const character of exported.characters) {
      if (!options.include(character.name)) continue;
      const build = buildFromExport(character, exported);
      const payload = JSON.stringify(storedPayloadFor(character, exported));
      const data = JSON.stringify(build);
      const version = exportVersion(build.source);
      const found = matchesFor(user.id, exported.game, character.name);

      if (found.length === 1) {
        const existing = found[0];
        // The rule above: a character that already holds a build is left exactly
        // as it was archived. Only being named overrides that.
        if (existing.imported === 1 && !options.overwrite?.(character.name)) {
          skipped.push(character.name);
          continue;
        }
        // Class, ascendancy and level come from the game itself and replace what
        // was written down. The main skill does not: the record names the build
        // — "golemancer corrupting fever exsanguinate" — where the export can
        // only name the gem with the most supports linked to it.
        //
        // That gem is exactly what `skill_gem` is for, though, so an export is
        // the natural way to fill one in: it names a real gem, spelled the way
        // the game spells it. It only ever fills a blank — an answer typed in by
        // hand is not a heuristic's to second-guess, the rule `rememberAccount`
        // already follows.
        // A skill chosen on the upload page is the one answer allowed to
        // replace what is already recorded: a person looked at the row and
        // said so. Without one this falls back to the old order — what is
        // there, then the guess — so an unattended import still only fills.
        const chosen = options.skillFor?.(character.name) ?? null;
        update.run(
          character.baseClass ?? known(existing.class_name) ?? "Unknown",
          character.ascendancy ?? known(existing.ascendancy),
          character.level,
          known(existing.main_skill) ?? build.mainSkill ?? null,
          chosen ?? known(existing.skill_gem) ?? build.mainSkill ?? null,
          data,
          payload,
          version,
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
      const league = getLeague(exported.game, slug);
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
        options.skillFor?.(character.name) ?? build.mainSkill ?? null,
        data,
        payload,
        version,
      );
      created += 1;
      imported += 1;
      written.push(character.name);
      touched.add(`${league.game}/${league.slug}`);
    }
  });
  run();

  return { imported, created, skipped, written, touched };
}
