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

/** "Archnemesis (Siege of the Atlas)" when the league shipped with an expansion. */
export function leagueTitle(name: string, expansion: string | null): string {
  return expansion ? `${name} (${expansion})` : name;
}

export function classLine(className: string | null, ascendancy: string | null): string {
  if (ascendancy && className && ascendancy !== className) return `${ascendancy} · ${className}`;
  return ascendancy || className || "Unknown class";
}

/**
 * Parse an in-game /played time into minutes. Accepts what the game prints
 * ("5 days, 3 hours, 22 minutes") and the shorthand people actually type
 * ("5d 3h", "12h30m", "90m"). A bare number is read as hours.
 * Returns null when there is nothing usable in the input.
 */
export function parsePlayed(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const hours = Number(text);
    return Number.isFinite(hours) ? Math.round(hours * 60) : null;
  }

  const units: [RegExp, number][] = [
    [/(\d+(?:\.\d+)?)\s*(?:d|days?)(?![a-z])/, 24 * 60],
    [/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)(?![a-z])/, 60],
    [/(\d+(?:\.\d+)?)\s*(?:m|mins?|minutes?)(?![a-z])/, 1],
  ];

  let minutes = 0;
  let matched = false;
  for (const [pattern, multiplier] of units) {
    const match = pattern.exec(text);
    if (!match) continue;
    matched = true;
    minutes += Number(match[1]) * multiplier;
  }

  if (!matched) return null;
  const rounded = Math.round(minutes);
  return rounded > 0 ? rounded : null;
}

/** Render minutes the way the game talks about time played: "5d 3h". */
export function formatPlayed(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const rest = minutes % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}
