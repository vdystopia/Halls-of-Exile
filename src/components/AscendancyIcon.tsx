import { ascendancyIcon } from "@/lib/games/ascendancy";
import type { GameId } from "@/lib/games/types";

/**
 * The ascendancy's emblem, cropped out of the passive tree's sprite sheet by
 * scaling the whole sheet and offsetting it, which is the same trick `GearSlot`
 * uses for a flask's three frames. Renders nothing at all when the character has
 * no ascendancy, so the layout closes up rather than leaving a hole. Path of
 * Exile 2 has no emblem sheet, so its "sheet" is the portrait and the crop is
 * the face at its centre.
 */
export function AscendancyIcon({
  game,
  ascendancy,
  size = 44,
}: {
  game: GameId;
  ascendancy?: string | null;
  size?: number;
}) {
  const icon = ascendancyIcon(game, ascendancy);
  if (!icon) return null;

  const scale = size / icon.w;
  return (
    <span
      aria-label={ascendancy ?? undefined}
      title={ascendancy ?? undefined}
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
