import { ClassPie, type PieClass } from "@/components/ClassPie";
import { ClassRollup } from "@/components/ClassRollup";
import { classSwatch } from "@/lib/games/class-colors";
import { GAME_NAMES, type GameId } from "@/lib/games/types";
import type { Rollup } from "@/lib/metrics";
import { pieSlices } from "@/lib/pie";

/**
 * One game's classes: the pie on the left, the table on the right, each half
 * the panel. The pie is by class, never by ascendancy — the ascendancies are
 * what its flyout shows — and every figure the table prints is in the pie's
 * legend too, so the two halves agree by construction.
 *
 * Geometry and colours are resolved here, on the server, so the client
 * component only draws what it is handed.
 */
export function ClassBreakdown({ game, classes }: { game: GameId; classes: Rollup[] }) {
  const items: PieClass[] = classes.map((row) => ({
    name: row.name,
    known: row.known,
    characters: row.characters,
    swatch: row.known ? classSwatch(game, row.name) : classSwatch(game, null),
    ascendancies: row.children.map((child) => ({ name: child.name, characters: child.characters, known: child.known })),
  }));
  const slices = pieSlices(items, (item) => item.characters, { cx: 120, cy: 120, radius: 104 });
  const total = classes.reduce((sum, row) => sum + row.characters, 0);

  return (
    <div className="panel grid gap-4 p-4 lg:grid-cols-2">
      {/* The table grows as classes are opened; the pie keeps to the top of the
          viewport beside it rather than sinking to the middle of a long column.
          The offset clears the site's sticky header (about 55px) with a gutter. */}
      <div className="self-start lg:sticky lg:top-20">
        <ClassPie slices={slices} total={total} game={GAME_NAMES[game]} />
      </div>
      <ClassRollup game={game} classes={classes} />
    </div>
  );
}
