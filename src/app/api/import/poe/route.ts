import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PoeExportError, readPoeExport } from "@/lib/games/poe1/poe-api";
import { applyImport, playerForAccount, type ImportUser } from "@/lib/import";
import { getUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Unattended ingest: `collect.ps1` posts an export here and the matched
 * characters get their gear, gems and passives refreshed.
 *
 * It only ever *updates*. A character the archive has never seen is reported in
 * `unmatched` and left alone, because the league it belongs in is the one thing
 * no export can say and nobody is here to answer — see `src/lib/import.ts`. Run
 * it as often as you like; a run that changes nothing writes nothing.
 *
 * The player is found from the account the export names, which is recorded on
 * the player under “Manage player”. `?player=<username>` overrides that, for an
 * account not recorded on anyone.
 *
 * Like every other write in this archive there is no authentication, by design.
 * Do not expose the site to the internet.
 */
export async function POST(request: Request) {
  const body = await request.text();
  if (!body) {
    return NextResponse.json({ status: "error", error: "Empty request body." }, { status: 400 });
  }

  let exported;
  try {
    exported = readPoeExport(body);
  } catch (error) {
    const message = error instanceof PoeExportError ? error.message : "Could not read that export.";
    return NextResponse.json({ status: "error", error: message }, { status: 400 });
  }

  const requested = new URL(request.url).searchParams.get("player");
  let user: ImportUser | null;
  if (requested) {
    user = getUser(requested);
    if (!user) {
      return NextResponse.json({ status: "error", error: `No player "${requested}".` }, { status: 404 });
    }
  } else {
    user = playerForAccount(exported.account);
    if (!user) {
      return NextResponse.json(
        {
          status: "error",
          error: `No player has the account ${exported.account}. Set it under "Manage player", or post with ?player=<username>.`,
          account: exported.account,
        },
        { status: 404 },
      );
    }
  }

  const { imported, written, touched } = applyImport(user, exported, {
    include: () => true,
    // Never invent a league without someone to ask.
    leagueFor: () => null,
  });

  for (const key of touched) revalidatePath(`/players/${user.username}/${key}`);
  revalidatePath("/");
  revalidatePath(`/players/${user.username}`);

  // Whatever was in the export and did not land is worth naming: it is either a
  // character the archive has never seen, or one whose name is shared by two
  // rows and cannot be matched without a rename. Either way it needs the upload
  // page, where a league can be chosen.
  const landed = new Set(written);
  const unmatched = exported.characters
    .map((character) => character.name)
    .filter((name) => !landed.has(name));

  return NextResponse.json({
    status: "ok",
    player: user.username,
    account: exported.account,
    generatedAt: exported.generatedAt,
    characters: exported.characters.length,
    updated: imported,
    unmatched: unmatched.length,
    unmatchedNames: unmatched,
  });
}
