/**
 * Download base-item art into public/items/.
 *
 *   npm run art:fetch              # fetch anything missing
 *   npm run art:fetch -- --force   # re-download everything
 *   npm run art:fetch -- --dry-run # list what would be fetched
 *
 * Paths come from src/lib/games/poe1/item-art-index.json, which is generated from RePoE by
 * scripts/build-item-art-index.ts. A base item's art path on the game's image
 * CDN is the same path RePoE records, so no scraping or guessing is involved.
 *
 * Path of Exile 2's gem and item art is not on that CDN at the path its data records,
 * so it comes from the repoe-fork export that the index was built from, as
 * WebP, into public/items/poe2/ (see scripts/build-poe2-gem-index.ts).
 *
 * The site renders placeholder silhouettes for anything missing, so running this
 * is optional — but public/ is copied into the Docker image, so whatever is on
 * disk when the image is built is what the container serves. Fetch before
 * deploying, never after.
 */
import fs from "node:fs";
import path from "node:path";
import index from "../src/lib/games/poe1/item-art-index.json";
import gemArt from "../src/lib/games/poe1/gem-art-index.json";
import poe2GemArt from "../src/lib/games/poe2/gem-art-index.json";
import poe2ItemArt from "../src/lib/games/poe2/item-art-index.json";
import ascendancy from "../src/lib/games/poe1/ascendancy-icons.json";
import overrides from "../src/lib/games/poe1/art-overrides.json";

// The literal type of a 2000-entry JSON file is too much for the compiler to
// carry around, and only the art path is needed here.
const catalogue = index as unknown as {
  bases: Record<string, { art: string }>;
  uniques: Record<string, { art: string }>;
};

const DEFAULT_BASE_URL = "https://web.poecdn.com/image";
const POE2_ART_URL = "https://repoe-fork.github.io/poe2";
const OUTPUT_ROOT = path.join(process.cwd(), "public", "items");
const CONCURRENCY = 8;
const ATTEMPTS = 3;

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const baseUrl = option("base-url", DEFAULT_BASE_URL).replace(/\/$/, "");
const force = flag("force");
const dryRun = flag("dry-run");

/** One picture: where it comes from and where it lands under public/items/. */
type Job = { label: string; url: string; destination: string };

const poe1Job = (artPath: string): Job => ({
  label: artPath,
  url: `${baseUrl}/${artPath}.png?scale=1`,
  destination: path.join(OUTPUT_ROOT, `${artPath}.png`),
});

const poe2Job = (artPath: string): Job => ({
  label: `poe2/${artPath}`,
  url: `${POE2_ART_URL}/${artPath}.webp`,
  destination: path.join(OUTPUT_ROOT, "poe2", `${artPath}.webp`),
});

async function download({ url, destination }: Job): Promise<"saved" | "skipped" | "failed"> {
  if (!force && fs.existsSync(destination) && fs.statSync(destination).size > 0) return "skipped";
  if (dryRun) return "saved";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0) throw new Error("empty body");
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, body);
      return "saved";
    } catch {
      if (attempt === ATTEMPTS) return "failed";
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  return "failed";
}

/**
 * Every ascendancy emblem is one sprite sheet from the passive tree, cropped in
 * CSS, so it is a single file rather than nineteen. Its URL carries a
 * cache-buster, which the local name drops.
 */
async function fetchAscendancySheet(): Promise<void> {
  const target = path.join(process.cwd(), "public", "ascendancy.webp");
  if (fs.existsSync(target) && !force) {
    process.stdout.write("ascendancy sheet already present\n");
    return;
  }
  if (dryRun) {
    process.stdout.write(`would fetch ${ascendancy.sheet}\n`);
    return;
  }
  try {
    const response = await fetch(ascendancy.sheet);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    process.stdout.write("saved the ascendancy sheet\n");
  } catch (error) {
    process.stdout.write(
      `could not fetch the ascendancy sheet (${error instanceof Error ? error.message : String(error)}); ` +
        "character cards will show no emblem\n",
    );
  }
}

/**
 * `--check`: download nothing, and say which pictures the indexes name that are
 * not on disk. update.ps1 runs it before building, because the image bakes in
 * whatever public/ holds at that moment. Exit code 3 means some are missing.
 * It checks each file where this script would write it — counting files instead
 * let gem pictures stand in for missing item pictures, and never looked at Path
 * of Exile 2's WebP at all.
 */
function check(jobs: Job[]): void {
  const missing = jobs.filter((job) => !fs.existsSync(job.destination) || fs.statSync(job.destination).size === 0);
  const poe2 = missing.filter((job) => job.label.startsWith("poe2/")).length;
  process.stdout.write(
    missing.length
      ? `missing ${missing.length} of ${jobs.length} images (${missing.length - poe2} Path of Exile 1, ${poe2} Path of Exile 2)\n` +
          missing.slice(0, 10).map((job) => `  ${job.label}\n`).join("")
      : `all ${jobs.length} images present\n`,
  );
  if (missing.length) process.exitCode = 3;
}

async function main() {
  if (!flag("check")) await fetchAscendancySheet();
  // A base the image CDN does not serve at all is marked with an empty override
  // (Ancient Skull's). Asking for it fails on every run, and counting it would
  // report the art as incomplete forever.
  const unservable = new Set(
    Object.entries(overrides as Record<string, string>)
      .filter(([name, value]) => !name.startsWith("_") && !value)
      .map(([name]) => (catalogue.bases[name] ?? catalogue.uniques[name])?.art)
      .filter(Boolean),
  );
  const entries = [...Object.values(catalogue.bases), ...Object.values(catalogue.uniques)].filter(
    (entry) => !unservable.has(entry.art),
  );
  // Gem art sits under the same Art/2DItems root and is served by the same CDN,
  // so it lands beside the equipment art and needs no second output tree.
  const poe1Paths = [
    ...new Set([
      ...entries.map((entry) => entry.art),
      ...Object.values(gemArt.art as Record<string, string>),
    ]),
  ];
  const poe2Items = [
    ...Object.values(poe2ItemArt.bases as Record<string, { art: string }>),
    ...Object.values(poe2ItemArt.uniques as Record<string, { art: string }>),
  ].map((entry) => entry.art);
  const poe2Paths = [...new Set([...Object.values(poe2GemArt.art as Record<string, string>), ...poe2Items])];
  const paths = [...poe1Paths.map(poe1Job), ...poe2Paths.map(poe2Job)];
  if (flag("check")) return check(paths);
  process.stdout.write(
    `${dryRun ? "would fetch" : "fetching"} ${poe1Paths.length} images from ${baseUrl} ` +
      `and ${poe2Paths.length} from ${POE2_ART_URL}\n`,
  );

  const tally = { saved: 0, skipped: 0, failed: 0 };
  const failures: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < paths.length) {
      const job = paths[cursor++];
      const result = await download(job);
      tally[result] += 1;
      if (result === "failed") failures.push(job.label);
      const done = tally.saved + tally.skipped + tally.failed;
      if (done % 100 === 0) process.stdout.write(`  ${done}/${paths.length}\n`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  process.stdout.write(
    `done — ${tally.saved} saved, ${tally.skipped} already present, ${tally.failed} failed\n`,
  );
  if (failures.length) {
    process.stdout.write(`first failures:\n${failures.slice(0, 10).map((f) => `  ${f}`).join("\n")}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
