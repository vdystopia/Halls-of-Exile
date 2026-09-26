import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

/** A scratch archive per test file, so nothing here touches ./data. */
process.env.ARCHIVE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-record-")), "archive.db");

async function setup(username: string) {
  const { db } = await import("../src/lib/db");
  const { listAllLeagues } = await import("../src/lib/queries");
  const user = db.prepare(`INSERT INTO users (username) VALUES (?)`).run(username).lastInsertRowid as number;
  return { db, user, leagues: listAllLeagues() };
}

test("a spreadsheet is read by its headers, in any spelling, with quotes and blank lines", async () => {
  const { parseCsv, readRecordSheet } = await import("../src/lib/record");
  assert.deepEqual(parseCsv('a,b\n"x, y","he said ""hi"""\n\n1,2\n'), [
    ["a", "b"],
    ["x, y", 'he said "hi"'],
    ["1", "2"],
  ]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [
    ["a", "b"],
    ["1", "2"],
  ]);

  const sheet = readRecordSheet(
    [
      "Character,Game,Patch,Level,Class,Ascendancy,Build,Played,Notes,Mode,Status",
      "Exile One,poe1,3.25,95,Witch,Necromancer,golemancer,5d 3h,\"full campaign\",Hardcore / SSF,",
      "Exile Two,2,0.5,80,Monk,Invoker,failed ice strike,12,,,",
      "Exile Three,poe1,,,,,,,,,failed",
      ",poe1,3.25,1,,,,,,,",
      "Exile Four,poe3,3.25,1,,,,,,,",
      "Exile Five,poe1,3.25,101,,,,,,,",
    ].join("\n"),
  );
  assert.equal(sheet.rows.length, 3);
  const [one, two, three] = sheet.rows;
  assert.equal(one.name, "Exile One");
  assert.equal(one.game, "poe1");
  assert.equal(one.league, "3.25");
  assert.equal(one.level, 95);
  assert.equal(one.playedMinutes, 5 * 24 * 60 + 3 * 60);
  assert.deepEqual(one.modifiers, ["hardcore", "ssf"]);
  assert.equal(one.failed, false);
  assert.equal(two.game, "poe2", "a bare 2 is Path of Exile 2");
  assert.equal(two.playedMinutes, 12 * 60, "a bare number is hours");
  assert.equal(two.failed, true, "the record writes a failed build as 'failed …'");
  assert.equal(two.mainSkill, "failed ice strike", "and the words are kept as written");
  assert.equal(three.failed, true, "a status column says it outright");
  assert.equal(three.league, null);
  assert.equal(sheet.problems.length, 3);
  assert.match(sheet.problems[0], /no name/);
  assert.match(sheet.problems[1], /unknown game/);
  assert.match(sheet.problems[2], /level/);
});

test("a league is found by slug, patch or name within the game, and an event is not a patch", async () => {
  const { resolveLeague } = await import("../src/lib/record");
  const { listAllLeagues } = await import("../src/lib/queries");
  const leagues = listAllLeagues();
  assert.equal(resolveLeague(leagues, "poe1", "3.25")?.slug, "3.25");
  assert.equal(resolveLeague(leagues, "poe1", "Settlers of Kalguur")?.slug, "3.25");
  assert.equal(resolveLeague(leagues, "poe1", "legacy-of-phrecia")?.slug, "legacy-of-phrecia");
  assert.equal(resolveLeague(leagues, "poe1", null)?.slug, "unspecified");
  assert.equal(resolveLeague(leagues, "poe2", "0.5")?.slug, "0.5");
  assert.equal(resolveLeague(leagues, "poe2", "3.25"), null, "a Path of Exile patch is not a Path of Exile 2 league");
  assert.equal(resolveLeague(leagues, "poe1", "9.99"), null);
});

/**
 * The atlas importer's rules, behind an upload: match by league and name,
 * create or update in place, fill blanks only around a stored build, and skip
 * what a person has to decide.
 */
test("applying the record creates, updates in place, fills around a build, and skips what it must", async () => {
  const { applyRecord, readRecordSheet } = await import("../src/lib/record");
  const { db, user, leagues } = await setup("record-tester");
  const { listPlayerCharacters } = await import("../src/lib/queries");
  const { characterTier } = await import("../src/lib/tier");

  const first = applyRecord(
    user,
    readRecordSheet(
      [
        "name,game,league,level,class,ascendancy,build,played,notes,status",
        "Alpha,poe1,3.25,95,Witch,Necromancer,golemancer,5d,campaign done,",
        "Beta,poe1,3.24,80,Marauder,Juggernaut,failed slammer,10,,failed",
        "Gamma,poe2,0.5,70,Monk,Invoker,ice strike,3d,fast,",
        "Delta,poe1,9.99,1,,,,,,",
      ].join("\n"),
    ).rows,
    leagues,
  );
  assert.deepEqual(
    { created: first.created, updated: first.updated, filled: first.filled, skipped: first.skipped.map((s) => s.name) },
    { created: 3, updated: 0, filled: 0, skipped: ["Delta"] },
  );
  assert.match(first.skipped[0].reason, /9\.99/);

  let characters = listPlayerCharacters(user);
  const alpha = characters.find((c) => c.name === "Alpha")!;
  const beta = characters.find((c) => c.name === "Beta")!;
  assert.equal(alpha.leagueSlug, "3.25");
  assert.equal(alpha.playedMinutes, 5 * 24 * 60);
  assert.equal(alpha.failed, false);
  assert.equal(beta.failed, true);
  assert.equal(beta.mainSkill, "failed slammer");
  // Hand-written and nothing imported: tier 3, wanting the game's gear.
  assert.deepEqual(characterTier(alpha), { tier: 3, missing: ["gear from the game"] });
  assert.deepEqual(characterTier(beta), { tier: 3, missing: ["notes", "gear from the game"] });

  // Alpha then gets gear from the game; Beta stays hand-written.
  db.prepare(
    `UPDATE characters SET source_payload = '{}', data = ?, notes = NULL, played_minutes = NULL WHERE id = ?`,
  ).run(JSON.stringify({ source: "poe-api", items: [{ id: 1, name: "Worn" }] }), alpha.id);

  const second = applyRecord(
    user,
    readRecordSheet(
      [
        "name,game,league,level,class,ascendancy,build,played,notes",
        "Alpha,poe1,3.25,1,Duelist,Slayer,something else,9d,new notes",
        "Beta,poe1,3.24,85,Marauder,Juggernaut,failed slammer,10,gave up in act 8",
        "Alpha,poe1,3.24,50,Witch,Elementalist,another alpha,1h,",
      ].join("\n"),
    ).rows,
    leagues,
  );
  assert.deepEqual(
    { created: second.created, updated: second.updated, filled: second.filled, skipped: second.skipped.map((s) => s.name) },
    { created: 0, updated: 1, filled: 1, skipped: ["Alpha"] },
  );
  assert.match(second.skipped[0].reason, /already archived/);

  characters = listPlayerCharacters(user);
  const alphaAfter = characters.find((c) => c.name === "Alpha")!;
  const betaAfter = characters.find((c) => c.name === "Beta")!;
  // Around a stored build the record fills blanks and touches nothing else.
  assert.equal(alphaAfter.className, "Witch", "the build's class stays");
  assert.equal(alphaAfter.level, 95, "the build's level stays");
  assert.equal(alphaAfter.mainSkill, "golemancer", "a filled main skill stays");
  assert.equal(alphaAfter.notes, "new notes", "a blank note is filled");
  assert.equal(alphaAfter.playedMinutes, 9 * 24 * 60, "a blank /played is filled");
  assert.equal(alphaAfter.data.items.length, 1, "the gear is untouched");
  assert.deepEqual(characterTier(alphaAfter), { tier: 2, missing: [] }, "and with both halves it is tier 2");
  // A hand-written one is rewritten by the record.
  assert.equal(betaAfter.level, 85);
  assert.equal(betaAfter.notes, "gave up in act 8");
  assert.equal(betaAfter.failed, true);
  assert.equal(characters.length, 3, "nothing was duplicated");
});
