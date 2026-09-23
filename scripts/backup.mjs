/**
 * Consistent backup of the archive while the server keeps running.
 *
 * SQLite runs in WAL mode here, so copying archive.db on its own can miss
 * committed data sitting in the -wal file. This uses SQLite's online backup
 * API, which always produces a single self-contained file.
 *
 *   node scripts/backup.mjs [destination]
 *
 * A destination ending in .db is that exact file, replaced atomically: the copy
 * is written beside it and renamed over it only once it has passed an integrity
 * check, so a host snapshot taken at any moment sees either the previous good
 * copy or the new one, never half of one. Anything else is a directory that
 * gets a new timestamped file.
 *
 * In Docker:
 *   docker compose exec halls node scripts/backup.mjs /data/backups
 *   docker compose exec halls node scripts/backup.mjs /data/backups/archive-latest.db
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const source = process.env.ARCHIVE_DB ?? path.join(process.cwd(), "data", "archive.db");
if (!fs.existsSync(source)) {
  console.error(`No archive found at ${source}`);
  process.exit(1);
}

const target = process.argv[2] ?? path.join(path.dirname(source), "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const isDirectory = !target.endsWith(".db");
const destination = isDirectory ? path.join(target, `archive-${stamp}.db`) : target;
const partial = `${destination}.partial`;

fs.mkdirSync(path.dirname(destination), { recursive: true });
const clearPartial = () => {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${partial}${suffix}`, { force: true });
};
clearPartial();

try {
  const db = new Database(source, { readonly: true });
  await db.backup(partial);
  db.close();

  // The copy inherits WAL mode from the live file, so opening it again would
  // leave -wal and -shm files beside it. Rollback-journal mode makes it the
  // single self-contained file a snapshot or a restore wants; the app switches
  // a restored copy back to WAL when it opens it.
  const copy = new Database(partial);
  copy.pragma("journal_mode = DELETE");
  const verdict = copy.pragma("integrity_check", { simple: true });
  copy.close();
  if (verdict !== "ok") throw new Error(`the copy failed its integrity check: ${verdict}`);

  fs.renameSync(partial, destination);
} catch (error) {
  clearPartial();
  console.error(`Backup failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

const { size } = fs.statSync(destination);
console.log(`${destination} (${(size / 1024 / 1024).toFixed(2)} MB)`);
