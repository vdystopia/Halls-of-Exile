// Written by scripts/build-tree-svg.ts. Do not edit by hand.
import type { TreeData } from "../clusters";
import v3_28_alternate from "./3.28.alternate.json";
import v3_29 from "./3.29.json";

export const TREE_DATA: Record<string, TreeData> = {
  "3.28.alternate": v3_28_alternate as unknown as TreeData,
  "3.29": v3_29 as unknown as TreeData,
};
