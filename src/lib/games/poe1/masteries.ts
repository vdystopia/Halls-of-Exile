import type { TreeData } from "./clusters";
import type { TreeSpec } from "../../types";

/**
 * What each allocated mastery actually does, for the tree's tooltip.
 *
 * A mastery offers a handful of effects and the player picks one; the rest do
 * nothing. The tree data names the mastery and the build records which effect
 * was chosen, so this joins the two: mastery node id to the chosen effect's
 * lines. The inactive options are deliberately left out — the tooltip shows
 * what the character had, not what it could have had.
 *
 * Resolved on the server against the tree version being drawn, like the
 * cluster layout. An effect id the drawn tree does not know — a build shown on
 * a fallback version whose masteries changed — is simply omitted, and the
 * tooltip falls back to the mastery's name alone.
 */
export function chosenMasteries(tree: TreeSpec | undefined, data: TreeData | undefined): Record<string, string[]> {
  const chosen: Record<string, string[]> = {};
  if (!tree?.masteryEffects || !data?.masteryEffects) return chosen;
  for (const [node, effect] of Object.entries(tree.masteryEffects)) {
    const lines = data.masteryEffects[String(effect)];
    if (lines?.length) chosen[node] = lines;
  }
  return chosen;
}
