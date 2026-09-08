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
  /**
   * The URL segment and the catalogue key. A league's is its patch; an event's
   * is its own, because a gauntlet run inside 3.25 cannot claim that number and
   * two events can share a patch.
   */
  slug: string;
  /** null for an event with no patch of its own, shown as "###". */
  patch: string | null;
  name: string;
  /**
   * A challenge league, or an event: a gauntlet, a private league, a race.
   * Events name their parent league where they ran inside one.
   */
  kind?: "event";
  /** The league an event ran inside, by name. */
  parent?: string;
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
  { game: "poe1", slug: "1.0", patch: "1.0", name: "Domination / Nemesis", startDate: "2013-10-23", endDate: "2014-03-05", challengeTotal: 8 },
  { game: "poe1", slug: "1.1", patch: "1.1", name: "Ambush / Invasion", expansion: "Sacrifice of the Vaal", startDate: "2014-03-05", endDate: "2014-08-20", challengeTotal: 8 },
  { game: "poe1", slug: "1.2", patch: "1.2", name: "Rampage / Beyond", expansion: "Forsaken Masters", startDate: "2014-08-20", endDate: "2014-12-12", challengeTotal: 8 },
  { game: "poe1", slug: "1.3", patch: "1.3", name: "Torment / Bloodlines", startDate: "2014-12-12", endDate: "2015-07-10", challengeTotal: 8 },
  { game: "poe1", slug: "2.0", patch: "2.0", name: "Tempest / Warbands", expansion: "The Awakening", startDate: "2015-07-10", endDate: "2015-12-11", challengeTotal: 32 },
  { game: "poe1", slug: "2.1", patch: "2.1", name: "Talisman", startDate: "2015-12-11", endDate: "2016-03-04", challengeTotal: 32 },
  { game: "poe1", slug: "2.2", patch: "2.2", name: "Perandus", expansion: "Ascendancy", startDate: "2016-03-04", endDate: "2016-06-03", challengeTotal: 32 },
  { game: "poe1", slug: "2.3", patch: "2.3", name: "Prophecy", startDate: "2016-06-03", endDate: "2016-09-02", challengeTotal: 32 },
  { game: "poe1", slug: "2.4", patch: "2.4", name: "Essence", expansion: "Atlas of Worlds", startDate: "2016-09-02", endDate: "2016-12-02", challengeTotal: 36 },
  { game: "poe1", slug: "2.5", patch: "2.5", name: "Breach", startDate: "2016-12-02", endDate: "2017-03-03", challengeTotal: 36 },
  { game: "poe1", slug: "2.6", patch: "2.6", name: "Legacy", startDate: "2017-03-03", endDate: "2017-08-04", challengeTotal: 36 },
  { game: "poe1", slug: "3.0", patch: "3.0", name: "Harbinger", expansion: "The Fall of Oriath", startDate: "2017-08-04", endDate: "2017-12-08", challengeTotal: 40 },
  { game: "poe1", slug: "3.1", patch: "3.1", name: "Abyss", expansion: "War for the Atlas", startDate: "2017-12-08", endDate: "2018-03-02", challengeTotal: 40 },
  { game: "poe1", slug: "3.2", patch: "3.2", name: "Bestiary", startDate: "2018-03-02", endDate: "2018-05-28", challengeTotal: 40 },
  { game: "poe1", slug: "3.3", patch: "3.3", name: "Incursion", startDate: "2018-06-01", endDate: "2018-08-31", challengeTotal: 40 },
  { game: "poe1", slug: "3.4", patch: "3.4", name: "Delve", startDate: "2018-08-31", endDate: "2018-12-07", challengeTotal: 40 },
  { game: "poe1", slug: "3.5", patch: "3.5", name: "Betrayal", startDate: "2018-12-07", endDate: "2019-03-08", challengeTotal: 40 },
  { game: "poe1", slug: "3.6", patch: "3.6", name: "Synthesis", startDate: "2019-03-08", endDate: "2019-06-07", challengeTotal: 40 },
  { game: "poe1", slug: "3.7", patch: "3.7", name: "Legion", startDate: "2019-06-07", endDate: "2019-09-06", challengeTotal: 40 },
  { game: "poe1", slug: "3.8", patch: "3.8", name: "Blight", startDate: "2019-09-06", endDate: "2019-12-13", challengeTotal: 40 },
  { game: "poe1", slug: "3.9", patch: "3.9", name: "Metamorph", expansion: "Conquerors of the Atlas", startDate: "2019-12-13", endDate: "2020-03-13", challengeTotal: 40 },
  { game: "poe1", slug: "3.10", patch: "3.10", name: "Delirium", startDate: "2020-03-13", endDate: "2020-06-19", challengeTotal: 40 },
  { game: "poe1", slug: "3.11", patch: "3.11", name: "Harvest", startDate: "2020-06-19", endDate: "2020-09-18", challengeTotal: 40 },
  { game: "poe1", slug: "3.12", patch: "3.12", name: "Heist", startDate: "2020-09-18", endDate: "2021-01-15", challengeTotal: 40 },
  { game: "poe1", slug: "3.13", patch: "3.13", name: "Ritual", expansion: "Echoes of the Atlas", startDate: "2021-01-15", endDate: "2021-04-16", challengeTotal: 40 },
  { game: "poe1", slug: "3.14", patch: "3.14", name: "Ultimatum", startDate: "2021-04-16", endDate: "2021-07-19", challengeTotal: 40 },
  { game: "poe1", slug: "3.15", patch: "3.15", name: "Expedition", startDate: "2021-07-23", endDate: "2021-10-22", challengeTotal: 40 },
  { game: "poe1", slug: "3.16", patch: "3.16", name: "Scourge", startDate: "2021-10-22", endDate: "2022-02-01", challengeTotal: 40 },
  { game: "poe1", slug: "3.17", patch: "3.17", name: "Archnemesis", expansion: "Siege of the Atlas", startDate: "2022-02-04", endDate: "2022-05-13", challengeTotal: 40 },
  { game: "poe1", slug: "3.18", patch: "3.18", name: "Sentinel", startDate: "2022-05-13", endDate: "2022-08-16", challengeTotal: 40 },
  { game: "poe1", slug: "3.19", patch: "3.19", name: "Lake of Kalandra", startDate: "2022-08-19", endDate: "2022-12-06", challengeTotal: 40 },
  { game: "poe1", slug: "3.20", patch: "3.20", name: "The Forbidden Sanctum", startDate: "2022-12-09", endDate: "2023-04-04", challengeTotal: 40 },
  { game: "poe1", slug: "3.21", patch: "3.21", name: "Crucible", startDate: "2023-04-07", endDate: "2023-08-15", challengeTotal: 40 },
  { game: "poe1", slug: "3.22", patch: "3.22", name: "Trial of the Ancestors", startDate: "2023-08-18", endDate: "2023-12-05", challengeTotal: 40 },
  { game: "poe1", slug: "3.23", patch: "3.23", name: "Affliction", startDate: "2023-12-08", endDate: "2024-03-26", challengeTotal: 40 },
  { game: "poe1", slug: "3.24", patch: "3.24", name: "Necropolis", startDate: "2024-03-29", endDate: "2024-07-23", challengeTotal: 40 },
  { game: "poe1", slug: "3.25", patch: "3.25", name: "Settlers of Kalguur", startDate: "2024-07-26", endDate: "2025-06-09", challengeTotal: 40 },
  { game: "poe1", slug: "3.26", patch: "3.26", name: "Mercenaries", expansion: "Secrets of the Atlas", startDate: "2025-06-13", endDate: "2025-10-27", challengeTotal: 40 },
  { game: "poe1", slug: "3.27", patch: "3.27", name: "Keepers of the Flame", startDate: "2025-10-31", endDate: "2026-03-05", challengeTotal: 40 },
  { game: "poe1", slug: "3.28", patch: "3.28", name: "Mirage", startDate: "2026-03-06", endDate: "2026-07-20", challengeTotal: 40 },
  {
    game: "poe1",
    slug: "3.29",
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
    slug: "beta-1",
    patch: null,
    name: "Closed Beta: round 1",
    kind: "event",
    startDate: "2024-08-15",
    endDate: "2024-08-24",
    challengeTotal: null,
  },
  {
    game: "poe2",
    slug: "beta-2",
    patch: null,
    name: "Closed Beta: round 2",
    kind: "event",
    startDate: "2024-09-03",
    endDate: "2024-09-10",
    challengeTotal: null,
  },
  {
    game: "poe2",
    slug: "0.1",
    patch: "0.1",
    name: "Early Access",
    startDate: "2024-12-06",
    // 0.1's league was never formally closed — it rolled into 0.2 rather than
    // ending — so its window runs to 0.2's launch. Left open it read as live,
    // two years on.
    endDate: "2025-04-04",
    challengeTotal: null,
  },
  {
    game: "poe2",
    slug: "0.2",
    patch: "0.2",
    name: "Dawn of the Hunt",
    startDate: "2025-04-04",
    endDate: "2025-08-26",
    challengeTotal: null,
  },
  {
    game: "poe2",
    slug: "0.3",
    patch: "0.3",
    name: "Rise of the Abyssal",
    expansion: "The Third Edict",
    // One league tracker put this at 19 September 2025; three other sources say
    // 29 August 2025, one of them with the launch hour. The majority wins.
    startDate: "2025-08-29",
    endDate: "2025-12-08",
    challengeTotal: null,
  },
  {
    game: "poe2",
    slug: "0.4",
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
    slug: "0.5",
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
    slug: "0.5.5",
    patch: "0.5.5",
    name: "Forbidden Rites",
    // An event league beside 0.5, not a successor to it.
    kind: "event",
    parent: "Runes of Aldur",
    // An event league running beside 0.5 rather than replacing it, from its
    // launch until the 1.0 release on 11 December 2026.
    startDate: "2026-09-04",
    endDate: "2026-12-11",
    challengeTotal: null,
  },
  // --- Events, gauntlets and private leagues ---------------------------------
  //
  // Windows from the owner's own record, which is first-hand for the ones they
  // played. An event shows its parent league where it ran inside one, in the
  // slot a league uses for its expansion.
  { game: "poe1", slug: "endless-delve-2021", patch: null, name: "Endless Delve", kind: "event",
    startDate: "2021-12-03", endDate: "2021-12-13", challengeTotal: null },
  { game: "poe1", slug: "endless-heist-2021", patch: "3.16", name: "Endless Heist", kind: "event",
    startDate: "2021-12-17", endDate: "2021-12-27", challengeTotal: null },
  { game: "poe1", slug: "runic-strife-gauntlet", patch: "3.25", name: "Runic Strife Gauntlet", kind: "event",
    parent: "Settlers of Kalguur", startDate: "2024-09-26", endDate: "2024-10-06", challengeTotal: null },
  { game: "poe1", slug: "necro-settlers", patch: "3.25", name: "Necro Settlers", kind: "event",
    parent: "Settlers of Kalguur", startDate: "2024-11-07", endDate: "2025-02-20", challengeTotal: null },
  { game: "poe1", slug: "legacy-of-phrecia", patch: "3.25", name: "Legacy of Phrecia", kind: "event",
    parent: "Settlers of Kalguur", startDate: "2025-02-20", endDate: "2025-04-23", challengeTotal: null },
  { game: "poe1", slug: "real-fake-doryani", patch: "3.25", name: "Real Fake Doryani", kind: "event",
    parent: "Settlers of Kalguur",
    // The sheet records this private league's window as unverified.
    startDate: null, endDate: null, datesUncertain: true, challengeTotal: null },
  { game: "poe1", slug: "merciless-gauntlet", patch: "3.26", name: "Merciless Gauntlet", kind: "event",
    parent: "Mercenaries", startDate: "2025-07-31", endDate: "2025-08-10", challengeTotal: null },
  { game: "poe1", slug: "legacy-of-phrecia-2", patch: "3.27", name: "Legacy of Phrecia 2.0", kind: "event",
    parent: "Keepers of the Flame", startDate: "2026-01-29", endDate: "2026-02-19", challengeTotal: null },
  { game: "poe1", slug: "rapture-gauntlet", patch: "3.28", name: "Rapture Gauntlet", kind: "event",
    parent: "Mirage", startDate: "2026-04-08", endDate: "2026-04-15", challengeTotal: null },
  { game: "poe1", slug: "return-of-the-ancestors", patch: "3.28", name: "Return of the Ancestors", kind: "event",
    parent: "Mirage", startDate: "2026-06-25", endDate: "2026-07-16", challengeTotal: null },

  // A home for characters whose league the record does not name. One per game so
  // a Path of Exile 1 character is never filed under a Path of Exile 2 league.
  { game: "poe1", slug: "unspecified", patch: null, name: "Unspecified league", kind: "event",
    startDate: null, endDate: null, datesUncertain: true, challengeTotal: null },
  { game: "poe2", slug: "unspecified", patch: null, name: "Unspecified league", kind: "event",
    startDate: null, endDate: null, datesUncertain: true, challengeTotal: null },
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
