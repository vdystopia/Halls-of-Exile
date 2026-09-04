import type { ParsedItem } from "./types";

/**
 * One standard layout for every item tooltip, so a wand and a shield read the
 * same way. Sections appear in this order and a section with nothing in it is
 * dropped entirely:
 *
 *   quality > anoint > special > defences > sockets > implicit > enchant > explicit
 *
 * Item level, level requirement, base percentiles and the "Fractured Item"
 * label are deliberately never shown.
 */
export type SectionKind =
  | "quality"
  | "anoint"
  | "special"
  | "defences"
  | "sockets"
  | "implicit"
  | "enchant"
  | "explicit"
  | "footer";

export type TooltipLine = { text: string; tags: string[] };
export type TooltipSection = { kind: SectionKind; lines: TooltipLine[] };

const SECTION_ORDER: SectionKind[] = [
  "quality",
  "anoint",
  "special",
  "defences",
  "sockets",
  "implicit",
  "enchant",
  "explicit",
  "footer",
];

/** Anoints: amulets read "Allocates ...", ring tower anoints read "Your ... Towers ...". */
const ANOINT = [/^Allocates\b/i, /\bTowers?\b.*\bhave\b/i];

/** League mechanics the game gives their own block, above the item's own mods. */
const SPECIAL = [/^Intangibility\b/i, /^Tangibility\b/i, /^Memory Strands\b/i];

/**
 * Mods are stored as strings; a tagged one carries its tags after a "·"
 * separator, which is the format the parser has always written. Reading them
 * back keeps characters imported before this rendering correctly.
 */
export function splitMod(line: string): TooltipLine {
  const [text, tags] = line.split("  ·  ");
  return { text, tags: tags ? tags.split(", ").map((tag) => tag.trim()) : [] };
}

function classify(line: TooltipLine): Extract<SectionKind, "anoint" | "special" | "enchant" | "implicit"> {
  if (line.tags.includes("enchant")) return "enchant";
  if (ANOINT.some((pattern) => pattern.test(line.text))) return "anoint";
  if (SPECIAL.some((pattern) => pattern.test(line.text))) return "special";
  return "implicit";
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

  // The implicit block carries anoints, league mods and enchants as well as the
  // item's own implicits; each gets its own section.
  for (const raw of item.implicits) {
    const line = splitMod(raw);
    if (!line.text) continue;
    push(classify(line), line);
  }

  if (item.armour) push("defences", plain(`Armour: ${item.armour}`));
  if (item.evasion) push("defences", plain(`Evasion Rating: ${item.evasion}`));
  if (item.energyShield) push("defences", plain(`Energy Shield: ${item.energyShield}`));
  if (item.block) push("defences", plain(`Chance to Block: ${item.block}%`));

  if (item.sockets.length) push("sockets", plain("sockets"));

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
