/**
 * Download every keystone's icon, for both games, into public/keystones/<game>/.
 *
 *   npm run keystones:art                  # fetch anything missing
 *   npm run keystones:art -- --force       # re-download everything
 *   npm run keystones:art -- --game poe2   # one game only
 *
 * The allocated-passives panel on a character page draws each keystone with
 * its icon. Grinding Gear Games' tree export carries the icons only as sprite
 * sheets, so they come from the wikis instead, whose Cargo table of passive
 * skills names each keystone's icon file — a name that cannot be derived
 * ("Ancestral Bond" is "Totemmax passive skill icon.png"), which is why the
 * table is asked rather than a URL guessed. Atlas keystones are left out: a
 * character's tree never holds one.
 *
 * Icons are 128px on poewiki.net and 176px on poe2wiki.net; both are saved at
 * 96px WebP, twice the size the panel draws them at. The files and the index
 * beside them are committed, like the portraits: a missing icon is a hole in
 * the panel rather than a silhouette in a grid.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Source = { api: string; output: string; index: string };

const GAMES: Record<string, Source> = {
  poe1: {
    api: "https://www.poewiki.net/w/api.php",
    output: path.join(process.cwd(), "public", "keystones", "poe1"),
    index: path.join(process.cwd(), "src", "lib", "games", "poe1", "keystone-icons.json"),
  },
  poe2: {
    api: "https://www.poe2wiki.net/api.php",
    output: path.join(process.cwd(), "public", "keystones", "poe2"),
    index: path.join(process.cwd(), "src", "lib", "games", "poe2", "keystone-icons.json"),
  },
};

const USER_AGENT = "halls-of-exile (personal character archive)";
const SIZE = 96;
const QUALITY = 84;

const flag = (name: string) => process.argv.includes(`--${name}`);
const force = flag("force");
const only = process.argv.includes("--game") ? process.argv[process.argv.indexOf("--game") + 1] : undefined;

type ImageInfo = { url: string; width: number; height: number };

const decodeEntities = (text: string) =>
  text.replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Every keystone the wiki knows, with the file its icon lives in. */
async function keystones(source: Source): Promise<{ name: string; file: string }[]> {
  const url = new URL(source.api);
  url.searchParams.set("action", "cargoquery");
  url.searchParams.set("format", "json");
  url.searchParams.set("tables", "passive_skills");
  url.searchParams.set("fields", "name,icon");
  url.searchParams.set("where", "is_keystone=1");
  url.searchParams.set("limit", "500");
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`the wiki API returned HTTP ${response.status}`);
  const body = (await response.json()) as { cargoquery?: { title: { name: string; icon: string } }[] };
  const seen = new Set<string>();
  const found: { name: string; file: string }[] = [];
  for (const { title } of body.cargoquery ?? []) {
    const name = decodeEntities(title.name).trim();
    const file = title.icon?.trim();
    if (!name || !file || seen.has(name)) continue;
    // Atlas keystones and placeholder art are not a character's passives.
    if (/AtlasTrees|MasteryBlank/i.test(file)) continue;
    seen.add(name);
    found.push({ name, file });
  }
  return found;
}

/** Where each file lives, fifty titles to a query. */
async function resolve(source: Source, files: string[]): Promise<Map<string, ImageInfo>> {
  const found = new Map<string, ImageInfo>();
  for (let at = 0; at < files.length; at += 50) {
    const batch = files.slice(at, at + 50);
    const url = new URL(source.api);
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|size");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("titles", batch.join("|"));
    const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`the wiki API returned HTTP ${response.status}`);
    const body = (await response.json()) as {
      query?: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages?: Record<string, { title: string; missing?: string; imageinfo?: ImageInfo[] }>;
      };
    };
    const rewrites = new Map<string, string>();
    for (const hop of [...(body.query?.normalized ?? []), ...(body.query?.redirects ?? [])]) rewrites.set(hop.from, hop.to);
    const follow = (title: string) => {
      let current = title;
      for (let hops = 0; hops < 4 && rewrites.has(current); hops += 1) current = rewrites.get(current) as string;
      return current;
    };
    const pages = new Map<string, ImageInfo>();
    for (const page of Object.values(body.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (page.missing === undefined && info) pages.set(page.title.toLowerCase(), info);
    }
    for (const file of batch) {
      const info = pages.get(follow(file).toLowerCase());
      if (info) found.set(file, info);
    }
  }
  return found;
}

const slugFor = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function download(info: ImageInfo, destination: string): Promise<"saved" | "skipped" | "failed"> {
  if (!force && fs.existsSync(destination) && fs.statSync(destination).size > 0) return "skipped";
  try {
    const response = await fetch(info.url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) throw new Error("empty body");
    const encoded = await sharp(buffer).resize(SIZE, SIZE, { fit: "inside" }).webp({ quality: QUALITY }).toBuffer();
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, encoded);
    return "saved";
  } catch (error) {
    process.stderr.write(`  ${path.basename(destination)}: ${(error as Error).message}\n`);
    return "failed";
  }
}

/**
 * The frame every keystone sits in, one per game ("Keystone passive frame.png"
 * on each wiki: a carved ring with a transparent window in its middle), saved
 * with its alpha at `FRAME_SIZE` and measured: the window's width as a fraction
 * of the frame's, read along the middle row, is what the panel sizes the icon
 * to, so the picture fills the window and its corners tuck under the ring.
 */
const FRAME_SIZE = 160;
const FRAME_TITLE = "File:Keystone passive frame.png";

async function fetchFrame(source: Source): Promise<{ size: number; window: number } | null> {
  const info = (await resolve(source, [FRAME_TITLE])).get(FRAME_TITLE);
  if (!info) return null;
  const destination = path.join(source.output, "frame.webp");
  if (force || !fs.existsSync(destination) || fs.statSync(destination).size === 0) {
    const response = await fetch(info.url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`frame: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(source.output, { recursive: true });
    fs.writeFileSync(
      destination,
      await sharp(buffer).resize(FRAME_SIZE, FRAME_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: QUALITY }).toBuffer(),
    );
  }
  const { data, info: raw } = await sharp(destination).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x: number, y: number) => data[(y * raw.width + x) * 4 + 3];
  const cx = Math.floor(raw.width / 2);
  const cy = Math.floor(raw.height / 2);
  let right = 0;
  while (cx + right < raw.width && alpha(cx + right, cy) < 40) right += 1;
  let left = 0;
  while (cx - left >= 0 && alpha(cx - left, cy) < 40) left += 1;
  return { size: FRAME_SIZE, window: Math.round(((left + right) / raw.width) * 1000) / 1000 };
}

async function fetchGame(game: string, source: Source) {
  const list = await keystones(source);
  process.stdout.write(`${game}: ${list.length} keystones on the wiki\n`);
  const resolved = await resolve(source, list.map((entry) => entry.file));
  const frame = await fetchFrame(source);
  if (!frame) process.stderr.write(`  no keystone frame on the wiki\n`);
  else process.stdout.write(`${game}: frame saved, window ${Math.round(frame.window * 100)}% of its width\n`);

  const icons: Record<string, { slug: string }> = {};
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const missing: string[] = [];
  for (const entry of list) {
    const info = resolved.get(entry.file);
    if (!info) {
      missing.push(entry.name);
      continue;
    }
    const slug = slugFor(entry.name);
    const result = await download(info, path.join(source.output, `${slug}.webp`));
    if (result === "failed") {
      failed += 1;
      continue;
    }
    if (result === "saved") saved += 1;
    else skipped += 1;
    icons[entry.name] = { slug };
  }
  for (const name of missing) process.stderr.write(`  no icon file on the wiki for ${name}\n`);

  if (failed === 0 && frame && Object.keys(icons).length) {
    const sorted = Object.fromEntries(Object.entries(icons).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(source.index, `${JSON.stringify({ size: SIZE, frame, icons: sorted }, null, 2)}\n`);
  }
  process.stdout.write(
    `${game}: ${Object.keys(icons).length} icons: ${saved} saved, ${skipped} already there, ${failed} failed, ${missing.length} without a file\n`,
  );
  if (failed > 0 || !frame) process.exitCode = 1;
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
