import type { ParsedItem } from "../../types";

/**
 * An item as the game itself copies it to the clipboard: Ctrl+C for the plain
 * form, Ctrl+Alt+C for the advanced one with a `{ Prefix Modifier "Name"
 * (Tier: 1) — Tags }` header over every mod and the roll's range in brackets
 * after each number. Both games write this shape, and neither is Path of
 * Building's item text (no "Implicits: N" line, sections divided by dashes),
 * so it has its own reader rather than being bent into that parser.
 *
 * Sections, divided by a line of dashes:
 *   header      Item Class, Rarity, name, base (rare and unique only)
 *   properties  Quality, Armour, damage, a flask's duration — the lines the
 *               game prints under the name; "Key: value" or a plain sentence
 *   Requirements:  Level, Str, Dex, Int, "(augmented)" where a gem raised one
 *   Sockets:, Item Level:  one line each
 *   mods        implicit first, then explicit; each carries its header in the
 *               advanced form, or a "(implicit)"/"(crafted)"… suffix in the plain
 *   flags       Corrupted, Mirrored, Shaper Item…
 *   flavour     a unique's verse, dropped; "Note:" a trade price, dropped
 *
 * What comes out is a `ParsedItem` in the same shape the two other sources
 * produce, with a mod's tags after the "  ·  " mark the tooltip reads.
 */

const WEARABLE = new Set(["NORMAL", "MAGIC", "RARE", "UNIQUE", "RELIC"]);

const FLAGS = new Set(["Corrupted", "Mirrored", "Split", "Unidentified", "Synthesised Item", "Fractured Item", "Relic", "Mutated"]);
const INFLUENCES = new Set([
  "Shaper Item",
  "Elder Item",
  "Crusader Item",
  "Redeemer Item",
  "Hunter Item",
  "Warlord Item",
  "Searing Exarch Item",
  "Eater of Worlds Item",
]);

/** The tags the tooltip knows how to show, from the plain form's suffix or the advanced form's header. */
const TAGS = ["implicit", "enchant", "crafted", "fractured", "scourge", "rune", "desecrated"] as const;

/** Lines a flask or a weapon prints under its name that are facts, not mods. */
const PROPERTY_SENTENCE = /^(Lasts|Consumes|Recovers|Currently has|Grants|Limited to|Radius)\b/;
const PROPERTY_KEYS = new Set([
  "quality",
  "armour",
  "evasion rating",
  "evasion",
  "energy shield",
  "ward",
  "chance to block",
  "block chance",
  "physical damage",
  "elemental damage",
  "chaos damage",
  "lightning damage",
  "cold damage",
  "fire damage",
  "critical strike chance",
  "critical hit chance",
  "attacks per second",
  "weapon range",
  "spirit",
  "reload time",
  "map tier",
  "item quantity",
  "item rarity",
  "monster pack size",
  "quality (attack modifiers)",
  "quality (defence modifiers)",
  "quality (caster modifiers)",
  "quality (attribute modifiers)",
  "quality (life and mana modifiers)",
  "quality (resistance modifiers)",
  "quality (elemental damage modifiers)",
  "quality (physical and chaos damage modifiers)",
  "quality (speed modifiers)",
  "quality (critical modifiers)",
]);

export class ClipboardItemError extends Error {}

const sectionsOf = (text: string): string[][] => {
  const sections: string[][] = [[]];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (/^-{4,}$/.test(line)) {
      sections.push([]);
      continue;
    }
    if (line) sections[sections.length - 1].push(line);
  }
  return sections.filter((section) => section.length > 0);
};

/** "+35(25-35) to Strength" reads "+35 to Strength": the roll stays, the range goes. */
const dropRanges = (line: string) => line.replace(/(\d)\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, "$1");

/** The plain form's "(implicit)" and its kin at the end of a mod. */
function suffixTag(line: string): { text: string; tag: string | null } {
  const match = /^(.*?)\s*\(([a-z ]+)\)$/i.exec(line);
  const tag = match ? match[2].toLowerCase().replace(/ modifier$/, "") : null;
  if (tag && (TAGS as readonly string[]).includes(tag)) return { text: match![1], tag };
  return { text: line, tag: null };
}

/** The advanced form's header over a mod: which list it belongs in, and its tag. */
function headerTag(header: string): { implicit: boolean; tag: string | null } {
  const body = header.toLowerCase();
  if (/implicit/.test(body)) return { implicit: true, tag: null };
  for (const tag of TAGS) if (tag !== "implicit" && body.includes(tag)) return { implicit: false, tag };
  if (/master|crafted/.test(body)) return { implicit: false, tag: "crafted" };
  return { implicit: false, tag: null };
}

const withTag = (text: string, tag: string | null) => (tag && tag !== "implicit" ? `${text}  ·  ${tag}` : text);

export function parseClipboardItem(text: string, id: number): ParsedItem {
  const sections = sectionsOf(text);
  const header = sections[0] ?? [];
  const rarityLine = header.find((line) => /^Rarity:/i.test(line));
  if (!rarityLine) throw new ClipboardItemError("That is not an item copied from the game: no \"Rarity:\" line.");
  const rarity = rarityLine.replace(/^Rarity:\s*/i, "").trim().toUpperCase();
  if (!WEARABLE.has(rarity)) {
    throw new ClipboardItemError(`That is a ${rarity.toLowerCase()} item, not something a character wears.`);
  }
  const names = header.filter((line) => !/^(Item Class|Rarity):/i.test(line));
  const name = names[0];
  if (!name) throw new ClipboardItemError("The item has no name.");
  const named = rarity === "RARE" || rarity === "UNIQUE" || rarity === "RELIC";

  const item: ParsedItem = {
    id,
    rarity,
    name,
    // A magic item's name holds its base ("Heavy Belt of the Lion"); the art
    // and requirement lookups search a magic or normal name for one.
    base: named ? (names[1] ?? name) : name,
    sockets: [],
    influences: [],
    flags: [],
    implicits: [],
    explicits: [],
    raw: text,
  };
  const properties: { name: string; value: string }[] = [];
  const advanced = sections.some((section) => section.some((line) => /^\{.*\}$/.test(line)));
  let seenMods = false;

  for (const [index, section] of sections.slice(1).entries()) {
    const first = section[0];

    if (/^Requirements:?$/i.test(first)) {
      const requires: { text: string; modified: boolean }[] = [];
      for (const line of section.slice(1)) {
        const match = /^(Level|Str|Dex|Int|Strength|Dexterity|Intelligence):?\s*(\d+)\s*(.*)$/i.exec(line);
        if (!match) continue;
        const key = match[1].slice(0, 3);
        const value = Number(match[2]);
        const modified = /augmented/i.test(match[3]);
        if (/^lev/i.test(key)) {
          item.levelReq = value;
          requires.push({ text: `Level ${value}`, modified: false });
        } else {
          const short = key[0].toUpperCase() + key.slice(1).toLowerCase();
          requires.push({ text: `${value} ${short}`, modified });
        }
      }
      if (requires.length) item.requires = requires;
      continue;
    }

    const itemLevel = /^Item Level:\s*(\d+)/i.exec(first);
    if (section.length === 1 && itemLevel) {
      item.itemLevel = Number(itemLevel[1]);
      continue;
    }
    const sockets = /^Sockets:\s*(.+)$/i.exec(first);
    if (section.length === 1 && sockets) {
      item.sockets = sockets[1]
        .split(" ")
        .map((group) => group.split("-").map((c) => c.trim().toUpperCase()).filter((c) => /^[RGBWAD]$/.test(c)))
        .filter((group) => group.length) as ParsedItem["sockets"];
      continue;
    }
    if (/^Note:/i.test(first)) continue;

    // The lines under the name: a value with a key, or a flask's sentence. The
    // game prints them in the first section after the header, and a flask's
    // base effect ("40% increased Movement Speed") sits among them with no key,
    // so one recognisable line makes the section, and the rest ride along.
    const isProperty = (line: string) => {
      const key = /^([^:{}]+):/.exec(line)?.[1].trim().toLowerCase();
      return (key !== undefined && PROPERTY_KEYS.has(key)) || PROPERTY_SENTENCE.test(line);
    };
    if (index === 0 && !seenMods && section.some(isProperty) && !section.some((line) => /^\{.*\}$/.test(line))) {
      for (const line of section) {
        const keyed = /^([^:]+):\s*(.*)$/.exec(line);
        const key = keyed?.[1].trim().toLowerCase();
        const value = keyed ? keyed[2].replace(/\s*\((augmented|unmet)\)/gi, "").trim() : "";
        const number = Number.parseFloat(value.replace(/[+%]/g, ""));
        if (key === "item level") item.itemLevel = number;
        else if (key === "quality") item.quality = number;
        else if (key === "armour") item.armour = number;
        else if (key === "evasion rating" || key === "evasion") item.evasion = number;
        else if (key === "energy shield") item.energyShield = number;
        else if (key === "chance to block" || key === "block chance") item.block = number;
        else if (/^currently has/i.test(line)) continue;
        else if (keyed) properties.push({ name: keyed[1].trim(), value });
        else properties.push({ name: line.replace(/\s*\((augmented|unmet)\)/gi, ""), value: "" });
      }
      continue;
    }

    // Flags and influences stand alone on their lines wherever they appear.
    const rest = section.filter((line) => {
      if (FLAGS.has(line)) {
        item.flags.push(line);
        return false;
      }
      if (INFLUENCES.has(line)) {
        item.influences.push(line.replace(/ Item$/, ""));
        return false;
      }
      return true;
    });
    if (!rest.length) continue;

    // A section of mods. In the advanced form every mod has a header; a
    // section without one after the mods is the unique's verse. In the plain
    // form there is no header to go by, so a unique's trailing section with no
    // number in it is taken for the verse.
    const hasHeader = rest.some((line) => /^\{.*\}$/.test(line));
    if (advanced && !hasHeader && seenMods) continue;
    if (!advanced && seenMods && rarity === "UNIQUE" && rest.every((line) => !/\d/.test(line))) continue;

    let current: { implicit: boolean; tag: string | null } = { implicit: false, tag: null };
    for (const line of rest) {
      if (/^\{.*\}$/.test(line)) {
        current = headerTag(line);
        continue;
      }
      const plain = suffixTag(dropRanges(line));
      const implicit = hasHeader ? current.implicit : plain.tag === "implicit";
      const tag = hasHeader ? current.tag : plain.tag;
      (implicit ? item.implicits : item.explicits).push(withTag(plain.text, tag));
      seenMods = true;
    }
  }

  if (properties.length) item.properties = properties;
  return item;
}
