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
