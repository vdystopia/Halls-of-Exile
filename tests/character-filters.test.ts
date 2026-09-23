import assert from "node:assert/strict";
import test from "node:test";
import { applyCharacterQuery, characterFacets, readCharacterQuery } from "../src/lib/character-filters";
import { emptyBuild } from "../src/lib/games/poe1/pob";
import type { Character } from "../src/lib/types";

let nextId = 1;
function character(fields: Partial<Character>): Character {
  const id = nextId++;
  return {
    id,
    userId: 1,
    leagueId: 1,
    slug: `c${id}`,
    name: `Character ${id}`,
    className: "Unknown",
    ascendancy: null,
    level: null,
    mainSkill: null,
    notes: null,
    playedMinutes: null,
    isFavorite: 0,
    pobCode: null,
    pobUrl: null,
    retiredAt: null,
    createdAt: "2026-01-01 00:00:00",
    data: emptyBuild(),
    ...fields,
  };
}

const roster = [
  character({ name: "Zed", className: "Witch", ascendancy: "Necromancer", level: 92, mainSkill: "Raise Spectre", playedMinutes: 600 }),
  character({ name: "amy", className: "Ranger", ascendancy: "Deadeye", level: 97, mainSkill: "Tornado Shot", createdAt: "2026-03-01 00:00:00" }),
  character({ name: "Bob", className: "Witch", ascendancy: "Necromancer", level: 85, mainSkill: "Summon Raging Spirit", isFavorite: 1, playedMinutes: 1200 }),
  character({ name: "Nameless", className: "Unknown", ascendancy: "Unknown", level: null, mainSkill: "Unknown" }),
  character({ name: "Ranger Only", className: "Ranger", level: 70, mainSkill: "tornado shot" }),
];
const names = (list: Character[]) => list.map((entry) => entry.name);

test("the default order keeps favourites first, then level, unknown level last", () => {
  assert.deepEqual(names(applyCharacterQuery(roster, readCharacterQuery({}))), ["Bob", "amy", "Zed", "Ranger Only", "Nameless"]);
});

test("each sort orders by its column and puts missing values last", () => {
  const sorted = (sort: string) => names(applyCharacterQuery(roster, readCharacterQuery({ sort })));
  assert.deepEqual(sorted("level"), ["amy", "Zed", "Bob", "Ranger Only", "Nameless"]);
  assert.deepEqual(sorted("name"), ["amy", "Bob", "Nameless", "Ranger Only", "Zed"]);
  assert.deepEqual(sorted("class"), ["amy", "Zed", "Bob", "Ranger Only", "Nameless"]);
  assert.deepEqual(sorted("played"), ["Bob", "Zed", "amy", "Nameless", "Ranger Only"]);
  assert.equal(sorted("added")[0], "amy");
  // "Unknown" is not a skill: it sorts with the characters that have none.
  assert.equal(sorted("skill").at(-1), "Nameless");
});

test("an unrecognised sort falls back to the default instead of failing", () => {
  assert.equal(readCharacterQuery({ sort: "DROP TABLE" }).sort, "");
  assert.equal(readCharacterQuery({ sort: ["name", "level"] }).sort, "name");
});

test("the class filter matches the ascendancy a card shows, else the class", () => {
  const witches = applyCharacterQuery(roster, readCharacterQuery({ class: "necromancer" }));
  assert.deepEqual(names(witches), ["Bob", "Zed"]);
  // A Ranger without an ascendancy is filed under Ranger, not under Deadeye.
  assert.deepEqual(names(applyCharacterQuery(roster, readCharacterQuery({ class: "Ranger" }))), ["Ranger Only"]);
});

test("the skill filter ignores case and combines with the class filter", () => {
  assert.deepEqual(names(applyCharacterQuery(roster, readCharacterQuery({ skill: "Tornado Shot" }))), ["amy", "Ranger Only"]);
  assert.deepEqual(
    names(applyCharacterQuery(roster, readCharacterQuery({ skill: "Tornado Shot", class: "Deadeye", sort: "name" }))),
    ["amy"],
  );
  assert.deepEqual(applyCharacterQuery(roster, readCharacterQuery({ skill: "Cyclone" })), []);
});

test("facets offer only what the league holds, unknown class last", () => {
  const facets = characterFacets(roster);
  assert.deepEqual(facets.classes, ["Deadeye", "Necromancer", "Ranger", "class unknown"]);
  assert.ok(!facets.skills.includes("Unknown"));
  assert.deepEqual(facets.skills, ["Raise Spectre", "Summon Raging Spirit", "Tornado Shot"]);
});
