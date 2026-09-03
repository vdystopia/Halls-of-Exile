import {
  ATTRIBUTE_STATS,
  CHARGE_STATS,
  formatStat,
  RESISTANCES,
  resolvePanel,
  resolvePanels,
  type StatPanel,
  type StatTone,
} from "@/lib/stats";

const TONE_CLASS: Record<StatTone, string> = {
  life: "text-life",
  mana: "text-mana",
  es: "text-es",
  gold: "text-gold-bright",
  danger: "text-life",
  plain: "text-parchment",
};

export function StatColumn({
  title,
  panels,
  stats,
}: {
  title: string;
  panels: StatPanel[];
  stats: Record<string, number>;
}) {
  const resolved = resolvePanels(stats, panels);
  if (!resolved.length) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{title}</h2>
      </div>
      {resolved.map((panel) => (
        <div key={panel.title} className="border-b border-line/70 py-1 last:border-b-0">
          <p className="px-4 pt-2 pb-1 text-[0.68rem] tracking-[0.18em] text-muted/70 uppercase">{panel.title}</p>
          {panel.rows.map((row) => (
            <div key={row.key} className="stat-row">
              <span className="stat-label">{row.label}</span>
              <span className={`stat-value ${TONE_CLASS[row.tone]}`}>{row.text}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export function ResistanceBar({ stats }: { stats: Record<string, number> }) {
  const rows = RESISTANCES.map((res) => ({
    ...res,
    value: stats[res.key],
    over: stats[`${res.key}OverCap`],
  })).filter((row) => row.value !== undefined);

  if (!rows.length) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Resistances</h2>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line/60 sm:grid-cols-4">
        {rows.map((row) => (
          <div key={row.key} className="bg-surface px-4 py-3 text-center">
            <p className="text-[0.62rem] tracking-[0.06em] text-muted uppercase">{row.label}</p>
            <p className={`font-display text-lg ${row.tone}`}>{Math.round(row.value!)}%</p>
            {row.over ? <p className="text-[0.68rem] text-muted">+{Math.round(row.over)}% over cap</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function AttributeStrip({ stats }: { stats: Record<string, number> }) {
  const attributes = resolvePanel(stats, ATTRIBUTE_STATS);
  const charges = resolvePanel(stats, CHARGE_STATS);
  if (!attributes.length && !charges.length) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Attributes &amp; charges</h2>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 text-sm">
        {[...attributes, ...charges].map((row) => (
          <span key={row.key} className="flex items-baseline gap-2">
            <span className="text-muted">{row.label}</span>
            <span className="font-display text-parchment tabular-nums">{row.text}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function AllStatsTable({ stats }: { stats: Record<string, number> }) {
  const entries = Object.entries(stats).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return null;

  return (
    <div className="grid grid-cols-1 gap-x-8 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline justify-between gap-4 border-b border-line/50 py-1 text-xs">
          <span className="font-mono text-muted">{key}</span>
          <span className="tabular-nums">{formatStat(value, Number.isInteger(value) ? "int" : "dec2")}</span>
        </div>
      ))}
    </div>
  );
}
