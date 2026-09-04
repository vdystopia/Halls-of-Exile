import assert from "node:assert/strict";
import test from "node:test";
import { parseItem } from "../src/lib/items";
import { buildTooltip, type SectionKind } from "../src/lib/tooltip";

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
  assert.deepEqual(kinds(RING), ["anoint", "special", "implicit", "explicit"]);
});

test("item level, level requirement, base percentile and the fractured label never appear", () => {
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
  for (const banned of ["Item Level", "Requires Level", "LevelReq", "BasePercentile", "Fractured Item"]) {
    assert.equal(everything.includes(banned), false, `${banned} leaked into the tooltip`);
  }
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
  assert.deepEqual(kinds(flask), ["quality", "enchant", "explicit"]);
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
  assert.deepEqual(kinds(shield), ["quality", "special", "defences", "sockets", "implicit", "explicit"]);
  assert.deepEqual(linesOf(shield, "defences"), ["Energy Shield: 158"]);
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
