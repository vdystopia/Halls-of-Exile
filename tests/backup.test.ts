import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const script = path.join(__dirname, "..", "scripts", "backup.mjs");
const run = (source: string, target: string) =>
  spawnSync(process.execPath, [script, target], { env: { ...process.env, ARCHIVE_DB: source }, encoding: "utf8" });

function liveArchive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "halls-backup-"));
  const file = path.join(dir, "archive.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  // Keep everything in the -wal file: this is the data a plain file copy misses.
  db.pragma("wal_autocheckpoint = 0");
  db.exec("CREATE TABLE t (x INTEGER)");
  return { dir, file, db };
}

/**
 * The nightly host job snapshots the data directory right after this runs, so
 * the file it names must be complete at every instant: data still in the WAL
 * included, no -wal or -shm needed beside it, and an existing copy replaced
 * whole rather than overwritten in place.
 */
test("a named backup is one self-contained file holding data still in the WAL", () => {
  const { dir, file, db } = liveArchive();
  db.prepare("INSERT INTO t VALUES (1), (2), (3)").run();
  assert.ok(fs.statSync(`${file}-wal`).size > 0, "the rows should still be in the WAL");

  const target = path.join(dir, "backups", "archive-latest.db");
  const first = run(file, target);
  assert.equal(first.status, 0, first.stderr);

  db.prepare("INSERT INTO t VALUES (4)").run();
  const second = run(file, target);
  assert.equal(second.status, 0, second.stderr);
  db.close();

  // Only the one file: no .partial, and no -wal/-shm it depends on.
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ["archive-latest.db"]);
  const copy = new Database(target, { readonly: true });
  assert.equal((copy.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number }).n, 4);
  assert.equal(copy.pragma("journal_mode", { simple: true }), "delete");
  copy.close();
});

test("a directory target gets a new timestamped file", () => {
  const { dir, file, db } = liveArchive();
  db.close();
  const result = run(file, path.join(dir, "backups"));
  assert.equal(result.status, 0, result.stderr);
  const files = fs.readdirSync(path.join(dir, "backups"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^archive-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/);
});

test("a failed backup exits non-zero and leaves the previous copy alone", () => {
  const { dir, file, db } = liveArchive();
  db.close();
  const target = path.join(dir, "archive-latest.db.d", "archive-latest.db");
  assert.equal(run(file, target).status, 0);
  const before = fs.readFileSync(target);

  const missing = run(path.join(dir, "nope.db"), target);
  assert.notEqual(missing.status, 0);
  assert.deepEqual(fs.readFileSync(target), before);
});
