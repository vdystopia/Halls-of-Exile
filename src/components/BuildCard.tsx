import { SkillIcon } from "@/components/SkillIcon";
import { formatPlayed } from "@/lib/format";
import type { GemArt } from "@/lib/games/poe1/gems";
import type { Rollup } from "@/lib/metrics";

/**
 * One skill a player built around, with the hours it got. The gem picture is
 * resolved by the caller on the server, as it is for the character header; a
 * skill recorded only as prose has no picture and is drawn without one.
 */
export function BuildCard({ build, art, rank }: { build: Rollup; art: GemArt | null; rank: number }) {
  const played = formatPlayed(build.playedMinutes);
  return (
    <div className="panel flex flex-col justify-between p-4">
      <div className="flex items-start gap-3">
        <SkillIcon src={art?.src} name={build.name} frames={art?.frames} size={44} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">#{rank}</p>
          <h3 className="mt-1 truncate text-lg leading-tight text-rarity-gem" title={build.name}>
            {build.name}
          </h3>
          <p className="mt-1 truncate text-sm text-muted" title={build.classes.join(", ")}>
            {build.classes.slice(0, 3).join(" · ")}
            {build.classes.length > 3 ? ` +${build.classes.length - 3}` : ""}
          </p>
        </div>
      </div>
      <dl className="mt-4 flex gap-5 border-t border-line pt-3">
        {[
          {
            label: "/played",
            // A partial total is marked, as in the class table.
            value:
              played && build.playedRecorded < build.characters ? (
                <span title={`recorded for ${build.playedRecorded} of ${build.characters} characters`}>
                  {played}
                  <span className="text-muted">*</span>
                </span>
              ) : (
                (played ?? "—")
              ),
          },
          { label: build.characters === 1 ? "Character" : "Characters", value: build.characters },
          { label: "Avg level", value: build.averageLevel === null ? "—" : build.averageLevel.toFixed(0) },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="eyebrow">{stat.label}</dt>
            <dd className="font-display text-base text-gold-bright tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
