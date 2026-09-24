/**
 * The gem picture for the skill a character was built around, drawn beside its
 * name at the top of the character page.
 *
 * The art is resolved on the server — `gemArt` reads a 112 KB index that must
 * not reach the browser — and this takes the finished path as a prop, the same
 * arrangement `ItemTooltip` uses for its sections.
 *
 * Drawn as a CSS background rather than an `<img>` so a picture that is not on
 * disk yet renders as an empty tile instead of a broken-image glyph: the art is
 * fetched separately by `npm run art:fetch` and is allowed to be missing. A
 * character with no skill recorded renders nothing at all, so the header closes
 * up rather than leaving a hole — the rule `AscendancyIcon` already follows.
 *
 * Most gem art is a layered sheet rather than one picture, exactly as a flask's
 * is: a strip holding the gem's socket setting and the gem itself, which the
 * game stacks to draw the icon. Laid out flat it reads as two smudges at the
 * edges of the tile with a gap between them. So the layers are composited the
 * way `GearSlot` composites a flask, and the frame count comes from the index,
 * because every support's art and two actives' are a single square and
 * stacking those would draw one of them at triple zoom.
 */
export function SkillIcon({
  src,
  name,
  frames = 1,
  size = 44,
}: {
  src?: string | null;
  name?: string | null;
  frames?: number;
  size?: number;
}) {
  if (!src) return null;

  const layered = frames > 1;
  return (
    <span
      aria-label={name ?? undefined}
      title={name ?? undefined}
      className="shrink-0 rounded-md bg-black/30 ring-1 ring-line"
      style={{
        display: "block",
        width: size,
        height: size,
        backgroundImage: layered ? `url(${src}), url(${src}), url(${src})` : `url(${src})`,
        backgroundSize: layered ? `${frames * 100}% 100%` : "contain",
        backgroundPosition: layered ? "0% 50%, 50% 50%, 100% 50%" : "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
