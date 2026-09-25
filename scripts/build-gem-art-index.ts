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
 * The path is kept, and whether the picture at it is a single frame. Gem art is
 * a layered sheet the way flask art is — the socket setting and the gem itself,
 * side by side in one strip, meant to be stacked — and drawing the strip as it
 * comes gives three tiny smudges instead of one gem. The inventory footprint
 * that matters for equipment is meaningless here: a gem is always one cell.
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
import renames from "../src/lib/games/poe1/gem-renames.json";

const SOURCE =
  "https://repoe-fork.github.io/base_items.json";
const OUTPUT = path.join(process.cwd(), "src", "lib", "games", "poe1", "gem-art-index.json");
const CDN = "https://web.poecdn.com/image";

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

  /**
   * A gem the game renamed keeps its old name here too: the archive spans every
   * version, and a character from before the rename carries the old one. The
   * data only knows the current name, so `gem-renames.json` maps old to new by
   * hand; add a pair when a refresh reports a name gone.
   */
  for (const [former, current] of Object.entries(renames as Record<string, string>)) {
    for (const suffix of ["", " Support"]) {
      const value = art[current + suffix] ?? art[current];
      if (value && !art[former + suffix]) art[former + suffix] = value;
    }
  }

  const sorted: Record<string, string> = {};
  for (const key of Object.keys(art).sort()) sorted[key] = art[key];

  const paths = [...new Set(Object.values(sorted))].sort();
  const single = (await singleFramePaths(paths)).sort();

  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify({ art: sorted, singleFrame: single }, null, 0)}\n`,
  );
  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  process.stdout.write(
    `wrote ${Object.keys(sorted).length} gem keys (${paths.length} images, ` +
      `${single.length} of them a single frame) to ${OUTPUT} (${size} KB)\n`,
  );
}

/**
 * Which gem pictures are one frame rather than a sheet.
 *
 * Gem art is a layered sheet the way flask art is: a 143x48 strip holding the
 * gem's socket setting and the gem itself, which the page stacks to draw one
 * icon. All but a couple are. Those couple are plain 48x48 squares, and one of
 * them is Quickstep — an active skill someone can pick — so the exceptions
 * cannot be waved away, and a rule reading "everything under /Gems/ is three
 * frames" would draw that one at triple zoom.
 *
 * Measured rather than listed, so a gem added later is classified without
 * anyone remembering this exists. A PNG states its width in the IHDR chunk, in
 * the first 24 bytes, so this asks the CDN for exactly those and no more: 549
 * range requests of 24 bytes rather than 30 MB of pictures.
 */
async function singleFramePaths(paths: string[]): Promise<string[]> {
  const single: string[] = [];
  let done = 0;

  const worker = async (queue: string[]) => {
    for (;;) {
      const artPath = queue.pop();
      if (!artPath) return;
      const width = await pngWidth(`${CDN}/${artPath}.png?scale=1`);
      // An unreadable header is left as a sheet, which is what all but two are.
      // Guessing wrong there squashes one icon; guessing wrong the other way
      // would zoom a correct one into a blur.
      if (width !== null && width <= 64) single.push(artPath);
      done += 1;
      if (done % 100 === 0) process.stdout.write(`  measured ${done}/${paths.length}\n`);
    }
  };

  const queue = [...paths];
  await Promise.all(Array.from({ length: 8 }, () => worker(queue)));
  return single;
}

async function pngWidth(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, { headers: { range: "bytes=0-23" } });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    // 8-byte signature, 4-byte chunk length, "IHDR", then width as big-endian.
    if (bytes.length < 20 || bytes.toString("latin1", 12, 16) !== "IHDR") return null;
    return bytes.readUInt32BE(16);
  } catch {
    return null;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
