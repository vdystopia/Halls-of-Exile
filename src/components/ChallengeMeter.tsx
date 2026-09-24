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
  // A Path of Exile 2 league before 0.5 had no challenges at all, and 0.5's
  // count is not recorded anywhere found — either way there is no meter to draw.
  if (total === null) {
    return <span className="text-xs text-muted/70">no challenges</span>;
  }
  if (completed === null) {
    return <span className="text-xs text-muted/70">challenges not recorded</span>;
  }
  const ratio = challengeFraction(completed, total) ?? 0;
  const complete = completed >= total;
  return (
    // `min-w-0` so the meter can be narrower than its content wants to be:
    // without it a flex child refuses to shrink past its minimum and overflows
    // the cell rather than fitting into it.
    <div className={`w-full min-w-0 ${size === "sm" ? "max-w-[180px]" : "max-w-[260px]"}`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        {label ? <span className="eyebrow truncate">Challenges</span> : null}
        <span
          className={`font-display text-sm tabular-nums ${complete ? "text-gold-bright" : "text-parchment"} ${
            label ? "" : "block"
          }`}
        >
          {completed}/{total}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full ${complete ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-gradient-to-r from-[#6b5a34] to-gold"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
