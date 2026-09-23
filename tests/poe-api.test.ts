import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildFromPoeExport,
  POE_API_VERSION,
  PoeExportError,
  readPoeExport,
  rebuildFromStoredExport,
  storedPayload,
  type PoeExport,
} from "../src/lib/games/poe1/poe-api";
import { buildTooltip } from "../src/lib/games/poe1/tooltip";
import type { BuildData } from "../src/lib/types";

/**
 * Four real characters off the owner's own account, trimmed to the cases worth
 * keeping honest: a complete paper doll, a shield, a socketed abyss jewel, tree
 * jewels, and a Legacy of Phrecia character on the event tree. Two of them keep
 * the untouched API payload, which is where a requirement's "(gem)" marker and
 * a socketed jewel's own modifiers survive.
 */
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "poe-export.json");
const exported = readPoeExport(fs.readFileSync(FIXTURE, "utf8"));

function character(name: string): BuildData {
  const found = exported.characters.find((entry) => entry.name === name);
  assert.ok(found, `no ${name} in the fixture`);
  return buildFromPoeExport(found, exported);
}

function itemAt(build: BuildData, slot: string) {
  const id = build.slots[slot];
  const item = build.items.find((candidate) => candidate.id === id);
  assert.ok(item, `nothing in ${slot}`);
  return item;
}

test("the export is read as a whole account", () => {
  assert.equal(exported.account, "zxBlasphemy#5164");
  assert.equal(exported.realm, "pc");
  assert.equal(exported.characters.length, 4);
});

test("a file that is not an export is refused rather than half-read", () => {
  assert.throws(() => readPoeExport("not json"), PoeExportError);
  assert.throws(() => readPoeExport(JSON.stringify({ characters: [] })), PoeExportError);
  assert.throws(() => readPoeExport(JSON.stringify({ schema_version: 1, characters: [] })), PoeExportError);
});

/**
 * A schema the archive has not been taught is refused outright. The endpoints
 * behind the export are undocumented and can change; guessing at a shape that
 * moved would write nonsense into the archive rather than failing loudly.
 */
test("a newer schema is refused rather than guessed at", () => {
  assert.throws(
    () => readPoeExport(JSON.stringify({ schema_version: 2, characters: [{ name: "x" }] })),
    /schema 2/,
  );
});

test("slots are renamed to the ones the paper doll is laid out on", () => {
  const build = character("TheLocalVoid");
  assert.deepEqual(Object.keys(build.slots).sort(), [
    "Amulet",
    "Belt",
    "Body Armour",
    "Boots",
    "Flask 1",
    "Flask 2",
    "Flask 3",
    "Flask 4",
    "Flask 5",
    "Gloves",
    "Helmet",
    "Ring 1",
    "Ring 2",
    "Weapon 1",
    "Weapon 1 Swap",
    "Weapon 2",
    "Weapon 2 Swap",
  ]);
});

/**
 * The swap set is worn, so it is kept. The paper doll has no cell for it and
 * `GearGrid` draws it underneath rather than dropping it — an export that lists
 * an item the archive cannot place must not lose it.
 */
test("the weapon swap set is kept, not discarded", () => {
  const build = character("TheLocalVoid");
  assert.ok(build.slots["Weapon 1 Swap"]);
  assert.ok(build.slots["Weapon 2 Swap"]);
});

/**
 * The one thing the API knows that Path of Building's export does not: a
 * requirement raised by a socketed gem, which the game marks "(gem)" because
 * the item itself does not need it. Fate Wrap is a Saintly Chainmail — 115 Int
 * on the base, 18% reduced by its own modifier, and the API reports 94, which
 * is 115 x 0.82 rounded down. That is also the confirmation that the derivation
 * used for Path of Building imports rounds the right way.
 */
test("requirements come from the game, marker and all", () => {
  const body = itemAt(character("TheLocalVoid"), "Body Armour");
  assert.equal(body.name, "Fate Wrap");
  assert.deepEqual(body.requires, [
    { text: "Level 70", modified: false },
    { text: "151 Str (gem)", modified: false },
    { text: "94 Int", modified: true },
  ]);

  const requires = buildTooltip(body).find((section) => section.kind === "requires");
  assert.deepEqual(requires?.lines.map((line) => line.text), ["Level 70", "151 Str (gem)", "94 Int"]);
  // Only the figure the item itself changed is coloured as changed.
  assert.deepEqual(requires?.lines.map((line) => line.tags), [[], [], ["modified"]]);
});

/** A shield states its block, so nothing is derived from the base catalogue. */
test("a shield's block is taken as reported", () => {
  const shield = itemAt(character("vCVRSE"), "Weapon 2");
  assert.equal(shield.name, "Oblivion Spell");
  assert.equal(shield.block, 40);
  const defences = buildTooltip(shield).find((section) => section.kind === "defences");
  assert.ok(defences?.lines.some((line) => line.text === "Chance to Block: 40%"));
});

test("a weapon's damage and attack speed survive as tooltip lines", () => {
  const weapon = itemAt(character("TheLocalVoid"), "Weapon 1");
  const defences = buildTooltip(weapon).find((section) => section.kind === "defences");
  const text = defences?.lines.map((line) => line.text).join(" | ") ?? "";
  assert.match(text, /Critical Strike Chance/);
  assert.match(text, /Attacks per Second/);
  // The item class — "Wand", "Sceptre" — is a label the archive never shows.
  assert.doesNotMatch(text, /^Wand|Sceptre/);
});

test("gems group by socket group and carry the attribute the API states", () => {
  const build = character("TheLocalVoid");
  const body = build.skillGroups.filter((group) => group.slot === "Body Armour");
  assert.equal(body.length, 2, "the six-link and the lone aura are two groups");
  const linked = body.find((group) => group.gems.length > 1);
  assert.ok(linked);
  assert.deepEqual(
    linked.gems.map((gem) => `${gem.name}/${gem.color}`),
    [
      "Burning Damage Support/r",
      "Cruelty Support/r",
      "Ignite Proliferation Support/b",
      "Vaal Detonate Dead/g",
      "Combustion Support/b",
    ],
  );
  assert.equal(build.mainSkill, "Vaal Detonate Dead");
  assert.equal(build.skillGroups.filter((group) => group.isMain).length, 1);
  assert.equal(build.skillGroups.find((group) => group.isMain)?.slot, "Body Armour");
});

/**
 * An abyss jewel sits in a socket but is an item. The normalized entry keeps
 * only its base type, so its own name and modifiers are read back out of the
 * untouched payload — without that it would render as a nameless Hypnotic Eye
 * Jewel with no mods at all.
 */
test("an abyss jewel socketed in gear becomes an item in its own slot", () => {
  const build = character("WelcomeToMySimulation");
  const jewel = itemAt(build, "Belt Abyssal Socket 1");
  assert.equal(jewel.name, "Morbid Iridescence");
  assert.equal(jewel.base, "Hypnotic Eye Jewel");
  assert.equal(jewel.rarity, "RARE");
  assert.ok(jewel.explicits.includes("+25 to maximum Life"));
  assert.ok(build.skillGroups.every((group) => group.gems.every((gem) => gem.name !== "Hypnotic Eye Jewel")));
});

test("tree jewels are items the tree points at, not equipment", () => {
  const build = character("vCVRSE");
  assert.equal(build.treeJewels?.length, 2);
  const jewels = build.treeJewels!.map((id) => build.items.find((item) => item.id === id));
  assert.deepEqual(jewels.map((jewel) => jewel?.name), ["Foul Arbiter", "Morbid Song"]);
  assert.ok(jewels.every((jewel) => jewel?.slot === undefined));
});

test("the passives are named, not just counted", () => {
  const build = character("vCVRSE");
  assert.deepEqual(build.passives?.keystones, ["Ghost Reaver", "Ghost Dance"]);
  assert.equal(build.trees[0].nodeCount, 126);
  assert.equal(build.trees[0].masteryCount, 12);
  assert.ok(build.trees[0].url?.startsWith("https://www.pathofexile.com/"));
  // A mastery is a choice, so it records the effect taken, not the node.
  assert.ok(build.passives?.masteries.every((mastery) => mastery.effect.length > 0));
});

/** Legacy of Phrecia runs on its own tree, and the export says which. */
test("an event tree is marked as one", () => {
  const build = character("BEVSTCHEESE");
  assert.equal(build.passives?.variant, "alternate");
  assert.equal(build.ascendClassName, "Herald");
  assert.equal(build.className, "Witch");
});

/**
 * The API computes nothing. Inventing a stat here would put a number on the
 * page that no part of the game ever produced.
 */
test("no player stats are invented", () => {
  for (const entry of exported.characters) {
    const build = buildFromPoeExport(entry, exported);
    assert.deepEqual(build.stats, {});
    assert.equal(build.source, "poe-api");
    assert.equal(build.origin?.account, "zxBlasphemy#5164");
  }
});

/**
 * The stored payload is the whole point of keeping one: a fix to the mapping
 * has to reach characters already imported, and the endpoints it came from are
 * rate-limited, undocumented, and cannot return a character that was deleted.
 */
test("a stored payload rebuilds the same build without the file", () => {
  for (const entry of exported.characters) {
    const built = buildFromPoeExport(entry, exported);
    const replayed = rebuildFromStoredExport(storedPayload(entry, exported));
    assert.deepEqual(replayed, built, `${entry.name} did not replay identically`);
  }
});

test("the mapper has a version, so a fix can be replayed", () => {
  assert.ok(Number.isInteger(POE_API_VERSION) && POE_API_VERSION >= 1);
});

/** Every item resolves to a picture: the local catalogue, or the CDN it names. */
test("nothing imported is left without art", async () => {
  const { findItemArt } = await import("../src/lib/games/poe1/item-art");
  for (const entry of exported.characters) {
    for (const item of buildFromPoeExport(entry, exported).items) {
      assert.ok(findItemArt(item), `${item.name} (${item.base}) has no art`);
    }
  }
});

/** A trimmed export with no payloads must still import, just with less in it. */
test("an export without the untouched payloads still imports", () => {
  const stripped: PoeExport = {
    ...exported,
    characters: exported.characters.map((entry) => ({
      ...entry,
      raw: { ...entry.raw, raw: undefined },
    })),
  };
  const build = buildFromPoeExport(stripped.characters[0], stripped);
  assert.ok(build.items.length > 0);
  const body = build.items.find((item) => item.slot === "Body Armour");
  // Without the payload the "(gem)" marker is gone, but the figure is not.
  assert.deepEqual(body?.requires?.map((part) => part.text), ["Level 70", "151 Str", "94 Int"]);
});
