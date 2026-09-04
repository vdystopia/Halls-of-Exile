import assert from "node:assert/strict";
import test from "node:test";
import { parseItem } from "../src/lib/items";
import { buildTooltip, type SectionKind } from "../src/lib/tooltip";

const kinds = (item: Parameters<typeof buildTooltip>[0]): SectionKind[] =>
  buildTooltip(item).map((section) => section.kind);

const linesOf = (item: Parameters<typeof buildTooltip>[0], kind: SectionKind): string[] =>
  buildTooltip(item).find((section) => section.kind === kind)?.lines.map((l) => l.text) ?? [];

/** The ring from the report: an anoint, a league mod and an implicit were all one block. */
const RING = parseItem(
  `Rarity: RARE
Mind Knuckle
Moonstone Ring
Unique ID: abc123
Item Level: 85
LevelReq: 59
BasePercentile: 0.7231
Quality: 20
Implicits: 3
Your Empowering Towers have 25% increased Range
Intangibility: 19%
10% increased Cast Speed
+48 to Strength
+44 to Dexterity
+108 to maximum Life
Fractured Item`,
  1,
);

test("sections keep the standard order", () => {
  assert.deepEqual(kinds(RING), ["quality", "anoint", "special", "implicit", "explicit"]);
});

test("the anoint, the league mod and the implicit each get their own section", () => {
  assert.deepEqual(linesOf(RING, "anoint"), ["Your Empowering Towers have 25% increased Range"]);
  assert.deepEqual(linesOf(RING, "special"), ["Intangibility: 19%"]);
  assert.deepEqual(linesOf(RING, "implicit"), ["10% increased Cast Speed"]);
  assert.equal(linesOf(RING, "explicit").length, 3);
});

test("item level, level requirement, base percentile and the fractured label never appear", () => {
  const everything = buildTooltip(RING)
    .flatMap((section) => section.lines.map((line) => line.text))
    .join("\n");
  for (const banned of ["Item Level", "Requires Level", "LevelReq", "BasePercentile", "Fractured Item"]) {
    assert.equal(everything.includes(banned), false, `${banned} leaked into the tooltip`);
  }
});

test("a base percentile line is not mistaken for a mod", () => {
  assert.equal(RING.explicits.some((mod) => /BasePercentile/i.test(mod)), false);
  assert.equal(RING.implicits.some((mod) => /BasePercentile/i.test(mod)), false);
});

test("quality is dropped when there is none", () => {
  const noQuality = parseItem(
    `Rarity: RARE
Plain Thing
Iron Ring
Implicits: 0
+10 to maximum Life`,
    2,
  );
  assert.equal(kinds(noQuality).includes("quality"), false);
});

test("a shield shows its modified block with the other defences, in order", () => {
  const shield = parseItem(
    `Rarity: RARE
Doom Ward
Titanium Spirit Shield
Quality: 20
Armour: 120
Evasion: 90
Energy Shield: 96
Block: 25
BaseBlock: 22
Sockets: B-B
Implicits: 1
16% increased Spell Damage
+108 to maximum Life`,
    3,
  );
  assert.deepEqual(linesOf(shield, "defences"), [
    "Armour: 120",
    "Evasion Rating: 90",
    "Energy Shield: 96",
    "Chance to Block: 25%",
  ]);
  assert.deepEqual(kinds(shield), ["quality", "defences", "sockets", "implicit", "explicit"]);
});

test("an amulet anoint is recognised", () => {
  const amulet = parseItem(
    `Rarity: RARE
Onslaught Locket
Marble Amulet
Implicits: 2
Allocates Whispers of Doom
Regenerate 1.2% of Life per second
+82 to maximum Life`,
    4,
  );
  assert.deepEqual(linesOf(amulet, "anoint"), ["Allocates Whispers of Doom"]);
  assert.deepEqual(linesOf(amulet, "implicit"), ["Regenerate 1.2% of Life per second"]);
});

test("corruption stays at the bottom and keeps its own line", () => {
  const corrupted = parseItem(
    `Rarity: UNIQUE
Emberwake
Ruby Ring
Implicits: 1
+25% to Fire Resistance
15% increased Fire Damage
Corrupted`,
    5,
  );
  const order = kinds(corrupted);
  assert.equal(order[order.length - 1], "footer");
  assert.deepEqual(linesOf(corrupted, "footer"), ["Corrupted"]);
});
