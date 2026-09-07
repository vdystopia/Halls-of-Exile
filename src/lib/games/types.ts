import type { BuildData, Gem, ParsedItem } from "../types";
import type { ItemArt } from "./poe1/item-art";
import type { AscendancyIcon } from "./poe1/ascendancy";
import type { GemColor } from "./poe1/gems";
import type { DollCell } from "./poe1/items";
import type { StatPanel } from "./poe1/stats";
import type { TooltipSection } from "./poe1/tooltip";

/**
 * The two games the archive holds. Path of Exile and Path of Exile 2 share a
 * launcher, a publisher and most of their vocabulary, and almost nothing else:
 * an item, a gem and a passive tree mean different things in each, so each game
 * brings its own reading of a build and its own way of drawing one.
 */
export type GameId = "poe1" | "poe2";

export const GAME_IDS: readonly GameId[] = ["poe1", "poe2"];

export function isGameId(value: unknown): value is GameId {
  return value === "poe1" || value === "poe2";
}

/**
 * Everything the archive needs to know about one game. A page or component asks
 * the registry for a module and never branches on the game itself — a rule that
 * exists because the subtlest logic in this project (the implicit boundary, a
 * shield's block, attribute scaling) is exactly where a second game's rules
 * would silently corrupt the first game's characters.
 */
export type GameModule = {
  id: GameId;
  /** "Path of Exile 2", for a page title or a heading. */
  name: string;
  /** "PoE 2", for a badge or a checkbox. */
  short: string;

  /** Turn a share code from this game's Path of Building into a build. */
  parse: (code: string) => BuildData;
  /**
   * Bumped when a parser change makes stored builds of this game wrong;
   * `migrate()` re-parses anything older. Versions are per game so fixing one
   * parser leaves the other game's characters alone.
   */
  parserVersion: number;

  /** The equipment grid: which slots exist and where they sit. */
  paperDoll: DollCell[];
  flaskSlots: readonly string[];
  socketColorClass: Record<string, string>;

  /** Which stats are shown, in what order, and how a raw key reads. */
  offencePanels: StatPanel[];
  defencePanels: StatPanel[];
  humanizeStatKey: (key: string) => string;

  buildTooltip: (item: ParsedItem) => TooltipSection[];
  findItemArt: (item: { name: string; base: string; rarity?: string }) => ItemArt | null;
  gemColor: (gem: Pick<Gem, "name" | "gemId">) => GemColor | null;
  ascendancyIcon: (ascendancy?: string | null) => AscendancyIcon | null;
};
