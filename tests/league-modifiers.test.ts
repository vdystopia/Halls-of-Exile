import assert from "node:assert/strict";
import test from "node:test";
import {
  formatLeagueModifiers,
  LEAGUE_MODIFIERS,
  leagueModifierLabel,
  parseLeagueModifiers,
} from "../src/lib/league-modifiers";

test("a character with nothing recorded has no modifiers", () => {
  assert.deepEqual(parseLeagueModifiers(null), []);
  assert.deepEqual(parseLeagueModifiers(undefined), []);
  assert.deepEqual(parseLeagueModifiers(""), []);
});

/** They combine: Hardcore SSF is one league, and the common one at that. */
test("modifiers round-trip through the column", () => {
  const stored = formatLeagueModifiers(["ssf", "hardcore"]);
  assert.deepEqual(parseLeagueModifiers(stored), ["hardcore", "ssf"]);
});

/**
 * Stored in one order whatever order the checkboxes came back in, so two
 * characters with the same modifiers cannot hold two different strings and the
 * tags cannot come out in a different order on two pages.
 */
test("order is canonical, not the order they were given in", () => {
  assert.equal(formatLeagueModifiers(["ssf", "hardcore"]), formatLeagueModifiers(["hardcore", "ssf"]));
  assert.deepEqual(parseLeagueModifiers("ssf,hardcore"), parseLeagueModifiers("hardcore,ssf"));
});

/** Unticking the last box clears the column rather than leaving "" behind. */
test("no modifiers stores null, never an empty string", () => {
  assert.equal(formatLeagueModifiers([]), null);
  assert.equal(formatLeagueModifiers(["nonsense"]), null);
});

test("a word this version does not know is dropped rather than drawn", () => {
  assert.deepEqual(parseLeagueModifiers("ssf,voidborn"), ["ssf"]);
  assert.deepEqual(parseLeagueModifiers(" SSF , Hardcore "), ["hardcore", "ssf"]);
});

test("a repeated modifier is stored once", () => {
  assert.equal(formatLeagueModifiers(["ssf", "ssf"]), "ssf");
  assert.deepEqual(parseLeagueModifiers("ssf,ssf"), ["ssf"]);
});

test("every modifier has a label to draw on a tag", () => {
  for (const modifier of LEAGUE_MODIFIERS) {
    assert.ok(leagueModifierLabel(modifier.id).length > 0, `no label for ${modifier.id}`);
  }
});
