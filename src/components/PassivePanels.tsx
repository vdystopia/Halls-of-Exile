import { keystoneIcon, type KeystoneIcon } from "@/lib/games/keystones";
import type { GameId } from "@/lib/games/types";
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

/** A section's label: the eyebrow, in bold fuchsia so the eye finds it in a long column. */
function Label({ children }: { children: string }) {
  return <p className="eyebrow mb-1.5 font-bold text-fuchsia-500">{children}</p>;
}

function NameList({ title, names }: { title: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <div>
      <Label>{title}</Label>
      <p className="text-sm leading-relaxed text-parchment/85">
        {tally(names)
          .map((entry) => (entry.count > 1 ? `${entry.name} ×${entry.count}` : entry.name))
          .join(" · ")}
      </p>
    </div>
  );
}

/** How wide a framed keystone is drawn, in CSS pixels. */
const KEYSTONE_SIZE = 72;

/**
 * A keystone as the game draws it: the picture inside the frame's window, its
 * corners tucked under the carved ring. Two layers, the frame on top; the
 * picture is drawn a little wider than the window so no gap shows at its edge.
 */
function FramedKeystone({ icon }: { icon: KeystoneIcon }) {
  const picture = Math.round(KEYSTONE_SIZE * icon.frame.window * 1.12);
  return (
    <span aria-hidden className="relative block" style={{ width: KEYSTONE_SIZE, height: KEYSTONE_SIZE }}>
      <span
        className="absolute rounded-sm"
        style={{
          width: picture,
          height: picture,
          left: (KEYSTONE_SIZE - picture) / 2,
          top: (KEYSTONE_SIZE - picture) / 2,
          backgroundImage: `url(${icon.src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <span
        className="absolute inset-0"
        style={{ backgroundImage: `url(${icon.frame.src})`, backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}
      />
    </span>
  );
}

/**
 * Keystones with their icons, two to a row, the name above the picture. A
 * keystone the index has no icon for keeps its place with the name alone.
 */
function Keystones({ game, names }: { game: GameId; names: string[] }) {
  if (!names.length) return null;
  return (
    <div>
      <Label>Keystones</Label>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-3">
        {tally(names).map((entry) => {
          const icon = keystoneIcon(game, entry.name);
          return (
            <li key={entry.name} className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-sm leading-tight text-parchment/85">
                {entry.name}
                {entry.count > 1 ? <span className="ml-1 text-muted">×{entry.count}</span> : null}
              </span>
              {icon ? <FramedKeystone icon={icon} /> : null}
            </li>
          );
        })}
      </ul>
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
 * effect actually taken rather than the node's name, in alphabetical order of
 * the mastery so the six Life Masteries sit together.
 */
export function PassivePanel({ game, passives }: { game: GameId; passives: PassiveDetail }) {
  const { keystones, ascendancyNotables, bloodlineNodes, masteries, notables, tattoos } = passives;
  const anything =
    keystones.length ||
    ascendancyNotables.length ||
    bloodlineNodes.length ||
    masteries.length ||
    notables.length ||
    tattoos.length;
  if (!anything) return null;

  const masteryLines = tally(masteries.map((mastery) => `${mastery.name}\u0000${mastery.effect}`))
    .map((entry) => {
      const [name, effect] = entry.name.split("\u0000");
      return { name, effect, count: entry.count };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.effect.localeCompare(b.effect));

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Allocated</h2>
        {passives.variant === "alternate" ? <span className="text-xs text-muted">event tree</span> : null}
      </div>
      <div className="space-y-4 p-4">
        <Keystones game={game} names={keystones} />
        <NameList title="Ascendancy" names={ascendancyNotables} />
        <NameList title="Bloodline" names={bloodlineNodes} />
        {masteryLines.length ? (
          <div>
            <Label>Masteries</Label>
            <ul className="space-y-1 text-sm">
              {masteryLines.map((line) => (
                <li key={`${line.name}\u0000${line.effect}`} className="leading-snug">
                  <span className="text-aubergine">{line.name}</span>
                  <span className="mx-1.5 text-muted">·</span>
                  <span className="text-parchment/85">{line.effect}</span>
                  {line.count > 1 ? <span className="ml-1.5 text-muted">×{line.count}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <NameList title="Tattoos" names={tattoos} />
        <NameList title="Notables" names={notables} />
      </div>
    </section>
  );
}
