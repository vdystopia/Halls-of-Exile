import { AscendancyIcon } from "@/components/AscendancyIcon";
import { formatPlayed } from "@/lib/format";
import { classNameStyle } from "@/lib/games/class-colors";
import type { GameId } from "@/lib/games/types";
import type { Rollup } from "@/lib/metrics";

/**
 * One grid for the header, every class and every ascendancy, so the columns
 * line up through the nesting. A phone keeps name, characters and /played,
 * `sm` adds average level, and the rest wait for `md`.
 */
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_2.5rem_5.5rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_4.5rem] md:grid-cols-[minmax(11rem,1.5fr)_5.5rem_4.5rem_minmax(8rem,1fr)_5rem_4.5rem_4rem] items-center gap-x-4";
const WIDE = "hidden md:block";
const MID = "hidden sm:block";

function Played({ row, total }: { row: Rollup; total: number }) {
  const played = formatPlayed(row.playedMinutes);
  const coverage =
    row.playedRecorded < row.characters
      ? `recorded for ${row.playedRecorded} of ${row.characters} characters`
      : `recorded for every character`;
  return (
    <div title={coverage} className="min-w-0 text-right">
      <span className="tabular-nums">{played ?? "—"}</span>
      {row.playedRecorded < row.characters && played ? <span className="text-muted">*</span> : null}
      {/* Share of the player's whole /played in this game. */}
      <div className="mt-1 hidden h-1 overflow-hidden rounded-full bg-white/5 md:block">
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
      <span className={`${WIDE} text-right tabular-nums ${row.level90s ? "" : "text-muted"}`}>{row.level90s}</span>
    </>
  );
}

/**
 * A player's characters by class, opening into ascendancies. Plain
 * `<details>`, so it needs no client code and every class can be open at once.
 */
export function ClassRollup({ game, classes }: { game: GameId; classes: Rollup[] }) {
  const total = classes.reduce((sum, row) => sum + row.playedMinutes, 0);
  return (
    <div className="panel overflow-hidden text-sm">
      <div className={`${COLUMNS} border-b border-line px-4 py-2.5 text-[0.68rem] tracking-[0.16em] text-muted uppercase`}>
        <span>Class</span>
        <span className="text-right">
          <span className="sm:hidden">#</span>
          <span className="hidden sm:inline">Characters</span>
        </span>
        <span className={`${WIDE} text-right`}>Leagues</span>
        <span className="text-right">/played</span>
        <span className={`${MID} text-right`}>Avg level</span>
        <span className={`${WIDE} text-right`}>Highest</span>
        <span className={`${WIDE} text-right`}>90+</span>
      </div>
      {classes.map((row) => (
        <details key={row.name} className="group border-b border-line last:border-b-0">
          <summary className={`${COLUMNS} cursor-pointer list-none px-4 py-3 hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-[0.6rem] text-muted transition-transform group-open:rotate-90">▶</span>
              <span
                className={`font-display truncate text-base tracking-wide ${row.known ? "gem-name" : "text-muted"}`}
                style={row.known ? classNameStyle(game, row.name) : undefined}
              >
                {row.name}
              </span>
            </span>
            <Cells row={row} total={total} />
          </summary>
          <div className="bg-black/20 pb-1">
            {row.children.map((child) => (
              <div key={child.name} className={`${COLUMNS} px-4 py-2 text-parchment/85`}>
                <span className="flex min-w-0 items-center gap-2 pl-6">
                  {child.known ? <AscendancyIcon game={game} ascendancy={child.name} size={22} /> : null}
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
