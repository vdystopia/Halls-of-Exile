import { ascendancyIcon } from "@/lib/games/ascendancy";
import type { GameId } from "@/lib/games/types";

/**
 * The ascendancy's emblem, cropped out of the passive tree's sprite sheet by
 * scaling the whole sheet and offsetting it, which is the same trick `GearSlot`
 * uses for a flask's three frames. A character with no ascendancy is drawn as
 * its class, the face at the centre of the class's picture; one with no known
 * class either renders nothing at all, so the layout closes up rather than
 * leaving a hole. Path of Exile 2 has no emblem sheet, so its "sheet" is the
 * portrait and the crop is the face at its centre.
 */
export function AscendancyIcon({
  game,
  ascendancy,
  characterClass,
  size = 44,
}: {
  game: GameId;
  ascendancy?: string | null;
  /** The base class, drawn when there is no ascendancy. */
  characterClass?: string | null;
  size?: number;
}) {
  const icon = ascendancyIcon(game, ascendancy, characterClass);
  if (!icon) return null;
  const label = ascendancy || characterClass || undefined;

  const scale = size / icon.w;
  return (
    <span
      aria-label={label}
      title={label}
      className="shrink-0 rounded-full bg-black/30 ring-1 ring-line"
      style={{
        display: "block",
        width: size,
        height: size,
        backgroundImage: `url(${icon.src})`,
        backgroundSize: `${icon.sheetWidth * scale}px ${icon.sheetHeight * scale}px`,
        backgroundPosition: `-${icon.x * scale}px -${icon.y * scale}px`,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
