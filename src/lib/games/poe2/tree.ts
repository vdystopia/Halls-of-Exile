import type { TreeAsset } from "../poe1/tree";
import index from "./tree-versions.json";

const VERSIONS = (index.versions as { version: string }[]).map((entry) => entry.version);

function newest(): string | null {
  return [...VERSIONS].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop() ?? null;
}

/**
 * Which drawn Path of Exile 2 tree a build goes on, by the same rule as Path of
 * Exile 1's: its own version when that has been generated (`npm run tree:poe2`),
 * otherwise the newest, marked inexact so the page says so. Path of Building 2
 * saves `treeVersion="0_5"`, which the parser reads as "0.5".
 */
export function treeAsset(treeVersion?: string | null): TreeAsset | null {
  const latest = newest();
  if (!latest) return null;
  const asked = treeVersion?.trim();
  if (!asked) return { src: `/trees/poe2/${latest}.svg`, version: latest, exact: true };
  if (VERSIONS.includes(asked)) return { src: `/trees/poe2/${asked}.svg`, version: asked, exact: true };
  return { src: `/trees/poe2/${latest}.svg`, version: latest, exact: false };
}

/** Server-side data for one drawn version, written beside the SVG by `npm run tree:poe2`. */
export type Poe2TreeData = {
  version: string;
  commit: string;
  /** Each option of a "choose one" passive: the passive it belongs to, and its own name and text. */
  choices: Record<string, { parent: number; name: string; stats: string[] }>;
};

/**
 * What each allocated "choose one" passive became, keyed by the passive: the
 * option the build took, which the tree's own node cannot say. Deadeye's
 * Projectile Proximity Specialisation reads as Point Blank, with Point Blank's
 * lines.
 */
export function chosenOptions(
  nodes: number[] | undefined,
  data: Poe2TreeData | undefined,
): Record<string, { name: string; stats: string[] }> | undefined {
  if (!nodes?.length || !data) return undefined;
  const chosen: Record<string, { name: string; stats: string[] }> = {};
  for (const id of nodes) {
    const option = data.choices[String(id)];
    if (option) chosen[String(option.parent)] = { name: option.name, stats: option.stats };
  }
  return Object.keys(chosen).length ? chosen : undefined;
}
