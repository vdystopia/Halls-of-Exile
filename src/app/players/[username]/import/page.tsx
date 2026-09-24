import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportExportForm } from "@/components/ImportExportForm";
import { skillNames } from "@/lib/games/poe1/gems";
import { getUser, listAllLeagues } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `Import an account · ${username}` };
}

export default async function ImportPage({ params }: Props) {
  const { username } = await params;
  const user = getUser(username);
  if (!user) notFound();

  // Path of Exile 2 has no equivalent export: the script behind this page reads
  // the first game's character endpoints only.
  const leagues = listAllLeagues().filter((league) => league.game === "poe1");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <Link href={`/players/${user.username}`} className="link-gold tracking-[0.18em] uppercase">
          {user.username}
        </Link>
        <span className="text-muted">/</span>
        <span className="tracking-[0.18em] text-muted uppercase">Import an account</span>
      </div>

      <header className="panel p-6">
        <h1 className="display text-2xl">Import from Path of Exile</h1>
        <p className="mt-2 max-w-2xl text-sm text-parchment/80">
          Fill in gear, socketed gems and the passive tree for every character on an account at once, from the
          game&rsquo;s own character endpoints. The archive never reaches the game itself — a separate script
          reads the account and writes one JSON file, which is what this page takes.
        </p>
        <p className="mt-3 max-w-2xl text-xs text-muted">
          Nothing computed comes with it. Life, resistances and damage are Path of Building&rsquo;s arithmetic,
          not the game&rsquo;s, so a character imported this way shows no stat panels until a build code is
          added to it.
        </p>
      </header>

      <ImportExportForm username={user.username} leagues={leagues} skills={skillNames()} />
    </div>
  );
}
