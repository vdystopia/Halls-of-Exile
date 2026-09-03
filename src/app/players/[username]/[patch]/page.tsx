import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengeMeter } from "@/components/ChallengeMeter";
import { CharacterCard } from "@/components/CharacterCard";
import { LeagueRecordForm } from "@/components/LeagueRecordForm";
import { leagueDuration, leagueWindow } from "@/lib/format";
import { getCharacterCountByClass } from "@/lib/insights";
import {
  getAdjacentLeagues,
  getLeagueByPatch,
  getLeagueProgress,
  getUser,
  listCharacters,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string; patch: string }> };

export async function generateMetadata({ params }: Props) {
  const { username, patch } = await params;
  const league = getLeagueByPatch(patch);
  return { title: `${username} · ${patch} ${league?.name ?? ""}`.trim() };
}

export default async function LeaguePage({ params }: Props) {
  const { username, patch } = await params;
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
  if (!user || !league) notFound();

  const characters = listCharacters(user.id, league.id);
  const progress = getLeagueProgress(user.id, league.id);
  const total = progress?.challengeTotal ?? league.challengeTotal;
  const duration = leagueDuration(league.startDate, league.endDate);
  const classes = getCharacterCountByClass(characters);
  const { previous, next } = getAdjacentLeagues(user.id, league.sortOrder);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <Link href={`/players/${user.username}`} className="link-gold tracking-[0.18em] uppercase">
          ← {user.username}&apos;s leagues
        </Link>
        <div className="flex items-center gap-4">
          {previous ? (
            <Link href={`/players/${user.username}/${previous.patch}`} className="link-gold">
              ← {previous.patch} {previous.name}
            </Link>
          ) : null}
          {next ? (
            <Link href={`/players/${user.username}/${next.patch}`} className="link-gold">
              {next.patch} {next.name} →
            </Link>
          ) : null}
        </div>
      </div>

      <header className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="eyebrow">Patch {league.patch}</p>
            <h1 className="display mt-2 text-3xl">{league.name}</h1>
            <p className="mt-2 text-sm text-muted">
              {leagueWindow(league.startDate, league.endDate)}
              {duration ? ` · ${duration}` : ""}
              {league.expansion ? ` · ${league.expansion} expansion` : ""}
            </p>
            {classes.length ? (
              <p className="mt-3 flex flex-wrap gap-2">
                {classes.map((entry) => (
                  <span key={entry.label} className="tag">
                    {entry.label} ×{entry.count}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          <div className="space-y-3">
            <ChallengeMeter completed={progress?.challengesCompleted ?? null} total={total} />
            <p className="text-right text-sm text-muted">
              {characters.length} character{characters.length === 1 ? "" : "s"} archived
            </p>
          </div>
        </div>
        {progress?.notes ? (
          <p className="mt-6 border-t border-line pt-4 text-sm text-parchment/80 italic">“{progress.notes}”</p>
        ) : null}
      </header>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="display text-xl">Characters</h2>
          <Link href={`/players/${user.username}/${league.patch}/new`} className="btn btn-gold px-3 py-1.5 text-xs">
            Add character
          </Link>
        </div>

        {characters.length === 0 ? (
          <div className="panel p-10 text-center">
            <p className="display text-lg">Nothing recorded for {league.name}.</p>
            <p className="mt-2 text-sm text-muted">
              Paste a Path of Building export and the whole character sheet comes with it.
            </p>
            <Link href={`/players/${user.username}/${league.patch}/new`} className="btn btn-gold mt-6">
              Add the first character
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                href={`/players/${user.username}/${league.patch}/${character.slug}`}
              />
            ))}
          </div>
        )}
      </section>

      <LeagueRecordForm
        username={user.username}
        patch={league.patch}
        challengesCompleted={progress?.challengesCompleted ?? null}
        challengeTotal={total}
        notes={progress?.notes ?? null}
      />
    </div>
  );
}
