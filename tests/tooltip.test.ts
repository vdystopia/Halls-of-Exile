import assert from "node:assert/strict";
import test from "node:test";
import { parseItem } from "../src/lib/items";
import { buildTooltip, requirementLine, shieldBlock, type SectionKind } from "../src/lib/tooltip";

const kinds = (item: Parameters<typeof buildTooltip>[0]): SectionKind[] =>
  buildTooltip(item).map((section) => section.kind);

const linesOf = (item: Parameters<typeof buildTooltip>[0], kind: SectionKind): string[] =>
  buildTooltip(item).find((section) => section.kind === kind)?.lines.map((l) => l.text) ?? [];

/**
 * Real item text, taken verbatim from a Path of Building export. The synthetic
 * fixtures this replaced hid the actual defect: "Intangibility: 19%" sits in
 * the header region above Unique ID, and reading it as a mod shifted the
 * implicit boundary so the ring's real implicit landed among the explicits.
 */
const RING = parseItem(
  `Rarity: RARE
Mind Knuckle
Moonstone Ring
Intangibility: 19%
Unique ID: 44cb867c8b8e499a92255459b1492db9
Item Level: 85
LevelReq: 59
Implicits: 2
{crafted}Your Empowering Towers have 25% increased Range
10% increased Cast Speed
+48 to Strength
+44 to Dexterity
Adds 6 to 12 Cold Damage to Attacks
+108 to maximum Life
Regenerate 33.3 Life per second
+59 to maximum Mana
+43% to Fire Resistance`,
  1,
);

test("the ring's implicit is its own section, not the first explicit", () => {
  assert.deepEqual(linesOf(RING, "anoint"), ["Your Empowering Towers have 25% increased Range"]);
  assert.deepEqual(linesOf(RING, "implicit"), ["10% increased Cast Speed"]);
  assert.equal(linesOf(RING, "explicit").length, 7);
  assert.equal(linesOf(RING, "explicit")[0], "+48 to Strength");
});

test("a league mechanic in the header is not counted as a mod", () => {
  assert.deepEqual(linesOf(RING, "special"), ["Intangibility: 19%"]);
  assert.equal(RING.implicits.length, 2, "the implicit region should still hold exactly two lines");
  assert.equal(
    [...RING.implicits, ...RING.explicits].some((mod) => /Intangibility/.test(mod)),
    false,
  );
});

test("sections keep the standard order", () => {
  assert.deepEqual(kinds(RING), ["anoint", "special", "requires", "implicit", "explicit"]);
});

test("item level, base percentile and the fractured label never appear", () => {
  const boots = parseItem(
    `Rarity: RARE
Pain Spark
Harpyskin Boots
Evasion: 735
EvasionBasePercentile: 0.9785
Intangibility: 23%
Unique ID: 706e8f9d35549ef3
Searing Exarch Item
Item Level: 84
Quality: 20
Sockets: G-G-G-G
LevelReq: 78
Implicits: 2
23% chance to Avoid Elemental Ailments
4% increased Action Speed
74% increased Evasion Rating
{fractured}+35% to Chaos Resistance
Fractured Item`,
    2,
  );
  const everything = buildTooltip(boots)
    .flatMap((section) => section.lines.map((line) => line.text))
    .join("\n");
  for (const banned of ["Item Level", "LevelReq", "BasePercentile", "Fractured Item"]) {
    assert.equal(everything.includes(banned), false, `${banned} leaked into the tooltip`);
  }
  // The level requirement is shown, as the game shows it.
  assert.match(everything, /Requires Level 78/);
  assert.deepEqual(linesOf(boots, "defences"), ["Evasion Rating: 735"]);
  assert.equal(linesOf(boots, "footer").includes("Searing Exarch Item"), true);
});

test("a flask's enchantment is separated from its explicits", () => {
  const flask = parseItem(
    `Rarity: MAGIC
Surgeon's Silver Flask of Rupturing
Unique ID: 9695f2a70accd96a
Item Level: 85
Quality: 20
LevelReq: 64
Implicits: 1
{crafted}Used when Charges reach full
32% chance to gain a Flask Charge when you deal a Critical Strike
40% increased Critical Strike Chance during Effect`,
    3,
  );
  assert.deepEqual(linesOf(flask, "enchant"), ["Used when Charges reach full"]);
  assert.equal(linesOf(flask, "explicit").length, 2);
  assert.deepEqual(kinds(flask), ["quality", "requires", "enchant", "explicit"]);
});

test("a tower anoint is recognised whatever verb follows", () => {
  const coral = parseItem(
    `Rarity: RARE
Behemoth Grasp
Coral Ring
Item Level: 85
LevelReq: 64
Implicits: 2
{crafted}Your Meteor Towers create Burning Ground for 3 seconds on Hit
+29 to maximum Life
+82 to maximum Life
{fractured}+18% to Fire and Chaos Resistances
Fractured Item`,
    4,
  );
  assert.deepEqual(linesOf(coral, "anoint"), [
    "Your Meteor Towers create Burning Ground for 3 seconds on Hit",
  ]);
  assert.deepEqual(linesOf(coral, "implicit"), ["+29 to maximum Life"]);
});

test("an amulet anoint and its memory strands are each their own section", () => {
  const amulet = parseItem(
    `Rarity: RARE
Bramble Charm
Agate Amulet
Intangibility: 8%
Unique ID: f7cbf6af34e39fe3
Item Level: 85
Memory Strands: 29
LevelReq: 65
Implicits: 2
{crafted}Allocates Ash, Frost and Storm
+23 to Strength and Intelligence
+54 to Dexterity
+128 to maximum Life`,
    5,
  );
  assert.deepEqual(linesOf(amulet, "anoint"), ["Allocates Ash, Frost and Storm"]);
  assert.deepEqual(linesOf(amulet, "special"), ["Intangibility: 8%", "Memory Strands: 29"]);
  assert.deepEqual(linesOf(amulet, "implicit"), ["+23 to Strength and Intelligence"]);
});

test("a shield keeps its defences, sockets and quality in order", () => {
  const shield = parseItem(
    `Rarity: RARE
Oblivion Spell
Harmonic Spirit Shield
Energy Shield: 158
EnergyShieldBasePercentile: 0.3333
Intangibility: 30%
Unique ID: 4ba5afe8a0d5e8bb
Item Level: 84
Memory Strands: 41
Quality: 20
Sockets: B-B-W
LevelReq: 65
Implicits: 1
14% increased Spell Damage
74% increased Chance to Block
{crafted}3% additional Physical Damage Reduction`,
    6,
  );
  assert.deepEqual(kinds(shield), [
    "quality",
    "special",
    "defences",
    "sockets",
    "requires",
    "implicit",
    "explicit",
  ]);
  // 23 base block x 1.74 = 40.02
  assert.deepEqual(linesOf(shield, "defences"), ["Chance to Block: 40%", "Energy Shield: 158"]);
  assert.deepEqual(linesOf(shield, "implicit"), ["14% increased Spell Damage"]);
});

test("corruption stays at the bottom", () => {
  const jewel = parseItem(
    `Rarity: RARE
Vivid Curio
Crimson Jewel
Unique ID: fe760cbe182bf164
Item Level: 85
Implicits: 0
14% increased Damage with Maces or Sceptres
Corrupted`,
    7,
  );
  const order = kinds(jewel);
  assert.equal(order[order.length - 1], "footer");
  assert.deepEqual(linesOf(jewel, "footer"), ["Corrupted"]);
});

/** The shield from the screenshot: base block 27, +75% increased, shown as 47%. */
const BUCKLER = parseItem(
  `Rarity: RARE
Blight Refuge
Vaal Buckler
Evasion: 396
EvasionBasePercentile: 0
Intangibility: 14%
Unique ID: a4c587369b004054
Item Level: 85
Quality: 20
Sockets: G-B-W
LevelReq: 63
Implicits: 1
3% increased Movement Speed
75% increased Chance to Block
13% Chance to Block Spell Damage
+432 to Accuracy Rating
+151 to maximum Life
+38% to Lightning Resistance
{crafted}5% chance to deal Double Damage`,
  8,
);

test("a shield's block is its base raised by its own increases, rounded down", () => {
  // 27 base x 1.75 = 47.25
  assert.equal(shieldBlock(BUCKLER), 47);
  assert.ok(linesOf(BUCKLER, "defences").includes("Chance to Block: 47%"));
});

test("spell block is not counted toward attack block", () => {
  const spellOnly = parseItem(
    `Rarity: RARE
Test Shield
Vaal Buckler
Implicits: 0
40% Chance to Block Spell Damage`,
    9,
  );
  assert.equal(shieldBlock(spellOnly), 27, "base block should be unchanged by spell block");
});

test("only shields get a block line", () => {
  const ring = parseItem(`Rarity: RARE\nA Ring\nAmethyst Ring\nImplicits: 0\n+10 to maximum Life`, 10);
  assert.equal(shieldBlock(ring), null);
  assert.equal(linesOf(ring, "defences").length, 0);
});

test("the requirement line reads as the game shows it", () => {
  assert.deepEqual(linesOf(BUCKLER, "requires"), ["Requires Level 63, 159 Dex"]);
});

test("requirements sit between the sockets and the implicit", () => {
  assert.deepEqual(kinds(BUCKLER), [
    "quality",
    "special",
    "defences",
    "sockets",
    "requires",
    "implicit",
    "explicit",
  ]);
});

test("a base needing two attributes lists both, in Str Dex Int order", () => {
  const armour = parseItem(`Rarity: RARE\nTest\nFull Dragonscale\nImplicits: 0\n+10 to maximum Life`, 11);
  assert.deepEqual(linesOf(armour, "requires"), ["Requires Level 63, 115 Str, 94 Dex"]);
});
