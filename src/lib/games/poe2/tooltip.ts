import { splitMod } from "../poe1/items";
import type { SectionKind, TooltipLine, TooltipSection } from "../poe1/tooltip";
import type { ParsedItem } from "../../types";

/**
 * Path of Exile 2's item tooltip, in the section order every tooltip here uses.
 *
 * Its own module rather than Path of Exile 1's because that one derives what an
 * item does not state — a shield's block and an item's attribute requirements —
 * from Path of Exile 1's base catalogue, and Path of Exile 2 reuses base names
 * (Ruby Ring, Leather Belt) with different numbers. An item from the site states
 * both itself, so nothing here derives anything: what the game said is shown,
 * and what it did not say is not invented.
 */
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

const ANOINT = /^Allocates\b/i;

function classify(line: TooltipLine): Extract<SectionKind, "anoint" | "enchant" | "implicit"> {
  if (ANOINT.test(line.text)) return "anoint";
  if (line.tags.includes("enchant") || line.tags.includes("rune")) return "enchant";
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
  if (item.block !== undefined) push("defences", plain(`Block chance: ${item.block}%`));
  if (item.armour) push("defences", plain(`Armour: ${item.armour}`));
  if (item.evasion) push("defences", plain(`Evasion Rating: ${item.evasion}`));
  if (item.energyShield) push("defences", plain(`Energy Shield: ${item.energyShield}`));
  for (const property of item.properties ?? []) {
    const text = property.value ? `${property.name}: ${property.value}` : property.name;
    push(property.name === "Rune Sockets" ? "special" : "defences", plain(text));
  }

  for (const raw of item.implicits) {
    const line = splitMod(raw);
    if (line.text) push(classify(line), line);
  }
  for (const part of item.requires ?? []) {
    push("requires", { text: part.text, tags: part.modified ? ["modified"] : [] });
  }
  for (const raw of item.explicits) {
    const line = splitMod(raw);
    if (line.text) push("explicit", line);
  }
  for (const flag of item.flags) {
    if (flag === "Fractured Item") continue;
    push("footer", plain(flag));
  }

  return SECTION_ORDER.map((kind) => ({ kind, lines: buckets.get(kind) ?? [] })).filter(
    (section) => section.lines.length > 0,
  );
}
