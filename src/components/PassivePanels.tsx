import type { PassiveDetail } from "@/lib/types";

/**
 * A name can legitimately appear more than once — two cluster jewels rolling
 * the same notable, or a dozen copies of one tattoo — so repeats are counted
 * rather than printed again. A tattooed character otherwise filled the column
 * with forty lines that were the same six names over and over.
 */
function tally(names: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }));
}

function NameList({ title, names }: { title: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <div>
      <p className="eyebrow mb-1.5">{title}</p>
      <p className="text-sm leading-relaxed text-parchment/85">
        {tally(names)
          .map((entry) => (entry.count > 1 ? `${entry.name} ×${entry.count}` : entry.name))
          .join(" · ")}
      </p>
    </div>
  );
}

/**
 * The passives by name. Path of Building's export carries a node list and
 * nothing else, so a build imported from it can only be counted; the game's own
 * character endpoint names every allocated node, which is the one thing a
 * screenshot of a tree could never be searched for.
 *
 * Keystones first, because a build is usually chosen around one or two of them,
 * then the ascendancy, then masteries — which are a choice, so each shows the
 * effect actually taken rather than the node's name.
 */
export function PassivePanel({ passives }: { passives: PassiveDetail }) {
  const { keystones, ascendancyNotables, bloodlineNodes, masteries, notables, tattoos } = passives;
  const anything =
    keystones.length ||
    ascendancyNotables.length ||
    bloodlineNodes.length ||
    masteries.length ||
    notables.length ||
    tattoos.length;
  if (!anything) return null;

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Allocated</h2>
        {passives.variant === "alternate" ? <span className="text-xs text-muted">event tree</span> : null}
      </div>
      <div className="space-y-4 p-4">
        <NameList title="Keystones" names={keystones} />
        <NameList title="Ascendancy" names={ascendancyNotables} />
        <NameList title="Bloodline" names={bloodlineNodes} />
        {masteries.length ? (
          <div>
            <p className="eyebrow mb-1.5">Masteries</p>
            <ul className="space-y-1 text-sm">
              {tally(masteries.map((mastery) => `${mastery.name}\u0000${mastery.effect}`)).map((entry) => {
                const [name, effect] = entry.name.split("\u0000");
                return (
                  <li key={entry.name} className="leading-snug">
                    <span className="text-muted">{name}</span>
                    <span className="mx-1.5 text-muted">·</span>
                    <span className="text-parchment/85">{effect}</span>
                    {entry.count > 1 ? <span className="ml-1.5 text-muted">×{entry.count}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <NameList title="Tattoos" names={tattoos} />
        <NameList title="Notables" names={notables} />
      </div>
    </section>
  );
}
