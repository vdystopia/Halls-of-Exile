export function ChallengeMeter({
  completed,
  total,
  size = "md",
}: {
  completed: number | null;
  total: number | null;
  size?: "sm" | "md";
}) {
  // A Path of Exile 2 league before 0.5 had no challenges at all, and 0.5's
  // count is not recorded anywhere found — either way there is no meter to draw.
  if (total === null) {
    return <span className="text-xs text-muted/70">no challenges</span>;
  }
  if (completed === null) {
    return <span className="text-xs text-muted/70">challenges not recorded</span>;
  }
  const ratio = total > 0 ? Math.min(1, completed / total) : 0;
  const complete = completed >= total;
  return (
    <div className={size === "sm" ? "w-full max-w-[180px]" : "w-full max-w-[260px]"}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="eyebrow">Challenges</span>
        <span className={`font-display text-sm tabular-nums ${complete ? "text-gold-bright" : "text-parchment"}`}>
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
