import Link from "next/link";
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
            <p className="display text-3xl">{stat.value}</p>
            <p className="eyebrow mt-1">{stat.label}</p>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((player) => (
              <Link key={player.id} href={`/players/${player.username}`} className="panel block p-4 hover:border-gold/60">
                <p className="display text-lg">{player.username}</p>
                <p className="text-sm text-muted">{player.firstName}</p>
                <p className="mt-3 text-xs text-muted">
                  {player.characterCount} characters · {player.leagueCount} leagues
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            step: "01",
            title: "Claim a name",
            body: "A username and a first name. No password, no email — every archive here is public by design.",
          },
          {
            step: "02",
            title: "Pick the league",
            body: "Every patch from 1.0 Domination to the current league, with its dates and your challenge count.",
          },
          {
            step: "03",
            title: "Paste the build",
            body: "Drop in a Path of Building code or a pobb.in link and the character sheet builds itself — gear, gems, tree, stats.",
          },
        ].map((card) => (
          <div key={card.step} className="panel p-5">
            <p className="eyebrow">{card.step}</p>
            <h3 className="display mt-2 text-lg">{card.title}</h3>
            <p className="mt-2 text-sm text-parchment/75">{card.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
