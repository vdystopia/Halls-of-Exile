/**
 * Keep a copy of Path of Exile 2's passive tree, once per change.
 *
 *   npm run tree:poe2:snapshot
 *
 * pathofexile2.com serves its tree at `/internal-api/content/game-passive-skill-tree`,
 * anonymously, and unversioned: `context.version` is null and each patch replaces
 * the file in place, with only its Last-Modified header moving. Drawing a
 * character on the tree it was played on — the rule Path of Exile 1's trees
 * follow — therefore needs copies taken as the tree changes, because nobody
 * else keeps them.
 *
 * Each copy is written to scripts/data/poe2-trees/<Last-Modified date>.json.gz,
 * and only when its content differs from the newest copy already there, so a
 * daily run adds a file only when the tree actually changed. The copies are
 * committed; one is about 450 KB compressed.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SOURCE = "https://pathofexile2.com/internal-api/content/game-passive-skill-tree";
const DIR = path.join(process.cwd(), "scripts", "data", "poe2-trees");
const USER_AGENT = "halls-of-exile (self-hosted archive)";

function contentHash(json: unknown): string {
  // The tree data, not the envelope around it: the same tree served twice
  // should hash the same.
  const data = (json as { context?: { data?: unknown } })?.context?.data ?? json;
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function main() {
  const response = await fetch(SOURCE, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`pathofexile2.com returned HTTP ${response.status}`);
  const body = await response.text();
  const json = JSON.parse(body);
  if (!json?.context?.data?.nodes) throw new Error("That response has no tree in it (context.data.nodes).");

  const modified = response.headers.get("last-modified");
  const day = (modified ? new Date(modified) : new Date()).toISOString().slice(0, 10);
  const hash = contentHash(json);

  fs.mkdirSync(DIR, { recursive: true });
  const existing = fs.readdirSync(DIR).filter((name) => name.endsWith(".json.gz")).sort();
  const newest = existing.at(-1);
  if (newest) {
    const previous = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, newest))).toString("utf8"));
    if (contentHash(previous) === hash) {
      process.stdout.write(`unchanged since ${newest}; nothing written\n`);
      return;
    }
  }

  const target = path.join(DIR, `${day}.json.gz`);
  fs.writeFileSync(target, zlib.gzipSync(body, { level: 9 }));
  const nodes = Object.keys(json.context.data.nodes).length;
  process.stdout.write(
    `wrote ${path.relative(process.cwd(), target)} (${nodes} nodes, ` +
      `${(fs.statSync(target).size / 1024).toFixed(0)} KB, Last-Modified ${modified ?? "absent"})\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
