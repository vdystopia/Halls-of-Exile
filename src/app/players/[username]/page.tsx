import Link from "next/link";
import { notFound } from "next/navigation";
import { AddLeagueForm } from "@/components/AddLeagueForm";
import { CharacterCard } from "@/components/CharacterCard";
import { LeagueIndex } from "@/components/LeagueIndex";
import { PlayerAdmin } from "@/components/PlayerAdmin";
import { formatPlayed } from "@/lib/format";
import { getUser, getUserTotals, listLeaguesForUser, listRecentCharacters } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ all?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `${username} · Halls of Exile` };
}

export default async function PlayerPage({ params, searchParams }: Props) {
  const { username } = await params;
  const { all } = await searchParams;
  const user = getUser(username);
  if (!user) notFound();

  const totals = getUserTotals(user.id);
  const leagues = listLeaguesForUser(user.id);
  const recent = listRecentCharacters(user.id, 3);
  const played = leagues.filter((league) => league.characterCount > 0 || league.challengesCompleted !== null);
  const showAll = all === "1" || played.length === 0;
  const visible = showAll ? leagues : played;

  return (
    <div className="space-y-8">
      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="eyebrow">Archive of</p>
            <h1 className="font-display mt-2 text-3xl tracking-wide text-forest">{user.username}</h1>
            <p className="mt-1 text-sm text-aubergine">{user.firstName}</p>
            {user.tagline ? <p className="mt-3 max-w-xl text-sm text-parchment/75 italic">“{user.tagline}”</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            {[
              { label: "Characters", value: totals.characters },
              { label: "Leagues played", value: totals.leagues },
              { label: "Highest level", value: totals.highestLevel ?? "—" },
              { label: "Total /played", value: formatPlayed(totals.playedMinutes) ?? "—" },
            ].map((stat) => (
              <div key={stat.label} className="text-right">
                <dt className="eyebrow">{stat.label}</dt>
                <dd className="display text-2xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {recent.length ? (
        <section>
          <h2 className="display mb-4 text-xl">Pinned &amp; most recent</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                href={`/players/${user.username}/${character.game}/${character.leagueSlug}/${character.slug}`}
                meta={`${character.patch ?? "###"} ${character.leagueName}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-xl">League index</h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted">
              {played.length} of {leagues.length} leagues played
            </span>
            <Link href={showAll ? `/players/${user.username}` : `/players/${user.username}?all=1`} className="link-gold">
              {showAll ? "Show only leagues played" : "Show every league"}
            </Link>
          </div>
        </div>

        <LeagueIndex username={user.username} leagues={visible} />
      </section>

      <AddLeagueForm returnTo={`/players/${user.username}`} />

      <Link href={`/players/${user.username}/import`} className="panel block p-4 hover:bg-surface-2/60">
        <span className="text-sm text-parchment">Import an account from Path of Exile</span>
        <span className="mt-1 block text-xs text-muted">
          Fill in gear, gems and the passive tree for every character at once, from an export of the game&rsquo;s
          own character list.
        </span>
      </Link>

      <PlayerAdmin
        username={user.username}
        firstName={user.firstName}
        tagline={user.tagline}
        poeAccount={user.poeAccount}
        characters={totals.characters}
      />
    </div>
  );
}
