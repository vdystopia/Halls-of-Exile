import assert from "node:assert/strict";
import test from "node:test";
import { formatPlayed, isLeagueRunning, leagueDuration, leagueWindow, parsePlayed } from "../src/lib/format";
import { LEAGUE_SEED } from "../src/lib/leagues";

test("league catalogue has unique patches in chronological order", () => {
  const patches = new Set<string>();
  let previousStart = "";
  for (const league of LEAGUE_SEED) {
    assert.equal(patches.has(league.patch), false, `duplicate patch ${league.patch}`);
    patches.add(league.patch);
    assert.ok(league.startDate, `${league.patch} has no start date`);
    assert.ok(league.startDate! > previousStart, `${league.patch} starts before the league above it`);
    previousStart = league.startDate!;
  }
});

test("each league ends where the next one begins", () => {
  for (let index = 0; index < LEAGUE_SEED.length - 1; index += 1) {
    const league = LEAGUE_SEED[index];
    const next = LEAGUE_SEED[index + 1];
    assert.equal(league.endDate, next.startDate, `${league.patch} does not hand over to ${next.patch}`);
  }
});

test("only the final league may carry an estimated end date", () => {
  const estimated = LEAGUE_SEED.filter((league) => league.endDateEstimated);
  assert.ok(estimated.length <= 1, "more than one league claims a tentative end date");
  if (estimated.length === 1) {
    assert.equal(estimated[0].patch, LEAGUE_SEED[LEAGUE_SEED.length - 1].patch);
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
