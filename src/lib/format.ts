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

type NamedLeague = {
  name: string;
  expansion?: string | null;
  kind?: string | null;
  parent?: string | null;
};

/**
 * What a league or an event is called, without its patch:
 *
 *   Mercenaries of Trarthus (Secrets of the Atlas)    league, its expansion
 *   Legacy of Phrecia (Settlers of Kalguur)           event, its parent league
 *   Endless Delve                                     an event that ran alone
 *
 * The bracketed half is the expansion for a league and the parent league for an
 * event; an event never shows an expansion. Brackets rather than a third word
 * in a row because the two names are not equal billing — "Legacy of Phrecia
 * Settlers of Kalguur" reads as one four-word name, and at a glance there is
 * nothing to say where the league stops and the thing it ran inside begins.
 */
export function leagueLabel(league: NamedLeague): string {
  const inner = league.kind === "event" ? league.parent : league.expansion;
  return inner ? `${league.name} (${inner})` : league.name;
}

/**
 * The same thing with its patch in front, which is how a league reads anywhere
 * it appears as one line — a breadcrumb, a character page, an import row:
 *
 *   3.26 Mercenaries of Trarthus (Secrets of the Atlas)
 *   3.25 Legacy of Phrecia (Settlers of Kalguur)
 *   ### Unspecified league
 *
 * A missing patch reads "###" rather than collapsing the columns. The league
 * index puts the patch in a column of its own and so uses `leagueLabel`.
 */
export function leagueTitle(league: NamedLeague & { patch: string | null }): string {
  return `${league.patch || "###"} ${leagueLabel(league)}`;
}

/**
 * What to call a character: its ascendancy, or its class where it has no
 * ascendancy.
 *
 * Only ever one of the two. An ascendancy already names its class — every
 * Elementalist is a Witch — so printing both says the same thing twice, and the
 * class is the half that carries no information. A character with no ascendancy
 * is simply called by its class, with nothing said about the absence: under
 * level 68 there is nothing missing to remark on.
 */
export function classLine(className: string | null, ascendancy: string | null): string {
  // An imported record can know the class but not the ascendancy, or neither.
  const known = (value: string | null) => (value && value !== "Unknown" ? value : null);
  return known(ascendancy) || known(className) || "class unknown";
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

/**
 * Order two patch numbers the way the game numbers them, not the way strings
 * sort. Lexically "3.16" comes before "3.9", which is backwards — Path of Exile
 * ran 3.9, then 3.10, and on to 3.16 — so each dotted part is compared as a
 * number. "0.5" sorts before "0.5.5" because the missing third part reads zero.
 *
 * `direction` flips the comparison without flipping where a league that has no
 * patch lands: "###" sorts last whichever way the column is pointed. It is an
 * absence rather than a low number, and negating the whole comparator — the
 * obvious way to reverse a sort — floats every unknown to the top of the table
 * the moment someone clicks the header twice.
 */
export function comparePatches(a: string | null, b: string | null, direction: 1 | -1 = 1): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let part = 0; part < Math.max(left.length, right.length); part += 1) {
    const difference = (left[part] ?? 0) - (right[part] ?? 0);
    if (difference) return direction * difference;
  }
  return 0;
}

/** The same rule for dates: unknown last, either way round. See `comparePatches`. */
export function compareDates(a: string | null, b: string | null, direction: 1 | -1 = 1): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a === b) return 0;
  return direction * (a < b ? -1 : 1);
}

/** The same rule for a plain number: unknown last, either way round. */
export function compareNumbers(a: number | null, b: number | null, direction: 1 | -1 = 1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * (a - b);
}

/**
 * How far through a league's challenges a player got, as a fraction.
 *
 * What the challenge column sorts on, and deliberately not the raw count: a
 * league's total has ranged from 8 to 40 over the years, so 7 of 8 is a better
 * run than 20 of 40 and has to sort above it. Null where there is nothing to
 * divide — a league with no challenges, or one whose count was never recorded —
 * so those sort to the bottom rather than reading as zero, which would put them
 * below a genuine nil.
 *
 * Capped at 1 so the bar and the sort agree about what finished looks like.
 */
export function challengeFraction(completed: number | null, total: number | null): number | null {
  if (completed === null || total === null || total <= 0) return null;
  return Math.min(1, completed / total);
}
