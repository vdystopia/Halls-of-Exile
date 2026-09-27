import { AscendancyIcon } from "@/components/AscendancyIcon";
import { ClassTable, type ClassRow } from "@/components/ClassTable";
import { formatPlayed } from "@/lib/format";
import { classNameStyle } from "@/lib/games/class-colors";
import type { GameId } from "@/lib/games/types";
import type { Rollup } from "@/lib/metrics";

/** The page's gold, for a row the class map does not colour. */
const GOLD_BAR = "linear-gradient(100deg, #e8d9a8, #c8aa6e)";

/**
 * The class table's rows, resolved on the server — each class's gem colours
 * for its name and its /played bar, each ascendancy's emblem — and handed to
 * the client table, which only sorts and draws. Nothing from the art indexes
 * reaches the browser.
 *
 * A class the record does not name is never in the table: the finished archive
 * will have none, and a row called "Unknown class" said nothing anyone could
 * act on. An unknown ascendancy under a known class stays, since those are real
 * characters of that class.
 */
export function ClassRollup({ game, classes }: { game: GameId; classes: Rollup[] }) {
  const toRow = (row: Rollup, bar: string, nameStyle?: React.CSSProperties, icon?: React.ReactNode): ClassRow => ({
    name: row.name,
    known: row.known,
    nameStyle,
    bar,
    icon,
    characters: row.characters,
    leagues: row.leagues,
    playedMinutes: row.playedMinutes,
    played: formatPlayed(row.playedMinutes),
    playedRecorded: row.playedRecorded,
    averageLevel: row.averageLevel,
    highestLevel: row.highestLevel,
    children: [],
  });
  const rows = classes
    .filter((row) => row.known)
    .map((row) => {
      const style = classNameStyle(game, row.name);
      const bar = (style as Record<string, string> | undefined)?.["--gem-fill"] ?? GOLD_BAR;
      const parent = toRow(row, bar, style);
      parent.children = row.children.map((child) =>
        toRow(child, bar, undefined, child.known ? <AscendancyIcon game={game} ascendancy={child.name} size={22} /> : undefined),
      );
      return parent;
    });
  return <ClassTable rows={rows} />;
}
