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

test("a record with neither class nor ascendancy still reads as something", () => {
  assert.equal(classLine("Unknown", "Unknown"), "class unknown");
  assert.equal(classLine("Marauder", "Unknown"), "Marauder");
  assert.equal(classLine("Witch", "Occultist"), "Occultist · Witch");
});
