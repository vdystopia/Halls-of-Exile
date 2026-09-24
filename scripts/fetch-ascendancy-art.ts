/**
 * Download every ascendancy's class portrait into public/ascendancy/.
 *
 *   npm run ascendancy:art              # fetch anything missing
 *   npm run ascendancy:art -- --force   # re-download everything
 *   npm run ascendancy:art -- --dry-run # list what would be fetched
 *
 * This is the wide key art the game shows on the ascendancy selection screen —
 * not the round emblem in `ascendancy-icons.json`. The emblem is cropped out of
 * the passive tree's sprite sheet and is drawn on the tree itself, so its lower
 * half is dead space by design; at the size the character page header draws a
 * picture, that dead space is most of it. The two are kept side by side because
 * they are different pictures for different jobs: `CharacterCard` wants the
 * emblem, the character page header wants this.
 *
 * Grinding Gear Games publish no index of these, so they come from the Path of
 * Exile Wiki, whose images are Creative Commons and free for personal use.
 * Files are named "<Ascendancy> ascendancy class.png" there without exception,
 * but the name is never turned straight into a URL: each is resolved through
 * the MediaWiki API, which also follows the redirect that makes Raider and
 * Warden — one class, renamed — resolve to a single file.
 *
 * Which ascendancies to ask for comes from `ascendancy-icons.json`, generated
 * from the game's own tree export, so a new ascendancy is picked up by
 * `npm run ascendancy:index` and this script follows. A list written out here
 * would go stale without saying so.
 *
 * Unlike item art, the results are committed, and so is the index written
 * beside them. A missing item picture leaves a silhouette in a grid of eighty;
 * a missing portrait leaves a hole in the first thing on the page, and there
 * are only twenty-one of them.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import icons from "../src/lib/games/poe1/ascendancy-icons.json";

const API = "https://www.poewiki.net/w/api.php";
const OUTPUT_ROOT = path.join(process.cwd(), "public", "ascendancy");
const INDEX_PATH = path.join(process.cwd(), "src", "lib", "games", "poe1", "ascendancy-portraits.json");
// The wiki asks that a script identify itself, and rejects some default agents.
const USER_AGENT = "halls-of-exile (personal character archive)";
// The source files are all 530x245. The size is kept: the header draws one at
// about a third of that, and the spare resolution is what keeps it sharp on a
// high-DPI screen. Only the encoding changes.
const QUALITY = 82;

const flag = (name: string) => process.argv.includes(`--${name}`);
const force = flag("force");
const dryRun = flag("dry-run");

type ImageInfo = { url: string; width: number; height: number };

/**
 * Ask the wiki where each file actually lives.
 *
 * Titles go up in one query rather than one request per ascendancy, and the
 * response is matched back by title — the API returns pages in its own order,
 * and rewrites a redirect's title, so position cannot be relied on. `redirects`
 * is what collapses Raider onto Warden.
 */
async function resolve(names: string[]): Promise<Map<string, ImageInfo>> {
  const titles = names.map((name) => `File:${name} ascendancy class.png`);
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", titles.join("|"));

  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`the wiki API returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    query?: {
      redirects?: { from: string; to: string }[];
      normalized?: { from: string; to: string }[];
      pages?: Record<string, { title: string; missing?: string; imageinfo?: ImageInfo[] }>;
    };
  };

  // A title can be rewritten twice — normalised (underscores to spaces), then
  // followed through a redirect — so both hops are walked to get from the title
  // asked for to the page that came back.
  const rewrites = new Map<string, string>();
  for (const hop of [...(body.query?.normalized ?? []), ...(body.query?.redirects ?? [])]) {
    rewrites.set(hop.from, hop.to);
  }
  const follow = (title: string) => {
    let current = title;
    for (let hops = 0; hops < 4 && rewrites.has(current); hops += 1) {
      current = rewrites.get(current) as string;
    }
    return current;
  };

  const pages = new Map<string, ImageInfo>();
  for (const page of Object.values(body.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (page.missing !== undefined || !info) continue;
    pages.set(page.title, info);
  }

  const found = new Map<string, ImageInfo>();
  for (const [position, name] of names.entries()) {
    const info = pages.get(follow(titles[position]));
    if (info) found.set(name, info);
  }
  return found;
}

/** ".../Warden_ascendancy_class.png" -> "warden". Two names, one file, one slug. */
function slugFor(info: ImageInfo): string {
  const file = decodeURIComponent(info.url.split("/").pop() ?? "");
  return file
    .replace(/\.[a-z]+$/i, "")
    .replace(/_ascendancy_class$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

async function download(info: ImageInfo, slug: string): Promise<"saved" | "skipped" | "failed"> {
  const destination = path.join(OUTPUT_ROOT, `${slug}.webp`);
  if (!force && fs.existsSync(destination) && fs.statSync(destination).size > 0) return "skipped";
  if (dryRun) return "saved";

  try {
    const response = await fetch(info.url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = Buffer.from(await response.arrayBuffer());
    if (source.length === 0) throw new Error("empty body");
    // The wiki's PNGs run from 55 KB to 734 KB for the same 530x245 picture,
    // which is the encoder rather than the art. WebP puts them all in one range
    // and takes the set from megabytes to well under one.
    const encoded = await sharp(source).webp({ quality: QUALITY }).toBuffer();
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    fs.writeFileSync(destination, encoded);
    return "saved";
  } catch (error) {
    process.stderr.write(`  ${slug}: ${(error as Error).message}\n`);
    return "failed";
  }
}

async function main() {
  const names = Object.keys(icons.icons).sort();
  process.stdout.write(`resolving ${names.length} ascendancy portraits on the wiki\n`);
  const resolved = await resolve(names);

  const missing = names.filter((name) => !resolved.has(name));
  for (const name of missing) process.stderr.write(`  no portrait on the wiki for ${name}\n`);

  // One file can serve two names, so the downloads are deduplicated by slug
  // while the index keeps an entry for every name a build might carry.
  const portraits: Record<string, string> = {};
  const bySlug = new Map<string, ImageInfo>();
  for (const [name, info] of resolved) {
    const slug = slugFor(info);
    portraits[name] = slug;
    if (!bySlug.has(slug)) bySlug.set(slug, info);
  }

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const [slug, info] of bySlug) {
    const result = await download(info, slug);
    if (result === "saved") saved += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  const shapes = [...new Set([...bySlug.values()].map((info) => `${info.width}x${info.height}`))];
  const first = [...bySlug.values()][0];
  if (!dryRun && failed === 0 && first) {
    fs.writeFileSync(
      INDEX_PATH,
      `${JSON.stringify(
        {
          width: first.width,
          height: first.height,
          portraits: Object.fromEntries(Object.entries(portraits).sort(([a], [b]) => a.localeCompare(b))),
        },
        null,
        2,
      )}\n`,
    );
  }

  process.stdout.write(
    `${bySlug.size} files for ${Object.keys(portraits).length} names: ` +
      `${saved} saved, ${skipped} already there, ${failed} failed\n`,
  );
  if (shapes.length > 1) {
    process.stdout.write(`note: the portraits are not all one size (${shapes.join(", ")})\n`);
  }
  if (failed > 0 || missing.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
