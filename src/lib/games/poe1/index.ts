import type { GameModule } from "../types";
import { ascendancyIcon } from "./ascendancy";
import { gemColor } from "./gems";
import { findItemArt } from "./item-art";
import { FLASK_SLOTS, PAPER_DOLL, SOCKET_COLOR_CLASS } from "./items";
import { PARSER_VERSION, parsePob } from "./pob";
import { DEFENCE_PANELS, humanizeStatKey, OFFENCE_PANELS } from "./stats";
import { buildTooltip } from "./tooltip";

export const poe1: GameModule = {
  id: "poe1",
  name: "Path of Exile",
  short: "PoE 1",
  parse: parsePob,
  parserVersion: PARSER_VERSION,
  paperDoll: PAPER_DOLL,
  flaskSlots: FLASK_SLOTS,
  socketColorClass: SOCKET_COLOR_CLASS,
  offencePanels: OFFENCE_PANELS,
  defencePanels: DEFENCE_PANELS,
  humanizeStatKey,
  buildTooltip,
  findItemArt,
  gemColor,
  ascendancyIcon,
};
