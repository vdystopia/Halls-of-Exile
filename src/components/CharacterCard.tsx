import Link from "next/link";
import { classLine } from "@/lib/format";
import { formatNumber } from "@/lib/stats";
import type { Character } from "@/lib/types";

export function characterHighlights(character: Character) {
  const stats = character.data.stats ?? {};
  const dps = stats.FullDPS ?? stats.CombinedDPS ?? stats.TotalDPS;
  return [
    stats.Life ? { label: "Life", value: formatNumber(stats.Life), tone: "text-life" } : null,
    stats.EnergyShield ? { label: "ES", value: formatNumber(stats.EnergyShield), tone: "text-es" } : null,
    dps ? { label: "DPS", value: formatNumber(dps), tone: "text-gold-bright" } : null,
  ].filter((entry): entry is { label: string; value: string; tone: string } => entry !== null);
}

export function CharacterCard({
  character,
  href,
  meta,
}: {
  character: Character;
  href: string;
  meta?: string;
}) {
  const highlights = characterHighlights(character);

  return (
    <Link href={href} className="panel group flex flex-col justify-between p-4 transition-colors hover:border-gold/60">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="display text-lg leading-tight group-hover:text-gold-bright">{character.name}</h3>
          {character.isFavorite ? <span className="text-gold">★</span> : null}
        </div>
        <p className="mt-1 text-sm text-muted">
          {character.level ? `Level ${character.level} ` : ""}
          {classLine(character.className, character.ascendancy)}
        </p>
        {meta ? <p className="mt-2 text-[0.68rem] tracking-[0.16em] text-gold/70 uppercase">{meta}</p> : null}
        {character.mainSkill ? (
          <p className="mt-3 text-sm text-rarity-gem">{character.mainSkill}</p>
        ) : null}
        {character.notes ? (
          <p className="mt-3 line-clamp-2 text-xs text-parchment/60 italic">{character.notes}</p>
        ) : null}
      </div>
      {highlights.length ? (
        <dl className="mt-4 flex gap-5 border-t border-line pt-3">
          {highlights.map((stat) => (
            <div key={stat.label}>
              <dt className="eyebrow">{stat.label}</dt>
              <dd className={`font-display text-base tabular-nums ${stat.tone}`}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted/60">
          {character.data.source === "pob" ? "No stats recorded" : "Hand-written entry"}
        </p>
      )}
    </Link>
  );
}
