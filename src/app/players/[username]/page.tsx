import Link from "next/link";
import { notFound } from "next/navigation";
import { AddLeagueForm } from "@/components/AddLeagueForm";
import { BuildCard } from "@/components/BuildCard";
import { ClassRollup } from "@/components/ClassRollup";
import { CharacterCard } from "@/components/CharacterCard";
import { LeagueIndex } from "@/components/LeagueIndex";
import { PlayerAdmin } from "@/components/PlayerAdmin";
import { formatPlayed, formatPlayedTotal } from "@/lib/format";
import { buildSkill, skillArt } from "@/lib/games/skills";
import { GAME_NAMES } from "@/lib/games/types";
import { rollupByClass, rollupBySkill } from "@/lib/metrics";
import { getUser, getUserTotals, listLeaguesForUser, listPlayerCharacters, listRecentCharacters } from "@/lib/queries";

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
  const total = formatPlayedTotal(totals.playedMinutes);

  const characters = listPlayerCharacters(user.id);
  const facts = characters.map((c) => ({
    game: c.game,
    className: c.className,
    ascendancy: c.ascendancy,
    level: c.level,
    playedMinutes: c.playedMinutes,
    leagueId: c.leagueId,
    skill: buildSkill(c.game, c.skillGem, c.mainSkill),
  }));
  const byClass = rollupByClass(facts);
  const builds = rollupBySkill(facts).slice(0, 4);
  const mostPlayed = characters
    .filter((c) => c.playedMinutes)
    .sort((a, b) => (b.playedMinutes ?? 0) - (a.playedMinutes ?? 0))
    .slice(0, 3);
  const level100 = characters.filter((c) => c.level === 100);
  const card = (character: (typeof characters)[number], lead?: string | null) => (
    <CharacterCard
      key={character.id}
      character={character}
      game={character.game}
      href={`/players/${user.username}/${character.game}/${character.leagueSlug}/${character.slug}`}
      meta={[lead, `${character.patch ?? "###"} ${character.leagueName}`].filter(Boolean).join(" · ")}
      notes={false}
    />
  );

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
          {/* Columns as wide as their contents, not four equal shares: the /played
              figure is the widest, and equal columns spread every stat apart to
              match it instead of letting the others close up to the left. */}
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-[repeat(4,auto)]">
            {[
              { label: "Characters", value: totals.characters },
              { label: "Leagues played", value: totals.leagues },
              { label: "Highest level", value: totals.highestLevel ?? "—" },
              {
                label: "Total /played",
                value: total ? (
                  <>
                    {total.days} <span className="text-muted">({total.hours})</span>
                  </>
                ) : (
                  "—"
                ),
              },
            ].map((stat) => (
              <div key={stat.label} className="text-right">
                <dt className="eyebrow">{stat.label}</dt>
                <dd className="display text-2xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {mostPlayed.length ? (
        <section>
          <h2 className="display mb-4 text-xl">Most played</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mostPlayed.map((character) => card(character, `/played ${formatPlayed(character.playedMinutes)}`))}
          </div>
        </section>
      ) : null}

      {level100.length ? (
        <section>
          <h2 className="display mb-4 text-xl">
            Level 100 <span className="text-base text-muted">· {level100.length}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {level100.map((character) => card(character, formatPlayed(character.playedMinutes) ? `/played ${formatPlayed(character.playedMinutes)}` : null))}
          </div>
        </section>
      ) : null}

      {builds.length ? (
        <section>
          <h2 className="display mb-4 text-xl">Most played builds</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {builds.map((build, index) => (
              <BuildCard key={`${build.game}/${build.name}`} build={build} art={skillArt(build.game, build.name)} rank={index + 1} />
            ))}
          </div>
        </section>
      ) : null}

      {recent.length ? (
        <section>
          <h2 className="display mb-4 text-xl">Pinned &amp; most recent</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                game={character.game}
                href={`/players/${user.username}/${character.game}/${character.leagueSlug}/${character.slug}`}
                meta={`${character.patch ?? "###"} ${character.leagueName}`}
                notes={false}
              />
            ))}
          </div>
        </section>
      ) : null}

      {byClass.map(({ game, classes }) => (
        <section key={game}>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="display text-xl">
              Classes{byClass.length > 1 ? <span className="text-base text-muted"> · {GAME_NAMES[game]}</span> : null}
            </h2>
            <span className="text-xs text-muted">open a class for its ascendancies</span>
          </div>
          <ClassRollup game={game} classes={classes} />
        </section>
      ))}

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
