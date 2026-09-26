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
 * A code is the whole build, so a character can be archived from a code alone.
 * Where the site's export is also on the row, the code replaces everything it
 * brought — gear included — and the export is only the fallback for a
 * character with no code.
 */
test("a code replaces everything the site's export brought", async () => {
  const { composePoe2Build } = await import("../src/lib/games/builds");
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const { readAccountExport, storedPayloadFor } = await import("../src/lib/games/exports");
  const exported = readAccountExport(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "poe2-export.json"), "utf8"));
  const stored = JSON.parse(JSON.stringify(storedPayloadFor(exported.characters[0], exported)));

  assert.deepEqual(composePoe2Build(CODE, stored), parsePob2(CODE));
  assert.deepEqual(composePoe2Build(CODE, null), parsePob2(CODE));
  assert.equal(composePoe2Build(null, stored)?.source, "poe2-site");
  assert.equal(composePoe2Build(null, null), null);
});

/**
 * With a code alone there is no picture the game named, so gear is drawn from
 * Path of Exile 2's own art index — never Path of Exile 1's.
 */
test("gear from a code alone finds Path of Exile 2 pictures", async () => {
  const { gearFor } = await import("../src/lib/games/gear");
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const build = parsePob2(CODE);
  const art = gearFor("poe2").art;
  const missing = Object.values(build.slots)
    .map((id) => build.items.find((item) => item.id === id)!)
    .filter((item) => !art(item))
    .map((item) => `${item.slot}: ${item.name} (${item.base})`);
  assert.deepEqual(missing, []);
  const yoke = build.items.find((item) => item.name === "Yoke of Suffering");
  assert.match(art(yoke!)?.src ?? "", /^\/items\/poe2\/.*YokeOfSuffering\.webp$/, "a unique is drawn by its own name");
  const flask = build.items.find((item) => item.slot === "Flask 1");
  assert.match(art(flask!)?.src ?? "", /FlaskLife/, "a magic flask by the base inside its name");
  assert.equal(art(flask!)?.frames, 1);
  for (const id of build.treeJewels ?? []) {
    assert.ok(art(build.items.find((item) => item.id === id)!), "tree jewels have pictures too");
  }
});

/**
 * Everything a Path of Exile 2 code equips has a cell on Path of Exile 2's
 * paper doll, or a flask or charm slot. Only the weapon swap set is drawn in
 * the row beneath, as extras: a main slot landing there would mean the doll and
 * the parser disagree on its name.
 */
test("every slot a Path of Exile 2 code equips has its place on the doll", async () => {
  const { parsePob2 } = await import("../src/lib/games/poe2/pob");
  const { gearFor } = await import("../src/lib/games/gear");
  const gear = gearFor("poe2");
  const places = new Set([...gear.doll.map((cell) => cell.slot), ...gear.flaskSlots]);
  const dir = path.join(process.cwd(), "tests", "fixtures");
  const homeless = new Set<string>();
  for (const file of fs.readdirSync(dir).filter((name) => /^poe2-pob-.*\.txt$/.test(name))) {
    const build = parsePob2(fs.readFileSync(path.join(dir, file), "utf8").trim());
    for (const slot of Object.keys(build.slots)) if (!places.has(slot) && !/Swap/.test(slot)) homeless.add(slot);
  }
  assert.deepEqual([...homeless], []);
});
