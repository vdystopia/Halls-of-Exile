/**
 * Catalogue of Path of Exile challenge leagues.
 *
 * Dates are the challenge league's live window (launch -> the launch of the
 * next league, when the previous league's characters were migrated to Standard).
 * Challenge counts are the totals for that league's challenge set.
 *
 * Anything missing (a league released after this file was written, a private
 * league, an event) can be added from the UI - see "Add a league" on any
 * player page. Rows added that way are marked `isCustom` and are never
 * overwritten by this catalogue.
 */
export type LeagueSeed = {
  patch: string;
  name: string;
  expansion?: string;
  startDate: string | null;
  endDate: string | null;
  challengeTotal: number;
  /** The end date is a projection, not an announced date: the league is still running. */
  endDateEstimated?: boolean;
};

export const LEAGUE_SEED: LeagueSeed[] = [
  { patch: "1.0", name: "Domination / Nemesis", startDate: "2013-10-23", endDate: "2014-03-05", challengeTotal: 8 },
  { patch: "1.1", name: "Ambush / Invasion", expansion: "Sacrifice of the Vaal", startDate: "2014-03-05", endDate: "2014-08-20", challengeTotal: 8 },
  { patch: "1.2", name: "Rampage / Beyond", expansion: "Forsaken Masters", startDate: "2014-08-20", endDate: "2014-12-12", challengeTotal: 8 },
  { patch: "1.3", name: "Torment / Bloodlines", startDate: "2014-12-12", endDate: "2015-07-10", challengeTotal: 8 },
  { patch: "2.0", name: "Tempest / Warbands", expansion: "The Awakening", startDate: "2015-07-10", endDate: "2015-12-11", challengeTotal: 32 },
  { patch: "2.1", name: "Talisman", startDate: "2015-12-11", endDate: "2016-03-04", challengeTotal: 32 },
  { patch: "2.2", name: "Perandus", expansion: "Ascendancy", startDate: "2016-03-04", endDate: "2016-06-03", challengeTotal: 32 },
  { patch: "2.3", name: "Prophecy", startDate: "2016-06-03", endDate: "2016-09-02", challengeTotal: 32 },
  { patch: "2.4", name: "Essence", expansion: "Atlas of Worlds", startDate: "2016-09-02", endDate: "2016-12-02", challengeTotal: 36 },
  { patch: "2.5", name: "Breach", startDate: "2016-12-02", endDate: "2017-03-03", challengeTotal: 36 },
  { patch: "2.6", name: "Legacy", startDate: "2017-03-03", endDate: "2017-08-04", challengeTotal: 36 },
  { patch: "3.0", name: "Harbinger", expansion: "The Fall of Oriath", startDate: "2017-08-04", endDate: "2017-12-08", challengeTotal: 40 },
  { patch: "3.1", name: "Abyss", expansion: "War for the Atlas", startDate: "2017-12-08", endDate: "2018-03-02", challengeTotal: 40 },
  { patch: "3.2", name: "Bestiary", startDate: "2018-03-02", endDate: "2018-06-01", challengeTotal: 40 },
  { patch: "3.3", name: "Incursion", startDate: "2018-06-01", endDate: "2018-08-31", challengeTotal: 40 },
  { patch: "3.4", name: "Delve", startDate: "2018-08-31", endDate: "2018-12-07", challengeTotal: 40 },
  { patch: "3.5", name: "Betrayal", startDate: "2018-12-07", endDate: "2019-03-08", challengeTotal: 40 },
  { patch: "3.6", name: "Synthesis", startDate: "2019-03-08", endDate: "2019-06-07", challengeTotal: 40 },
  { patch: "3.7", name: "Legion", expansion: "Legion", startDate: "2019-06-07", endDate: "2019-09-06", challengeTotal: 40 },
  { patch: "3.8", name: "Blight", startDate: "2019-09-06", endDate: "2019-12-13", challengeTotal: 40 },
  { patch: "3.9", name: "Metamorph", expansion: "Conquerors of the Atlas", startDate: "2019-12-13", endDate: "2020-03-13", challengeTotal: 40 },
  { patch: "3.10", name: "Delirium", startDate: "2020-03-13", endDate: "2020-06-19", challengeTotal: 40 },
  { patch: "3.11", name: "Harvest", startDate: "2020-06-19", endDate: "2020-09-18", challengeTotal: 40 },
  { patch: "3.12", name: "Heist", startDate: "2020-09-18", endDate: "2021-01-15", challengeTotal: 40 },
  { patch: "3.13", name: "Ritual", expansion: "Echoes of the Atlas", startDate: "2021-01-15", endDate: "2021-04-16", challengeTotal: 40 },
  { patch: "3.14", name: "Ultimatum", startDate: "2021-04-16", endDate: "2021-07-23", challengeTotal: 40 },
  { patch: "3.15", name: "Expedition", startDate: "2021-07-23", endDate: "2021-10-22", challengeTotal: 40 },
  { patch: "3.16", name: "Scourge", startDate: "2021-10-22", endDate: "2022-02-04", challengeTotal: 40 },
  { patch: "3.17", name: "Archnemesis", expansion: "Siege of the Atlas", startDate: "2022-02-04", endDate: "2022-05-13", challengeTotal: 40 },
  { patch: "3.18", name: "Sentinel", startDate: "2022-05-13", endDate: "2022-08-19", challengeTotal: 40 },
  { patch: "3.19", name: "Lake of Kalandra", startDate: "2022-08-19", endDate: "2022-12-09", challengeTotal: 40 },
  { patch: "3.20", name: "The Forbidden Sanctum", startDate: "2022-12-09", endDate: "2023-04-07", challengeTotal: 40 },
  { patch: "3.21", name: "Crucible", startDate: "2023-04-07", endDate: "2023-08-18", challengeTotal: 40 },
  { patch: "3.22", name: "Trial of the Ancestors", startDate: "2023-08-18", endDate: "2023-12-08", challengeTotal: 40 },
  { patch: "3.23", name: "Affliction", startDate: "2023-12-08", endDate: "2024-03-29", challengeTotal: 40 },
  { patch: "3.24", name: "Necropolis", startDate: "2024-03-29", endDate: "2024-07-26", challengeTotal: 40 },
  { patch: "3.25", name: "Settlers of Kalguur", startDate: "2024-07-26", endDate: "2025-06-13", challengeTotal: 40 },
  { patch: "3.26", name: "Mercenaries of Trarthus", expansion: "Secrets of the Atlas", startDate: "2025-06-13", endDate: "2025-10-31", challengeTotal: 40 },
  { patch: "3.27", name: "Keepers of the Flame", startDate: "2025-10-31", endDate: "2026-03-05", challengeTotal: 40 },
  { patch: "3.28", name: "Mirage", startDate: "2026-03-05", endDate: "2026-07-24", challengeTotal: 40 },
  {
    patch: "3.29",
    name: "Curse of the Allflame",
    startDate: "2026-07-24",
    // Grinding Gear Games has not announced an end date. Four months is the
    // recent cadence, so this is a placeholder and is shown as tentative.
    endDate: "2026-11-24",
    endDateEstimated: true,
    challengeTotal: 40,
  },
];

export const ASCENDANCIES: Record<string, string[]> = {
  Marauder: ["Juggernaut", "Berserker", "Chieftain"],
  Duelist: ["Slayer", "Gladiator", "Champion"],
  Ranger: ["Deadeye", "Raider", "Pathfinder"],
  Shadow: ["Assassin", "Saboteur", "Trickster"],
  Witch: ["Necromancer", "Elementalist", "Occultist"],
  Templar: ["Inquisitor", "Hierophant", "Guardian"],
  Scion: ["Ascendant"],
};

export const CLASSES = Object.keys(ASCENDANCIES);
