const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function leagueWindow(start: string | null, end: string | null): string {
  if (!start) return "dates unknown";
  return `${formatDate(start)} — ${end ? formatDate(end) : "ongoing"}`;
}

export function leagueDuration(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = end ? Date.parse(`${end}T00:00:00Z`) : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const days = Math.round((to - from) / 86_400_000);
  return days > 0 ? `${days} days` : null;
}

export function classLine(className: string | null, ascendancy: string | null): string {
  if (ascendancy && className && ascendancy !== className) return `${ascendancy} · ${className}`;
  return ascendancy || className || "Unknown class";
}
