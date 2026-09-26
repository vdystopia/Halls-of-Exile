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
    .prepare(`INSERT INTO users (username) VALUES ('reparse-tester')`)
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
    .prepare(`INSERT INTO users (username) VALUES ('nocode-tester')`)
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
    .prepare(`INSERT INTO users (username) VALUES ('prune-tester')`)
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
    .prepare(`INSERT INTO users (username) VALUES ('remap-tester')`)
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
    .prepare(`INSERT INTO users (username) VALUES ('twosource-tester')`)
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
    .prepare(`INSERT INTO users (username) VALUES ('precolumn-tester')`)
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

/**
 * A player goes by their username alone. The display name column was dropped,
 * and an archive from before then still carries it, NOT NULL — so until the
 * migration removes it, creating a player fails on a column nothing fills.
 */
test("the display name column is dropped from a populated archive, keeping its players", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");
  const columns = () => (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);

  db.exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
  const user = db
    .prepare(`INSERT INTO users (username, first_name, tagline) VALUES ('dropcolumn-tester', 'Leo', 'kept')`)
    .run().lastInsertRowid as number;
  assert.ok(columns().includes("first_name"));

  ensureSchema(db);

  assert.equal(columns().includes("first_name"), false, "the column should be gone");
  const row = db.prepare(`SELECT username, tagline FROM users WHERE id = ?`).get(user) as {
    username: string;
    tagline: string;
  };
  assert.deepEqual(row, { username: "dropcolumn-tester", tagline: "kept" }, "the player did not survive the migration");
  // And creating a player no longer needs a value for it.
  db.prepare(`INSERT INTO users (username) VALUES ('dropcolumn-after')`).run();
  assert.ok(db.prepare(`SELECT 1 FROM users WHERE username = 'dropcolumn-after'`).get());
});

/**
 * The account a player plays on is already in the archive: every character
 * imported from an export carries the payload it came from, and that payload
 * names it. Asking someone to type it into a form is asking them to re-enter a
 * fact the database can see — and the upload page never asked for one at all,
 * so a player who only used that route had no account set and was skipped by
 * the collector forever.
 */
test("a player's account is worked out from what they have already imported", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");

  const user = db
    .prepare(`INSERT INTO users (username) VALUES ('backfill-tester')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  const payload = (account: string) => JSON.stringify({ account, realm: "pc", character: { name: "x" } });
  for (const [index, account] of ["Someone#1234", "Someone#1234", "Stale#0000"].entries()) {
    db.prepare(
      `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version,
                               source_payload, api_version)
       VALUES (?, ?, ?, ?, 'Witch', '{"source":"poe-api"}', 0, ?, 1)`,
    ).run(user, league.id, `backfilled-${index}`, `Backfilled${index}`, payload(account));
  }

  ensureSchema(db);

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(user) as { poe_account: string };
  assert.equal(row.poe_account, "Someone#1234", "the account most of their characters came from");
});

/** An account typed in by hand is never second-guessed by the backfill. */
test("an account already set is left exactly as it was", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");

  const user = db
    .prepare(`INSERT INTO users (username, poe_account) VALUES ('byhand-tester', 'Chosen#1111')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version,
                             source_payload, api_version)
     VALUES (?, ?, 'byhand', 'ByHand', 'Witch', '{"source":"poe-api"}', 0, ?, 1)`,
  ).run(user, league.id, JSON.stringify({ account: "Different#2222" }));

  ensureSchema(db);

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(user) as { poe_account: string };
  assert.equal(row.poe_account, "Chosen#1111");
});

/** Two players cannot end up claiming one account, which would break matching. */
test("an account another player already holds is not duplicated", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");

  db.prepare(`INSERT INTO users (username, poe_account) VALUES ('owner-tester', 'Shared#3333')`).run();
  const other = db
    .prepare(`INSERT INTO users (username) VALUES ('other-tester')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version,
                             source_payload, api_version)
     VALUES (?, ?, 'shared', 'Shared', 'Witch', '{"source":"poe-api"}', 0, ?, 1)`,
  ).run(other, league.id, JSON.stringify({ account: "Shared#3333" }));

  ensureSchema(db);

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(other) as { poe_account: string | null };
  assert.equal(row.poe_account, null);
});

/**
 * Account names are public, so the archive's own two live in code and are
 * applied on boot. No setup step, nothing to type, nothing to forget — the
 * collector works the moment the container comes up.
 */
test("the archive's own accounts are set on boot", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");
  const { ACCOUNT_SEED } = await import("../src/lib/accounts");

  const [username, account] = Object.entries(ACCOUNT_SEED)[0];
  db.prepare(`DELETE FROM users WHERE username = ? COLLATE NOCASE`).run(username);
  // Earlier tests in this file import the fixture, whose payloads name this
  // same account, so a test user may already have derived it — and the seed
  // rightly refuses to give one account to two players.
  db.prepare(`UPDATE users SET poe_account = NULL WHERE poe_account = ? COLLATE NOCASE`).run(account);
  const id = db
    .prepare(`INSERT INTO users (username) VALUES (?)`)
    .run(username).lastInsertRowid as number;

  ensureSchema(db);

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(id) as { poe_account: string };
  assert.equal(row.poe_account, account);
});

/** An account changed under "Manage player" is not undone by the next boot. */
test("an account set by hand survives the seed", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");
  const { ACCOUNT_SEED } = await import("../src/lib/accounts");

  const [username] = Object.entries(ACCOUNT_SEED)[0];
  db.prepare(`DELETE FROM users WHERE username = ? COLLATE NOCASE`).run(username);
  const id = db
    .prepare(`INSERT INTO users (username, poe_account) VALUES (?, 'Changed#9999')`)
    .run(username).lastInsertRowid as number;

  ensureSchema(db);

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(id) as { poe_account: string };
  assert.equal(row.poe_account, "Changed#9999");
});

/** Every seeded account must be distinct, or two players would claim one. */
test("no two seeded players share an account", async () => {
  const { ACCOUNT_SEED } = await import("../src/lib/accounts");
  const accounts = Object.values(ACCOUNT_SEED).map((account) => account.toLowerCase());
  assert.equal(new Set(accounts).size, accounts.length);
  for (const account of Object.values(ACCOUNT_SEED)) {
    assert.match(account, /^.+#\d{3,5}$/, `${account} is not an account name`);
  }
});

/**
 * Path of Exile 2's rows are re-derived against its own versions: a stale code
 * is re-parsed; a row with nothing to re-derive is stamped current so it is not
 * re-read every boot; and a build the site's export made is rebuilt from that
 * export even when the row also holds a code that no longer reads.
 */
test("Path of Exile 2 rows are re-derived against their own versions", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { db, ensureSchema } = await import("../src/lib/db");
  const { POE2_PARSER_VERSION } = await import("../src/lib/games/poe2/pob");
  const { POE2_SITE_VERSION, readPoe2Export, storedPoe2Payload } = await import("../src/lib/games/poe2/site-export");

  const user = db
    .prepare(`INSERT INTO users (username) VALUES ('poe2-reparse')`)
    .run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe2' LIMIT 1`).get() as { id: number };
  const code = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-pob-0.2.txt"), "utf8").trim();
  const exported = readPoe2Export(
    JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-export.json"), "utf8")),
  );
  const payload = JSON.stringify(storedPoe2Payload(exported.characters[0], exported));
  const insert = db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, pob_code, source_payload, data, parser_version, api_version)
     VALUES (?, ?, ?, ?, 'Warrior', ?, ?, ?, 0, 0)`,
  );
  insert.run(user, league.id, "coded", "Coded", code, null, JSON.stringify({ items: [] }));
  insert.run(user, league.id, "bare", "Bare", null, null, JSON.stringify({ items: [], className: "Warrior" }));
  insert.run(user, league.id, "site", "Site", "not a code", payload, JSON.stringify({ items: [], source: "poe2-site" }));

  ensureSchema(db);

  const get = (slug: string) =>
    db.prepare(`SELECT data, parser_version, api_version FROM characters WHERE slug = ? AND user_id = ?`).get(slug, user) as {
      data: string;
      parser_version: number;
      api_version: number;
    };
  const coded = get("coded");
  assert.equal(JSON.parse(coded.data).ascendClassName, "Smith of Kitava");
  assert.equal(coded.parser_version, POE2_PARSER_VERSION);

  const bare = get("bare");
  assert.equal(bare.data, JSON.stringify({ items: [], className: "Warrior" }), "nothing to re-derive it from");
  assert.equal(bare.parser_version, POE2_PARSER_VERSION, "and it is not re-read every boot");
  assert.equal(bare.api_version, POE2_SITE_VERSION);

  const site = JSON.parse(get("site").data);
  assert.equal(site.source, "poe2-site");
  assert.ok(site.items.length > 0, "rebuilt from the export despite the unreadable code");
});

/**
 * The league record form was pre-filled with the league's own challenge total,
 * so every save stored it as this player's override and froze it against later
 * corrections. A stored total equal to the league's is cleared at boot.
 */
test("a player's challenge total equal to the league's is not kept as an override", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");
  const user = db
    .prepare(`INSERT INTO users (username) VALUES ('total-tester')`)
    .run().lastInsertRowid as number;
  const league = db
    .prepare(`SELECT id, challenge_total FROM leagues WHERE challenge_total IS NOT NULL LIMIT 1`)
    .get() as { id: number; challenge_total: number };
  const other = db
    .prepare(`SELECT id, challenge_total FROM leagues WHERE challenge_total IS NOT NULL AND id <> ? LIMIT 1`)
    .get(league.id) as { id: number; challenge_total: number };
  const insert = db.prepare(
    `INSERT INTO league_records (user_id, league_id, challenges_completed, challenge_total) VALUES (?, ?, 3, ?)`,
  );
  insert.run(user, league.id, league.challenge_total);
  insert.run(user, other.id, other.challenge_total + 1);

  ensureSchema(db);

  const totals = db
    .prepare(`SELECT league_id, challenge_total FROM league_records WHERE user_id = ? ORDER BY league_id`)
    .all(user) as { league_id: number; challenge_total: number | null }[];
  const byLeague = new Map(totals.map((row) => [row.league_id, row.challenge_total]));
  assert.equal(byLeague.get(league.id), null, "the league's own figure is not an override");
  assert.equal(byLeague.get(other.id), other.challenge_total + 1, "a real override stays");
});

/**
 * A league added by hand that the catalogue later gains is the same league:
 * the catalogue's row takes it over, keeping its id and everything filed under
 * it. Hand-added leagues are ordered by their dates like every other row,
 * instead of pinned above everything as the newest.
 */
test("the catalogue adopts a hand-added league it gains, and orders hand-added ones by date", async () => {
  const { db, ensureSchema } = await import("../src/lib/db");
  const { LEAGUE_SEED } = await import("../src/lib/leagues");
  const seed = LEAGUE_SEED.find((row) => row.game === "poe1" && row.slug === "3.20")!;
  const row = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' AND slug = '3.20'`).get() as { id: number };
  db.prepare(`DELETE FROM characters WHERE league_id = ?`).run(row.id);
  db.prepare(`DELETE FROM league_records WHERE league_id = ?`).run(row.id);
  db.prepare(`DELETE FROM leagues WHERE id = ?`).run(row.id);
  // What someone adding 3.20 by hand, before the catalogue had it, would have left.
  const custom = db
    .prepare(
      `INSERT INTO leagues (game, slug, patch, name, start_date, is_custom, sort_order)
       VALUES ('poe1', '3.20', '3.20', 'Typed By Hand', '2022-12-09', 1, 99999)`,
    )
    .run().lastInsertRowid as number;
  const user = db
    .prepare(`INSERT INTO users (username) VALUES ('adopt-tester')`)
    .run().lastInsertRowid as number;
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version)
     VALUES (?, ?, 'kept', 'Kept', 'Witch', '{}', 0)`,
  ).run(user, custom);
  // And a genuinely hand-added Path of Exile 2 league from early 2025.
  db.prepare(
    `INSERT INTO leagues (game, slug, patch, name, start_date, is_custom, sort_order)
     VALUES ('poe2', '0.1.9', '0.1.9', 'Private Race', '2025-02-01', 1, 99999)`,
  ).run();

  ensureSchema(db);

  const adopted = db.prepare(`SELECT id, name, is_custom FROM leagues WHERE game = 'poe1' AND slug = '3.20'`).get() as {
    id: number;
    name: string;
    is_custom: number;
  };
  assert.deepEqual(adopted, { id: custom, name: seed.name, is_custom: 0 });
  const kept = db.prepare(`SELECT league_id FROM characters WHERE user_id = ?`).get(user) as { league_id: number };
  assert.equal(kept.league_id, custom, "its character is still filed under it");

  const order = (game: string, slug: string) =>
    (db.prepare(`SELECT sort_order FROM leagues WHERE game = ? AND slug = ?`).get(game, slug) as { sort_order: number })
      .sort_order;
  assert.ok(order("poe2", "0.1.9") > order("poe2", "0.1"), "after 0.1, which began in December 2024");
  assert.ok(order("poe2", "0.1.9") < order("poe2", "0.2"), "and before 0.2");
  db.prepare(`DELETE FROM leagues WHERE game = 'poe2' AND slug = '0.1.9'`).run();
});
