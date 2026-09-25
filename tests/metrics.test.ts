import assert from "node:assert/strict";
import { test } from "node:test";
import { rollupByClass, rollupBySkill, type MetricCharacter } from "../src/lib/metrics";

const character = (overrides: Partial<MetricCharacter>): MetricCharacter => ({
  game: "poe1",
  className: "Witch",
  ascendancy: "Necromancer",
  level: 90,
  playedMinutes: 600,
  leagueId: 1,
  skill: null,
  ...overrides,
});

test("a class rolls up its ascendancies, counting leagues once each", () => {
  const [{ classes }] = rollupByClass([
    character({ leagueId: 1, level: 90, skill: "Raise Zombie" }),
    character({ leagueId: 1, level: 96, ascendancy: "Elementalist", skill: "Winter Orb" }),
    character({ leagueId: 2, level: 99, playedMinutes: null, skill: "Raise Zombie" }),
  ]);
  const witch = classes[0];
  assert.equal(witch.name, "Witch");
  assert.equal(witch.characters, 3);
  assert.equal(witch.leagues, 2);
  assert.equal(witch.playedMinutes, 1200);
  assert.equal(witch.playedRecorded, 2);
  assert.equal(witch.averageLevel, 95);
  assert.equal(witch.highestLevel, 99);
  assert.equal(witch.level90s, 3);
  assert.equal(witch.topSkill, "Raise Zombie");
  assert.deepEqual(
    witch.children.map((child) => [child.name, child.characters]),
    [["Necromancer", 2], ["Elementalist", 1]],
  );
});

test("unknown classes and ascendancies are a bucket of their own, listed last", () => {
  const [{ classes }] = rollupByClass([
    character({ className: "Unknown", ascendancy: "Unknown" }),
    character({ className: "Unknown", ascendancy: null }),
    character({ className: "Templar", ascendancy: "Unknown" }),
  ]);
  assert.deepEqual(
    classes.map((row) => [row.name, row.known, row.characters]),
    [["Templar", true, 1], ["Unknown class", false, 2]],
  );
  assert.equal(classes[0].children[0].name, "Ascendancy unknown");
});

test("the two games are never added together, even for a shared class name", () => {
  const rollups = rollupByClass([character({ game: "poe1" }), character({ game: "poe2", ascendancy: "Lich" })]);
  assert.deepEqual(
    rollups.map((r) => [r.game, r.classes[0].name, r.classes[0].characters]),
    [["poe1", "Witch", 1], ["poe2", "Witch", 1]],
  );
});

test("builds rank by character count by default, and by /played when asked", () => {
  const characters = [
    character({ skill: "Arc", playedMinutes: 60 }),
    character({ skill: "arc", playedMinutes: 60, ascendancy: "Elementalist" }),
    character({ skill: "Winter Orb", playedMinutes: 5000 }),
    character({ skill: null, playedMinutes: 99999 }),
  ];
  assert.deepEqual(
    rollupBySkill(characters).map((b) => [b.name, b.characters, b.playedMinutes]),
    [["Arc", 2, 120], ["Winter Orb", 1, 5000]],
  );
  assert.deepEqual(
    rollupBySkill(characters, "played").map((b) => b.name),
    ["Winter Orb", "Arc"],
  );
  assert.deepEqual(rollupBySkill(characters)[0].classes.sort(), ["Elementalist", "Necromancer"]);
});

test("a tie on one measure is broken by the other", () => {
  const characters = [
    character({ skill: "Arc", playedMinutes: 60 }),
    character({ skill: "Spark", playedMinutes: 600 }),
  ];
  assert.deepEqual(rollupBySkill(characters).map((b) => b.name), ["Spark", "Arc"]);
});
