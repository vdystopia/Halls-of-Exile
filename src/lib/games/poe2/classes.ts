/**
 * Path of Exile 2's classes and their ascendancies, taken from the 0.5 passive
 * tree that Path of Building 2 ships (`src/TreeData/0_5/tree.json`), which is
 * Grinding Gear Games' own export.
 *
 * Nothing here is shared with Path of Exile 1. Two class names appear in both
 * games — Ranger and Witch — and two ascendancy names do — Deadeye and
 * Pathfinder — and in every case they are different things with different
 * passives, which is the whole reason the games are kept apart in this codebase
 * rather than merged into one catalogue.
 */
export const ASCENDANCIES: Record<string, string[]> = {
  Warrior: ["Titan", "Warbringer", "Smith of Kitava"],
  Ranger: ["Deadeye", "Pathfinder"],
  Witch: ["Infernalist", "Blood Mage", "Lich", "Abyssal Lich"],
  Monk: ["Invoker", "Acolyte of Chayula", "Martial Artist"],
  Mercenary: ["Witchhunter", "Gemling Legionnaire", "Tactician"],
  Sorceress: ["Stormweaver", "Chronomancer", "Disciple of Varashta"],
  Huntress: ["Amazon", "Ritualist", "Spirit Walker"],
  Druid: ["Oracle", "Shaman"],
};

export const CLASSES = Object.keys(ASCENDANCIES);

/**
 * The game's own id for each ascendancy, as the character endpoints report it:
 * a character's `class` is one of these ("Monk3"), never a display name, and
 * the number is not the order `ASCENDANCIES` lists them in — Monk3 is Acolyte
 * of Chayula, not Martial Artist. Read from `classes[].ascendancies[]` in the
 * site's own tree data (`/internal-api/content/game-passive-skill-tree`) on
 * 2026-09-25. Ranger2 and Druid3 are there with no name: slots not yet filled.
 */
export const ASCENDANCY_IDS: Record<string, { className: string; ascendancy: string }> = {
  Witch1: { className: "Witch", ascendancy: "Infernalist" },
  Witch2: { className: "Witch", ascendancy: "Blood Mage" },
  Witch3: { className: "Witch", ascendancy: "Lich" },
  Witch3b: { className: "Witch", ascendancy: "Abyssal Lich" },
  Ranger1: { className: "Ranger", ascendancy: "Deadeye" },
  Ranger3: { className: "Ranger", ascendancy: "Pathfinder" },
  Warrior1: { className: "Warrior", ascendancy: "Titan" },
  Warrior2: { className: "Warrior", ascendancy: "Warbringer" },
  Warrior3: { className: "Warrior", ascendancy: "Smith of Kitava" },
  Sorceress1: { className: "Sorceress", ascendancy: "Stormweaver" },
  Sorceress2: { className: "Sorceress", ascendancy: "Chronomancer" },
  Sorceress3: { className: "Sorceress", ascendancy: "Disciple of Varashta" },
  Huntress1: { className: "Huntress", ascendancy: "Amazon" },
  Huntress2: { className: "Huntress", ascendancy: "Spirit Walker" },
  Huntress3: { className: "Huntress", ascendancy: "Ritualist" },
  Mercenary1: { className: "Mercenary", ascendancy: "Tactician" },
  Mercenary2: { className: "Mercenary", ascendancy: "Witchhunter" },
  Mercenary3: { className: "Mercenary", ascendancy: "Gemling Legionnaire" },
  Monk1: { className: "Monk", ascendancy: "Martial Artist" },
  Monk2: { className: "Monk", ascendancy: "Invoker" },
  Monk3: { className: "Monk", ascendancy: "Acolyte of Chayula" },
  Druid1: { className: "Druid", ascendancy: "Oracle" },
  Druid2: { className: "Druid", ascendancy: "Shaman" },
};

/**
 * A character's class and ascendancy from the id the endpoints give. An id with
 * no number is an unascended character, and names only its class; an id this
 * table does not know keeps its class letters and no ascendancy, rather than a
 * guess.
 */
export function classFromId(id: string | null | undefined): { className: string | null; ascendancy: string | null } {
  const value = id?.trim();
  if (!value) return { className: null, ascendancy: null };
  const known = ASCENDANCY_IDS[value];
  if (known) return known;
  const base = /^([A-Za-z]+)/.exec(value)?.[1] ?? null;
  return { className: base && CLASSES.includes(base) ? base : null, ascendancy: null };
}
