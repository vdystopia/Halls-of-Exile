import { findItemBase } from "./item-art";
import type { ParsedItem } from "./types";

/**
 * One standard layout for every item tooltip, so a wand and a shield read the
 * same way. Sections appear in this order and a section with nothing in it is
 * dropped entirely:
 *
 *   quality > anoint > defences > sockets > special > requires > implicit >
 *   enchant > explicit > footer
 *
 * Item level, base percentiles and the "Fractured Item" label are deliberately
 * never shown.
 */
export type SectionKind =
  | "quality"
  | "anoint"
  | "special"
  | "defences"
  | "sockets"
  | "requires"
  | "implicit"
  | "enchant"
  | "explicit"
  | "footer";

export type TooltipLine = { text: string; tags: string[] };
export type TooltipSection = { kind: SectionKind; lines: TooltipLine[] };

const SECTION_ORDER: SectionKind[] = [
  "quality",
  "anoint",
  "defences",
  "sockets",
  "special",
  "requires",
  "implicit",
  "enchant",
  "explicit",
  "footer",
];

/**
 * Anoints: amulets read "Allocates ...", and a ring's tower anoint reads
 * "Your <something> Towers ..." — which can be "have", "create" or anything
 * else, so match on the opening rather than the verb.
 */
const ANOINT = [/^Allocates\b/i, /^Your\b.*\bTowers?\b/i];

/**
 * Mods are stored as strings; a tagged one carries its tags after a "·"
 * separator, which is the format the parser has always written. Reading them
 * back keeps characters imported before this rendering correctly.
 */
export function splitMod(line: string): TooltipLine {
  const [text, tags] = line.split("  ·  ");
  return { text, tags: tags ? tags.split(", ").map((tag) => tag.trim()) : [] };
}

/**
 * Inside the implicit region, a crafted tag means the line is not one of the
 * base's own implicits: it is an anoint or, on a flask, an enchantment such as
 * "Used when Charges reach full".
 */
function classify(line: TooltipLine): Extract<SectionKind, "anoint" | "enchant" | "implicit"> {
  if (ANOINT.some((pattern) => pattern.test(line.text))) return "anoint";
  if (line.tags.includes("enchant") || line.tags.includes("crafted")) return "enchant";
  return "implicit";
}

/**
 * A shield's displayed block is its base block raised by the item's own
 * "increased Chance to Block" modifiers, rounded down. Spell block is a
 * separate stat and is deliberately not counted. Path of Building computes
 * this rather than writing it into the item text, so it is derived here from
 * the base's block chance in the catalogue.
 */
export function shieldBlock(item: ParsedItem): number | null {
  const base = findItemBase(item);
  if (!base?.block) return null;

  let increased = 0;
  for (const raw of [...item.implicits, ...item.explicits]) {
    const text = splitMod(raw).text;
    if (/spell/i.test(text)) continue;
    const match = /(\d+(?:\.\d+)?)%\s+increased\s+Chance\s+to\s+Block/i.exec(text);
    if (match) increased += Number(match[1]);
  }

  return Math.floor(base.block * (1 + increased / 100));
}

/**
 * The summed "reduced/increased Attribute Requirements" on an item, as a
 * percentage. Modifiers of the same kind add together, as they do in game, and
 * a requirement cannot be pushed below zero.
 */
function attributeRequirementPercent(item: ParsedItem): number {
  let percent = 0;
  for (const raw of [...item.implicits, ...item.explicits]) {
    const text = splitMod(raw).text;
    const reduced = /(\d+(?:\.\d+)?)%\s+reduced\s+Attribute\s+Requirements/i.exec(text);
    if (reduced) percent -= Number(reduced[1]);
    const increased = /(\d+(?:\.\d+)?)%\s+increased\s+Attribute\s+Requirements/i.exec(text);
    if (increased) percent += Number(increased[1]);
  }
  return Math.max(-100, percent);
}

/**
 * How much an item scales its own attribute requirements. Only attributes are
 * affected — the level requirement is not.
 */
export function attributeRequirementMultiplier(item: ParsedItem): number {
  return (100 + attributeRequirementPercent(item)) / 100;
}

/**
 * The parts of "Requires Level 63, 130 Dex", one per figure. The level comes
 * from the item, which already reflects its own modifiers; the attributes come
 * from its base, scaled by any "reduced Attribute Requirements" the item
 * carries. A part the item has changed is marked so the tooltip can colour it
 * the way the game colours a modified value — the level is never scaled by an
 * attribute modifier, so it stays plain.
 *
 * Rounding is down, matching the rule used for block. The game's own rounding
 * for this is not something the export records, so it is a choice, not a fact.
 */
export function requirementParts(item: ParsedItem): { text: string; modified: boolean }[] {
  const base = findItemBase(item);
  const level = item.levelReq ?? base?.req[0] ?? 0;
  const percent = attributeRequirementPercent(item);
  // Multiplying before dividing keeps whole-percent cases exact: 70 x 0.7 is
  // 48.99999999999999 in floating point, which would floor to 48.
  const scale = (value: number) => Math.floor((value * (100 + percent)) / 100);

  const parts: { text: string; modified: boolean }[] = [];
  if (level) parts.push({ text: `Level ${level}`, modified: false });
  if (base) {
    const [, strength, dexterity, intelligence] = base.req;
    for (const [value, name] of [
      [strength, "Str"],
      [dexterity, "Dex"],
      [intelligence, "Int"],
    ] as const) {
      if (value) parts.push({ text: `${scale(value)} ${name}`, modified: percent !== 0 });
    }
  }
  return parts;
}

export function buildTooltip(item: ParsedItem): TooltipSection[] {
  const buckets = new Map<SectionKind, TooltipLine[]>();
  const push = (kind: SectionKind, line: TooltipLine) => {
    const existing = buckets.get(kind);
    if (existing) existing.push(line);
    else buckets.set(kind, [line]);
  };
  const plain = (text: string) => ({ text, tags: [] });

  if (item.quality) push("quality", plain(`Quality: +${item.quality}%`));

  if (item.intangibility) push("special", plain(`Intangibility: ${item.intangibility}`));
  if (item.memoryStrands) push("special", plain(`Memory Strands: ${item.memoryStrands}`));

  // The implicit block carries anoints, league mods and enchants as well as the
  // item's own implicits; each gets its own section.
  for (const raw of item.implicits) {
    const line = splitMod(raw);
    if (!line.text) continue;
    push(classify(line), line);
  }

  const block = shieldBlock(item);
  if (block !== null) push("defences", plain(`Chance to Block: ${block}%`));
  if (item.armour) push("defences", plain(`Armour: ${item.armour}`));
  if (item.evasion) push("defences", plain(`Evasion Rating: ${item.evasion}`));
  if (item.energyShield) push("defences", plain(`Energy Shield: ${item.energyShield}`));

  if (item.sockets.length) push("sockets", plain("sockets"));

  // One line per figure, so the tooltip can colour a modified attribute without
  // colouring the level beside it.
  for (const part of requirementParts(item)) {
    push("requires", { text: part.text, tags: part.modified ? ["modified"] : [] });
  }

  for (const raw of item.explicits) {
    const line = splitMod(raw);
    if (line.text) push("explicit", line);
  }

  // "Fractured Item" is excluded by name; corruption and influence are not mods
  // and sit at the bottom the way the game shows them.
  for (const influence of item.influences) push("footer", plain(`${influence} Item`));
  for (const flag of item.flags) {
    if (flag === "Fractured Item") continue;
    push("footer", plain(flag));
  }

  return SECTION_ORDER.map((kind) => ({ kind, lines: buckets.get(kind) ?? [] })).filter(
    (section) => section.lines.length > 0,
  );
}
