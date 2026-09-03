/**
 * Consistent backup of the archive while the server keeps running.
 *
 * SQLite runs in WAL mode here, so copying archive.db on its own can miss
 * committed data sitting in the -wal file. This uses SQLite's online backup
 * API, which always produces a single self-contained file.
 *
 *   node scripts/backup.mjs [destination]
 *
 * In Docker:
 *   docker compose exec halls node scripts/backup.mjs /data/backups
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

fs.mkdirSync(path.dirname(destination), { recursive: true });

const db = new Database(source, { readonly: true });
await db.backup(destination);
db.close();

const { size } = fs.statSync(destination);
console.log(`${destination} (${(size / 1024 / 1024).toFixed(2)} MB)`);
