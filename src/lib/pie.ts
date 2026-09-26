/**
 * The geometry of a pie or ring chart, worked out once so the component only
 * draws.
 *
 * Angles start at twelve o'clock and run clockwise, the way a reader expects
 * the first slice to sit; an `offset` starts the first slice earlier so a
 * leading group can be centred on the top. A slice's path is a wedge from the
 * centre, or, with an `innerRadius`, a band of the ring between the two radii.
 * A slice that is the whole pie has no arc ends to draw, so it is a full
 * circle, or a full ring. Values of zero take no slice: a class nobody has
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
  /** The bisector, in the same degrees: where a label points. */
  middle: number;
  /** The SVG path of the wedge or band, in the chart's own coordinates. Fill it with `evenodd`. */
  path: string;
  /** Where a horizontal label sits: on the bisector, part way out; the centre for a lone slice. */
  label: { x: number; y: number };
  /**
   * How much horizontal room a horizontal label has at that point, in the
   * chart's units. A wedge pointing up or down offers only its width across;
   * one pointing sideways lets a horizontal label run along it, up to most of
   * the radius.
   */
  room: number;
  /** A point just outside the rim on the bisector, for anchoring a flyout. */
  anchor: { x: number; y: number };
};

export type PieGeometry = {
  cx: number;
  cy: number;
  radius: number;
  /** A hole in the middle; the slices become bands of a ring. */
  innerRadius?: number;
  labelRadius?: number;
  /** Degrees before twelve o'clock at which the first slice starts. */
  offset?: number;
};

const toRadians = (degrees: number) => ((degrees - 90) * Math.PI) / 180;

/** A point on the circle of `radius` at `degrees` from twelve o'clock. */
export function pointAt(cx: number, cy: number, radius: number, degrees: number): { x: number; y: number } {
  const angle = toRadians(degrees);
  return { x: round(cx + radius * Math.cos(angle)), y: round(cy + radius * Math.sin(angle)) };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** A full circle as a path, drawn clockwise or, for an even-odd hole, counter-clockwise. */
function circlePath(cx: number, cy: number, r: number, clockwise: boolean): string {
  const sweep = clockwise ? 1 : 0;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 1 ${sweep} ${cx} ${cy + r} A ${r} ${r} 0 1 ${sweep} ${cx} ${cy - r} Z`;
}

export function pieSlices<T>(items: T[], value: (item: T) => number, geometry: PieGeometry = { cx: 120, cy: 120, radius: 100 }): PieSlice<T>[] {
  const { cx, cy, radius } = geometry;
  const inner = geometry.innerRadius ?? 0;
  const labelRadius = geometry.labelRadius ?? (inner > 0 ? (inner + radius) / 2 : radius * 0.66);
  const kept = items.map((item) => ({ item, value: value(item) })).filter((entry) => entry.value > 0);
  const total = kept.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) return [];

  const slices: PieSlice<T>[] = [];
  let start = geometry.offset ?? 0;
  for (const entry of kept) {
    const sweep = (entry.value / total) * 360;
    const end = start + sweep;
    const middle = start + sweep / 2;
    const whole = kept.length === 1;
    const large = sweep > 180 ? 1 : 0;
    let path: string;
    if (whole) {
      path = circlePath(cx, cy, radius, true) + (inner > 0 ? ` ${circlePath(cx, cy, inner, false)}` : "");
    } else {
      const from = pointAt(cx, cy, radius, start);
      const to = pointAt(cx, cy, radius, end);
      if (inner > 0) {
        const innerFrom = pointAt(cx, cy, inner, start);
        const innerTo = pointAt(cx, cy, inner, end);
        path =
          `M ${innerFrom.x} ${innerFrom.y} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y}` +
          ` L ${innerTo.x} ${innerTo.y} A ${inner} ${inner} 0 ${large} 0 ${innerFrom.x} ${innerFrom.y} Z`;
      } else {
        path = `M ${cx} ${cy} L ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y} Z`;
      }
    }
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
      middle: round(middle),
      path,
      label: whole && inner === 0 ? { x: cx, y: cy } : pointAt(cx, cy, labelRadius, middle),
      room,
      anchor: pointAt(cx, cy, radius + 6, middle),
    });
    start = end;
  }
  return slices;
}
