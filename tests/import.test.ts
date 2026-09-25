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
  const { readAccountExport } = await import("../src/lib/games/exports");
  return readAccountExport(fs.readFileSync(FIXTURE, "utf8"));
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
/**
 * The rule the whole archive turns on. A character page records what a
 * character *was*; the account says what it *is*, and for anything but the
 * current league those differ by however much gear has been stripped off it
 * since. An unattended run that overwrote an archived character would quietly
 * replace a finished build with an empty shell, and the only copy of the
 * original is the one it just destroyed.
 */
test("a character that already holds a build is never overwritten unasked", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("finalised-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  const archived = JSON.stringify({ source: "poe-api", items: [{ id: 1, name: "The one it was finished with" }] });
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version,
                             source_payload, api_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Witch', ?, 0, '{"account":"x"}', 1)`,
  ).run(user.id, league.id, archived);

  const result = applyImport(user, exported, { include: () => true, leagueFor: () => null });

  assert.equal(result.imported, 0);
  assert.deepEqual(result.written, []);
  assert.deepEqual(result.skipped, ["TheLocalVoid"]);
  const row = db.prepare(`SELECT data FROM characters WHERE user_id = ?`).get(user.id) as { data: string };
  assert.equal(row.data, archived, "the archived build was overwritten");
});

/** A share code counts as a build too: it is not the export's to replace. */
test("a character imported from a build code is left alone as well", async () => {
  const { applyImport, planFor } = await import("../src/lib/import");
  const { db, user } = await setup("pobcode-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, pob_code, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Witch', 'a-share-code', '{"source":"pob"}', 3)`,
  ).run(user.id, league.id);

  assert.deepEqual(applyImport(user, exported, { include: () => true, leagueFor: () => null }).skipped, [
    "TheLocalVoid",
  ]);
  const row = planFor(user.id, exported, "token").rows.find((entry) => entry.name === "TheLocalVoid");
  assert.equal(row?.finalised, true, "the page must show it as archived, and leave its box unticked");
});

/** Naming it is the manual order, and the only thing that overrides the rule. */
test("naming a character is what replaces it", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("overwrite-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version,
                             source_payload, api_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Witch', '{"source":"poe-api","items":[]}', 0, '{}', 1)`,
  ).run(user.id, league.id);

  const result = applyImport(user, exported, {
    include: () => true,
    leagueFor: () => null,
    overwrite: (name) => name === "TheLocalVoid",
  });

  assert.deepEqual(result.written, ["TheLocalVoid"]);
  assert.deepEqual(result.skipped, []);
  const row = db.prepare(`SELECT data FROM characters WHERE user_id = ?`).get(user.id) as { data: string };
  const build = JSON.parse(row.data) as { items: unknown[] };
  assert.ok(build.items.length > 10, "the named character was not replaced");
});

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

/**
 * Running it twice must be the same as running it once — and now for a stronger
 * reason than before: the first run fills a character, which finalises it, so
 * the second has nothing it is allowed to touch.
 */
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

  const one = applyImport(user, exported, { include: () => true, leagueFor: () => null });
  assert.deepEqual(one.written, ["TheLocalVoid"]);
  const first = JSON.stringify(snapshot());

  const two = applyImport(user, exported, { include: () => true, leagueFor: () => null });
  assert.deepEqual(two.written, [], "the second run must write nothing at all");
  assert.deepEqual(two.skipped, ["TheLocalVoid"]);
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

/**
 * The hole the screenshot found. A guess at the origin league was offered on
 * every row, including archived ones, and the box was ticked whenever there was
 * a guess — so a character that was already finished sat pre-ticked, one click
 * from being replaced. A league is only ever chosen for a character being
 * created, so the guess belongs only on one.
 */
test("an archived character is never pre-ticked, whatever else is true of it", async () => {
  const { planFor } = await import("../src/lib/import");
  const { db, user } = await setup("suggestion-tester", null);
  const exported = await fixture();

  // BEVSTCHEESE is still in the league it was made in, so the collector calls
  // its origin certain — and it is also already archived.
  const certain = exported.characters.find((entry) => entry.originConfidence === "certain");
  assert.ok(certain, "the fixture should hold a character the collector was certain about");

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, data, parser_version,
                             source_payload, api_version)
     VALUES (?, ?, 'archived', ?, 'Witch', '{"source":"poe-api","items":[]}', 0, '{}', 1)`,
  ).run(user.id, league.id, certain.name);

  const row = planFor(user.id, exported, "token").rows.find((entry) => entry.name === certain.name);
  assert.equal(row?.finalised, true);
  assert.equal(row?.suggested, null, "a matched row must carry no league suggestion to tick on");
});

/**
 * How a player's first account reaches the archive without a form. The
 * collector is handed one on the command line once; the import records it, and
 * `backfillAccounts` keeps it from then on. The flag is never needed twice.
 */
test("the first import records the account it came from", async () => {
  const { rememberAccount } = await import("../src/lib/import");
  const { db, user } = await setup("remember-tester", null);

  rememberAccount(user.id, "  Someone#0739  ");

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(user.id) as { poe_account: string };
  assert.equal(row.poe_account, "Someone#0739", "and it is trimmed");
});

test("an account already recorded is not replaced by an import", async () => {
  const { rememberAccount } = await import("../src/lib/import");
  const { db, user } = await setup("remember-set-tester", "Theirs#1111");

  rememberAccount(user.id, "Someone else#2222");

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(user.id) as { poe_account: string };
  assert.equal(row.poe_account, "Theirs#1111");
});

/** Posting one player's export under another's name must not move the account. */
test("an account another player holds is never taken", async () => {
  const { rememberAccount } = await import("../src/lib/import");
  const { db } = await setup("holder-tester", "Held#3333");
  const { user: other } = await setup("taker-tester", null);

  rememberAccount(other.id, "Held#3333");

  const row = db.prepare(`SELECT poe_account FROM users WHERE id = ?`).get(other.id) as {
    poe_account: string | null;
  };
  assert.equal(row.poe_account, null);
});

/**
 * The upload page's skill field is the primary source for what a character was
 * built around. It is the one answer allowed to replace a `skill_gem` that is
 * already recorded, because a person looked at the row and said so — everything
 * else about an archived character is still left alone.
 */
test("a skill chosen on the upload page wins over the exporter's guess", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("skill-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill,
                             skill_gem, notes, played_minutes, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Unknown', 'Unknown', 70,
             'detonate dead ignite', 'Detonate Dead', NULL, NULL, '{}', 0)`,
  ).run(user.id, league.id);

  applyImport(user, exported, {
    include: () => true,
    leagueFor: () => null,
    skillFor: () => "Volatile Dead",
  });

  const row = db
    .prepare(`SELECT main_skill, skill_gem FROM characters WHERE user_id = ? AND name = 'TheLocalVoid'`)
    .get(user.id) as { main_skill: string; skill_gem: string };
  assert.equal(row.skill_gem, "Volatile Dead");
  // The prose is still the record's own and is not the form's to rewrite.
  assert.equal(row.main_skill, "detonate dead ignite");
});

/**
 * The unattended caller passes no `skillFor`, because it has nobody to ask.
 * Without one the old order holds: fill a blank, never touch an answer.
 */
test("an unattended import leaves a recorded skill alone", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("unattended-skill-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill,
                             skill_gem, notes, played_minutes, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Unknown', 'Unknown', 70, NULL,
             'Detonate Dead', NULL, NULL, '{}', 0)`,
  ).run(user.id, league.id);

  applyImport(user, exported, { include: () => true, leagueFor: () => null });

  const row = db
    .prepare(`SELECT skill_gem FROM characters WHERE user_id = ? AND name = 'TheLocalVoid'`)
    .get(user.id) as { skill_gem: string };
  assert.equal(row.skill_gem, "Detonate Dead");
});

/** A blank field is not an instruction to forget what the archive already knows. */
test("an empty skill field does not clear a recorded skill", async () => {
  const { applyImport } = await import("../src/lib/import");
  const { db, user } = await setup("blank-skill-tester", null);
  const exported = await fixture();

  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' LIMIT 1`).get() as { id: number };
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill,
                             skill_gem, notes, played_minutes, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Unknown', 'Unknown', 70, NULL,
             'Detonate Dead', NULL, NULL, '{}', 0)`,
  ).run(user.id, league.id);

  applyImport(user, exported, { include: () => true, leagueFor: () => null, skillFor: () => null });

  const row = db
    .prepare(`SELECT skill_gem FROM characters WHERE user_id = ? AND name = 'TheLocalVoid'`)
    .get(user.id) as { skill_gem: string };
  assert.equal(row.skill_gem, "Detonate Dead");
});
