import assert from "node:assert/strict";
import test from "node:test";
import { gemColor, orderGems } from "../src/lib/gems";

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
