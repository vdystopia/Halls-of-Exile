import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The players and the Path of Exile accounts they play on, for `collect.ps1`.
 *
 * It exists so the collector script holds no configuration of its own: the
 * archive is where a player's account is recorded, so the archive is what is
 * asked. A player with no account set is still listed, with null, which is what
 * the script skips on.
 */
export async function GET() {
  const rows = db
    .prepare(`SELECT username, poe_account FROM users ORDER BY username COLLATE NOCASE`)
    .all() as { username: string; poe_account: string | null }[];
  return NextResponse.json(rows.map((row) => ({ username: row.username, poeAccount: row.poe_account })));
}
