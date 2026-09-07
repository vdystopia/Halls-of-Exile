import type { GameId } from "./games/types";

/**
 * Catalogue of Path of Exile and Path of Exile 2 challenge leagues.
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
  /** Which game the league belongs to. Patch numbers repeat across the two. */
  game: GameId;
  patch: string;
  name: string;
  expansion?: string;
  startDate: string | null;
  endDate: string | null;
  /** null where the league has no challenges, or where the count is unknown. */
  challengeTotal: number | null;
  /** The end date is a projection, not an announced date: the league is still running. */
  endDateEstimated?: boolean;
  /**
   * The dates come from secondary sources that disagree, or are not known at
   * all. Shown as approximate rather than presented as fact.
   */
  datesUncertain?: boolean;
};

export const LEAGUE_SEED: LeagueSeed[] = [
  { game: "poe1", patch: "1.0", name: "Domination / Nemesis", startDate: "2013-10-23", endDate: "2014-03-05", challengeTotal: 8 },
  { game: "poe1", patch: "1.1", name: "Ambush / Invasion", expansion: "Sacrifice of the Vaal", startDate: "2014-03-05", endDate: "2014-08-20", challengeTotal: 8 },
  { game: "poe1", patch: "1.2", name: "Rampage / Beyond", expansion: "Forsaken Masters", startDate: "2014-08-20", endDate: "2014-12-12", challengeTotal: 8 },
  { game: "poe1", patch: "1.3", name: "Torment / Bloodlines", startDate: "2014-12-12", endDate: "2015-07-10", challengeTotal: 8 },
  { game: "poe1", patch: "2.0", name: "Tempest / Warbands", expansion: "The Awakening", startDate: "2015-07-10", endDate: "2015-12-11", challengeTotal: 32 },
  { game: "poe1", patch: "2.1", name: "Talisman", startDate: "2015-12-11", endDate: "2016-03-04", challengeTotal: 32 },
  { game: "poe1", patch: "2.2", name: "Perandus", expansion: "Ascendancy", startDate: "2016-03-04", endDate: "2016-06-03", challengeTotal: 32 },
  { game: "poe1", patch: "2.3", name: "Prophecy", startDate: "2016-06-03", endDate: "2016-09-02", challengeTotal: 32 },
  { game: "poe1", patch: "2.4", name: "Essence", expansion: "Atlas of Worlds", startDate: "2016-09-02", endDate: "2016-12-02", challengeTotal: 36 },
  { game: "poe1", patch: "2.5", name: "Breach", startDate: "2016-12-02", endDate: "2017-03-03", challengeTotal: 36 },
  { game: "poe1", patch: "2.6", name: "Legacy", startDate: "2017-03-03", endDate: "2017-08-04", challengeTotal: 36 },
  { game: "poe1", patch: "3.0", name: "Harbinger", expansion: "The Fall of Oriath", startDate: "2017-08-04", endDate: "2017-12-08", challengeTotal: 40 },
  { game: "poe1", patch: "3.1", name: "Abyss", expansion: "War for the Atlas", startDate: "2017-12-08", endDate: "2018-03-02", challengeTotal: 40 },
  { game: "poe1", patch: "3.2", name: "Bestiary", startDate: "2018-03-02", endDate: "2018-06-01", challengeTotal: 40 },
  { game: "poe1", patch: "3.3", name: "Incursion", startDate: "2018-06-01", endDate: "2018-08-31", challengeTotal: 40 },
  { game: "poe1", patch: "3.4", name: "Delve", startDate: "2018-08-31", endDate: "2018-12-07", challengeTotal: 40 },
  { game: "poe1", patch: "3.5", name: "Betrayal", startDate: "2018-12-07", endDate: "2019-03-08", challengeTotal: 40 },
  { game: "poe1", patch: "3.6", name: "Synthesis", startDate: "2019-03-08", endDate: "2019-06-07", challengeTotal: 40 },
  { game: "poe1", patch: "3.7", name: "Legion", startDate: "2019-06-07", endDate: "2019-09-06", challengeTotal: 40 },
  { game: "poe1", patch: "3.8", name: "Blight", startDate: "2019-09-06", endDate: "2019-12-13", challengeTotal: 40 },
  { game: "poe1", patch: "3.9", name: "Metamorph", expansion: "Conquerors of the Atlas", startDate: "2019-12-13", endDate: "2020-03-13", challengeTotal: 40 },
  { game: "poe1", patch: "3.10", name: "Delirium", startDate: "2020-03-13", endDate: "2020-06-19", challengeTotal: 40 },
  { game: "poe1", patch: "3.11", name: "Harvest", startDate: "2020-06-19", endDate: "2020-09-18", challengeTotal: 40 },
  { game: "poe1", patch: "3.12", name: "Heist", startDate: "2020-09-18", endDate: "2021-01-15", challengeTotal: 40 },
  { game: "poe1", patch: "3.13", name: "Ritual", expansion: "Echoes of the Atlas", startDate: "2021-01-15", endDate: "2021-04-16", challengeTotal: 40 },
  { game: "poe1", patch: "3.14", name: "Ultimatum", startDate: "2021-04-16", endDate: "2021-07-23", challengeTotal: 40 },
  { game: "poe1", patch: "3.15", name: "Expedition", startDate: "2021-07-23", endDate: "2021-10-22", challengeTotal: 40 },
  { game: "poe1", patch: "3.16", name: "Scourge", startDate: "2021-10-22", endDate: "2022-02-04", challengeTotal: 40 },
  { game: "poe1", patch: "3.17", name: "Archnemesis", expansion: "Siege of the Atlas", startDate: "2022-02-04", endDate: "2022-05-13", challengeTotal: 40 },
  { game: "poe1", patch: "3.18", name: "Sentinel", startDate: "2022-05-13", endDate: "2022-08-19", challengeTotal: 40 },
  { game: "poe1", patch: "3.19", name: "Lake of Kalandra", startDate: "2022-08-19", endDate: "2022-12-09", challengeTotal: 40 },
  { game: "poe1", patch: "3.20", name: "The Forbidden Sanctum", startDate: "2022-12-09", endDate: "2023-04-07", challengeTotal: 40 },
  { game: "poe1", patch: "3.21", name: "Crucible", startDate: "2023-04-07", endDate: "2023-08-18", challengeTotal: 40 },
  { game: "poe1", patch: "3.22", name: "Trial of the Ancestors", startDate: "2023-08-18", endDate: "2023-12-08", challengeTotal: 40 },
  { game: "poe1", patch: "3.23", name: "Affliction", startDate: "2023-12-08", endDate: "2024-03-29", challengeTotal: 40 },
  { game: "poe1", patch: "3.24", name: "Necropolis", startDate: "2024-03-29", endDate: "2024-07-26", challengeTotal: 40 },
  { game: "poe1", patch: "3.25", name: "Settlers of Kalguur", startDate: "2024-07-26", endDate: "2025-06-13", challengeTotal: 40 },
  { game: "poe1", patch: "3.26", name: "Mercenaries of Trarthus", expansion: "Secrets of the Atlas", startDate: "2025-06-13", endDate: "2025-10-31", challengeTotal: 40 },
  { game: "poe1", patch: "3.27", name: "Keepers of the Flame", startDate: "2025-10-31", endDate: "2026-03-05", challengeTotal: 40 },
  { game: "poe1", patch: "3.28", name: "Mirage", startDate: "2026-03-05", endDate: "2026-07-24", challengeTotal: 40 },
  {
    game: "poe1",
    patch: "3.29",
    name: "Curse of the Allflame",
    startDate: "2026-07-24",
    // Grinding Gear Games has not announced an end date. Four months is the
    // recent cadence, so this is a placeholder and is shown as tentative.
    endDate: "2026-11-24",
    endDateEstimated: true,
    challengeTotal: 40,
  },
  // --- Path of Exile 2 -------------------------------------------------------
  //
  // Early Access, which numbers its patches from 0.1 and did not have challenge
  // leagues until 0.5. Dates come from secondary sources rather than a machine-
  // readable one: Grinding Gear Games publish no catalogue, and this sandbox
  // cannot reach pathofexile.com. Anything a source contradicted, or that no
  // source gave, is flagged rather than guessed at quietly.
  //
  // Two facts here break assumptions Path of Exile 1 made: 0.4 ends four days
  // before 0.5 begins, so leagues do not have to be contiguous, and 0.5.5 runs
  // *alongside* 0.5 rather than after it, so they do not have to be exclusive.
  {
    game: "poe2",
    patch: "beta",
    name: "Closed Beta",
    // No published start or end. The beta was first announced for 7 June 2024
    // and then delayed; nothing found says when it actually ran, so rather than
    // invent a window this carries none and says so.
    startDate: null,
    endDate: null,
    datesUncertain: true,
    challengeTotal: null,
  },
  {
    game: "poe2",
    patch: "0.1",
    name: "Early Access",
    startDate: "2024-12-06",
    endDate: "2025-04-04",
    challengeTotal: null,
  },
  {
    game: "poe2",
    patch: "0.2",
    name: "Dawn of the Hunt",
    startDate: "2025-04-04",
    endDate: "2025-08-29",
    challengeTotal: null,
  },
  {
    game: "poe2",
    patch: "0.3",
    name: "Rise of the Abyssal",
    expansion: "The Third Edict",
    // One league tracker put this at 19 September 2025; three other sources say
    // 29 August 2025, one of them with the launch hour. The majority wins.
    startDate: "2025-08-29",
    endDate: "2025-12-12",
    challengeTotal: null,
  },
  {
    game: "poe2",
    patch: "0.4",
    // The league and the content update carry different names, the way an
    // expansion does in Path of Exile 1: Fate of the Vaal was the league, The
    // Last of the Druids the update that shipped with it.
    name: "Fate of the Vaal",
    expansion: "The Last of the Druids",
    // Owner-confirmed against launch-day and league-ending patch notes, which
    // beats the secondary source that had this ending on 1 May and left an
    // implausible four-week gap. Four days to 0.5 is the usual changeover.
    startDate: "2025-12-12",
    endDate: "2026-05-25",
    challengeTotal: null,
  },
  {
    game: "poe2",
    patch: "0.5",
    name: "Runes of Aldur",
    expansion: "Return of the Ancients",
    // The first Path of Exile 2 league to carry challenges. How many is not
    // recorded in anything found, so the count is left unknown rather than
    // borrowed from Path of Exile 1's forty.
    startDate: "2026-05-29",
    endDate: "2026-12-11",
    challengeTotal: null,
  },
  {
    game: "poe2",
    patch: "0.5.5",
    name: "Forbidden Rites",
    // An event league running beside 0.5 rather than replacing it, from its
    // launch until the 1.0 release on 11 December 2026.
    startDate: "2026-09-04",
    endDate: "2026-12-11",
    challengeTotal: null,
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
