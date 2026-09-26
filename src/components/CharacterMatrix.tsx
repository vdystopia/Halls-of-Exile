"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TIER_LABELS, type Tier } from "@/lib/tier";

/** One row, already resolved on the server: nothing here reads the database or a game module. */
export type MatrixRow = {
  id: number;
  href: string;
  name: string;
  game: string;
  gameName: string;
  leagueTitle: string;
  classLine: string;
  level: number | null;
  skill: string | null;
  played: string | null;
  tier: Tier;
  missing: string[];
  failed: boolean;
};

const TIERS: Tier[] = [1, 2, 3];

const TIER_TONE: Record<Tier, string> = {
  1: "border-gold/60 text-gold-bright",
  2: "border-forest/60 text-forest",
  3: "border-line-strong text-muted",
};

/**
 * Every character a player has, one row each, with its tier and what still
 * keeps it out of a better one. Filters by tier and failed mark run in the
 * browser, the way the league index's do: nothing here is worth a round trip.
 *
 * Rows are divs with an empty overlay link, so a browser that underlines every
 * link underlines nothing in the table (`PlayerTile` says why).
 */
export function CharacterMatrix({ rows }: { rows: MatrixRow[] }) {
  const [tiers, setTiers] = useState<Set<Tier>>(new Set(TIERS));
  const [hideFailed, setHideFailed] = useState(false);
  const [game, setGame] = useState<string>("");

  const games = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) seen.set(row.game, row.gameName);
    return [...seen.entries()];
  }, [rows]);

  const counts = useMemo(() => {
    const byTier: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
    let failed = 0;
    for (const row of rows) {
      byTier[row.tier] += 1;
      if (row.failed) failed += 1;
    }
    return { byTier, failed };
  }, [rows]);

  const shown = rows.filter(
    (row) => tiers.has(row.tier) && (!hideFailed || !row.failed) && (!game || row.game === game),
  );

  const toggleTier = (tier: Tier) => {
    setTiers((was) => {
      const next = new Set(was);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-3 text-xs">
        {TIERS.map((tier) => (
          <label key={tier} className="flex cursor-pointer items-center gap-2 text-muted">
            <input type="checkbox" checked={tiers.has(tier)} onChange={() => toggleTier(tier)} className="accent-[#c8aa6e]" />
            <span className={`tag ${TIER_TONE[tier]}`}>{TIER_LABELS[tier]}</span>
            <span className="tabular-nums">{counts.byTier[tier]}</span>
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-2 text-muted">
          <input type="checkbox" checked={hideFailed} onChange={(event) => setHideFailed(event.target.checked)} className="accent-[#c8aa6e]" />
          Hide failed <span className="tabular-nums">({counts.failed})</span>
        </label>
        {games.length > 1 ? (
          <select value={game} onChange={(event) => setGame(event.target.value)} className="input w-auto py-1 text-xs">
            <option value="">Both games</option>
            {games.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <span className="ml-auto text-muted">
          {shown.length} of {rows.length}
        </span>
      </div>

      <div className="hidden grid-cols-[6rem_minmax(10rem,1.4fr)_minmax(10rem,1.6fr)_minmax(8rem,1fr)_3.5rem_minmax(7rem,1fr)_5.5rem_minmax(9rem,1.2fr)] gap-x-4 border-b border-line px-4 py-2 text-[0.68rem] tracking-[0.16em] text-muted uppercase md:grid">
        <span>Tier</span>
        <span>Name</span>
        <span>League</span>
        <span>Class</span>
        <span className="text-right">Level</span>
        <span>Skill</span>
        <span className="text-right">/played</span>
        <span>Still missing</span>
      </div>

      <div className="divide-y divide-line">
        {shown.map((row) => (
          <div
            key={row.id}
            className={`relative grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.03] md:grid-cols-[6rem_minmax(10rem,1.4fr)_minmax(10rem,1.6fr)_minmax(8rem,1fr)_3.5rem_minmax(7rem,1fr)_5.5rem_minmax(9rem,1.2fr)] md:items-center ${
              row.failed ? "opacity-70" : ""
            }`}
          >
            <Link href={row.href} aria-label={row.name} className="absolute inset-0" />
            <span>
              <span className={`tag ${TIER_TONE[row.tier]}`}>Tier {row.tier}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-parchment">{row.name}</span>
              {row.failed ? <span className="tag border-life/50 text-life">failed</span> : null}
            </span>
            <span className="truncate text-aubergine md:col-auto">{row.leagueTitle}</span>
            <span className="truncate text-parchment/80">{row.classLine}</span>
            <span className="text-right text-parchment/80 tabular-nums">{row.level ?? "—"}</span>
            <span className="truncate text-rarity-gem">{row.skill ?? <span className="text-muted">—</span>}</span>
            <span className="text-right text-parchment/80 tabular-nums">{row.played ?? <span className="text-muted">—</span>}</span>
            <span className="truncate text-xs text-muted">{row.missing.length ? row.missing.join(", ") : ""}</span>
          </div>
        ))}
        {shown.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">Nothing matches those filters.</p> : null}
      </div>
    </div>
  );
}
