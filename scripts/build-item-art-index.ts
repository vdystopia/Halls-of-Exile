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
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data/base_items.json";
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
};

/** name -> [art path without extension, inventory width, inventory height] */
export type ArtIndex = Record<string, [string, number, number]>;

async function main() {
  process.stdout.write(`fetching ${SOURCE}\n`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`RePoE returned HTTP ${response.status}`);
  const data = (await response.json()) as Record<string, BaseItem>;

  const index: ArtIndex = {};
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
    index[name] = [dds.slice(0, -4), item.inventory_width ?? 1, item.inventory_height ?? 1];
  }

  const sorted: ArtIndex = {};
  for (const key of Object.keys(index).sort()) sorted[key] = index[key];

  fs.writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 0)}\n`);
  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  process.stdout.write(`wrote ${Object.keys(sorted).length} base items to ${OUTPUT} (${size} KB)\n`);
  if (skipped) process.stdout.write(`skipped ${skipped} entries with an unexpected art path\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
