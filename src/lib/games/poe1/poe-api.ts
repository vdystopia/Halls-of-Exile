import { attributeRequirementPercent, parseSocketString } from "./items";
import type { BuildData, Gem, ParsedItem, PassiveDetail, SkillGroup } from "../../types";

/**
 * Read an export produced by `poe-char-export` — the script that pulls a whole
 * account off Grinding Gear Games' own character endpoints — and turn one of
 * its characters into the structure a character page renders.
 *
 * This is the second way a build gets into the archive, beside a Path of
 * Building code, and the two differ in what they know:
 *
 *   - The official API reports what the game shows. Requirements already
 *     include a socketed gem's, a shield's block is the modified figure, and a
 *     gem states its attribute outright. None of that has to be derived.
 *   - It computes nothing. There are no player stats at all — no life, no
 *     resistances, no damage — because those come out of Path of Building's
 *     engine, not out of an item list. A character imported this way renders
 *     its gear, gems and tree, and no stat panels.
 *   - It names the passives. Keystones, notables, masteries with the effect
 *     actually chosen, and tattoos, which a node count alone loses.
 *
 * The exporter's own documentation is the reference for the shape below; the
 * fields this reads are the ones it calls "verbatim from the API" and
 * "mechanical normalization". Its heuristics — `origin_league` above all — are
 * deliberately not stored on the build: the owner's own record names the league
 * a character belongs to and outranks an inference from a last-login time.
 */

/** The export format this understands. A later major is refused, not guessed at. */
export const POE_EXPORT_SCHEMA = 1;

/**
 * What the mapper produces, as a number, for the same reason `PARSER_VERSION`
 * exists: a character's build is written to the database once, at import, so a
 * fix here reaches only later imports unless the stored payload is replayed.
 *
 * 1 — the first mapper.
 */
export const POE_API_VERSION = 1;

export class PoeExportError extends Error {}

// The export is JSON from another program. It is read structurally, field by
// field, rather than being trusted to match a type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export type PoeExportCharacter = {
  name: string;
  league: string;
  level: number | null;
  baseClass: string | null;
  ascendancy: string | null;
  lastLogin: string | null;
  /** The league the exporter guessed the character was made in, and how sure it is. */
  originPatch: string | null;
  originConfidence: string | null;
  /**
   * The exporter's guess at the skill: the active gem with the most supports
   * linked to it. A guess, and frequently the wrong one — a Vaal variant, or a
   * curse in a six-link — so it is offered as a form default and never written
   * without someone having seen it.
   */
  mainSkill: string | null;
  raw: Json;
};

export type PoeExport = {
  account: string;
  realm: string;
  generatedAt: string | null;
  characters: PoeExportCharacter[];
};

/** Read and validate the file, without mapping any build. */
export function readPoeExport(text: string): PoeExport {
  let parsed: Json;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PoeExportError("That file is not JSON.");
  }
  const version = parsed?.schema_version;
  if (typeof version !== "number") {
    throw new PoeExportError("That JSON has no schema_version — is it a poe-char-export file?");
  }
  if (Math.floor(version) !== POE_EXPORT_SCHEMA) {
    throw new PoeExportError(
      `This archive reads export schema ${POE_EXPORT_SCHEMA}; that file is schema ${version}.`,
    );
  }
  const characters: Json[] = Array.isArray(parsed.characters) ? parsed.characters : [];
  if (!characters.length) throw new PoeExportError("That export has no characters in it.");

  return {
    account: String(parsed.account ?? "unknown account"),
    realm: String(parsed.realm ?? "pc"),
    generatedAt: typeof parsed.generated_at === "string" ? parsed.generated_at : null,
    characters: characters.map((character) => ({
      name: String(character?.name ?? "Unnamed Exile"),
      league: String(character?.league ?? "Unknown"),
      level: numeric(character?.level),
      baseClass: str(character?.base_class),
      ascendancy: str(character?.ascendancy),
      lastLogin: str(character?.last_login),
      originPatch: str(character?.origin_league?.version),
      originConfidence: str(character?.origin_league?.confidence),
      mainSkill: str(character?.main_skill?.skill),
      raw: character,
    })),
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Paper-doll slot names. The archive names slots the way Path of Building does,
 * because that is what the grid in `items.ts` is laid out on; the API names them
 * its own way. Anything not listed here keeps the API's name and is drawn in the
 * row of extras beneath the doll rather than being dropped.
 */
const SLOT_NAMES: Record<string, string> = {
  Weapon: "Weapon 1",
  Offhand: "Weapon 2",
  "Weapon (swap)": "Weapon 1 Swap",
  "Offhand (swap)": "Weapon 2 Swap",
  Helm: "Helmet",
  BodyArmour: "Body Armour",
  Gloves: "Gloves",
  Boots: "Boots",
  Belt: "Belt",
  Amulet: "Amulet",
  Ring: "Ring 1",
  Ring2: "Ring 2",
};

/**
 * The influence flags, under the names the game prints at the foot of an item.
 * The two Atlas influences are called `searing` and `tangled` in the API after
 * the currency that applies them, not after the boss they come from.
 */
const INFLUENCE_FLAGS: Record<string, string> = {
  shaper: "Shaper",
  elder: "Elder",
  crusader: "Crusader",
  redeemer: "Redeemer",
  hunter: "Hunter",
  warlord: "Warlord",
  searing: "Searing Exarch",
  tangled: "Eater of Worlds",
};

/**
 * The flags the game prints as their own line. `replica`, `ruthless` and
 * `abyssJewel` are API bookkeeping that the item itself never shows, and
 * `duplicated` is what a mirrored item is called over the wire.
 */
const FOOTER_FLAGS: Record<string, string> = {
  corrupted: "Corrupted",
  mirrored: "Mirrored",
  duplicated: "Mirrored",
  split: "Split",
  unidentified: "Unidentified",
  synthesised: "Synthesised Item",
  fractured: "Fractured Item",
  relic: "Relic",
  scourged: "Scourged",
  mutated: "Mutated",
};

/**
 * Which mod bucket belongs above the separator and which below, and the tag a
 * line carries. The tag format is the one the Path of Building parser has
 * always written — `text  ·  crafted` — so both sources read back identically.
 * `cosmetic` is a skin, not a modifier, and is the one bucket dropped.
 */
const MOD_BUCKETS: { key: string; region: "implicit" | "explicit"; tag?: string }[] = [
  { key: "enchant", region: "implicit", tag: "enchant" },
  { key: "implicit", region: "implicit" },
  { key: "explicit", region: "explicit" },
  { key: "crafted", region: "explicit", tag: "crafted" },
  { key: "fractured", region: "explicit", tag: "fractured" },
  { key: "veiled", region: "explicit", tag: "veiled" },
  { key: "crucible", region: "explicit", tag: "crucible" },
  { key: "scourge", region: "explicit", tag: "scourge" },
  { key: "mutated", region: "explicit", tag: "mutated" },
  { key: "utility", region: "explicit" },
];

/** Gem colours, as the API letters them: the attribute, not the socket. */
const GEM_COLORS: Record<string, "r" | "g" | "b" | "w"> = { S: "r", D: "g", I: "b", G: "w" };

function modText(entry: Json): string | null {
  // Most mods come over as plain strings; some endpoints wrap them in an
  // object with a description instead.
  if (typeof entry === "string") return entry.trim() || null;
  if (entry && typeof entry.description === "string") return entry.description.trim() || null;
  return null;
}

function tagged(text: string, tag?: string): string {
  return tag ? `${text}  ·  ${tag}` : text;
}

function percentValue(value: unknown): number | undefined {
  const match = /-?\d+(?:\.\d+)?/.exec(String(value ?? ""));
  return match ? Math.round(Number(match[0])) : undefined;
}

/**
 * The item's text, rebuilt for the record. Nothing renders it — the tooltip is
 * built from the fields — but a build that carries no share code should still
 * hold a readable copy of what it was made from.
 */
function itemText(item: ParsedItem): string {
  const lines = [`Rarity: ${item.rarity}`, item.name];
  if (item.base && item.base !== item.name) lines.push(item.base);
  return [...lines, ...item.implicits, ...item.explicits, ...item.flags].join("\n");
}

/**
 * One equipped item, a tree jewel or an abyss jewel socketed into gear. The
 * `rawItem` is the same item in the untouched API payload, which the exporter's
 * normalization drops two things from: the "(gem)" marker on a requirement a
 * socketed gem raised, and a socketed abyss jewel's own modifiers.
 */
function mapItem(source: Json, id: number, slot: string | undefined, rawItem: Json): ParsedItem {
  const name = str(source?.name) ?? str(source?.type_line) ?? "Unknown item";
  const base = str(source?.base_type) ?? name;
  const flags: Record<string, unknown> = source?.flags ?? {};

  const influences = new Set<string>();
  for (const influence of Array.isArray(source?.influences) ? source.influences : []) {
    const label = INFLUENCE_FLAGS[String(influence).toLowerCase()];
    if (label) influences.add(label);
  }
  const footer: string[] = [];
  for (const [flag, on] of Object.entries(flags)) {
    if (!on) continue;
    const influence = INFLUENCE_FLAGS[flag];
    if (influence) {
      influences.add(influence);
      continue;
    }
    const label = FOOTER_FLAGS[flag];
    if (label && !footer.includes(label)) footer.push(label);
  }

  const implicits: string[] = [];
  const explicits: string[] = [];
  const mods: Record<string, Json> = source?.mods ?? {};
  for (const bucket of MOD_BUCKETS) {
    for (const entry of Array.isArray(mods[bucket.key]) ? mods[bucket.key] : []) {
      const text = modText(entry);
      if (!text) continue;
      (bucket.region === "implicit" ? implicits : explicits).push(tagged(text, bucket.tag));
    }
  }

  const item: ParsedItem = {
    id,
    slot,
    rarity: String(source?.rarity ?? "Normal").toUpperCase(),
    name,
    base,
    itemLevel: numeric(source?.ilvl) ?? undefined,
    sockets: parseSocketString(str(source?.sockets) ?? ""),
    influences: [...influences],
    flags: footer,
    implicits,
    explicits,
    iconUrl: str(source?.icon) ?? undefined,
    size: [numeric(source?.w) ?? 1, numeric(source?.h) ?? 1],
    raw: "",
  };

  const properties: { name: string; value: string }[] = [];
  for (const [key, value] of Object.entries((source?.properties ?? {}) as Record<string, unknown>)) {
    switch (key) {
      case "Quality":
        item.quality = percentValue(value);
        continue;
      case "Armour":
        item.armour = percentValue(value);
        continue;
      case "Evasion Rating":
        item.evasion = percentValue(value);
        continue;
      case "Energy Shield":
        item.energyShield = percentValue(value);
        continue;
      case "Chance to Block":
        item.block = percentValue(value);
        continue;
      case "Intangibility":
        item.intangibility = String(value);
        continue;
      case "Memory Strands":
        item.memoryStrands = String(value);
        continue;
      default:
        break;
    }
    // A property with no value is a label. Most are the item's class — "Wand",
    // "Abyss" — which the game prints in the title bar and the archive does not
    // show at all; the ones worth keeping are a flask's, and every one of those
    // states a number.
    if (value === true) {
      if (/\d/.test(key)) properties.push({ name: key, value: "" });
      continue;
    }
    properties.push({ name: key, value: String(value) });
  }
  if (properties.length) item.properties = properties;

  item.requires = requirementLines(source, rawItem, item);
  const level = requirementNumber(source, "Level");
  if (level !== null) item.levelReq = level;
  item.raw = itemText(item);
  return item;
}

function requirementNumber(source: Json, key: string): number | null {
  return numeric((source?.requirements ?? {})[key]);
}

/**
 * "Requires Level 70, 151 Str (gem), 94 Int", one part per figure.
 *
 * These are the game's own numbers, so nothing is derived: an item that reduces
 * its attribute requirements already reports the reduced figure, and a figure a
 * socketed gem raised carries a "(gem)" marker that says the item itself does
 * not need it. That marker only survives in the untouched payload, so it is
 * taken from there when the export kept one.
 *
 * A part is marked modified when the item scales requirements at all, which is
 * what colours it the way the game colours a changed value.
 */
function requirementLines(source: Json, rawItem: Json, item: ParsedItem): { text: string; modified: boolean }[] {
  const suffixes = new Map<string, string>();
  for (const entry of Array.isArray(rawItem?.requirements) ? rawItem.requirements : []) {
    const suffix = str(entry?.suffix);
    if (suffix) suffixes.set(String(entry?.name), suffix);
  }

  const scaled = attributeRequirementPercent(item) !== 0;
  const parts: { text: string; modified: boolean }[] = [];
  const level = requirementNumber(source, "Level");
  if (level) parts.push({ text: `Level ${level}`, modified: false });
  for (const attribute of ["Str", "Dex", "Int"] as const) {
    const value = requirementNumber(source, attribute);
    if (!value) continue;
    const suffix = suffixes.get(attribute);
    parts.push({
      text: suffix ? `${value} ${attribute} ${suffix}` : `${value} ${attribute}`,
      // A figure a gem raised is the gem's, not the item's, so the item's own
      // scaling says nothing about it.
      modified: scaled && !suffix,
    });
  }
  return parts;
}

function mapGem(source: Json): Gem {
  const name = str(source?.name) ?? "Unknown gem";
  const color = GEM_COLORS[String(source?.colour ?? "")];
  return {
    name,
    level: numeric(source?.level),
    quality: numeric(source?.quality),
    // The API lists what is socketed, and a socketed gem is always active:
    // there is no disabled state to report.
    enabled: true,
    support: Boolean(source?.support),
    color,
  };
}

function mapPassives(passives: Json): PassiveDetail {
  const names = (value: Json): string[] =>
    (Array.isArray(value) ? value : []).map((entry) => str(entry?.name) ?? str(entry) ?? "").filter(Boolean);
  return {
    variant: str(passives?.tree_variant) ?? undefined,
    keystones: names(passives?.keystones),
    notables: names(passives?.notables),
    ascendancyNotables: names(passives?.ascendancy_notables),
    bloodlineNodes: names(passives?.bloodline_nodes),
    masteries: (Array.isArray(passives?.masteries) ? passives.masteries : []).map((entry: Json) => ({
      name: str(entry?.name) ?? "Mastery",
      // A mastery is a choice: the node names the group, the stat names the
      // effect actually taken.
      effect: (Array.isArray(entry?.stats) ? entry.stats : []).map((stat: Json) => String(stat)).join(" · "),
    })),
    tattoos: names(passives?.tattoos),
  };
}

/** Turn one character of an export into the structure a character page renders. */
export function buildFromPoeExport(character: PoeExportCharacter, export_: PoeExport): BuildData {
  const source: Json = character.raw;
  const rawItems: Json[] = Array.isArray(source?.raw?.items?.items) ? source.raw.items.items : [];
  const rawById = new Map<string, Json>();
  for (const raw of rawItems) if (raw?.id) rawById.set(String(raw.id), raw);

  const items: ParsedItem[] = [];
  const slots: Record<string, number> = {};
  const skillGroups: SkillGroup[] = [];
  let nextId = 1;

  const equipment: Json[] = Array.isArray(source?.equipment) ? source.equipment : [];
  for (const entry of equipment) {
    const apiSlot = String(entry?.slot ?? "");
    const slot = SLOT_NAMES[apiSlot] ?? apiSlot;
    const rawItem = rawById.get(String(entry?.id ?? ""));
    const item = mapItem(entry, nextId++, slot, rawItem);
    items.push(item);
    if (slot) slots[slot] = item.id;

    const socketed: Json[] = Array.isArray(entry?.socketed) ? entry.socketed : [];
    const rawSocketed: Json[] = Array.isArray(rawItem?.socketedItems) ? rawItem.socketedItems : [];

    // An abyss jewel sits in a socket but is an item, not a gem. The normalized
    // entry keeps only its base type, so its own name and modifiers come from
    // the untouched payload when there is one.
    let abyssal = 0;
    for (const socket of socketed) {
      if (socket?.kind !== "abyss_jewel") continue;
      abyssal += 1;
      const raw = rawSocketed.find(
        (candidate) => candidate?.abyssJewel && candidate?.socket === socket?.socket,
      );
      const jewelSlot = `${slot} Abyssal Socket ${abyssal}`;
      const jewel = mapItem(abyssJewel(socket, raw), nextId++, jewelSlot, raw);
      items.push(jewel);
      slots[jewelSlot] = jewel.id;
    }

    const groups = new Map<number, Gem[]>();
    for (const socket of socketed) {
      if (socket?.kind === "abyss_jewel") continue;
      const group = numeric(socket?.group) ?? 0;
      const gems = groups.get(group);
      if (gems) gems.push(mapGem(socket));
      else groups.set(group, [mapGem(socket)]);
    }
    for (const gems of groups.values()) {
      // Nothing leads a socket group, so no gem is promoted to a title and the
      // group carries no label of its own.
      skillGroups.push({ label: "", slot, enabled: true, isMain: false, gems });
    }
  }

  const treeJewels: number[] = [];
  for (const entry of Array.isArray(source?.passives?.jewels) ? source.passives.jewels : []) {
    const jewel = mapItem(entry, nextId++, undefined, rawById.get(String(entry?.id ?? "")));
    items.push(jewel);
    treeJewels.push(jewel.id);
  }

  const mainSkill = str(source?.main_skill?.skill);
  if (mainSkill) {
    const mainSlot = SLOT_NAMES[String(source?.main_skill?.slot ?? "")] ?? str(source?.main_skill?.slot);
    const main =
      skillGroups.find(
        (group) => group.slot === mainSlot && group.gems.some((gem) => gem.name === mainSkill),
      ) ?? skillGroups.find((group) => group.gems.some((gem) => gem.name === mainSkill));
    if (main) main.isMain = true;
  }

  const passives = source?.passives ?? {};
  const counts = passives?.counts ?? {};

  return {
    source: "poe-api",
    className: character.baseClass ?? undefined,
    ascendClassName: character.ascendancy ?? undefined,
    level: character.level ?? undefined,
    mainSkill: mainSkill ?? undefined,
    // The API computes nothing, so there are no player stats to record and the
    // character page shows no stat panels for a build imported this way.
    stats: {},
    skillGroups,
    items,
    slots,
    trees: [
      {
        title: "Passive tree",
        url: str(passives?.tree_url) ?? undefined,
        nodeCount: numeric(counts?.allocated) ?? (Array.isArray(passives?.hashes) ? passives.hashes.length : 0),
        masteryCount: numeric(counts?.mastery) ?? 0,
      },
    ],
    activeTree: 0,
    treeJewels,
    passives: mapPassives(passives),
    origin: {
      account: export_.account,
      realm: export_.realm,
      lastLogin: character.lastLogin ?? undefined,
      fetchedAt: export_.generatedAt ?? undefined,
    },
    config: [],
  };
}

/** A socketed abyss jewel, in the shape `mapItem` reads. */
function abyssJewel(socket: Json, raw: Json): Json {
  return {
    name: str(raw?.name) ?? null,
    type_line: str(raw?.typeLine) ?? str(socket?.name),
    base_type: str(raw?.baseType) ?? str(socket?.name),
    rarity: str(raw?.rarity) ?? "Normal",
    ilvl: raw?.ilvl,
    icon: str(socket?.icon) ?? str(raw?.icon),
    w: raw?.w ?? 1,
    h: raw?.h ?? 1,
    flags: { corrupted: Boolean(socket?.corrupted ?? raw?.corrupted) },
    mods: {
      implicit: Array.isArray(raw?.implicitMods) ? raw.implicitMods : [],
      explicit: Array.isArray(raw?.explicitMods) ? raw.explicitMods : [],
      crafted: Array.isArray(raw?.craftedMods) ? raw.craftedMods : [],
      fractured: Array.isArray(raw?.fracturedMods) ? raw.fracturedMods : [],
    },
    requirements: requirementsFromRaw(raw),
    properties: {},
    sockets: null,
    socketed: [],
  };
}

function requirementsFromRaw(raw: Json): Record<string, string> {
  const requirements: Record<string, string> = {};
  for (const entry of Array.isArray(raw?.requirements) ? raw.requirements : []) {
    const name = str(entry?.name);
    const value = entry?.values?.[0]?.[0];
    if (name && value !== undefined) requirements[name] = String(value);
  }
  return requirements;
}

/**
 * What is kept in `characters.source_payload`: one character's slice of the
 * export, with the few header fields the build records, and nothing else.
 *
 * The exporter's own documentation makes the case for storing the untouched
 * payloads rather than the normalized view, and it is the right one for an
 * archive: the endpoints it came from are undocumented and rate-limited, the
 * account is read from the live game, and a character that was deleted cannot
 * be fetched again at any price. Keeping the payload means a fix to the mapping
 * above is replayed over every character already imported, the way a stored
 * Path of Building code lets the parser be fixed after the fact.
 */
export type StoredPoeExport = {
  account: string;
  realm: string;
  generated_at: string | null;
  character: Json;
};

export function storedPayload(character: PoeExportCharacter, from: PoeExport): StoredPoeExport {
  return {
    account: from.account,
    realm: from.realm,
    generated_at: from.generatedAt,
    character: character.raw,
  };
}

/** Re-derive a build from the payload stored at import, with no file in hand. */
export function rebuildFromStoredExport(stored: StoredPoeExport): BuildData {
  const character = stored?.character;
  if (!character) throw new PoeExportError("That stored payload holds no character.");
  return buildFromPoeExport(
    {
      name: String(character.name ?? "Unnamed Exile"),
      league: String(character.league ?? "Unknown"),
      level: numeric(character.level),
      baseClass: str(character.base_class),
      ascendancy: str(character.ascendancy),
      lastLogin: str(character.last_login),
      originPatch: str(character.origin_league?.version),
      originConfidence: str(character.origin_league?.confidence),
      mainSkill: str(character.main_skill?.skill),
      raw: character,
    },
    {
      account: stored.account ?? "unknown account",
      realm: stored.realm ?? "pc",
      generatedAt: stored.generated_at ?? null,
      characters: [],
    },
  );
}
