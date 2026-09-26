import { ClassPie, type PieClass } from "@/components/ClassPie";
import { ClassRollup } from "@/components/ClassRollup";
import { classFill, classRingOrder, classSwatch } from "@/lib/games/class-colors";
import { GAME_NAMES, type GameId } from "@/lib/games/types";
import type { Rollup } from "@/lib/metrics";
import { pieSlices } from "@/lib/pie";

/** The wheel's own coordinates: a 240 box with a hair of margin for the rim. */
export const PIE = { cx: 120, cy: 120, radius: 112 };
/** The hub is never smaller than this share of the radius, so its name fits; nor larger, so the ring keeps its bands. */
const HUB_MIN = 0.2;
const HUB_MAX = 0.5;

/**
 * One game's classes: the wheel on the left, the table on the right, each half
 * the panel. The wheel is by class, never by ascendancy — the ascendancies are
 * what its flyout shows.
 *
 * The wheel is a map of the tree. The six classes on the tree's ring go round
 * it in the tree's order, Witch centred at the top and Shadow, Ranger, Duelist,
 * Marauder, Templar clockwise from there, each hybrid's colour running from
 * the solid class before it into the one after. Scion, at the tree's centre,
 * is the hub in the middle, painted in the same wheel so its colours line up
 * with the ring around it; its area is its share of the characters. A class the
 * record does not name is not on the wheel at all: the table has it, and the
 * finished archive will have none.
 *
 * Geometry, order and colours are resolved here, on the server, so the client
 * component only draws what it is handed.
 */
export function ClassBreakdown({ game, classes }: { game: GameId; classes: Rollup[] }) {
  const known = classes.filter((row) => row.known);
  const toPie = (row: Rollup): PieClass => ({
    name: row.name,
    characters: row.characters,
    swatch: classSwatch(game, row.name),
    fill: classFill(game, row.name),
    ascendancies: row.children.map((child) => ({ name: child.name, characters: child.characters, known: child.known })),
  });
  const total = known.reduce((sum, row) => sum + row.characters, 0);
  const { order, top, centre } = classRingOrder(
    game,
    known.map((row) => row.name),
  );
  const byName = new Map(known.map((row) => [row.name, row]));
  const ring = order.filter((name) => !centre.includes(name)).map((name) => toPie(byName.get(name)!));
  const hubRow = centre.map((name) => byName.get(name)!)[0] ?? null;
  const hub = hubRow ? toPie(hubRow) : null;

  // The hub's area is Scion's share of the whole disc, within the bounds that
  // keep its name legible and the ring's bands readable.
  const hubShare = hub && total ? hub.characters / total : 0;
  const hubRadius = hub ? Math.round(PIE.radius * Math.min(HUB_MAX, Math.max(HUB_MIN, Math.sqrt(hubShare))) * 100) / 100 : Math.round(PIE.radius * 0.12);
  // Centre the top group (Witch; Witch and Sorceress in Path of Exile 2) on
  // twelve o'clock: the ring starts half that group's sweep before the top.
  const ringTotal = ring.reduce((sum, item) => sum + item.characters, 0);
  const topShare = ringTotal ? ring.filter((item) => top.includes(item.name)).reduce((sum, item) => sum + item.characters, 0) / ringTotal : 0;
  const slices = pieSlices(ring, (item) => item.characters, { ...PIE, innerRadius: hubRadius, offset: -(topShare * 360) / 2 });

  return (
    <div className="panel grid gap-4 p-4 lg:grid-cols-2">
      {/* The table grows as classes are opened; the wheel keeps to the top of the
          viewport beside it rather than sinking to the middle of a long column.
          The offset clears the site's sticky header (about 55px) with a gutter. */}
      <div className="self-start lg:sticky lg:top-20">
        <ClassPie slices={slices} hub={hub ? { item: hub, share: hubShare, radius: hubRadius } : { item: null, share: 0, radius: hubRadius }} total={total} game={GAME_NAMES[game]} />
      </div>
      <ClassRollup game={game} classes={classes} />
    </div>
  );
}
