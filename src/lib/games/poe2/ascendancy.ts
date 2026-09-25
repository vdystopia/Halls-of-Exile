import type { AscendancyIcon, AscendancyPortrait } from "../poe1/ascendancy";
import portraitIndex from "./ascendancy-portraits.json";

const PORTRAITS = portraitIndex.portraits as Record<string, { slug: string; width: number; height: number }>;

/**
 * The ascendancy's portrait from the Path of Exile 2 Wiki, fetched by
 * `npm run ascendancy:art` into public/ascendancy/poe2/.
 *
 * Not the same kind of picture as Path of Exile's: a close crop of the face,
 * roughly 1.3:1, where the first game's is a 530x245 painting. The header draws
 * each at its own shape rather than cropping this one into that one's.
 *
 * Deadeye and Pathfinder are names in both games and different classes in each,
 * so this is looked up through the character's game and never by name alone.
 */
export function ascendancyPortrait(ascendancy?: string | null): AscendancyPortrait | null {
  const entry = ascendancy ? PORTRAITS[ascendancy.trim()] : undefined;
  if (!entry) return null;
  return { src: `/ascendancy/poe2/${entry.slug}.webp`, width: entry.width, height: entry.height };
}

/**
 * Path of Exile 2 has no emblem sheet — its tree export ships compressed DDS
 * atlases and nothing like the first game's round emblems — so a card's round
 * icon is the portrait, cropped to the square in its middle. The portraits are
 * framed on the face, so the centre square is the face.
 */
export function ascendancyIcon(ascendancy?: string | null): AscendancyIcon | null {
  const portrait = ascendancyPortrait(ascendancy);
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
