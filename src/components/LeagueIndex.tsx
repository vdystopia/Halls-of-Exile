"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  challengeFraction,
  compareDates,
  compareNumbers,
  comparePatches,
  isLeagueRunning,
  leagueLabel,
  leagueWindow,
} from "@/lib/format";
import type { LeagueWithProgress } from "@/lib/types";
import { ChallengeMeter } from "./ChallengeMeter";

type Column = "game" | "patch" | "league" | "characters" | "best" | "challenges";
type Direction = "asc" | "desc";

/** A league record can override the catalogue's own challenge count. */
function challengeTotal(league: LeagueWithProgress): number | null {
  return league.challengeTotalOverride ?? league.challengeTotal;
}

/**
 * The catalogue's own order is by start date, newest first — that is what
 * `sort_order` holds and what the page arrives sorted by — so the League column
 * descending is the order the table opens in rather than a fourth state to get
 * back to. Sorting that column is sorting by date, not by name: the cell shows
 * a league and its window, an event sorts beside the league it ran inside, and
 * alphabetical order would break exactly that.
 */
const DEFAULT_SORT = { column: "league" as Column, direction: "desc" as Direction };

function gameNumber(game: string): string {
  return game === "poe2" ? "2" : "1";
}

/**
 * A column's filter: tick nothing and the column is unfiltered, which is what
 * "all" means. Kept as the set of *included* values rather than excluded ones,
 * so a league added to the catalogue later shows up instead of being silently
 * filtered out by a set written before it existed.
 */
function FilterMenu({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // A dropdown that stays open when you click away from it reads as stuck.
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
        className={`w-full rounded-sm border px-2 py-0.5 text-left font-mono text-[11px] lowercase transition-colors ${
          selected.size
            ? "border-gold/60 text-gold"
            : "border-line text-muted hover:border-line/80 hover:text-parchment/70"
        }`}
      >
        {selected.size ? `${selected.size} of ${options.length}` : "all"}
      </button>
      {open ? (
        <div className="absolute top-full left-0 z-20 mt-1 max-h-64 min-w-40 overflow-y-auto rounded-sm border border-line bg-surface-2 p-1 shadow-lg shadow-black/60">
          {selected.size ? (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="mb-1 block w-full rounded-sm px-2 py-1 text-left text-[11px] text-muted hover:bg-white/[0.05] hover:text-parchment"
            >
              clear
            </button>
          ) : null}
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-xs whitespace-nowrap text-parchment/85 hover:bg-white/[0.05]"
            >
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                className="accent-[#c8aa6e]"
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SortButton({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: Column;
  sort: { column: Column; direction: Direction };
  onSort: (column: Column) => void;
  className?: string;
}) {
  const active = sort.column === column;
  // The direction goes in the accessible name rather than `aria-sort`, which
  // belongs on a columnheader — these are buttons in a grid of links, not a
  // table, and claiming a role the markup does not have helps nobody.
  const state = active ? ` (sorted ${sort.direction === "asc" ? "ascending" : "descending"})` : "";
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}${state}`}
      className={`flex items-center gap-1 text-[11px] tracking-[0.18em] uppercase transition-colors ${
        active ? "text-gold" : "text-muted hover:text-parchment/80"
      } ${className}`}
    >
      {label}
      <span aria-hidden className="font-mono text-[9px] leading-none">
        {active ? (sort.direction === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </button>
  );
}

/**
 * Every league in the catalogue, sortable and filterable by game, patch and
 * league.
 *
 * A client component because the sorting and the filtering are the point, and
 * neither is worth a round trip to the server or a URL that has to carry three
 * multi-selects. The rows arrive already read and already ordered; nothing here
 * touches the database.
 */
export function LeagueIndex({
  username,
  leagues,
}: {
  username: string;
  leagues: LeagueWithProgress[];
}) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [games, setGames] = useState<Set<string>>(new Set());
  const [patches, setPatches] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Set<string>>(new Set());

  // Built from what is actually in the table, so a filter can never offer a
  // value that would empty it.
  const gameOptions = [...new Set(leagues.map((league) => league.game))]
    .sort()
    .map((game) => ({ value: game, label: `Path of Exile ${gameNumber(game)}` }));
  const patchOptions = [...new Set(leagues.map((league) => league.patch ?? ""))]
    .sort((a, b) => comparePatches(a || null, b || null))
    .map((patch) => ({ value: patch, label: patch || "###" }));
  const nameOptions = [...new Set(leagues.map((league) => leagueLabel(league)))]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }));

  const onSort = (column: Column) => {
    setSort((was) =>
      was.column === column
        ? { column, direction: was.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );
  };

  const shown = leagues
    .filter((league) => !games.size || games.has(league.game))
    .filter((league) => !patches.size || patches.has(league.patch ?? ""))
    .filter((league) => !names.size || names.has(leagueLabel(league)))
    .slice()
    .sort((a, b) => {
      // The direction is handed to the comparators rather than applied over the
      // top of them, so a row with no patch or no known dates stays at the
      // bottom instead of rising to the top when the column is reversed.
      const order = sort.direction === "asc" ? 1 : -1;
      // Ties fall back to the date, in the same direction. Several rows share a
      // patch — three events sit inside 3.25, and both closed beta rounds are
      // 0.0 — and leaving those in whatever order they arrived put round 2
      // above round 1 in an ascending sort.
      const byDate = compareDates(a.startDate, b.startDate, order);
      if (sort.column === "game") {
        const byGame = order * (a.game < b.game ? -1 : a.game > b.game ? 1 : 0);
        return byGame || comparePatches(a.patch, b.patch, order) || byDate;
      }
      if (sort.column === "patch") return comparePatches(a.patch, b.patch, order) || byDate;
      if (sort.column === "characters") {
        return compareNumbers(a.characterCount, b.characterCount, order) || byDate;
      }
      if (sort.column === "best") return compareNumbers(a.maxLevel, b.maxLevel, order) || byDate;
      if (sort.column === "challenges") {
        // By how far through they got, not by how many were done: the total has
        // ranged from 8 to 40 over the years, so 7 of 8 beats 20 of 40. A tie
        // goes to the bigger league, which is what separates 40/40 from 8/8.
        return (
          compareNumbers(
            challengeFraction(a.challengesCompleted, challengeTotal(a)),
            challengeFraction(b.challengesCompleted, challengeTotal(b)),
            order,
          ) ||
          compareNumbers(challengeTotal(a), challengeTotal(b), order) ||
          byDate
        );
      }
      return byDate || a.name.localeCompare(b.name);
    });

  const filtered = games.size || patches.size || names.size;

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start gap-4 border-b border-line px-4 py-3">
        <div className="w-14 shrink-0 space-y-1">
          <SortButton label="Game" column="game" sort={sort} onSort={onSort} />
          <FilterMenu label="game" options={gameOptions} selected={games} onChange={setGames} />
        </div>
        <div className="w-20 shrink-0 space-y-1">
          <SortButton label="Patch" column="patch" sort={sort} onSort={onSort} />
          <FilterMenu label="patch" options={patchOptions} selected={patches} onChange={setPatches} />
        </div>
        <div className="min-w-[14rem] flex-1 space-y-1">
          <SortButton label="League" column="league" sort={sort} onSort={onSort} />
          {/* Narrow like the other two rather than as wide as the column it
              heads: it is a control, and stretching it to fourteen rems only
              makes the word "all" sit in a lot of empty box. */}
          <div className="w-28">
            <FilterMenu label="league" options={nameOptions} selected={names} onChange={setNames} />
          </div>
        </div>
        <div className="w-28 shrink-0">
          <SortButton label="Characters" column="characters" sort={sort} onSort={onSort} />
        </div>
        <div className="w-20 shrink-0">
          <SortButton label="Best" column="best" sort={sort} onSort={onSort} />
        </div>
        <div className="w-32 shrink-0">
          <SortButton label="Challenges" column="challenges" sort={sort} onSort={onSort} />
        </div>
      </div>

      <div className="divide-y divide-line">
        {shown.map((league) => {
          const total = challengeTotal(league);
          const empty = league.characterCount === 0;
          const running = isLeagueRunning(league.startDate, league.endDate);
          return (
            <Link
              key={league.id}
              href={`/players/${username}/${league.game}/${league.slug}`}
              className={`flex flex-wrap items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.03] ${
                empty ? "opacity-55" : ""
              }`}
            >
              <span className="w-14 shrink-0 font-display text-lg text-gold/70 tabular-nums">
                {gameNumber(league.game)}
              </span>
              {/* The patch has a column of its own now, so the name beside it
                  does not repeat it — that is `leagueLabel` rather than
                  `leagueTitle`. */}
              <span className="w-20 shrink-0 font-mono text-sm text-aubergine tabular-nums">
                {league.patch ?? "###"}
              </span>
              <span className="min-w-[14rem] flex-1">
                <span className="flex items-baseline gap-2 font-display text-base text-aubergine">
                  {leagueLabel(league)}
                  {running ? <span className="tag border-gold/50 text-gold">live</span> : null}
                </span>
                <span className="block text-xs text-forest">
                  {leagueWindow(league.startDate, league.endDate, Boolean(league.endDateEstimated))}
                  {league.endDateEstimated ? " · end date tentative" : ""}
                </span>
              </span>
              <span className="w-28 shrink-0 text-sm text-muted">
                {league.characterCount > 0
                  ? `${league.characterCount} character${league.characterCount === 1 ? "" : "s"}`
                  : "no characters"}
              </span>
              <span className="w-20 shrink-0 text-sm text-muted">
                {league.maxLevel ? `lvl ${league.maxLevel}` : ""}
              </span>
              {/* Wide enough for the meter, and with the meter's own label off:
                  the column header already says Challenges, and the two side by
                  side are what pushed "40/40" out of the table. */}
              <span className="w-32 shrink-0">
                <ChallengeMeter completed={league.challengesCompleted} total={total} size="sm" label={false} />
              </span>
            </Link>
          );
        })}
        {shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Nothing matches those filters.
          </p>
        ) : null}
      </div>

      {filtered ? (
        <div className="border-t border-line px-4 py-2 text-xs text-muted">
          Showing {shown.length} of {leagues.length}.{" "}
          <button
            type="button"
            onClick={() => {
              setGames(new Set());
              setPatches(new Set());
              setNames(new Set());
            }}
            className="link-gold"
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </div>
  );
}
