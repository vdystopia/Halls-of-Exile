import { NextResponse } from "next/server";
import { getArchiveTotals } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Liveness probe for the container: also proves the database is readable. */
export async function GET() {
  try {
    const totals = getArchiveTotals();
    return NextResponse.json({ status: "ok", ...totals, uptime: Math.round(process.uptime()) });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "database unavailable" },
      { status: 503 },
    );
  }
}
