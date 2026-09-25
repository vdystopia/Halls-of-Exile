import { ascendancyPortrait } from "@/lib/games/ascendancy";
import type { GameId } from "@/lib/games/types";

/**
 * The ascendancy's key art, drawn at the left of the character page header.
 *
 * Deliberately not `AscendancyIcon`. That one crops the passive tree's sprite
 * sheet, where every emblem is composed with its lower half left empty so the
 * tree's lines can pass through it — fine on the tree and fine at list size,
 * but blown up to header size the empty half is most of the picture. This is
 * the wide painting of the class instead, one file per ascendancy.
 *
 * The caller sets the height and the width follows the picture's own shape,
 * because the two games' pictures are different shapes: Path of Exile's is a
 * 530x245 painting, Path of Exile 2's a roughly 1.3:1 crop of the face. One box
 * for both would cut the forehead and chin off every Path of Exile 2 character.
 *
 * Drawn as a CSS background rather than an `<img>`, the arrangement `SkillIcon`
 * and `GearSlot` already use, so a file that somehow is not on disk leaves a
 * dark panel rather than a broken-image glyph.
 *
 * A character with no ascendancy — under level 68, or one that never took one —
 * renders nothing, so the header closes up rather than leaving a hole. The rule
 * `AscendancyIcon` and `SkillIcon` both follow.
 */
export function AscendancyPortrait({
  game,
  ascendancy,
  height,
  className = "",
}: {
  game: GameId;
  ascendancy?: string | null;
  /** In CSS pixels. */
  height: number;
  className?: string;
}) {
  const portrait = ascendancyPortrait(game, ascendancy);
  if (!portrait) return null;

  return (
    <span
      aria-label={ascendancy ?? undefined}
      title={ascendancy ?? undefined}
      className={`block shrink-0 overflow-hidden rounded-sm bg-black/40 ring-1 ring-line ${className}`}
      style={{
        height,
        width: Math.round((height * portrait.width) / portrait.height),
        backgroundImage: `url(${portrait.src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
