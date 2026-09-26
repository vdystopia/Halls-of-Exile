import { ClassPie, type PieClass } from "@/components/ClassPie";
import { ClassRollup } from "@/components/ClassRollup";
import { classFill, classRingOrder, classSwatch } from "@/lib/games/class-colors";
import { keystoneFrame } from "@/lib/games/keystones";
import { GAME_NAMES, type GameId } from "@/lib/games/types";
import type { Rollup } from "@/lib/metrics";
import { pieSlices } from "@/lib/pie";

/** The pie's own coordinates. The radius reaches a little past the ring's window so the wheel tucks under it. */
export const PIE = { cx: 120, cy: 120, radius: 118 };

/**
 * One game's classes: the pie on the left, the table on the right, each half
 * the panel. The pie is by class, never by ascendancy — the ascendancies are
 * what its flyout shows — and every figure the table prints is in the pie's
 * legend too, so the two halves agree by construction.
 *
 * The slices go round in the passive tree's order, Witch centred at the top
 * and Shadow, Ranger, Duelist, Marauder, Templar clockwise from there, so the
 * pie is a rough map of the tree; each hybrid's colour runs from the solid
 * class before it into the one after, and the whole is one wheel.
 *
 * Geometry, order and colours are resolved here, on the server, so the client
 * component only draws what it is handed.
 */
export function ClassBreakdown({ game, classes }: { game: GameId; classes: Rollup[] }) {
  const { order, top } = classRingOrder(game, classes.map((row) => row.name));
  const byName = new Map(classes.map((row) => [row.name, row]));
  const items: PieClass[] = order.map((name) => {
    const row = byName.get(name)!;
    return {
      name: row.name,
      known: row.known,
      characters: row.characters,
      swatch: row.known ? classSwatch(game, row.name) : classSwatch(game, null),
      fill: row.known ? classFill(game, row.name) : { kind: "stone" },
      ascendancies: row.children.map((child) => ({ name: child.name, characters: child.characters, known: child.known })),
    };
  });
  const total = classes.reduce((sum, row) => sum + row.characters, 0);
  // Centre the top group (Witch; Witch and Sorceress in Path of Exile 2) on
  // twelve o'clock: the wheel starts half that group's sweep before the top.
  const topShare = total ? items.filter((item) => top.includes(item.name)).reduce((sum, item) => sum + item.characters, 0) / total : 0;
  const slices = pieSlices(items, (item) => item.characters, { ...PIE, offset: -(topShare * 360) / 2 });

  return (
    <div className="panel grid gap-4 p-4 lg:grid-cols-2">
      {/* The table grows as classes are opened; the pie keeps to the top of the
          viewport beside it rather than sinking to the middle of a long column.
          The offset clears the site's sticky header (about 55px) with a gutter. */}
      <div className="self-start lg:sticky lg:top-20">
        <ClassPie slices={slices} total={total} game={GAME_NAMES[game]} frame={keystoneFrame(game)} />
      </div>
      <ClassRollup game={game} classes={classes} />
    </div>
  );
}
