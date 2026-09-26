/**
 * How a computed stat is shown, the same in both games: Path of Building and
 * Path of Building 2 write their figures under the same keys and in the same
 * units. Which stats a game's panels hold is the game's own (`poe1/stats.ts`,
 * `poe2/stats.ts`); formatting and resolving them is not.
 */
export type StatFormat = "int" | "big" | "pct" | "pct2" | "dec2" | "multi" | "rate" | "sec";
export type StatTone = "life" | "mana" | "es" | "gold" | "danger" | "plain";

export type StatDef = {
  key: string;
  label: string;
  format: StatFormat;
  tone?: StatTone;
};

export type StatPanel = {
  title: string;
  stats: StatDef[];
};

export function formatNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 100_000) return `${Math.round(value / 1_000)}k`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (abs >= 100) return Math.round(value).toLocaleString("en-US");
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toFixed(2);
}

export function formatStat(value: number, format: StatFormat): string {
  switch (format) {
    case "big":
      return formatNumber(value);
    case "pct":
      return `${Math.round(value)}%`;
    case "pct2":
      return `${value.toFixed(2)}%`;
    case "dec2":
      return value.toFixed(2);
    case "multi":
      // PoB stores crit multiplier either as a multiplier (3.5) or a percent (350).
      return value < 20 ? `${value.toFixed(2)}x` : `${Math.round(value)}%`;
    case "rate":
      return `${formatNumber(value)}/s`;
    case "sec":
      return `${value.toFixed(2)}s`;
    case "int":
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

export type ResolvedStat = { key: string; label: string; text: string; tone: StatTone };

/** Keep only the stats a build actually reports, in the order the panel defines. */
export function resolvePanel(stats: Record<string, number>, defs: StatDef[]): ResolvedStat[] {
  const seen = new Set<string>();
  const out: ResolvedStat[] = [];
  for (const def of defs) {
    const value = stats[def.key];
    if (value === undefined || value === 0 || seen.has(def.label)) continue;
    seen.add(def.label);
    out.push({ key: def.key, label: def.label, text: formatStat(value, def.format), tone: def.tone ?? "plain" });
  }
  return out;
}

export function resolvePanels(stats: Record<string, number>, panels: StatPanel[]) {
  return panels
    .map((panel) => ({ title: panel.title, rows: resolvePanel(stats, panel.stats) }))
    .filter((panel) => panel.rows.length > 0);
}

/** Human-readable fallback label for stats not in the curated panels. */
export function humanizeStatKey(key: string): string {
  return key
    .replace(/^Spec:/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bDPS\b/i, "DPS")
    .replace(/^./, (character) => character.toUpperCase());
}
