import type { ParsedItem } from "../../types";

/**
 * One item in Path of Building 2's item text. The grammar is Path of Building
 * 1's — "Rarity:", name, base, "Key: value" header lines, "Implicits: N", then
 * mod lines with `{tag}` prefixes — and the vocabulary is not, which is why this
 * is its own parser rather than Path of Exile 1's with more keys:
 *
 *   - `Sockets: S S` counts rune sockets; there are no colours or links.
 *   - `Rune: <name>` names what fills each socket, in order, and `Rune: None`
 *     an empty one.
 *   - `Spirit:` and `Charm Slots:` are header figures, not mods.
 *   - `{rune}`, `{desecrated}` and `{enchant}` join `{crafted}` and
 *     `{fractured}` as tags; `{prefix}`, `{suffix}` and `{tags:…}` are
 *     bookkeeping.
 *
 * A header key this does not know falls through to the mod list, where it would
 * shift the implicit boundary; add it to `META_KEYS` rather than letting it.
 */
const META_KEYS = new Set([
  "rarity",
  "unique id",
  "item level",
  "quality",
  "sockets",
  "rune",
  "levelreq",
  "requires level",
  "implicits",
  "prefix",
  "suffix",
  "crafted",
  "selected variant",
  "variant",
  "has alt variant",
  "league",
  "source",
  "armour",
  "evasion",
  "energy shield",
  "ward",
  "block",
  "spirit",
  "charm slots",
  "radius",
  "limited to",
  "catalyst",
  "catalystquality",
]);

const META_KEY_PATTERNS = [/basepercentile$/];

const FLAG_LINES = new Set(["Corrupted", "Mirrored", "Split", "Unidentified", "Fractured Item", "Mutated"]);

/** Tags a mod line keeps, in the order the tooltip reads them. */
const KEPT_TAGS = ["enchant", "rune", "crafted", "fractured", "desecrated"];

function parseModLine(line: string): { text: string; tags: string[]; variants: number[] | null } {
  const tags: string[] = [];
  let variants: number[] | null = null;
  let rest = line;
  for (;;) {
    const match = /^\{([^}]*)\}/.exec(rest);
    if (!match) break;
    rest = rest.slice(match[0].length);
    const body = match[1];
    if (body.startsWith("variant:")) {
      variants = body
        .slice(8)
        .split(",")
        .map(Number)
        .filter((value) => Number.isFinite(value));
    } else if (KEPT_TAGS.includes(body)) {
      tags.push(body);
    }
    // {prefix}, {suffix}, {tags:…}, {range:…}, {custom}: bookkeeping.
  }
  const ordered = KEPT_TAGS.filter((tag) => tags.includes(tag));
  return { text: rest.trim(), tags: ordered, variants };
}

export function parseItem(raw: string, id: number): ParsedItem {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const item: ParsedItem = {
    id,
    rarity: "NORMAL",
    name: "",
    base: "",
    sockets: [],
    influences: [],
    flags: [],
    implicits: [],
    explicits: [],
    raw,
  };

  let cursor = 0;
  const rarity = /^Rarity:\s*(.+)$/i.exec(lines[0] ?? "");
  if (rarity) {
    item.rarity = rarity[1].trim().toUpperCase();
    cursor = 1;
  }

  const keyOf = (line: string) => /^([A-Za-z][A-Za-z '-]*):\s*(.*)$/.exec(line);
  const isMetaKey = (key: string) => META_KEYS.has(key) || META_KEY_PATTERNS.some((pattern) => pattern.test(key));
  const isMeta = (line: string) => {
    const match = keyOf(line);
    return match ? isMetaKey(match[1].trim().toLowerCase()) : false;
  };

  const named = item.rarity === "RARE" || item.rarity === "UNIQUE" || item.rarity === "RELIC";
  if (lines[cursor] && !isMeta(lines[cursor])) {
    item.name = lines[cursor];
    cursor += 1;
    if (named && lines[cursor] && !isMeta(lines[cursor])) {
      item.base = lines[cursor];
      cursor += 1;
    }
  }
  if (!item.base) item.base = item.name;

  let implicitCount = 0;
  let selectedVariant: number | null = null;
  let runeSockets = 0;
  const runes: string[] = [];
  const properties: { name: string; value: string }[] = [];
  const modLines: string[] = [];

  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    const match = keyOf(line);
    const key = match ? match[1].trim().toLowerCase() : null;
    if (key && isMetaKey(key)) {
      const value = match![2].trim();
      switch (key) {
        case "item level":
          item.itemLevel = parseInt(value, 10) || undefined;
          break;
        case "quality":
          item.quality = parseInt(value, 10) || undefined;
          break;
        case "levelreq":
        case "requires level":
          item.levelReq = parseInt(value, 10) || undefined;
          break;
        case "armour":
          item.armour = parseInt(value, 10) || undefined;
          break;
        case "evasion":
          item.evasion = parseInt(value, 10) || undefined;
          break;
        case "energy shield":
          item.energyShield = parseInt(value, 10) || undefined;
          break;
        case "block":
          item.block = parseInt(value, 10) || undefined;
          break;
        case "spirit":
          properties.push({ name: "Spirit", value });
          break;
        case "sockets":
          runeSockets = value.split(/\s+/).filter((socket) => socket.toUpperCase() === "S").length;
          break;
        case "rune":
          runes.push(value);
          break;
        case "implicits":
          implicitCount = parseInt(value, 10) || 0;
          break;
        case "selected variant":
          selectedVariant = parseInt(value, 10);
          break;
        default:
          break;
      }
      continue;
    }
    if (FLAG_LINES.has(line)) {
      item.flags.push(line);
      continue;
    }
    modLines.push(line);
  }

  if (runeSockets) {
    // "Rune: None" is an empty socket; the site's export says "empty", and so does this.
    const filled = runes.map((rune) => (/^none$/i.test(rune) ? "empty" : rune));
    while (filled.length < runeSockets) filled.push("empty");
    properties.push({ name: "Rune Sockets", value: filled.slice(0, runeSockets).join(", ") });
  }
  if (properties.length) item.properties = properties;

  modLines.forEach((line, index) => {
    const mod = parseModLine(line);
    if (!mod.text) return;
    if (mod.variants && selectedVariant !== null && !mod.variants.includes(selectedVariant)) return;
    const text = mod.tags.length ? `${mod.text}  ·  ${mod.tags.join(", ")}` : mod.text;
    if (index < implicitCount) item.implicits.push(text);
    else item.explicits.push(text);
  });

  // An anoint or rune line sits in the implicit block by position; the site's
  // export and the tooltip both read "enchant" there, so the tags are enough.
  if (item.levelReq) item.requires = [{ text: `Level ${item.levelReq}`, modified: false }];
  return item;
}
