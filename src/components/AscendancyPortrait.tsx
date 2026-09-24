import { ascendancyPortrait } from "@/lib/games/poe1/ascendancy";

/**
 * The ascendancy's key art, drawn at the left of the character page header.
 *
 * Deliberately not `AscendancyIcon`. That one crops the passive tree's sprite
 * sheet, where every emblem is composed with its lower half left empty so the
 * tree's lines can pass through it — fine on the tree and fine at list size,
 * but blown up to header size the empty half is most of the picture. This is
 * the wide painting of the class instead, one file per ascendancy.
 *
 * Drawn as a CSS background rather than an `<img>`, the arrangement `SkillIcon`
 * and `GearSlot` already use: `cover` crops the sides of a 530x245 painting to
 * whatever box the header gives it without distorting the face in the middle,
 * and a file that somehow is not on disk leaves a dark panel rather than a
 * broken-image glyph.
 *
 * A character with no ascendancy — under level 68, or one that never took one —
 * renders nothing, so the header closes up rather than leaving a hole. The rule
 * `AscendancyIcon` and `SkillIcon` both follow.
 */
export function AscendancyPortrait({
  ascendancy,
  className = "",
}: {
  ascendancy?: string | null;
  className?: string;
}) {
  const portrait = ascendancyPortrait(ascendancy);
  if (!portrait) return null;

  return (
    <span
      aria-label={ascendancy ?? undefined}
      title={ascendancy ?? undefined}
      className={`block shrink-0 overflow-hidden rounded-sm bg-black/40 ring-1 ring-line ${className}`}
      style={{
        backgroundImage: `url(${portrait.src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
