import assert from "node:assert/strict";
import test from "node:test";
import { formatPlayed, isLeagueRunning, leagueDuration, leagueTitle, leagueWindow, parsePlayed } from "../src/lib/format";
import { LEAGUE_SEED } from "../src/lib/leagues";

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
test("a league reads as patch, name, expansion", () => {
  assert.equal(
    leagueTitle({ patch: "3.26", name: "Mercenaries", expansion: "Secrets of the Atlas" }),
    "3.26 Mercenaries Secrets of the Atlas",
  );
  assert.equal(leagueTitle({ patch: "3.25", name: "Settlers of Kalguur", expansion: null }), "3.25 Settlers of Kalguur");
});

test("an event reads as patch, name, parent league", () => {
  assert.equal(
    leagueTitle({ patch: "3.25", name: "Runic Strife Gauntlet", kind: "event", parent: "Settlers of Kalguur" }),
    "3.25 Runic Strife Gauntlet Settlers of Kalguur",
  );
  // An expansion is not shown for an event even when one is set.
  assert.equal(
    leagueTitle({ patch: "3.28", name: "Rapture Gauntlet", kind: "event", parent: "Mirage", expansion: "Ignored" }),
    "3.28 Rapture Gauntlet Mirage",
  );
});

test("an event with no patch of its own reads as ###", () => {
  assert.equal(leagueTitle({ patch: null, name: "Endless Delve", kind: "event" }), "### Endless Delve");
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
