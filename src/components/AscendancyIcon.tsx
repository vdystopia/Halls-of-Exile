import { ascendancyIcon } from "@/lib/ascendancy";

/**
 * The ascendancy's emblem, cropped out of the passive tree's sprite sheet by
 * scaling the whole sheet and offsetting it, which is the same trick `GearSlot`
 * uses for a flask's three frames. Renders nothing at all when the character has
 * no ascendancy, so the layout closes up rather than leaving a hole.
 */
export function AscendancyIcon({
  ascendancy,
  size = 44,
}: {
  ascendancy?: string | null;
  size?: number;
}) {
  const icon = ascendancyIcon(ascendancy);
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
