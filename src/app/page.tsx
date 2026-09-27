import Link from "next/link";
import { PlayerTile } from "@/components/PlayerTile";
import { playerAccent } from "@/lib/avatars";
import { getArchiveTotals, listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const totals = getArchiveTotals();
  const players = listUsers().slice(0, 6);
  const accents = await Promise.all(players.map((player) => playerAccent(player.id)));

  return (
    <div className="space-y-14">
      <section className="panel relative overflow-hidden px-8 py-14 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_50%_-20%,rgba(200,170,110,0.18),transparent_70%)]" />
        <h1 className="display relative text-4xl leading-tight sm:text-5xl">Halls of Exile</h1>
        {/* The owner's words, verbatim. */}
        <p className="relative mx-auto mt-6 max-w-3xl text-parchment/80">
          Heroes rise and fall. Glory comes and goes. In the end, we all leave this world the same way we came into
          it - alone and with nothing. We will all be forgotten. This much is certain and cannot be avoided. These
          halls were not built to change that. They cannot grant immortality, even through the preservation of
          memory. Your records will be stored here, exile, for all of time. Not so that you may live on, but for the
          fleeting joy of those who would pay good coin browse them. And for me, to make my fortune. Your legacy is
          mine to wield now, and I am all that stands between you and oblivion.
        </p>
        <p className="relative mx-auto mt-5 max-w-3xl text-parchment/80">Welcome... to the Halls of Exile...</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/players" className="btn btn-gold">
            Browse the archive
          </Link>
          <Link href="/players/new" className="btn">
            Create a Profile
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-px overflow-hidden rounded border border-line bg-line/60">
        {[
          { label: "Exiles archived", value: totals.characters },
          { label: "Players", value: totals.users },
          { label: "Leagues played", value: totals.leagues },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface px-4 py-6 text-center">
            <p className="eyebrow">{stat.label}</p>
            <p className="display mt-1 text-3xl">{stat.value}</p>
          </div>
        ))}
      </section>

      {players.length ? (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="display text-xl">The archivists</h2>
            <Link href="/players" className="link-gold text-sm">
              All players →
            </Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {players.map((player, index) => (
              <PlayerTile key={player.id} player={player} accent={accents[index]} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
