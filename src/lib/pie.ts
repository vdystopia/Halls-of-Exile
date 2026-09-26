/**
 * The geometry of a pie chart, worked out once so the component only draws.
 *
 * Angles start at twelve o'clock and run clockwise, the way a reader expects
 * the first slice to sit. A slice's path is an arc from the centre; a slice
 * that is the whole pie has no arc to draw (its start and end coincide), so it
 * is a full circle instead. Values of zero take no slice: a class nobody has
 * played is not a sliver, it is absent.
 */
export type PieSlice<T> = {
  item: T;
  value: number;
  /** Share of the whole, 0–1. */
  share: number;
  /** Degrees from twelve o'clock, clockwise. */
  start: number;
  end: number;
  /** The SVG path of the wedge, in the chart's own coordinates. */
  path: string;
  /** Where a label sits: on the wedge's bisector, part way out; the centre for a lone slice. */
  label: { x: number; y: number };
  /**
   * How much horizontal room a label has at that point, in the chart's units.
   * A wedge pointing up or down offers only its width across; one pointing
   * sideways lets a horizontal label run along it, up to most of the radius.
   * The component compares this with the name's width to decide whether the
   * slice can carry its own label without running over its neighbours.
   */
  room: number;
  /** A point just outside the rim on the bisector, for anchoring a flyout. */
  anchor: { x: number; y: number };
};

const toRadians = (degrees: number) => ((degrees - 90) * Math.PI) / 180;

/** A point on the circle of `radius` at `degrees` from twelve o'clock. */
export function pointAt(cx: number, cy: number, radius: number, degrees: number): { x: number; y: number } {
  const angle = toRadians(degrees);
  return { x: round(cx + radius * Math.cos(angle)), y: round(cy + radius * Math.sin(angle)) };
}

const round = (value: number) => Math.round(value * 100) / 100;

export function pieSlices<T>(
  items: T[],
  value: (item: T) => number,
  geometry: { cx: number; cy: number; radius: number; labelRadius?: number; offset?: number } = { cx: 120, cy: 120, radius: 100 },
): PieSlice<T>[] {
  const { cx, cy, radius } = geometry;
  const labelRadius = geometry.labelRadius ?? radius * 0.66;
  const kept = items.map((item) => ({ item, value: value(item) })).filter((entry) => entry.value > 0);
  const total = kept.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) return [];

  const slices: PieSlice<T>[] = [];
  // Where the first slice begins, in degrees from twelve o'clock: negative to
  // centre a leading group on the top, the way the class ring centres Witch.
  let start = geometry.offset ?? 0;
  for (const entry of kept) {
    const sweep = (entry.value / total) * 360;
    const end = start + sweep;
    const middle = start + sweep / 2;
    const whole = kept.length === 1;
    const from = pointAt(cx, cy, radius, start);
    const to = pointAt(cx, cy, radius, end);
    const path = whole
      ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius} Z`
      : `M ${cx} ${cy} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${to.x} ${to.y} Z`;
    // The wedge's width across at the label radius, and how far from vertical
    // its bisector points (1 straight up or down, 0 sideways).
    const chord = 2 * labelRadius * Math.sin(Math.min(sweep, 180) * (Math.PI / 360));
    const upright = Math.abs(Math.sin(toRadians(middle)));
    const room = whole ? radius * 1.6 : round(Math.min(radius * 0.8, chord / Math.max(upright, 0.4)));
    slices.push({
      item: entry.item,
      value: entry.value,
      share: entry.value / total,
      start: round(start),
      end: round(end),
      path,
      label: whole ? { x: cx, y: cy } : pointAt(cx, cy, labelRadius, middle),
      room,
      anchor: pointAt(cx, cy, radius + 6, middle),
    });
    start = end;
  }
  return slices;
}
