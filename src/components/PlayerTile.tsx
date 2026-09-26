import Link from "next/link";
import { avatarUrl } from "@/lib/avatars";
import type { UserSummary } from "@/lib/queries";

/**
 * A player on the players list and the front page: their picture, name and
 * display name, two headline counts beside them, and characters, leagues and
 * /played underneath. The labels are underlined and the figures are not.
 */
export function PlayerTile({ player }: { player: UserSummary }) {
  const picture = avatarUrl(player.username, player.avatarVersion);
  const hours = Math.floor(player.playedMinutes / 60);
  // A /played total covers only characters that have one; say so rather than
  // passing a partial sum off as the whole.
  const partial = player.playedRecorded < player.characterCount;

  return (
    <Link
      href={`/players/${player.username}`}
      className="panel group block border-gold/45 p-4 transition-colors hover:border-gold sm:p-5"
    >
      <div className="flex gap-4 sm:gap-5">
        <div className="size-24 shrink-0 overflow-hidden rounded-sm bg-surface-3 sm:size-44">
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- a player's own upload, already a small square
            <img src={picture} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-display text-4xl text-gold/60 sm:text-6xl">
              {player.username.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 pt-1">
            <h2 className="text-2xl break-words text-gold-bright underline decoration-1 underline-offset-4 group-hover:text-gold sm:text-[1.75rem]">
              {player.username}
            </h2>
            <p className="mt-2 text-lg break-words text-parchment/80 underline decoration-1 underline-offset-4">
              {player.firstName}
            </p>
          </div>
          <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-8 gap-y-5 font-mono text-gold sm:mt-10">
            <dt>Level 100:</dt>
            <dd className="tabular-nums">{player.level100s}</dd>
            <dt className="max-w-[9rem]">Total Challenges:</dt>
            <dd className="tabular-nums">{player.challengesDone}</dd>
          </dl>
        </div>
      </div>

      <div className="mx-4 mt-5 border-t border-line sm:mx-8" />

      <dl className="mt-4 grid grid-cols-3 items-start gap-2 text-center">
        <div>
          <dt className="text-sm tracking-[0.25em] text-muted uppercase underline decoration-1 underline-offset-4">
            Chars
          </dt>
          <dd className="mt-1 text-2xl text-parchment tabular-nums">{player.characterCount}</dd>
        </div>
        <div>
          <dt className="text-sm tracking-[0.25em] text-muted uppercase underline decoration-1 underline-offset-4">
            Leagues
          </dt>
          <dd className="mt-1 text-2xl text-parchment tabular-nums">{player.leagueCount}</dd>
        </div>
        <div>
          <dt className="font-mono text-lg text-gold underline decoration-1 underline-offset-4">/played</dt>
          <dd
            className="mt-1 font-mono text-base whitespace-nowrap text-gold tabular-nums sm:text-xl"
            title={
              partial
                ? `${player.playedRecorded} of ${player.characterCount} characters have a /played recorded`
                : undefined
            }
          >
            {hours} {hours === 1 ? "hour" : "hours"}
            {partial ? "*" : ""}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
