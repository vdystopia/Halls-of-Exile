import zlib from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { parseItem } from "./items";
import type { BuildData, Gem, ParsedItem, SkillGroup, TreeSpec } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  trimValues: true,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function num(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null) return fallback;
  return String(value) === "true";
}

export class PobError extends Error {}

/** Decode a Path of Building share code (URL-safe base64 + zlib deflate) into XML. */
export function decodePobCode(code: string): string {
  const cleaned = code.trim().replace(/\s+/g, "");
  if (!cleaned) throw new PobError("Empty build code.");
  const base64 = cleaned.replace(/-/g, "+").replace(/_/g, "/");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw new PobError("That does not look like a Path of Building code.");
  }
  for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
    try {
      const xml = inflate(buffer).toString("utf8");
      if (xml.includes("<PathOfBuilding")) return xml;
    } catch {
      // try the next strategy
    }
  }
  throw new PobError("Could not decompress that build code — is it a full Path of Building export?");
}

const RAW_URL_BUILDERS: { test: RegExp; raw: (id: string) => string }[] = [
  { test: /^https?:\/\/(?:www\.)?pobb\.in\/([\w-]+)/i, raw: (id) => `https://pobb.in/${id}/raw` },
  { test: /^https?:\/\/(?:www\.)?pastebin\.com\/(?:raw\/)?([\w]+)/i, raw: (id) => `https://pastebin.com/raw/${id}` },
  { test: /^https?:\/\/(?:www\.)?poe\.ninja\/pob\/(?:raw\/)?([\w-]+)/i, raw: (id) => `https://poe.ninja/pob/raw/${id}` },
  { test: /^https?:\/\/(?:www\.)?pobarchives\.com\/build\/([\w-]+)/i, raw: (id) => `https://pobarchives.com/build/${id}/raw` },
];

export function isPobUrl(input: string): boolean {
  return RAW_URL_BUILDERS.some((builder) => builder.test.test(input.trim()));
}

/** Fetch the share code behind a pobb.in / pastebin / poe.ninja link. */
export async function fetchPobCode(url: string): Promise<string> {
  const trimmed = url.trim();
  const builder = RAW_URL_BUILDERS.find((candidate) => candidate.test.test(trimmed));
  if (!builder) throw new PobError("Unsupported link. Paste a pobb.in, pastebin or poe.ninja build link.");
  const id = builder.test.exec(trimmed)![1];
  const response = await fetch(builder.raw(id), {
    headers: { "User-Agent": "halls-of-exile" },
    cache: "no-store",
  });
  if (!response.ok) throw new PobError(`Could not read that link (HTTP ${response.status}).`);
  const body = (await response.text()).trim();
  if (!body) throw new PobError("That link returned an empty build.");
  return body;
}

function parseStats(build: Node): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const entry of toArray<Node>(build?.PlayerStat)) {
    const key = entry["@_stat"];
    const value = num(entry["@_value"]);
    if (key && value !== undefined) stats[key] = value;
  }
  return stats;
}

function parseMinionStats(build: Node): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const entry of toArray<Node>(build?.MinionStat)) {
    const key = entry["@_stat"];
    const value = num(entry["@_value"]);
    if (key && value !== undefined) stats[key] = value;
  }
  return stats;
}

function parseGem(node: Node): Gem {
  const name: string = node["@_nameSpec"] ?? node["@_skillId"] ?? "Unknown gem";
  const skillId: string = node["@_skillId"] ?? "";
  return {
    name,
    // The metadata id is what the gem colour is looked up by; a transfigured
    // gem carries its base gem's id, which is the same colour.
    gemId: node["@_gemId"] || undefined,
    level: num(node["@_level"]) ?? null,
    quality: num(node["@_quality"]) ?? null,
    enabled: bool(node["@_enabled"]),
    support: skillId.startsWith("Support") || /\bSupport$/.test(name),
    count: num(node["@_count"]),
  };
}

function parseSkills(root: Node, mainSocketGroup: number): { groups: SkillGroup[]; mainSkill?: string } {
  const skillsNode = root?.Skills;
  const skillSets = toArray<Node>(skillsNode?.SkillSet);
  const activeSetId = skillsNode?.["@_activeSkillSet"];
  const activeSet =
    skillSets.find((set) => String(set["@_id"]) === String(activeSetId)) ?? skillSets[0] ?? skillsNode;
  const rawSkills = toArray<Node>(activeSet?.Skill);

  const groups: SkillGroup[] = rawSkills.map((skill, index) => {
    const gems = toArray<Node>(skill.Gem).map(parseGem);
    const active = gems.find((gem) => !gem.support);
    const label: string = skill["@_label"] || active?.name || `Socket group ${index + 1}`;
    return {
      label,
      slot: skill["@_slot"] || undefined,
      enabled: bool(skill["@_enabled"]),
      isMain: index + 1 === mainSocketGroup,
      gems,
    };
  });

  const mainGroup = groups[mainSocketGroup - 1] ?? groups.find((group) => group.enabled);
  const mainSkillGem = mainGroup?.gems.find((gem) => !gem.support && gem.enabled) ?? mainGroup?.gems[0];
  return { groups, mainSkill: mainSkillGem?.name };
}

/**
 * The item ids of the jewels socketed into the active passive tree. Path of
 * Building keeps every item a build has ever held in one list, so this and the
 * equipment slots together are what "in use" means; anything else is a spare.
 */
function parseTreeJewels(root: Node): number[] {
  const treeNode = root?.Tree;
  const specs = toArray<Node>(treeNode?.Spec);
  const active = specs[(num(treeNode?.["@_activeSpec"]) ?? 1) - 1] ?? specs[0];
  return toArray<Node>(active?.Sockets?.Socket)
    .map((socket) => num(socket["@_itemId"]))
    .filter((id): id is number => Boolean(id));
}

function parseTrees(root: Node): { trees: TreeSpec[]; activeTree: number } {
  const treeNode = root?.Tree;
  const specs = toArray<Node>(treeNode?.Spec);
  const trees: TreeSpec[] = specs.map((spec, index) => {
    const nodes: string = spec["@_nodes"] ?? "";
    const masteries: string = spec["@_masteryEffects"] ?? "";
    const url = typeof spec.URL === "string" ? spec.URL : spec.URL?.["#text"];
    return {
      title: spec["@_title"] || `Tree ${index + 1}`,
      url: typeof url === "string" ? url.trim() : undefined,
      nodeCount: nodes ? nodes.split(",").filter(Boolean).length : 0,
      masteryCount: masteries ? masteries.split("},{").length : 0,
      treeVersion: (spec["@_treeVersion"] ?? "").replace(/_/g, "."),
    };
  });
  const active = num(treeNode?.["@_activeSpec"]) ?? 1;
  return { trees, activeTree: Math.max(0, active - 1) };
}

function parseItems(root: Node): { items: ParsedItem[]; slots: Record<string, number> } {
  const itemsNode = root?.Items;
  const items: ParsedItem[] = [];
  const byId = new Map<number, ParsedItem>();

  for (const node of toArray<Node>(itemsNode?.Item)) {
    const id = num(node["@_id"]) ?? items.length + 1;
    const text: string = typeof node === "string" ? node : (node["#text"] ?? "");
    if (!text.trim()) continue;
    const item = parseItem(text, id);
    items.push(item);
    byId.set(id, item);
  }

  const itemSets = toArray<Node>(itemsNode?.ItemSet);
  const activeSetId = itemsNode?.["@_activeItemSet"];
  const activeSet = itemSets.find((set) => String(set["@_id"]) === String(activeSetId)) ?? itemSets[0];
  const slotNodes = toArray<Node>(activeSet?.Slot ?? itemsNode?.Slot);

  const slots: Record<string, number> = {};
  for (const slot of slotNodes) {
    const name: string = slot["@_name"];
    const itemId = num(slot["@_itemId"]);
    if (!name || !itemId) continue;
    slots[name] = itemId;
    const item = byId.get(itemId);
    if (item) item.slot = name;
  }

  return { items, slots };
}

function parseConfig(root: Node): { name: string; value: string }[] {
  return toArray<Node>(root?.Config?.Input)
    .map((input) => {
      const raw = input["@_string"] ?? input["@_number"] ?? input["@_boolean"];
      return { name: String(input["@_name"] ?? ""), value: raw === undefined ? "" : String(raw) };
    })
    .filter((entry) => entry.name && entry.value && entry.value !== "false");
}

/**
 * What the parser produces, as a number. A character stores its parsed build as
 * JSON, so a fix to the parser reaches only imports made after it — the archive
 * kept showing base percentiles as mods long after the parser stopped reading
 * them that way. Bump this whenever a change makes an older stored build wrong,
 * and `migrate()` re-parses every character that still carries the original
 * share code.
 *
 * 1 — the first parser.
 * 2 — header keys (BasePercentile, Intangibility, Memory Strands) no longer
 *     read as mods, which also fixes the implicit boundary they shifted.
 * 3 — jewels socketed in the passive tree are recorded, so the gear panel can
 *     tell them from the spares Path of Building keeps in the same list, and a
 *     gem carries its metadata id so its colour can be looked up.
 */
export const PARSER_VERSION = 3;

/** Turn a Path of Building export into the structure the character page renders. */
export function parsePob(code: string): BuildData {
  const xml = decodePobCode(code);
  const parsed = parser.parse(xml);
  const root = parsed?.PathOfBuilding;
  if (!root) throw new PobError("This build code has no PathOfBuilding data.");

  const build = root.Build ?? {};
  const mainSocketGroup = num(build["@_mainSocketGroup"]) ?? 1;
  const { groups, mainSkill } = parseSkills(root, mainSocketGroup);
  const { items, slots } = parseItems(root);
  const { trees, activeTree } = parseTrees(root);
  const treeJewels = parseTreeJewels(root);
  const notesRaw = root.Notes;
  const notes = typeof notesRaw === "string" ? notesRaw : (notesRaw?.["#text"] ?? "");

  return {
    source: "pob",
    pobVersion: (build["@_targetVersion"] ?? "").replace(/_/g, "."),
    className: build["@_className"] || undefined,
    ascendClassName:
      build["@_ascendClassName"] && build["@_ascendClassName"] !== "None"
        ? build["@_ascendClassName"]
        : undefined,
    level: num(build["@_level"]),
    bandit: build["@_bandit"] && build["@_bandit"] !== "None" ? build["@_bandit"] : undefined,
    mainSkill,
    stats: parseStats(build),
    minionStats: parseMinionStats(build),
    skillGroups: groups,
    items,
    slots,
    trees,
    activeTree,
    treeJewels,
    notes: typeof notes === "string" && notes.trim() ? notes.trim() : undefined,
    config: parseConfig(root),
  };
}

export function emptyBuild(): BuildData {
  return {
    source: "manual",
    stats: {},
    skillGroups: [],
    items: [],
    slots: {},
    trees: [],
    activeTree: 0,
    treeJewels: [],
    config: [],
  };
}
