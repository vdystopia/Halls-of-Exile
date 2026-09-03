import Link from "next/link";
import { listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Players · Halls of Exile" };

export default function PlayersPage() {
  const players = listUsers();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Public archive</p>
          <h1 className="display mt-2 text-3xl">Players</h1>
          <p className="mt-2 max-w-2xl text-sm text-parchment/75">
            Pick a player to walk their leagues. Anyone can be opened — nothing here is private.
          </p>
        </div>
        <Link href="/players/new" className="btn btn-gold">
          Create profile
        </Link>
      </header>

      {players.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="display text-lg">The halls are empty.</p>
          <p className="mt-2 text-sm text-muted">Be the first exile on the wall.</p>
          <Link href="/players/new" className="btn btn-gold mt-6">
            Create the first profile
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((player) => (
            <Link
              key={player.id}
              href={`/players/${player.username}`}
              className="panel group flex flex-col justify-between p-5 transition-colors hover:border-gold/60"
            >
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="display text-lg group-hover:text-gold-bright">{player.username}</h2>
                  {player.highestLevel ? (
                    <span className="tag">lvl {player.highestLevel} best</span>
                  ) : null}
                </div>
                <p className="text-sm text-muted">{player.firstName}</p>
                {player.tagline ? (
                  <p className="mt-3 text-sm text-parchment/70 italic">“{player.tagline}”</p>
                ) : null}
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <div>
                  <dt className="eyebrow">Chars</dt>
                  <dd className="font-display text-base">{player.characterCount}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Leagues</dt>
                  <dd className="font-display text-base">{player.leagueCount}</dd>
                </div>
                <div>
                  <dt className="eyebrow">Latest</dt>
                  <dd className="font-display text-base">{player.latestPatch ?? "—"}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
