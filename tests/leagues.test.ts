import assert from "node:assert/strict";
import test from "node:test";
import {
  challengeFraction,
  compareNumbers,
  comparePatches,
  formatPlayed,
  formatPlayedExact,
  formatPlayedTotal,
  isLeagueRunning,
  leagueDuration,
  leagueLabel,
  leagueTitle,
  leagueWindow,
  parsePlayed,
} from "../src/lib/format";
import { LEAGUE_SEED, orderLeagueSeed } from "../src/lib/leagues";

const seedFor = (game: "poe1" | "poe2") => LEAGUE_SEED.filter((league) => league.game === game);

test("a slug identifies a league or event within its own game", () => {
  const seen = new Set<string>();
  for (const league of LEAGUE_SEED) {
    const key = `${league.game}/${league.slug}`;
    assert.equal(seen.has(key), false, `duplicate ${key}`);
    seen.add(key);
  }
  // Why the key is the slug and not the patch: events share their parent's
  // patch number, and three of them sit inside 3.25 alone.
  const inPatch = LEAGUE_SEED.filter((league) => league.patch === "3.25");
  assert.ok(inPatch.length > 1, "3.25 is expected to hold a league and its events");
});

test("each game's challenge leagues are written in chronological order", () => {
  for (const game of ["poe1", "poe2"] as const) {
    let previousStart = "";
    // Events are written in their own block and ordered by date at sync time.
    for (const league of seedFor(game).filter((entry) => entry.kind !== "event")) {
      // A league with no known dates (the Path of Exile 2 closed beta) sits
      // wherever the catalogue puts it and is skipped by the ordering check.
      if (!league.startDate) {
        assert.ok(league.datesUncertain, `${game} ${league.slug} has no start date and is not flagged`);
        continue;
      }
      assert.ok(league.startDate > previousStart, `${game} ${league.patch} starts before the league above it`);
      previousStart = league.startDate;
    }
  }
});

/**
 * This used to assert that each league ended on the day the next began. The
 * owner's own record shows that is not how the game works: a league closes
 * three or four days before the next launches, every time. The old dates were
 * an artifact of how this catalogue was first built, not a fact — so the
 * invariant is now the one that actually holds.
 */
test("challenge leagues run in order and never overlap", () => {
  for (const game of ["poe1", "poe2"] as const) {
    const leagues = seedFor(game).filter((league) => league.kind !== "event" && league.startDate);
    for (let index = 0; index < leagues.length - 1; index += 1) {
      const league = leagues[index];
      const next = leagues[index + 1];
      if (!league.endDate) continue;
      assert.ok(league.endDate <= next.startDate!, `${game} ${league.slug} overlaps ${next.slug}`);
    }
  }
});

test("a league's own window never runs backwards", () => {
  for (const league of LEAGUE_SEED) {
    if (!league.startDate || !league.endDate) continue;
    assert.ok(league.startDate < league.endDate, `${league.game} ${league.slug} ends before it starts`);
  }
});

test("Path of Exile 2 leagues may gap and overlap, but never run backwards", () => {
  for (const league of seedFor("poe2")) {
    if (!league.startDate || !league.endDate) continue;
    assert.ok(league.startDate < league.endDate, `${league.patch} ends before it starts`);
  }
  const byPatch = Object.fromEntries(seedFor("poe2").map((league) => [league.slug, league]));
  assert.ok(byPatch["0.4"].endDate! < byPatch["0.5"].startDate!, "0.4 is expected to end before 0.5 starts");
  assert.equal(byPatch["0.5.5"].kind, "event", "0.5.5 runs beside 0.5 rather than after it");
  assert.ok(byPatch["0.5.5"].startDate! > byPatch["0.5"].startDate!, "0.5.5 starts inside 0.5");
  assert.equal(byPatch["0.5.5"].endDate, byPatch["0.5"].endDate, "both end at the 1.0 launch");
});

test("only a game's newest league may carry an estimated end date", () => {
  for (const game of ["poe1", "poe2"] as const) {
    const leagues = seedFor(game).filter((entry) => entry.kind !== "event");
    const estimated = leagues.filter((league) => league.endDateEstimated);
    assert.ok(estimated.length <= 1, `${game} has more than one tentative end date`);
    if (estimated.length === 1) assert.equal(estimated[0].slug, leagues[leagues.length - 1].slug);
  }
});

/** Dates that came from a source that others contradicted are marked, not quietly kept. */
test("a league with unconfirmed dates says so", () => {
  for (const league of LEAGUE_SEED) {
    if (league.startDate && league.endDate) continue;
    assert.ok(
      league.datesUncertain || league.endDateEstimated || league.endDate === null,
      `${league.game} ${league.patch} is missing dates without saying why`,
    );
  }
});

test("an estimated end date is rendered as a projection", () => {
  assert.equal(leagueWindow("2026-07-24", "2026-11-24", true), "24 Jul 2026 — ~24 Nov 2026");
  assert.equal(leagueWindow("2026-07-24", "2026-11-24", false), "24 Jul 2026 — 24 Nov 2026");
  assert.equal(leagueWindow("2026-07-24", null), "24 Jul 2026 — ongoing");
  assert.equal(leagueWindow(null, null), "dates unknown");
  assert.equal(leagueWindow("2026-07-04", "2026-11-24", true, "month-first"), "Jul 04 2026 — ~Nov 24 2026");
  assert.equal(leagueWindow("2026-07-04", null, false, "month-first"), "Jul 04 2026 — ongoing");
});

test("a league is running until its end date passes", () => {
  const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const past = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const older = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(isLeagueRunning(older, future), true);
  assert.equal(isLeagueRunning(older, past), false);
  assert.equal(isLeagueRunning(older, null), true);
  assert.equal(isLeagueRunning(future, null), false, "a league that has not launched is not running");
  assert.match(leagueDuration(older, future)!, /days so far$/);
  assert.equal(leagueDuration("2021-01-15", "2021-04-16"), "91 days");
});

test("parses the /played times people actually type", () => {
  assert.equal(parsePlayed("5d 3h 22m"), 5 * 1440 + 3 * 60 + 22);
  assert.equal(parsePlayed("5 days, 3 hours, 22 minutes"), 5 * 1440 + 3 * 60 + 22);
  assert.equal(parsePlayed("12h30m"), 750);
  assert.equal(parsePlayed("90m"), 90);
  assert.equal(parsePlayed("36"), 2160, "a bare number is hours");
  assert.equal(parsePlayed(""), null);
  assert.equal(parsePlayed("whenever"), null);
});

test("renders played time the way the game talks about it", () => {
  assert.equal(formatPlayed(5 * 1440 + 3 * 60), "5d 3h");
  assert.equal(formatPlayed(5 * 1440), "5d");
  assert.equal(formatPlayed(750), "12h 30m");
  assert.equal(formatPlayed(45), "45m");
  assert.equal(formatPlayed(0), null);
  assert.equal(formatPlayed(null), null);
});

test("the Path of Exile 2 catalogue covers early access and the closed beta", () => {
  const poe2 = LEAGUE_SEED.filter((league) => league.game === "poe2").map((league) => league.slug);
  assert.deepEqual(poe2, ["beta-1", "beta-2", "0.1", "0.2", "0.3", "0.4", "0.5", "0.5.5"]);
});

/** Path of Exile 2 had no challenges before 0.5, and 0.5's count is unrecorded. */
test("no Path of Exile 2 league claims a challenge count", () => {
  for (const league of LEAGUE_SEED.filter((l) => l.game === "poe2")) {
    assert.equal(league.challengeTotal, null, `${league.patch} claims a challenge total`);
  }
});

/**
 * A Path of Exile 2 league and the content update it shipped with have separate
 * names, the same split Path of Exile 1 has between a league and its expansion.
 */
test("a Path of Exile 2 league names its update separately", () => {
  const byPatch = Object.fromEntries(
    LEAGUE_SEED.filter((league) => league.game === "poe2").map((league) => [league.slug, league]),
  );
  assert.equal(byPatch["0.4"].name, "Fate of the Vaal");
  assert.equal(byPatch["0.4"].expansion, "The Last of the Druids");
  assert.equal(byPatch["0.3"].name, "Rise of the Abyssal");
  assert.equal(byPatch["0.3"].expansion, "The Third Edict");
  assert.equal(byPatch["0.5"].name, "Runes of Aldur");
  assert.equal(byPatch["0.5"].expansion, "Return of the Ancients");
});

/** The only Path of Exile 2 row still without dates is the closed beta. */
test("only the closed beta has unconfirmed dates", () => {
  const flagged = LEAGUE_SEED.filter((league) => league.datesUncertain).map((league) => league.slug);
  assert.deepEqual(flagged, ["real-fake-doryani", "unspecified"]);
});

/**
 * The one format for a league or an event, everywhere it is referenced:
 * patch, name, then the expansion for a league or the parent league for an
 * event. An event never shows an expansion.
 */
test("a league reads as patch, name, then its expansion in brackets", () => {
  assert.equal(
    leagueTitle({ patch: "3.26", name: "Mercenaries", expansion: "Secrets of the Atlas" }),
    "3.26 Mercenaries (Secrets of the Atlas)",
  );
  assert.equal(leagueTitle({ patch: "3.25", name: "Settlers of Kalguur", expansion: null }), "3.25 Settlers of Kalguur");
});

test("an event reads as patch, name, then its parent league in brackets", () => {
  assert.equal(
    leagueTitle({ patch: "3.25", name: "Runic Strife Gauntlet", kind: "event", parent: "Settlers of Kalguur" }),
    "3.25 Runic Strife Gauntlet (Settlers of Kalguur)",
  );
  // An expansion is not shown for an event even when one is set.
  assert.equal(
    leagueTitle({ patch: "3.28", name: "Rapture Gauntlet", kind: "event", parent: "Mirage", expansion: "Ignored" }),
    "3.28 Rapture Gauntlet (Mirage)",
  );
});

/**
 * Only "Unspecified league" has no patch now — every event in the seed ran
 * inside a numbered one and says so. Endless Delve used to be the example here
 * and was simply missing its 3.16, the same patch Endless Heist ran under a
 * fortnight later.
 */
test("a league with no patch of its own reads as ###", () => {
  assert.equal(leagueTitle({ patch: null, name: "Unspecified league" }), "### Unspecified league");
});

test("the only seeded league without a patch is the unspecified one", () => {
  const missing = LEAGUE_SEED.filter((league) => !league.patch).map((league) => league.name);
  assert.deepEqual(missing, ["Unspecified league"]);
});

test("both December 2021 events ran inside 3.16", () => {
  for (const slug of ["endless-delve-2021", "endless-heist-2021"]) {
    const event = LEAGUE_SEED.find((league) => league.slug === slug);
    assert.ok(event, `${slug} is missing from the seed`);
    assert.equal(event.patch, "3.16", `${slug} should be 3.16`);
  }
});

/** The closed beta predates 0.1, so it is numbered below it rather than left blank. */
test("the closed beta rounds are 0.0", () => {
  for (const slug of ["beta-1", "beta-2"]) {
    const round = LEAGUE_SEED.find((league) => league.slug === slug);
    assert.ok(round, `${slug} is missing from the seed`);
    assert.equal(round.patch, "0.0");
  }
});

test("every seeded event names a parent, or has none to name", () => {
  for (const league of LEAGUE_SEED.filter((entry) => entry.kind === "event")) {
    if (!league.parent) continue;
    const parent = LEAGUE_SEED.find((entry) => entry.game === league.game && entry.name === league.parent);
    assert.ok(parent, `${league.slug} names a parent that is not in the catalogue: ${league.parent}`);
  }
});

/**
 * Every character the record leaves without a league is a Path of Exile 1 one,
 * and no more are coming: the record is closed and a new character arrives with
 * its league. A second such row would only make two identically-titled leagues.
 */
test("only Path of Exile 1 has an unspecified league", () => {
  const unspecified = LEAGUE_SEED.filter((league) => league.slug === "unspecified");
  assert.equal(unspecified.length, 1);
  assert.equal(unspecified[0].game, "poe1");
});

/**
 * The league index sorts its patch column with this, and string order is wrong
 * for version numbers in exactly the range this catalogue covers: Path of Exile
 * ran 3.9, then 3.10, on to 3.16, and lexically every one of those sorts above
 * 3.9.
 */
test("patches sort as version numbers, not as strings", () => {
  const sorted = ["3.16", "0.2", "3.9", "0.0", "3.25", "0.5.5", "0.5"].sort(comparePatches);
  assert.deepEqual(sorted, ["0.0", "0.2", "0.5", "0.5.5", "3.9", "3.16", "3.25"]);
});

test("a league with no patch sorts last whichever way the column points", () => {
  const withNull = ["3.25", null, "0.1"];
  assert.deepEqual([...withNull].sort(comparePatches), ["0.1", "3.25", null]);
  // Passing the direction in is how the column flips. Negating the comparator
  // instead — the obvious way — floats every unknown to the top, which is the
  // bug this pins down.
  assert.deepEqual([...withNull].sort((a, b) => comparePatches(a, b, -1)), ["3.25", "0.1", null]);
});

test("two spellings of the same patch compare equal", () => {
  assert.equal(comparePatches("0.5", "0.5.0"), 0);
  assert.equal(comparePatches(null, null), 0);
});

/** The index splits the patch into its own column, so the name stands alone. */
test("a league label leaves the patch out and brackets the second name", () => {
  assert.equal(
    leagueLabel({ name: "Legacy of Phrecia", kind: "event", parent: "Settlers of Kalguur" }),
    "Legacy of Phrecia (Settlers of Kalguur)",
  );
  assert.equal(leagueLabel({ name: "Endless Delve", kind: "event" }), "Endless Delve");
  assert.equal(
    leagueLabel({ name: "Mercenaries of Trarthus", expansion: "Secrets of the Atlas" }),
    "Mercenaries of Trarthus (Secrets of the Atlas)",
  );
});

/**
 * Challenge counts are not comparable between leagues: the total has been 8,
 * 12, 32 and 40 over the years, so the raw number finished says more about
 * which league it was than about how far anyone got.
 */
test("challenges compare as a fraction, so 7 of 8 beats 20 of 40", () => {
  const short = challengeFraction(7, 8);
  const long = challengeFraction(20, 40);
  assert.ok(short !== null && long !== null);
  assert.ok(short > long, "7/8 should rank above 20/40");
  assert.equal(compareNumbers(short, long, 1) > 0, true);
});

test("a league with no challenges, or none recorded, has no fraction", () => {
  assert.equal(challengeFraction(null, 40), null, "nothing recorded");
  assert.equal(challengeFraction(12, null), null, "a league with no challenges");
  assert.equal(challengeFraction(null, null), null);
  // Zero completed is a real result and must not read as unknown: someone who
  // finished none of forty still ranks above a league with no count at all.
  assert.equal(challengeFraction(0, 40), 0);
});

test("a finished league is a full bar however many challenges it had", () => {
  assert.equal(challengeFraction(40, 40), 1);
  assert.equal(challengeFraction(8, 8), 1);
  // A miscount cannot push the bar past the end.
  assert.equal(challengeFraction(45, 40), 1);
});

test("numbers sort with the unknown last, either way round", () => {
  const levels = [96, null, 84];
  assert.deepEqual([...levels].sort((a, b) => compareNumbers(a, b, 1)), [84, 96, null]);
  assert.deepEqual([...levels].sort((a, b) => compareNumbers(a, b, -1)), [96, 84, null]);
  // Zero is a value, not an absence, and stays in the ordering.
  assert.deepEqual([0, null, 3].sort((a, b) => compareNumbers(a, b, 1)), [0, 3, null]);
});

/** The archive header's /played: days to two decimals, then the whole hours. */
test("a player's total /played reads as days to two places and whole hours", () => {
  // 245 days 21 hours, the figure the header showed as "245d 21h".
  assert.deepEqual(formatPlayedTotal(245 * 1440 + 21 * 60), { days: "245.88d", hours: "5901h" });
  assert.deepEqual(formatPlayedTotal(90), { days: "0.06d", hours: "2h" });
  assert.equal(formatPlayedTotal(0), null);
  assert.equal(formatPlayedTotal(null), null);
});

/** The edit form is pre-filled with this and always saved back, so it must survive the round trip. */
test("an exact /played reads back to the same minutes", () => {
  for (const minutes of [5 * 1440 + 3 * 60 + 22, 2 * 1440 + 30, 1440, 750, 45, 60, 7402]) {
    assert.equal(parsePlayed(formatPlayedExact(minutes)!), minutes, String(minutes));
  }
  assert.equal(formatPlayedExact(2 * 1440 + 30), "2d 30m");
  assert.equal(formatPlayedExact(null), null);
});

/**
 * `sort_order` is what "latest league" and "most recent characters" read, so an
 * undated row must not float to the top: "Unspecified league" is the oldest,
 * an undated event sits beside the league it ran inside, and the two games
 * interleave by date rather than one game outranking the other.
 */
test("the catalogue orders by when each league ran, across both games", () => {
  const ordered = orderLeagueSeed(LEAGUE_SEED);
  const at = (game: string, slug: string) => ordered.findIndex((row) => row.game === game && row.slug === slug);
  assert.equal(at("poe1", "unspecified"), 0);
  assert.equal(at("poe1", "real-fake-doryani"), at("poe1", "3.25") + 1);
  const newest = ordered.at(-1)!;
  const latestStart = LEAGUE_SEED.map((row) => row.startDate ?? "").sort().at(-1);
  assert.equal(newest.startDate, latestStart);
  const dated = ordered.filter((row) => row.startDate).map((row) => row.startDate!);
  assert.deepEqual(dated, [...dated].sort());
});

/**
 * Each filter offers only what the others leave, so no combination of offered
 * values can empty the index. Offering every value let Path of Exile 2 with
 * 3.25 leave nothing. A value already ticked stays offered, to be unticked.
 */
test("the league index's filters can never empty the table", async () => {
  const { facetValues, passes } = await import("../src/lib/league-filter");
  const rows = LEAGUE_SEED;
  const none = { games: new Set<string>(), patches: new Set<string>(), names: new Set<string>() };
  const poe2 = { ...none, games: new Set(["poe2"]) };
  const patches = facetValues(rows, poe2, "patches");
  assert.ok(!patches.includes("3.25"), "a Path of Exile 1 patch is not offered with Path of Exile 2 ticked");
  assert.ok(patches.includes("0.3"));
  // Every patch offered, with the game ticked, leaves at least one row.
  for (const patch of patches) {
    const filters = { ...poe2, patches: new Set([patch]) };
    assert.ok(rows.some((row) => passes(row, filters)), `${patch} emptied the table`);
  }
  // Ticked first, the patch narrows the games instead, and stays offered itself.
  const ticked = { ...none, patches: new Set(["3.25"]) };
  assert.deepEqual(facetValues(rows, ticked, "games"), ["poe1"]);
  assert.ok(facetValues(rows, { ...ticked, games: new Set(["poe1"]) }, "patches").includes("3.25"));
});
