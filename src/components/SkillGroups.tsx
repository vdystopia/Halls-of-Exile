import type { SkillGroup } from "@/lib/types";

function gemLine(level: number | null, quality: number | null) {
  const parts: string[] = [];
  if (level !== null) parts.push(`lvl ${level}`);
  if (quality) parts.push(`${quality}%`);
  return parts.join(" · ");
}

export function SkillGroups({ groups }: { groups: SkillGroup[] }) {
  if (!groups.length) {
    return <p className="px-4 py-3 text-sm text-muted">No gem setup recorded for this character.</p>;
  }

  return (
    <div className="divide-y divide-line">
      {groups.map((group, index) => (
        <div key={index} className={`px-4 py-3 ${group.enabled ? "" : "opacity-45"}`}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className={`font-display text-sm ${group.isMain ? "text-gold-bright" : "text-parchment"}`}>
              {group.label}
              {group.isMain ? <span className="ml-2 tag border-gold/50 text-gold">main</span> : null}
            </span>
            {group.slot ? <span className="text-[0.68rem] text-muted uppercase">{group.slot}</span> : null}
          </div>
          <ul className="space-y-1 text-sm">
            {group.gems.map((gem, gemIndex) => (
              <li
                key={gemIndex}
                className={`flex items-baseline justify-between gap-3 ${gem.enabled ? "" : "line-through opacity-50"}`}
              >
                <span className={gem.support ? "pl-4 text-muted" : "text-rarity-gem"}>{gem.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{gemLine(gem.level, gem.quality)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
