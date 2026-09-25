/**
 * Build Path of Exile 2's gem art index and active skill name list from the
 * repoe-fork data export.
 *
 *   npm run gems:poe2
 *
 * Path of Exile 2 has its own export beside Path of Exile 1's, at
 * repoe-fork.github.io/poe2/, and its own art, which Grinding Gear Games' image
 * CDN does not serve at the path the data records — the export hosts it too,
 * as WebP, and `npm run art:fetch` downloads it from there into
 * public/items/poe2/.
 *
 * Which gems are real comes from `skill_gems.json`, not `base_items.json`. The
 * base item list holds every gem-shaped row in the game files: developer
 * leftovers ("[DNT-UNUSED] Axe Chop"), templates ("Spectre: {0}"), a few dozen
 * "Coming Soon" placeholders, and the attacks a weapon grants on its own. The
 * gems a player can actually hold are the ones cut from an uncut gem, which
 * `crafting_types` marks. The picture is the base item's, the gem as it sits in
 * the inventory — a single 108x108 frame, unlike Path of Exile 1's layered
 * strips.
 *
 * Skills and spirit gems are both offered as what a character was built
 * around: in this game a spirit gem is often exactly that (a companion, a
 * minion, an aura build). Supports are indexed for art only.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "https://repoe-fork.github.io/poe2";
const ART_OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe2", "gem-art-index.json");
const SKILLS_OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe2", "skill-names.json");

type SkillGem = {
  gem_type?: string;
  crafting_types?: unknown;
  base_item?: { id?: string; display_name?: string; release_state?: string } | null;
};
type BaseItem = { name?: string; visual_identity?: { dds_file?: string } };

const PLACEHOLDER = /^Coming Soon$|^\[DNT|\{\d\}/;

async function load<T>(file: string): Promise<T> {
  process.stdout.write(`fetching ${ROOT}/${file}\n`);
  const response = await fetch(`${ROOT}/${file}`);
  if (!response.ok) throw new Error(`repoe-fork returned HTTP ${response.status} for ${file}`);
  return (await response.json()) as T;
}

async function main() {
  const gems = await load<Record<string, SkillGem>>("skill_gems.json");
  const bases = await load<Record<string, BaseItem>>("base_items.json");
  // The two files spell the folder "Gem" and "Gems" for different rows, so a
  // base is found by either spelling, then by name.
  const baseByName = new Map(Object.values(bases).filter((b) => b.name).map((b) => [b.name as string, b]));
  const baseFor = (id: string, name: string) =>
    bases[id] ?? bases[id.replace("/Gem/", "/Gems/")] ?? bases[id.replace("/Gems/", "/Gem/")] ?? baseByName.get(name);

  const art: Record<string, string> = {};
  const skills = new Set<string>();
  let unmatched = 0;
  for (const gem of Object.values(gems)) {
    const id = gem.base_item?.id;
    const name = gem.base_item?.display_name;
    if (!id || !name || gem.base_item?.release_state !== "released") continue;
    if (!gem.crafting_types || PLACEHOLDER.test(name)) continue;
    const dds = baseFor(id, name)?.visual_identity?.dds_file;
    if (!dds) {
      unmatched += 1;
      continue;
    }
    const artPath = dds.replace(/\.dds$/, "");
    for (const key of [id, name, name.replace(/ Support$/, "")]) {
      if (!art[key]) art[key] = artPath;
    }
    if (gem.gem_type === "active" || gem.gem_type === "spirit") skills.add(name);
  }

  const sorted = Object.fromEntries(Object.keys(art).sort().map((key) => [key, art[key]]));
  fs.writeFileSync(ART_OUTPUT, `${JSON.stringify({ art: sorted }, null, 0)}\n`);
  const names = [...skills].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(SKILLS_OUTPUT, `${JSON.stringify(names, null, 0)}\n`);
  process.stdout.write(
    `wrote ${Object.keys(sorted).length} gem keys (${new Set(Object.values(sorted)).size} images) and ` +
      `${names.length} skills; ${unmatched} gems had no base item art\n`,
  );
  if (unmatched) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
