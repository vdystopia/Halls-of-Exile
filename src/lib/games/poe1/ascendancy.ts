import index from "./ascendancy-icons.json";
import avatarIndex from "./ascendancy-avatars.json";
import portraitIndex from "./ascendancy-portraits.json";
import classIndex from "./class-portraits.json";

/**
 * The Legacy of Phrecia ascendancies, by the class each belongs to.
 *
 * The Phrecia-style events (Legacy of Phrecia, its second run, Return of the
 * Ancestors) replace all nineteen ascendancies with these. The game draws no
 * emblem for them on the tree and the wiki holds no key art for them, so a
 * character from one of those events is shown as its base class instead: a
 * Bog Shaman is a Witch, and gets the Witch's picture. The table is the wiki's,
 * https://www.poewiki.net/wiki/Legacy_of_Phrecia#Ascendancy_classes, and agrees
 * with Path of Building's alternate tree data, where each of these occupies
 * the slot of the ascendancy it replaced (`tree-data/3.28.alternate.json`).
 *
 * A name is looked up here only after the regular ascendancies, so nothing
 * here can shadow a real one.
 */
export const ALTERNATE_ASCENDANCIES: Record<string, string> = {
  Antiquarian: "Marauder",
  Behemoth: "Marauder",
  "Ancestral Commander": "Marauder",
  Gambler: "Duelist",
  Paladin: "Duelist",
  Aristocrat: "Duelist",
  "Servant of Arakaali": "Shadow",
  Surfcaster: "Shadow",
  "Blind Prophet": "Shadow",
  "Daughter of Oshabi": "Ranger",
  Whisperer: "Ranger",
  Wildspeaker: "Ranger",
  Harbinger: "Witch",
  Herald: "Witch",
  "Bog Shaman": "Witch",
  "Architect of Chaos": "Templar",
  Polytheist: "Templar",
  Puppeteer: "Templar",
  Scavenger: "Scion",
};

const CLASS_PORTRAITS = classIndex.portraits as Record<string, { slug: string; width: number; height: number }>;

/**
 * The base class's own picture, "<Class> character class.png" on the wiki: a
 * 137x105 close crop of the face, the same shape as an avatar, fetched by
 * `npm run ascendancy:art -- --game poe1-class` into public/ascendancy/class/.
 */
export function classPortrait(className?: string | null): AscendancyPortrait | null {
  const entry = className ? CLASS_PORTRAITS[className.trim()] : undefined;
  if (!entry) return null;
  return { src: `/ascendancy/class/${entry.slug}.webp`, width: entry.width, height: entry.height };
}

/**
 * The picture for a character the ascendancy art does not cover: an event
 * ascendancy is its class's picture, and so is a character with no ascendancy
 * at all — under level 68, or a record that names only the class — when the
 * class is known. The ascendancy is asked first: it names its class, and the
 * class column can be wrong (the owner's record has a Surfcaster filed as a
 * Ranger). A base class passed as the ascendancy is still nothing: it is not
 * an ascendancy, and the class argument is where a class goes.
 */
function fallbackPortrait(ascendancy: string | undefined, className?: string | null): AscendancyPortrait | null {
  const alternate = ascendancy ? ALTERNATE_ASCENDANCIES[ascendancy] : undefined;
  return classPortrait(alternate ?? (ascendancy ? null : className));
}

/** Where the emblem sits on the sheet, and how big the sheet is. */
export type AscendancyIcon = {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sheetWidth: number;
  sheetHeight: number;
};

/** The sheet is fetched by `npm run art:fetch` and served from public/. */
export const ASCENDANCY_SHEET = "/ascendancy.webp";

const ICONS = index.icons as Record<string, { x: number; y: number; w: number; h: number }>;

/**
 * Every ascendancy's emblem lives in one sprite sheet from the passive tree,
 * so a character's icon is a crop rather than a file of its own. A character
 * with no ascendancy — anything under level 68, or one that never took one —
 * has no emblem to show, and neither does a name the tree does not carry.
 */
export function ascendancyIcon(ascendancy?: string | null, className?: string | null): AscendancyIcon | null {
  const name = ascendancy?.trim();
  const box = name ? ICONS[name] : undefined;
  if (box) return { src: ASCENDANCY_SHEET, ...box, sheetWidth: index.sheetWidth, sheetHeight: index.sheetHeight };
  // An event ascendancy, or none, has no emblem on the sheet, so the card
  // shows the centre square of the class's picture, as a Path of Exile 2 card does.
  const portrait = fallbackPortrait(name, className);
  if (!portrait) return null;
  const side = Math.min(portrait.width, portrait.height);
  return {
    src: portrait.src,
    x: Math.round((portrait.width - side) / 2),
    y: Math.round((portrait.height - side) / 2),
    w: side,
    h: side,
    sheetWidth: portrait.width,
    sheetHeight: portrait.height,
  };
}

export function ascendancySheetUrl(): string {
  return index.sheet;
}

/** The class portrait: a whole file, not a crop, at the size it was saved. */
export type AscendancyPortrait = {
  src: string;
  width: number;
  height: number;
};

const PORTRAITS = portraitIndex.portraits as Record<string, { slug: string; width: number; height: number }>;

/**
 * The ascendancy's key art, as the game draws it on the selection screen.
 *
 * This is a different picture from `ascendancyIcon`, not a bigger one. The
 * emblem is a crop of the passive tree's sprite sheet, drawn on the tree, and
 * composed with its lower half empty so the tree's lines can run through it; at
 * header size that empty half is most of the tile. The portrait is the wide
 * painting of the class, and it is what the character page shows.
 *
 * The emblem is still the right choice where a character is one row in a list,
 * so `CharacterCard` keeps it.
 *
 * Indexed under id and display name both, for the same reason the emblem is:
 * Warden was Raider, and which name a build carries depends on the version of
 * Path of Building that exported it. Both resolve to the one file.
 */
export function ascendancyPortrait(ascendancy?: string | null, className?: string | null): AscendancyPortrait | null {
  const name = ascendancy?.trim();
  const entry = name ? PORTRAITS[name] : undefined;
  if (!entry) return fallbackPortrait(name, className);
  return { src: `/ascendancy/${entry.slug}.webp`, width: entry.width, height: entry.height };
}

const AVATARS = avatarIndex.portraits as Record<string, { slug: string; width: number; height: number }>;

/**
 * The ascendancy's avatar: a 135x105 close crop of the face, for a compact
 * character banner where the wide portrait would be mostly background at that
 * size. Indexed under both of a renamed ascendancy's names, like the others.
 */
export function ascendancyAvatar(ascendancy?: string | null, className?: string | null): AscendancyPortrait | null {
  const name = ascendancy?.trim();
  const entry = name ? AVATARS[name] : undefined;
  // The class picture is already a close crop of the face, so it is the avatar too.
  if (!entry) return fallbackPortrait(name, className);
  return { src: `/ascendancy/avatar/${entry.slug}.webp`, width: entry.width, height: entry.height };
}
