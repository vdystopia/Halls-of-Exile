/**
 * Where a passive sits, given the orbit it is on and its place in that orbit.
 *
 * Shared by the tree generator and by the cluster jewel layout, because both
 * have to agree to the unit: a cluster's entry node is joined by a line to a
 * socket on the main tree, and if the two are placed by different rules the
 * line lands beside the socket rather than on it.
 *
 * Ported from Path of Building's `PassiveTreeClass:CalcOrbitAngles` and
 * `ProcessNode`. The part that matters is that orbits are **not** evenly
 * spaced when they hold 16 or 40 passives: since 3.17 Grinding Gear Games place
 * those at every 30 and 45 degrees, and every 10 and 45, as their export's own
 * README states. Spacing them evenly — which is what this archive did at first —
 * puts a node on a 16-slot orbit up to 7.5 degrees from where the game draws it,
 * which on the outer orbits is about a node's width.
 */

const SIXTEEN = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
const FORTY = [
  0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190,
  200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350,
];

/** Radians clockwise from twelve o'clock, as the game measures an orbit. */
export function orbitAngle(index: number, skillsInOrbit: number): number {
  const degrees =
    skillsInOrbit === 16
      ? SIXTEEN[index]
      : skillsInOrbit === 40
        ? FORTY[index]
        : (360 * index) / Math.max(1, skillsInOrbit);
  return ((degrees ?? 0) * Math.PI) / 180;
}

/**
 * The point on an orbit. Clockwise from the top, so sine gives x and a
 * negated cosine gives y — SVG's y axis runs downward, as the game's does.
 */
export function orbitPoint(
  centreX: number,
  centreY: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  return { x: centreX + Math.sin(angle) * radius, y: centreY - Math.cos(angle) * radius };
}

/** What a drawn passive is, which decides its size and how it is styled. */
export type NodeKind = "Keystone" | "Notable" | "Mastery" | "Jewel" | "Ascendancy" | "Start" | "Normal";

/** Visible radius per kind, in tree units. A keystone reads as the big one. */
export const NODE_RADIUS: Record<NodeKind, number> = {
  Keystone: 80,
  Start: 70,
  Notable: 62,
  Mastery: 50,
  Jewel: 58,
  Ascendancy: 45,
  Normal: 42,
};

/**
 * The arc joining two nodes on the same orbit of the same group, as an SVG path.
 *
 * With the large-arc flag off, both sweep values give an arc of the same length
 * and differ only in which side of the chord it bulges — so the sweep has to be
 * decided by the two nodes' angles about the orbit's own centre. Measuring them
 * about anything else gets half the arcs curving inward across the group.
 */
export function arcPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  centre: { x: number; y: number },
  radius: number,
): string {
  const a = Math.atan2(from.y - centre.y, from.x - centre.x);
  const b = Math.atan2(to.y - centre.y, to.x - centre.x);
  // SVG's y runs downward, so a rising angle is clockwise on screen, which is
  // the direction sweep 1 draws. Under half a turn is the short way round.
  const sweep = (b - a + 2 * Math.PI) % (2 * Math.PI) < Math.PI ? 1 : 0;
  const r = Math.round(radius);
  return `M ${Math.round(from.x)} ${Math.round(from.y)} A ${r} ${r} 0 0 ${sweep} ${Math.round(to.x)} ${Math.round(to.y)}`;
}
