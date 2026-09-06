import { GEM_COLOR_CLASS, gemColor, orderGems } from "@/lib/gems";
import type { Gem, SkillGroup } from "@/lib/types";

function gemLine(level: number | null, quality: number | null) {
  const parts: string[] = [];
  if (level !== null) parts.push(`lvl ${level}`);
  if (quality) parts.push(`${quality}%`);
  return parts.join(" · ");
}

/** The gem's own colour, falling back to the generic gem teal when unknown. */
function nameClass(gem: Gem) {
  const color = gemColor(gem);
  return color ? GEM_COLOR_CLASS[color] : "text-rarity-gem";
}

/**
 * A group's title is Path of Building's label, which is usually empty — the one
 * shown before was the first active gem's name, which listed that gem twice and
 * implied it led the group. Nothing leads a group of four golems, so a label is
 * only shown when the build actually set one.
 */
function groupTitle(group: SkillGroup): string | null {
  const label = group.label?.trim();
  if (!label) return null;
  const isGemName = group.gems.some((gem) => gem.name.trim() === label);
  return isGemName ? null : label;
}

export function SkillGroups({ groups }: { groups: SkillGroup[] }) {
  if (!groups.length) {
    return <p className="px-4 py-3 text-sm text-muted">No gem setup recorded for this character.</p>;
  }

  return (
    <div className="divide-y divide-line">
      {groups.map((group, index) => {
        const title = groupTitle(group);
        return (
          <div key={index} className={`px-4 py-3 ${group.enabled ? "" : "opacity-45"}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {title ? (
                  <span className={`font-display text-sm ${group.isMain ? "text-gold-bright" : "text-parchment"}`}>
                    {title}
                  </span>
                ) : null}
                {group.isMain ? <span className="tag border-gold/50 text-gold">main</span> : null}
              </span>
              {group.slot ? <span className="text-[0.68rem] text-muted uppercase">{group.slot}</span> : null}
            </div>
            <ul className="space-y-1 text-sm">
              {orderGems(group.gems).map((gem, gemIndex) => (
                <li
                  key={gemIndex}
                  className={`flex items-baseline justify-between gap-3 ${gem.enabled ? "" : "line-through opacity-50"}`}
                >
                  <span className={gem.support ? `pl-4 ${nameClass(gem)}` : `font-semibold ${nameClass(gem)}`}>
                    {gem.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{gemLine(gem.level, gem.quality)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
