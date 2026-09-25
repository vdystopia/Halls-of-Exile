import { XMLParser } from "fast-xml-parser";
import type { BuildData, Gem, ParsedItem, SkillGroup, TreeSpec } from "../../types";
import { decodePobCode, PobError } from "../poe1/pob";
import { classFromId } from "./classes";
import { parseItem } from "./pob-items";

/**
 * Read a Path of Building 2 share code into the structure a character page
 * renders.
 *
 * The envelope is Path of Building 1's — URL-safe base64 over a zlib deflate of
 * XML — so decoding is shared. The document is not: its root is
 * `<PathOfBuilding2>`, which is how a code says which game it is for, and inside
 * it the tree carries both weapon sets' passives and the attribute chosen on
 * each "+5 to any Attribute" node, skills carry which weapon set they belong
 * to, and items carry rune sockets rather than linked colours.
 *
 * This is the only source for a Path of Exile 2 character's passive tree and
 * skill gems: pathofexile2.com serves neither, and Path of Building 2 reads them
 * from the official API. It is also the only source of computed stats — life,
 * resistances, damage — which are its engine's figures, not the game's.
 */

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
  if (value === undefined || value === null || value === "" || value === "nil") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || value === "nil") return fallback;
  return String(value) === "true";
}

function idList(value: unknown): number[] {
  return String(value ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/**
 * What the parser produces, as a number, for the reason `PARSER_VERSION` has
 * one. Path of Exile 2's is its own, so a fix to one game's parser leaves the
 * other game's characters alone.
 *
 * 1 — the first parser.
 * 2 — a code is the whole build: it no longer takes its gear from the site's
 *     export when both are on the row (see `composePoe2Build`).
 * 3 — a granted skill with no gem and no name is named from its skill id
 *     ("ThornsPlayer" reads "Thorns").
 */
export const POE2_PARSER_VERSION = 3;

/** Which game a decoded share code is for, by its root element. */
export function codeGame(xml: string): "poe1" | "poe2" | null {
  if (/<PathOfBuilding2[\s>]/.test(xml)) return "poe2";
  if (/<PathOfBuilding[\s>]/.test(xml)) return "poe1";
  return null;
}

function parseStats(build: Node, element: string): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const entry of toArray<Node>(build?.[element])) {
    const key = entry["@_stat"];
    const value = num(entry["@_value"]);
    if (key && value !== undefined) stats[key] = value;
  }
  return stats;
}

/**
 * A skill granted by the tree or an item comes with no gem and an empty
 * `nameSpec`, only an internal id: "ThornsPlayer", "MeleeUnarmedPlayer".
 * Dropping the "Player" suffix and spacing the words is what the game calls it.
 */
function skillIdName(skillId: unknown): string {
  if (typeof skillId !== "string") return "";
  return skillId.replace(/Player$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

function parseGem(node: Node): Gem {
  const name: string = node["@_nameSpec"] || skillIdName(node["@_skillId"]) || "Unknown gem";
  const gemId: string = node["@_gemId"] ?? "";
  return {
    name,
    gemId: gemId || undefined,
    level: num(node["@_level"]) ?? null,
    quality: num(node["@_quality"]) ?? null,
    enabled: bool(node["@_enabled"]),
    support: /\/SupportGem/.test(gemId) || String(node["@_skillId"] ?? "").startsWith("Support"),
    count: num(node["@_count"]),
  };
}

function parseSkills(root: Node, mainSocketGroup: number): { groups: SkillGroup[]; mainSkill?: string } {
  const skills = root?.Skills;
  const sets = toArray<Node>(skills?.SkillSet);
  const active = sets.find((set) => String(set["@_id"]) === String(skills?.["@_activeSkillSet"])) ?? sets[0] ?? skills;

  const groups: SkillGroup[] = toArray<Node>(active?.Skill).map((skill, index) => {
    const weaponSets: (1 | 2)[] = [];
    if (bool(skill["@_set1"], false)) weaponSets.push(1);
    if (bool(skill["@_set2"], false)) weaponSets.push(2);
    const source: string | undefined = skill["@_source"] || undefined;
    return {
      label: skill["@_label"] || "",
      slot: skill["@_slot"] || undefined,
      enabled: bool(skill["@_enabled"]),
      isMain: index + 1 === mainSocketGroup,
      gems: toArray<Node>(skill.Gem).map(parseGem),
      ...(weaponSets.length ? { weaponSets } : {}),
      ...(source ? { source } : {}),
    };
  });

  const main = groups[mainSocketGroup - 1] ?? groups.find((group) => group.enabled);
  const gem = main?.gems.find((entry) => !entry.support && entry.enabled) ?? main?.gems[0];
  return { groups, mainSkill: gem?.name };
}

function activeSpec(root: Node): Node {
  const specs = toArray<Node>(root?.Tree?.Spec);
  return specs[(num(root?.Tree?.["@_activeSpec"]) ?? 1) - 1] ?? specs[0];
}

function parseTrees(root: Node): { trees: TreeSpec[]; activeTree: number } {
  const specs = toArray<Node>(root?.Tree?.Spec);
  const trees: TreeSpec[] = specs.map((spec, index) => {
    const nodes = idList(spec["@_nodes"]);
    const set1 = idList(spec.WeaponSet1?.["@_nodes"]);
    const set2 = idList(spec.WeaponSet2?.["@_nodes"]);

    const attributeChoices: Record<string, "str" | "dex" | "int"> = {};
    for (const override of toArray<Node>(spec.Overrides?.AttributeOverride)) {
      for (const [attribute, key] of [
        ["str", "@_strNodes"],
        ["dex", "@_dexNodes"],
        ["int", "@_intNodes"],
      ] as const) {
        for (const node of idList(override[key])) attributeChoices[String(node)] = attribute;
      }
    }

    const masteryEffects: Record<string, number> = {};
    for (const [, node, effect] of String(spec["@_masteryEffects"] ?? "").matchAll(/\{(\d+),(\d+)\}/g)) {
      if (Number(effect) < 65536) masteryEffects[node] = Number(effect);
    }

    return {
      title: spec["@_title"] || `Tree ${index + 1}`,
      // Path of Building 2 writes a pathofexile.com/passive-skill-tree link here
      // — Path of Exile 1's viewer — and that it opens this tree correctly is
      // unverified, so no link is offered rather than a wrong one.
      nodeCount: nodes.length,
      masteryCount: Object.keys(masteryEffects).length,
      treeVersion: String(spec["@_treeVersion"] ?? "").replace(/_/g, "."),
      nodes: nodes.length ? nodes : undefined,
      ...(Object.keys(masteryEffects).length ? { masteryEffects } : {}),
      ...(set1.length || set2.length ? { weaponSets: { 1: set1, 2: set2 } } : {}),
      ...(Object.keys(attributeChoices).length ? { attributeChoices } : {}),
    };
  });
  return { trees, activeTree: Math.max(0, (num(root?.Tree?.["@_activeSpec"]) ?? 1) - 1) };
}

/** Jewels in allocated sockets only, each once — the rule Path of Exile 1's parser follows. */
function parseTreeJewels(root: Node): number[] {
  const spec = activeSpec(root);
  const allocated = new Set(idList(spec?.["@_nodes"]));
  const ids = toArray<Node>(spec?.Sockets?.Socket)
    .filter((socket) => allocated.size === 0 || allocated.has(num(socket["@_nodeId"]) ?? 0))
    .map((socket) => num(socket["@_itemId"]))
    .filter((id): id is number => Boolean(id));
  return [...new Set(ids)];
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

  const sets = toArray<Node>(itemsNode?.ItemSet);
  const active = sets.find((set) => String(set["@_id"]) === String(itemsNode?.["@_activeItemSet"])) ?? sets[0];
  const slots: Record<string, number> = {};
  for (const slot of toArray<Node>(active?.Slot ?? itemsNode?.Slot)) {
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
  const config = root?.Config;
  const sets = toArray<Node>(config?.ConfigSet);
  const active = sets.find((set) => String(set["@_id"]) === String(config?.["@_activeConfigSet"])) ?? sets[0] ?? config;
  return toArray<Node>(active?.Input)
    .map((input) => {
      const raw = input["@_string"] ?? input["@_number"] ?? input["@_boolean"];
      return { name: String(input["@_name"] ?? ""), value: raw === undefined ? "" : String(raw) };
    })
    .filter((entry) => entry.name && entry.value && entry.value !== "false");
}

/** Turn a Path of Building 2 export into the structure the character page renders. */
export function parsePob2(code: string): BuildData {
  const xml = decodePobCode(code);
  if (codeGame(xml) !== "poe2") throw new PobError("That is not a Path of Building 2 code.");
  const root = parser.parse(xml)?.PathOfBuilding2;
  if (!root) throw new PobError("This build code has no PathOfBuilding2 data.");

  const build = root.Build ?? {};
  const mainSocketGroup = num(build["@_mainSocketGroup"]) ?? 1;
  const { groups, mainSkill } = parseSkills(root, mainSocketGroup);
  const { items, slots } = parseItems(root);
  const { trees, activeTree } = parseTrees(root);
  const notes = typeof root.Notes === "string" ? root.Notes : (root.Notes?.["#text"] ?? "");

  // The class comes as a display name ("Ranger") and the ascendancy both as a
  // name and as the game's id; the id is the one the site's export uses, so it
  // wins where both are present.
  const spec = activeSpec(root);
  const fromId = classFromId(spec?.["@_ascendancyInternalId"]);
  const ascendancy = build["@_ascendClassName"] && build["@_ascendClassName"] !== "None" ? build["@_ascendClassName"] : undefined;

  return {
    source: "pob",
    // `targetVersion` is Path of Building 2's own format marker ("0_1"), not
    // the game patch; the tree's version is on the tree.
    pobVersion: String(build["@_targetVersion"] ?? "").replace(/_/g, "."),
    className: build["@_className"] || fromId.className || undefined,
    ascendClassName: fromId.ascendancy ?? ascendancy,
    level: num(build["@_level"]),
    mainSkill,
    stats: parseStats(build, "PlayerStat"),
    minionStats: parseStats(build, "MinionStat"),
    skillGroups: groups,
    items,
    slots,
    trees,
    activeTree,
    treeJewels: parseTreeJewels(root),
    notes: notes.trim() ? notes.trim() : undefined,
    config: parseConfig(root),
  };
}
