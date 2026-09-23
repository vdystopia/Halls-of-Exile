import { NextResponse } from "next/server";
import { buildPlayerExport, exportFileName } from "@/lib/export";

export const dynamic = "force-dynamic";

/**
 * A player's whole archive as one JSON file (docs/export-format.md). Public like
 * every other page here: there is no auth, and nothing in an export is not
 * already on the player's pages.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const now = new Date();
  const archive = buildPlayerExport(username, now);
  if (!archive) return NextResponse.json({ error: "no such player" }, { status: 404 });
  return new NextResponse(`${JSON.stringify(archive, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(archive.player.username, now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
