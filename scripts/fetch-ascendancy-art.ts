/**
 * Download every ascendancy's class portrait, for both games, into
 * public/ascendancy/ (Path of Exile) and public/ascendancy/poe2/.
 *
 *   npm run ascendancy:art                 # fetch anything missing
 *   npm run ascendancy:art -- --force      # re-download everything
 *   npm run ascendancy:art -- --dry-run    # list what would be fetched
 *   npm run ascendancy:art -- --game poe2  # one set only (poe1, poe1-avatar, poe1-class, poe2)
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
 * Path of Exile 2 is the same job against its own wiki, poe2wiki.net, where the
 * picture is "<Ascendancy> portrait.png": a close crop of the face rather than
 * a wide painting, and not all one size (182x141, 184x144 and 136x108 across
 * 0.1 to 0.5). Its names come from `poe2/classes.ts`, the 0.5 tree's own list.
 * Path of Exile 2 has no emblem sheet at all, so its portrait also stands in
 * for the emblem on a character card. Because the sizes differ, every index
 * records each file's own size and the header draws each at its own shape.
 *
 * Path of Exile 1's seven base classes have a picture of their own on the wiki,
 * "<Class> character class.png", a 137x105 close crop of the face. It is what
 * stands in for a Legacy of Phrecia ascendancy — Bog Shaman, Surfcaster,
 * Scavenger and the rest, which the wiki draws no art for at all — so a
 * character from one of those events is shown as the class its ascendancy
 * belongs to (`ALTERNATE_ASCENDANCIES` in poe1/ascendancy.ts). One file serves
 * as portrait, avatar and emblem, the way a Path of Exile 2 portrait does.
 *
 * Path of Exile 1 also has an avatar per ascendancy, "<Ascendancy> avatar.png":
 * a 135x105 close crop of the face, the same shape as Path of Exile 2's
 * portraits, which a compact character banner draws where the header draws the
 * wide painting. Path of Exile 2's wiki redirects "avatar" to "portrait", so its
 * portraits already serve both jobs and there is no fourth source.
 *
 * Unlike item art, the results are committed, and so is the index written
 * beside them. A missing item picture leaves a silhouette in a grid of eighty;
 * a missing portrait leaves a hole in the first thing on the page, and there
 * are only forty-four of them across both games.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import icons from "../src/lib/games/poe1/ascendancy-icons.json";
import { ASCENDANCIES as POE2_ASCENDANCIES } from "../src/lib/games/poe2/classes";
import { CLASSES as POE1_CLASSES } from "../src/lib/leagues";

type Source = {
  api: string;
  names: string[];
  title: (name: string) => string;
  /** What the wiki's file name carries beyond the ascendancy, stripped for the slug. */
  suffix: RegExp;
  output: string;
  index: string;
};

const GAMES: Record<string, Source> = {
  poe1: {
    api: "https://www.poewiki.net/w/api.php",
    names: Object.keys(icons.icons).sort(),
    title: (name) => `File:${name} ascendancy class.png`,
    suffix: /_ascendancy_class$/i,
    output: path.join(process.cwd(), "public", "ascendancy"),
    index: path.join(process.cwd(), "src", "lib", "games", "poe1", "ascendancy-portraits.json"),
  },
  "poe1-avatar": {
    api: "https://www.poewiki.net/w/api.php",
    names: Object.keys(icons.icons).sort(),
    title: (name) => `File:${name} avatar.png`,
    suffix: /_avatar$/i,
    output: path.join(process.cwd(), "public", "ascendancy", "avatar"),
    index: path.join(process.cwd(), "src", "lib", "games", "poe1", "ascendancy-avatars.json"),
  },
  "poe1-class": {
    api: "https://www.poewiki.net/w/api.php",
    names: [...POE1_CLASSES].sort(),
    title: (name) => `File:${name} character class.png`,
    suffix: /_character_class$/i,
    output: path.join(process.cwd(), "public", "ascendancy", "class"),
    index: path.join(process.cwd(), "src", "lib", "games", "poe1", "class-portraits.json"),
  },
  poe2: {
    api: "https://www.poe2wiki.net/api.php",
    names: Object.values(POE2_ASCENDANCIES).flat().sort(),
    title: (name) => `File:${name} portrait.png`,
    suffix: /_portrait$/i,
    output: path.join(process.cwd(), "public", "ascendancy", "poe2"),
    index: path.join(process.cwd(), "src", "lib", "games", "poe2", "ascendancy-portraits.json"),
  },
};

// The wiki asks that a script identify itself, and rejects some default agents.
const USER_AGENT = "halls-of-exile (personal character archive)";
// Sizes are kept as the wiki serves them; only the encoding changes. The Path of
// Exile paintings are drawn at about a third of their width, which is what keeps
// them sharp on a high-DPI screen.
const QUALITY = 82;

const flag = (name: string) => process.argv.includes(`--${name}`);
const force = flag("force");
const dryRun = flag("dry-run");
const only = process.argv.includes("--game") ? process.argv[process.argv.indexOf("--game") + 1] : undefined;

type ImageInfo = { url: string; width: number; height: number };

/**
 * Ask the wiki where each file actually lives.
 *
 * Titles go up in one query rather than one request per ascendancy, and the
 * response is matched back by title — the API returns pages in its own order,
 * and rewrites a redirect's title, so position cannot be relied on. `redirects`
 * is what collapses Raider onto Warden.
 */
async function resolve(source: Source): Promise<Map<string, ImageInfo>> {
  const names = source.names;
  const titles = names.map(source.title);
  const url = new URL(source.api);
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
function slugFor(info: ImageInfo, source: Source): string {
  const file = decodeURIComponent(info.url.split("/").pop() ?? "");
  return file
    .replace(/\.[a-z]+$/i, "")
    .replace(source.suffix, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

async function download(info: ImageInfo, slug: string, source: Source): Promise<"saved" | "skipped" | "failed"> {
  const destination = path.join(source.output, `${slug}.webp`);
  if (!force && fs.existsSync(destination) && fs.statSync(destination).size > 0) return "skipped";
  if (dryRun) return "saved";

  try {
    const response = await fetch(info.url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) throw new Error("empty body");
    // The wiki's PNGs run from 55 KB to 734 KB for the same 530x245 picture,
    // which is the encoder rather than the art. WebP puts them all in one range
    // and takes the set from megabytes to well under one.
    const encoded = await sharp(buffer).webp({ quality: QUALITY }).toBuffer();
    fs.mkdirSync(source.output, { recursive: true });
    fs.writeFileSync(destination, encoded);
    return "saved";
  } catch (error) {
    process.stderr.write(`  ${slug}: ${(error as Error).message}\n`);
    return "failed";
  }
}

async function fetchGame(game: string, source: Source) {
  const names = source.names;
  process.stdout.write(`${game}: resolving ${names.length} ascendancy portraits on the wiki\n`);
  const resolved = await resolve(source);

  const missing = names.filter((name) => !resolved.has(name));
  for (const name of missing) process.stderr.write(`  no portrait on the wiki for ${name}\n`);

  // One file can serve two names, so the downloads are deduplicated by slug
  // while the index keeps an entry for every name a build might carry.
  const portraits: Record<string, { slug: string; width: number; height: number }> = {};
  const bySlug = new Map<string, ImageInfo>();
  for (const [name, info] of resolved) {
    const slug = slugFor(info, source);
    portraits[name] = { slug, width: info.width, height: info.height };
    if (!bySlug.has(slug)) bySlug.set(slug, info);
  }

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  for (const [slug, info] of bySlug) {
    const result = await download(info, slug, source);
    if (result === "saved") saved += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  if (!dryRun && failed === 0 && bySlug.size) {
    const sorted = Object.fromEntries(Object.entries(portraits).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(source.index, `${JSON.stringify({ portraits: sorted }, null, 2)}\n`);
  }

  process.stdout.write(
    `${game}: ${bySlug.size} files for ${Object.keys(portraits).length} names: ` +
      `${saved} saved, ${skipped} already there, ${failed} failed\n`,
  );
  if (failed > 0 || missing.length > 0) process.exitCode = 1;
}

async function main() {
  for (const [game, source] of Object.entries(GAMES)) {
    if (!only || only === game) await fetchGame(game, source);
  }
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
