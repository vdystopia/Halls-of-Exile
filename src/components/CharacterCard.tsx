import Link from "next/link";
import { AscendancyIcon } from "@/components/AscendancyIcon";
import { classLine } from "@/lib/format";
import { formatNumber } from "@/lib/games/shared/stats";
import { buildSkill } from "@/lib/games/skills";
import type { GameId } from "@/lib/games/types";
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
  game,
  href,
  meta,
  notes = true,
}: {
  character: Character;
  /** Which game's ascendancy art to draw: two names exist in both, as different classes. */
  game: GameId;
  href: string;
  meta?: string;
  /** The hand-written notes. A short list of highlights leaves them to the character page. */
  notes?: boolean;
}) {
  const highlights = characterHighlights(character);
  // The same answer as the character header and the banner: the skill gem,
  // through one resolver. The card used to print the build words here, which
  // read as a skill and disagreed with the header (the owner, 2026-09-28).
  const skill = buildSkill(game, character.skillGem, character.mainSkill);

  return (
    <Link href={href} className="panel group flex flex-col justify-between p-4 transition-colors hover:border-gold/60">
      <div>
        <div className="flex items-start gap-3">
          <AscendancyIcon game={game} ascendancy={character.ascendancy} characterClass={character.className} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="display text-lg leading-tight group-hover:text-gold-bright">{character.name}</h3>
              {character.isFavorite ? <span className="text-gold">★</span> : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {`Level ${character.level ?? "Unknown"} · `}
              {classLine(character.className, character.ascendancy)}
            </p>
          </div>
        </div>
        {meta ? <p className="mt-2 text-[0.68rem] tracking-[0.16em] text-gold/70 uppercase">{meta}</p> : null}
        {skill ? <p className="mt-3 text-sm text-rarity-gem">{skill}</p> : null}
        {notes && character.notes ? (
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
      ) : null}
    </Link>
  );
}
