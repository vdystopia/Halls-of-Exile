import Link from "next/link";
import { PlayerTile } from "@/components/PlayerTile";
import { getArchiveTotals, listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const totals = getArchiveTotals();
  const players = listUsers().slice(0, 6);

  return (
    <div className="space-y-14">
      <section className="panel relative overflow-hidden px-8 py-14 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_240px_at_50%_-20%,rgba(200,170,110,0.18),transparent_70%)]" />
        <p className="eyebrow relative">Every exile you have ever rolled</p>
        <h1 className="display relative mt-4 text-4xl leading-tight sm:text-5xl">Halls of Exile</h1>
        <p className="relative mx-auto mt-5 max-w-2xl text-parchment/80">
          Leagues end. Characters get migrated to Standard and never touched again. This is where they keep
          their gear, their gems, their tree and their story — sorted by league, ready for the next time you feel
          like walking back through them.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/players" className="btn btn-gold">
            Browse the archive
          </Link>
          <Link href="/players/new" className="btn">
            Create a profile
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
            {players.map((player) => (
              <PlayerTile key={player.id} player={player} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
