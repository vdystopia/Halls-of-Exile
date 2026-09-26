import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ACCOUNT_SEED } from "./accounts";
import { LEAGUE_SEED, orderLeagueSeed } from "./leagues";
import { PARSER_VERSION, parsePob } from "./games/poe1/pob";
import { exportVersion, isExportSource, rebuildFromStored } from "./games/exports";
import { POE_API_VERSION } from "./games/poe1/poe-api";
import { composePoe2Build } from "./games/builds";
import { POE2_PARSER_VERSION } from "./games/poe2/pob";
import { POE2_SITE_VERSION, type StoredPoe2Export } from "./games/poe2/site-export";
import type { BuildData } from "./types";
import type { GameId } from "./games/types";

const DEFAULT_PATH = path.join(process.cwd(), "data", "archive.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL COLLATE NOCASE UNIQUE,
  tagline    TEXT,
  poe_account TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A player's picture, kept in its own table so listing players never reads the
-- image bytes. In the database rather than on disk so a backup holds it.
CREATE TABLE IF NOT EXISTS avatars (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image      BLOB NOT NULL,
  type       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- The picture's strongest colour as "#rrggbb", read from it once (see
  -- avatars.ts); null until it has been, or when the picture has no colour.
  accent     TEXT
);

CREATE TABLE IF NOT EXISTS leagues (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  game            TEXT NOT NULL DEFAULT 'poe1',
  slug            TEXT NOT NULL,
  patch           TEXT,
  kind            TEXT,
  parent          TEXT,
  name            TEXT NOT NULL,
  expansion       TEXT,
  start_date      TEXT,
  end_date        TEXT,
  end_date_estimated INTEGER NOT NULL DEFAULT 0,
  dates_uncertain INTEGER NOT NULL DEFAULT 0,
  challenge_total INTEGER,
  is_custom       INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game, slug)
);

CREATE TABLE IF NOT EXISTS league_records (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id            INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  challenges_completed INTEGER,
  challenge_total      INTEGER,
  notes                TEXT,
  UNIQUE (user_id, league_id)
);

CREATE TABLE IF NOT EXISTS characters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  league_id    INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  class_name   TEXT NOT NULL,
  ascendancy   TEXT,
  level        INTEGER,
  main_skill   TEXT,
  skill_gem    TEXT,
  league_modifiers TEXT,
  notes        TEXT,
  played_minutes INTEGER,
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  -- Marked failed in the owner's record; filterable, never hidden by default.
  failed       INTEGER NOT NULL DEFAULT 0,
  pob_code     TEXT,
  pob_url      TEXT,
  data         TEXT NOT NULL DEFAULT '{}',
  parser_version INTEGER NOT NULL DEFAULT 0,
  source_payload TEXT,
  api_version  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, league_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_league ON characters(user_id, league_id);
`;

/**
 * Add columns introduced after a database was first created. SQLite has no
 * "ADD COLUMN IF NOT EXISTS", and archives are long-lived, so every new column
 * is declared here as well as in the schema above.
 */
function migrate(db: Database.Database) {
  // Every statement is IF NOT EXISTS, so this only adds what is missing — a
  // table added since the connection opened, which a hot reload would
  // otherwise leave out until the dev server restarted.
  db.exec(SCHEMA);
  const additions: [string, string, string][] = [
    ["leagues", "end_date_estimated", "INTEGER NOT NULL DEFAULT 0"],
    ["characters", "played_minutes", "INTEGER"],
    ["characters", "parser_version", "INTEGER NOT NULL DEFAULT 0"],
    ["leagues", "game", "TEXT NOT NULL DEFAULT 'poe1'"],
    ["leagues", "slug", "TEXT NOT NULL DEFAULT ''"],
    ["leagues", "kind", "TEXT"],
    ["leagues", "parent", "TEXT"],
    ["leagues", "dates_uncertain", "INTEGER NOT NULL DEFAULT 0"],
    ["characters", "source_payload", "TEXT"],
    ["characters", "api_version", "INTEGER NOT NULL DEFAULT 0"],
    ["users", "poe_account", "TEXT"],
    ["characters", "skill_gem", "TEXT"],
    ["characters", "league_modifiers", "TEXT"],
    ["avatars", "accent", "TEXT"],
    ["characters", "failed", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [table, column, definition] of additions) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((existing) => existing.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  // A player goes by one name, the username. The display name beside it was
  // dropped on 2026-09-26; an archive from before then still has the column,
  // NOT NULL, and every insert would fail against it until it goes.
  const removals: [string, string][] = [["users", "first_name"]];
  for (const [table, column] of removals) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((existing) => existing.name === column)) continue;
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
  widenLeagueUniqueness(db);
  backfillAccounts(db);
  reparseStaleBuilds(db);
}

/**
 * Give a player their Path of Exile account without anyone typing it in.
 *
 * Two sources, in order. `ACCOUNT_SEED` names the accounts this archive's own
 * players play on, which are public and so belong in code where they need no
 * setup step. After that, every character imported from an account export
 * stores the payload it came from and that payload names the account, so a
 * player who has imported anything has already told the archive which account
 * they play on — asking again is asking them to re-enter a fact the database
 * can see. That second source also covers the player who only ever used the
 * upload page, since that route never asked for an account at all.
 *
 * Both only ever fill a blank: an account set by hand is never second-guessed,
 * and an account another player already claims is left alone rather than
 * duplicated. Where a player's characters name more than one account, the one
 * that appears most often wins.
 */
function backfillAccounts(db: Database.Database) {
  const free = db.prepare(`SELECT 1 FROM users WHERE poe_account = ? COLLATE NOCASE AND id <> ?`);
  const claim = db.prepare(`UPDATE users SET poe_account = ? WHERE id = ?`);

  const blank = db.prepare(
    `SELECT id FROM users WHERE username = ? COLLATE NOCASE AND (poe_account IS NULL OR poe_account = '')`,
  );
  const seeded = db.transaction(() => {
    for (const [username, account] of Object.entries(ACCOUNT_SEED)) {
      const user = blank.get(username) as { id: number } | undefined;
      if (!user || free.get(account, user.id)) continue;
      claim.run(account, user.id);
    }
  });
  seeded();

  const found = db
    .prepare(
      `SELECT c.user_id AS userId, json_extract(c.source_payload, '$.account') AS account, count(*) AS seen
         FROM characters c
         JOIN users u ON u.id = c.user_id
        WHERE c.source_payload IS NOT NULL
          AND (u.poe_account IS NULL OR u.poe_account = '')
          AND account IS NOT NULL AND account <> ''
        GROUP BY c.user_id, account
        ORDER BY c.user_id, seen DESC`,
    )
    .all() as { userId: number; account: string; seen: number }[];
  if (found.length === 0) return;

  const claimed = new Set<number>();
  const derived = db.transaction(() => {
    for (const row of found) {
      if (claimed.has(row.userId)) continue;
      if (free.get(row.account, row.userId)) continue;
      claim.run(row.account, row.userId);
      claimed.add(row.userId);
    }
  });
  derived();
}

/**
 * The catalogue key has widened twice. `UNIQUE (patch)` broke when Path of
 * Exile 2 arrived, since both games ship a 1.0; `UNIQUE (game, patch)` broke
 * when events arrived, since a gauntlet run inside 3.25 cannot claim that patch
 * number and two events can share one. The key is the slug.
 *
 * SQLite cannot alter a constraint, so the table is rebuilt — the only
 * migration here that can lose data, which is why it runs in one transaction
 * and copies by name rather than by column position.
 */
function widenLeagueUniqueness(db: Database.Database) {
  const columns = (db.prepare(`PRAGMA table_info(leagues)`).all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes("slug")) return;

  // Anything migrated in from before slugs existed keys on its patch.
  db.prepare(`UPDATE leagues SET slug = patch WHERE slug IS NULL OR slug = ''`).run();

  const indexes = db.prepare(`PRAGMA index_list(leagues)`).all() as { name: string; unique: number }[];
  const keyed = indexes.some((index) => {
    if (!index.unique) return false;
    const on = (db.prepare(`PRAGMA index_info(${JSON.stringify(index.name)})`).all() as { name: string }[])
      .map((c) => c.name)
      .join(",");
    return on === "game,slug";
  });
  if (keyed) return;

  // Foreign keys off while the table is dropped, or the characters and league
  // records pointing at it would be cascaded away. Must sit outside the
  // transaction: SQLite ignores the pragma inside one.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE leagues_rebuilt (
          id              INTEGER PRIMARY KEY,
          game            TEXT NOT NULL DEFAULT 'poe1',
          slug            TEXT NOT NULL,
          patch           TEXT,
          kind            TEXT,
          parent          TEXT,
          name            TEXT NOT NULL,
          expansion       TEXT,
          start_date      TEXT,
          end_date        TEXT,
          end_date_estimated INTEGER NOT NULL DEFAULT 0,
          dates_uncertain INTEGER NOT NULL DEFAULT 0,
          challenge_total INTEGER,
          is_custom       INTEGER NOT NULL DEFAULT 0,
          sort_order      INTEGER NOT NULL DEFAULT 0,
          UNIQUE (game, slug)
        );
        INSERT INTO leagues_rebuilt
          (id, game, slug, patch, kind, parent, name, expansion, start_date, end_date,
           end_date_estimated, dates_uncertain, challenge_total, is_custom, sort_order)
        SELECT id, game, slug, patch, kind, parent, name, expansion, start_date, end_date,
               end_date_estimated, dates_uncertain, challenge_total, is_custom, sort_order
        FROM leagues;
        DROP TABLE leagues;
        ALTER TABLE leagues_rebuilt RENAME TO leagues;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

/**
 * Re-derive characters whose stored build predates the code that made it. The
 * source is kept alongside the parsed JSON precisely so this is possible;
 * without it, a fix would only ever reach characters imported afterwards, and
 * the archive would keep rendering whatever the parser believed on import day.
 *
 * Each source carries its own version, in its own column, because the two move
 * independently: a Path of Building fix must not silently mark an API import
 * current, and the reverse. A character with no source cannot be re-derived, so
 * it is only marked current, and a source that no longer reads keeps the build
 * it has rather than losing it.
 */
function reparseStaleBuilds(db: Database.Database) {
  const stale = db
    .prepare(
      `SELECT c.id, c.pob_code, c.source_payload, c.parser_version, c.api_version, l.game,
              json_extract(c.data, '$.source') AS source
         FROM characters c JOIN leagues l ON l.id = c.league_id
        WHERE (l.game = 'poe2' AND (c.parser_version < ? OR c.api_version < ?))
           OR (l.game <> 'poe2' AND (c.parser_version < ? OR c.api_version < ?))`,
    )
    // Each game's parser and each export mapper has its own version, and a row
    // is fetched against its own game's: against the highest of the two, every
    // row of the game with the lower one was re-read on every boot.
    .all(POE2_PARSER_VERSION, POE2_SITE_VERSION, PARSER_VERSION, POE_API_VERSION) as {
    id: number;
    game: string;
    pob_code: string | null;
    source_payload: string | null;
    parser_version: number;
    api_version: number;
    source: string | null;
  }[];
  if (stale.length === 0) return;

  const storePob = db.prepare(`UPDATE characters SET data = ?, parser_version = ? WHERE id = ?`);
  const markPob = db.prepare(`UPDATE characters SET parser_version = ? WHERE id = ?`);
  const storeApi = db.prepare(`UPDATE characters SET data = ?, api_version = ? WHERE id = ?`);
  const markApi = db.prepare(`UPDATE characters SET api_version = ? WHERE id = ?`);

  const storeBoth = db.prepare(`UPDATE characters SET data = ?, parser_version = ?, api_version = ? WHERE id = ?`);
  const markBoth = db.prepare(`UPDATE characters SET parser_version = ?, api_version = ? WHERE id = ?`);

  const run = db.transaction(() => {
    for (const row of stale) {
      // Path of Exile 2 takes its code over its export whichever was applied
      // last (see `composePoe2Build`), so a stale version on either side
      // rebuilds from the sources the row has, against that game's own versions. It never reaches
      // the Path of Exile 1 parser below, which would misread its code.
      if (row.game === "poe2") {
        const codeStale = Boolean(row.pob_code) && row.parser_version < POE2_PARSER_VERSION;
        const siteStale = Boolean(row.source_payload) && row.api_version < POE2_SITE_VERSION;
        let composed: BuildData | null = null;
        if (codeStale || siteStale) {
          let site: StoredPoe2Export | null = null;
          try {
            site = row.source_payload ? (JSON.parse(row.source_payload) as StoredPoe2Export) : null;
            composed = composePoe2Build(row.pob_code, site);
          } catch {
            // A code that no longer reads keeps the build it made. A build the
            // site's export made is still rebuilt from that export, or a mapper
            // fix would never reach a row that also holds an unreadable code.
            if (row.source === "poe2-site" && site) {
              try {
                composed = composePoe2Build(null, site);
              } catch {
                composed = null;
              }
            }
          }
        }
        // Both versions are stamped current whatever the row holds, so a row
        // with nothing to re-derive — typed in by hand, or from the atlas — is
        // read once and not again on every boot.
        if (composed) storeBoth.run(JSON.stringify(composed), POE2_PARSER_VERSION, POE2_SITE_VERSION, row.id);
        else markBoth.run(POE2_PARSER_VERSION, POE2_SITE_VERSION, row.id);
        continue;
      }
      // A character can hold both a share code and an export payload — imported
      // from Path of Building, then filled in from the game. Whichever produced
      // the build it is showing is the one allowed to rewrite it; the other is
      // only brought up to date so it stops being re-read every boot.
      const fromApi = isExportSource(row.source);
      const apiTarget = exportVersion(row.source);
      if (row.parser_version < PARSER_VERSION) {
        if (!row.pob_code || fromApi) markPob.run(PARSER_VERSION, row.id);
        else {
          try {
            storePob.run(JSON.stringify(parsePob(row.pob_code)), PARSER_VERSION, row.id);
          } catch {
            markPob.run(PARSER_VERSION, row.id);
          }
        }
      }
      if (row.api_version < apiTarget) {
        if (!row.source_payload || !fromApi) markApi.run(apiTarget, row.id);
        else {
          try {
            storeApi.run(JSON.stringify(rebuildFromStored(JSON.parse(row.source_payload))), apiTarget, row.id);
          } catch {
            markApi.run(apiTarget, row.id);
          }
        }
      }
    }
  });
  run();
}

function syncLeagueCatalogue(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO leagues
      (game, slug, patch, kind, parent, name, expansion, start_date, end_date, end_date_estimated,
       dates_uncertain, challenge_total, is_custom, sort_order)
    VALUES
      (@game, @slug, @patch, @kind, @parent, @name, @expansion, @startDate, @endDate, @endDateEstimated,
       @datesUncertain, @challengeTotal, 0, @sortOrder)
    ON CONFLICT(game, slug) DO UPDATE SET
      patch              = excluded.patch,
      kind               = excluded.kind,
      parent             = excluded.parent,
      name               = excluded.name,
      expansion          = excluded.expansion,
      start_date         = excluded.start_date,
      end_date           = excluded.end_date,
      end_date_estimated = excluded.end_date_estimated,
      dates_uncertain    = excluded.dates_uncertain,
      challenge_total    = excluded.challenge_total,
      is_custom          = 0
  `);
  // A league someone added by hand that the catalogue has since gained — same
  // game, same slug, which for a hand-added league is its patch — is the same
  // league. The catalogue's row takes it over, characters and all: skipping it,
  // as this used to, left the official league silently missing for good.

  // A row dropped from the seed leaves the archive too, as long as nothing is
  // filed under it — the catalogue is code-owned, so a stale row would otherwise
  // outlive the code that put it there. A league holding characters is kept
  // whatever the seed says, and a hand-added league is never touched.
  const prune = db.prepare(`
    DELETE FROM leagues
    WHERE is_custom = 0
      AND game || '/' || slug NOT IN (SELECT value FROM json_each(?))
      AND id NOT IN (SELECT league_id FROM characters)
      AND id NOT IN (SELECT league_id FROM league_records)
  `);

  const run = db.transaction(() => {
    prune.run(JSON.stringify(LEAGUE_SEED.map((league) => `${league.game}/${league.slug}`)));
    for (const league of LEAGUE_SEED) {
      insert.run({
        game: league.game,
        slug: league.slug,
        patch: league.patch,
        kind: league.kind ?? null,
        parent: league.parent ?? null,
        name: league.name,
        expansion: league.expansion ?? null,
        startDate: league.startDate,
        endDate: league.endDate,
        endDateEstimated: league.endDateEstimated ? 1 : 0,
        datesUncertain: league.datesUncertain ? 1 : 0,
        challengeTotal: league.challengeTotal,
        sortOrder: 0,
      });
    }
    orderLeagues(db);
  });
  run();
}

/**
 * Display order by date across both games and every row, hand-added ones
 * included: those used to be given the highest number when added, and stayed
 * pinned above everything as the newest league whatever their dates said.
 */
function orderLeagues(db: Database.Database) {
  const custom = (
    db.prepare(`SELECT game, slug, patch, name, start_date FROM leagues WHERE is_custom = 1`).all() as {
      game: GameId;
      slug: string;
      patch: string | null;
      name: string;
      start_date: string | null;
    }[]
  ).map((row) => ({
    game: row.game,
    slug: row.slug,
    patch: row.patch,
    name: row.name,
    startDate: row.start_date,
    endDate: null,
    challengeTotal: null,
  }));
  const setOrder = db.prepare(`UPDATE leagues SET sort_order = ? WHERE game = ? AND slug = ?`);
  orderLeagueSeed([...LEAGUE_SEED, ...custom]).forEach((league, index) => {
    setOrder.run((index + 1) * 10, league.game, league.slug);
  });
}

/** Re-number the display order after a hand-added league is added or edited. */
export function resyncLeagueOrder(): void {
  orderLeagues(connection());
}

/**
 * A player's challenge total equal to the league's is not an override. The form
 * used to be pre-filled with the league's figure, so every save stored it and
 * froze it against later corrections to the catalogue. Run after the catalogue
 * sync, so it compares against the current figures; an override that happens to
 * match changes nothing when cleared.
 */
function clearRedundantTotals(db: Database.Database) {
  db.prepare(
    `UPDATE league_records SET challenge_total = NULL
      WHERE challenge_total IS NOT NULL
        AND challenge_total = (SELECT challenge_total FROM leagues WHERE leagues.id = league_records.league_id)`,
  ).run();
}

function create(): Database.Database {
  const file = process.env.ARCHIVE_DB ?? DEFAULT_PATH;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const connection = new Database(file);
  // The journal mode is stored in the file, so it only has to be set once, but
  // setting it takes a brief exclusive lock. If something else holds that lock
  // right now, carry on rather than refusing to start.
  try {
    connection.pragma("journal_mode = WAL");
  } catch (error) {
    if (!(error instanceof Error) || !/locked|busy/i.test(error.message)) throw error;
  }
  connection.pragma("foreign_keys = ON");

  migrate(connection);
  syncLeagueCatalogue(connection);
  clearRedundantTotals(connection);
  return connection;
}

// One connection per process, reused across dev-server hot reloads.
const globalForDb = globalThis as unknown as { __hallsDb?: Database.Database };

/**
 * Reset on every module evaluation, which in the dev server means every hot
 * reload. The connection itself is cached on globalThis and deliberately
 * survives reloads — but that used to mean a `git pull` adding a column left a
 * running dev server querying a database it had never migrated, failing with
 * "no such column". Re-running the migration and the catalogue sync once per
 * module evaluation fixes that; both are idempotent and cost nothing in
 * production, where the module is evaluated once.
 */
let schemaChecked = false;

/** Bring an already-open database up to date with the code's schema. */
export function ensureSchema(instance: Database.Database): void {
  migrate(instance);
  syncLeagueCatalogue(instance);
  clearRedundantTotals(instance);
  schemaChecked = true;
}

function connection(): Database.Database {
  if (!globalForDb.__hallsDb) {
    globalForDb.__hallsDb = create();
    schemaChecked = true;
  } else if (!schemaChecked) {
    ensureSchema(globalForDb.__hallsDb);
  }
  return globalForDb.__hallsDb;
}

/**
 * The database opens on first use, never at import time.
 *
 * `next build` imports every route module to collect its configuration, and it
 * does that across as many worker processes as the machine has cores. Opening
 * SQLite eagerly meant a dozen processes raced to set `journal_mode = WAL`,
 * which needs an exclusive lock; the loser failed the build with SQLITE_BUSY on
 * machines with enough cores. Going through this proxy keeps every call site
 * unchanged while making it impossible to touch the file just by importing.
 */
export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, property) {
    const instance = connection();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  set(_target, property, value) {
    return Reflect.set(connection(), property, value);
  },
  has(_target, property) {
    return property in connection();
  },
});
