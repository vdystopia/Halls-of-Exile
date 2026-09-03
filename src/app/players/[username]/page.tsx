import Link from "next/link";
import { notFound } from "next/navigation";
import { AddLeagueForm } from "@/components/AddLeagueForm";
import { ChallengeMeter } from "@/components/ChallengeMeter";
import { CharacterCard } from "@/components/CharacterCard";
import { formatPlayed, isLeagueRunning, leagueTitle, leagueWindow } from "@/lib/format";
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
                href={`/players/${user.username}/${character.patch}/${character.slug}`}
                meta={`${character.patch} ${character.leagueName}`}
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

        <div className="panel divide-y divide-line">
          {visible.map((league) => {
            const total = league.challengeTotalOverride ?? league.challengeTotal;
            const empty = league.characterCount === 0;
            const running = isLeagueRunning(league.startDate, league.endDate);
            return (
              <Link
                key={league.id}
                href={`/players/${user.username}/${league.patch}`}
                className={`flex flex-wrap items-center gap-4 px-4 py-4 transition-colors hover:bg-white/[0.03] ${
                  empty ? "opacity-55" : ""
                }`}
              >
                <span className="w-16 shrink-0 font-display text-lg text-gold tabular-nums">{league.patch}</span>
                <span className="min-w-[14rem] flex-1">
                  <span className="flex items-baseline gap-2 font-display text-base text-aubergine">
                    {leagueTitle(league.name, league.expansion)}
                    {running ? (
                      <span className="tag border-gold/50 text-gold">live</span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-forest">
                    {leagueWindow(league.startDate, league.endDate, Boolean(league.endDateEstimated))}
                    {league.endDateEstimated ? " · end date tentative" : ""}
                  </span>
                </span>
                <span className="w-28 shrink-0 text-sm text-muted">
                  {league.characterCount > 0
                    ? `${league.characterCount} character${league.characterCount === 1 ? "" : "s"}`
                    : "no characters"}
                </span>
                <span className="w-24 shrink-0 text-sm text-muted">
                  {league.maxLevel ? `lvl ${league.maxLevel}` : ""}
                </span>
                <span className="shrink-0">
                  <ChallengeMeter completed={league.challengesCompleted} total={total} size="sm" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <AddLeagueForm returnTo={`/players/${user.username}`} />
    </div>
  );
}
