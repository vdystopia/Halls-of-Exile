import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * The unattended half of importing an account. The upload page can ask which
 * league an unseen character belongs in; `collect.ps1` cannot, so the rules
 * that keep a scheduled run safe are the ones worth pinning down.
 */
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "poe-export.json");

/** A scratch archive per test file, so nothing here touches ./data. */
process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-import-")), "archive.db");

async function setup(username: string, account: string | null) {
  const { db } = await import("../src/lib/db");
  const user = db
    .prepare(`INSERT INTO users (username, first_name, poe_account) VALUES (?, 'Test', ?)`)
    .run(username, account).lastInsertRowid as number;
  return { db, user: { id: user, username } };
}

async function fixture() {
  const { readPoeExport } = await import("../src/lib/games/poe1/poe-api");
  return readPoeExport(fs.readFileSync(FIXTURE, "utf8"));
}

test("an export finds its player by the account it names", async () => {
  const { playerForAccount } = await import("../src/lib/import");
  await setup("account-tester", "zxBlasphemy#5164");

  assert.equal(playerForAccount("zxBlasphemy#5164")?.username, "account-tester");
  // Account names are displayed with their own casing but matched without it.
  assert.equal(playerForAccount("zxblasphemy#5164")?.username, "account-tester");
  assert.equal(playerForAccount("  zxBlasphemy#5164  ")?.username, "account-tester");
  assert.equal(playerForAccount("SomeoneElse#1111"), null);
});

/**
 * The rule that makes a scheduled run safe to leave alone: the league a
 * character belongs to is the one thing no export can say, so an unattended
 * import fills in what already exists and reports the rest.
 */
test("an unattended import creates nothing and names what it skipped", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("unattended-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Witch', '{}', 0)`,
  ).run(user.id, league.id);

  const before = db.prepare(`SELECT count(*) AS n FROM characters WHERE user_id = ?`).get(user.id) as { n: number };
  const result = applyImport(user, exported, { include: () => true, leagueFor: () => null });
  const after = db.prepare(`SELECT count(*) AS n FROM characters WHERE user_id = ?`).get(user.id) as { n: number };

  assert.equal(result.imported, 1, "only the character that already existed");
  assert.equal(result.created, 0, "an unattended run must never invent a league");
  assert.equal(after.n, before.n, "no rows were added");
  assert.deepEqual(result.written, ["TheLocalVoid"]);

  // Everything it did not write is what the caller reports as needing a league.
  const landed = new Set(result.written);
  const unmatched = exported.characters.map((c) => c.name).filter((name) => !landed.has(name));
  assert.deepEqual(unmatched.sort(), ["BEVSTCHEESE", "WelcomeToMySimulation", "vCVRSE"].sort());
});

test("an import fills in gear without touching the record's own fields", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("keeps-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill,
                             notes, played_minutes, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Unknown', 'Unknown', 70,
             'detonate dead ignite', 'the one with the helmet', 4210, '{}', 0)`,
  ).run(user.id, league.id);

  applyImport(user, exported, { include: () => true, leagueFor: () => null });

  const row = db
    .prepare(`SELECT class_name, ascendancy, level, main_skill, notes, played_minutes, league_id, data
                FROM characters WHERE user_id = ? AND name = 'TheLocalVoid'`)
    .get(user.id) as {
    class_name: string;
    ascendancy: string;
    level: number;
    main_skill: string;
    notes: string;
    played_minutes: number;
    league_id: number;
    data: string;
  };

  // The game's own answers replace what was written down...
  assert.equal(row.class_name, "Witch");
  assert.equal(row.ascendancy, "Necromancer");
  assert.equal(row.level, 85);
  // ...but the record's own writing is not the game's to overwrite.
  assert.equal(row.main_skill, "detonate dead ignite");
  assert.equal(row.notes, "the one with the helmet");
  assert.equal(row.played_minutes, 4210);
  assert.equal(row.league_id, league.id, "an import never moves a character between leagues");

  const build = JSON.parse(row.data) as { items: unknown[]; slots: Record<string, number> };
  assert.ok(build.items.length > 10);
  assert.ok(build.slots["Body Armour"]);
});

/** Running it twice must be the same as running it once. */
test("a second run changes nothing", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("idempotent-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Witch', '{}', 0)`,
  ).run(user.id, league.id);

  const snapshot = () =>
    db.prepare(`SELECT name, class_name, level, data, source_payload FROM characters WHERE user_id = ?`).all(user.id);

  applyImport(user, exported, { include: () => true, leagueFor: () => null });
  const first = JSON.stringify(snapshot());
  applyImport(user, exported, { include: () => true, leagueFor: () => null });
  assert.equal(JSON.stringify(snapshot()), first);
});

/** The page's half: a league answered by hand is the only way a row is created. */
test("a league chosen by hand is what creates a character", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("creates-tester", null);
  const exported = await fixture();

  const result = applyImport(user, exported, {
    include: (name) => name === "vCVRSE",
    leagueFor: (name) => (name === "vCVRSE" ? "3.29" : null),
  });

  assert.equal(result.created, 1);
  const row = db
    .prepare(
      `SELECT c.name, c.slug, l.slug AS league FROM characters c JOIN leagues l ON l.id = c.league_id
        WHERE c.user_id = ?`,
    )
    .get(user.id) as { name: string; slug: string; league: string };
  assert.deepEqual(row, { name: "vCVRSE", slug: "vcvrse", league: "3.29" });
});

/** A name two archived characters share cannot be matched without a rename. */
test("an ambiguous name is left alone rather than guessed at", async () => {
  const { applyImport, planFor } = await import("../src/lib/import");
  const { db, user } = await setup("ambiguous-tester", null);
  const exported = await fixture();

  const leagues = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 2`).all() as { id: number }[];
  for (const [index, league] of leagues.entries()) {
    db.prepare(
      `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version)
       VALUES (?, ?, ?, 'TheLocalVoid', 'Witch', '{}', 0)`,
    ).run(user.id, league.id, `thelocalvoid-${index}`);
  }

  const result = applyImport(user, exported, { include: () => true, leagueFor: () => null });
  assert.equal(result.imported, 0);
  assert.deepEqual(result.written, []);

  const row = planFor(user.id, exported, "token").rows.find((entry) => entry.name === "TheLocalVoid");
  assert.equal(row?.action, "ambiguous");
  assert.equal(row?.matches, 2);
});
