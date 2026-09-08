import Link from "next/link";
import { notFound } from "next/navigation";
import { AddCharacterForm } from "@/components/AddCharacterForm";
import { leagueTitle, leagueWindow } from "@/lib/format";
import { getLeagueByPatch, getUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string; patch: string }> };

export default async function NewCharacterPage({ params }: Props) {
  const { username, patch } = await params;
  const user = getUser(username);
  const league = getLeagueByPatch(patch);
  if (!user || !league) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/players/${user.username}/${league.slug}`}
          className="link-gold text-xs tracking-[0.18em] uppercase"
        >
          ← {leagueTitle(league)}
        </Link>
        <h1 className="display mt-3 text-3xl">Add a character</h1>
        <p className="mt-2 text-sm text-muted">
          {user.username} · {leagueTitle(league)} · {leagueWindow(league.startDate, league.endDate, Boolean(league.endDateEstimated))}
        </p>
      </div>
      <AddCharacterForm username={user.username} patch={league.slug} />
    </div>
  );
}
