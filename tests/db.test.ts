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

/**
 * A character's build is parsed once, on import, and stored as JSON. Every
 * parser fix therefore reached only later imports: the archive kept rendering
 * base percentiles as mods, with the implicit boundary they shifted, long after
 * the parser stopped reading them that way. The share code is stored beside the
 * build so a row can be brought forward instead, which is what `migrate()` does
 * for anything older than PARSER_VERSION.
 */
test("a build stored by an older parser is re-parsed from its share code", async () => {
  const zlib = await import("node:zlib");
  const { db, ensureSchema } = await import("../src/lib/db");
  const { PARSER_VERSION } = await import("../src/lib/games/poe1/pob");

  const xml = `<PathOfBuilding><Build level="84" className="Ranger" ascendClassName="Deadeye"/><Items><Item>Rarity: RARE
Blood Coat
Necrotic Armour
Evasion: 2974
EvasionBasePercentile: 0.9333
Intangibility: 33%
Item Level: 85
LevelReq: 84
Implicits: 1
11% of Physical Damage from Hits taken as Fire Damage
+467 to Evasion Rating</Item></Items></PathOfBuilding>`;
  const code = zlib.deflateSync(Buffer.from(xml)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

  // The connection is cached across tests, so every row here is named uniquely
  // rather than assuming an empty database.
  const user = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('reparse-tester', 'Test')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  // The build as the old parser left it: the percentile line read as a mod,
  // which pushed the item's real implicit into its explicits.
  const stale = {
    items: [
      {
        id: 1,
        rarity: "RARE",
        name: "Blood Coat",
        base: "Necrotic Armour",
        implicits: ["EvasionBasePercentile: 0.9333"],
        explicits: ["Intangibility: 33%", "11% of Physical Damage from Hits taken as Fire Damage"],
      },
    ],
  };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, pob_code, data, parser_version)
     VALUES (?, ?, 'stale', 'Stale', 'Ranger', ?, ?, 0)`,
  ).run(user, league.id, code, JSON.stringify(stale));

  ensureSchema(db);

  const row = db.prepare(`SELECT data, parser_version FROM characters WHERE slug = 'stale'`).get() as {
    data: string;
    parser_version: number;
  };
  const item = (JSON.parse(row.data) as { items: Record<string, unknown>[] }).items[0];
  assert.equal(row.parser_version, PARSER_VERSION);
  assert.deepEqual(item.implicits, ["11% of Physical Damage from Hits taken as Fire Damage"]);
  assert.deepEqual(item.explicits, ["+467 to Evasion Rating"]);
  assert.equal(item.intangibility, "33%");
});

/** A character with no share code cannot be re-parsed, and must not be lost. */
test("a character with no share code keeps the build it has", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");
  const { PARSER_VERSION } = await import("../src/lib/games/poe1/pob");

  const user = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('nocode-tester', 'Test')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  const kept = JSON.stringify({ items: [], className: "Witch" });
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, pob_code, data, parser_version)
     VALUES (?, ?, 'manual', 'Manual', 'Witch', NULL, ?, 0)`,
  ).run(user, league.id, kept);

  ensureSchema(db);

  const row = db.prepare(`SELECT data, parser_version FROM characters WHERE slug = 'manual'`).get() as {
    data: string;
    parser_version: number;
  };
  assert.equal(row.data, kept);
  assert.equal(row.parser_version, PARSER_VERSION, "it should not be re-checked on every boot");
});

/**
 * The catalogue is code-owned, so a row dropped from the seed leaves the
 * archive — unless something is filed under it. The Path of Exile 2
 * "unspecified league" was seeded and then removed once it was clear every such
 * character is a Path of Exile 1 one; without this, it would outlive the code.
 */
test("a league dropped from the seed is removed, unless it holds characters", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");

  const league = db
    .prepare(`INSERT INTO leagues (game, slug, patch, name, is_custom) VALUES ('poe2', 'gone', NULL, 'Gone', 0)`)
    .run().lastInsertRowid as number;
  const kept = db
    .prepare(`INSERT INTO leagues (game, slug, patch, name, is_custom) VALUES ('poe2', 'occupied', NULL, 'Occupied', 0)`)
    .run().lastInsertRowid as number;
  const custom = db
    .prepare(`INSERT INTO leagues (game, slug, patch, name, is_custom) VALUES ('poe2', 'mine', NULL, 'Hand added', 1)`)
    .run().lastInsertRowid as number;

  const user = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('prune-tester', 'Test')`)
    .run().lastInsertRowid as number;
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name) VALUES (?, ?, 'someone', 'Someone', 'Witch')`,
  ).run(user, kept);

  ensureSchema(db);

  const exists = (id: number) => Boolean(db.prepare(`SELECT 1 FROM leagues WHERE id = ?`).get(id));
  assert.equal(exists(league), false, "a seeded row that left the seed should be gone");
  assert.equal(exists(kept), true, "a league holding a character is kept whatever the seed says");
  assert.equal(exists(custom), true, "a hand-added league is never pruned");
});

/**
 * The archive's second source. A character imported from Grinding Gear Games'
 * own character endpoints keeps the payload it was built from, because the
 * endpoints are rate-limited and undocumented and a character that was deleted
 * cannot be fetched again at all — so a fix to the mapping has to be replayed
 * from what was stored rather than re-read from the game.
 */
test("a build stored by an older mapper is re-derived from its payload", async () => {
  const fsp = await import("node:fs");
  const { db, ensureSchema } = await import("../src/lib/db");
  const { POE_API_VERSION, readPoeExport, storedPayload } = await import("../src/lib/games/poe1/poe-api");

  const fixture = path.join(process.cwd(), "tests", "fixtures", "poe-export.json");
  const exported = readPoeExport(fsp.readFileSync(fixture, "utf8"));
  const entry = exported.characters.find((row) => row.name === "TheLocalVoid")!;
  const payload = JSON.stringify(storedPayload(entry, exported));

  const user = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('remap-tester', 'Test')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  // As an older mapper left it: the source is right, the build is empty.
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version,
                             source_payload, api_version)
     VALUES (?, ?, 'remap', 'TheLocalVoid', 'Witch', ?, ?, ?, 0)`,
  ).run(user, league.id, JSON.stringify({ source: "poe-api", items: [] }), 0, payload);

  ensureSchema(db);

  const row = db.prepare(`SELECT data, api_version FROM characters WHERE slug = 'remap'`).get() as {
    data: string;
    api_version: number;
  };
  const build = JSON.parse(row.data) as { items: unknown[]; slots: Record<string, number> };
  assert.equal(row.api_version, POE_API_VERSION);
  assert.ok(build.items.length > 10, "the build was not re-derived from the payload");
  assert.ok(build.slots["Body Armour"]);
});

/**
 * A character can hold both a share code and an export payload — imported from
 * Path of Building, then filled in from the game. Only whichever produced the
 * build it is showing may rewrite it, or a bump to one parser would silently
 * replace the other's work.
 */
test("a character with two sources is only rewritten by the one it came from", async () => {
  const zlib = await import("node:zlib");
  const { db, ensureSchema } = await import("../src/lib/db");
  const { PARSER_VERSION } = await import("../src/lib/games/poe1/pob");
  const { POE_API_VERSION } = await import("../src/lib/games/poe1/poe-api");

  const xml = `<PathOfBuilding><Build level="84" className="Ranger"/><Items><Item>Rarity: RARE
Blood Coat
Necrotic Armour</Item></Items></PathOfBuilding>`;
  const code = zlib.deflateSync(Buffer.from(xml)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

  const user = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('twosource-tester', 'Test')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  const build = JSON.stringify({ source: "poe-api", items: [], slots: {}, marker: "from the game" });
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, pob_code, data, parser_version,
                             source_payload, api_version)
     VALUES (?, ?, 'two', 'Two', 'Ranger', ?, ?, 0, NULL, ?)`,
  ).run(user, league.id, code, build, POE_API_VERSION);

  ensureSchema(db);

  const row = db.prepare(`SELECT data, parser_version FROM characters WHERE slug = 'two'`).get() as {
    data: string;
    parser_version: number;
  };
  assert.equal(row.data, build, "the share code overwrote a build that came from the game");
  assert.equal(row.parser_version, PARSER_VERSION, "it should not be re-checked on every boot");
});

/** Both new columns reach a database created before either existed. */
test("the import columns are added to a populated archive", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");
  const columns = () =>
    (db.prepare("PRAGMA table_info(characters)").all() as { name: string }[]).map((c) => c.name);

  const user = db
    .prepare(`INSERT INTO users (username, first_name) VALUES ('precolumn-tester', 'Test')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version)
     VALUES (?, ?, 'precolumn', 'Before', 'Witch', '{}', 0)`,
  ).run(user, league.id);

  db.exec("ALTER TABLE characters DROP COLUMN source_payload");
  db.exec("ALTER TABLE characters DROP COLUMN api_version");
  assert.equal(columns().includes("api_version"), false);

  ensureSchema(db);

  assert.ok(columns().includes("source_payload"));
  assert.ok(columns().includes("api_version"));
  const row = db.prepare(`SELECT name, api_version FROM characters WHERE slug = 'precolumn'`).get() as {
    name: string;
    api_version: number;
  };
  assert.equal(row.name, "Before", "the existing row did not survive the migration");
  const { POE_API_VERSION } = await import("../src/lib/games/poe1/poe-api");
  // It has no payload and never came from the game, so it is marked current
  // rather than being re-read on every boot.
  assert.equal(row.api_version, POE_API_VERSION);
});
