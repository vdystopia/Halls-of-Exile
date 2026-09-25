// Written by scripts/build-poe2-tree-svg.ts. Do not edit by hand.
import type { Poe2TreeData } from "../tree";
import v0_4 from "./0.4.json";
import v0_5 from "./0.5.json";

export const TREE_DATA: Record<string, Poe2TreeData> = {
  "0.4": v0_4 as Poe2TreeData,
  "0.5": v0_5 as Poe2TreeData,
};
