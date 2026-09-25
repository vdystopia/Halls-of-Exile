import { challengeFraction } from "@/lib/format";

export function ChallengeMeter({
  completed,
  total,
  size = "md",
  label = true,
}: {
  completed: number | null;
  total: number | null;
  size?: "sm" | "md";
  /**
   * Off in the league index, where the column is already headed "Challenges".
   * The word repeated in every cell is not just noise: with the count beside it
   * the pair needs about 160px, and in a column narrower than that the two were
   * pushed apart until "40/40" sat outside the table entirely.
   */
  label?: boolean;
}) {
  if (completed === null && total !== null) {
    return <span className="text-xs text-muted/70">challenges not recorded</span>;
  }
  // A Path of Exile 2 league before 0.5 had no challenges at all, and 0.5's
  // count is not recorded anywhere found. It still takes the meter's shape —
  // the words where the count goes, a bare stone bar where the progress goes —
  // so a column of meters does not break rhythm at every league without one.
  const none = total === null;
  // A count recorded against a league whose total nobody knows — a Path of
  // Exile 2 league, an event — is still a result, and saying "No Challenges"
  // over it hid what was typed in. It shows as a bare count, with no fraction
  // to draw, over the same stone bar.
  const countOnly = none && completed !== null;
  const ratio = none ? 0 : (challengeFraction(completed, total) ?? 0);
  const complete = !none && completed !== null && completed >= total;
  return (
    // `min-w-0` so the meter can be narrower than its content wants to be:
    // without it a flex child refuses to shrink past its minimum and overflows
    // the cell rather than fitting into it.
    <div className={`w-full min-w-0 ${size === "sm" ? "max-w-[180px]" : "max-w-[260px]"}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        {label ? <span className="eyebrow truncate">Challenges</span> : null}
        <span className={`items-center gap-1.5 ${label ? "inline-flex" : "flex"}`}>
          <span
            className={`font-display text-sm tabular-nums ${
              none && !countOnly ? "text-muted" : complete ? "challenge-radiant-text" : "text-parchment"
            }`}
          >
            {countOnly ? `${completed} done` : none ? "No Challenges" : `${completed}/${total}`}
          </span>
          {complete ? (
            <span aria-hidden className="challenge-sparkle text-xs leading-none">
              ✦
            </span>
          ) : null}
        </span>
      </div>
      {none ? (
        <div className="challenge-stone-bar h-1.5 w-full rounded-full" />
      ) : complete ? (
        // Every challenge done is the rarest thing on the page, and it looks it:
        // a glow around the bar and a sheen that sweeps across bar and count.
        // The track keeps its glow outside the overflow clip, on itself.
        <div className="challenge-radiant-track h-1.5 w-full rounded-full">
          <div className="challenge-radiant-bar h-full w-full rounded-full" />
        </div>
      ) : (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#6b5a34] to-gold"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
