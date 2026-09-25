import assert from "node:assert/strict";
import test from "node:test";
import { gemArt, gemColor, orderGems, skillNames } from "../src/lib/games/poe1/gems";
import { buildSkill, skillArt, skillNamesFor } from "../src/lib/games/skills";

const gem = (name: string, gemId?: string, support = false) => ({
  name,
  gemId,
  level: 20,
  quality: 20,
  enabled: true,
  support,
});

test("a gem's colour is its attribute", () => {
  assert.equal(gemColor(gem("Summon Stone Golem")), "r");
  assert.equal(gemColor(gem("Herald of Ice")), "g");
  assert.equal(gemColor(gem("Winter Orb")), "b");
});

/** A support is "Arcane Surge Support" in the dump and "Arcane Surge" in an export. */
test("a support resolves without the word Support", () => {
  assert.equal(gemColor(gem("Arcane Surge")), "b");
  assert.equal(gemColor(gem("Cast when Damage Taken")), "r");
  assert.equal(gemColor(gem("Hypothermia")), "g");
});

/** The name Path of Building exports for a transfigured gem is not in the dump. */
test("a transfigured gem resolves through the base gem's metadata id", () => {
  const frostblink = gem("Frostblink of Wintry Blast", "Metadata/Items/Gems/SkillGemFrostblink");
  assert.equal(gemColor(frostblink), "b");
});

test("an unknown gem has no colour rather than a wrong one", () => {
  assert.equal(gemColor(gem("Gem Of Nothing")), null);
});

/**
 * There is no primary active skill: a group of four golems has four equal
 * actives. Actives keep their own order and sit above every support.
 */
test("actives come before supports, each keeping its order", () => {
  const gems = [
    gem("Ice Bite", undefined, true),
    gem("Zealotry"),
    gem("Herald of Ice"),
    gem("Arctic Armour"),
  ];
  assert.deepEqual(
    orderGems(gems).map((g) => g.name),
    ["Zealotry", "Herald of Ice", "Arctic Armour", "Ice Bite"],
  );
});

/**
 * Gem art is a layered sheet like a flask's — socket setting and gem in one
 * strip — and drawing the strip flat gives two smudges at the edges of the tile
 * instead of a gem. The frame count comes from the index, measured when it is
 * built, because every support's art and two actives' are plain squares.
 */
test("an active gem's art is a sheet and a support's is one frame", () => {
  const active = gemArt("Winter Orb");
  assert.ok(active);
  assert.equal(active.frames, 3);

  const support = gemArt("Increased Area of Effect");
  assert.ok(support);
  assert.equal(support.frames, 1);
});

/** Quickstep is an active skill whose art is a single square, unlike the rest. */
test("an active gem with single-frame art is not stacked", () => {
  const quickstep = gemArt("Quickstep");
  assert.ok(quickstep, "Quickstep should resolve to art");
  assert.equal(quickstep.frames, 1);
});

/** A transfigured gem borrows its base gem's picture, and its frame count with it. */
test("a transfigured gem inherits the base gem's frames", () => {
  const base = gemArt("Frostblink");
  const transfigured = gemArt("Frostblink of Wintry Blast");
  assert.ok(base);
  assert.ok(transfigured);
  assert.equal(transfigured.src, base.src);
  assert.equal(transfigured.frames, base.frames);
});

/**
 * The skill list and the art index come from the same refresh, and a skill the
 * form offers that the art index cannot draw is exactly how Kinetic Fusillade
 * reached the player page as a card without a gem: the snapshot both were cut
 * from was two years old, and neither knew it.
 */
test("every skill offered has gem art", () => {
  const missing = skillNames().filter((name) => !gemArt(name));
  assert.deepEqual(missing, []);
  assert.ok(gemArt("Kinetic Fusillade"), "the current data has Kinetic Fusillade");
});

test("a renamed gem still resolves under its old name", () => {
  assert.equal(gemArt("Dark Pact")?.src, gemArt("Dark Bargain")?.src);
  assert.equal(gemArt("Lesser Multiple Projectiles")?.src, gemArt("Multiple Projectiles")?.src);
});

test("a build is a gem the index can draw, never prose", () => {
  assert.equal(buildSkill("poe1", "Kinetic Fusillade", null), "Kinetic Fusillade");
  assert.equal(buildSkill("poe1", null, "tectonic slam"), "Tectonic Slam");
  assert.equal(buildSkill("poe1", null, "poison srs"), null);
  assert.equal(buildSkill("poe1", "Not A Real Gem", null), null);
  assert.equal(buildSkill("poe1", null, "Unknown"), null);
});

/**
 * Path of Exile 2 has its own index, from its own export: every skill the form
 * offers has a picture, and a name both games use resolves to each game's own.
 */
test("every Path of Exile 2 skill has gem art, and shared names stay apart", () => {
  const missing = skillNamesFor("poe2").filter((name) => !skillArt("poe2", name));
  assert.deepEqual(missing, []);
  assert.ok(skillNamesFor("poe2").length > 200);
  const poe1 = skillArt("poe1", "Spark");
  const poe2 = skillArt("poe2", "Spark");
  assert.ok(poe1 && poe2);
  assert.notEqual(poe1.src, poe2.src);
  assert.match(poe2.src, /^\/items\/poe2\//);
  assert.equal(poe2.frames, 1);
  assert.equal(buildSkill("poe2", null, "companion / Zekoa the monkey masher"), null);
});
