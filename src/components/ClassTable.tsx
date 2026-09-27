"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { CLASS_SORT_DEFAULT, sortClassRows, type ClassSortColumn, type ClassSortDirection } from "@/lib/class-sort";

/** One row of the class table, resolved on the server: its figures, its colours and its emblem. */
export type ClassRow = {
  name: string;
  known: boolean;
  /** The name's gem fill, from `classNameStyle`; undefined for an unknown ascendancy. */
  nameStyle?: CSSProperties;
  /** The /played bar's fill: the class's own gradient, the one its name is written in. */
  bar: string;
  /** The ascendancy's emblem, drawn on the server; none for a class row. */
  icon?: ReactNode;
  characters: number;
  leagues: number;
  playedMinutes: number;
  /** The /played figure as shown, or null when none is recorded. */
  played: string | null;
  playedRecorded: number;
  averageLevel: number | null;
  highestLevel: number | null;
  children: ClassRow[];
};

/**
 * One grid for the header, every class and every ascendancy, so the columns
 * line up through the nesting. The column set follows the table's own width
 * (a container query): under 28rem it keeps class, /played and characters,
 * from 28rem it adds average level, and leagues and highest wait for 42rem.
 */
const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_5.5rem_2.5rem] @md:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_4.5rem] @2xl:grid-cols-[minmax(11rem,1.5fr)_minmax(8rem,1fr)_5.5rem_4.5rem_5rem_4.5rem] items-center gap-x-4";
const WIDE = "hidden @2xl:block";
const MID = "hidden @md:block";

function SortButton({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: ClassSortColumn;
  sort: { column: ClassSortColumn; direction: ClassSortDirection };
  onSort: (column: ClassSortColumn) => void;
  className?: string;
}) {
  const active = sort.column === column;
  const state = active ? ` (sorted ${sort.direction === "asc" ? "ascending" : "descending"})` : "";
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}${state}`}
      className={`flex items-center gap-1 text-[0.68rem] tracking-[0.16em] uppercase whitespace-nowrap transition-colors ${
        active ? "text-gold" : "text-muted hover:text-parchment/80"
      } ${className}`}
    >
      {label}
      <span aria-hidden className="font-mono text-[10px] leading-none">
        {active ? (sort.direction === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );
}

function Played({ row, total }: { row: ClassRow; total: number }) {
  const coverage =
    row.playedRecorded < row.characters
      ? `recorded for ${row.playedRecorded} of ${row.characters} characters`
      : `recorded for every character`;
  // The figure sits centred over its bar, and the bar is the class's own colour.
  return (
    <div title={coverage} className="min-w-0 text-center">
      <span className="tabular-nums">{row.played ?? "—"}</span>
      {row.playedRecorded < row.characters && row.played ? <span className="text-muted">*</span> : null}
      {/* Share of the player's whole /played in this game. */}
      <div className="mt-1 hidden h-1 overflow-hidden rounded-full bg-white/5 @md:block">
        <div className="h-full rounded-full" style={{ width: `${total ? (row.playedMinutes / total) * 100 : 0}%`, background: row.bar }} />
      </div>
    </div>
  );
}

function Cells({ row, total }: { row: ClassRow; total: number }) {
  return (
    <>
      <Played row={row} total={total} />
      <span className="text-right tabular-nums">{row.characters}</span>
      <span className={`${WIDE} text-right tabular-nums`}>{row.leagues}</span>
      <span className={`${MID} text-right tabular-nums`}>{row.averageLevel === null ? "—" : row.averageLevel.toFixed(1)}</span>
      <span className={`${WIDE} text-right tabular-nums`}>{row.highestLevel ?? "—"}</span>
    </>
  );
}

/**
 * A player's characters by class, opening into ascendancies, sortable by every
 * column both ways. It starts sorted by /played, longest first; a class's
 * ascendancies sort by the same column. Rows are `<details>`, so every class
 * can be open at once. Sorting runs in the browser, the way the league index
 * sorts: nothing here is worth a round trip.
 */
export function ClassTable({ rows }: { rows: ClassRow[] }) {
  const [sort, setSort] = useState<{ column: ClassSortColumn; direction: ClassSortDirection }>({ column: "played", direction: "desc" });
  const onSort = (column: ClassSortColumn) =>
    setSort((was) =>
      was.column === column ? { column, direction: was.direction === "asc" ? "desc" : "asc" } : { column, direction: CLASS_SORT_DEFAULT[column] },
    );
  const total = rows.reduce((sum, row) => sum + row.playedMinutes, 0);
  const sorted = sortClassRows(rows, sort.column, sort.direction);

  return (
    <div className="panel @container overflow-hidden text-sm">
      <div className={`${COLUMNS} border-b border-line px-4 py-2.5`}>
        <SortButton label="Class" column="class" sort={sort} onSort={onSort} />
        <SortButton label="/played" column="played" sort={sort} onSort={onSort} className="justify-center" />
        <SortButton label="Characters" column="characters" sort={sort} onSort={onSort} className="justify-end" />
        <SortButton label="Leagues" column="leagues" sort={sort} onSort={onSort} className={`${WIDE} justify-end`} />
        <SortButton label="Avg level" column="averageLevel" sort={sort} onSort={onSort} className={`${MID} justify-end`} />
        <SortButton label="Highest" column="highestLevel" sort={sort} onSort={onSort} className={`${WIDE} justify-end`} />
      </div>
      {sorted.map((row) => (
        <details key={row.name} className="group border-b border-line last:border-b-0">
          <summary className={`${COLUMNS} cursor-pointer list-none px-4 py-3 hover:bg-white/[0.02] [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-[0.6rem] text-muted transition-transform group-open:rotate-90">▶</span>
              <span className={`font-display truncate text-base tracking-wide ${row.nameStyle ? "gem-name" : "text-muted"}`} style={row.nameStyle}>
                {row.name}
              </span>
            </span>
            <Cells row={row} total={total} />
          </summary>
          <div className="bg-black/20 pb-1">
            {sortClassRows(row.children, sort.column, sort.direction).map((child) => (
              <div key={child.name} className={`${COLUMNS} px-4 py-2 text-parchment/85`}>
                <span className="flex min-w-0 items-center gap-2 pl-6">
                  {child.icon}
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
