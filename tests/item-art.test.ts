import assert from "node:assert/strict";
import test from "node:test";
import { artIndexSize, findItemArt } from "../src/lib/item-art";

test("the art index covers every equippable base", () => {
  assert.ok(artIndexSize() > 900, `index only has ${artIndexSize()} entries`);
});

test("a rare resolves through its base type", () => {
  const art = findItemArt({ name: "Havoc Beak", base: "Vaal Axe" });
  assert.ok(art);
  assert.equal(art.src, "/items/Art/2DItems/Weapons/TwoHandWeapons/TwoHandAxes/TwoHandAxe5.png");
  assert.equal(art.width, 2);
  assert.equal(art.height, 4);
});

test("a unique falls back to its base type's art", () => {
  const art = findItemArt({ name: "Kaom's Heart", base: "Glorious Plate" });
  assert.ok(art);
  assert.match(art.src, /BodyArmours/);
  assert.equal(art.width, 2);
  assert.equal(art.height, 3);
});

test("a magic item is matched through the affixes wrapping its base", () => {
  const art = findItemArt({
    name: "Seething Divine Life Flask of Staunching",
    base: "Seething Divine Life Flask of Staunching",
  });
  assert.ok(art, "no art found for a magic flask");
  assert.match(art.src, /Flasks/i);
});

test("the longest matching base wins", () => {
  // "Ring" is itself a base, and is a suffix of 40-odd others. A magic Amethyst
  // Ring must not fall through to the plain Ring art.
  const plain = findItemArt({ name: "Ring", base: "Ring" });
  const amethyst = findItemArt({ name: "Amethyst Ring", base: "Amethyst Ring" });
  const magic = findItemArt({
    name: "Hypnotic Amethyst Ring of the Whelpling",
    base: "Hypnotic Amethyst Ring of the Whelpling",
  });
  assert.ok(plain && amethyst && magic);
  assert.notEqual(amethyst.src, plain.src, "an Amethyst Ring resolved to the plain Ring art");
  assert.equal(magic.src, amethyst.src, "the magic ring did not resolve to its own base");
});

test("an unknown base has no art rather than a wrong one", () => {
  assert.equal(findItemArt({ name: "Nonsense", base: "Not A Real Base" }), null);
});

test("flask art is flagged as a three-layer sheet, other art is not", () => {
  const flask = findItemArt({ name: "Granite Flask", base: "Granite Flask" });
  const ring = findItemArt({ name: "Amethyst Ring", base: "Amethyst Ring" });
  assert.ok(flask && ring);
  assert.equal(flask.frames, 3, "flask art is a sheet of glass, frame and liquid layers");
  assert.equal(ring.frames, 1);
});
