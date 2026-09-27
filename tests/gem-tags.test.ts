import assert from "node:assert/strict";
import test from "node:test";
import { gemTags, skillNames } from "../src/lib/games/poe1/gems";
import { gemTags as poe2GemTags } from "../src/lib/games/poe2/gems";
import { skillNamesFor, skillTags } from "../src/lib/games/skills";
import { HIDDEN_TAGS, topTags } from "../src/lib/metrics";

/** The game's own display names, in the game's own order: "AoE", never "area". */
test("a skill's tags are the ones the game shows, in its order", () => {
  assert.deepEqual(gemTags("Fireball"), ["Projectile", "Spell", "AoE", "Fire"]);
  assert.deepEqual(gemTags("Righteous Fire"), ["Spell", "AoE", "Fire"]);
  assert.ok(gemTags("Vaal Righteous Fire").includes("Vaal"));
  assert.ok(gemTags("Summon Raging Spirit").includes("Minion"));
});

/**
 * The attribute tags and `grants_active_skill` are on every gem in the data and
 * shown on none in the game; a tag the game's table gives no name is left out
 * rather than printed as its id.
 */
test("hidden tags are never shown, and every tag is a display name", () => {
  const every = new Set(skillNames().flatMap((name) => gemTags(name)));
  for (const tag of every) {
    assert.doesNotMatch(tag, /^(strength|dexterity|intelligence|grants_active_skill|low_max_level|awakened)$/i, tag);
    assert.match(tag, /^[A-Z]/, `${tag} is an id, not a display name`);
  }
  assert.ok(every.has("AoE"));
  assert.ok(!every.has("area"));
});

test("every skill offered has tags, in both games", () => {
  assert.deepEqual(
    skillNames().filter((name) => !gemTags(name).length),
    [],
  );
  assert.deepEqual(
    skillNamesFor("poe2").filter((name) => !skillTags("poe2", name).length),
    [],
  );
});

/** The rule `gemArt` follows: any case, exact names only, so prose has no tags. */
test("a skill resolves in any case, and prose resolves to nothing", () => {
  assert.deepEqual(gemTags("righteous fire"), gemTags("Righteous Fire"));
  assert.deepEqual(gemTags("poison srs"), []);
  assert.deepEqual(gemTags("Gem Of Nothing"), []);
  assert.deepEqual(gemTags(null), []);
});

/**
 * A transfigured gem is its own row in the data, with its own tags, and a new
 * one the snapshot lacks falls back to its base gem's, the way its picture does.
 */
test("a transfigured gem has its own tags, and an unknown one its base gem's", () => {
  assert.ok(gemTags("Ice Nova of Frostbolts").includes("Nova"));
  assert.deepEqual(gemTags("Fireball of Nothing Yet"), gemTags("Fireball"));
});

test("a renamed gem keeps its tags under its old name", () => {
  assert.deepEqual(gemTags("Dark Pact"), gemTags("Dark Bargain"));
  assert.ok(gemTags("Dark Pact").length);
});

/**
 * Path of Exile 2's table writes each name in the game's `[Tag|Display]`
 * markup, which the generator strips; its Spark is tagged by its own table, not
 * Path of Exile 1's.
 */
test("Path of Exile 2 tags come from its own table with the markup stripped", () => {
  const spark = skillTags("poe2", "Spark");
  assert.ok(spark.includes("Spell") && spark.includes("Lightning"), spark.join(", "));
  assert.notDeepEqual(spark, skillTags("poe1", "Spark"));
  const every = skillNamesFor("poe2").flatMap((name) => poe2GemTags(name));
  assert.deepEqual(
    every.filter((tag) => /[[\]|]/.test(tag)),
    [],
  );
  assert.deepEqual(poe2GemTags("companion / Zekoa the monkey masher"), []);
});

/**
 * The header's five: counted once per character, most characters first, ties
 * by name and nothing else — /played has no bearing on a tag. A character with
 * no skill counts for nothing, and a tag a gem carries twice still counts once.
 */
test("the most common tags are counted once per character and ranked by characters alone", () => {
  const none = new Set<string>();
  const top = topTags(
    [
      { tags: ["Spell", "Fire", "AoE"] },
      { tags: ["Spell", "Minion", "Fire", "Fire"] },
      { tags: ["Attack", "Projectile", "Bow"] },
      { tags: ["Spell", "Cold"] },
      { tags: [] },
    ],
    5,
    none,
  );
  assert.deepEqual(
    top.map((tag) => [tag.name, tag.characters]),
    [
      ["Spell", 3],
      ["Fire", 2],
      ["AoE", 1],
      ["Attack", 1],
      ["Bow", 1],
    ],
  );
  assert.equal(topTags([{ tags: ["Spell"] }], 1, none).length, 1);
  assert.deepEqual(topTags([]), []);
});

/**
 * The block list holds for every player: a tag on it is never counted,
 * whatever case it was written in, and the owner's four are on it.
 */
test("blocked tags are left out of the count, for everyone", () => {
  const characters = [{ tags: ["AoE", "Spell", "Fire"] }, { tags: ["AoE", "Attack"] }];
  assert.deepEqual(
    topTags(characters, 5, new Set(["aoe", "spell"])).map((tag) => tag.name),
    ["Attack", "Fire"],
  );
  assert.equal(topTags(characters, 5, new Set())[0].name, "AoE");
  for (const blocked of ["AoE", "Duration", "Repeatable", "Chaining"]) {
    assert.ok(HIDDEN_TAGS.has(blocked.toLowerCase()), `${blocked} is blocked`);
    assert.deepEqual(topTags([{ tags: [blocked] }]), []);
  }
});
