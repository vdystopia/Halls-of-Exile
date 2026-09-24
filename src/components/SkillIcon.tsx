/**
 * The gem picture for the skill a character was built around, drawn beside its
 * ascendancy emblem at the top of the character page.
 *
 * The art is resolved on the server — `gemArt` reads a 102 KB index that must
 * not reach the browser — and this takes the finished path as a prop, the same
 * arrangement `ItemTooltip` uses for its sections.
 *
 * Drawn as a CSS background rather than an `<img>` so a picture that is not on
 * disk yet renders as an empty tile instead of a broken-image glyph: the art is
 * fetched separately by `npm run art:fetch` and is allowed to be missing. A
 * character with no skill recorded renders nothing at all, so the header closes
 * up rather than leaving a hole — the rule `AscendancyIcon` already follows.
 */
export function SkillIcon({
  src,
  name,
  size = 44,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
}) {
  if (!src) return null;
  return (
    <span
      aria-label={name ?? undefined}
      title={name ?? undefined}
      className="shrink-0 rounded-md bg-black/30 ring-1 ring-line"
      style={{
        display: "block",
        width: size,
        height: size,
        backgroundImage: `url(${src})`,
        backgroundSize: "contain",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}
