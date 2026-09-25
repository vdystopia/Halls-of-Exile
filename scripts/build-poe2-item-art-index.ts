/**
 * Build Path of Exile 2's item art index from the repoe-fork data export.
 *
 *   npm run art:poe2
 *
 * A Path of Building 2 code names each item's base and, for a unique, its name
 * — never a picture — so a character imported from a code alone needs this to
 * draw its gear. Bases are keyed by name, uniques by their own name (dozens of
 * uniques share a base, and a rare's name is random, so only a unique is looked
 * up that way), each with its inventory footprint.
 *
 * Equipment and the things socketed into it only: weapons, armour, jewellery,
 * flasks and charms, jewels, runes and soul cores. Every picture is one frame —
 * checked on a flask, a charm, a bow, a unique amulet and a jewel — unlike Path
 * of Exile 1's three-layer flask sheets. `npm run art:fetch` downloads them as
 * WebP from the same export into public/items/poe2/, like the gem art.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "https://repoe-fork.github.io/poe2";
const OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe2", "item-art-index.json");

/** The item classes a character can wear or socket; everything else is currency, quest items and so on. */
const DRAWN = new Set([
  "Amulet", "Ring", "Belt", "Body Armour", "Helmet", "Gloves", "Boots", "Shield", "Buckler", "Focus", "Quiver",
  "One Hand Mace", "Two Hand Mace", "Warstaff", "Spear", "Bow", "Crossbow", "Talisman", "One Hand Sword",
  "Two Hand Sword", "Dagger", "One Hand Axe", "Two Hand Axe", "Flail", "Staff", "Wand", "Sceptre", "Claw",
  "LifeFlask", "ManaFlask", "UtilityFlask", "Jewel", "SoulCore",
]);

type Base = {
  name?: string;
  item_class?: string;
  release_state?: string;
  inventory_width?: number;
  inventory_height?: number;
  visual_identity?: { dds_file?: string };
};
type Unique = Base & { is_alternate_art?: boolean };

async function load<T>(file: string): Promise<T> {
  process.stdout.write(`fetching ${ROOT}/${file}\n`);
  const response = await fetch(`${ROOT}/${file}`);
  if (!response.ok) throw new Error(`repoe-fork returned HTTP ${response.status} for ${file}`);
  return (await response.json()) as T;
}

const entry = (item: Base) => ({
  art: String(item.visual_identity?.dds_file).replace(/\.dds$/, ""),
  w: item.inventory_width ?? 1,
  h: item.inventory_height ?? 1,
});

async function main() {
  const bases = await load<Record<string, Base>>("base_items.json");
  const uniques = await load<Record<string, Unique>>("uniques.json");

  const byBase: Record<string, { art: string; w: number; h: number }> = {};
  for (const item of Object.values(bases)) {
    if (!item.name || !item.item_class || !DRAWN.has(item.item_class)) continue;
    if (item.release_state === "unreleased" || !item.visual_identity?.dds_file) continue;
    if (!byBase[item.name]) byBase[item.name] = entry(item);
  }
  const byUnique: Record<string, { art: string; w: number; h: number }> = {};
  for (const item of Object.values(uniques)) {
    // An alternate-art copy shares its name with the original; the original's picture is the one.
    if (!item.name || item.is_alternate_art || !item.visual_identity?.dds_file) continue;
    if (!byUnique[item.name]) byUnique[item.name] = entry(item);
  }

  const sorted = (map: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(map).sort().map((key) => [key, map[key]]));
  fs.writeFileSync(OUTPUT, `${JSON.stringify({ bases: sorted(byBase), uniques: sorted(byUnique) }, null, 0)}\n`);
  process.stdout.write(
    `wrote ${Object.keys(byBase).length} bases and ${Object.keys(byUnique).length} uniques to ${OUTPUT} ` +
      `(${(fs.statSync(OUTPUT).size / 1024).toFixed(0)} KB)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
