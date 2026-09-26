import Link from "next/link";
import { notFound } from "next/navigation";
import { AddLeagueForm } from "@/components/AddLeagueForm";
import { BuildCard } from "@/components/BuildCard";
import { BuildRanking } from "@/components/BuildRanking";
import { ClassRollup } from "@/components/ClassRollup";
import { CharacterBanner } from "@/components/CharacterBanner";
import { LeagueIndex } from "@/components/LeagueIndex";
import { PlayerAdmin } from "@/components/PlayerAdmin";
import { Section } from "@/components/Section";
import { formatPlayedTotal } from "@/lib/format";
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
  const buildGrid = (by: "characters" | "played") => {
    const top = rollupBySkill(facts, by).slice(0, 4);
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {top.map((build, index) => (
          <BuildCard key={`${build.game}/${build.name}`} build={build} art={skillArt(build.game, build.name)} rank={index + 1} />
        ))}
      </div>
    );
  };
  const hasBuilds = facts.some((c) => c.skill);
  const mostPlayed = characters
    .filter((c) => c.playedMinutes)
    .sort((a, b) => (b.playedMinutes ?? 0) - (a.playedMinutes ?? 0))
    .slice(0, 3);
  const level100 = characters.filter((c) => c.level === 100);
  // One banner per row, in every list here: each is the character page's
  // header, compressed, and three abreast would leave no room for its name.
  const banners = (list: typeof characters) => (
    <div className="grid gap-3">
      {list.map((character) => (
        <CharacterBanner
          key={character.id}
          character={character}
          href={`/players/${user.username}/${character.game}/${character.leagueSlug}/${character.slug}`}
        />
      ))}
    </div>
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
                  // Summed over the characters that have a /played; the rest add
                  // nothing, so a partial total says so, as the class table does.
                  <span
                    title={
                      totals.playedRecorded < totals.characters
                        ? `recorded for ${totals.playedRecorded} of ${totals.characters} characters`
                        : "recorded for every character"
                    }
                  >
                    {total.days} <span className="text-muted">({total.hours})</span>
                    {totals.playedRecorded < totals.characters ? <span className="text-muted">*</span> : null}
                  </span>
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
        <Section title="Most played">
          {banners(mostPlayed)}
        </Section>
      ) : null}

      {level100.length ? (
        <Section
          title={
            <>
              Level 100 <span className="text-base text-muted">· {level100.length}</span>
            </>
          }
        >
          {banners(level100)}
        </Section>
      ) : null}

      {hasBuilds ? (
        <Section title="Most played builds">
          <BuildRanking byCharacters={buildGrid("characters")} byPlayed={buildGrid("played")} />
        </Section>
      ) : null}

      {recent.length ? (
        <Section title="Pinned & most recent">
          {banners(recent)}
        </Section>
      ) : null}

      {byClass.map(({ game, classes }) => (
        <Section
          key={game}
          title={
            <>
              Classes{byClass.length > 1 ? <span className="text-base text-muted"> · {GAME_NAMES[game]}</span> : null}
            </>
          }
          aside={<span className="text-muted">open a class for its ascendancies</span>}
        >
          <ClassRollup game={game} classes={classes} />
        </Section>
      ))}

      {/* Open when the page was reached through its own "show every league"
          link, which would otherwise land on the section it just closed. */}
      <Section
        title="League index"
        open={all !== undefined}
        aside={
          <span className="text-muted">
            {played.length} of {leagues.length} leagues played
          </span>
        }
      >
        {/* In the body, not beside the title, where a click would also toggle the section. */}
        <div className="mb-3 text-right text-xs">
          <Link href={showAll ? `/players/${user.username}?all=0` : `/players/${user.username}?all=1`} className="link-gold">
            {showAll ? "Show only leagues played" : "Show every league"}
          </Link>
        </div>
        <LeagueIndex username={user.username} leagues={visible} />
      </Section>

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
