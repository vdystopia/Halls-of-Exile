import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { LEAGUE_SEED } from "./leagues";

const DEFAULT_PATH = path.join(process.cwd(), "data", "archive.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL COLLATE NOCASE UNIQUE,
  first_name TEXT NOT NULL,
  tagline    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leagues (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  patch           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  expansion       TEXT,
  start_date      TEXT,
  end_date        TEXT,
  end_date_estimated INTEGER NOT NULL DEFAULT 0,
  challenge_total INTEGER NOT NULL DEFAULT 40,
  is_custom       INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0
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
  notes        TEXT,
  played_minutes INTEGER,
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  pob_code     TEXT,
  pob_url      TEXT,
  data         TEXT NOT NULL DEFAULT '{}',
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
  const additions: [string, string, string][] = [
    ["leagues", "end_date_estimated", "INTEGER NOT NULL DEFAULT 0"],
    ["characters", "played_minutes", "INTEGER"],
  ];
  for (const [table, column, definition] of additions) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (columns.some((existing) => existing.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function syncLeagueCatalogue(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO leagues
      (patch, name, expansion, start_date, end_date, end_date_estimated, challenge_total, is_custom, sort_order)
    VALUES
      (@patch, @name, @expansion, @startDate, @endDate, @endDateEstimated, @challengeTotal, 0, @sortOrder)
    ON CONFLICT(patch) DO UPDATE SET
      name               = excluded.name,
      expansion          = excluded.expansion,
      start_date         = excluded.start_date,
      end_date           = excluded.end_date,
      end_date_estimated = excluded.end_date_estimated,
      challenge_total    = excluded.challenge_total,
      sort_order         = excluded.sort_order
    WHERE leagues.is_custom = 0
  `);
  const run = db.transaction(() => {
    LEAGUE_SEED.forEach((league, index) => {
      insert.run({
        patch: league.patch,
        name: league.name,
        expansion: league.expansion ?? null,
        startDate: league.startDate,
        endDate: league.endDate,
        endDateEstimated: league.endDateEstimated ? 1 : 0,
        challengeTotal: league.challengeTotal,
        sortOrder: (index + 1) * 10,
      });
    });
  });
  run();
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
  connection.exec(SCHEMA);
  migrate(connection);
  syncLeagueCatalogue(connection);
  return connection;
}

// One connection per process, reused across dev-server hot reloads.
const globalForDb = globalThis as unknown as { __hallsDb?: Database.Database };

function connection(): Database.Database {
  if (!globalForDb.__hallsDb) globalForDb.__hallsDb = create();
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
