import type { Gem, ParsedItem, TreeSpec } from "../types";
import { clusterLayout, drawnAllocation, type ClusterLayout } from "./poe1/clusters";
import { chosenMasteries } from "./poe1/masteries";
import { TREE_DATA as POE1_TREE_DATA } from "./poe1/tree-data";
import { ATTRIBUTE_STATS, CHARGE_STATS, RESISTANCES } from "./poe1/stats";
import { humanizeStatKey, type StatDef } from "./shared/stats";
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
import { chosenOptions, treeAscendancy as poe2TreeAscendancy, treeAsset as poe2TreeAsset } from "./poe2/tree";
import { TREE_DATA as POE2_TREE_DATA } from "./poe2/tree-data";
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
   * The drawn tree a build's version is shown on: `npm run tree:svg` for Path
   * of Exile 1, `npm run tree:poe2` for Path of Exile 2. Each game only ever
   * falls back to its own newest tree — one game's passives on the other's
   * tree would light unrelated nodes.
   */
  treeAsset: (version?: string) => ReturnType<typeof poe1TreeAsset> | null;
  /**
   * What an allocated passive became where the tree's own node cannot say, by
   * node id: Path of Exile 2's "choose one" ascendancy passives, named by the
   * option the build took. Read from the drawn version's server-side data.
   */
  choices: (nodes: number[] | undefined, drawnVersion: string | undefined) => Record<string, { name: string; stats: string[] }> | undefined;
  /** The ascendancy whose passives the drawn tree reveals for a character of this one. */
  treeAscendancy: (ascendancy: string | null | undefined) => string | null;
  /**
   * What the drawn tree adds to the empty one for this build, laid out on the
   * server against the version being drawn: Path of Exile 1's cluster jewels
   * (their passives exist only once a jewel is socketed), the allocation those
   * change, and each mastery's chosen effect. Path of Exile 2 has none of them,
   * so its allocation is the build's own.
   */
  treeLayers: (tree: TreeSpec | undefined, drawnVersion: string | undefined) => TreeLayers;
  /** How a raw stat key reads where no panel names it. */
  statLabel: (key: string) => string;
  attributeStats: StatDef[];
  chargeStats: StatDef[];
  resistances: { key: string; label: string; tone: string }[];
};

export type TreeLayers = { clusters: ClusterLayout | null; allocation: number[]; masteries: Record<string, string[]> };
export type { ClusterLayout };

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
    choices: () => undefined,
    treeAscendancy: (ascendancy) => ascendancy ?? null,
    treeLayers: (tree, version) => {
      const data = version ? POE1_TREE_DATA[version] : undefined;
      const clusters = clusterLayout(tree, data);
      return {
        clusters,
        allocation: tree ? drawnAllocation(tree, clusters, data) : [],
        masteries: chosenMasteries(tree, data),
      };
    },
    statLabel: humanizeStatKey,
    attributeStats: ATTRIBUTE_STATS,
    chargeStats: CHARGE_STATS,
    resistances: RESISTANCES,
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
    treeAsset: poe2TreeAsset,
    choices: (nodes, version) => chosenOptions(nodes, version ? POE2_TREE_DATA[version] : undefined),
    treeAscendancy: poe2TreeAscendancy,
    treeLayers: (tree) => ({ clusters: null, allocation: tree?.nodes ?? [], masteries: {} }),
    // Path of Building 2 writes its figures under Path of Building's keys, and
    // the game keeps the same attributes, charges and resistances.
    statLabel: humanizeStatKey,
    attributeStats: ATTRIBUTE_STATS,
    chargeStats: CHARGE_STATS,
    resistances: RESISTANCES,
  },
};

export function gearFor(game: GameId): Gear {
  return GEAR[game];
}

export { GEM_COLOR_CLASS };
