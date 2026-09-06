/**
 * Build the ascendancy icon index from Grinding Gear Games' passive tree export.
 *
 *   npm run ascendancy:index
 *
 * The tree ships every ascendancy's emblem in one sprite sheet with per-class
 * coordinates, which is how the game's own tree draws them. Taking the sheet and
 * the coordinates means one image for all nineteen, cropped in CSS the same way
 * a flask's three-frame sheet already is.
 *
 * Ascendancies are indexed under both their id and their display name: the two
 * differ where a class was renamed (id Raider, name Warden), and which one a
 * Path of Building export carries depends on its version.
 *
 * The smallest of the five zoom levels is used deliberately — its icons are
 * 161-190 px, several times the size they are drawn at, for a sheet of 863 px.
 */
import fs from "node:fs";
import path from "node:path";

const SOURCE = "https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json";
const OUTPUT = path.join(process.cwd(), "src", "lib", "ascendancy-icons.json");

type Box = { x: number; y: number; w: number; h: number };
type Sprite = { filename: string; w: number; h: number; coords: Record<string, Box> };
type Tree = {
  classes: { name: string; ascendancies: { id: string; name: string }[] }[];
  sprites: { ascendancy: Record<string, Sprite> };
};

export type AscendancyIndex = {
  /** The sheet's URL on the game's image CDN, cache-buster and all. */
  sheet: string;
  sheetWidth: number;
  sheetHeight: number;
  icons: Record<string, Box>;
};

async function main() {
  process.stdout.write(`fetching ${SOURCE}\n`);
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error(`the tree export returned HTTP ${response.status}`);
  const tree = (await response.json()) as Tree;

  const zooms = tree.sprites.ascendancy;
  const smallest = Object.keys(zooms).sort((a, b) => Number(a) - Number(b))[0];
  const sheet = zooms[smallest];
  if (!sheet) throw new Error("the tree export has no ascendancy sprite sheet");

  const icons: Record<string, Box> = {};
  for (const characterClass of tree.classes) {
    for (const ascendancy of characterClass.ascendancies) {
      const box = sheet.coords[`Classes${ascendancy.id}`];
      if (!box) {
        process.stdout.write(`  no icon for ${ascendancy.name}\n`);
        continue;
      }
      icons[ascendancy.name] = box;
      icons[ascendancy.id] = box;
    }
  }

  const index: AscendancyIndex = {
    sheet: sheet.filename,
    sheetWidth: sheet.w,
    sheetHeight: sheet.h,
    icons: Object.fromEntries(Object.keys(icons).sort().map((key) => [key, icons[key]])),
  };

  fs.writeFileSync(OUTPUT, `${JSON.stringify(index, null, 0)}\n`);
  process.stdout.write(`wrote ${Object.keys(index.icons).length} icon keys to ${OUTPUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
