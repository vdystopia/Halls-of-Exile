import type { DollCell } from "../poe1/items";

/**
 * Path of Exile 2's paper doll. The equipment slots are the ones Path of Exile
 * 1 has, laid out the same way, so a character from either game reads alike;
 * what differs is the bottom row. Path of Exile 2 has two flasks — life and
 * mana — and up to three charms, which the site reports in one "Flask"
 * inventory (see `site-export.ts`). The second weapon set is drawn beneath the
 * doll with anything else that has no cell.
 */
export const DOLL_COLUMNS = 6;

export const PAPER_DOLL: DollCell[] = [
  { slot: "Weapon 1", label: "Main Hand", shape: "weapon", column: "1 / span 2", row: "1 / span 3" },
  { slot: "Helmet", label: "Helmet", shape: "helmet", column: "3 / span 2", row: "1 / span 2" },
  { slot: "Weapon 2", label: "Off Hand", shape: "offhand", column: "5 / span 2", row: "1 / span 3" },
  { slot: "Body Armour", label: "Body Armour", shape: "body", column: "3 / span 2", row: "3 / span 3" },
  { slot: "Ring 1", label: "Left Ring", shape: "ring", column: "1", row: "4" },
  { slot: "Ring 2", label: "Right Ring", shape: "ring", column: "2", row: "4" },
  { slot: "Amulet", label: "Amulet", shape: "amulet", column: "5", row: "4" },
  { slot: "Gloves", label: "Gloves", shape: "gloves", column: "1 / span 2", row: "5 / span 2" },
  { slot: "Belt", label: "Belt", shape: "belt", column: "3 / span 2", row: "6" },
  { slot: "Boots", label: "Boots", shape: "boots", column: "5 / span 2", row: "5 / span 2" },
];

export const FLASK_SLOTS = ["Flask 1", "Flask 2", "Charm 1", "Charm 2", "Charm 3"];
