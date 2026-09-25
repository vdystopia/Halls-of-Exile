import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";

/**
 * Path of Building 2 share codes. The fixture is TheVPleaser, a level 92
 * Deadeye imported into Path of Building 2 from the official API on 2026-09-25
 * (pobb.in/ki400ZFpsCnz): both weapon sets, attribute choices, two tree jewels,
 * eleven skill groups and every item kind the game has.
 */
const CODE = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-pob-thevpleaser.txt"), "utf8").trim();

/** A Path of Building 1 code, made from the fixture the Path of Exile 1 tests use. */
function poe1Code(): string {
  const xml = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "pob-clusters.xml"), "utf8");
  return zlib.deflateSync(Buffer.from(xml)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

test("a code names its own game, and the other game's code is refused by name", async () => {
  const { parseCodeFor } = await import("../src/lib/games/builds");
  assert.throws(() => parseCodeFor("poe1", CODE), /Path of Building 2 code/);
  assert.throws(() => parseCodeFor("poe2", poe1Code()), /Path of Exile 1/);
  assert.equal(parseCodeFor("poe2", CODE).className, "Ranger");
  assert.ok(parseCodeFor("poe1", poe1Code()).items.length > 0);
});

test("class, ascendancy, level and the stats Path of Building 2 computed", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const build = parsePob2(CODE);
  assert.equal(build.className, "Ranger");
  assert.equal(build.ascendClassName, "Deadeye");
  assert.equal(build.level, 92);
  assert.equal(build.stats.Life, 2196);
  assert.equal(build.stats.Spirit, 137);
  assert.equal(Math.round(build.stats.DeflectionRating), 7173);
  assert.equal(build.stats.FireResist, 75);
});

test("the tree keeps both weapon sets and every attribute choice", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const [tree] = parsePob2(CODE).trees;
  assert.equal(tree.treeVersion, "0.5");
  assert.equal(tree.nodes?.length, 150);
  assert.equal(tree.weaponSets?.[1].length, 24);
  assert.equal(tree.weaponSets?.[2].length, 24);
  // Weapon-set passives are allocated nodes too.
  const allocated = new Set(tree.nodes);
  assert.ok([...(tree.weaponSets?.[1] ?? []), ...(tree.weaponSets?.[2] ?? [])].every((node) => allocated.has(node)));
  assert.equal(tree.attributeChoices?.["2408"], "dex");
  assert.equal(tree.attributeChoices?.["24647"], "int");
  assert.equal(tree.attributeChoices?.["2582"], "str");
  assert.equal(Object.keys(tree.attributeChoices ?? {}).length, 24);
  // Path of Building 2 writes Path of Exile 1's viewer URL; no link is kept.
  assert.equal(tree.url, undefined);
});

test("skills carry their weapon set and where they come from", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const build = parsePob2(CODE);
  assert.equal(build.skillGroups.length, 11);
  assert.equal(build.mainSkill, "Snipe");
  const first = build.skillGroups[0];
  assert.equal(first.source, "Default Attack");
  assert.deepEqual(first.weaponSets, [1]);
  assert.equal(build.skillGroups[1].source, "Tree:5817");
  const frenzy = build.skillGroups.find((group) => group.gems[0].name === "Combat Frenzy");
  assert.deepEqual(frenzy?.weaponSets, [1, 2]);
  const attrition = build.skillGroups.find((group) => group.gems[0].name === "Attrition");
  assert.equal(attrition?.enabled, false);
  const iceShot = build.skillGroups.find((group) => group.gems[0].name === "Ice Shot");
  assert.deepEqual(
    iceShot?.gems.map((gem) => [gem.name, gem.support]),
    [
      ["Ice Shot", false],
      ["Rapid Attacks II", true],
      ["Elemental Armament II", true],
      ["Freeze", true],
      ["Cold Attunement", true],
      ["Fork", true],
    ],
  );
});

test("items read Path of Building 2's vocabulary: runes, tags and header keys", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const build = parsePob2(CODE);
  const byName = (name: string) => build.items.find((item) => item.name === name);

  const bow = byName("Hypnotic Breeze");
  assert.ok(bow);
  assert.deepEqual(bow.properties, [{ name: "Rune Sockets", value: "Greater Iron Rune, Greater Iron Rune" }]);
  assert.ok(bow.implicits.includes("36% increased Physical Damage  ·  enchant, rune"));
  assert.ok(bow.explicits.includes("Adds 24 to 31 Physical Damage  ·  crafted"));
  assert.ok(bow.explicits.includes("8% increased Attack Speed  ·  desecrated"));

  // "Rune: None" is an empty socket, not a rune called None.
  assert.equal(byName("Phoenix Brow")?.properties?.[0].value, "empty");

  // "Charm Slots: 2" is a header figure; "Has 2 Charm Slots" is the mod.
  const belt = byName("Doom Twine");
  assert.ok(belt?.implicits.includes("Has 2 Charm Slots"));
  assert.ok(![...(belt?.implicits ?? []), ...(belt?.explicits ?? [])].some((line) => line.startsWith("Charm Slots")));

  // No header key leaks into the mods, and every slot resolves to an item.
  const lines = build.items.flatMap((item) => [...item.implicits, ...item.explicits]);
  assert.ok(!lines.some((line) => /^(Unique ID|Item Level|LevelReq|Sockets|Rune|Prefix|Suffix|Quality):/.test(line)));
  for (const [slot, id] of Object.entries(build.slots)) {
    assert.ok(build.items.some((item) => item.id === id), `${slot} names an item`);
  }
  assert.deepEqual(Object.keys(build.slots).filter((slot) => /Charm|Flask/.test(slot)).sort(), [
    "Charm 1",
    "Charm 2",
    "Charm 3",
    "Flask 1",
    "Flask 2",
  ]);
  assert.deepEqual(build.treeJewels, [1, 2]);
});

/**
 * The two sources know different things, so a character with both keeps the
 * site's gear — the game's own figures and pictures — and everything else from
 * the code. The tree jewels come from the code, clear of the site's item ids.
 */
test("a code and the site's export combine without either undoing the other", async () => {
  const { composePoe2Build } = await import("../src/lib/games/builds");
  const { readAccountExport, storedPayloadFor } = await import("../src/lib/games/exports");
  const exported = readAccountExport(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-export.json"), "utf8"));
  const stored = JSON.parse(JSON.stringify(storedPayloadFor(exported.characters[0], exported)));

  const site = composePoe2Build(null, stored);
  const pob = composePoe2Build(CODE, null);
  const both = composePoe2Build(CODE, stored);
  assert.ok(site && pob && both);

  assert.equal(both.source, "pob");
  assert.deepEqual(both.trees, pob.trees);
  assert.deepEqual(both.skillGroups, pob.skillGroups);
  assert.deepEqual(both.stats, pob.stats);
  assert.deepEqual(both.slots, site.slots);
  assert.deepEqual(both.origin, site.origin);
  const siteIds = new Set(site.items.map((item) => item.id));
  assert.equal(both.items.length, site.items.length + 2);
  assert.equal(both.treeJewels?.length, 2);
  for (const id of both.treeJewels ?? []) {
    assert.ok(!siteIds.has(id), "a tree jewel's id cannot collide with an equipped item's");
    assert.ok(both.items.some((item) => item.id === id));
  }
  assert.equal(composePoe2Build(null, null), null);
});

/** Each game's code is current against its own parser's version. */
test("each game has its own parser version", async () => {
  const { parserVersionFor } = await import("../src/lib/games/builds");
  const { PARSER_VERSION } = await import("../src/lib/games/poe1/pob");
  const { POE2_PARSER_VERSION } = await import("../src/lib/games/poe2/pob");
  assert.equal(parserVersionFor("poe1"), PARSER_VERSION);
  assert.equal(parserVersionFor("poe2"), POE2_PARSER_VERSION);
});
