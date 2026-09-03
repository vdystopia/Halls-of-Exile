import type { ParsedItem, SocketGroupColor } from "./types";

const INFLUENCE_LINES = new Set([
  "Shaper Item",
  "Elder Item",
  "Crusader Item",
  "Redeemer Item",
  "Hunter Item",
  "Warlord Item",
  "Searing Exarch Item",
  "Eater of Worlds Item",
]);

const FLAG_LINES = new Set([
  "Corrupted",
  "Mirrored",
  "Split",
  "Unidentified",
  "Synthesised Item",
  "Fractured Item",
  "Relic",
]);

const META_KEYS = new Set([
  "unique id",
  "item level",
  "quality",
  "sockets",
  "levelreq",
  "requires level",
  "implicits",
  "prefix",
  "suffix",
  "selected variant",
  "variant",
  "has alt variant",
  "has alt variant two",
  "has alt variant three",
  "has alt variant four",
  "has alt variant five",
  "league",
  "source",
  "catalyst",
  "catalystquality",
  "talisman tier",
  "armour",
  "evasion",
  "energy shield",
  "ward",
  "basearmour",
  "baseevasion",
  "baseenergyshield",
  "radius",
  "limited to",
  "crafted",
  "implicit",
  "cluster jewel skill",
  "item",
  "rarity",
]);

const SOCKET_COLORS = new Set(["R", "G", "B", "W", "A", "D"]);

/** Resolve `{range:0.6}(10-20)` style values the way Path of Building displays them. */
function applyRanges(line: string, ranges: number[]): string {
  let index = 0;
  return line.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, (match, minRaw, maxRaw) => {
    const roll = ranges[index] ?? ranges[0];
    index += 1;
    if (roll === undefined) return match;
    const min = Number(minRaw);
    const max = Number(maxRaw);
    const value = min + roll * (max - min);
    const isInteger = Number.isInteger(min) && Number.isInteger(max);
    return isInteger ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
  });
}

type ModLine = { text: string; variants: number[] | null; tags: string[] };

function parseModLine(line: string): ModLine {
  const tags: string[] = [];
  const ranges: number[] = [];
  let variants: number[] | null = null;
  let rest = line;

  for (;;) {
    const match = /^\{([^}]*)\}/.exec(rest);
    if (!match) break;
    const body = match[1];
    rest = rest.slice(match[0].length);
    if (body.startsWith("range:")) {
      ranges.push(Number(body.slice(6)));
    } else if (body.startsWith("variant:")) {
      variants = body
        .slice(8)
        .split(",")
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    } else if (body.startsWith("tags:") || body.startsWith("custom")) {
      // display-only metadata
    } else {
      tags.push(body);
    }
  }

  return { text: applyRanges(rest, ranges).trim(), variants, tags };
}

function renderMod(mod: ModLine): string {
  const marks: string[] = [];
  if (mod.tags.includes("crafted")) marks.push("crafted");
  if (mod.tags.includes("fractured")) marks.push("fractured");
  if (mod.tags.includes("scourge")) marks.push("scourge");
  return marks.length ? `${mod.text}  ·  ${marks.join(", ")}` : mod.text;
}

/**
 * Parse one item block in Path of Building's item text format.
 * Unknown lines are kept as explicit mods rather than dropped, so nothing an
 * exotic item carries silently disappears from the archive.
 */
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
  const rarityMatch = /^Rarity:\s*(.+)$/i.exec(lines[0] ?? "");
  if (rarityMatch) {
    item.rarity = rarityMatch[1].trim().toUpperCase();
    cursor = 1;
  }

  const namedRarity = item.rarity === "RARE" || item.rarity === "UNIQUE" || item.rarity === "RELIC";
  const isMeta = (line: string) => {
    const match = /^([A-Za-z][A-Za-z '-]*):/.exec(line);
    return match ? META_KEYS.has(match[1].trim().toLowerCase()) : false;
  };

  if (lines[cursor] && !isMeta(lines[cursor])) {
    item.name = lines[cursor];
    cursor += 1;
    if (namedRarity && lines[cursor] && !isMeta(lines[cursor])) {
      item.base = lines[cursor];
      cursor += 1;
    }
  }
  if (!item.base) item.base = item.name;

  let selectedVariant: number | null = null;
  let implicitCount = 0;
  const modLines: string[] = [];

  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    const keyMatch = /^([A-Za-z][A-Za-z '-]*):\s*(.*)$/.exec(line);
    const key = keyMatch ? keyMatch[1].trim().toLowerCase() : null;

    if (key && META_KEYS.has(key)) {
      const value = keyMatch![2].trim();
      switch (key) {
        case "item level":
          item.itemLevel = parseInt(value, 10);
          break;
        case "quality":
          item.quality = parseInt(value, 10);
          break;
        case "levelreq":
        case "requires level":
          item.levelReq = parseInt(value, 10);
          break;
        case "armour":
        case "basearmour":
          item.armour = parseInt(value, 10);
          break;
        case "evasion":
        case "baseevasion":
          item.evasion = parseInt(value, 10);
          break;
        case "energy shield":
        case "baseenergyshield":
          item.energyShield = parseInt(value, 10);
          break;
        case "sockets":
          item.sockets = value
            .split(" ")
            .filter(Boolean)
            .map((group) =>
              group
                .split("-")
                .map((color) => color.trim().toUpperCase())
                .filter((color) => SOCKET_COLORS.has(color)) as SocketGroupColor[],
            )
            .filter((group) => group.length > 0);
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

    if (INFLUENCE_LINES.has(line)) {
      item.influences.push(line.replace(/ Item$/, ""));
      continue;
    }
    if (FLAG_LINES.has(line)) {
      item.flags.push(line);
      continue;
    }

    modLines.push(line);
  }

  const keep = (mod: ModLine) =>
    mod.variants === null || selectedVariant === null || mod.variants.includes(selectedVariant);

  modLines.forEach((line, index) => {
    const mod = parseModLine(line);
    if (!keep(mod) || !mod.text) return;
    const text = renderMod(mod);
    if (index < implicitCount) item.implicits.push(text);
    else item.explicits.push(text);
  });

  return item;
}

/** Paper-doll layout: PoB slot name -> where it sits in the gear grid. */
export const GEAR_LAYOUT: { slot: string; label: string; pos: string }[] = [
  { slot: "Helmet", label: "Helmet", pos: "md:col-start-2 md:row-start-1" },
  { slot: "Amulet", label: "Amulet", pos: "md:col-start-3 md:row-start-1" },
  { slot: "Weapon 1", label: "Main Hand", pos: "md:col-start-1 md:row-start-2 md:row-span-2" },
  { slot: "Body Armour", label: "Body Armour", pos: "md:col-start-2 md:col-span-2 md:row-start-2 md:row-span-2" },
  { slot: "Weapon 2", label: "Off Hand", pos: "md:col-start-4 md:row-start-2 md:row-span-2" },
  { slot: "Gloves", label: "Gloves", pos: "md:col-start-1 md:row-start-4" },
  { slot: "Ring 1", label: "Left Ring", pos: "md:col-start-2 md:row-start-4" },
  { slot: "Ring 2", label: "Right Ring", pos: "md:col-start-3 md:row-start-4" },
  { slot: "Boots", label: "Boots", pos: "md:col-start-4 md:row-start-4" },
  { slot: "Belt", label: "Belt", pos: "md:col-start-2 md:col-span-2 md:row-start-5" },
];

export const FLASK_SLOTS = ["Flask 1", "Flask 2", "Flask 3", "Flask 4", "Flask 5"];

export const SOCKET_COLOR_CLASS: Record<string, string> = {
  R: "bg-socket-r",
  G: "bg-socket-g",
  B: "bg-socket-b",
  W: "bg-socket-w",
  A: "bg-socket-a",
  D: "bg-socket-d",
};

export function rarityClass(rarity: string): string {
  switch (rarity.toUpperCase()) {
    case "UNIQUE":
    case "RELIC":
      return "text-rarity-unique";
    case "RARE":
      return "text-rarity-rare";
    case "MAGIC":
      return "text-rarity-magic";
    default:
      return "text-rarity-normal";
  }
}
