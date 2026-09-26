import { AscendancyIcon } from "@/components/AscendancyIcon";
import { formatPlayed } from "@/lib/format";
import { classNameStyle } from "@/lib/games/class-colors";
import type { GameId } from "@/lib/games/types";
import type { Rollup } from "@/lib/metrics";

/**
 * One grid for the header, every class and every ascendancy, so the columns
 * line up through the nesting. The table shares its panel with the pie, so its
 * column set follows the table's own width (a container query), not the
 * window's: under 28rem it keeps name, characters and /played, from 28rem it
 * adds average level, and leagues and highest wait for 32rem. Sized by the
 * window it overflowed its half of the panel between 1024 and 1107px.
 */
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_2.5rem_5rem] @md:grid-cols-[minmax(0,1fr)_3rem_5.5rem_3.5rem] @lg:grid-cols-[minmax(7rem,1.4fr)_3.5rem_3.5rem_minmax(5.5rem,1fr)_3.5rem_3.5rem] items-center gap-x-3";
const WIDE = "hidden @lg:block";
const MID = "hidden @md:block";

function Played({ row, total }: { row: Rollup; total: number }) {
  const played = formatPlayed(row.playedMinutes);
  const coverage =
    row.playedRecorded < row.characters
      ? `recorded for ${row.playedRecorded} of ${row.characters} characters`
      : `recorded for every character`;
  // The figure sits centred over its bar, not flush right of the column.
  return (
    <div title={coverage} className="min-w-0 text-center">
      <span className="tabular-nums">{played ?? "—"}</span>
      {row.playedRecorded < row.characters && played ? <span className="text-muted">*</span> : null}
      {/* Share of the player's whole /played in this game. */}
      <div className="mt-1 hidden h-1 overflow-hidden rounded-full bg-white/5 @md:block">
        <div className="h-full rounded-full bg-gold/60" style={{ width: `${total ? (row.playedMinutes / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function Cells({ row, total }: { row: Rollup; total: number }) {
  return (
    <>
      <span className="text-right tabular-nums">{row.characters}</span>
      <span className={`${WIDE} text-right tabular-nums`}>{row.leagues}</span>
      <Played row={row} total={total} />
      <span className={`${MID} text-right tabular-nums`}>{row.averageLevel === null ? "—" : row.averageLevel.toFixed(1)}</span>
      <span className={`${WIDE} text-right tabular-nums`}>{row.highestLevel ?? "—"}</span>
    </>
  );
}

/**
 * A player's characters by class, opening into ascendancies. Plain
 * `<details>`, so it needs no client code and every class can be open at once.
 * Drawn inside `ClassBreakdown`'s panel, beside the pie.
 */
export function ClassRollup({ game, classes }: { game: GameId; classes: Rollup[] }) {
  const total = classes.reduce((sum, row) => sum + row.playedMinutes, 0);
  return (
    <div className="@container overflow-hidden rounded border border-line text-xs">
      <div className={`${COLUMNS} border-b border-line px-3 py-2 text-[0.62rem] tracking-[0.14em] text-muted uppercase`}>
        <span>Class</span>
        <span className="text-right">
          <span className="@md:hidden">#</span>
          <span className="hidden @md:inline">Chars</span>
        </span>
        <span className={`${WIDE} text-right`}>Leagues</span>
        <span className="text-center">/played</span>
        <span className={`${MID} text-right`}>Avg lvl</span>
        <span className={`${WIDE} text-right`}>Highest</span>
      </div>
      {classes.map((row) => (
        <details key={row.name} className="group border-b border-line last:border-b-0">
          <summary className={`${COLUMNS} cursor-pointer list-none px-3 py-2 hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-[0.55rem] text-muted transition-transform group-open:rotate-90">▶</span>
              <span
                className={`font-display truncate text-sm tracking-wide ${row.known ? "gem-name" : "text-muted"}`}
                style={row.known ? classNameStyle(game, row.name) : undefined}
              >
                {row.name}
              </span>
            </span>
            <Cells row={row} total={total} />
          </summary>
          <div className="bg-black/20 pb-1">
            {row.children.map((child) => (
              <div key={child.name} className={`${COLUMNS} px-3 py-1.5 text-parchment/85`}>
                <span className="flex min-w-0 items-center gap-2 pl-4">
                  {child.known ? <AscendancyIcon game={game} ascendancy={child.name} size={18} /> : null}
                  <span className={`truncate ${child.known ? "" : "text-muted"}`}>{child.name}</span>
                </span>
                <Cells row={child} total={total} />
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
