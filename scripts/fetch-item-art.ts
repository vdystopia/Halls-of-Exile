/**
 * Download base-item art into public/items/.
 *
 *   npm run art:fetch              # fetch anything missing
 *   npm run art:fetch -- --force   # re-download everything
 *   npm run art:fetch -- --dry-run # list what would be fetched
 *
 * Paths come from src/lib/item-art-index.json, which is generated from RePoE by
 * scripts/build-item-art-index.ts. A base item's art path on the game's image
 * CDN is the same path RePoE records, so no scraping or guessing is involved.
 *
 * The site renders placeholder silhouettes for anything missing, so running this
 * is optional — but public/ is copied into the Docker image, so whatever is on
 * disk when the image is built is what the container serves. Fetch before
 * deploying, never after.
 */
import fs from "node:fs";
import path from "node:path";
import index from "../src/lib/item-art-index.json";
import ascendancy from "../src/lib/ascendancy-icons.json";

// The literal type of a 2000-entry JSON file is too much for the compiler to
// carry around, and only the art path is needed here.
const catalogue = index as unknown as {
  bases: Record<string, { art: string }>;
  uniques: Record<string, { art: string }>;
};

const DEFAULT_BASE_URL = "https://web.poecdn.com/image";
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

async function download(artPath: string): Promise<"saved" | "skipped" | "failed"> {
  const destination = path.join(OUTPUT_ROOT, `${artPath}.png`);
  if (!force && fs.existsSync(destination) && fs.statSync(destination).size > 0) return "skipped";
  if (dryRun) return "saved";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/${artPath}.png?scale=1`);
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

async function main() {
  await fetchAscendancySheet();
  const entries = [...Object.values(catalogue.bases), ...Object.values(catalogue.uniques)];
  const paths = [...new Set(entries.map((entry) => entry.art))];
  process.stdout.write(
    `${dryRun ? "would fetch" : "fetching"} ${paths.length} item images from ${baseUrl}\n`,
  );

  const tally = { saved: 0, skipped: 0, failed: 0 };
  const failures: string[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < paths.length) {
      const artPath = paths[cursor++];
      const result = await download(artPath);
      tally[result] += 1;
      if (result === "failed") failures.push(artPath);
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
