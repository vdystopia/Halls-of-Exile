import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PoeExportError, readPoeExport } from "@/lib/games/poe1/poe-api";
import { applyImport, playerForAccount, type ImportUser } from "@/lib/import";
import { getUser } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Unattended ingest: `collect.ps1` posts an export here and any archived
 * character that is still empty gets its gear, gems and passives filled in.
 *
 * It only ever *fills*. Two things it will not do, both because there is nobody
 * here to ask:
 *
 *   - It will not touch a character that already holds a build. An archived
 *     character is a record of what it was; the account says what it is, and
 *     for an old character those differ by however much gear has been stripped
 *     since. Overwriting one has to be asked for by name, on the upload page.
 *   - It will not create a character, because the league it belongs in is the
 *     other thing no export can say.
 *
 * So a second run over the same account writes nothing at all, which is what
 * makes it safe to schedule.
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

  const { imported, skipped, written, touched } = applyImport(user, exported, {
    include: () => true,
    // Never invent a league, and never rewrite a character that is already
    // archived. Both need someone to ask.
    leagueFor: () => null,
    overwrite: () => false,
  });

  for (const key of touched) revalidatePath(`/players/${user.username}/${key}`);
  revalidatePath("/");
  revalidatePath(`/players/${user.username}`);

  // Everything the export held falls into one of three buckets, and the two
  // that were not written are worth naming. "Skipped" is the archive doing its
  // job; "unmatched" is a character that needs a league chosen on the upload
  // page, or a name two archived rows share.
  const accounted = new Set([...written, ...skipped]);
  const unmatched = exported.characters
    .map((character) => character.name)
    .filter((name) => !accounted.has(name));

  return NextResponse.json({
    status: "ok",
    player: user.username,
    account: exported.account,
    generatedAt: exported.generatedAt,
    characters: exported.characters.length,
    filled: imported,
    alreadyArchived: skipped.length,
    unmatched: unmatched.length,
    unmatchedNames: unmatched,
  });
}
