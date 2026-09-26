import Link from "next/link";
import { PlayerPicture } from "@/components/PlayerPicture";
import { avatarUrl } from "@/lib/avatars";
import { formatPlayedTotal } from "@/lib/format";
import type { UserSummary } from "@/lib/queries";

/**
 * A player on the players list and the front page: their picture with the
 * username beside it, two headline figures on the right, and characters,
 * leagues and /played in a row underneath. The username is the one name a
 * player goes by; there is no display name.
 *
 * Set in the type the rest of the archive uses — `eyebrow` for a label and
 * `display` for a figure — so the tile reads like the profile header it opens.
 */
export function PlayerTile({ player }: { player: UserSummary }) {
  const picture = avatarUrl(player.username, player.avatarVersion);
  // Whole hours, rounded the way the profile header rounds them, so the two agree.
  const played = formatPlayedTotal(player.playedMinutes);
  // A /played total covers only characters that have one; say so rather than
  // passing a partial sum off as the whole.
  const partial = player.playedRecorded < player.characterCount;
  const coverage = partial
    ? `${player.playedRecorded} of ${player.characterCount} characters have a /played recorded`
    : undefined;

  return (
    <Link
      href={`/players/${player.username}`}
      className="panel group block border-gold/45 p-4 transition-colors hover:border-gold sm:p-5"
    >
      <div className="flex gap-4 sm:gap-5">
        <PlayerPicture username={player.username} src={picture} className="size-24 sm:size-36" />
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <h2 className="display min-w-0 pt-1 text-2xl break-words group-hover:text-gold sm:text-3xl">
            {player.username}
          </h2>
          <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-6 gap-y-2 sm:pt-2">
            <dt className="eyebrow whitespace-nowrap">Level 100</dt>
            <dd className="display text-right text-xl tabular-nums">{player.level100s}</dd>
            <dt className="eyebrow whitespace-nowrap">Total challenges</dt>
            <dd className="display text-right text-xl tabular-nums">{player.challengesDone}</dd>
          </dl>
        </div>
      </div>

      <div className="mx-4 mt-5 border-t border-line sm:mx-8" />

      <dl className="mt-4 grid grid-cols-3 items-start gap-2 text-center">
        <div>
          <dt className="eyebrow">Chars</dt>
          <dd className="display mt-1 text-2xl tabular-nums">{player.characterCount}</dd>
        </div>
        <div>
          <dt className="eyebrow">Leagues</dt>
          <dd className="display mt-1 text-2xl tabular-nums">{player.leagueCount}</dd>
        </div>
        <div>
          <dt className="eyebrow">/played</dt>
          <dd className="display mt-1 text-2xl whitespace-nowrap tabular-nums" title={coverage}>
            {played ? played.hours : "—"}
            {partial ? <span className="text-muted">*</span> : null}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
