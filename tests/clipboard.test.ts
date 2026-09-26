import assert from "node:assert/strict";
import test from "node:test";
import { ClipboardItemError, parseClipboardItem } from "../src/lib/games/shared/clipboard";
import { emptyBuild } from "../src/lib/games/poe1/pob";
import { findItemArt } from "../src/lib/games/poe1/item-art";
import { applySlotItems, parseSlotItems } from "../src/lib/slot-items";

const MAGEBLOOD = `Item Class: Belts
Rarity: Unique
Mageblood
Heavy Belt
--------
Requirements:
Level: 44
--------
Item Level: 80
--------
{ Implicit Modifier — Attribute }
+35(25-35) to Strength
--------
{ Unique Modifier — Attribute }
+33(30-50) to Dexterity
{ Unique Modifier — Elemental, Fire, Resistance }
+21(15-25)% to Fire Resistance
{ Unique Modifier — Elemental, Cold, Resistance }
+15(15-25)% to Cold Resistance
{ Unique Modifier }
Magic Utility Flasks cannot be Used
{ Unique Modifier }
Leftmost 4(2-4) Magic Utility Flasks constantly apply their Flask Effects to you
{ Unique Modifier }
Magic Utility Flask Effects cannot be removed
--------
Rivers of power course through your veins.
`;

/** The advanced form (Ctrl+Alt+C): a header over every mod, the roll's range after each number. */
test("an item copied from the game with its mod headers reads with rolls, no ranges, and no verse", () => {
  const item = parseClipboardItem(MAGEBLOOD, 7);
  assert.equal(item.id, 7);
  assert.equal(item.rarity, "UNIQUE");
  assert.equal(item.name, "Mageblood");
  assert.equal(item.base, "Heavy Belt");
  assert.equal(item.itemLevel, 80);
  assert.equal(item.levelReq, 44);
  assert.deepEqual(item.requires, [{ text: "Level 44", modified: false }]);
  assert.deepEqual(item.implicits, ["+35 to Strength"]);
  assert.deepEqual(item.explicits, [
    "+33 to Dexterity",
    "+21% to Fire Resistance",
    "+15% to Cold Resistance",
    "Magic Utility Flasks cannot be Used",
    "Leftmost 4 Magic Utility Flasks constantly apply their Flask Effects to you",
    "Magic Utility Flask Effects cannot be removed",
  ]);
  assert.equal(item.raw, MAGEBLOOD);
  // The picture follows from the name: the art index knows the unique.
  const art = findItemArt(item);
  assert.ok(art && /Belt/.test(art.src), `no art for Mageblood: ${art?.src}`);
});

/** The plain form (Ctrl+C): no headers, a "(implicit)"/"(crafted)" suffix instead, the game's own figures. */
test("a plainly copied rare reads its properties, requirements, sockets, tags and flags", () => {
  const item = parseClipboardItem(
    `Item Class: Body Armours
Rarity: Rare
Doom Shell
Astral Plate
--------
Quality: +20% (augmented)
Armour: 1234 (augmented)
--------
Requirements:
Level: 62
Str: 180 (augmented)
Dex: 14
--------
Sockets: R-R-R-G-B B
--------
Item Level: 84
--------
+12% to all Elemental Resistances (implicit)
--------
+98 to maximum Life
+41% to Fire Resistance
+1 to Level of Socketed Gems (crafted)
Enemies you Kill Explode (fractured)
--------
Shaper Item
Corrupted
--------
Note: ~b/o 1 divine`,
    3,
  );
  assert.equal(item.name, "Doom Shell");
  assert.equal(item.base, "Astral Plate");
  assert.equal(item.quality, 20);
  assert.equal(item.armour, 1234);
  assert.equal(item.itemLevel, 84);
  assert.deepEqual(item.requires, [
    { text: "Level 62", modified: false },
    { text: "180 Str", modified: true },
    { text: "14 Dex", modified: false },
  ]);
  assert.deepEqual(item.sockets, [["R", "R", "R", "G", "B"], ["B"]]);
  assert.deepEqual(item.implicits, ["+12% to all Elemental Resistances"]);
  assert.deepEqual(item.explicits, [
    "+98 to maximum Life",
    "+41% to Fire Resistance",
    "+1 to Level of Socketed Gems  ·  crafted",
    "Enemies you Kill Explode  ·  fractured",
  ]);
  assert.deepEqual(item.influences, ["Shaper"]);
  assert.deepEqual(item.flags, ["Corrupted"]);
  assert.equal(item.properties, undefined, "Quality and Armour are fields, not properties");
});

test("a flask keeps its sentences as properties, and a magic item's name is searched for its base", () => {
  const flask = parseClipboardItem(
    `Item Class: Utility Flasks
Rarity: Magic
Bountiful Quicksilver Flask of the Dove
--------
Quality: +20% (augmented)
Lasts 6.00 (augmented) Seconds
Consumes 20 of 60 Charges on use
Currently has 0 Charges
40% increased Movement Speed
--------
Requirements:
Level: 4
--------
Item Level: 71
--------
27% increased Duration
+26% chance to Avoid being Stunned during Effect
--------
Right click to drink. Can only hold charges while in belt. Refill at Wells or by killing monsters.`,
    4,
  );
  assert.equal(flask.rarity, "MAGIC");
  assert.equal(flask.base, "Bountiful Quicksilver Flask of the Dove");
  assert.equal(flask.quality, 20);
  assert.deepEqual(flask.properties, [
    { name: "Lasts 6.00 Seconds", value: "" },
    { name: "Consumes 20 of 60 Charges on use", value: "" },
    { name: "40% increased Movement Speed", value: "" },
  ]);
  assert.deepEqual(flask.explicits, ["27% increased Duration", "+26% chance to Avoid being Stunned during Effect"]);
  const art = findItemArt(flask);
  assert.ok(art && /Quicksilver|Flask/i.test(art.src), `no art for a magic quicksilver flask: ${art?.src}`);
});

test("what is not a wearable item is refused by name", () => {
  assert.throws(() => parseClipboardItem("Item Class: Stackable Currency\nRarity: Currency\nDivine Orb\n--------\nStack Size: 1/10", 1), ClipboardItemError);
  assert.throws(() => parseClipboardItem("hello", 1), /Rarity/);
  assert.throws(() => parseClipboardItem("Rarity: Rare\n", 1), /no name/);
});

/**
 * A paste sits over the stored build, never in it: the slot takes the pasted
 * item and the one it displaced leaves, unless the build still uses it
 * elsewhere. A paste that no longer reads is skipped, not shown broken.
 */
test("pasted items take their slots over the build and displace what was there", () => {
  const build = {
    ...emptyBuild(),
    items: [
      { id: 1, rarity: "RARE", name: "Old Belt", base: "Leather Belt", sockets: [], influences: [], flags: [], implicits: [], explicits: [], raw: "" },
      { id: 2, rarity: "RARE", name: "Ring", base: "Iron Ring", sockets: [], influences: [], flags: [], implicits: [], explicits: [], raw: "" },
    ],
    slots: { Belt: 1, "Ring 1": 2 },
  };
  const out = applySlotItems(build, { Belt: MAGEBLOOD, Helmet: "not an item", Gloves: MAGEBLOOD.replace("Mageblood", "Other") });
  assert.equal(out.slots["Ring 1"], 2, "an untouched slot keeps its item");
  const belt = out.items.find((item) => item.id === out.slots.Belt)!;
  assert.equal(belt.name, "Mageblood");
  assert.equal(belt.slot, "Belt");
  assert.ok(!out.items.some((item) => item.id === 1), "the displaced belt is gone");
  assert.ok(out.items.some((item) => item.id === 2), "the ring stays");
  assert.equal(out.slots.Helmet, undefined, "a paste that does not read fills nothing");
  assert.equal(out.items.find((item) => item.id === out.slots.Gloves)?.name, "Other");
  assert.deepEqual(build.slots, { Belt: 1, "Ring 1": 2 }, "the stored build is not mutated");
  assert.equal(applySlotItems(build, {}), build, "nothing pasted, nothing changed");

  assert.deepEqual(parseSlotItems(null), {});
  assert.deepEqual(parseSlotItems("garbage"), {});
  assert.deepEqual(parseSlotItems(JSON.stringify({ Belt: "x", Ring: "", Amulet: 3 })), { Belt: "x" });
});
