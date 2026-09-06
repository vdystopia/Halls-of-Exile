import assert from "node:assert/strict";
import test from "node:test";
import { artIndexSize, findItemArt, uniqueArtIndexSize } from "../src/lib/item-art";

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

test("the index covers the uniques too", () => {
  assert.ok(uniqueArtIndexSize() > 1200, `index only has ${uniqueArtIndexSize()} uniques`);
});

/**
 * Dozens of uniques share one base — every Prismatic Jewel unique drew the
 * Mastery jewel's picture while art was keyed on the base type alone.
 */
test("a unique draws its own art, not its base type's", () => {
  const watchers = findItemArt({ name: "Watcher's Eye", base: "Prismatic Jewel", rarity: "UNIQUE" });
  const base = findItemArt({ name: "A Jewel", base: "Prismatic Jewel", rarity: "RARE" });
  assert.ok(watchers);
  assert.equal(watchers.src, "/items/Art/2DItems/Jewels/ElderJewel.png");
  assert.notEqual(watchers.src, base?.src);
});

test("a unique the index does not know still falls back to its base", () => {
  const art = findItemArt({ name: "Not A Real Unique", base: "Glorious Plate", rarity: "UNIQUE" });
  assert.ok(art);
  assert.match(art.src, /BodyArmours/);
  assert.equal(art.width, 2);
  assert.equal(art.height, 3);
});

/** A rare's name is randomly generated and could collide with a unique's. */
test("a rare is never matched against the unique names", () => {
  const art = findItemArt({ name: "Watcher's Eye", base: "Glorious Plate", rarity: "RARE" });
  assert.ok(art);
  assert.match(art.src, /BodyArmours/);
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

/**
 * RePoE records what the game data says, and a few of those paths are not what
 * the image CDN serves. Overrides are applied by the generator, so a typo would
 * silently do nothing — this catches one that names an item the index lacks, or
 * a correction that never made it into the index.
 */
test("every art override names a real item and is applied", async () => {
  const overrides = (await import("../src/lib/art-overrides.json")).default as Record<string, string>;
  const index = (await import("../src/lib/item-art-index.json")).default as unknown as {
    bases: Record<string, { art: string }>;
    uniques: Record<string, { art: string }>;
  };
  for (const [name, art] of Object.entries(overrides)) {
    if (name.startsWith("_")) continue;
    const entry = index.uniques[name] ?? index.bases[name];
    assert.ok(entry, `override names "${name}", which is not in the catalogue`);
    if (art) assert.equal(entry.art, art, `the override for "${name}" was not applied`);
  }
});
