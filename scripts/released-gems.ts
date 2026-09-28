/**
 * Gems RePoE marks `release_state: "unreleased"` that the game has in fact
 * released. The gem scripts drop unreleased gems, which is right for the cut and
 * internal rows ("[UNUSED] Blitz", "Vaal FireTrap") and wrong for these, which
 * then went missing from every index: no colour, no art, no tags, and not
 * offered as a skill. Keyed by base item id, so a gem's transfigured versions
 * follow it. Checked against the whole unreleased list on 2026-09-28; Blade Trap
 * (3.23) was the only playable gem in it.
 */
export const MISLABELLED_RELEASED = new Set(["Metadata/Items/Gems/SkillGemBladeTrap"]);

export function isUnreleased(id: string | undefined, releaseState: string | undefined): boolean {
  return releaseState === "unreleased" && !(id && MISLABELLED_RELEASED.has(id));
}
