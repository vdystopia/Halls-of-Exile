/**
 * Build the skill-gem art index from RePoE.
 *
 *   npm run gems:art
 *
 * A character's main skill is drawn beside its name, and the picture is the
 * gem's own inventory art. That art is not in gems.json — the colour index's
 * source — but in base_items.json, where every gem is a base item carrying the
 * same `visual_identity.dds_file` the equipment index already reads. The path
 * is what the image CDN serves, so nothing is scraped or guessed.
 *
 * Only the path is kept. A gem is always drawn in a single square cell, so the
 * inventory footprint that matters for equipment is meaningless here.
 *
 * Keys follow gem-colors.json so the two indexes answer to the same spellings:
 * the metadata id, the display name, and the display name without a trailing
 * "Support", because an export writes "Arcane Surge" where RePoE writes
 * "Arcane Surge Support". Unreleased gems are dropped; legacy ones are kept,
 * since a character from 3.2 may well be built around a gem that no longer
 * drops and its record still has to render.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE =
  "https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data/base_items.json";
const OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe1", "gem-art-index.json");

const GEM_CLASSES = new Set(["Active Skill Gem", "Support Skill Gem"]);

type BaseItem = {
  name?: string;
  item_class?: string;
  release_state?: string;
  visual_identity?: { dds_file?: string };
};

async function main() {
  process.stdout.write(`fetching ${SOURCE}\n`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`RePoE returned HTTP ${response.status}`);
  const data = (await response.json()) as Record<string, BaseItem>;

  const art: Record<string, string> = {};
  for (const [id, item] of Object.entries(data)) {
    if (!item.item_class || !GEM_CLASSES.has(item.item_class)) continue;
    if (item.release_state === "unreleased") continue;
    const dds = item.visual_identity?.dds_file;
    if (!dds) continue;
    // The CDN serves .png at the path RePoE records as .dds.
    const artPath = dds.replace(/\.dds$/, "");
    const name = item.name;
    const keys = [id, name, name?.replace(/ Support$/, "")];
    for (const key of keys) {
      if (key && !art[key]) art[key] = artPath;
    }
  }

  const sorted: Record<string, string> = {};
  for (const key of Object.keys(art).sort()) sorted[key] = art[key];

  fs.writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 0)}\n`);
  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  const images = new Set(Object.values(sorted)).size;
  process.stdout.write(
    `wrote ${Object.keys(sorted).length} gem keys (${images} images) to ${OUTPUT} (${size} KB)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
