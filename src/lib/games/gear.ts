import type { Gem, ParsedItem } from "../types";
import { findItemArt as poe1Art, type ItemArt } from "./poe1/item-art";
import { DOLL_COLUMNS as POE1_COLUMNS, FLASK_SLOTS as POE1_FLASKS, PAPER_DOLL as POE1_DOLL, type DollCell } from "./poe1/items";
import { GEM_COLOR_CLASS, gemColor as poe1GemColor, type GemColor } from "./poe1/gems";
import { DEFENCE_PANELS as POE1_DEFENCE, OFFENCE_PANELS as POE1_OFFENCE, type StatPanel } from "./poe1/stats";
import { buildTooltip as poe1Tooltip, type TooltipSection } from "./poe1/tooltip";
import { treeAsset as poe1TreeAsset } from "./poe1/tree";
import { gemColor as poe2GemColor } from "./poe2/gems";
import { findItemArt as poe2Art } from "./poe2/item-art";
import { DOLL_COLUMNS as POE2_COLUMNS, FLASK_SLOTS as POE2_FLASKS, PAPER_DOLL as POE2_DOLL } from "./poe2/items";
import { DEFENCE_PANELS as POE2_DEFENCE, OFFENCE_PANELS as POE2_OFFENCE } from "./poe2/stats";
import { buildTooltip as poe2Tooltip } from "./poe2/tooltip";
import type { GameId } from "./types";

/**
 * How each game draws a character's gear and gems. Server-only: the Path of
 * Exile 1 art catalogue and tooltip read indexes that must stay out of the
 * browser, so a page resolves everything here and hands finished pieces down.
 *
 * Path of Exile 2 has its own item art index (`npm run art:poe2`), and never
 * looks anything up in Path of Exile 1's catalogue: the two games share base and gem names and not
 * the numbers, pictures or colours behind them.
 */
type Gear = {
  doll: DollCell[];
  columns: number;
  flaskSlots: readonly string[];
  art: (item: ParsedItem) => ItemArt | null;
  tooltip: (item: ParsedItem) => TooltipSection[];
  gemColor: (gem: Pick<Gem, "name" | "gemId" | "color">) => GemColor | null;
  /** Which computed stats the character page shows, in what order. */
  defencePanels: StatPanel[];
  offencePanels: StatPanel[];
  /**
   * The drawn tree a build's version is shown on, or null where this game has
   * none yet. Path of Exile 2 has none: drawing its passives on Path of Exile
   * 1's newest tree — the fallback that game uses for an ungenerated version —
   * would light unrelated nodes, so nothing is drawn rather than something wrong.
   */
  treeAsset: (version?: string) => ReturnType<typeof poe1TreeAsset> | null;
};

const GEAR: Record<GameId, Gear> = {
  poe1: {
    doll: POE1_DOLL,
    columns: POE1_COLUMNS,
    flaskSlots: POE1_FLASKS,
    art: poe1Art,
    tooltip: poe1Tooltip,
    gemColor: poe1GemColor,
    defencePanels: POE1_DEFENCE,
    offencePanels: POE1_OFFENCE,
    treeAsset: poe1TreeAsset,
  },
  poe2: {
    doll: POE2_DOLL,
    columns: POE2_COLUMNS,
    flaskSlots: POE2_FLASKS,
    art: poe2Art,
    tooltip: poe2Tooltip,
    gemColor: poe2GemColor,
    defencePanels: POE2_DEFENCE,
    offencePanels: POE2_OFFENCE,
    treeAsset: () => null,
  },
};

export function gearFor(game: GameId): Gear {
  return GEAR[game];
}

export { GEM_COLOR_CLASS };
