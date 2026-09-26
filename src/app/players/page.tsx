import Link from "next/link";
import { PlayerTile } from "@/components/PlayerTile";
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
        <div className="grid gap-4 xl:grid-cols-2">
          {players.map((player) => (
            <PlayerTile key={player.id} player={player} />
          ))}
        </div>
      )}
    </div>
  );
}
