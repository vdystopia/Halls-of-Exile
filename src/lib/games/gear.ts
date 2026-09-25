import type { Gem, ParsedItem } from "../types";
import { findItemArt as poe1Art, type ItemArt } from "./poe1/item-art";
import { DOLL_COLUMNS as POE1_COLUMNS, FLASK_SLOTS as POE1_FLASKS, PAPER_DOLL as POE1_DOLL, type DollCell } from "./poe1/items";
import { GEM_COLOR_CLASS, gemColor as poe1GemColor, type GemColor } from "./poe1/gems";
import { buildTooltip as poe1Tooltip, type TooltipSection } from "./poe1/tooltip";
import { gemColor as poe2GemColor } from "./poe2/gems";
import { DOLL_COLUMNS as POE2_COLUMNS, FLASK_SLOTS as POE2_FLASKS, PAPER_DOLL as POE2_DOLL } from "./poe2/items";
import { buildTooltip as poe2Tooltip } from "./poe2/tooltip";
import type { GameId } from "./types";

/**
 * How each game draws a character's gear and gems. Server-only: the Path of
 * Exile 1 art catalogue and tooltip read indexes that must stay out of the
 * browser, so a page resolves everything here and hands finished pieces down.
 *
 * Path of Exile 2 has no local item art — its items name the picture the game
 * serves, which `GearSlot` falls back to — and it never looks anything up in
 * Path of Exile 1's catalogue: the two games share base and gem names and not
 * the numbers, pictures or colours behind them.
 */
type Gear = {
  doll: DollCell[];
  columns: number;
  flaskSlots: readonly string[];
  art: (item: ParsedItem) => ItemArt | null;
  tooltip: (item: ParsedItem) => TooltipSection[];
  gemColor: (gem: Pick<Gem, "name" | "gemId" | "color">) => GemColor | null;
};

const GEAR: Record<GameId, Gear> = {
  poe1: {
    doll: POE1_DOLL,
    columns: POE1_COLUMNS,
    flaskSlots: POE1_FLASKS,
    art: poe1Art,
    tooltip: poe1Tooltip,
    gemColor: poe1GemColor,
  },
  poe2: {
    doll: POE2_DOLL,
    columns: POE2_COLUMNS,
    flaskSlots: POE2_FLASKS,
    art: () => null,
    tooltip: poe2Tooltip,
    gemColor: poe2GemColor,
  },
};

export function gearFor(game: GameId): Gear {
  return GEAR[game];
}

export { GEM_COLOR_CLASS };
