/**
 * Build the base-item art index from RePoE.
 *
 *   npm run art:index
 *
 * RePoE is the canonical dump of Path of Exile's item data. Every base item
 * carries a `visual_identity.dds_file`, which is also its path on the game's
 * image CDN, plus the inventory dimensions the art is drawn at. Those three
 * facts are all the paper doll needs, so this writes them to a small JSON file
 * that ships with the code; the images themselves are fetched separately by
 * scripts/fetch-item-art.ts.
 *
 * A handful of RePoE's art paths are not what the image CDN serves — Ancient
 * Skull records Art/2DItems/Effects/Hats/ChuhutlusSkull, which 404s — so
 * src/lib/art-overrides.json corrects them by name after the dump is read.
 * Editing the generated index by hand would not survive the next run; that file
 * would. An entry with an empty value is a known-broken path with no known
 * replacement: it keeps whatever RePoE says and the tile falls back to a
 * silhouette.
 *
 * Uniques come from the same dump and are indexed by name, because dozens of
 * uniques share one base — every Prismatic Jewel unique drew the same picture
 * while art was keyed on the base type alone. Only their art and footprint are
 * taken: a unique's requirements and block still come from its base type, which
 * uniques.json does not name.
 */
import fs from "node:fs";
import path from "node:path";
import overrides from "../src/lib/art-overrides.json";

const BASE_SOURCE =
  "https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data/base_items.json";
const UNIQUE_SOURCE =
  "https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data/uniques.json";
const OUTPUT = path.join(process.cwd(), "src", "lib", "item-art-index.json");

/** Only things that can sit in an equipment slot are worth indexing. */
const EQUIPPABLE_CLASSES = new Set([
  "Amulet", "Belt", "Body Armour", "Boots", "Bow", "Claw", "Dagger", "FishingRod",
  "Gloves", "Helmet", "One Hand Axe", "One Hand Mace", "One Hand Sword", "Quiver",
  "Ring", "Rune Dagger", "Sceptre", "Shield", "Staff", "Thrusting One Hand Sword",
  "Two Hand Axe", "Two Hand Mace", "Two Hand Sword", "Wand", "Warstaff",
  "LifeFlask", "ManaFlask", "HybridFlask", "UtilityFlask",
  "Jewel", "AbyssJewel",
]);

type BaseItem = {
  name?: string;
  item_class?: string;
  inventory_width?: number;
  inventory_height?: number;
  visual_identity?: { dds_file?: string };
  properties?: { block?: number | null };
  requirements?: { level?: number; strength?: number; dexterity?: number; intelligence?: number };
};

export type BaseEntry = {
  /** Art path without extension, e.g. Art/2DItems/Rings/AmethystRing */
  art: string;
  /** Inventory footprint, which is the aspect the art is drawn at. */
  w: number;
  h: number;
  cls: string;
  /** Shields only: the base's block chance before the item's own modifiers. */
  block?: number;
  /** [level, strength, dexterity, intelligence] */
  req: [number, number, number, number];
};

/** A unique adds nothing to its base but its own picture. */
export type UniqueEntry = { art: string; w: number; h: number };

export type ArtIndex = {
  bases: Record<string, BaseEntry>;
  uniques: Record<string, UniqueEntry>;
};

type UniqueItem = {
  name?: string;
  item_class?: string;
  inventory_width?: number;
  inventory_height?: number;
  is_alternate_art?: boolean;
  visual_identity?: { dds_file?: string };
};

async function fetchJson<T>(source: string): Promise<T> {
  process.stdout.write(`fetching ${source}\n`);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`RePoE returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function main() {
  const data = await fetchJson<Record<string, BaseItem>>(BASE_SOURCE);

  const index: Record<string, BaseEntry> = {};
  let skipped = 0;
  for (const item of Object.values(data)) {
    const name = item.name?.trim();
    const dds = item.visual_identity?.dds_file;
    if (!name || !dds || !item.item_class || !EQUIPPABLE_CLASSES.has(item.item_class)) continue;
    if (index[name]) continue;
    if (!dds.endsWith(".dds")) {
      skipped += 1;
      continue;
    }
    const requirements = item.requirements ?? {};
    const entry: BaseEntry = {
      art: dds.slice(0, -4),
      w: item.inventory_width ?? 1,
      h: item.inventory_height ?? 1,
      cls: item.item_class,
      req: [
        requirements.level ?? 0,
        requirements.strength ?? 0,
        requirements.dexterity ?? 0,
        requirements.intelligence ?? 0,
      ],
    };
    if (item.item_class === "Shield" && item.properties?.block) entry.block = item.properties.block;
    index[name] = entry;
  }

  const uniqueData = await fetchJson<Record<string, UniqueItem>>(UNIQUE_SOURCE);
  const uniques: Record<string, UniqueEntry> = {};
  for (const item of Object.values(uniqueData)) {
    const name = item.name?.trim();
    const dds = item.visual_identity?.dds_file;
    // Alternate art is a cosmetic variant of an item already in the index, and
    // it is not what a Path of Building export names.
    if (!name || !dds || item.is_alternate_art || !dds.endsWith(".dds")) continue;
    if (uniques[name]) continue;
    uniques[name] = {
      art: dds.slice(0, -4),
      w: item.inventory_width ?? 1,
      h: item.inventory_height ?? 1,
    };
  }

  // Corrections last, so a fixed path is not overwritten by the dump.
  for (const [name, art] of Object.entries(overrides as Record<string, string>)) {
    if (name.startsWith("_") || !art) continue;
    if (uniques[name]) uniques[name] = { ...uniques[name], art };
    else if (index[name]) index[name] = { ...index[name], art };
    else throw new Error(`art-overrides.json names "${name}", which is not in the catalogue`);
  }

  const sorted: ArtIndex = { bases: {}, uniques: {} };
  for (const key of Object.keys(index).sort()) sorted.bases[key] = index[key];
  for (const key of Object.keys(uniques).sort()) sorted.uniques[key] = uniques[key];

  fs.writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 0)}\n`);
  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  process.stdout.write(
    `wrote ${Object.keys(sorted.bases).length} base items and ${Object.keys(sorted.uniques).length} uniques to ${OUTPUT} (${size} KB)\n`,
  );
  if (skipped) process.stdout.write(`skipped ${skipped} entries with an unexpected art path\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
