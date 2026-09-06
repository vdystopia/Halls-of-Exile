/**
 * Build the gem colour index from RePoE.
 *
 *   npm run gems:index
 *
 * A gem's colour is its attribute — red is strength, green dexterity, blue
 * intelligence, white none — and Path of Building's export does not record it:
 * a Gem node carries only the gem's metadata id, name and level. RePoE's gem
 * dump carries `color` per gem, so this reduces a 34 MB file to a map from
 * metadata id and display name to a single letter.
 *
 * Transfigured gems ("Frostblink of Wintry Blast") export the base gem's
 * metadata id, so they resolve through it without needing their own entry.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE = "https://raw.githubusercontent.com/lvlvllvlvllvlvl/RePoE/master/RePoE/data/gems.json";
const OUTPUT = path.join(process.cwd(), "src", "lib", "gem-colors.json");

type Gem = {
  color?: string;
  display_name?: string;
  base_item?: { id?: string; display_name?: string; release_state?: string } | null;
};

/** r, g, b and w are the four gem colours; anything else is a data error. */
const COLORS = new Set(["r", "g", "b", "w"]);

async function main() {
  process.stdout.write(`fetching ${SOURCE}\n`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`RePoE returned HTTP ${response.status}`);
  const data = (await response.json()) as Record<string, Gem>;

  const colors: Record<string, string> = {};
  for (const gem of Object.values(data)) {
    const color = gem.color;
    if (!color || !COLORS.has(color)) continue;
    if (gem.base_item?.release_state === "unreleased") continue;
    // A support's name is "Arcane Surge Support" here and "Arcane Surge" in an
    // export, so both spellings are indexed.
    const names = [gem.base_item?.display_name, gem.display_name].filter(Boolean) as string[];
    const keys = [gem.base_item?.id, ...names, ...names.map((name) => name.replace(/ Support$/, ""))];
    for (const key of keys) {
      if (key && !colors[key]) colors[key] = color;
    }
  }

  const sorted: Record<string, string> = {};
  for (const key of Object.keys(colors).sort()) sorted[key] = colors[key];

  fs.writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 0)}\n`);
  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  process.stdout.write(`wrote ${Object.keys(sorted).length} gem keys to ${OUTPUT} (${size} KB)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
