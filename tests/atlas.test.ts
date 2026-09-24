import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { LEAGUE_SEED } from "../src/lib/leagues";
import { classLine } from "../src/lib/format";

type Entry = {
  player: string;
  game: string;
  league: string;
  name: string;
  className: string;
  ascendancy: string;
  mainSkill: string;
};

const entries = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "scripts", "data", "character-atlas.json"), "utf8"),
) as Entry[];

test("every imported character has a league in the catalogue", () => {
  for (const entry of entries) {
    const league = LEAGUE_SEED.find((row) => row.game === entry.game && row.slug === entry.league);
    assert.ok(league, `${entry.name} is filed under ${entry.game}/${entry.league}, which is not seeded`);
  }
});

test("every imported character belongs to a known player", () => {
  const players = new Set(entries.map((entry) => entry.player));
  assert.deepEqual([...players].sort(), ["dystopia", "valkyrie"]);
});

/** Anything the record did not have reads "Unknown" rather than being blank. */
test("no imported field is left blank", () => {
  for (const entry of entries) {
    for (const field of ["name", "className", "ascendancy", "mainSkill"] as const) {
      assert.ok(entry[field] && entry[field].trim().length > 0, `${entry.name} has an empty ${field}`);
    }
  }
});

/**
 * The record writes builds as free text — "death's oath occultist", "jugg",
 * "AoC" — and the importer resolves the ascendancy out of it, including the
 * Legacy of Phrecia alternates and Path of Exile 2's own.
 */
test("ascendancies resolved out of the free text are real ones", () => {
  const poe1 = new Set([
    "Juggernaut","Berserker","Chieftain","Slayer","Gladiator","Champion","Deadeye","Raider","Pathfinder",
    "Assassin","Saboteur","Trickster","Necromancer","Elementalist","Occultist","Inquisitor","Hierophant","Guardian",
    "Ascendant",
    // Legacy of Phrecia replaced every ascendancy for the duration of the event.
    "Ancestral Commander","Antiquarian","Behemoth","Aristocrat","Gambler","Paladin","Daughter of Oshabi",
    "Surfcaster","Wildspeaker","Architect of Chaos","Puppeteer","Servant of Arakaali","Harbinger","Herald",
    "Polytheist","Blind Prophet","Bog Shaman","Whisperer","Scavenger",
  ]);
  const poe2 = new Set([
    "Titan","Warbringer","Smith of Kitava","Deadeye","Pathfinder","Infernalist","Blood Mage","Lich","Abyssal Lich",
    "Invoker","Acolyte of Chayula","Martial Artist","Witchhunter","Gemling Legionnaire","Tactician","Stormweaver",
    "Chronomancer","Disciple of Varashta","Amazon","Ritualist","Spirit Walker","Oracle","Shaman",
  ]);
  for (const entry of entries) {
    if (entry.ascendancy === "Unknown") continue;
    const known = entry.game === "poe1" ? poe1 : poe2;
    assert.ok(known.has(entry.ascendancy), `${entry.name}: ${entry.ascendancy} is not a ${entry.game} ascendancy`);
  }
});

/**
 * The importer runs inside the container, where the archive actually lives, and
 * that has node and better-sqlite3 but no TypeScript. Plain JavaScript is not a
 * style choice here — a .ts importer cannot run against the real archive.
 */
test("the importer is plain JavaScript and ships in the image", () => {
  assert.ok(fs.existsSync(path.join(process.cwd(), "scripts", "seed-atlas.mjs")));
  assert.equal(fs.existsSync(path.join(process.cwd(), "scripts", "seed-atlas.ts")), false);
  const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
  assert.match(dockerfile, /seed-atlas\.mjs/, "the importer is not copied into the image");
  assert.match(dockerfile, /scripts\/data/, "the record is not copied into the image");
});

test("a record with neither class nor ascendancy still reads as something", () => {
  assert.equal(classLine("Unknown", "Unknown"), "class unknown");
  assert.equal(classLine("Marauder", "Unknown"), "Marauder");
  assert.equal(classLine("Witch", "Occultist"), "Occultist · Witch");
});

/**
 * The record is the starting point, never the last word. A character that has
 * since been given a real build — from a share code or an account export — must
 * survive a re-run of the importer untouched: the build this file would write
 * has no items in it, so overwriting one would destroy the only copy of the
 * gear and leave an empty shell behind. It is the same rule the unattended
 * import follows, and it is easy to trip because the fix for something else is
 * so often "just run seed:atlas again".
 */
test("re-running the importer leaves a character that has gear alone", async () => {
  const { execFileSync } = await import("node:child_process");
  const os = await import("node:os");

  const archive = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "halls-atlas-")), "archive.db");
  const run = () =>
    execFileSync(process.execPath, [path.join(process.cwd(), "scripts", "seed-atlas.mjs")], {
      env: { ...process.env, ARCHIVE_DB: archive },
      encoding: "utf8",
    });

  // A migrated, empty archive is what the site leaves behind on first boot.
  const { db } = await import("../src/lib/db");
  process.env.ARCHIVE_DB = archive;
  db.prepare("SELECT 1").get();

  run();

  // Stand in for a character that has since been imported with its gear.
  const target = db
    .prepare(`SELECT id FROM characters WHERE name = 'thelocalvoid' COLLATE NOCASE`)
    .get() as { id: number } | undefined;
  assert.ok(target, "the record should have created this character");
  const build = JSON.stringify({ source: "poe-api", items: [{ id: 1, name: "Fate Wrap" }] });
  db.prepare(`UPDATE characters SET data = ?, source_payload = '{}', api_version = 1 WHERE id = ?`).run(
    build,
    target.id,
  );

  const output = run();

  const after = db.prepare(`SELECT data, source_payload FROM characters WHERE id = ?`).get(target.id) as {
    data: string;
    source_payload: string | null;
  };
  assert.equal(after.data, build, "the importer overwrote a character that had gear");
  assert.ok(after.source_payload, "and it dropped the payload that build came from");
  assert.match(output, /left \d+ alone/, "it should say what it left alone");
});
