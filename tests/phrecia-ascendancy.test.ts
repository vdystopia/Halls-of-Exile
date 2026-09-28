import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * A character from a Phrecia-style event keeps its Phrecia ascendancy (the
 * owner, 2026-09-27). The game reports what a character is today, and one
 * migrated out of the event was reset to a standard ascendancy, so an export
 * taken afterwards would replace Scavenger with Ascendant. The record is the
 * only thing that can put an alternate ascendancy on a row, and an export can
 * confirm it but never overwrite it.
 */
process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-phrecia-")), "archive.db");

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "poe-export.json");

test("an alternate ascendancy is known by game", async () => {
  const { isAlternateAscendancy } = await import("../src/lib/games/ascendancy");
  assert.equal(isAlternateAscendancy("poe1", "Scavenger"), true);
  assert.equal(isAlternateAscendancy("poe1", "Bog Shaman"), true);
  assert.equal(isAlternateAscendancy("poe1", "Necromancer"), false);
  assert.equal(isAlternateAscendancy("poe1", "Unknown"), false);
  assert.equal(isAlternateAscendancy("poe1", null), false);
  assert.equal(isAlternateAscendancy("poe2", "Scavenger"), false, "Path of Exile 2 has no Phrecia set");
});

test("an export never replaces a recorded Phrecia ascendancy, and still fills one that is standard", async () => {
  const { db } = await import("../src/lib/db");
  const { applyImport } = await import("../src/lib/import");
  const { readAccountExport } = await import("../src/lib/games/exports");
  const user = db.prepare(`INSERT INTO users (username, poe_account) VALUES ('phrecia-tester', NULL)`).run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id FROM leagues WHERE game = 'poe1' AND slug = 'legacy-of-phrecia-2'`).get() as { id: number };
  const insert = db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, ascendancy, level, data, parser_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 0)`,
  );
  // The record put Herald on BEVSTCHEESE; the game, after migration, says Necromancer.
  insert.run(user, league.id, "bevstcheese", "BEVSTCHEESE", "Witch", "Herald", 86);
  // TheLocalVoid was written down with no ascendancy at all; the game's answer fills it.
  insert.run(user, league.id, "thelocalvoid", "TheLocalVoid", "Unknown", "Unknown", 70);

  const exported = readAccountExport(fs.readFileSync(FIXTURE, "utf8"));
  const beast = exported.characters.find((c) => c.name === "BEVSTCHEESE")!;
  assert.equal(beast.ascendancy, "Herald", "the fixture was collected inside the event");
  beast.ascendancy = "Necromancer";

  const result = applyImport({ id: user, username: "phrecia-tester" }, exported, { include: (name) => name === "BEVSTCHEESE" || name === "TheLocalVoid", leagueFor: () => null });
  assert.ok(result.written.includes("BEVSTCHEESE"));
  const rows = db
    .prepare(`SELECT name, ascendancy, level FROM characters WHERE user_id = ? ORDER BY name`)
    .all(user) as { name: string; ascendancy: string; level: number }[];
  assert.deepEqual(rows, [
    { name: "BEVSTCHEESE", ascendancy: "Herald", level: 90 },
    { name: "TheLocalVoid", ascendancy: "Necromancer", level: 85 },
  ]);
});
