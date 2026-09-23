import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CharacterCard } from "@/components/CharacterCard";
import { characterHref, leagueTitle } from "@/lib/format";
import { getUser, listArchive } from "@/lib/queries";
import { MIN_QUERY_LENGTH, normaliseQuery, searchCharacters, type SearchField } from "@/lib/search";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

const FIELD_LABEL: Record<SearchField, string> = { name: "Name", skill: "Skill", unique: "Unique" };
const FIELD_TONE: Record<SearchField, string> = {
  name: "text-parchment",
  skill: "text-rarity-gem",
  unique: "text-rarity-unique",
};

export async function generateMetadata({ params, searchParams }: Props) {
  const { username } = await params;
  const query = normaliseQuery((await searchParams).q);
  return { title: `${query ? `“${query}” · ` : ""}${username} · Halls of Exile` };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const { username } = await params;
  const user = getUser(username);
  if (!user) notFound();

  const query = normaliseQuery((await searchParams).q);
  const tooShort = query.length > 0 && query.length < MIN_QUERY_LENGTH;
  const results = searchCharacters(listArchive(user.id), query);

  return (
    <div className="space-y-6">
      <Link href={`/players/${user.username}`} className="link-gold text-xs tracking-[0.18em] uppercase">
        ← {user.username}&apos;s leagues
      </Link>

      <header className="panel space-y-4 p-6">
        <div>
          <p className="eyebrow">Search the archive of</p>
          <h1 className="font-display mt-2 text-3xl tracking-wide text-forest">{user.username}</h1>
        </div>
        <Form action={`/players/${user.username}/search`} className="flex flex-wrap items-center gap-3">
          <label htmlFor="archive-search" className="sr-only">
            Search
          </label>
          <input
            id="archive-search"
            name="q"
            type="search"
            defaultValue={query}
            minLength={MIN_QUERY_LENGTH}
            placeholder="Character name, skill or unique item"
            className="input max-w-md flex-1"
          />
          <button type="submit" className="btn px-3 py-2 text-xs">
            Search
          </button>
        </Form>
        <p className="text-xs text-muted">
          Matches a character&apos;s name, its main skill and every gem it socketed, and the uniques it had
          equipped — not spares left in its Path of Building item list.
        </p>
      </header>

      {!query ? null : tooShort ? (
        <p className="text-sm text-muted">Type at least {MIN_QUERY_LENGTH} characters.</p>
      ) : results.length === 0 ? (
        <p className="panel p-6 text-center text-sm text-muted">Nothing in the archive matches “{query}”.</p>
      ) : (
        <section>
          <h2 className="display mb-4 text-xl">
            {results.length} character{results.length === 1 ? "" : "s"} match “{query}”
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map(({ character, hits }) => (
              <div key={character.id} className="flex flex-col gap-2">
                <CharacterCard
                  character={character}
                  href={characterHref(user.username, character.league, character)}
                  meta={leagueTitle(character.league)}
                />
                <ul className="flex flex-wrap gap-1.5 px-1">
                  {hits.map((hit) => (
                    <li key={`${hit.field}:${hit.text}`} className="tag normal-case">
                      <span className="uppercase">{FIELD_LABEL[hit.field]}</span>
                      <span className={FIELD_TONE[hit.field]}>{hit.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
