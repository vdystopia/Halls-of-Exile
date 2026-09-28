import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/**
 * The build words (`main_skill`) are the owner's. An export from the game
 * never writes its main-skill guess there — blank or not, filling or creating
 * — because that guess is the gem with the most supports linked to it, which
 * is what `skill_gem` is for. A blank build column once let "Flame Surge"
 * become a character's build while the sheet's gem said Detonate Dead.
 */
process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-build-words-")), "archive.db");

const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "poe-export.json");

test("an export fills the gem but never the build words, filling or creating", async () => {
  const { db } = await import("../src/lib/db");
  const { applyImport } = await import("../src/lib/import");
  const { readAccountExport } = await import("../src/lib/games/exports");
  const user = db.prepare(`INSERT INTO users (username) VALUES ('words-tester')`).run().lastInsertRowid as number;
  const league = db.prepare(`SELECT id, slug FROM leagues WHERE game = 'poe1' AND slug = '3.25'`).get() as { id: number; slug: string };
  // Written down with a gem and no build words.
  db.prepare(
    `INSERT INTO characters (user_id, league_id, slug, name, class_name, ascendancy, level, main_skill, skill_gem, data, parser_version)
     VALUES (?, ?, 'thelocalvoid', 'TheLocalVoid', 'Unknown', NULL, 70, NULL, 'Detonate Dead', '{}', 0)`,
  ).run(user, league.id);

  const exported = readAccountExport(fs.readFileSync(FIXTURE, "utf8"));
  const result = applyImport({ id: user, username: "words-tester" }, exported, {
    include: () => true,
    // vCVRSE is unseen and gets a league, so it is created by the export itself.
    leagueFor: (name) => (name === "vCVRSE" ? league.slug : null),
  });
  assert.ok(result.written.includes("TheLocalVoid"));
  assert.ok(result.written.includes("vCVRSE"));

  const rows = db
    .prepare(`SELECT name, main_skill, skill_gem FROM characters WHERE user_id = ? ORDER BY name`)
    .all(user) as { name: string; main_skill: string | null; skill_gem: string | null }[];
  const filled = rows.find((r) => r.name === "TheLocalVoid")!;
  assert.equal(filled.main_skill, null, "the blank build words stay blank");
  assert.equal(filled.skill_gem, "Detonate Dead", "the recorded gem is not the guess's to replace");
  const created = rows.find((r) => r.name === "vCVRSE")!;
  assert.equal(created.main_skill, null, "a created character has no build words either");
  assert.ok(created.skill_gem, "but the guess does fill the gem of a character with none");
});

test("the card resolves the skill exactly as the header does", async () => {
  const { buildSkill } = await import("../src/lib/games/skills");
  // The gem wins over the build words, and prose that is not a gem is not a skill.
  assert.equal(buildSkill("poe1", "Detonate Dead", "Flame Surge"), "Detonate Dead");
  assert.equal(buildSkill("poe1", null, "cold bow raider"), null);
});
