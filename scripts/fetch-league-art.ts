/**
 * Download a logo for every league in the catalogue, both games, into
 * public/leagues/, and write src/lib/league-logos.json beside the catalogue.
 *
 *   npm run leagues:art              # fetch anything missing
 *   npm run leagues:art -- --force   # re-download everything
 *
 * The art comes from the two community wikis, poewiki.net and poe2wiki.net,
 * resolved through their MediaWiki APIs — never by guessing a URL, the rule
 * `ascendancy:art` follows. Unlike the portraits, the file names cannot be
 * derived from the league: the wiki calls them "Delve logo", "Legion league
 * logo", "Mirage Expansion logo" and "Siege Expansion logo" (3.17's is the
 * expansion's, not Archnemesis's), and some names are traps — "Domination league
 * logo" is a gameplay screenshot. So the choice is made here, by hand, one file
 * per league, looked at.
 *
 * How a file was chosen, in order:
 *   1. The transparent logo in the series Grinding Gear Games has published
 *      since The Awakening, 544x394, "Path of Exile" over the league's name —
 *      the look of the header this fills.
 *   2. Where a patch shipped two leagues (Tempest / Warbands) or the league has
 *      only a boxed JPG, the expansion's logo from the same series.
 *   3. Nothing on either wiki: the game's own logo, marked `generic` in the
 *      index so the page and anyone reading the data can tell a placeholder
 *      from the league's art. Most events land here.
 *
 * The wikis sit behind Cloudflare, which challenges a burst of requests: titles
 * go up fifty to a query and downloads are spaced out. A challenge page comes
 * back as HTML, and that is reported as what it is rather than as bad JSON.
 *
 * Transparent margins are trimmed, because the header sets the logo's height
 * to the portrait's and a logo with padding would sit visibly shorter than it.
 * Results are committed, like the portraits.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { LEAGUE_SEED } from "../src/lib/leagues";

const WIKIS = {
  poe1: "https://www.poewiki.net/w/api.php",
  poe2: "https://www.poe2wiki.net/api.php",
} as const;
type Wiki = keyof typeof WIKIS;

type Pick = { wiki: Wiki; file: string; generic?: true };

const POE1_LOGO: Pick = { wiki: "poe1", file: "Path of Exile logo.png", generic: true };
const POE2_LOGO: Pick = { wiki: "poe1", file: "Path of Exile 2 logo.png", generic: true };
const poe1 = (file: string): Pick => ({ wiki: "poe1", file });
const poe2 = (file: string): Pick => ({ wiki: "poe2", file });

/** Keyed by `${game}/${slug}`, the catalogue's own key. */
const PICKS: Record<string, Pick> = {
  // 1.0 is the launch itself; its only "logo" on the wiki is a screenshot.
  "poe1/1.0": POE1_LOGO,
  "poe1/1.1": poe1("Sacrifice of the Vaal logo.png"),
  "poe1/1.2": poe1("Forsaken Masters logo.png"),
  // Torment's and Talisman's "league logo" files are in-game art, not logos.
  "poe1/1.3": POE1_LOGO,
  "poe1/2.0": poe1("The Awakening logo.png"),
  "poe1/2.1": POE1_LOGO,
  "poe1/2.2": poe1("Ascendancy logo.png"),
  // Prophecy has an in-game banner and no logo on the wiki.
  "poe1/2.3": POE1_LOGO,
  "poe1/2.4": poe1("Atlas of Worlds logo.png"),
  "poe1/2.5": poe1("Breach logo.png"),
  // Legacy's is a boxed picture of a nail.
  "poe1/2.6": POE1_LOGO,
  "poe1/3.0": poe1("The Fall of Oriath logo.png"),
  "poe1/3.1": poe1("War for the Atlas logo.png"),
  "poe1/3.2": poe1("Bestiary logo.png"),
  "poe1/3.3": poe1("Incursion logo.png"),
  "poe1/3.4": poe1("Delve logo.png"),
  "poe1/3.5": poe1("Betrayal logo.png"),
  "poe1/3.6": poe1("Synthesis logo.png"),
  "poe1/3.7": poe1("Legion league logo.png"),
  "poe1/3.8": poe1("Blight logo.png"),
  "poe1/3.9": poe1("Conquerors of the Atlas logo.png"),
  "poe1/3.10": poe1("Delirium logo.png"),
  "poe1/3.11": poe1("Harvest logo.png"),
  "poe1/3.12": poe1("Heist logo.png"),
  "poe1/3.13": poe1("Echoes of the Atlas logo.png"),
  "poe1/3.14": poe1("Ultimatum logo.png"),
  "poe1/3.15": poe1("Expedition league logo.png"),
  "poe1/3.16": poe1("Scourge logo.png"),
  "poe1/3.17": poe1("Siege Expansion logo.png"),
  "poe1/3.18": poe1("Sentinel league logo.png"),
  "poe1/3.19": poe1("Lake of Kalandra logo.png"),
  "poe1/3.20": poe1("The Forbidden Sanctum logo.png"),
  "poe1/3.21": poe1("Crucible logo.png"),
  "poe1/3.22": poe1("Trial of the Ancestors logo.png"),
  "poe1/3.23": poe1("Affliction logo.png"),
  "poe1/3.24": poe1("Necropolis logo.png"),
  "poe1/3.25": poe1("Settlers of Kalguur logo.png"),
  "poe1/3.26": poe1("Secrets Expansion logo.png"),
  "poe1/3.27": poe1("Keepers Expansion logo.png"),
  "poe1/3.28": poe1("Mirage Expansion logo.png"),
  "poe1/3.29": poe1("Curse of the Allflame Expansion logo.png"),
  "poe1/legacy-of-phrecia": poe1("Legacy of Phrecia event logo.jpg"),
  "poe1/legacy-of-phrecia-2": poe1("Legacy of Phrecia event logo.jpg"),

  "poe2/beta-1": POE2_LOGO,
  "poe2/beta-2": POE2_LOGO,
  "poe2/0.1": POE2_LOGO,
  "poe2/0.2": poe2("Dawn of the Hunt logo.png"),
  "poe2/0.3": poe2("The Third Edict logo.png"),
  "poe2/0.4": poe2("The Last of the Druids logo.png"),
  "poe2/0.5": poe2("Return of the Ancients logo.png"),
  "poe2/0.5.5": poe2("Forbidden Rites league banner.png"),
};

const OUTPUT = path.join(process.cwd(), "public", "leagues");
const INDEX = path.join(process.cwd(), "src", "lib", "league-logos.json");
const USER_AGENT = "halls-of-exile (personal character archive)";
const PAUSE_MS = 1500;
const force = process.argv.includes("--force");

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

async function getJson(url: URL) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  const text = await response.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(`${url.host} answered with a Cloudflare challenge, not JSON — wait a few minutes and re-run`);
  }
  if (!response.ok) throw new Error(`${url.host} returned HTTP ${response.status}`);
  return JSON.parse(text);
}

/** File title → download URL, fifty titles to a request, matched back by title. */
async function resolve(wiki: Wiki, files: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let start = 0; start < files.length; start += 50) {
    const batch = files.slice(start, start + 50);
    const url = new URL(WIKIS[wiki]);
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("titles", batch.map((file) => `File:${file}`).join("|"));
    const body = await getJson(url);
    const rewrites = new Map<string, string>();
    for (const hop of [...(body.query?.normalized ?? []), ...(body.query?.redirects ?? [])]) rewrites.set(hop.from, hop.to);
    const pages = new Map<string, string>();
    for (const page of Object.values(body.query?.pages ?? {}) as { title: string; imageinfo?: { url: string }[] }[]) {
      if (page.imageinfo?.[0]) pages.set(page.title, page.imageinfo[0].url);
    }
    for (const file of batch) {
      let title = `File:${file}`;
      for (let hops = 0; hops < 4 && rewrites.has(title); hops += 1) title = rewrites.get(title) as string;
      const src = pages.get(title);
      if (src) found.set(file, src);
    }
    await pause();
  }
  return found;
}

/** "Curse of the Allflame Expansion logo.png" → "curse-of-the-allflame-expansion-logo". */
const slugFor = (file: string) =>
  file
    .replace(/\.[a-z]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const keys = LEAGUE_SEED.map((league) => `${league.game}/${league.slug}`);
  const picks = new Map<string, Pick>();
  for (const key of keys) picks.set(key, PICKS[key] ?? (key.startsWith("poe2/") ? POE2_LOGO : POE1_LOGO));
  for (const key of Object.keys(PICKS)) {
    if (!keys.includes(key)) process.stderr.write(`  ${key} is picked but not in the catalogue\n`);
  }

  const urls = new Map<string, string>();
  for (const wiki of Object.keys(WIKIS) as Wiki[]) {
    const files = [...new Set([...picks.values()].filter((pick) => pick.wiki === wiki).map((pick) => pick.file))];
    for (const [file, src] of await resolve(wiki, files)) urls.set(`${wiki}:${file}`, src);
  }

  const files = new Map<string, { width: number; height: number }>();
  let failed = 0;
  fs.mkdirSync(OUTPUT, { recursive: true });
  for (const pick of new Map([...picks.values()].map((pick) => [`${pick.wiki}:${pick.file}`, pick])).values()) {
    const slug = slugFor(pick.file);
    const destination = path.join(OUTPUT, `${slug}.webp`);
    const src = urls.get(`${pick.wiki}:${pick.file}`);
    if (!src) {
      process.stderr.write(`  not on the ${pick.wiki} wiki: ${pick.file}\n`);
      failed += 1;
      continue;
    }
    if (force || !fs.existsSync(destination)) {
      const response = await fetch(src, { headers: { "user-agent": USER_AGENT } });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!response.ok || buffer.subarray(0, 64).toString().includes("<!DOCTYPE")) {
        process.stderr.write(`  ${pick.file}: HTTP ${response.status}\n`);
        failed += 1;
        continue;
      }
      // Trim the transparent border so the drawn logo spans the height it is
      // given. A JPG has no transparency and nothing to trim; `threshold`
      // keeps the trim from eating into anti-aliased edges.
      // Capped at twice the header's 111px, enough for a high-DPI screen; the
      // wiki's originals run to 1920px wide and made the set 3 MB.
      const trimmed = await sharp(buffer)
        .trim({ threshold: 4 })
        .resize({ height: 222, withoutEnlargement: true })
        .webp({ quality: 84, alphaQuality: 85 }).toBuffer();
      fs.writeFileSync(destination, trimmed);
      await pause();
    }
    const meta = await sharp(destination).metadata();
    files.set(slug, { width: meta.width ?? 0, height: meta.height ?? 0 });
  }

  const index: Record<string, { src: string; width: number; height: number; file: string; generic?: true }> = {};
  for (const [key, pick] of picks) {
    const slug = slugFor(pick.file);
    const size = files.get(slug);
    if (!size) continue;
    index[key] = { src: `/leagues/${slug}.webp`, ...size, file: pick.file, ...(pick.generic ? { generic: true } : {}) };
  }
  if (failed === 0) fs.writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
  const generic = Object.values(index).filter((entry) => entry.generic).length;
  process.stdout.write(
    `${Object.keys(index).length} of ${keys.length} leagues have a logo (${generic} the game's own), ` +
      `${files.size} files, ${failed} failed\n`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});
