import Link from "next/link";
import { AscendancyPortrait } from "@/components/AscendancyPortrait";
import { ascendancyAvatar } from "@/lib/games/ascendancy";
import { LeagueLogo } from "@/components/LeagueLogo";
import { SkillIcon } from "@/components/SkillIcon";
import { classLine, formatPlayed } from "@/lib/format";
import { classNameStyle } from "@/lib/games/class-colors";
import { buildSkill, skillArt, skillTagClass } from "@/lib/games/skills";
import { leagueModifierClass, leagueModifierLabel, leagueModifierTitle } from "@/lib/league-modifiers";
import type { PlayerCharacter } from "@/lib/queries";

/** The banner's picture height: the avatar at left and the league logo at right share it. */
const HEIGHT = 96;

/**
 * The character page's header, compressed into a card for a list: the avatar,
 * the class-coloured name, level and class, the skill gem; then the league and
 * /played, and the league's logo closing it on the right. The same rules as the
 * header — only a named gem is shown as the skill, never the record's prose —
 * and the avatar rather than the wide portrait, which at this height would be
 * mostly background.
 *
 * A server component: the gem art index must not reach the browser.
 */
export function CharacterBanner({
  character,
  href,
}: {
  character: PlayerCharacter;
  href: string;
}) {
  const { game } = character;
  const skill = buildSkill(game, character.skillGem, character.mainSkill);
  const art = skill ? skillArt(game, skill) : null;
  const nameStyle = classNameStyle(game, character.className);
  const played = formatPlayed(character.playedMinutes);
  // The banner's border takes its picture's strongest colour, as the profile
  // header takes the player's; a picture with no colour, or none, keeps the line.
  const accent = ascendancyAvatar(game, character.ascendancy, character.className)?.accent ?? null;

  return (
    <Link
      href={href}
      className="panel group flex flex-wrap items-center gap-x-5 gap-y-3 p-3 transition-colors hover:border-gold/60"
      style={accent ? { borderColor: accent } : undefined}
    >
      <AscendancyPortrait game={game} ascendancy={character.ascendancy} characterClass={character.className} height={HEIGHT} variant="avatar" framed />
      <div className="min-w-[11rem] flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className={`display truncate text-2xl ${nameStyle ? "gem-name" : ""}`} style={nameStyle}>
            {character.name}
          </h3>
          {character.isFavorite ? <span className="text-gold">★</span> : null}
        </div>
        <p className="mt-0.5 text-parchment/80">
          {`Level ${character.level ?? "Unknown"} · `}
          {classLine(character.className, character.ascendancy)}
        </p>
        {skill ? (
          <div className="mt-2 flex items-center gap-2">
            <SkillIcon src={art?.src} name={skill} frames={art?.frames} size={28} />
            <span className={`tag ${skillTagClass(game, skill)}`}>{skill}</span>
          </div>
        ) : null}
      </div>
      {/* Beside the name when there is room, a row of their own beneath it on a phone. */}
      <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
        <span className="tag">{character.leagueTitle}</span>
        {/* Which variant of the league it was played in, coloured as on the character page. */}
        {character.leagueModifiers.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {character.leagueModifiers.map((modifier) => (
              <span key={modifier} className={`tag ${leagueModifierClass(modifier)}`} title={leagueModifierTitle(modifier)}>
                {leagueModifierLabel(modifier)}
              </span>
            ))}
          </div>
        ) : null}
        {played ? <span className="tag">/played {played}</span> : null}
      </div>
      <LeagueLogo
        league={{ game, slug: character.leagueSlug, name: character.leagueName }}
        height={HEIGHT}
        className="hidden sm:block"
      />
    </Link>
  );
}
