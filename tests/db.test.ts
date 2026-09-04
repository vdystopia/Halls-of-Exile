import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * `next build` imports every route module across one worker per core to collect
 * its configuration. When the connection was opened at import time, those
 * workers raced on the WAL lock and the build failed with SQLITE_BUSY. Importing
 * the query layer must not touch the file at all.
 */
test("importing the data layer does not open the database", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-")), "archive.db");
  process.env.ARCHIVE_DB = file;

  const queries = await import("../src/lib/queries");
  assert.equal(fs.existsSync(file), false, "importing queries created the database");

  // ...and it does open on the first real query.
  queries.listUsers();
  assert.equal(fs.existsSync(file), true, "the first query should open the database");
});

/**
 * Reproduces the dev-server failure. The connection is cached on globalThis and
 * survives hot reloads, so pulling a schema change left the running server
 * querying a database it had never migrated ("no such column: played_minutes").
 * On reload the module re-evaluates and repairs the open connection.
 */
test("a schema change is applied to a connection that is already open", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-reload-")), "archive.db");
  process.env.ARCHIVE_DB = file;

  const { db, ensureSchema } = await import("../src/lib/db");
  db.prepare("SELECT 1").get();
  const columns = () =>
    (db.prepare("PRAGMA table_info(characters)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(columns().includes("played_minutes"));

  // Stand in for a database created before the column existed.
  db.exec("ALTER TABLE characters DROP COLUMN played_minutes");
  assert.equal(columns().includes("played_minutes"), false);

  ensureSchema(db);
  assert.ok(columns().includes("played_minutes"), "the open connection was not brought up to date");
});
