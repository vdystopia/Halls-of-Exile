import { LEAGUE_SEED } from "../../leagues";
import type { BuildData, Gem, ParsedItem, SkillGroup } from "../../types";
import { PoeExportError, type PoeExport, type PoeExportCharacter } from "../poe1/poe-api";
import { classFromId } from "./classes";

/**
 * Read an export of Path of Exile 2 characters taken from pathofexile2.com, and
 * turn one character into the structure a character page renders.
 *
 * The export comes from `tools/poe2-char-export/poe2-char-export.js`, run in
 * the browser on the account's own characters page: the site's two character
 * endpoints need a logged-in session and serve only that account, so there is
 * no anonymous route like Path of Exile 1's and nothing here fetches anything.
 *
 * What the site gives, and so what this maps:
 *
 *   - The character list: name, level, the league the character sits in now,
 *     its last login, and its class as the game's ascendancy id ("Monk3").
 *   - Every equipped item, in the same Item shape Grinding Gear Games' official
 *     API documents — both weapon sets, flasks and charms, runes and soul cores
 *     in their sockets, and the skills an item grants with the supports linked
 *     to them.
 *
 * What it does not give: the passive tree, the skill gems in a character's own
 * skill slots, weapon-set passives and tree jewels. The site has no endpoint for
 * any of those. They come from a Path of Building 2 share code instead, which
 * reads them from the official API; a character can hold both, and each source
 * rewrites only what it owns.
 *
 * Like Path of Exile 1's endpoints, this computes nothing: no life, no
 * resistances, no damage. A character imported this way shows its gear and no
 * stat panels.
 */

/** The export format this understands. A later major is refused, not guessed at. */
export const POE2_EXPORT_SCHEMA = 1;

/**
 * What the mapper produces, as a number, for the reason `POE_API_VERSION` has
 * one: the build is written once at import, and bumping this re-derives every
 * stored Path of Exile 2 payload on the next boot.
 *
 * 1 — the first mapper.
 */
export const POE2_SITE_VERSION = 1;

// The export is JSON from another program, read field by field rather than
// trusted to match a type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Strip the site's inline markup. Mod and property text carries tags for the
 * in-game tooltip's hover links — `[Resistances|Fire Resistance]` shows "Fire
 * Resistance", a bare `[Physical]` shows "Physical" — and the archive shows the
 * text the player reads.
 */
export function plainText(text: string): string {
  return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");
}

/**
 * Leagues a character ends up in rather than starts in. A character's league is
 * permanent when, with its Hardcore and Solo Self-Found prefixes taken off,
 * nothing but "Standard" is left — "Solo Self-Found" alone is SSF Standard.
 */
const MODIFIER_PREFIX = /^(?:(?:SSF|HC|Hardcore|Solo Self-Found|Ruthless)\s*)+/i;

function leagueCore(name: string): string {
  return name.replace(MODIFIER_PREFIX, "").trim();
}

function isPermanent(name: string): boolean {
  const core = leagueCore(name);
  return core === "" || /^Standard$/i.test(core);
}

const POE2_LEAGUES = LEAGUE_SEED.filter((league) => league.game === "poe2");

/**
 * Which catalogue league a character was made in, and how sure that is, from
 * the league it is in now and its last login. The same grades the Path of Exile
 * 1 collector uses, so the upload page treats both alike:
 *
 *   - certain: the character is still in a league that has not ended — "SSF
 *     Runes of Aldur" is Runes of Aldur. Only this grade is ever offered as a
 *     default, because it is the only one that is a fact.
 *   - likely: it is in Standard now, and its last login fell inside exactly one
 *     league that has since ended.
 *   - ambiguous: more than one ended league spans that login.
 *   - none: the login falls inside a league still running — a Standard
 *     character cannot have come from it — or inside no league at all.
 *
 * A last login moves every time a character is played, so for an old character
 * in Standard it dates the last visit, not the league it was made in. That is
 * why nothing below `certain` is used without a person choosing it.
 */
export function inferOrigin(
  league: string,
  lastLogin: number | null,
  now = Date.now(),
): { slug: string | null; confidence: string } {
  if (!isPermanent(league)) {
    const core = leagueCore(league).toLowerCase();
    const found = POE2_LEAGUES.find((row) => row.name.toLowerCase() === core);
    return found ? { slug: found.slug, confidence: "certain" } : { slug: null, confidence: "none" };
  }
  if (!lastLogin) return { slug: null, confidence: "none" };
  const at = lastLogin * 1000;
  const spans = POE2_LEAGUES.filter((row) => {
    if (!row.startDate) return false;
    const start = Date.parse(`${row.startDate}T00:00:00Z`);
    const end = row.endDate ? Date.parse(`${row.endDate}T23:59:59Z`) : Infinity;
    return at >= start && at <= end;
  });
  const running = spans.filter((row) => !row.endDate || Date.parse(`${row.endDate}T23:59:59Z`) > now);
  if (running.length || spans.length === 0) return { slug: null, confidence: "none" };
  if (spans.length > 1) return { slug: null, confidence: "ambiguous" };
  return { slug: spans[0].slug, confidence: "likely" };
}

/**
 * The character's own record, from the detail call where it succeeded and the
 * list entry where it did not. A character whose detail call failed is left out
 * of the export entirely: importing it would mark it as holding a build when it
 * holds nothing, and the rule is that a build is never replaced without asking.
 */
function readCharacter(entry: Json): PoeExportCharacter | null {
  const detail = entry?.raw?.items?.data;
  if (!detail || !Array.isArray(detail.equipment)) return null;
  const listed = entry?.raw?.character ?? {};
  const name = str(detail.name) ?? str(listed.name) ?? str(entry?.name);
  if (!name) return null;
  const league = str(detail.league) ?? str(listed.league) ?? "Unknown";
  const lastLoginTime = numeric(detail.lastLoginTime ?? listed.lastLoginTime);
  const { className, ascendancy } = classFromId(str(detail.class) ?? str(listed.class));
  const origin = inferOrigin(league, lastLoginTime);
  return {
    name,
    league,
    level: numeric(detail.level ?? listed.level),
    baseClass: className,
    ascendancy,
    lastLogin: lastLoginTime ? new Date(lastLoginTime * 1000).toISOString() : null,
    originPatch: origin.slug,
    originConfidence: origin.confidence,
    // The site has no skill slots, and the skills an item grants — a spear's
    // Spear Throw — are not what a character was built around. No guess is
    // better than that one.
    mainSkill: null,
    raw: { character: listed, detail },
  };
}

/** Read and validate the file, without mapping any build. */
export function readPoe2Export(parsed: Json): PoeExport & { skippedCharacters: string[] } {
  const version = parsed?.schema_version;
  if (typeof version !== "number" || Math.floor(version) !== POE2_EXPORT_SCHEMA) {
    throw new PoeExportError(
      `This archive reads Path of Exile 2 export schema ${POE2_EXPORT_SCHEMA}; that file is schema ${version ?? "unknown"}.`,
    );
  }
  const entries: Json[] = Array.isArray(parsed.characters) ? parsed.characters : [];
  const characters: PoeExportCharacter[] = [];
  const skippedCharacters: string[] = [];
  for (const entry of entries) {
    const character = readCharacter(entry);
    if (character) characters.push(character);
    else skippedCharacters.push(String(entry?.name ?? entry?.raw?.character?.name ?? "unnamed"));
  }
  if (!characters.length) throw new PoeExportError("That export has no characters with gear in it.");
  return {
    account: String(parsed.account ?? "unknown account"),
    realm: "poe2",
    generatedAt: str(parsed.exported_at) ?? str(parsed.generated_at),
    characters,
    skippedCharacters,
  };
}

/**
 * Paper-doll slots. The archive names slots the way Path of Building does. The
 * second weapon set has no cell on the doll and is drawn beneath it, the way
 * Path of Exile 1's weapon swap is.
 */
const SLOT_NAMES: Record<string, string> = {
  Weapon: "Weapon 1",
  Offhand: "Weapon 2",
  Weapon2: "Weapon 1 Swap",
  Offhand2: "Weapon 2 Swap",
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
 * Flasks and charms share one inventory, "Flask": the life and mana flasks sit
 * at x 0 and 1, the charms at 2 to 4 (a belt's "Charm Slots" says how many are
 * usable). Checked against every character in the first export.
 */
function flaskSlot(x: number | null): string {
  const position = x ?? 0;
  return position < 2 ? `Flask ${position + 1}` : `Charm ${position - 1}`;
}

/** The game prints these at the foot of an item. */
const FOOTER_FLAGS: [string, string][] = [
  ["doubleCorrupted", "Twice Corrupted"],
  ["corrupted", "Corrupted"],
  ["mirrored", "Mirrored"],
  ["duplicated", "Mirrored"],
  ["split", "Split"],
  ["fractured", "Fractured Item"],
  ["mutated", "Mutated"],
];

/** A mod line: its text without markup, and the flags the site puts beside it. */
function modLine(entry: Json, extraTags: string[] = []): string | null {
  const raw = typeof entry === "string" ? entry : str(entry?.description);
  if (!raw) return null;
  const text = plainText(raw).trim();
  if (!text) return null;
  const tags = [...extraTags];
  for (const [flag, on] of Object.entries((entry?.flags ?? {}) as Record<string, unknown>)) {
    if (on && !tags.includes(flag)) tags.push(flag);
  }
  return tags.length ? `${text}  ·  ${tags.join(", ")}` : text;
}

function lines(value: Json, tags: string[] = []): string[] {
  return (Array.isArray(value) ? value : []).map((entry) => modLine(entry, tags)).filter((line): line is string => !!line);
}

/**
 * A property's display text. Some carry their values inline as `{0}`, `{1}` —
 * "Recovers {0} Life over {1} Seconds" — and the rest are "Name: value".
 */
function propertyText(property: Json): { name: string; value: string } | null {
  const name = plainText(String(property?.name ?? "")).trim();
  const values: string[] = (Array.isArray(property?.values) ? property.values : []).map((value: Json) =>
    plainText(String(Array.isArray(value) ? value[0] : value)),
  );
  if (/\{\d+\}/.test(name)) {
    return { name: name.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? ""), value: "" };
  }
  if (!name) return null;
  return { name, value: values.join(", ") };
}

function firstNumber(value: string): number | undefined {
  const match = /-?\d+(?:\.\d+)?/.exec(value);
  return match ? Math.round(Number(match[0])) : undefined;
}

/**
 * "Requires Level 67, 134 Str", one part per figure, as the game states them.
 * The second element of a value pair is 1 where the game shows the figure as
 * changed, which is what colours it.
 */
function requirementLines(requirements: Json): { text: string; modified: boolean }[] {
  const parts: { text: string; modified: boolean }[] = [];
  for (const entry of Array.isArray(requirements) ? requirements : []) {
    const name = plainText(String(entry?.name ?? "")).trim();
    const pair = Array.isArray(entry?.values) ? entry.values[0] : null;
    const value = pair ? plainText(String(pair[0])) : "";
    if (!name || !value) continue;
    const suffix = str(entry?.suffix);
    const text = name === "Level" ? `Level ${value}` : `${value} ${name}${suffix ? ` ${suffix}` : ""}`;
    parts.push({ text, modified: pair?.[1] === 1 && !suffix });
  }
  return parts;
}

function isGem(entry: Json): boolean {
  return entry?.frameType === 4 || entry?.frameTypeId === "Gem" || entry?.support !== undefined;
}

function itemText(item: ParsedItem): string {
  const header = [`Rarity: ${item.rarity}`, item.name];
  if (item.base && item.base !== item.name) header.push(item.base);
  return [...header, ...item.implicits, ...item.explicits, ...item.flags].join("\n");
}

/** One equipped item, in the shape the tooltip and the paper doll read. */
export function mapItem(source: Json, id: number, slot: string | undefined): ParsedItem {
  const typeLine = str(source?.typeLine) ?? str(source?.baseType) ?? "Unknown item";
  const name = str(source?.name) ?? typeLine;
  const base = str(source?.baseType) ?? typeLine;

  const item: ParsedItem = {
    id,
    slot,
    rarity: String(source?.rarity ?? source?.frameTypeId ?? "Normal").toUpperCase(),
    name,
    base,
    itemLevel: numeric(source?.ilvl) || undefined,
    sockets: [],
    influences: [],
    flags: [],
    implicits: [],
    explicits: [],
    iconUrl: str(source?.icon) ?? undefined,
    size: [numeric(source?.w) ?? 1, numeric(source?.h) ?? 1],
    raw: "",
  };

  // Above the line: enchantments, then the runes' and soul cores' effect on
  // this item, then the skills it grants, then its own implicits. A rune mod is
  // tagged `enchant` as well as `rune` so it sits in the enchant section and
  // takes its colour, the way the game draws it.
  item.implicits.push(...lines(source?.enchantMods, ["enchant"]));
  item.implicits.push(...lines(source?.runeMods, ["enchant", "rune"]));
  for (const granted of Array.isArray(source?.grantedSkills) ? source.grantedSkills : []) {
    const value = Array.isArray(granted?.values?.[0]) ? granted.values[0][0] : null;
    if (value) item.implicits.push(`Grants Skill: ${plainText(String(value))}`);
  }
  item.implicits.push(...lines(source?.implicitMods));

  item.explicits.push(...lines(source?.explicitMods));
  item.explicits.push(...lines(source?.utilityMods));

  if (source?.identified === false) item.flags.push("Unidentified");
  for (const [flag, label] of FOOTER_FLAGS) {
    if (source?.[flag] && !item.flags.includes(label)) item.flags.push(label);
  }
  // "Twice Corrupted" already says corrupted.
  if (item.flags.includes("Twice Corrupted")) item.flags = item.flags.filter((flag) => flag !== "Corrupted");

  const properties: { name: string; value: string }[] = [];
  for (const property of Array.isArray(source?.properties) ? source.properties : []) {
    const text = propertyText(property);
    if (!text) continue;
    const number = firstNumber(text.value);
    if (/^Quality$/i.test(text.name)) {
      item.quality = number;
      continue;
    }
    if (/^Armour$/i.test(text.name)) {
      item.armour = number;
      continue;
    }
    if (/^Evasion Rating$/i.test(text.name)) {
      item.evasion = number;
      continue;
    }
    if (/^Energy Shield$/i.test(text.name)) {
      item.energyShield = number;
      continue;
    }
    if (/^(?:Chance to )?Block(?: chance)?$/i.test(text.name)) {
      item.block = number;
      continue;
    }
    // A property with no value is a label — the item's class ("Two Hand Mace",
    // "Belt"), which the archive does not show. One whose values were written
    // into its name ("Recovers 2800 Life over 3 Seconds") states a number and
    // is kept.
    if (!text.value && !/\d/.test(text.name)) continue;
    properties.push(text);
  }

  // What sits in the item's rune sockets: runes, soul cores, idols. Their
  // effect on the item is already in its rune mods above; the names say which.
  const augments = (Array.isArray(source?.socketedItems) ? source.socketedItems : [])
    .filter((entry: Json) => !isGem(entry))
    .map((entry: Json) => str(entry?.typeLine) ?? str(entry?.baseType))
    .filter((value: string | null): value is string => !!value);
  const runeSockets = (Array.isArray(source?.sockets) ? source.sockets : []).filter(
    (socket: Json) => socket?.type === "rune",
  ).length;
  if (runeSockets) {
    const empty = runeSockets - augments.length;
    properties.push({
      name: "Rune Sockets",
      value: [...augments, ...Array.from({ length: Math.max(0, empty) }, () => "empty")].join(", "),
    });
  }
  if (properties.length) item.properties = properties;

  const requires = requirementLines(source?.requirements);
  if (requires.length) item.requires = requires;
  const level = requires.find((part) => part.text.startsWith("Level "));
  if (level) item.levelReq = firstNumber(level.text);
  item.raw = itemText(item);
  return item;
}

function gemLevel(source: Json): number | null {
  for (const property of Array.isArray(source?.properties) ? source.properties : []) {
    if (plainText(String(property?.name ?? "")) === "Level") return firstNumber(String(property?.values?.[0]?.[0] ?? "")) ?? null;
  }
  return null;
}

function gemQuality(source: Json): number | null {
  for (const property of Array.isArray(source?.properties) ? source.properties : []) {
    if (plainText(String(property?.name ?? "")) === "Quality") return firstNumber(String(property?.values?.[0]?.[0] ?? "")) ?? null;
  }
  return null;
}

function mapGem(source: Json): Gem {
  return {
    name: str(source?.typeLine) ?? str(source?.baseType) ?? "Unknown gem",
    level: gemLevel(source),
    quality: gemQuality(source),
    enabled: true,
    support: Boolean(source?.support),
  };
}

/** Turn one character of an export into the structure a character page renders. */
export function buildFromPoe2Export(character: PoeExportCharacter, from: PoeExport): BuildData {
  const detail: Json = character.raw?.detail ?? {};
  const items: ParsedItem[] = [];
  const slots: Record<string, number> = {};
  const skillGroups: SkillGroup[] = [];
  let nextId = 1;

  for (const entry of Array.isArray(detail.equipment) ? detail.equipment : []) {
    const inventory = String(entry?.inventoryId ?? "");
    const slot = inventory === "Flask" ? flaskSlot(numeric(entry?.x)) : SLOT_NAMES[inventory] ?? inventory;
    const item = mapItem(entry, nextId++, slot);
    items.push(item);
    if (slot) slots[slot] = item.id;

    // A skill an item grants arrives as a gem in the item's sockets, with its
    // supports socketed into it in turn. Each is one group, labelled by the
    // item that grants it: these are the only gems the site reports.
    for (const socketed of Array.isArray(entry?.socketedItems) ? entry.socketedItems : []) {
      if (!isGem(socketed) || socketed?.support) continue;
      const supports = (Array.isArray(socketed?.socketedItems) ? socketed.socketedItems : []).filter(isGem);
      skillGroups.push({
        label: item.name,
        slot,
        enabled: true,
        isMain: false,
        gems: [mapGem(socketed), ...supports.map(mapGem)],
      });
    }
  }

  return {
    source: "poe2-site",
    className: character.baseClass ?? undefined,
    ascendClassName: character.ascendancy ?? undefined,
    level: character.level ?? undefined,
    stats: {},
    skillGroups,
    items,
    slots,
    // No passive tree: the site has no endpoint for one. A Path of Building 2
    // code supplies it.
    trees: [],
    activeTree: 0,
    origin: {
      account: from.account,
      realm: "poe2",
      lastLogin: character.lastLogin ?? undefined,
      fetchedAt: from.generatedAt ?? undefined,
    },
    config: [],
  };
}

/** What `characters.source_payload` holds for a Path of Exile 2 character. */
export type StoredPoe2Export = {
  game: "poe2";
  account: string;
  realm: "poe2";
  generated_at: string | null;
  character: Json;
};

export function storedPoe2Payload(character: PoeExportCharacter, from: PoeExport): StoredPoe2Export {
  return { game: "poe2", account: from.account, realm: "poe2", generated_at: from.generatedAt, character: character.raw };
}

/** Re-derive a build from the payload stored at import, with no file in hand. */
export function rebuildFromStoredPoe2(stored: StoredPoe2Export): BuildData {
  const exported = readPoe2Export({
    schema_version: POE2_EXPORT_SCHEMA,
    account: stored.account,
    exported_at: stored.generated_at,
    characters: [{ raw: { character: stored.character?.character, items: { data: stored.character?.detail } } }],
  });
  return buildFromPoe2Export(exported.characters[0], exported);
}
