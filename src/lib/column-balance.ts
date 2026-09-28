import { resolvePanels, type StatPanel } from "@/lib/games/shared/stats";
import type { SkillGroup } from "@/lib/types";

/**
 * Which side of the character page the resistances and attributes go under.
 * The two side columns differ by game: Path of Exile 2's skill list runs long,
 * Path of Exile 1's is short, and whichever column ends first leaves dead space
 * above the passive tree. The two small panels go under the shorter one.
 *
 * Decided on the server from what each column will draw, not measured in the
 * browser, so the page never jumps once it has loaded. The figures are the
 * stylesheet's own heights in pixels (`.stat-row` is text-sm plus py-1.5, a gem
 * line is text-sm plus space-y-1); a long gem name that wraps is not counted,
 * which only matters when the two columns are within a line of each other.
 */
const PANEL = 38 + 16; // header, and the gap to the next panel
const STAT_SECTION = 36; // a section's own small title and padding
const STAT_ROW = 32;
const SKILL_GROUP = 24 + 26 + 1; // padding, the slot line, the divider
const GEM_ROW = 24;

export function statColumnHeight(stats: Record<string, number>, panels: StatPanel[]): number {
  const resolved = resolvePanels(stats, panels);
  if (!resolved.length) return 0;
  return PANEL + resolved.reduce((sum, panel) => sum + STAT_SECTION + panel.rows.length * STAT_ROW, 0);
}

export function skillColumnHeight(groups: SkillGroup[]): number {
  return PANEL + groups.reduce((sum, group) => sum + SKILL_GROUP + group.gems.length * GEM_ROW, 0);
}

/** "left" when the stat column ends first (or the two tie), else "right". */
export function shorterSide(leftHeight: number, rightHeight: number): "left" | "right" {
  return leftHeight <= rightHeight ? "left" : "right";
}
