import assert from "node:assert/strict";
import test from "node:test";
import { formatPlayed, isLeagueRunning, leagueDuration, leagueWindow, parsePlayed } from "../src/lib/format";
import { LEAGUE_SEED } from "../src/lib/leagues";

const seedFor = (game: "poe1" | "poe2") => LEAGUE_SEED.filter((league) => league.game === game);

test("a patch number identifies a league only within its own game", () => {
  const seen = new Set<string>();
  for (const league of LEAGUE_SEED) {
    const key = `${league.game}/${league.patch}`;
    assert.equal(seen.has(key), false, `duplicate ${key}`);
    seen.add(key);
  }
  // The reason the database key had to widen: both games ship a 1.0.
  const patches = LEAGUE_SEED.map((league) => league.patch);
  assert.ok(
    patches.length > new Set(patches).size || seedFor("poe2").some((league) => league.patch === "0.1"),
    "the two games' patch numbers are expected to overlap eventually",
  );
});

test("each game's catalogue runs in chronological order", () => {
  for (const game of ["poe1", "poe2"] as const) {
    let previousStart = "";
    for (const league of seedFor(game)) {
      // A league with no known dates (the Path of Exile 2 closed beta) sits
      // wherever the catalogue puts it and is skipped by the ordering check.
      if (!league.startDate) {
        assert.ok(league.datesUncertain, `${game} ${league.patch} has no start date and is not flagged`);
        continue;
      }
      assert.ok(league.startDate > previousStart, `${game} ${league.patch} starts before the league above it`);
      previousStart = league.startDate;
    }
  }
});

/**
 * Path of Exile 1 ran exactly one challenge league at a time and each handed
 * over to the next on the day it ended. Path of Exile 2 does neither: 0.4 ends
 * four weeks before 0.5 begins, and 0.5.5 runs beside 0.5 rather than after it.
 */
test("Path of Exile 1 leagues hand over to each other without a gap", () => {
  const poe1 = seedFor("poe1");
  for (let index = 0; index < poe1.length - 1; index += 1) {
    assert.equal(poe1[index].endDate, poe1[index + 1].startDate, `${poe1[index].patch} does not hand over`);
  }
});

test("Path of Exile 2 leagues may gap and overlap, but never run backwards", () => {
  for (const league of seedFor("poe2")) {
    if (!league.startDate || !league.endDate) continue;
    assert.ok(league.startDate < league.endDate, `${league.patch} ends before it starts`);
  }
  const byPatch = Object.fromEntries(seedFor("poe2").map((league) => [league.patch, league]));
  assert.ok(byPatch["0.4"].endDate! < byPatch["0.5"].startDate!, "0.4 is expected to end before 0.5 starts");
  assert.ok(byPatch["0.5.5"].startDate! > byPatch["0.5"].startDate!, "0.5.5 starts inside 0.5");
  assert.equal(byPatch["0.5.5"].endDate, byPatch["0.5"].endDate, "both end at the 1.0 launch");
});

test("only a game's newest league may carry an estimated end date", () => {
  for (const game of ["poe1", "poe2"] as const) {
    const seed = seedFor(game);
    const estimated = seed.filter((league) => league.endDateEstimated);
    assert.ok(estimated.length <= 1, `${game} has more than one tentative end date`);
    if (estimated.length === 1) assert.equal(estimated[0].patch, seed[seed.length - 1].patch);
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
  const poe2 = LEAGUE_SEED.filter((league) => league.game === "poe2").map((league) => league.patch);
  assert.deepEqual(poe2, ["beta", "0.1", "0.2", "0.3", "0.4", "0.5", "0.5.5"]);
});

/** Path of Exile 2 had no challenges before 0.5, and 0.5's count is unrecorded. */
test("no Path of Exile 2 league claims a challenge count", () => {
  for (const league of LEAGUE_SEED.filter((l) => l.game === "poe2")) {
    assert.equal(league.challengeTotal, null, `${league.patch} claims a challenge total`);
  }
});
