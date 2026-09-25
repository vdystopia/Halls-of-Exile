import { DEFENCE_PANELS as POE1_DEFENCE, OFFENCE_PANELS as POE1_OFFENCE, type StatPanel } from "../poe1/stats";

/**
 * Path of Exile 2's stat panels. Path of Building 2 writes its figures under the
 * same keys Path of Building 1 does, so the panels are Path of Exile 1's with
 * what the second game adds: Spirit, the pool skills reserve from, and
 * Deflection, its evasion-adjacent mitigation. A stat a character does not have
 * is left out by the panel, as it is for Path of Exile 1.
 */
export const DEFENCE_PANELS: StatPanel[] = POE1_DEFENCE.map((panel) => {
  if (panel.title === "Pools") {
    return {
      ...panel,
      stats: [
        ...panel.stats,
        { key: "Spirit", label: "Spirit", format: "int", tone: "gold" },
        { key: "SpiritUnreserved", label: "Spirit unreserved", format: "int" },
      ],
    };
  }
  if (panel.title === "Mitigation") {
    const at = panel.stats.findIndex((stat) => stat.key === "MeleeEvadeChance") + 1;
    return {
      ...panel,
      stats: [
        ...panel.stats.slice(0, at),
        { key: "DeflectionRating", label: "Deflection", format: "int" },
        { key: "DeflectChance", label: "Deflect chance", format: "pct" },
        ...panel.stats.slice(at),
      ],
    };
  }
  return panel;
});

export const OFFENCE_PANELS: StatPanel[] = POE1_OFFENCE;
