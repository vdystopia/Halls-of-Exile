const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * The league's live window. An estimated end date is prefixed with "~" so a
 * projection never reads like an announced date.
 */
export function leagueWindow(start: string | null, end: string | null, estimated = false): string {
  if (!start) return "dates unknown";
  if (!end) return `${formatDate(start)} — ongoing`;
  return `${formatDate(start)} — ${estimated ? "~" : ""}${formatDate(end)}`;
}

/** True while the league is still being played. */
export function isLeagueRunning(start: string | null, end: string | null): boolean {
  if (!start) return false;
  const from = Date.parse(`${start}T00:00:00Z`);
  if (!Number.isFinite(from) || from > Date.now()) return false;
  if (!end) return true;
  const to = Date.parse(`${end}T00:00:00Z`);
  return !Number.isFinite(to) || to > Date.now();
}

export function leagueDuration(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const running = isLeagueRunning(start, end);
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = running || !end ? Date.now() : Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const days = Math.round((to - from) / 86_400_000);
  if (days <= 0) return null;
  return running ? `${days} days so far` : `${days} days`;
}

export function classLine(className: string | null, ascendancy: string | null): string {
  if (ascendancy && className && ascendancy !== className) return `${ascendancy} · ${className}`;
  return ascendancy || className || "Unknown class";
}
